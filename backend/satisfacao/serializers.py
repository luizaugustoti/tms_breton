from rest_framework import serializers
from .models import AvaliacaoNPS

class AvaliacaoNPSSerializer(serializers.ModelSerializer):
    classificacao = serializers.ReadOnlyField()
    pedido_numero = serializers.CharField(source='pedido.numero_nota', read_only=True)
    cliente_nome = serializers.CharField(source='pedido.cliente', read_only=True)
    motorista_nome = serializers.SerializerMethodField()
    data = serializers.DateTimeField(source='criado_em', read_only=True)

    def get_motorista_nome(self, obj):
        motorista = obj.pedido.motorista
        if not motorista:
            return None
        nome = f'{motorista.first_name} {motorista.last_name}'.strip()
        return nome or motorista.username

    class Meta:
        model = AvaliacaoNPS
        fields = '__all__'
