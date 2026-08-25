from django.conf import settings
from django.db import models
from cadastros.models import Veiculo, Equipe
from pedidos.models import Pedido

class Rota(models.Model):
    STATUS_ROTA = [
        ('PLANEJADA', 'Planejada'),
        ('EM_ANDAMENTO', 'Em Andamento'),
        ('CONCLUIDA', 'Concluída'),
        ('CANCELADA', 'Cancelada'),
    ]

    codigo = models.CharField(max_length=50, unique=True, verbose_name="Código da Rota")
    data_rota = models.DateField(verbose_name="Data da Rota")
    
    # Profissional: Permite nulos para representar o estado de Backlog (pendente de alocação)
    veiculo = models.ForeignKey(Veiculo, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Veículo")
    equipe = models.ForeignKey(Equipe, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Equipe Responsável")
    motorista = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rotas_como_motorista',
        verbose_name="Motorista",
    )
    ajudante = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rotas_como_ajudante',
        verbose_name="Ajudante",
    )
    
    status = models.CharField(max_length=20, choices=STATUS_ROTA, default='PLANEJADA', verbose_name="Status")
    observacoes = models.TextField(blank=True, null=True, verbose_name="Observações")
    
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Rota"
        verbose_name_plural = "Rotas"
        ordering = ['-data_rota', '-id']

    def __str__(self):
        if self.veiculo:
            return f"Rota {self.codigo} - {self.data_rota} ({self.veiculo.placa})"
        return f"Backlog - {self.data_rota}"


class ParadaRota(models.Model):
    STATUS_PARADA = [
        ('PENDENTE', 'Pendente'),
        ('SAIDA', 'Saída para Entrega'),
        ('CHEGADA', 'Chegada no Cliente'),
        ('INICIO', 'Início de Descarregamento'),
        ('ENTREGA_REALIZADA', 'Entrega Realizada'),
        ('RESSALVA', 'Entrega Realizada com Ressalvas'),
    ]

    rota = models.ForeignKey(Rota, related_name='paradas', on_delete=models.CASCADE, verbose_name="Rota")
    pedido = models.ForeignKey(Pedido, on_delete=models.PROTECT, verbose_name="Pedido")
    sequencia = models.PositiveIntegerField(verbose_name="Ordem da Parada")
    
    # Status e controle
    status = models.CharField(max_length=30, choices=STATUS_PARADA, default='PENDENTE', verbose_name="Status da Parada")
    
    # Horários de Campo (Timestamps)
    saida_entrega = models.DateTimeField(blank=True, null=True, verbose_name="Saída Entrega")
    chegada_cliente = models.DateTimeField(blank=True, null=True, verbose_name="Chegada Cliente")
    inicio_descarregamento = models.DateTimeField(blank=True, null=True, verbose_name="Início")
    finalizado = models.DateTimeField(blank=True, null=True, verbose_name="Finalizado")

    # Dados de Comprovação / Campo
    recebedor = models.CharField(max_length=150, blank=True, null=True, verbose_name="Recebedor")
    documento_recebedor = models.CharField(max_length=50, blank=True, null=True, verbose_name="Documento (DOC)")
    observacoes_entrega = models.TextField(blank=True, null=True, verbose_name="Observações (Obs)")

    # Anexos Fotográficos
    foto_chegada = models.ImageField(upload_to='comprovantes/chegada/', blank=True, null=True, verbose_name="Foto Chegada")
    foto_produtos = models.ImageField(upload_to='comprovantes/produtos/', blank=True, null=True, verbose_name="Foto Produtos")
    foto_nota_assinada = models.ImageField(upload_to='comprovantes/notas/', blank=True, null=True, verbose_name="Foto Nota Assinada")

    class Meta:
        verbose_name = "Parada da Rota"
        verbose_name_plural = "Paradas da Rota"
        ordering = ['rota', 'sequencia']

    def __str__(self):
        return f"Parada {self.sequencia} - Pedido {self.pedido.id} ({self.rota.codigo})"