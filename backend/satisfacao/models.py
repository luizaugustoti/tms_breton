from django.db import models
from pedidos.models import Pedido

class AvaliacaoNPS(models.Model):
    pedido = models.ForeignKey(Pedido, on_delete=models.CASCADE, related_name='avaliacoes')
    cliente = models.CharField(max_length=255)
    nota = models.IntegerField() # 0 a 10
    comentario = models.TextField(blank=True, null=True)
    cliente_gostou = models.BooleanField(null=True, blank=True, verbose_name='Cliente gostou')
    criado_em = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Nota {self.nota} - {self.cliente}"

    @property
    def classificacao(self):
        if self.nota >= 9:
            return 'Promotor'
        elif self.nota >= 7:
            return 'Neutro'
        else:
            return 'Detrator'
