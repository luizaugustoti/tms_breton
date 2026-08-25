from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pedidos', '0003_alter_pedido_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='pedido',
            name='tipo_operacao',
            field=models.CharField(
                choices=[
                    ('ENTREGA', 'Entrega'),
                    ('COLETA', 'Coleta'),
                    ('TRANSFERENCIA', 'Transferência'),
                ],
                default='ENTREGA',
                max_length=20,
                verbose_name='Tipo de operação',
            ),
        ),
    ]
