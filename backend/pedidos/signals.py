from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .models import Pedido, PedidoHistorico

_TRACKED_FIELDS = (
    'veiculo_id', 'motorista_id', 'data_entrega', 'periodo',
    'placa_veiculo', 'observacao', 'assinatura_base64', 'foto_entrega_base64',
)


def _ref(value):
    return value if value is not None else None


@receiver(pre_save, sender=Pedido)
def pedido_before_save(sender, instance, **kwargs):
    if not instance.pk:
        instance._historico_anterior = None
        return
    instance._historico_anterior = sender.objects.filter(pk=instance.pk).values(
        'status', *_TRACKED_FIELDS
    ).first()


@receiver(post_save, sender=Pedido)
def pedido_after_save(sender, instance, created, **kwargs):
    if created:
        PedidoHistorico.objects.create(
            pedido=instance, tipo='CRIACAO', descricao='Pedido criado',
            status_novo=instance.status,
        )
        return
    anterior = getattr(instance, '_historico_anterior', None)
    if not anterior:
        return
    if anterior['status'] != instance.status:
        PedidoHistorico.objects.create(
            pedido=instance, tipo='STATUS',
            descricao=f"Status alterado de {anterior['status']} para {instance.status}",
            status_anterior=anterior['status'], status_novo=instance.status,
        )
    alocacao = {
        campo: (anterior.get(campo), _ref(getattr(instance, campo)))
        for campo in ('veiculo_id', 'motorista_id')
        if anterior.get(campo) != getattr(instance, campo)
    }
    if alocacao:
        PedidoHistorico.objects.create(
            pedido=instance, tipo='ALOCACAO',
            descricao='Alocação do pedido alterada', dados=alocacao,
        )
    alteracoes = {
        campo: (anterior.get(campo), _ref(getattr(instance, campo)))
        for campo in _TRACKED_FIELDS
        if campo not in ('veiculo_id', 'motorista_id')
        and anterior.get(campo) != getattr(instance, campo)
    }
    if alteracoes:
        evidencias = {
            campo: (bool(old), bool(new))
            for campo, (old, new) in alteracoes.items()
            if campo in ('assinatura_base64', 'foto_entrega_base64')
        }
        dados = {
            campo: value for campo, value in alteracoes.items()
            if campo not in ('assinatura_base64', 'foto_entrega_base64')
        }
        if evidencias:
            PedidoHistorico.objects.create(
                pedido=instance, tipo='EVIDENCIA',
                descricao='Evidência do pedido alterada', dados=evidencias,
            )
        if dados:
            PedidoHistorico.objects.create(
                pedido=instance, tipo='ALTERACAO',
                descricao='Dados relevantes do pedido alterados', dados=dados,
            )


def _parada_dados(parada):
    return {
        'rota_id': parada.rota_id,
        'sequencia': parada.sequencia,
        'status': parada.status,
        'timestamps': {
            campo: getattr(parada, campo).isoformat()
            for campo in (
                'saida_entrega', 'chegada_cliente',
                'inicio_descarregamento', 'finalizado',
            )
            if getattr(parada, campo, None)
        },
    }


@receiver(pre_save, sender='roteirizacao.ParadaRota')
def parada_before_save(sender, instance, **kwargs):
    if instance.pk:
        instance._historico_anterior = sender.objects.filter(pk=instance.pk).first()


@receiver(post_save, sender='roteirizacao.ParadaRota')
def parada_after_save(sender, instance, created, **kwargs):
    anterior = getattr(instance, '_historico_anterior', None)
    if created:
        descricao = 'Pedido alocado em uma rota'
        dados = _parada_dados(instance)
    elif anterior and (
        anterior.status != instance.status
        or anterior.rota_id != instance.rota_id
        or anterior.sequencia != instance.sequencia
    ):
        descricao = 'Roteirização do pedido alterada'
        dados = {'anterior': _parada_dados(anterior), 'novo': _parada_dados(instance)}
    else:
        return
    PedidoHistorico.objects.create(
        pedido_id=instance.pedido_id, tipo='ROTEIRIZACAO',
        descricao=descricao, dados=dados,
        status_anterior=getattr(anterior, 'status', None),
        status_novo=instance.status,
    )


@receiver(post_delete, sender='roteirizacao.ParadaRota')
def parada_after_delete(sender, instance, **kwargs):
    PedidoHistorico.objects.create(
        pedido_id=instance.pedido_id, tipo='ROTEIRIZACAO',
        descricao='Pedido removido da rota',
        dados={'rota_id': instance.rota_id, 'sequencia': instance.sequencia},
        status_anterior=instance.status,
    )
