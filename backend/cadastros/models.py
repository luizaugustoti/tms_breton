from django.db import models
from django.conf import settings

class Funcionario(models.Model):
    usuario = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='funcionario',
        verbose_name='Usuário do Sistema'
    )
    nome = models.CharField(max_length=200, verbose_name='Nome completo')
    cpf = models.CharField(max_length=14, unique=True, null=True, blank=True, verbose_name='CPF')
    cargo = models.CharField(max_length=100, blank=True, default='', verbose_name='Cargo ocupacional')
    setor = models.CharField(max_length=100, blank=True, default='', verbose_name='Setor')
    telefone = models.CharField(max_length=20, blank=True, default='', verbose_name='Telefone')
    email = models.EmailField(blank=True, default='', verbose_name='E-mail')
    vinculo = models.CharField(max_length=30, blank=True, default='CLT', verbose_name='Vínculo')
    cnh = models.CharField(max_length=20, blank=True, default='', verbose_name='Habilitação (CNH)')
    categoria_cnh = models.CharField(max_length=10, blank=True, default='', verbose_name='Categoria da CNH')
    status_operacional = models.CharField(max_length=30, default='Ativo', verbose_name='Status operacional')
    ativo = models.BooleanField(default=True, verbose_name='Ativo')

    unidade = models.CharField(max_length=120, blank=True, default='CIA DE TRANSPORTE')
    cia_transporte = models.CharField(max_length=120, blank=True, default='CIA DE TRANSPORTE')
    tipo_cadastro = models.CharField(max_length=40, blank=True, default='')
    cep = models.CharField(max_length=10, blank=True, default='')
    endereco = models.CharField(max_length=255, blank=True, default='')
    numero = models.CharField(max_length=20, blank=True, default='')
    bairro = models.CharField(max_length=120, blank=True, default='')
    cidade = models.CharField(max_length=120, blank=True, default='')
    celular = models.CharField(max_length=20, blank=True, default='')
    nextel_numero = models.CharField(max_length=30, blank=True, default='')
    nextel_id = models.CharField(max_length=30, blank=True, default='')
    complemento = models.CharField(max_length=255, blank=True, default='')

    titulo_eleitor = models.CharField(max_length=20, blank=True, default='')
    titulo_data_emissao = models.DateField(null=True, blank=True)
    titulo_zona = models.CharField(max_length=10, blank=True, default='')
    titulo_secao = models.CharField(max_length=10, blank=True, default='')
    ctps_numero = models.CharField(max_length=20, blank=True, default='')
    ctps_data_emissao = models.DateField(null=True, blank=True)
    ctps_serie = models.CharField(max_length=10, blank=True, default='')
    ctps_orgao_expedidor = models.CharField(max_length=30, blank=True, default='')

    rg = models.CharField(max_length=20, blank=True, default='')
    rg_orgao_expedidor = models.CharField(max_length=20, blank=True, default='')
    rg_data_emissao = models.DateField(null=True, blank=True)
    cnh_data_primeira = models.DateField(null=True, blank=True)
    cnh_codigo_seguranca = models.CharField(max_length=20, blank=True, default='')
    cnh_validade = models.DateField(null=True, blank=True)
    cnh_data_emissao = models.DateField(null=True, blank=True)
    cnh_uf = models.CharField(max_length=2, blank=True, default='')
    pis_pasep = models.CharField(max_length=20, blank=True, default='')

    banco = models.CharField(max_length=80, blank=True, default='BANCO BRADESCO S/A')
    tipo_conta = models.CharField(max_length=30, blank=True, default='')
    agencia = models.CharField(max_length=20, blank=True, default='')
    conta_numero = models.CharField(max_length=30, blank=True, default='')
    pix_tipo = models.CharField(max_length=20, blank=True, default='')
    pix_chave = models.CharField(max_length=120, blank=True, default='')

    salario_base = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    alimentacao = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    vale_transporte = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    convenio = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    inss = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    desconto_total = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    status_seguradora = models.CharField(max_length=40, blank=True, default='Nao cadastrado')
    validade_seguradora = models.DateField(null=True, blank=True)
    autorizacao_seguradora = models.CharField(max_length=120, blank=True, default='')
    data_autorizacao_seguradora = models.DateField(null=True, blank=True)
    memo = models.TextField(blank=True, default='')

    admissao = models.DateField(null=True, blank=True)
    matricula = models.CharField(max_length=30, blank=True, default='')
    data_nascimento = models.DateField(null=True, blank=True)
    escolaridade = models.CharField(max_length=40, blank=True, default='')
    municipio_nascimento = models.CharField(max_length=120, blank=True, default='')
    nome_mae = models.CharField(max_length=200, blank=True, default='')
    nome_pai = models.CharField(max_length=200, blank=True, default='')
    companheira = models.CharField(max_length=200, blank=True, default='')
    estado_civil = models.CharField(max_length=30, blank=True, default='')
    exame_toxicologico = models.CharField(max_length=30, blank=True, default='NÃO APLICAVEL')
    dependentes = models.JSONField(default=list, blank=True)

    class Meta:
        verbose_name = 'Funcionário'
        verbose_name_plural = 'Funcionários'

    def __str__(self):
        return self.nome or (self.usuario.username if self.usuario else 'Funcionário sem nome')


class Equipe(models.Model):
    nome = models.CharField(max_length=100, unique=True, verbose_name="Nome da Equipe")
    motorista = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='equipes_como_motorista',
        verbose_name="Motorista Principal"
    )
    membros_info = models.TextField(blank=True, default='', verbose_name="Membros/Ajudantes")
    membros = models.ManyToManyField(
        'Funcionario',
        blank=True,
        related_name='equipes_como_ajudante',
        verbose_name='Membros/Ajudantes',
    )
    ativo = models.BooleanField(default=True)

    def __str__(self):
        return self.nome

class Veiculo(models.Model):
    placa = models.CharField(max_length=10, unique=True)
    modelo = models.CharField(max_length=100)
    capacidade_kg = models.FloatField(null=True, blank=True)
    capacidade_m3 = models.FloatField(null=True, blank=True)
    ativo = models.BooleanField(default=True)
    tipo_equipamento = models.CharField(max_length=100, blank=True, default='')
    marca = models.CharField(max_length=100, blank=True, default='')
    ano = models.PositiveIntegerField(null=True, blank=True)
    capacidade_peso_kg = models.FloatField(null=True, blank=True)
    capacidade_volume_m3 = models.FloatField(null=True, blank=True)
    status_operacional = models.CharField(max_length=30, default='Disponível')
    tipo_frota = models.CharField(
        max_length=20,
        choices=(('PROPRIA', 'Frota Própria'), ('TERCEIRO', 'Terceiros')),
        default='PROPRIA',
        verbose_name='Tipo de frota',
    )
    observacao = models.TextField(blank=True, default='')
    equipe = models.ForeignKey(
        Equipe, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='veiculos'
    )
    ano_modelo = models.PositiveIntegerField(null=True, blank=True)
    renavam = models.CharField(max_length=20, blank=True, default='')
    cor = models.CharField(max_length=40, blank=True, default='')
    data_compra = models.DateField(null=True, blank=True)
    tara = models.FloatField(null=True, blank=True)
    tipo_carroceria = models.CharField(max_length=60, blank=True, default='Não Aplicável')
    cidade_emplacada = models.CharField(max_length=120, blank=True, default='')
    uf_emplacada = models.CharField(max_length=2, blank=True, default='')
    tipo_rodado = models.CharField(max_length=60, blank=True, default='Nao aplicavel')
    certificado_cronotacografo = models.CharField(max_length=80, blank=True, default='')
    medidas_rodado = models.CharField(max_length=80, blank=True, default='')
    consumo_km_litro = models.FloatField(null=True, blank=True)
    km_maximo_rota = models.FloatField(null=True, blank=True)
    capacidade_tanque_litros = models.FloatField(null=True, blank=True)
    base_operacao = models.CharField(max_length=80, blank=True, default='UNIDADE III')
    tipo_veiculo = models.CharField(max_length=60, blank=True, default='')
    categoria_frota = models.CharField(max_length=60, blank=True, default='')
    seguradora = models.CharField(max_length=80, blank=True, default='SEM SEGURO')
    vigencia = models.DateField(null=True, blank=True)
    gerenciadora = models.CharField(max_length=80, blank=True, default='')
    id_rastreador = models.CharField(max_length=60, blank=True, default='')
    codigo_analise_gerenciadora = models.CharField(max_length=60, blank=True, default='')
    rastreador = models.CharField(max_length=80, blank=True, default='(Sem Rastreador)')
    status_seguradora = models.CharField(max_length=40, blank=True, default='Nao cadastrado')
    validade_seguradora = models.DateField(null=True, blank=True)
    antt = models.CharField(max_length=40, blank=True, default='')
    data_venda = models.DateField(null=True, blank=True)
    validade_antt = models.DateField(null=True, blank=True)
    travas_portas_bau = models.PositiveIntegerField(null=True, blank=True, default=0)
    chassi = models.CharField(max_length=40, blank=True, default='')
    validade_licenciamento = models.DateField(null=True, blank=True)
    eixos = models.PositiveIntegerField(null=True, blank=True)
    vencimento_ipva = models.DateField(null=True, blank=True)
    valor_licenciamento = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    validade_checklist = models.DateField(null=True, blank=True)
    tipo_responsavel = models.CharField(max_length=40, blank=True, default='Proprio')
    unidade_proprietaria = models.CharField(max_length=80, blank=True, default='UNIDADE III')
    tipo_proprietario = models.CharField(max_length=40, blank=True, default='Proprio')
    financiamento = models.CharField(max_length=40, blank=True, default='Nenhum')
    instituicao_financeira = models.CharField(max_length=80, blank=True, default='')
    tipo = models.CharField(max_length=40, blank=True, default='')
    motorista = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='veiculos_como_motorista',
    )
    tabela = models.CharField(max_length=40, blank=True, default='NAO APLICAVEL')
    valor_por_entrega = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    primeira_do_dia_diferente = models.BooleanField(default=False)
    valor_por_km = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    percentual_frete = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    valor_por_diaria = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    itens_adicionais = models.JSONField(default=list, blank=True)
    anexos = models.JSONField(default=list, blank=True)
    def __str__(self):
        return f"{self.modelo} - {self.placa}"


class PessoaEmpresa(models.Model):
    TIPO_CHOICES = (
        ('FISICA', 'Pessoa Física'),
        ('JURIDICA', 'Pessoa Jurídica'),
    )
    ORIGEM_CHOICES = (
        ('EMISSAO', 'Emissão'),
        ('MANUAL', 'Manual'),
    )

    nome = models.CharField(max_length=255)
    documento = models.CharField(max_length=20, blank=True, default='')
    documento_digits = models.CharField(max_length=14, blank=True, default='', db_index=True)
    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES, default='JURIDICA')
    papeis = models.CharField(max_length=80, default='DESTINATARIO')
    endereco = models.CharField(max_length=500, blank=True, default='')
    complemento = models.CharField(max_length=100, blank=True, default='')
    numero = models.CharField(max_length=20, blank=True, default='')
    cidade = models.CharField(max_length=100, blank=True, default='')
    uf = models.CharField(max_length=2, blank=True, default='')
    cep = models.CharField(max_length=20, blank=True, default='')
    origem = models.CharField(max_length=20, choices=ORIGEM_CHOICES, default='EMISSAO')
    qtd_emissoes = models.PositiveIntegerField(default=0)
    ultima_emissao = models.DateTimeField(null=True, blank=True)
    ativo = models.BooleanField(default=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Empresa / Pessoa'
        verbose_name_plural = 'Empresas / Pessoas'
        ordering = ['nome']

    def __str__(self):
        return self.nome
