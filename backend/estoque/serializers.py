from rest_framework import serializers
from .models import ProdutoEstoque, MovimentacaoEstoque

class ProdutoEstoqueSerializer(serializers.ModelSerializer):
    codigo = serializers.CharField(source='codigo_sku')
    descricao = serializers.CharField(source='nome')

    class Meta:
        model = ProdutoEstoque
        fields = [
            'id', 'codigo', 'descricao', 'categoria', 'quantidade',
            'localizacao', 'peso_kg', 'unidade', 'etiqueta', 'observacao',
            'peso_unitario', 'valor_unitario', 'dimensao',
        ]

    def validate_quantidade(self, value):
        if value < 0:
            raise serializers.ValidationError('A quantidade não pode ser negativa.')
        return value

class MovimentacaoEstoqueSerializer(serializers.ModelSerializer):
    class Meta:
        model = MovimentacaoEstoque
        fields = '__all__'
        read_only_fields = ['data_hora']
