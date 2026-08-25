from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from .models import Pedido
from .serializers import PedidoSerializer
import re
from pypdf import PdfReader


def _extract_field(text, label, next_labels):
    stops = '|'.join(re.escape(item) for item in next_labels)
    match = re.search(
        rf'{re.escape(label)}\s*:\s*(.*?)(?=\s+(?:{stops})(?:\s*:|\s|$)|$)',
        text,
        flags=re.IGNORECASE,
    )
    return match.group(1).strip() if match else ''


def _clean_text(value, max_length):
    value = re.sub(r'\s+', ' ', str(value or '')).strip(' -:;|')
    return value[:max_length]


def _extract_observacao(text):
    match = re.search(
        r'\b(?:Obs|Observa(?:c|ç)[aã]o)\s*:\s*(.*?)(?=\s+Etiqueta\s+Volumes\b|\s+Total\s+de\s+Etiqueta\b|$)',
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return ''
    return _clean_text(match.group(1), 150)


def _extract_breton_items(text):
    item_pattern = re.compile(
        r'(?P<etiqueta>\d{15,16})\s+'
        r'(?P<volumes>\d{1,3}/\d{1,3})\s+'
        r'(?P<quantidade>\d+(?:[.,]\d{1,2})?)\s+'
        r'(?P<descricao>.+?)\s+'
        r'(?P<dimensao>\d+(?:[.,]\d+)?X\d+(?:[.,]\d+)?X\d+(?:[.,]\d+)?)'
        r'(?=\s+_{2,}|\s+Total de Etiqueta|$)',
        flags=re.IGNORECASE,
    )
    itens = []
    for match in item_pattern.finditer(text):
        etiqueta = match.group('etiqueta')
        itens.append({
            'etiqueta': etiqueta,
            'codigo': etiqueta,
            'descricao': match.group('descricao').strip(),
            'quantidade': float(match.group('quantidade').replace(',', '.')),
            'unidade': 'UN',
        })
    return itens


def _extract_numero_pedido(text, lines):
    direct_match = re.search(
        r'\bPEDIDO\s*:\s*([0-9]{4,6})\b',
        text,
        flags=re.IGNORECASE,
    )
    if direct_match:
        return direct_match.group(1)

    for idx, linha in enumerate(lines):
        linha_up = linha.upper()
        if ("PEDIDO" in linha_up or "NOTA" in linha_up or "Nº" in linha_up) and "WEB" not in linha_up and "TIPO" not in linha_up:
            match_num = re.search(
                r'(?:PEDIDO|NOTA|Nº)\s*:?\s*([0-9]{4,6})\b',
                linha,
                flags=re.IGNORECASE,
            )
            if match_num:
                return match_num.group(1)

            for linha_seguinte in lines[idx + 1:idx + 4]:
                if 'WEB' in linha_seguinte.upper():
                    continue
                match_prox = re.fullmatch(r'([0-9]{4,6})', linha_seguinte)
                if match_prox:
                    return match_prox.group(1)
    return ''


class PedidoViewSet(viewsets.ModelViewSet):
    queryset = Pedido.objects.all().select_related('veiculo', 'motorista').prefetch_related('itens', 'paradarota_set').order_by('-criado_em')
    serializer_class = PedidoSerializer

    def _garantir_no_backlog(self, pedido):
        """Insere o pedido automaticamente no Backlog da Roteirização de forma segura."""
        try:
            from roteirizacao.models import ParadaRota, Rota
            hoje = timezone.now().date()
            
            # Pega ou cria a rota/fila padrão do dia (sem veículo associado = Backlog)
            rota_backlog, _ = Rota.objects.get_or_create(
                data_rota=hoje,
                veiculo__isnull=True,
                defaults={'status': 'PLANEJADA', 'codigo': f'BACKLOG-{hoje.strftime("%d%m%Y")}'}
            )
            
            # Adiciona o pedido como parada pendente se já não estiver em nenhuma rota ativa
            if not ParadaRota.objects.filter(pedido=pedido).exists():
                # Calcula a próxima sequência contando as paradas existentes na rota
                proxima_sequencia = ParadaRota.objects.filter(rota=rota_backlog).count() + 1

                ParadaRota.objects.create(
                    rota=rota_backlog,
                    pedido=pedido,
                    sequencia=proxima_sequencia,
                    status='PENDENTE'
                )
        except Exception as e:
            # Apenas registra no log para não impedir a criação do pedido caso o app de roteirização falhe
            print(f"[Aviso Roteirização] Não foi possível mover o pedido para o backlog: {e}")



    def perform_create(self, serializer):
        pedido = serializer.save()
        self._garantir_no_backlog(pedido)

    def perform_update(self, serializer):
        pedido = serializer.save()
        self._garantir_no_backlog(pedido)

    @action(detail=False, methods=['POST'], url_path='importa-nota')
    def importa_nota(self, request):
        arquivo_pdf = (
            request.FILES.get('arquivo') or 
            request.FILES.get('file') or 
            request.FILES.get('pdf') or 
            request.FILES.get('documento')
        )
        
        if not arquivo_pdf:
            return Response(
                {"error": "Nenhum arquivo encontrado."}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            reader = PdfReader(arquivo_pdf)
            texto_completo = ""
            for pagina in reader.pages:
                texto_extraido = pagina.extract_text()
                if texto_extraido:
                    texto_completo += texto_extraido + "\n"

            linhas_texto = [l.strip() for l in texto_completo.split('\n') if l.strip()]
            texto_compacto = re.sub(r'\s+', ' ', texto_completo).strip()

            # O layout da Breton pode quebrar PEDIDO e o número em linhas diferentes.
            numero_pedido = _extract_numero_pedido(texto_compacto, linhas_texto)

            if not numero_pedido:
                return Response(
                    {"error": "Não foi possível identificar o número da nota no PDF."},
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )

            pedido_web = _clean_text(
                _extract_field(texto_compacto, 'Pedido Web', ['Endereço']),
                50,
            )
            loja = _clean_text(_extract_field(texto_compacto, 'Loja', ['Tipo de Pedido']), 100)
            cliente = _clean_text(_extract_field(texto_compacto, 'Cliente', ['Pedido Web']), 255)
            endereco = _clean_text(_extract_field(texto_compacto, 'Endereço', ['Bairro']), 500)
            bairro = _clean_text(_extract_field(texto_compacto, 'Bairro', ['Municipio', 'Município']), 100)

            match_municipio = re.search(
                r'Mun[ií]cipio\s*:\s*(.*?)\s*\|\s*([A-Z]{2})\s+CEP\s*:',
                texto_compacto,
                flags=re.IGNORECASE,
            )
            cidade = match_municipio.group(1).strip() if match_municipio else ''
            uf = match_municipio.group(2).upper() if match_municipio else ''

            data_entrega = _clean_text(_extract_field(texto_compacto, 'Data da Entrega', ['Periodo Entrega', 'Período Entrega']), 50)
            periodo = _clean_text(_extract_field(texto_compacto, 'Periodo Entrega', ['Placa do Veiculo', 'Placa do Veículo']), 50)
            placa_veiculo = _clean_text(_extract_field(texto_compacto, 'Placa do Veiculo', ['Obs']), 20)
            cep = _clean_text(_extract_field(texto_compacto, 'CEP', ['Data da Entrega']), 20)
            observacao = _extract_observacao(texto_compacto)
            itens_encontrados = _extract_breton_items(texto_compacto)

            if not itens_encontrados:
                return Response(
                    {"error": "Nenhum item de produto foi identificado no PDF."},
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )

            # Localiza o ID existente no banco para garantir o funcionamento correto de edição e exclusão no front
            pedido_existente = Pedido.objects.filter(numero_nota=numero_pedido).first()
            pedido_id = pedido_existente.id if pedido_existente else None

            payload_dados = {
                "id": pedido_id,
                "numero_nota": numero_pedido,
                "pedido_numero": numero_pedido,
                "pedido_web": pedido_web,
                "loja": loja,
                "cliente": cliente,
                "data_entrega": data_entrega,
                "periodo": periodo,
                "placa_veiculo": placa_veiculo,
                "observacao": observacao,
                
                "cnpj_cpf": "",
                "endereco": endereco,
                "bairro": bairro,
                "cidade": cidade,
                "uf": uf,
                "cep": cep,
                
                "destinatario": {
                    "nome": cliente,
                    "cnpj_cpf": "",
                    "logradouro": endereco,
                    "bairro": bairro,
                    "cidade": "BRASILIA",
                    "uf": "DF",
                    "cep": cep
                },
                
                "emitente": {
                    "nome": loja
                },
                
                "itens": itens_encontrados
            }
            
            return Response({
                "message": "PDF processado com sucesso.",
                "pedido_numero": numero_pedido,
                "dados_nf": payload_dados
            }, status=status.HTTP_200_OK)

        except Exception as e:
            return Response(
                {"error": f"Erro ao processar o arquivo PDF: {str(e)}"}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )