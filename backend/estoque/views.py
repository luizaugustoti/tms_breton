from rest_framework import viewsets, status
from rest_framework.response import Response
from .models import ProdutoEstoque, MovimentacaoEstoque
from .serializers import ProdutoEstoqueSerializer, MovimentacaoEstoqueSerializer
from django.db import transaction

class ProdutoEstoqueViewSet(viewsets.ModelViewSet):
    queryset = ProdutoEstoque.objects.all().order_by('nome')
    serializer_class = ProdutoEstoqueSerializer

class MovimentacaoEstoqueViewSet(viewsets.ModelViewSet):
    queryset = MovimentacaoEstoque.objects.all().order_by('-data_hora')
    serializer_class = MovimentacaoEstoqueSerializer

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        movimentacao = serializer.save()
        
        # Atualiza a quantidade no ProdutoEstoque correspondente
        produto = movimentacao.produto
        if movimentacao.tipo == 'entrada':
            produto.quantidade += movimentacao.quantidade
        elif movimentacao.tipo == 'saida':
            produto.quantidade -= movimentacao.quantidade
        elif movimentacao.tipo == 'ajuste':
            # Ajuste substitui a quantidade atual
            produto.quantidade = movimentacao.quantidade
            
        produto.save()
        
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
