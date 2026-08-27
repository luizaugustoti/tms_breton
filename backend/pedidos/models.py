from django.db import models
from django.conf import settings
from cadastros.models import Veiculo
from estoque.models import ProdutoEstoque

class Pedido(models.Model):
    STATUS_CHOICES = (
        ('Pendente', 'Pendente'),
        ('Em Rota', 'Em Rota'),
        ('Saida', 'Saída'),
        ('Chegada', 'Chegada'),
        ('Inicio', 'Início'),
        ('Entregue', 'Entregue'),
        ('Ocorrência', 'Ocorrência'),
    )
    
    numero_nota = models.CharField(max_length=50, unique=True)
    pedido_web = models.CharField(max_length=50, null=True, blank=True)
    loja = models.CharField(max_length=100, null=True, blank=True)
    cliente = models.CharField(max_length=255)
    cnpj_cpf = models.CharField(max_length=20, null=True, blank=True)
    
    # Endereço detalhado
    endereco = models.TextField()
    bairro = models.CharField(max_length=100, null=True, blank=True)
    cidade = models.CharField(max_length=100, null=True, blank=True)
    uf = models.CharField(max_length=2, null=True, blank=True)
    cep = models.CharField(max_length=20, null=True, blank=True)
    
    # Informações de entrega
    data_entrega = models.CharField(max_length=50, null=True, blank=True)
    periodo = models.CharField(max_length=50, null=True, blank=True)
    placa_veiculo = models.CharField(max_length=20, null=True, blank=True)
    observacao = models.TextField(null=True, blank=True)
    
    peso_total = models.FloatField(default=0)
    volume_total = models.FloatField(default=0)
    tipo_operacao = models.CharField(
        max_length=20,
        choices=(
            ('ENTREGA', 'Entrega'),
            ('COLETA', 'Coleta'),
            ('TRANSFERENCIA', 'Transferência'),
        ),
        default='ENTREGA',
        verbose_name='Tipo de operação',
    )
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='Pendente')
    
    veiculo = models.ForeignKey(Veiculo, on_delete=models.SET_NULL, null=True, blank=True)
    motorista = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='pedidos')
    
    criado_em = models.DateTimeField(auto_now_add=True)
    
    assinatura_base64 = models.TextField(null=True, blank=True)
    foto_entrega_base64 = models.TextField(null=True, blank=True)
    
    def __str__(self):
        return f"Pedido {self.numero_nota} - {self.cliente}"


class PedidoHistorico(models.Model):
    """Registro imutável das mudanças observadas no ciclo de vida do pedido."""

    TIPO_CHOICES = (
        ('CRIACAO', 'Criação'),
        ('STATUS', 'Status'),
        ('ALOCACAO', 'Alocação'),
        ('ROTEIRIZACAO', 'Roteirização'),
        ('ALTERACAO', 'Alteração'),
        ('EVIDENCIA', 'Evidência'),
    )

    pedido = models.ForeignKey(
        Pedido, on_delete=models.CASCADE, related_name='historico'
    )
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES)
    descricao = models.CharField(max_length=255)
    status_anterior = models.CharField(max_length=50, blank=True, null=True)
    status_novo = models.CharField(max_length=50, blank=True, null=True)
    dados = models.JSONField(default=dict, blank=True)
    ocorrido_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-ocorrido_em', '-id']
        indexes = [
            models.Index(fields=['pedido', '-ocorrido_em']),
        ]

    def __str__(self):
        return f"{self.pedido} - {self.tipo} - {self.ocorrido_em}"


class ItemPedido(models.Model):
    pedido = models.ForeignKey(Pedido, on_delete=models.CASCADE, related_name='itens')
    produto = models.ForeignKey(ProdutoEstoque, on_delete=models.PROTECT, null=True, blank=True)
    codigo = models.CharField(max_length=100, null=True, blank=True)
    etiqueta = models.CharField(max_length=100, null=True, blank=True)
    descricao = models.CharField(max_length=255, null=True, blank=True)
    quantidade = models.FloatField()
    unidade = models.CharField(max_length=10, default='UN')
    peso_unitario = models.FloatField(default=0)
    valor_unitario = models.FloatField(default=0)

    def __str__(self):
        return f"{self.quantidade}x {self.descricao or self.codigo} (Pedido {self.pedido.numero_nota})"
    
    