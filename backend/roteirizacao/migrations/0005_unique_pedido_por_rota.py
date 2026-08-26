from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('roteirizacao', '0004_rota_motorista_ajudante'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='paradarota',
            constraint=models.UniqueConstraint(
                fields=('rota', 'pedido'),
                name='unique_pedido_por_rota',
            ),
        ),
    ]
