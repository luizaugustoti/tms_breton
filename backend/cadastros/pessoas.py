import re

from django.utils import timezone

from .models import PessoaEmpresa


def _clean(value, max_length=255):
    return re.sub(r'\s+', ' ', str(value or '')).strip()[:max_length]


def _digits(value):
    return re.sub(r'\D', '', str(value or ''))[:14]


def inferir_tipo(documento_digits, nome=''):
    if len(documento_digits) == 11:
        return 'FISICA'
    if len(documento_digits) == 14:
        return 'JURIDICA'
    return 'JURIDICA' if re.search(r'\b(LTDA|EIRELI|S/?A|ME|EPP|CIA)\b', nome, re.I) else 'FISICA'


def _mesclar_papeis(atual, novo):
    itens = []
    for item in f'{atual},{novo}'.split(','):
        papel = item.strip().upper()
        if papel and papel not in itens:
            itens.append(papel)
    return ','.join(itens) or 'DESTINATARIO'


def upsert_pessoa(
    *,
    nome,
    documento='',
    endereco='',
    complemento='',
    numero='',
    cidade='',
    uf='',
    cep='',
    papel='DESTINATARIO',
    origem='EMISSAO',
    increment=True,
    emitido_em=None,
):
    nome = _clean(nome, 255)
    if not nome:
        return None

    documento = _clean(documento, 20)
    digits = _digits(documento)
    tipo = inferir_tipo(digits, nome)

    if digits:
        obj = PessoaEmpresa.objects.filter(documento_digits=digits).first()
    else:
        obj = PessoaEmpresa.objects.filter(nome__iexact=nome, documento_digits='').first()

    agora = emitido_em or timezone.now()

    if obj:
        if not obj.documento and documento:
            obj.documento = documento
            obj.documento_digits = digits
            obj.tipo = tipo
        if not obj.endereco and endereco:
            obj.endereco = _clean(endereco, 500)
        if not obj.complemento and complemento:
            obj.complemento = _clean(complemento, 100)
        if not obj.numero and numero:
            obj.numero = _clean(numero, 20)
        if not obj.cidade and cidade:
            obj.cidade = _clean(cidade, 100)
        if not obj.uf and uf:
            obj.uf = _clean(uf, 2).upper()
        if not obj.cep and cep:
            obj.cep = _clean(cep, 20)
        obj.papeis = _mesclar_papeis(obj.papeis, papel)
        if origem == 'EMISSAO':
            obj.origem = 'EMISSAO'
        if increment:
            obj.qtd_emissoes = (obj.qtd_emissoes or 0) + 1
            obj.ultima_emissao = agora
        elif not obj.ultima_emissao and emitido_em:
            obj.ultima_emissao = emitido_em
            if not obj.qtd_emissoes:
                obj.qtd_emissoes = 1
        obj.save()
        return obj

    return PessoaEmpresa.objects.create(
        nome=nome,
        documento=documento,
        documento_digits=digits,
        tipo=tipo,
        papeis=papel,
        endereco=_clean(endereco, 500),
        complemento=_clean(complemento, 100),
        numero=_clean(numero, 20),
        cidade=_clean(cidade, 100),
        uf=_clean(uf, 2).upper(),
        cep=_clean(cep, 20),
        origem=origem,
        qtd_emissoes=1 if increment or origem == 'EMISSAO' else 0,
        ultima_emissao=agora if origem == 'EMISSAO' else None,
    )


def registrar_pessoas_da_emissao(pedido, extras=None, increment=True):
    extras = extras or {}

    upsert_pessoa(
        nome=extras.get('remetente_nome') or getattr(pedido, 'loja', ''),
        documento=extras.get('remetente_documento', ''),
        endereco=extras.get('remetente_endereco', ''),
        complemento=extras.get('remetente_complemento', ''),
        numero=extras.get('remetente_numero', ''),
        cidade=extras.get('remetente_cidade', ''),
        uf=extras.get('remetente_uf', ''),
        papel='REMETENTE',
        increment=increment,
        emitido_em=getattr(pedido, 'criado_em', None),
    )
    upsert_pessoa(
        nome=extras.get('destinatario_nome') or getattr(pedido, 'cliente', ''),
        documento=extras.get('destinatario_documento') or getattr(pedido, 'cnpj_cpf', ''),
        endereco=extras.get('destinatario_endereco') or getattr(pedido, 'endereco', ''),
        complemento=extras.get('destinatario_complemento') or getattr(pedido, 'bairro', ''),
        numero=extras.get('destinatario_numero', ''),
        cidade=extras.get('destinatario_cidade') or getattr(pedido, 'cidade', ''),
        uf=extras.get('destinatario_uf') or getattr(pedido, 'uf', ''),
        cep=extras.get('destinatario_cep') or getattr(pedido, 'cep', ''),
        papel='DESTINATARIO',
        increment=increment,
        emitido_em=getattr(pedido, 'criado_em', None),
    )


def sincronizar_pessoas_dos_pedidos():
    from pedidos.models import Pedido

    for pedido in Pedido.objects.all().only(
        'loja', 'cliente', 'cnpj_cpf', 'endereco', 'bairro', 'cidade', 'uf', 'cep', 'criado_em'
    ).iterator():
        registrar_pessoas_da_emissao(pedido, increment=False)
