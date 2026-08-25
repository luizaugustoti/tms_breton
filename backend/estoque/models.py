from django.db import models

class ProdutoEstoque(models.Model):
    codigo_sku = models.CharField(max_length=50, unique=True)
    nome = models.CharField(max_length=255)
    categoria = models.CharField(max_length=100, blank=True, null=True)
    quantidade = models.FloatField(default=0)
    localizacao = models.CharField(max_length=100, blank=True, null=True)
    peso_unitario = models.FloatField(default=0)
    valor_unitario = models.FloatField(default=0)
    dimensao = models.CharField(max_length=100, blank=True, default='')
    peso_kg = models.FloatField(null=True, blank=True)
    unidade = models.CharField(max_length=10, default='UN')
    etiqueta = models.CharField(max_length=100, blank=True, default='')
    observacao = models.TextField(blank=True, default='')
    
    def __str__(self):
        return f"{self.codigo_sku} - {self.nome}"

class MovimentacaoEstoque(models.Model):
    TIPO_CHOICES = (
        ('entrada', 'Entrada'),
        ('saida', 'Saída'),
        ('ajuste', 'Ajuste'),
    )
    produto = models.ForeignKey(ProdutoEstoque, on_delete=models.CASCADE)
    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES)
    quantidade = models.FloatField()
    motivo = models.CharField(max_length=255)
    data_hora = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.tipo} - {self.produto.codigo_sku} - {self.quantidade}"
