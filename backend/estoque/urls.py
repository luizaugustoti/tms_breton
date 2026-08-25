from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProdutoEstoqueViewSet, MovimentacaoEstoqueViewSet

router = DefaultRouter()
router.register(r'produtos', ProdutoEstoqueViewSet, basename='produtoestoque')
router.register(r'movimentacoes', MovimentacaoEstoqueViewSet, basename='movimentacaoestoque')

urlpatterns = [
    path('', include(router.urls)),
]
