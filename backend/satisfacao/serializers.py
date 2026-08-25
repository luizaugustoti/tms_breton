from rest_framework import serializers
from .models import AvaliacaoNPS

class AvaliacaoNPSSerializer(serializers.ModelSerializer):
    classificacao = serializers.ReadOnlyField()

    class Meta:
        model = AvaliacaoNPS
        fields = '__all__'
