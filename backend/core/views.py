from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import CustomTokenObtainPairSerializer

class CustomTokenObtainPairView(TokenObtainPairView):
    # View customizada que usa o nosso serializer
    serializer_class = CustomTokenObtainPairSerializer
