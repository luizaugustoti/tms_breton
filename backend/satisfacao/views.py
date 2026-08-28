from rest_framework import viewsets
from rest_framework.decorators import api_view
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from .models import AvaliacaoNPS
from .serializers import AvaliacaoNPSSerializer


class AvaliacaoPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 100


def _calcular_resumo_nps(avaliacoes):
    total = avaliacoes.count()
    if total == 0:
        return {
            'score_nps': 0,
            'nps': 0,
            'promotores': 0,
            'neutros': 0,
            'detratores': 0,
            'total': 0,
        }

    promotores = avaliacoes.filter(nota__gte=9).count()
    neutros = avaliacoes.filter(nota__gte=7, nota__lte=8).count()
    detratores = avaliacoes.filter(nota__lte=6).count()
    score_nps = ((promotores - detratores) / total) * 100

    return {
        'score_nps': round(score_nps, 1),
        'nps': round(score_nps, 1),
        'promotores': promotores,
        'neutros': neutros,
        'detratores': detratores,
        'total': total,
    }


class AvaliacaoNPSViewSet(viewsets.ModelViewSet):
    queryset = AvaliacaoNPS.objects.all().order_by('-criado_em')
    serializer_class = AvaliacaoNPSSerializer
    pagination_class = AvaliacaoPagination

    @action(detail=False, methods=['GET'], url_path='resumo')
    def nps_resumo(self, request):
        return Response(_calcular_resumo_nps(self.get_queryset()))


@api_view(['GET'])
def nps_resumo_legacy(request):
    avaliacoes = AvaliacaoNPS.objects.all().order_by('-criado_em')
    return Response(_calcular_resumo_nps(avaliacoes))


@api_view(['GET'])
def avaliacoes_legacy(request):
    queryset = AvaliacaoNPS.objects.all().order_by('-criado_em')
    serializer = AvaliacaoNPSSerializer(queryset, many=True)
    return Response(serializer.data)
