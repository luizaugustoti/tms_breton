from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Veiculo, Equipe, Funcionario, PessoaEmpresa
from .serializers import VeiculoSerializer, FuncionarioSerializer, UsuarioSerializer, EquipeSerializer, PessoaEmpresaSerializer
from django.contrib.auth import get_user_model
from core.permissions import CanManageUsers

Usuario = get_user_model()


class PessoaEmpresaViewSet(viewsets.ModelViewSet):
    queryset = PessoaEmpresa.objects.all().order_by('nome')
    serializer_class = PessoaEmpresaSerializer
    permission_classes = [IsAuthenticated]

    def list(self, request, *args, **kwargs):
        from .pessoas import sincronizar_pessoas_dos_pedidos
        sincronizar_pessoas_dos_pedidos()
        return super().list(request, *args, **kwargs)


class VeiculoViewSet(viewsets.ModelViewSet):
    queryset = Veiculo.objects.all().select_related('equipe').order_by('modelo')
    serializer_class = VeiculoSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        # Apenas salva o veículo limpo, sem criar dependências obrigatórias que quebram o sistema
        serializer.save()


class EquipeViewSet(viewsets.ModelViewSet):
    queryset = Equipe.objects.all().order_by('nome')
    serializer_class = EquipeSerializer
    permission_classes = [IsAuthenticated]


class FuncionarioViewSet(viewsets.ModelViewSet):
    queryset = Funcionario.objects.all().order_by('nome')
    serializer_class = FuncionarioSerializer
    permission_classes = [CanManageUsers]


class UsuarioViewSet(viewsets.ModelViewSet):
    queryset = Usuario.objects.all().order_by('first_name')
    serializer_class = UsuarioSerializer
    permission_classes = [CanManageUsers]