from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import CustomTokenObtainPairView

urlpatterns = [
    # Rota de login que retorna token + dados do usuário
    path('login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    
    # Rota para refresh token
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]
