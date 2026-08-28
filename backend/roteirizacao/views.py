from rest_framework.decorators import api_view, action
from rest_framework.response import Response
from rest_framework import status, viewsets
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db import transaction
from django.db.models import Max, Q
from datetime import timedelta
import base64
import json
import hashlib
from pedidos.models import Pedido
from cadastros.models import Veiculo
from pedidos.serializers import PedidoSerializer
from core.permissions import MOTORISTA_PORTAL_ROLES, user_has_role
from .models import Rota, ParadaRota
from .serializers import RotaSerializer, ParadaRotaSerializer, ParadaRotaMotoristaSerializer


def _get_roteirizacao_ativa_para_veiculo(veiculo):
    hoje = timezone.now().date()
    rota = (
        Rota.objects.filter(veiculo=veiculo, data_rota=hoje)
        .exclude(status__in=['CANCELADA', 'CONCLUIDA'])
        .order_by('-id')
        .first()
    )

    if rota:
        return rota

    rota = Rota.objects.create(
        codigo=f"ROTA-{veiculo.placa}-{hoje.strftime('%d%m%Y')}",
        data_rota=hoje,
        veiculo=veiculo,
        status='PLANEJADA',
    )
    return rota


def _get_rota_backlog_ativa():
    hoje = timezone.now().date()
    rota = (
        Rota.objects.filter(data_rota=hoje, veiculo__isnull=True)
        .exclude(status__in=['CANCELADA', 'CONCLUIDA'])
        .order_by('-id')
        .first()
    )

    if rota:
        return rota

    rota = Rota.objects.create(
        codigo=f"BACKLOG-{hoje.strftime('%d%m%Y')}",
        data_rota=hoje,
        veiculo=None,
        status='PLANEJADA',
    )
    return rota


def _normalizar_pedido_ids(pedido_ids):
    ids = []
    vistos = set()
    for pedido_id in pedido_ids or []:
        try:
            pid = int(pedido_id)
        except (TypeError, ValueError):
            continue
        if pid in vistos:
            continue
        vistos.add(pid)
        ids.append(pid)
    return ids


def _sincronizar_paradas_da_rota(rota, pedido_ids):
    if pedido_ids is None:
        return

    ids_normalizados = _normalizar_pedido_ids(pedido_ids)
    paradas_atuais = {
        parada.pedido_id: parada
        for parada in rota.paradas.select_related('pedido').all()
    }

    with transaction.atomic():
        rota.paradas.exclude(pedido_id__in=ids_normalizados).delete()

        for sequencia, pedido_id in enumerate(ids_normalizados, start=1):
            parada = paradas_atuais.get(pedido_id)
            if parada:
                if parada.sequencia != sequencia:
                    parada.sequencia = sequencia
                    parada.save(update_fields=['sequencia'])
                continue

            ParadaRota.objects.create(
                rota=rota,
                pedido_id=pedido_id,
                sequencia=sequencia,
                status='PENDENTE',
            )


def _sincronizar_parada_do_pedido(pedido, veiculo=None):
    rota_destino = _get_rota_backlog_ativa() if veiculo is None else _get_roteirizacao_ativa_para_veiculo(veiculo)

    paradas = ParadaRota.objects.filter(pedido=pedido)
    paradas.exclude(rota=rota_destino).delete()

    parada = ParadaRota.objects.filter(pedido=pedido, rota=rota_destino).first()
    if not parada:
        proxima_sequencia = (ParadaRota.objects.filter(rota=rota_destino).aggregate(Max('sequencia'))['sequencia__max'] or 0) + 1
        ParadaRota.objects.create(
            rota=rota_destino,
            pedido=pedido,
            sequencia=proxima_sequencia,
            status='PENDENTE',
        )


def _mapear_status_parada_para_pedido(status_parada):
    mapa = {
        'PENDENTE': 'Pendente',
        'SAIDA': 'Saida',
        'CHEGADA': 'Chegada',
        'INICIO': 'Inicio',
        'ENTREGA_REALIZADA': 'Entregue',
        'RESSALVA': 'Entregue',
    }
    return mapa.get(str(status_parada or '').upper())


def _sincronizar_status_pedido(parada, novo_status):
    if not parada or not parada.pedido_id:
        return
    status_pedido = _mapear_status_parada_para_pedido(novo_status)
    if not status_pedido:
        return
    pedido = parada.pedido
    pedido.status = status_pedido
    pedido.save(update_fields=['status'])


def _salvar_evidencias_no_pedido(parada, request):
    if not parada or not parada.pedido_id:
        return

    arquivos_evidencia = []
    for campo in ['fotos_entrega', 'foto_produtos', 'foto_chegada', 'fotos_chegada', 'foto_nota_assinada', 'fotos_ressalva']:
        for arquivo in request.FILES.getlist(campo):
            if arquivo:
                arquivos_evidencia.append((campo, arquivo))
    if not arquivos_evidencia:
        return

    pedido = parada.pedido
    existentes = []
    if pedido.foto_entrega_base64:
        try:
            parsed = json.loads(pedido.foto_entrega_base64)
            if isinstance(parsed, list):
                existentes = parsed
        except (json.JSONDecodeError, TypeError, ValueError):
            existentes = []
    novas = []
    for campo_origem, arquivo in arquivos_evidencia:
        conteudo = arquivo.read()
        if not conteudo:
            continue
        arquivo.seek(0)

        arquivo_hash = hashlib.md5(conteudo).hexdigest()
        mime = arquivo.content_type or 'image/jpeg'
        b64 = base64.b64encode(conteudo).decode('ascii')
        novas.append({
            'nome': arquivo.name,
            'mime': mime,
            'origem': campo_origem,
            'hash': arquivo_hash,
            'data_base64': f'data:{mime};base64,{b64}',
        })

    if not novas:
        return

    pedido.foto_entrega_base64 = json.dumps(existentes + novas)
    pedido.save(update_fields=['foto_entrega_base64'])


def _normalizar_observacao_com_itens_ressalva(observacoes_entrega, itens_ressalva_raw):
    if not itens_ressalva_raw:
        return observacoes_entrega
    itens = []
    try:
        parsed = json.loads(itens_ressalva_raw) if isinstance(itens_ressalva_raw, str) else itens_ressalva_raw
        if isinstance(parsed, list):
            for item in parsed:
                if isinstance(item, dict):
                    codigo = str(item.get('codigo') or '').strip()
                    descricao = str(item.get('descricao') or '').strip()
                    texto = ' - '.join([p for p in [codigo, descricao] if p])
                    if texto:
                        itens.append(texto)
                elif isinstance(item, str) and item.strip():
                    itens.append(item.strip())
    except (json.JSONDecodeError, TypeError, ValueError):
        return observacoes_entrega

    if not itens:
        return observacoes_entrega

    marcador = 'Itens com ressalva:'
    atual = str(observacoes_entrega or '').strip()
    if marcador in atual:
        return atual
    sufixo = f'{marcador} ' + '; '.join(itens)
    return ' | '.join([x for x in [atual, sufixo] if x])


def _limpar_campos_de_arquivo_da_parada(parada):
    parada.foto_chegada = None
    parada.foto_produtos = None
    parada.foto_nota_assinada = None


def _is_motorista_portal_user(user):
    return user_has_role(user, MOTORISTA_PORTAL_ROLES)


def _motorista_tem_acesso_rota(user, rota):
    if not user or not user.is_authenticated:
        return False
    if not _is_motorista_portal_user(user):
        return True

    if getattr(rota, 'motorista_id', None) == user.id:
        return True
    if getattr(rota, 'ajudante_id', None) == user.id:
        return True
    if rota.equipe and rota.equipe.motorista_id == user.id:
        return True
    if rota.veiculo and rota.veiculo.equipe and rota.veiculo.equipe.motorista_id == user.id:
        return True
    if rota.paradas.filter(pedido__motorista=user).exists():
        return True
    return False


def _registrar_satisfacao(parada, request):
    if not parada or not parada.pedido:
        return
    gostou_raw = request.data.get('cliente_gostou')
    nota_raw = request.data.get('nps_nota')
    comentario = request.data.get('nps_comentario') or request.data.get('comentario') or ''
    if gostou_raw in (None, '') and nota_raw in (None, ''):
        return

    gostou = None
    if gostou_raw not in (None, ''):
        gostou = str(gostou_raw).strip().lower() in ('1', 'true', 'sim', 'yes', 'gostou')

    try:
        nota = int(nota_raw) if nota_raw not in (None, '') else (10 if gostou else 4)
    except (TypeError, ValueError):
        nota = 10 if gostou else 4
    nota = max(0, min(10, nota))

    from satisfacao.models import AvaliacaoNPS

    avaliacao = AvaliacaoNPS.objects.filter(pedido=parada.pedido).order_by('-id').first()
    if avaliacao:
        avaliacao.cliente = parada.pedido.cliente
        avaliacao.nota = nota
        avaliacao.comentario = comentario
        avaliacao.cliente_gostou = gostou
        avaliacao.save()
        return
    AvaliacaoNPS.objects.create(
        pedido=parada.pedido,
        cliente=parada.pedido.cliente,
        nota=nota,
        comentario=comentario,
        cliente_gostou=gostou,
    )


@api_view(['GET'])
def motorista_entregas(request):
    if not request.user or not request.user.is_authenticated:
        return Response({'detail': 'Autenticação obrigatória.'}, status=status.HTTP_401_UNAUTHORIZED)

    if _is_motorista_portal_user(request.user):
        rotas = Rota.objects.filter(
            Q(motorista=request.user)
            | Q(ajudante=request.user)
            | Q(equipe__motorista=request.user)
            | Q(veiculo__equipe__motorista=request.user)
            | Q(paradas__pedido__motorista=request.user)
        ).exclude(status='CANCELADA').distinct().order_by('data_rota', 'id')
    else:
        rotas = Rota.objects.exclude(status='CANCELADA').exclude(veiculo__isnull=True).order_by('data_rota', 'id')

    limite_concluidas = timezone.now() - timedelta(days=2)
    paradas = (
        ParadaRota.objects.filter(rota__in=rotas)
        .filter(Q(status__in=['PENDENTE', 'SAIDA', 'CHEGADA', 'INICIO']) | Q(finalizado__isnull=True) | Q(finalizado__gte=limite_concluidas))
        .select_related('rota', 'pedido')
        .prefetch_related('pedido__itens')
        .order_by('rota__data_rota', 'rota__id', 'sequencia')
    )
    serializer = ParadaRotaMotoristaSerializer(paradas, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


# --- Ações existentes (não altere se estiverem funcionando bem) ---

@api_view(['PATCH'])
def mover_pedido(request, pk):
    try:
        pedido = Pedido.objects.get(pk=pk)
    except Pedido.DoesNotExist:
        return Response({'error': 'Pedido não encontrado'}, status=status.HTTP_404_NOT_FOUND)

    novo_status = request.data.get('status')
    veiculo_id = request.data.get('veiculo_id')

    if novo_status:
        pedido.status = novo_status

    if veiculo_id is not None:
        if veiculo_id == '':
            pedido.veiculo = None
        else:
            try:
                pedido.veiculo = Veiculo.objects.get(pk=veiculo_id)
            except Veiculo.DoesNotExist:
                return Response({'error': 'Veículo não encontrado'}, status=status.HTTP_400_BAD_REQUEST)

    pedido.save()

    if pedido.veiculo is not None:
        _sincronizar_parada_do_pedido(pedido, pedido.veiculo)
    else:
        _sincronizar_parada_do_pedido(pedido, None)

    serializer = PedidoSerializer(pedido)
    return Response(serializer.data)

@api_view(['POST'])
def publicar_rotas(request):
    return Response({'message': 'Rotas publicadas com sucesso para os motoristas!', 'status': 'published'})

# --- Novas ViewSets para o CRUD de Rotas e Paradas com Regras de Negócio ---

class RotaViewSet(viewsets.ModelViewSet):
    queryset = Rota.objects.select_related('veiculo', 'equipe', 'motorista', 'ajudante').prefetch_related('paradas__pedido').all()
    serializer_class = RotaSerializer
    permission_classes = [IsAuthenticated]

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        data = request.data.copy()
        pedido_ids = data.pop('pedido_ids', None)
        serializer = self.get_serializer(instance, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        if pedido_ids is not None:
            _sincronizar_paradas_da_rota(serializer.instance, pedido_ids)
        serializer.instance.refresh_from_db()
        return Response(self.get_serializer(serializer.instance).data)

    @action(detail=True, methods=['post'])
    def adicionar_pedidos(self, request, pk=None):
        """
        Recebe uma lista de IDs de pedidos e os adiciona como paradas na rota.
        Exemplo de Payload: { "pedido_ids": [1, 2, 5] }
        """
        rota = self.get_object()
        pedido_ids = request.data.get('pedido_ids', [])
        
        if not pedido_ids:
            return Response({'error': 'Nenhum ID de pedido foi enviado.'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Pega a última sequência atual para adicionar os novos no final da rota
        ultima_sequencia = rota.paradas.aggregate(Max('sequencia'))['sequencia__max'] or 0
        
        motorista = rota.motorista or (rota.equipe.motorista if rota.equipe else None)
        adicionados = 0
        for p_id in pedido_ids:
            try:
                pedido = Pedido.objects.get(pk=p_id)
                # Evita duplicidade do mesmo pedido na mesma rota
                if not ParadaRota.objects.filter(rota=rota, pedido=pedido).exists():
                    ultima_sequencia += 1
                    ParadaRota.objects.create(
                        rota=rota, 
                        pedido=pedido, 
                        sequencia=ultima_sequencia
                    )
                    adicionados += 1
                atualizar = []
                if motorista and pedido.motorista_id != motorista.id:
                    pedido.motorista = motorista
                    atualizar.append('motorista')
                if rota.veiculo_id and pedido.veiculo_id != rota.veiculo_id:
                    pedido.veiculo = rota.veiculo
                    atualizar.append('veiculo')
                if pedido.status == 'Pendente':
                    pedido.status = 'Em Rota'
                    atualizar.append('status')
                if atualizar:
                    pedido.save(update_fields=atualizar)
            except Pedido.DoesNotExist:
                continue
                
        return Response({
            'message': f'{adicionados} pedido(s) adicionado(s) com sucesso à rota {rota.codigo}.',
            'total_paradas': rota.paradas.count()
        }, status=status.HTTP_200_OK)


class ParadaRotaViewSet(viewsets.ModelViewSet):
    queryset = ParadaRota.objects.select_related('rota', 'pedido').all()
    serializer_class = ParadaRotaSerializer
    permission_classes = [IsAuthenticated]
    # Necessário para aceitar arquivos (fotos) enviados pelo front-end
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @action(detail=True, methods=['post'])
    def atualizar_status(self, request, pk=None):
        """
        Atualiza o status operacional da parada, registra o horário exato (timestamp) 
        do servidor automaticamente e salva fotos/comprovantes enviados.
        """
        parada = self.get_object()
        novo_status = request.data.get('status')
        
        # Mapeamento automático dos campos de horário baseados no status escolhido
        timestamp_map = {
            'SAIDA': 'saida_entrega',
            'CHEGADA': 'chegada_cliente',
            'INICIO': 'inicio_descarregamento',
            'ENTREGA_REALIZADA': 'finalizado',
            'RESSALVA': 'finalizado'
        }

        if novo_status in timestamp_map:
            # Pega o horário exato do servidor no momento do clique
            setattr(parada, timestamp_map[novo_status], timezone.now())
        
        # Atualiza status e dados de campo enviados na requisição
        parada.status = novo_status
        parada.recebedor = request.data.get('recebedor', parada.recebedor)
        parada.documento_recebedor = request.data.get('documento_recebedor', parada.documento_recebedor)
        parada.observacoes_entrega = request.data.get('observacoes_entrega', parada.observacoes_entrega)
        parada.observacoes_entrega = _normalizar_observacao_com_itens_ressalva(
            parada.observacoes_entrega,
            request.data.get('itens_ressalva')
        )
        
        _limpar_campos_de_arquivo_da_parada(parada)

        parada.save()
        _sincronizar_status_pedido(parada, novo_status)
        _salvar_evidencias_no_pedido(parada, request)
        if novo_status in ('ENTREGA_REALIZADA', 'RESSALVA'):
            _registrar_satisfacao(parada, request)
        
        # Retorna a parada serializada atualizada
        serializer = self.get_serializer(parada)
        return Response({
            'message': f'Status atualizado para {novo_status} com sucesso!',
            'parada': serializer.data
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post', 'patch'], url_path='alterar-status-gestor')
    def alterar_status_gestor(self, request, pk=None):
        """Permite alterar o status de uma parada pela central administrativa sem exigir fotos."""
        parada = self.get_object()
        novo_status = request.data.get('status') or request.data.get('novo_status')

        if not novo_status:
            return Response({'erro': 'Status não informado.'}, status=status.HTTP_400_BAD_REQUEST)

        status_valido = [opcao[0] for opcao in ParadaRota.STATUS_PARADA]
        if novo_status not in status_valido:
            return Response({'erro': 'Status inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        timestamp_map = {
            'SAIDA': 'saida_entrega',
            'CHEGADA': 'chegada_cliente',
            'INICIO': 'inicio_descarregamento',
            'ENTREGA_REALIZADA': 'finalizado',
            'RESSALVA': 'finalizado',
        }

        if novo_status in timestamp_map:
            setattr(parada, timestamp_map[novo_status], timezone.now())

        parada.status = novo_status
        for campo in ['recebedor', 'documento_recebedor', 'observacoes_entrega']:
            if campo in request.data:
                setattr(parada, campo, request.data.get(campo))
        parada.observacoes_entrega = _normalizar_observacao_com_itens_ressalva(
            parada.observacoes_entrega,
            request.data.get('itens_ressalva')
        )

        _limpar_campos_de_arquivo_da_parada(parada)

        parada.save()
        _sincronizar_status_pedido(parada, novo_status)
        _salvar_evidencias_no_pedido(parada, request)
        if novo_status in ('ENTREGA_REALIZADA', 'RESSALVA'):
            _registrar_satisfacao(parada, request)
        serializer = self.get_serializer(parada)
        return Response({
            'message': f'Status da parada alterado para {novo_status} com sucesso!',
            'parada': serializer.data,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post', 'patch'], url_path='atualizar-status-motorista')
    def atualizar_status_motorista(self, request, pk=None):
        """Atualiza rapidamente o status da parada com timestamp do servidor para o motorista."""
        if not request.user or not request.user.is_authenticated:
            return Response({'detail': 'Autenticação obrigatória.'}, status=status.HTTP_401_UNAUTHORIZED)

        parada = self.get_object()
        if not _motorista_tem_acesso_rota(request.user, parada.rota):
            return Response({'erro': 'Esta parada não está atribuída ao motorista logado.'}, status=status.HTTP_403_FORBIDDEN)

        novo_status = request.data.get('status') or request.data.get('novo_status')
        if not novo_status:
            return Response({'erro': 'Status não informado.'}, status=status.HTTP_400_BAD_REQUEST)

        status_valido = [opcao[0] for opcao in ParadaRota.STATUS_PARADA]
        if novo_status not in status_valido:
            return Response({'erro': 'Status inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        timestamp_map = {
            'SAIDA': 'saida_entrega',
            'CHEGADA': 'chegada_cliente',
            'INICIO': 'inicio_descarregamento',
            'ENTREGA_REALIZADA': 'finalizado',
            'RESSALVA': 'finalizado',
        }

        if novo_status in timestamp_map:
            setattr(parada, timestamp_map[novo_status], timezone.now())

        parada.status = novo_status
        for campo in ['recebedor', 'documento_recebedor', 'observacoes_entrega']:
            if campo in request.data:
                setattr(parada, campo, request.data.get(campo))
        parada.observacoes_entrega = _normalizar_observacao_com_itens_ressalva(
            parada.observacoes_entrega,
            request.data.get('itens_ressalva')
        )

        _limpar_campos_de_arquivo_da_parada(parada)

        parada.save()
        _sincronizar_status_pedido(parada, novo_status)
        _salvar_evidencias_no_pedido(parada, request)
        if novo_status in ('ENTREGA_REALIZADA', 'RESSALVA'):
            _registrar_satisfacao(parada, request)
        serializer = self.get_serializer(parada)
        return Response({
            'message': f'Status da parada atualizado para {novo_status} com sucesso!',
            'parada': serializer.data,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='remover-por-pedido')
    def remover_por_pedido(self, request):
        """
        Remove a parada associada a um determinado pedido, permitindo 
        que ele volte para o backlog.
        """
        pedido_id = request.data.get('pedido_id')
        if not pedido_id:
            return Response({'erro': 'ID do pedido não informado.'}, status=status.HTTP_400_BAD_REQUEST)

        parada = ParadaRota.objects.filter(pedido_id=pedido_id).first()
        if not parada:
            return Response({'erro': 'Parada não encontrada para este pedido.'}, status=status.HTTP_404_NOT_FOUND)

        parada.delete()
        return Response({'status': 'Pedido removido da rota com sucesso.'}, status=status.HTTP_200_OK)