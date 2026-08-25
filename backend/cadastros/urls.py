from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VeiculoViewSet, FuncionarioViewSet, UsuarioViewSet, EquipeViewSet, PessoaEmpresaViewSet

router = DefaultRouter()
router.register(r'veiculos', VeiculoViewSet, basename='veiculo')
router.register(r'funcionarios', FuncionarioViewSet, basename='funcionario')
router.register(r'motoristas', FuncionarioViewSet, basename='motorista')
router.register(r'usuarios', UsuarioViewSet, basename='usuario')
router.register(r'equipes', EquipeViewSet, basename='equipe')
router.register(r'pessoas', PessoaEmpresaViewSet, basename='pessoa')

urlpatterns = [
    path('', include(router.urls)),
]
