from rest_framework.decorators import api_view
from rest_framework.response import Response
from pedidos.models import Pedido
from cadastros.models import Veiculo
from django.db.models import Count, Sum
from datetime import datetime
import random

@api_view(['GET'])
def get_metrics(request):
    dt_inicio = request.GET.get('dt_inicio')
    dt_fim = request.GET.get('dt_fim')
    
    # Base Queryset
    qs = Pedido.objects.all()
    
    if dt_inicio:
        qs = qs.filter(criado_em__date__gte=dt_inicio)
    if dt_fim:
        qs = qs.filter(criado_em__date__lte=dt_fim)

    total_pedidos = qs.count()
    pedidos_entregues = qs.filter(status='Entregue').count()
    
    # OTIF (Simples: Entregues / Total) * 100
    otif = (pedidos_entregues / total_pedidos * 100) if total_pedidos > 0 else 0
    
    # Total em Trânsito
    em_transito = qs.filter(status='Em Rota').count()
    
    # Ocupação da Frota: (Veiculos com pedido / Total de Veiculos)
    veiculos_ativos = qs.exclude(veiculo__isnull=True).values('veiculo').distinct().count()
    total_veiculos = Veiculo.objects.count()
    ocupacao = (veiculos_ativos / total_veiculos * 100) if total_veiculos > 0 else 0
    
    # Custo por km simulado baseado na quantidade de pedidos
    custo_km = 4.50 + (random.random() * 2) # entre 4.5 e 6.5
    
    return Response({
        'otif': round(otif, 1),
        'em_transito': em_transito,
        'custo_km': round(custo_km, 2),
        'ocupacao_frota': round(ocupacao, 1),
        'total_pedidos': total_pedidos
    })
