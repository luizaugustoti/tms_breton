from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('pedidos', '0004_pedido_tipo_operacao'),
    ]

    operations = [
        migrations.CreateModel(
            name='PedidoHistorico',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tipo', models.CharField(choices=[
                    ('CRIACAO', 'Criação'), ('STATUS', 'Status'),
                    ('ALOCACAO', 'Alocação'), ('ROTEIRIZACAO', 'Roteirização'),
                    ('ALTERACAO', 'Alteração'), ('EVIDENCIA', 'Evidência'),
                ], max_length=20)),
                ('descricao', models.CharField(max_length=255)),
                ('status_anterior', models.CharField(blank=True, max_length=50, null=True)),
                ('status_novo', models.CharField(blank=True, max_length=50, null=True)),
                ('dados', models.JSONField(blank=True, default=dict)),
                ('ocorrido_em', models.DateTimeField(auto_now_add=True)),
                ('pedido', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='historico', to='pedidos.pedido')),
            ],
            options={'ordering': ['-ocorrido_em', '-id']},
        ),
        migrations.AddIndex(
            model_name='pedidohistorico',
            index=models.Index(fields=['pedido', '-ocorrido_em'], name='pedidos_ped_pedido__754f5f_idx'),
        ),
    ]
