from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# Configura o roteador para as novas ViewSets de Rota e Parada
router = DefaultRouter()
router.register(r'rotas', views.RotaViewSet, basename='rota')
router.register(r'paradas', views.ParadaRotaViewSet, basename='parada')

urlpatterns = [
    # Inclui as rotas do CRUD (ex: /api/v1/roteirizacao/rotas/)
    path('', include(router.urls)),

    # Portal do Motorista
    path('motorista/entregas/', views.motorista_entregas, name='motorista-entregas'),

    # Mantém suas rotas de ações específicas existentes
    path('pedidos/<int:pk>/mover/', views.mover_pedido, name='mover-pedido'),
    path('publicar/', views.publicar_rotas, name='publicar-rotas'),
]