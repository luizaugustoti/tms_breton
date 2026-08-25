from django.contrib import admin
from django.urls import path, include, re_path
from django.views.static import serve
from django.conf import settings

urlpatterns = [
    path('admin/', admin.site.urls),
    # Rotas do app core (inclui rotas de auth)
    path('api/v1/auth/', include('core.urls')),
    
    # Rotas do app pedidos
    path('api/v1/pedidos/', include('pedidos.urls')),
    
    # Rotas de Cadastros e Estoque
    path('api/v1/cadastros/', include('cadastros.urls')),
    path('api/v1/estoque/', include('estoque.urls')),
    
    # Rotas adicionais (Roteirização, Indicadores, Satisfação)
    path('api/v1/roteirizacao/', include('roteirizacao.urls')),
    path('api/v1/indicadores/', include('indicadores.urls')),
    path('api/v1/satisfacao/', include('satisfacao.urls')),

    # Telas do TMS (HTML/CSS/JS) no mesmo processo da API
    # Tambem atende /frontend/... quando o Django e a URL publica do Apache.
    path('frontend/', serve, {
        'document_root': settings.FRONTEND_DIR,
        'path': 'index.html',
    }),
    re_path(r'^frontend/(?P<path>.+)$', serve, {
        'document_root': settings.FRONTEND_DIR,
        'show_indexes': False,
    }),
    path('', serve, {
        'document_root': settings.FRONTEND_DIR,
        'path': 'index.html',
    }),
    re_path(r'^(?P<path>.+)$', serve, {
        'document_root': settings.FRONTEND_DIR,
        'show_indexes': False,
    }),
]
