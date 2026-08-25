from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('satisfacao', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='avaliacaonps',
            name='cliente_gostou',
            field=models.BooleanField(blank=True, null=True, verbose_name='Cliente gostou'),
        ),
    ]
