from django.db import models
from django.contrib.auth.models import AbstractUser

class Usuario(AbstractUser):
    ROLE_CHOICES = (
        ('TI', 'TI'),
        ('Admin', 'Admin'),
        ('Gestor', 'Gestor'),
        ('Gestor Operacional', 'Gestor Operacional'),
        ('Operacional', 'Operacional'),
        ('Motorista', 'Motorista'),
        ('Ajudante', 'Ajudante'),
    )
    
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='Operacional')
    telefone = models.CharField(max_length=20, blank=True, null=True)
    cpf = models.CharField(max_length=14, blank=True, null=True)
    cargo = models.CharField(max_length=100, blank=True, null=True)
    setor = models.CharField(max_length=100, blank=True, null=True)
    vinculo = models.CharField(max_length=30, blank=True, null=True)
    cnh = models.CharField(max_length=20, blank=True, null=True)
    categoria_cnh = models.CharField(max_length=3, blank=True, null=True)
    status_operacional = models.CharField(max_length=30, default='Ativo')

    def __str__(self):
        return f"{self.username} - {self.role}"
