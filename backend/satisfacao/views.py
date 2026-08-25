from rest_framework import viewsets
from rest_framework.decorators import api_view
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import AvaliacaoNPS
from .serializers import AvaliacaoNPSSerializer

class AvaliacaoNPSViewSet(viewsets.ModelViewSet):
    queryset = AvaliacaoNPS.objects.all().order_by('-criado_em')
    serializer_class = AvaliacaoNPSSerializer

    @action(detail=False, methods=['GET'], url_path='resumo')
    def nps_resumo(self, request):
        avaliacoes = self.get_queryset()
        total = avaliacoes.count()
        
        if total == 0:
            return Response({
                'nps': 0,
                'promotores': 0,
                'neutros': 0,
                'detratores': 0,
                'total': 0
            })

        promotores = avaliacoes.filter(nota__gte=9).count()
        neutros = avaliacoes.filter(nota__gte=7, nota__lte=8).count()
        detratores = avaliacoes.filter(nota__lte=6).count()

        nps = ((promotores - detratores) / total) * 100

        return Response({
            'nps': round(nps, 1),
            'promotores': promotores,
            'neutros': neutros,
            'detratores': detratores,
            'total': total
        })


@api_view(['GET'])
def nps_resumo_legacy(request):
    avaliacoes = AvaliacaoNPS.objects.all().order_by('-criado_em')
    total = avaliacoes.count()
    if total == 0:
        return Response({
            'nps': 0,
            'promotores': 0,
            'neutros': 0,
            'detratores': 0,
            'total': 0
        })

    promotores = avaliacoes.filter(nota__gte=9).count()
    neutros = avaliacoes.filter(nota__gte=7, nota__lte=8).count()
    detratores = avaliacoes.filter(nota__lte=6).count()
    nps = ((promotores - detratores) / total) * 100
    return Response({
        'nps': round(nps, 1),
        'promotores': promotores,
        'neutros': neutros,
        'detratores': detratores,
        'total': total
    })


@api_view(['GET'])
def avaliacoes_legacy(request):
    queryset = AvaliacaoNPS.objects.all().order_by('-criado_em')
    serializer = AvaliacaoNPSSerializer(queryset, many=True)
    return Response(serializer.data)
