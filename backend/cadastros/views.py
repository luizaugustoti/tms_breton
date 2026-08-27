from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
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

    @action(detail=True, methods=['post'], url_path='redefinir-senha')
    def redefinir_senha(self, request, pk=None):
        usuario = self.get_object()
        senha = str(request.data.get('senha') or '').strip()
        if len(senha) < 8:
            return Response(
                {'detail': 'A senha deve ter no mínimo 8 caracteres.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        usuario.set_password(senha)
        usuario.save(update_fields=['password'])
        return Response({'detail': 'Senha redefinida com sucesso.'})