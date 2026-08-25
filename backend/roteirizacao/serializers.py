from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Rota, ParadaRota
from pedidos.serializers import PedidoSerializer

Usuario = get_user_model()


def _nome_usuario(user):
    if not user:
        return ''
    nome = f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip()
    return nome or getattr(user, 'username', '') or ''


class ParadaRotaSerializer(serializers.ModelSerializer):
    pedido = PedidoSerializer(read_only=True)
    pedido_id = serializers.IntegerField(source='pedido.id', read_only=True)

    class Meta:
        model = ParadaRota
        fields = [
            'id', 'rota', 'pedido', 'pedido_id', 'sequencia', 'status',
            'saida_entrega', 'chegada_cliente', 'inicio_descarregamento',
            'finalizado', 'recebedor', 'documento_recebedor',
            'observacoes_entrega', 'foto_chegada', 'foto_produtos', 'foto_nota_assinada'
        ]
        read_only_fields = ['foto_chegada', 'foto_produtos', 'foto_nota_assinada']


class RotaSerializer(serializers.ModelSerializer):
    paradas = ParadaRotaSerializer(many=True, read_only=True)
    veiculo_placa = serializers.ReadOnlyField(source='veiculo.placa')
    equipe_nome = serializers.ReadOnlyField(source='equipe.nome')
    motorista = serializers.PrimaryKeyRelatedField(
        queryset=Usuario.objects.all(), required=False, allow_null=True
    )
    ajudante = serializers.PrimaryKeyRelatedField(
        queryset=Usuario.objects.all(), required=False, allow_null=True
    )
    motorista_nome = serializers.SerializerMethodField()
    ajudante_nome = serializers.SerializerMethodField()
    total_pedidos = serializers.SerializerMethodField()
    total_peso = serializers.SerializerMethodField()
    total_volume = serializers.SerializerMethodField()

    class Meta:
        model = Rota
        fields = [
            'id', 'codigo', 'data_rota', 'veiculo', 'veiculo_placa',
            'equipe', 'equipe_nome', 'motorista', 'motorista_nome',
            'ajudante', 'ajudante_nome', 'status', 'observacoes',
            'paradas', 'total_pedidos', 'total_peso', 'total_volume',
            'criado_em', 'atualizado_em'
        ]

    def get_motorista_nome(self, obj):
        if obj.motorista:
            return _nome_usuario(obj.motorista)
        if obj.equipe and obj.equipe.motorista:
            return _nome_usuario(obj.equipe.motorista)
        return ''

    def get_ajudante_nome(self, obj):
        return _nome_usuario(obj.ajudante)

    def get_total_pedidos(self, obj):
        return obj.paradas.count()

    def get_total_peso(self, obj):
        total = 0
        for parada in obj.paradas.select_related('pedido').all():
            if parada.pedido and parada.pedido.peso_total is not None:
                total += float(parada.pedido.peso_total)
        return total

    def get_total_volume(self, obj):
        total = 0
        for parada in obj.paradas.select_related('pedido').all():
            if parada.pedido and parada.pedido.volume_total is not None:
                total += float(parada.pedido.volume_total)
        return total

    def _get_or_create_equipe(self, usuario):
        from cadastros.models import Equipe

        if not usuario:
            return None
        equipe = Equipe.objects.filter(motorista=usuario).first()
        if equipe:
            return equipe
        nome_base = f"Equipe {_nome_usuario(usuario) or usuario.username}".strip()[:90]
        nome = nome_base or f"Equipe {usuario.id}"
        indice = 1
        while Equipe.objects.filter(nome=nome).exists():
            indice += 1
            nome = f"{nome_base} {indice}"
        return Equipe.objects.create(nome=nome, motorista=usuario, ativo=True)

    def create(self, validated_data):
        motorista = validated_data.get('motorista')
        if motorista and not validated_data.get('equipe'):
            validated_data['equipe'] = self._get_or_create_equipe(motorista)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        motorista = validated_data.get('motorista', instance.motorista)
        if motorista and not validated_data.get('equipe') and not instance.equipe_id:
            validated_data['equipe'] = self._get_or_create_equipe(motorista)
        return super().update(instance, validated_data)
