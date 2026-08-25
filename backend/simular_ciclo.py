"""Simula o ciclo completo: cadastro → emissão → manifesto → baixa → satisfação."""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'tms_backend.settings')
django.setup()

from datetime import date, timedelta
from django.utils import timezone
from django.contrib.auth import get_user_model
from cadastros.models import Funcionario, Equipe, Veiculo
from pedidos.models import Pedido, ItemPedido
from roteirizacao.models import Rota, ParadaRota
from satisfacao.models import AvaliacaoNPS
from estoque.models import ProdutoEstoque

Usuario = get_user_model()
SENHA = 'Breton@2026'


def upsert_user(username, email, nome, role):
    user = Usuario.objects.filter(username=username).first() or Usuario.objects.filter(email=email).first()
    if not user:
        user = Usuario(username=username, email=email)
    user.username = username
    user.email = email
    user.first_name = nome
    user.role = role
    user.is_active = True
    user.is_staff = role in {'Admin', 'TI'}
    user.set_password(SENHA)
    user.save()
    return user


def upsert_funcionario(cpf, **dados):
    func = Funcionario.objects.filter(cpf=cpf).first()
    if not func:
        func = Funcionario(cpf=cpf)
    for chave, valor in dados.items():
        setattr(func, chave, valor)
    func.ativo = True
    func.status_operacional = 'Ativo'
    func.save()
    return func


def main():
    admin = upsert_user('admin', 'admin@breton.com.br', 'Administrador Breton', 'Admin')
    operacional = upsert_user('operacional.demo@breton.com.br', 'operacional.demo@breton.com.br', 'Marina Operacional', 'Operacional')
    motorista_user = upsert_user('carlos.demo@breton.com.br', 'carlos.demo@breton.com.br', 'Carlos Motorista Demo', 'Motorista')
    ajudante_user = upsert_user('ana.demo@breton.com.br', 'ana.demo@breton.com.br', 'Ana Ajudante Demo', 'Ajudante')

    motorista = upsert_funcionario(
        '111.222.333-44',
        nome='Carlos Motorista Demo',
        cargo='Motorista',
        tipo_cadastro='MOTORISTA',
        unidade='CIA DE TRANSPORTE',
        cia_transporte='CIA DE TRANSPORTE',
        telefone='(61) 98888-1001',
        celular='(61) 98888-1001',
        email='carlos.demo@breton.com.br',
        cnh='01234567890',
        categoria_cnh='D',
        vinculo='CLT',
        usuario=motorista_user,
        setor='Operações',
    )
    ajudante = upsert_funcionario(
        '555.666.777-88',
        nome='Ana Ajudante Demo',
        cargo='AJUDANTE',
        tipo_cadastro='AJUDANTE',
        unidade='CIA DE TRANSPORTE',
        telefone='(61) 97777-2002',
        celular='(61) 97777-2002',
        email='ana.demo@breton.com.br',
        vinculo='CLT',
        usuario=ajudante_user,
        setor='Operações',
    )

    equipe = Equipe.objects.filter(motorista=motorista_user).first()
    if not equipe:
        equipe = Equipe.objects.create(
            nome='Equipe Carlos Motorista Demo',
            motorista=motorista_user,
            membros_info=ajudante.nome,
            ativo=True,
        )
    else:
        equipe.ativo = True
        equipe.membros_info = ajudante.nome
        equipe.save()

    veiculo, _ = Veiculo.objects.update_or_create(
        placa='DEMO1A23',
        defaults={
            'modelo': 'Accelo 1016',
            'marca': 'Mercedes-Benz',
            'cor': 'Branco',
            'ano': 2023,
            'ano_modelo': 2024,
            'tipo_frota': 'PROPRIA',
            'tipo_veiculo': 'TRUCK',
            'categoria_frota': 'PROPRIA',
            'tipo_proprietario': 'Proprio',
            'tipo_responsavel': 'Proprio',
            'base_operacao': 'UNIDADE III',
            'unidade_proprietaria': 'UNIDADE III',
            'capacidade_peso_kg': 8000,
            'capacidade_volume_m3': 35,
            'status_operacional': 'Disponível',
            'ativo': True,
            'equipe': equipe,
            'motorista': motorista_user,
            'rastreador': '(Sem Rastreador)',
            'seguradora': 'SEM SEGURO',
        },
    )

    hoje = date.today()
    pedidos_demo = [
        {
            'numero_nota': 'DEMO-1001',
            'cliente': 'Daniele Franco Arquitetura Ltda',
            'loja': 'CASA PARK DF',
            'endereco': 'SQSW 306 Bloco B Ap. 204',
            'bairro': 'Sudoeste',
            'cidade': 'Brasília',
            'uf': 'DF',
            'cnpj_cpf': '12.345.678/0001-90',
            'status': 'Pendente',
            'item': 'Sofá Orgânico 3 lugares',
        },
        {
            'numero_nota': 'DEMO-1002',
            'cliente': 'Alexandre Moreira Silva',
            'loja': 'BRETON LAKE SUL',
            'endereco': 'SHIS QI 15 Conjunto 2 Casa 8',
            'bairro': 'Lago Sul',
            'cidade': 'Brasília',
            'uf': 'DF',
            'cnpj_cpf': '123.456.789-00',
            'status': 'Pendente',
            'item': 'Mesa de jantar mármore',
        },
    ]

    pedidos = []
    for dados in pedidos_demo:
        item_desc = dados.pop('item')
        pedido, _ = Pedido.objects.update_or_create(
            numero_nota=dados['numero_nota'],
            defaults={
                **dados,
                'tipo_operacao': 'ENTREGA',
                'data_entrega': hoje.strftime('%d/%m/%Y'),
                'periodo': 'MANHÃ',
                'peso_total': 80,
                'volume_total': 2,
                'motorista': motorista_user,
                'veiculo': veiculo,
            },
        )
        produto, _ = ProdutoEstoque.objects.get_or_create(
            codigo_sku=pedido.numero_nota,
            defaults={'nome': item_desc, 'quantidade': 10, 'unidade': 'UN'},
        )
        pedido.itens.all().delete()
        ItemPedido.objects.create(
            pedido=pedido,
            produto=produto,
            codigo=pedido.numero_nota,
            etiqueta=pedido.numero_nota,
            descricao=item_desc,
            quantidade=1,
            unidade='UN',
        )
        pedidos.append(pedido)

    Rota.objects.filter(codigo__startswith='MF-DEMO-').delete()
    rota = Rota.objects.create(
        codigo=f"MF-DEMO-{hoje.strftime('%Y%m%d')}",
        data_rota=hoje,
        veiculo=veiculo,
        equipe=equipe,
        motorista=motorista_user,
        ajudante=ajudante_user,
        status='EM_ANDAMENTO',
        observacoes='Manifesto de demonstração do ciclo completo.',
    )
    for idx, pedido in enumerate(pedidos, start=1):
        ParadaRota.objects.filter(pedido=pedido).delete()
        ParadaRota.objects.create(rota=rota, pedido=pedido, sequencia=idx, status='PENDENTE')
        pedido.status = 'Em Rota'
        pedido.motorista = motorista_user
        pedido.veiculo = veiculo
        pedido.save(update_fields=['status', 'motorista', 'veiculo'])

    parada1 = rota.paradas.get(pedido=pedidos[0])
    agora = timezone.now()
    parada1.status = 'ENTREGA_REALIZADA'
    parada1.saida_entrega = agora - timedelta(hours=3)
    parada1.chegada_cliente = agora - timedelta(hours=2)
    parada1.inicio_descarregamento = agora - timedelta(hours=1)
    parada1.finalizado = agora
    parada1.recebedor = 'Daniele Franco'
    parada1.documento_recebedor = '123.456.789-00'
    parada1.observacoes_entrega = 'Entrega concluída na simulação do ciclo.'
    parada1.save()
    pedidos[0].status = 'Entregue'
    pedidos[0].save(update_fields=['status'])

    AvaliacaoNPS.objects.filter(pedido=pedidos[0]).delete()
    AvaliacaoNPS.objects.create(
        pedido=pedidos[0],
        cliente=pedidos[0].cliente,
        nota=10,
        comentario='Entrega pontual e equipe atenciosa. Cliente gostou.',
        cliente_gostou=True,
    )

    print('CICLO_OK')
    print(f'ADMIN {admin.username} / {SENHA}')
    print(f'OPERACIONAL {operacional.username} / {SENHA}')
    print(f'MOTORISTA {motorista_user.username} / {SENHA} id={motorista_user.id} func={motorista.id}')
    print(f'AJUDANTE {ajudante_user.username} / {SENHA}')
    print(f'VEICULO {veiculo.placa} id={veiculo.id}')
    print(f'ROTA {rota.codigo} id={rota.id} motorista={rota.motorista_id}')
    print(f'PEDIDOS {[p.numero_nota for p in pedidos]}')
    print(f'PARADAS {list(rota.paradas.values_list("id", "pedido__numero_nota", "status"))}')


if __name__ == '__main__':
    main()
