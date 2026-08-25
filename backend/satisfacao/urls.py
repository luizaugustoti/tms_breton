from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .views import AvaliacaoNPSViewSet

router = DefaultRouter()
router.register(r'', AvaliacaoNPSViewSet, basename='avaliacao')

urlpatterns = [
    path('nps-resumo/', views.nps_resumo_legacy, name='nps-resumo-legacy'),
    path('avaliacoes/', views.avaliacoes_legacy, name='avaliacoes-legacy'),
    path('', include(router.urls)),
]
