from django.urls import path
from . import views

urlpatterns = [
    path('metrics/', views.get_metrics, name='metrics'),
    path('dashboard/', views.get_metrics, name='dashboard-legacy'),
]
