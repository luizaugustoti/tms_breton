from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('cadastros', '0004_veiculo_equipe'),
        ('roteirizacao', '0005_unique_pedido_por_rota'),
    ]

    operations = [
        migrations.AddField(
            model_name='rota',
            name='chegada_prevista',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Chegada Prevista'),
        ),
        migrations.AddField(
            model_name='rota',
            name='gerenciadora',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='Gerenciadora'),
        ),
        migrations.AddField(
            model_name='rota',
            name='km_final',
            field=models.PositiveIntegerField(default=0, verbose_name='KM Final'),
        ),
        migrations.AddField(
            model_name='rota',
            name='km_inicial',
            field=models.PositiveIntegerField(default=0, verbose_name='KM Inicial'),
        ),
        migrations.AddField(
            model_name='rota',
            name='saida_prevista',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Saída Prevista'),
        ),
        migrations.AddField(
            model_name='rota',
            name='semireboque',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='rotas_como_semireboque',
                to='cadastros.veiculo',
                verbose_name='Semirreboque',
            ),
        ),
        migrations.AddField(
            model_name='rota',
            name='unidade_emissora',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='Unidade Emissora'),
        ),
    ]
