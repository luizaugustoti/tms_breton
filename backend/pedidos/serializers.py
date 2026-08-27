from rest_framework import serializers
from .models import Pedido, ItemPedido, PedidoHistorico
from estoque.models import ProdutoEstoque, MovimentacaoEstoque
from django.db import transaction
from django.db import DatabaseError
from django.db.models import Q
import re
import json


class ItemPedidoSerializer(serializers.ModelSerializer):
    produto = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = ItemPedido
        fields = [
            'id', 'produto', 'codigo', 'etiqueta', 'descricao',
            'quantidade', 'unidade', 'peso_unitario', 'valor_unitario'
        ]
        read_only_fields = ['id']


class PedidoHistoricoSerializer(serializers.ModelSerializer):
    class Meta:
        model = PedidoHistorico
        fields = [
            'id', 'tipo', 'descricao', 'status_anterior', 'status_novo',
            'dados', 'ocorrido_em',
        ]
        read_only_fields = fields


class PedidoSerializer(serializers.ModelSerializer):
    itens = ItemPedidoSerializer(many=True, required=False)
    historico = PedidoHistoricoSerializer(many=True, read_only=True)
    pedido_web = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    destinatario = serializers.SerializerMethodField()
    emitente = serializers.SerializerMethodField()
    historico_entrega = serializers.SerializerMethodField()
    veiculo_detalhes = serializers.SerializerMethodField()
    motorista_nome = serializers.SerializerMethodField()
    loja = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)

    # Campos de conveniência (aliases) para compatibilidade com frontend
    pedido_numero = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    cliente_nome = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    cidade_uf = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)

    remetente_documento = serializers.CharField(write_only=True, required=False, allow_blank=True, default='')
    remetente_endereco = serializers.CharField(write_only=True, required=False, allow_blank=True, default='')
    remetente_complemento = serializers.CharField(write_only=True, required=False, allow_blank=True, default='')
    remetente_numero = serializers.CharField(write_only=True, required=False, allow_blank=True, default='')
    remetente_cidade = serializers.CharField(write_only=True, required=False, allow_blank=True, default='')
    remetente_uf = serializers.CharField(write_only=True, required=False, allow_blank=True, default='')

    class Meta:
        model = Pedido
        fields = [
            'id', 'numero_nota', 'pedido_web', 'loja', 'cliente', 'cnpj_cpf',
            'endereco', 'bairro', 'cidade', 'uf', 'cep',
            'data_entrega', 'periodo', 'placa_veiculo', 'observacao',
            'peso_total', 'volume_total', 'tipo_operacao', 'status', 'veiculo', 'motorista',
            'criado_em', 'assinatura_base64', 'foto_entrega_base64', 'itens',
            'historico',
            'veiculo_detalhes', 'motorista_nome',
            'destinatario', 'emitente', 'historico_entrega',
            'remetente_documento', 'remetente_endereco', 'remetente_complemento',
            'remetente_numero', 'remetente_cidade', 'remetente_uf',
            # aliases write_only
            'pedido_numero', 'cliente_nome', 'cidade_uf',
        ]
        read_only_fields = ['id', 'criado_em']

    def get_destinatario(self, obj):
        return {
            "nome": obj.cliente,
            "cnpj_cpf": obj.cnpj_cpf or "",
            "logradouro": obj.endereco,
            "bairro": obj.bairro or "",
            "cidade": obj.cidade or "",
            "uf": obj.uf or "",
            "cep": obj.cep or ""
        }

    def get_emitente(self, obj):
        return {
            "nome": obj.loja or ""
        }

    def get_veiculo_detalhes(self, obj):
        if not obj.veiculo:
            return None
        equipe = getattr(obj.veiculo, 'equipe', None)
        return {
            'id': obj.veiculo_id,
            'placa': obj.veiculo.placa,
            'modelo': obj.veiculo.modelo or '',
            'equipe': equipe.nome if equipe else '',
        }

    def get_motorista_nome(self, obj):
        if not obj.motorista:
            return ''
        nome = f"{obj.motorista.first_name} {obj.motorista.last_name}".strip()
        return nome or obj.motorista.username

    def get_historico_entrega(self, obj):
        from roteirizacao.models import ParadaRota

        paradas = obj.paradas.all() if hasattr(obj, 'paradas') else obj.paradarota_set.all()
        if not paradas:
            return []
        parada = sorted(paradas, key=lambda p: p.id, reverse=True)[0]

        evidencias = []
        if obj.foto_entrega_base64:
            try:
                itens = json.loads(obj.foto_entrega_base64)
                if isinstance(itens, list):
                    parsed = []
                    for idx, i in enumerate(itens, start=1):
                        if isinstance(i, dict):
                            parsed.append({
                                'nome': i.get('nome', f'foto-{idx}'),
                                'mime': i.get('mime', 'image/jpeg'),
                                'origem': i.get('origem', ''),
                                'hash': i.get('hash', ''),
                                'url': i.get('data_base64') or i.get('url') or '',
                            })
                        elif isinstance(i, str):
                            parsed.append({
                                'nome': f'foto-{idx}',
                                'mime': 'image/jpeg',
                                'origem': '',
                                'url': i,
                            })
                    evidencias = parsed
            except (json.JSONDecodeError, TypeError, ValueError):
                bruto = str(obj.foto_entrega_base64 or '').strip()
                if bruto.startswith('data:image/'):
                    evidencias = [{'nome': 'foto-1', 'mime': 'image/jpeg', 'origem': '', 'url': bruto}]

        evidencias_chegada = [
            x for x in evidencias
            if str(x.get('origem', '')).strip() in ['foto_chegada', 'fotos_chegada']
        ]
        evidencias_ressalva = [x for x in evidencias if str(x.get('origem', '')).strip() == 'fotos_ressalva']
        evidencias_finalizacao = [
            x for x in evidencias
            if str(x.get('origem', '')).strip() not in ['foto_chegada', 'fotos_chegada', 'fotos_ressalva']
        ]

        eventos = []
        timeline = [
            ('saida_entrega', 'Saída para Entrega', 'SAIDA'),
            ('chegada_cliente', 'Chegada no Cliente', 'CHEGADA'),
            ('inicio_descarregamento', 'Início de Descarregamento', 'INICIO'),
            ('finalizado', 'Finalização', parada.status),
        ]
        for campo, titulo, status_evento in timeline:
            valor = getattr(parada, campo, None)
            if valor:
                evidencias_evento = []
                if status_evento == 'CHEGADA':
                    evidencias_evento = evidencias_chegada
                elif titulo == 'Finalização':
                    evidencias_evento = evidencias_finalizacao
                eventos.append({
                    'titulo': titulo,
                    'status': status_evento,
                    'timestamp': valor.isoformat(),
                    'evidencias': evidencias_evento,
                    'evidencias_total': len(evidencias_evento),
                })

        if parada.status == 'RESSALVA' and evidencias_ressalva:
            eventos.append({
                'titulo': 'Fotos dos Produtos com Ressalva',
                'status': 'RESSALVA',
                'timestamp': parada.finalizado.isoformat() if parada.finalizado else '',
                'evidencias': evidencias_ressalva,
                'evidencias_total': len(evidencias_ressalva),
            })

        eventos.append({
            'titulo': 'Status Atual',
            'status': parada.status,
            'recebedor': parada.recebedor or '',
            'documento_recebedor': parada.documento_recebedor or '',
            'observacoes_entrega': parada.observacoes_entrega or '',
            'evidencias': [],
            'evidencias_total': len(evidencias),
        })
        return eventos

    @staticmethod
    def _clean_text(value, max_length):
        value = re.sub(r'\s+', ' ', str(value or '')).strip()
        value = re.split(r'Etiqueta\s+Volumes|Total\s+de\s+Etiqueta', value, maxsplit=1, flags=re.IGNORECASE)[0]
        return value[:max_length].strip(' -:;|')

    def validate_numero_nota(self, value):
        value = self._clean_text(value, 50)
        if not value:
            raise serializers.ValidationError('O número da nota é obrigatório.')
        return value

    def validate_pedido_web(self, value):
        return self._clean_text(value, 50)

    def validate_observacao(self, value):
        return self._clean_text(value, 150)

    def validate(self, attrs):
        # --- ALIASES: mapeia campos do frontend para os do backend ---
        if 'pedido_numero' in attrs and attrs['pedido_numero'] and not attrs.get('numero_nota'):
            attrs['numero_nota'] = attrs.pop('pedido_numero')
        else:
            attrs.pop('pedido_numero', None)

        if 'cliente_nome' in attrs and attrs['cliente_nome'] and not attrs.get('cliente'):
            attrs['cliente'] = attrs.pop('cliente_nome')
        else:
            attrs.pop('cliente_nome', None)

        if 'cidade_uf' in attrs and attrs['cidade_uf']:
            cidade_uf_raw = attrs.pop('cidade_uf')
            if not attrs.get('cidade') or not attrs.get('uf'):
                match = re.match(r'^(.*?)\s*\|\s*([A-Z]{2})$', str(cidade_uf_raw).strip(), re.IGNORECASE)
                if match:
                    attrs['cidade'] = match.group(1).strip()
                    attrs['uf'] = match.group(2).strip().upper()
                else:
                    attrs['cidade'] = cidade_uf_raw.strip()

        for field, limit in (
            ('loja', 255), ('cliente', 255), ('endereco', 500),
            ('bairro', 100), ('cidade', 100), ('uf', 2), ('cep', 20),
            ('data_entrega', 50), ('periodo', 50), ('placa_veiculo', 20),
        ):
            if field in attrs and attrs[field] is not None:
                attrs[field] = self._clean_text(attrs[field], limit)
        return attrs

    def _pop_pessoas_extras(self, validated_data):
        keys = (
            'remetente_documento', 'remetente_endereco', 'remetente_complemento',
            'remetente_numero', 'remetente_cidade', 'remetente_uf',
        )
        extras = {key: validated_data.pop(key, '') for key in keys}
        extras['remetente_nome'] = validated_data.get('loja', '')
        extras['destinatario_nome'] = validated_data.get('cliente', '')
        extras['destinatario_documento'] = validated_data.get('cnpj_cpf', '')
        extras['destinatario_endereco'] = validated_data.get('endereco', '')
        extras['destinatario_complemento'] = validated_data.get('bairro', '')
        extras['destinatario_cidade'] = validated_data.get('cidade', '')
        extras['destinatario_uf'] = validated_data.get('uf', '')
        extras['destinatario_cep'] = validated_data.get('cep', '')
        return extras

    def _resolve_produto(self, item_data):
        produto_recebido = item_data.get('produto')
        if isinstance(produto_recebido, ProdutoEstoque):
            return produto_recebido

        codigo_busca = produto_recebido or item_data.get('codigo') or item_data.get('etiqueta')
        if not codigo_busca:
            return None
        codigo_busca = str(codigo_busca).strip()
        query = Q(codigo_sku=codigo_busca)
        if codigo_busca.isdigit():
            query |= Q(id=int(codigo_busca))
        return ProdutoEstoque.objects.filter(query).first()

    def _replace_items(self, pedido, itens_data, restore_existing_stock=False):
        if restore_existing_stock:
            for item in pedido.itens.select_related('produto').all():
                if item.produto_id:
                    produto = item.produto
                    produto.quantidade += item.quantidade
                    produto.save(update_fields=['quantidade'])
                    MovimentacaoEstoque.objects.create(
                        produto=produto,
                        tipo='entrada',
                        quantidade=item.quantidade,
                        motivo=f'Estorno da atualização do pedido {pedido.numero_nota}',
                    )

        pedido.itens.all().delete()

        for item_data in itens_data:
            quantidade = item_data.get('quantidade', 1)
            if quantidade <= 0:
                raise serializers.ValidationError({
                    'itens': 'A quantidade dos itens deve ser maior que zero.'
                })

            produto_obj = self._resolve_produto(item_data)

            if not produto_obj:
                codigo_sku = str(
                    item_data.get('codigo') or
                    item_data.get('etiqueta') or
                    item_data.get('produto') or
                    'AUTO_PROD'
                ).strip()

                try:
                    produto_obj = ProdutoEstoque.objects.create(
                        codigo_sku=codigo_sku,
                        quantidade=0
                    )
                except (TypeError, ValueError, DatabaseError) as exc:
                    raise serializers.ValidationError({
                        'itens': f'Falha ao preparar item de estoque para "{codigo_sku}".'
                    }) from exc

            item_data['produto'] = produto_obj
            ItemPedido.objects.create(pedido=pedido, **item_data)

            produto_obj.quantidade -= quantidade
            produto_obj.save(update_fields=['quantidade'])
            MovimentacaoEstoque.objects.create(
                produto=produto_obj,
                tipo='saida',
                quantidade=quantidade,
                motivo=f'Saída automática para o pedido {pedido.numero_nota}',
            )

    @transaction.atomic
    def create(self, validated_data):
        from cadastros.pessoas import registrar_pessoas_da_emissao

        extras = self._pop_pessoas_extras(validated_data)
        itens_data = validated_data.pop('itens', [])
        numero_nota = validated_data['numero_nota'].strip()
        if not numero_nota:
            raise serializers.ValidationError({'numero_nota': 'A nota fiscal é obrigatória.'})
        validated_data['numero_nota'] = numero_nota

        pedido, created = Pedido.objects.update_or_create(
            numero_nota=numero_nota,
            defaults=validated_data,
        )
        self._replace_items(pedido, itens_data, restore_existing_stock=not created)
        extras['remetente_nome'] = pedido.loja
        extras['destinatario_nome'] = pedido.cliente
        registrar_pessoas_da_emissao(pedido, extras, increment=True)
        return pedido

    @transaction.atomic
    def update(self, instance, validated_data):
        from cadastros.pessoas import registrar_pessoas_da_emissao

        extras = self._pop_pessoas_extras(validated_data)
        itens_data = validated_data.pop('itens', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if itens_data is not None:
            self._replace_items(instance, itens_data, restore_existing_stock=True)

        extras['remetente_nome'] = instance.loja
        extras['destinatario_nome'] = instance.cliente
        extras['destinatario_documento'] = extras.get('destinatario_documento') or instance.cnpj_cpf
        extras['destinatario_endereco'] = extras.get('destinatario_endereco') or instance.endereco
        extras['destinatario_cidade'] = extras.get('destinatario_cidade') or instance.cidade
        extras['destinatario_uf'] = extras.get('destinatario_uf') or instance.uf
        registrar_pessoas_da_emissao(instance, extras, increment=True)
        return instance


class PedidoListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pedido
        fields = [
            'id', 'numero_nota', 'cliente', 'cidade', 'uf',
            'volume_total', 'data_entrega', 'status',
        ]