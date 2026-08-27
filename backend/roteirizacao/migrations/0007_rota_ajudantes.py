from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('cadastros', '0010_equipe_membros'),
        ('roteirizacao', '0006_rota_manifesto_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='rota',
            name='ajudantes',
            field=models.ManyToManyField(
                blank=True,
                related_name='rotas_como_ajudante',
                to='cadastros.funcionario',
                verbose_name='Ajudantes',
            ),
        ),
    ]
