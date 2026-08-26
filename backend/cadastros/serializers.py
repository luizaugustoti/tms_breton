from rest_framework import serializers
from .models import Veiculo, Equipe, Funcionario, PessoaEmpresa
from django.contrib.auth import get_user_model
from core.permissions import normalize_role

Usuario = get_user_model()

class PessoaEmpresaSerializer(serializers.ModelSerializer):
    tipo_label = serializers.SerializerMethodField(read_only=True)
    papeis_label = serializers.SerializerMethodField(read_only=True)
    origem_label = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PessoaEmpresa
        fields = [
            'id', 'nome', 'documento', 'documento_digits', 'tipo', 'tipo_label', 'papeis', 'papeis_label',
            'endereco', 'complemento', 'numero', 'cidade', 'uf', 'cep',
            'origem', 'origem_label', 'qtd_emissoes', 'ultima_emissao', 'ativo',
            'criado_em', 'atualizado_em',
        ]
        read_only_fields = ['id', 'documento_digits', 'tipo_label', 'papeis_label', 'origem_label', 'criado_em', 'atualizado_em']

    def get_tipo_label(self, obj):
        return 'Pessoa Física' if obj.tipo == 'FISICA' else 'Pessoa Jurídica'

    def get_papeis_label(self, obj):
        labels = {
            'REMETENTE': 'Remetente',
            'DESTINATARIO': 'Destinatário',
        }
        return ', '.join(labels.get(p.strip(), p) for p in (obj.papeis or '').split(',') if p.strip())

    def get_origem_label(self, obj):
        return 'Emissão' if obj.origem == 'EMISSAO' else 'Manual'

    def validate(self, attrs):
        from .pessoas import _clean, _digits, inferir_tipo

        nome = _clean(attrs.get('nome') or getattr(self.instance, 'nome', ''), 255)
        if not nome:
            raise serializers.ValidationError({'nome': 'Informe o nome da pessoa ou empresa.'})
        attrs['nome'] = nome
        documento = _clean(attrs.get('documento', getattr(self.instance, 'documento', '')), 20)
        attrs['documento'] = documento
        digits = _digits(documento)
        if 'tipo' not in attrs or not attrs.get('tipo'):
            attrs['tipo'] = inferir_tipo(digits, nome)
        if attrs.get('uf'):
            attrs['uf'] = _clean(attrs['uf'], 2).upper()
        if not self.instance:
            attrs.setdefault('origem', 'MANUAL')
        self._documento_digits = digits
        return attrs

    def create(self, validated_data):
        validated_data['documento_digits'] = getattr(self, '_documento_digits', '')
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if hasattr(self, '_documento_digits'):
            validated_data['documento_digits'] = self._documento_digits
        return super().update(instance, validated_data)


class EquipeSerializer(serializers.ModelSerializer):
    motorista_nome = serializers.SerializerMethodField(read_only=True)
    membros_nomes = serializers.SerializerMethodField(read_only=True)
    membros = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Funcionario.objects.filter(ativo=True),
        required=False,
    )

    class Meta:
        model = Equipe
        fields = ['id', 'nome', 'motorista', 'motorista_nome', 'membros', 'membros_nomes', 'membros_info', 'ativo']

    def get_motorista_nome(self, obj):
        if obj.motorista:
            return f"{obj.motorista.first_name} {obj.motorista.last_name}".strip() or obj.motorista.username
        return None

    def get_membros_nomes(self, obj):
        return list(obj.membros.order_by('nome').values_list('nome', flat=True))

    def validate(self, attrs):
        membros = attrs.get('membros')
        if membros is None and self.instance is not None:
            membros = list(self.instance.membros.all())
        if len(membros or []) < 2:
            raise serializers.ValidationError({
                'membros': 'A equipe deve ter pelo menos dois ajudantes.'
            })
        return attrs

    def _atualizar_membros_info(self, validated_data):
        membros = validated_data.get('membros')
        if membros is not None:
            validated_data['membros_info'] = ', '.join(membro.nome for membro in membros)

    def create(self, validated_data):
        self._atualizar_membros_info(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        self._atualizar_membros_info(validated_data)
        return super().update(instance, validated_data)
        
VEICULO_DATE_FIELDS = (
    'data_compra', 'vigencia', 'validade_seguradora', 'data_venda', 'validade_antt',
    'validade_licenciamento', 'vencimento_ipva', 'validade_checklist',
)
VEICULO_NUMBER_FIELDS = (
    'ano', 'ano_modelo', 'capacidade_kg', 'capacidade_m3', 'capacidade_peso_kg',
    'capacidade_volume_m3', 'tara', 'consumo_km_litro', 'km_maximo_rota',
    'capacidade_tanque_litros', 'travas_portas_bau', 'eixos', 'valor_licenciamento',
    'valor_por_entrega', 'valor_por_km', 'percentual_frete', 'valor_por_diaria',
    'motorista', 'equipe',
)


class VeiculoSerializer(serializers.ModelSerializer):
    motorista_nome = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Veiculo
        fields = '__all__'

    def get_motorista_nome(self, obj):
        if not obj.motorista:
            return ''
        nome = f"{obj.motorista.first_name} {obj.motorista.last_name}".strip()
        return nome or obj.motorista.username

    def to_internal_value(self, data):
        payload = data.copy() if hasattr(data, 'copy') else dict(data)
        for field in VEICULO_DATE_FIELDS + VEICULO_NUMBER_FIELDS:
            if payload.get(field) == '':
                payload[field] = None
        for field in ('itens_adicionais', 'anexos'):
            if payload.get(field) in ('', None):
                payload[field] = []
        if payload.get('primeira_do_dia_diferente') in ('', None):
            payload['primeira_do_dia_diferente'] = False
        return super().to_internal_value(payload)

    def validate_placa(self, value):
        placa = value.strip().upper()
        if not placa:
            raise serializers.ValidationError('A placa é obrigatória.')
        return placa

    def validate(self, attrs):
        capacidade = attrs.get('capacidade_peso_kg', attrs.get('capacidade_kg'))
        if capacidade is not None and capacidade < 0:
            raise serializers.ValidationError({'capacidade_peso_kg': 'A capacidade não pode ser negativa.'})
        if attrs.get('ano') is None and attrs.get('ano_modelo') is None:
            pass
        return attrs

    def create(self, validated_data):
        if not validated_data.get('ano') and validated_data.get('ano_modelo'):
            validated_data['ano'] = validated_data['ano_modelo']
        if validated_data.get('tipo_proprietario', '').lower() == 'terceiro':
            validated_data['tipo_frota'] = 'TERCEIRO'
        elif validated_data.get('tipo_proprietario'):
            validated_data['tipo_frota'] = 'PROPRIA'
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if validated_data.get('tipo_proprietario', '').lower() == 'terceiro':
            validated_data['tipo_frota'] = 'TERCEIRO'
        elif validated_data.get('tipo_proprietario'):
            validated_data['tipo_frota'] = 'PROPRIA'
        return super().update(instance, validated_data)

FUNCIONARIO_DATE_FIELDS = (
    'titulo_data_emissao', 'ctps_data_emissao', 'rg_data_emissao', 'cnh_data_primeira',
    'cnh_validade', 'cnh_data_emissao', 'validade_seguradora', 'data_autorizacao_seguradora',
    'admissao', 'data_nascimento',
)
FUNCIONARIO_DECIMAL_FIELDS = (
    'salario_base', 'alimentacao', 'vale_transporte', 'convenio', 'inss', 'desconto_total',
)


class FuncionarioSerializer(serializers.ModelSerializer):
    first_name = serializers.SerializerMethodField(read_only=True)
    last_name = serializers.SerializerMethodField(read_only=True)
    email_acesso = serializers.SerializerMethodField(read_only=True)
    role = serializers.SerializerMethodField(read_only=True)
    usuario_id = serializers.IntegerField(source='usuario.id', read_only=True, allow_null=True)
    username = serializers.SerializerMethodField(read_only=True)
    dependentes = serializers.JSONField(required=False)

    class Meta:
        model = Funcionario
        fields = '__all__'
        read_only_fields = ['usuario', 'usuario_id', 'first_name', 'last_name', 'email_acesso', 'role', 'username']

    def get_first_name(self, obj):
        if not obj.nome:
            return ''
        return obj.nome.split()[0] if obj.nome.split() else ''

    def get_last_name(self, obj):
        if not obj.nome:
            return ''
        partes = obj.nome.split()
        return ' '.join(partes[1:]) if len(partes) > 1 else ''

    def get_email_acesso(self, obj):
        if obj.usuario and obj.usuario.email:
            return obj.usuario.email
        return obj.email or ''

    def to_internal_value(self, data):
        payload = data.copy() if hasattr(data, 'copy') else dict(data)
        for field in FUNCIONARIO_DATE_FIELDS + FUNCIONARIO_DECIMAL_FIELDS:
            if payload.get(field) == '':
                payload[field] = None
        if payload.get('dependentes') in ('', None):
            payload['dependentes'] = []
        return super().to_internal_value(payload)

    def get_role(self, obj):
        if obj.usuario:
            return obj.usuario.role
        return 'Operacional'

    def get_username(self, obj):
        if obj.usuario:
            return obj.usuario.username
        return obj.email or obj.cpf or ''

    def validate(self, attrs):
        cpf = attrs.get('cpf') or getattr(self.instance, 'cpf', None)
        if not cpf and not self.instance:
            raise serializers.ValidationError({'cpf': 'O CPF é obrigatório.'})
        return attrs

    def create(self, validated_data):
        usuario = validated_data.pop('usuario', None)
        funcionario = Funcionario.objects.create(**validated_data)
        if usuario:
            funcionario.usuario = usuario
            funcionario.save(update_fields=['usuario'])
        return funcionario

    def update(self, instance, validated_data):
        usuario = validated_data.pop('usuario', None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if usuario:
            instance.usuario = usuario
        instance.save()
        return instance


class UsuarioSerializer(serializers.ModelSerializer):
    nome = serializers.CharField(write_only=True, required=False)
    perfil = serializers.CharField(write_only=True, required=False, default='Operacional')
    ativo = serializers.BooleanField(write_only=True, required=False, default=True)
    senha = serializers.CharField(write_only=True, required=False, min_length=8)
    funcionario = serializers.PrimaryKeyRelatedField(queryset=Funcionario.objects.all(), required=False, allow_null=True)

    class Meta:
        model = Usuario
        fields = [
            'id', 'username', 'first_name', 'last_name', 'email', 'role',
            'telefone', 'is_active', 'nome', 'perfil', 'ativo', 'senha', 'funcionario',
        ]
        read_only_fields = ['username', 'first_name', 'last_name', 'role', 'is_active']

    def validate(self, attrs):
        perfil = normalize_role(attrs.get('perfil') or self.instance.role if self.instance else 'Operacional')
        funcionario = attrs.get('funcionario')
        email = attrs.get('email')

        if funcionario is None and perfil in {'Motorista', 'Ajudante'}:
            raise serializers.ValidationError({
                'funcionario': 'Motorista e Ajudante precisam estar vinculados a um funcionário.'
            })

        if funcionario is not None and getattr(funcionario, 'usuario', None) and getattr(funcionario, 'usuario', None) != self.instance:
            raise serializers.ValidationError({
                'funcionario': 'Este funcionário já está vinculado a outro usuário.'
            })

        if email is not None:
            email = str(email).strip().lower()
            attrs['email'] = email

        email_atual = (self.instance.email if self.instance else '')
        email_final = attrs.get('email', email_atual)
        if not email_final:
            raise serializers.ValidationError({'email': 'O e-mail é obrigatório.'})

        existe_email = Usuario.objects.filter(email=email_final)
        if self.instance:
            existe_email = existe_email.exclude(pk=self.instance.pk)
        if existe_email.exists():
            raise serializers.ValidationError({'email': 'Já existe um usuário com este e-mail.'})

        return attrs

    def create(self, validated_data):
        nome = validated_data.pop('nome', '')
        perfil = validated_data.pop('perfil', 'Operacional')
        ativo = validated_data.pop('ativo', True)
        senha = validated_data.pop('senha', None)
        funcionario = validated_data.pop('funcionario', None)
        email = validated_data.pop('email')

        user = Usuario(
            username=email,
            email=email,
            first_name=nome,
            role=perfil,
            is_active=ativo,
        )
        if senha:
            user.set_password(senha)
        user.save()
        if funcionario:
            funcionario.usuario = user
            funcionario.save(update_fields=['usuario'])
        if normalize_role(perfil) == 'Motorista' and not Equipe.objects.filter(motorista=user).exists():
            nome_base = f"Equipe {(nome or user.username).strip()}"[:90] or f"Equipe {user.id}"
            nome_equipe = nome_base
            indice = 1
            while Equipe.objects.filter(nome=nome_equipe).exists():
                indice += 1
                nome_equipe = f"{nome_base} {indice}"
            Equipe.objects.create(nome=nome_equipe, motorista=user, ativo=True)
        return user

    def update(self, instance, validated_data):
        nome = validated_data.pop('nome', None)
        perfil = validated_data.pop('perfil', None)
        ativo = validated_data.pop('ativo', None)
        senha = validated_data.pop('senha', None)
        funcionario = validated_data.pop('funcionario', None)

        if nome is not None:
            instance.first_name = nome
        if perfil is not None:
            instance.role = perfil
        if ativo is not None:
            instance.is_active = ativo
        if senha:
            instance.set_password(senha)
        if 'email' in validated_data:
            instance.email = validated_data['email']
            instance.username = validated_data['email']
        if funcionario is not None:
            funcionario.usuario = instance
            funcionario.save(update_fields=['usuario'])
        instance.save()
        return instance
