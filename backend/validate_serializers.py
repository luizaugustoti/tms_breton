import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.urls import resolve
from cadastros.serializers import FuncionarioSerializer, VeiculoSerializer
from estoque.serializers import ProdutoEstoqueSerializer

paths = ['/api/v1/cadastros/funcionarios/', '/api/v1/cadastros/veiculos/', '/api/v1/estoque/produtos/']
print('=== URL RESOLUTION ===')
for path in paths:
    match = resolve(path)
    view_name = match.func.__name__ if hasattr(match.func, '__name__') else match.func.__class__.__name__
    print(f'Path: {path} -> View: {view_name}')

print('\n=== SERIALIZER VALIDATION ===')

# 1. FuncionarioSerializer Representative payload
func_payload = {
    'first_name': 'João',
    'last_name': 'Silva',
    'email': 'joao.silva@example.com',
    'cpf': '123.456.789-00',
    'role': 'Motorista',
    'telefone': '(11) 98765-4321',
    'cargo': 'Motorista Carreteiro',
    'setor': 'Logística',
    'vinculo': 'CLT',
    'cnh': '12345678901',
    'categoria_cnh': 'D',
    'status_operacional': 'Ativo',
    'password': 'Mudar@Password123'
}
s_func = FuncionarioSerializer(data=func_payload)
is_valid_func = s_func.is_valid()
print(f'FuncionarioSerializer is_valid: {is_valid_func}')
if not is_valid_func:
    print(f'FuncionarioSerializer Errors: {s_func.errors}')

# 2. VeiculoSerializer Representative payload
veic_payload = {
    'placa': 'ABC1D23',
    'modelo': 'Constellation 24.280',
    'capacidade_kg': 15000.0,
    'capacidade_m3': 40.0,
    'tipo_equipamento': 'Truck',
    'marca': 'Volkswagen',
    'ano': 2020,
    'capacidade_peso_kg': 15000.0,
    'capacidade_volume_m3': 40.0,
    'status_operacional': 'Disponível',
    'observacao': 'Sem observações.'
}
s_veic = VeiculoSerializer(data=veic_payload)
is_valid_veic = s_veic.is_valid()
print(f'VeiculoSerializer is_valid: {is_valid_veic}')
if not is_valid_veic:
    print(f'VeiculoSerializer Errors: {s_veic.errors}')

# 3. ProdutoEstoqueSerializer Representative payload
prod_payload = {
    'codigo': 'SKU-BRETON-001',
    'descricao': 'Mesa de Jantar Breton Wood',
    'categoria': 'Móveis',
    'quantidade': 10,
    'localizacao': 'Setor B - Corredor 3',
    'peso_unitario': 45.5,
    'valor_unitario': 1500.00,
    'dimensao': '2.00x1.00x0.75m',
    'peso_kg': 45.5,
    'unidade': 'UN',
    'etiqueta': 'ET-001',
    'observacao': 'Produto frágil.'
}
s_prod = ProdutoEstoqueSerializer(data=prod_payload)
is_valid_prod = s_prod.is_valid()
print(f'ProdutoEstoqueSerializer is_valid: {is_valid_prod}')
if not is_valid_prod:
    print(f'ProdutoEstoqueSerializer Errors: {s_prod.errors}')