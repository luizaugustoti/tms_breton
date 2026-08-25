import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('roteirizacao', '0003_alter_rota_equipe_alter_rota_veiculo'),
    ]

    operations = [
        migrations.AddField(
            model_name='rota',
            name='motorista',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='rotas_como_motorista',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Motorista',
            ),
        ),
        migrations.AddField(
            model_name='rota',
            name='ajudante',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='rotas_como_ajudante',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Ajudante',
            ),
        ),
    ]
