// frontend/js/modules/cadastros.js
// ─────────────────────────────────────────────────────────────
// Módulo de Cadastros — TMS Breton V2
// Abas: Usuários | Funcionários | Estoque | Veículos
// ─────────────────────────────────────────────────────────────

import { api, authService, authStorage } from '../api/api.js?v=15';
import { checkAuth } from '../utils/auth-guard.js';
import { openModal, showToast } from '../utils/modal.js';

// ─────────────────────────────────────────────────────────────
// CACHES
// ─────────────────────────────────────────────────────────────
let pessoasCache      = [];
let usuariosCache     = [];
let funcionariosCache = [];
let equipesCache      = [];
let estoqueCache      = [];
let veiculosCache     = [];
const MIN_PASSWORD_LENGTH = 8;

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const parseDecimal = (val) => parseFloat(String(val || 0).replace(',', '.')) || 0;

function normalizeRole(value) {
    if (!value) return '';
    const normalized = String(value).trim().toLowerCase().replace(/[_-]/g, ' ');
    const aliases = {
        'gestor operacional': 'Gestor',
        'gestor': 'Gestor',
        'operacional': 'Operacional',
        'motorista': 'Motorista',
        'ajudante': 'Ajudante',
        'ti': 'TI',
        'admin': 'Admin',
    };
    return aliases[normalized] || String(value).trim();
}

function canManageUsers() {
    const currentRole = normalizeRole(authStorage.getUser()?.role || authStorage.getUser()?.cargo || '');
    return ['TI', 'Admin'].includes(currentRole);
}

function safeItems(response) {
    if (!response) return [];
    if (Array.isArray(response)) return response;
    if (Array.isArray(response.items)) return response.items;
    if (Array.isArray(response.results)) return response.results;
    return [];
}

function statusBadge(status) {
    const s = (status || '').toLowerCase();
    if (['ativo', 'ativa', 'disponível', 'disponivel', 'active', 'true', '1'].includes(s))
        return `<span class="badge badge--success">${status || 'Ativo'}</span>`;
    if (['inativo', 'inativa', 'inactive', 'false', '0'].includes(s))
        return `<span class="badge badge--danger">${status || 'Inativo'}</span>`;
    if (['em manutenção', 'manutencao', 'manutenção'].includes(s))
        return `<span class="badge badge--warning">${status}</span>`;
    if (['em rota', 'em viagem', 'em_rota'].includes(s))
        return `<span class="badge badge--info">${status}</span>`;
    return `<span class="badge badge--accent">${status || '—'}</span>`;
}

function initials(nome = '') {
    return nome.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
}

// ─────────────────────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;

    const btnNewUsuario = document.getElementById('btnNewUsuario');
    if (btnNewUsuario) {
        btnNewUsuario.disabled = !canManageUsers();
        btnNewUsuario.style.display = canManageUsers() ? '' : 'none';
    }

    document.getElementById('btnLogout')?.addEventListener('click', (e) => {
        e.preventDefault();
        authService.logout();
    });

    initTabs();
    initButtons();
    initSearchFilters();
    loadAllData();
});

// ─────────────────────────────────────────────────────────────
// NAVEGAÇÃO POR ABAS
// ─────────────────────────────────────────────────────────────
function initTabs() {
    const buttons  = document.querySelectorAll('#cadastrosTabs .tab-btn');
    const sections = document.querySelectorAll('.tab-content');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            buttons.forEach(b => { b.classList.remove('tab-btn--active'); b.setAttribute('aria-selected', 'false'); });
            sections.forEach(s => s.classList.remove('tab-content--active'));

            btn.classList.add('tab-btn--active');
            btn.setAttribute('aria-selected', 'true');
            document.getElementById(`tab-${tabId}`)?.classList.add('tab-content--active');

            localStorage.setItem('activeCadastrosTab', tabId);
        });
    });

    const hashTab = (window.location.hash || '').replace('#', '');
    const saved = hashTab || localStorage.getItem('activeCadastrosTab');
    if (saved) {
        const target = document.querySelector(`#cadastrosTabs .tab-btn[data-tab="${saved}"]`);
        if (target) target.click();
    }
}

// ─────────────────────────────────────────────────────────────
// BOTÕES "+ NOVO REGISTRO"
// ─────────────────────────────────────────────────────────────
function initButtons() {
    document.getElementById('btnNewPessoa')?.addEventListener('click',      () => openModalPessoa());
    document.getElementById('btnNewUsuario')?.addEventListener('click',     () => openModalUsuario());
    document.getElementById('btnNewFuncionario')?.addEventListener('click', () => openFormFuncionario());
    document.getElementById('btnCancelarFuncionario')?.addEventListener('click', fecharFormFuncionario);
    document.getElementById('btnCancelarFuncionario2')?.addEventListener('click', fecharFormFuncionario);
    document.getElementById('btnAddDependente')?.addEventListener('click', () => adicionarDependente());
    document.getElementById('funcionarioForm')?.addEventListener('submit', salvarFormFuncionario);
    document.getElementById('fn_cep')?.addEventListener('blur', preencherEnderecoPorCep);
    ['fn_alimentacao', 'fn_vale_transporte', 'fn_convenio', 'fn_inss'].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', atualizarDescontoTotal);
    });
    document.getElementById('btnNewEquipe')?.addEventListener('click',      () => openModalEquipe());
    document.getElementById('btnNewEstoque')?.addEventListener('click',     () => openModalEstoque());
    document.getElementById('btnNewVeiculo')?.addEventListener('click',     () => openFormVeiculo());
    document.getElementById('btnCancelarVeiculo')?.addEventListener('click', fecharFormVeiculo);
    document.getElementById('btnCancelarVeiculo2')?.addEventListener('click', fecharFormVeiculo);
    document.getElementById('veiculoForm')?.addEventListener('submit', salvarFormVeiculo);
    document.getElementById('btnPesquisarVeiculo')?.addEventListener('click', filtrarVeiculos);
    document.getElementById('vf_texto')?.addEventListener('input', filtrarVeiculos);
    ['vf_campo', 'vf_tipo_prop', 'vf_unidade', 'vf_categoria', 'vf_status', 'vf_carroceria', 'vf_rodado', 'vf_uf', 'vf_rastreador']
        .forEach((id) => document.getElementById(id)?.addEventListener('change', filtrarVeiculos));
    document.getElementById('btnExcelVeiculo')?.addEventListener('click', exportarVeiculosExcel);
    document.getElementById('btnQrVeiculo')?.addEventListener('click', imprimirQrVeiculos);
    document.getElementById('btnStatusVeiculo')?.addEventListener('click', loadVeiculos);
    document.getElementById('btnAddAnexoVeiculo')?.addEventListener('click', () => {
        renderAnexosVeiculo([...coletarAnexosVeiculo(), { nome: '', tipo: '' }]);
    });
}

// ─────────────────────────────────────────────────────────────
// FILTROS DE PESQUISA
// ─────────────────────────────────────────────────────────────
function initSearchFilters() {
    document.getElementById('searchPessoas')?.addEventListener('input', e => {
        const t = e.target.value.toLowerCase();
        renderPessoasTable(pessoasCache.filter(p =>
            (p.nome || '').toLowerCase().includes(t) ||
            (p.documento || '').toLowerCase().includes(t) ||
            (p.papeis_label || p.papeis || '').toLowerCase().includes(t) ||
            (p.cidade || '').toLowerCase().includes(t)
        ));
    });

    document.getElementById('searchUsuarios')?.addEventListener('input', e => {
        const t = e.target.value.toLowerCase();
        renderUsuariosTable(usuariosCache.filter(u =>
            (u.nome || u.name || u.username || '').toLowerCase().includes(t) ||
            (u.email || '').toLowerCase().includes(t) ||
            (u.perfil || u.role || '').toLowerCase().includes(t)
        ));
    });

    document.getElementById('searchFuncionarios')?.addEventListener('input', e => {
        const t = e.target.value.toLowerCase();
        renderFuncionariosTable(funcionariosCache.filter(f =>
            (f.nome || '').toLowerCase().includes(t) ||
            (f.cpf || '').toLowerCase().includes(t) ||
            (f.cargo || '').toLowerCase().includes(t) ||
            (f.setor || '').toLowerCase().includes(t) ||
            (f.unidade || '').toLowerCase().includes(t) ||
            (f.tipo_cadastro || '').toLowerCase().includes(t)
        ));
    });

    document.getElementById('searchEquipes')?.addEventListener('input', e => {
        const t = e.target.value.toLowerCase();
        renderEquipesTable(equipesCache.filter(eq =>
            (eq.nome || '').toLowerCase().includes(t) ||
            (eq.motorista_nome || '').toLowerCase().includes(t) ||
            (eq.membros_info || '').toLowerCase().includes(t)
        ));
    });

    document.getElementById('searchEstoque')?.addEventListener('input', e => {
        const t = e.target.value.toLowerCase();
        renderEstoqueTable(estoqueCache.filter(i =>
            (i.codigo || '').toLowerCase().includes(t) ||
            (i.descricao || '').toLowerCase().includes(t) ||
            (i.localizacao || '').toLowerCase().includes(t)
        ));
    });

}

// ─────────────────────────────────────────────────────────────
// CARREGAMENTO DE DADOS
// ─────────────────────────────────────────────────────────────
async function loadAllData() {
    await Promise.allSettled([
        loadPessoas(),
        loadUsuarios(),
        loadFuncionarios(),
        loadEquipes(),
        loadEstoque(),
        loadVeiculos(),
    ]);
}

async function loadPessoas() {
    try {
        const res = await api.request('/cadastros/pessoas/', 'GET');
        pessoasCache = safeItems(res);
    } catch (e) {
        console.warn('[Cadastros] Empresas/Pessoas:', e?.message || e);
        pessoasCache = [];
    }
    renderPessoasTable(pessoasCache);
}

async function loadUsuarios() {
    try {
        const res = await api.request('/cadastros/usuarios/', 'GET');
        usuariosCache = safeItems(res);
    } catch (e) {
        console.warn('[Cadastros] Usuários:', e?.message || e);
        usuariosCache = [];
    }
    renderUsuariosTable(usuariosCache);
}

async function loadFuncionarios() {
    try {
        const res = await api.request('/cadastros/funcionarios/', 'GET');
        funcionariosCache = safeItems(res);
    } catch (e) {
        console.warn('[Cadastros] Funcionários:', e?.message || e);
        // Tenta fallback com motoristas (que são funcionários com CNH)
        try {
            const res2 = await api.request('/cadastros/funcionarios/', 'GET');
            funcionariosCache = safeItems(res2).map(m => ({ ...m, _origem: 'motorista' }));
        } catch { funcionariosCache = []; }
    }
    renderFuncionariosTable(funcionariosCache);
}

async function loadEquipes() {
    try {
        const res = await api.request('/cadastros/equipes/', 'GET');
        equipesCache = safeItems(res);
    } catch (e) {
        console.warn('[Cadastros] Equipes:', e?.message || e);
        equipesCache = [];
    }
    renderEquipesTable(equipesCache);
}

async function loadEstoque() {
    try {
        const res = await api.request('/estoque/produtos/', 'GET');
        estoqueCache = safeItems(res);
    } catch (e) {
        console.warn('[Cadastros] Estoque:', e?.message || e);
        estoqueCache = [];
    }
    renderEstoqueTable(estoqueCache);
}

async function loadVeiculos() {
    try {
        const res = await api.request('/cadastros/veiculos/', 'GET');
        veiculosCache = safeItems(res);
    } catch (e) {
        console.warn('[Cadastros] Veículos:', e?.message || e);
        veiculosCache = [];
    }
    filtrarVeiculos();
}

// ─────────────────────────────────────────────────────────────
// RENDER HELPERS
// ─────────────────────────────────────────────────────────────
function renderTable(tbodyId, data, rowFn, colSpan = 5) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (!data?.length) {
        tbody.innerHTML = `
            <tr><td colspan="${colSpan}">
                <div class="empty-state">
                    <span class="empty-icon">🗂️</span>
                    Nenhum registro encontrado.
                </div>
            </td></tr>`;
        return;
    }
    tbody.innerHTML = data.map(item => `<tr>${rowFn(item)}</tr>`).join('');
}

function actionButtons(id, editClass, deleteClass) {
    return `
        <td>
            <div class="btn-row">
                <button class="btn-action btn-edit ${editClass}" data-id="${id}" title="Editar">✏️ Editar</button>
                <button class="btn-action btn-delete ${deleteClass}" data-id="${id}" title="Excluir">🗑️</button>
            </div>
        </td>`;
}

function attachEvents(tbodyId, editSel, deleteSel, cache, openFn, endpoint) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    tbody.querySelectorAll(`.${editSel}`).forEach(btn => {
        btn.addEventListener('click', e => {
            const item = cache.find(i => String(i.id) === String(e.currentTarget.dataset.id));
            if (item) openFn(item);
        });
    });

    tbody.querySelectorAll(`.${deleteSel}`).forEach(btn => {
        btn.addEventListener('click', async e => {
            const id = e.currentTarget.dataset.id;
            if (!confirm('Deseja realmente remover este registro? Esta ação não pode ser desfeita.')) return;
            try {
                await api.request(`${endpoint}/${id}`, 'DELETE');
                showToast('Registro removido com sucesso!', 'success');
                await loadAllData();
            } catch (err) {
                showToast(`Erro ao remover: ${err?.message || 'Tente novamente.'}`, 'error');
            }
        });
    });
}

// ─────────────────────────────────────────────────────────────
// RENDER: USUÁRIOS
// ─────────────────────────────────────────────────────────────
const PERFIS_USUARIO = [
    { value: 'admin',      label: 'Administrador' },
    { value: 'gestor',     label: 'Gestor Operacional' },
    { value: 'ti',         label: 'TI / Suporte' },
    { value: 'financeiro', label: 'Financeiro' },
    { value: 'operador',   label: 'Operador Logístico' },
    { value: 'motorista',  label: 'Motorista' },
    { value: 'visualizador', label: 'Apenas Visualização' },
];

function renderUsuariosTable(data) {
    renderTable('tableUsuariosBody', data, row => {
        const nome = row.nome || row.name || row.username || row.email?.split('@')[0] || '—';
        const perfilLabel = PERFIS_USUARIO.find(p => p.value === row.perfil || p.value === row.role)?.label
            || row.perfil || row.role || 'Padrão';
        const ativo = row.ativo !== false && row.active !== false && row.is_active !== false;
        return `
            <td>
                <div class="user-pill">
                    <div class="user-avatar">${initials(nome)}</div>
                    <span>${nome}</span>
                </div>
            </td>
            <td><small>${row.email || '—'}</small></td>
            <td><span class="badge badge--vinho">${perfilLabel}</span></td>
            <td>${statusBadge(ativo ? 'Ativo' : 'Inativo')}</td>
            ${actionButtons(row.id, 'btn-edit-usuario', 'btn-del-usuario')}`;
    }, 5);

    attachEvents('tableUsuariosBody', 'btn-edit-usuario', 'btn-del-usuario',
        usuariosCache, openModalUsuario, '/cadastros/usuarios/');
}

// ─────────────────────────────────────────────────────────────
// RENDER: FUNCIONÁRIOS
// ─────────────────────────────────────────────────────────────
function renderFuncionariosTable(data) {
    renderTable('tableFuncionariosBody', data, row => {
        const nomeFunc = row.nome || `${row.first_name || ''} ${row.last_name || ''}`.trim()
            || (row.username && isNaN(row.username) ? row.username : '')
            || '<span style="color: #e74c3c; font-style: italic;">Nome não informado</span>';
        const cpfDisplay = row.cpf || '—';
        const temCNH = !!(row.cnh || row.categoria_cnh);
        
        return `
            <td><strong>${nomeFunc}</strong></td>
            <td><small>${cpfDisplay}</small></td>
            <td>
                <span>${row.cargo || '—'}</span>
                ${row.tipo_cadastro ? `<br><small style="color:#999">${row.tipo_cadastro}</small>` : ''}
            </td>
            <td>
                ${temCNH 
                    ? `<span class="badge badge--info">${row.cnh || '—'} (Cat. ${row.categoria_cnh || '—'})</span>` 
                    : '<span style="color:#bbb; font-size:.8rem">—</span>'}
            </td>
            <td>${row.unidade || row.cia_transporte || '—'}</td>
            <td>${statusBadge(row.status_operacional || 'Ativo')}</td>
            ${actionButtons(row.id, 'btn-edit-func', 'btn-del-func')}`;
    }, 7);

    // Nota: Graças à correção que fizemos no api.js (limpeza de barras duplas), 
    // deixar a barra no final aqui '/cadastros/funcionarios/' agora é 100% seguro!
    attachEvents('tableFuncionariosBody', 'btn-edit-func', 'btn-del-func', 
        funcionariosCache, openFormFuncionario, '/cadastros/funcionarios/');
}
// ─────────────────────────────────────────────────────────────
// RENDER: ESTOQUE
// ─────────────────────────────────────────────────────────────
function renderEstoqueTable(data) {
    renderTable('tableEstoqueBody', data, row => `
        <td><strong>${row.codigo || '—'}</strong></td>
        <td>${row.descricao || '—'}</td>
        <td><small style="color:#888">${row.dimensao || '—'}</small></td>
        <td><span class="badge badge--${row.quantidade > 0 ? 'success' : 'danger'}">${row.quantidade ?? '—'}</span></td>
        <td>${row.unidade || 'UN'}</td>
        <td><small>${row.localizacao || 'Expedição'}</small></td>
        ${actionButtons(row.id, 'btn-edit-est', 'btn-del-est')}`, 7);

    attachEvents('tableEstoqueBody', 'btn-edit-est', 'btn-del-est',
        estoqueCache, openModalEstoque, '/estoque/produtos/');
}

// ─────────────────────────────────────────────────────────────
// RENDER: VEÍCULOS
// ─────────────────────────────────────────────────────────────
function veiculoAtivo(row) {
    const status = String(row.status_operacional || row.status || '').toLowerCase();
    return row.ativo !== false && !['inativo', 'desligado'].includes(status);
}

function filtrarVeiculos() {
    const campo = document.getElementById('vf_campo')?.value || 'placa';
    const texto = (document.getElementById('vf_texto')?.value || '').toLowerCase().trim();
    const tipoProp = document.getElementById('vf_tipo_prop')?.value || '';
    const unidade = document.getElementById('vf_unidade')?.value || '';
    const categoria = document.getElementById('vf_categoria')?.value || '';
    const status = document.getElementById('vf_status')?.value || '';
    const carroceria = document.getElementById('vf_carroceria')?.value || '';
    const rodado = document.getElementById('vf_rodado')?.value || '';
    const uf = document.getElementById('vf_uf')?.value || '';
    const rastreador = document.getElementById('vf_rastreador')?.value || '';

    const lista = veiculosCache.filter((v) => {
        const valorCampo = String(v[campo] || '').toLowerCase();
        if (texto && !valorCampo.includes(texto)) return false;
        if (tipoProp && String(v.tipo_proprietario || '') !== tipoProp) return false;
        if (unidade && ![v.base_operacao, v.unidade_proprietaria].includes(unidade)) return false;
        if (categoria && String(v.categoria_frota || v.tipo_frota || '') !== categoria) return false;
        if (status === 'ATIVO' && !veiculoAtivo(v)) return false;
        if (status === 'INATIVO' && veiculoAtivo(v)) return false;
        if (carroceria && String(v.tipo_carroceria || '') !== carroceria) return false;
        if (rodado && String(v.tipo_rodado || '') !== rodado) return false;
        if (uf && String(v.uf_emplacada || '').toUpperCase() !== uf) return false;
        if (rastreador && String(v.rastreador || '') !== rastreador) return false;
        return true;
    });
    renderVeiculosTable(lista);
}

function renderVeiculosTable(data) {
    renderTable('tableVeiculosBody', data, row => `
        <td><input type="checkbox" data-vei-check="${row.id}"></td>
        <td>${row.id}</td>
        <td><strong>${row.placa || '—'}</strong></td>
        <td>${row.marca || '—'}</td>
        <td>${row.modelo || '—'}</td>
        <td>${row.cor || '—'}</td>
        <td>${statusBadge(veiculoAtivo(row) ? 'Ativo' : 'Inativo')}</td>
        ${actionButtons(row.id, 'btn-edit-vei', 'btn-del-vei')}`, 8);

    attachEvents('tableVeiculosBody', 'btn-edit-vei', 'btn-del-vei',
        veiculosCache, openFormVeiculo, '/cadastros/veiculos/');
}

// ─────────────────────────────────────────────────────────────
// MODAL: USUÁRIO
// ─────────────────────────────────────────────────────────────
function openModalUsuario(existente = null) {
    const isEdit = !!existente;
    if (!canManageUsers() && !isEdit) {
        showToast('Seu perfil não tem permissão para criar usuários.', 'error');
        return;
    }
    openModal({
        title: isEdit ? '✏️ Editar Usuário' : '👤 Novo Usuário do Sistema',
        confirmLabel: isEdit ? 'Salvar Alterações' : 'Criar Usuário',
        fields: [
            {
                id: 'nome', label: 'Nome Completo',
                value: existente?.nome || existente?.name || '',
                placeholder: 'Ex: Ana Souza', required: true
            },
            {
                id: 'email', label: 'E-mail de Acesso', type: 'email',
                value: existente?.email || '',
                placeholder: 'ana.souza@breton.com.br', required: true
            },
            {
                id: 'perfil', label: 'Perfil de Acesso', type: 'select', required: true,
                value: existente?.perfil || existente?.role || 'Operacional',
                options: [
                    { value: 'TI', label: 'TI' },
                    { value: 'Admin', label: 'Admin' },
                    { value: 'Gestor', label: 'Gestor' },
                    { value: 'Operacional', label: 'Operacional' },
                    { value: 'Motorista', label: 'Motorista' },
                    { value: 'Ajudante', label: 'Ajudante' },
                ]
            },
            ...(!isEdit ? [{
                id: 'senha', label: 'Senha Inicial', type: 'password',
                placeholder: 'Mínimo 8 caracteres', required: true
            }] : []),
            {
                id: 'ativo', label: 'Status', type: 'select',
                value: existente?.ativo !== false ? 'true' : 'false',
                options: [{ value: 'true', label: 'Ativo' }, { value: 'false', label: 'Inativo' }]
            },
            {
                id: 'funcionario', label: 'Funcionário Vinculado', type: 'select',
                value: existente?.funcionario ?? '',
                options: [
                    { value: '', label: 'Selecione o funcionário...' },
                    ...funcionariosCache.map(f => ({
                        value: f.id,
                        label: `${f.nome || `${f.first_name || ''} ${f.last_name || ''}`.trim() || f.username || 'Sem nome'} — ${f.cpf || 'CPF não informado'}`
                    }))
                ]
            },
        ],
        onConfirm: async (data) => {
            const senhaInformada = String(data.senha || '').trim();
            const payload = {
                nome:   (data.nome  || '').trim(),
                email:  (data.email || '').trim(),
                perfil: data.perfil || 'Operacional',
                ativo:  data.ativo !== 'false',
                funcionario: data.funcionario ? Number(data.funcionario) : null,
                ...(senhaInformada ? { senha: senhaInformada } : {}),
            };

            if (!payload.nome || !payload.email)
                throw new Error('Nome e e-mail são obrigatórios.');
            if (!isEdit && senhaInformada.length < MIN_PASSWORD_LENGTH) {
                throw new Error(`A senha inicial deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`);
            }
            if (isEdit && senhaInformada && senhaInformada.length < MIN_PASSWORD_LENGTH) {
                throw new Error(`A nova senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`);
            }

            if (isEdit) {
                await api.request(`/cadastros/usuarios/${existente.id}/`, 'PATCH', payload);
            } else {
                await api.request('/cadastros/usuarios/', 'POST', payload);
            }
            await loadUsuarios();
            return { mensagem: `Usuário ${isEdit ? 'atualizado' : 'criado'} com sucesso!` };
        }
    });
}


// ─────────────────────────────────────────────────────────────
// FICHA: FUNCIONÁRIO
// ─────────────────────────────────────────────────────────────
const FUNCIONARIO_CAMPOS = [
    'unidade', 'cia_transporte', 'nome', 'tipo_cadastro', 'cargo', 'matricula',
    'cep', 'endereco', 'numero', 'bairro', 'cidade', 'complemento',
    'telefone', 'celular', 'email', 'nextel_numero', 'nextel_id',
    'titulo_eleitor', 'titulo_data_emissao', 'titulo_zona', 'titulo_secao',
    'ctps_numero', 'ctps_data_emissao', 'ctps_serie', 'ctps_orgao_expedidor',
    'cpf', 'rg', 'rg_orgao_expedidor', 'rg_data_emissao',
    'cnh', 'cnh_codigo_seguranca', 'categoria_cnh', 'cnh_validade',
    'cnh_data_primeira', 'cnh_data_emissao', 'cnh_uf', 'pis_pasep',
    'banco', 'tipo_conta', 'agencia', 'conta_numero', 'pix_tipo', 'pix_chave',
    'salario_base', 'alimentacao', 'vale_transporte', 'convenio', 'inss', 'desconto_total',
    'status_seguradora', 'validade_seguradora', 'autorizacao_seguradora',
    'data_autorizacao_seguradora', 'memo',
    'admissao', 'data_nascimento', 'escolaridade', 'municipio_nascimento',
    'nome_mae', 'nome_pai', 'companheira', 'estado_civil', 'exame_toxicologico',
    'vinculo', 'setor', 'status_operacional',
];

function fnVal(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value == null ? '' : String(value);
}

function fnGet(id) {
    return (document.getElementById(id)?.value || '').trim();
}

function dataISO(value) {
    if (!value) return '';
    const texto = String(value);
    return texto.includes('T') ? texto.slice(0, 10) : texto.slice(0, 10);
}

function openFormFuncionario(existente = null) {
    const form = document.getElementById('funcionarioForm');
    const lista = document.getElementById('funcionarioLista');
    if (!form || !lista) return;
    form.reset();
    fnVal('fn_id', existente?.id || '');
    document.getElementById('fnTitulo').textContent = existente
        ? 'Funcionário > Editar cadastro'
        : 'Funcionário > Incluir novo';

    FUNCIONARIO_CAMPOS.forEach((campo) => {
        let valor = existente ? existente[campo] : '';
        if (campo.endsWith('_emissao') || campo.includes('data_') || campo.includes('validade') || campo === 'admissao') {
            valor = dataISO(valor);
        }
        if (!existente) {
            if (campo === 'unidade' || campo === 'cia_transporte') valor = 'CIA DE TRANSPORTE';
            if (campo === 'banco') valor = 'BANCO BRADESCO S/A';
            if (campo === 'status_seguradora') valor = 'Nao cadastrado';
            if (campo === 'exame_toxicologico') valor = 'NÃO APLICAVEL';
            if (campo === 'vinculo') valor = 'CLT';
            if (campo === 'setor') valor = 'Operações';
            if (campo === 'status_operacional') valor = 'Ativo';
        }
        fnVal(`fn_${campo}`, valor ?? '');
    });

    if (existente) {
        const nomeAtual = existente.nome || `${existente.first_name || ''} ${existente.last_name || ''}`.trim();
        fnVal('fn_nome', nomeAtual);
        fnVal('fn_email_acesso', existente.email_acesso || existente.email || '');
        fnVal('fn_criar_acesso', existente.usuario_id ? 'false' : 'true');
        const perfil = /ajudante/i.test(`${existente.cargo || ''} ${existente.tipo_cadastro || ''}`) ? 'Ajudante' : 'Motorista';
        fnVal('fn_perfil', existente.role && ['Motorista', 'Ajudante', 'Operacional', 'Gestor', 'Admin', 'TI'].includes(existente.role)
            ? existente.role
            : perfil);
    } else {
        fnVal('fn_criar_acesso', 'true');
        fnVal('fn_perfil', 'Motorista');
    }
    fnVal('fn_senha', '');
    renderDependentes(Array.isArray(existente?.dependentes) ? existente.dependentes : []);
    lista.classList.add('is-hidden');
    form.classList.add('is-open');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function fecharFormFuncionario() {
    document.getElementById('funcionarioForm')?.classList.remove('is-open');
    document.getElementById('funcionarioLista')?.classList.remove('is-hidden');
}

function renderDependentes(lista = []) {
    const body = document.getElementById('fnDependentesBody');
    if (!body) return;
    const itens = lista.length ? lista : [{ nome: '', data_nascimento: '', grau: '' }];
    body.innerHTML = itens.map((dep, idx) => `
        <tr data-dep-row>
            <td><input data-dep="nome" value="${String(dep.nome || '').replace(/"/g, '&quot;')}" placeholder="Nome"></td>
            <td><input data-dep="data_nascimento" type="date" value="${dataISO(dep.data_nascimento)}"></td>
            <td>
                <select data-dep="grau">
                    ${['', 'FILHO', 'FILHA', 'CONJUGE', 'PAI', 'MAE', 'OUTRO'].map((grau) => `
                        <option value="${grau}" ${String(dep.grau || '').toUpperCase() === grau ? 'selected' : ''}>${grau || 'SELECIONE'}</option>
                    `).join('')}
                </select>
            </td>
            <td><button type="button" class="btn-action btn-delete" data-del-dep="${idx}">✕</button></td>
        </tr>
    `).join('');
    body.querySelectorAll('[data-del-dep]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const atual = coletarDependentes().filter((_, i) => i !== Number(btn.dataset.delDep));
            renderDependentes(atual.length ? atual : [{ nome: '', data_nascimento: '', grau: '' }]);
        });
    });
}

function adicionarDependente() {
    renderDependentes([...coletarDependentes(), { nome: '', data_nascimento: '', grau: '' }]);
}

function coletarDependentes() {
    return Array.from(document.querySelectorAll('#fnDependentesBody [data-dep-row]')).map((row) => ({
        nome: row.querySelector('[data-dep="nome"]')?.value.trim() || '',
        data_nascimento: row.querySelector('[data-dep="data_nascimento"]')?.value || '',
        grau: row.querySelector('[data-dep="grau"]')?.value || '',
    })).filter((dep) => dep.nome);
}

function atualizarDescontoTotal() {
    const soma = ['fn_alimentacao', 'fn_vale_transporte', 'fn_convenio', 'fn_inss']
        .reduce((acc, id) => acc + (Number(document.getElementById(id)?.value) || 0), 0);
    fnVal('fn_desconto_total', soma ? soma.toFixed(2) : '');
}

async function preencherEnderecoPorCep() {
    const cep = fnGet('fn_cep').replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if (data.erro) return;
        if (data.logradouro) fnVal('fn_endereco', data.logradouro);
        if (data.bairro) fnVal('fn_bairro', data.bairro);
        if (data.localidade) fnVal('fn_cidade', data.localidade);
    } catch {
        /* ignore */
    }
}

async function salvarFormFuncionario(event) {
    event.preventDefault();
    const nome = fnGet('fn_nome');
    const cpf = fnGet('fn_cpf');
    if (!nome || !cpf) {
        showToast('Nome e CPF são obrigatórios.', 'error');
        return;
    }

    const criarAcesso = fnGet('fn_criar_acesso') === 'true';
    const loginEmail = fnGet('fn_email_acesso') || fnGet('fn_email');
    const senha = fnGet('fn_senha');
    let perfil = fnGet('fn_perfil') || 'Operacional';
    const cargo = fnGet('fn_cargo');
    const tipo = fnGet('fn_tipo_cadastro');
    if (criarAcesso && /motorista/i.test(`${cargo} ${tipo}`) && !['Motorista', 'Ajudante'].includes(perfil)) {
        perfil = 'Motorista';
    }
    if (criarAcesso && /ajudante/i.test(`${cargo} ${tipo}`)) {
        perfil = 'Ajudante';
    }
    if (criarAcesso) {
        if (!loginEmail || !senha) {
            showToast('Para criar acesso, informe e-mail e senha do usuário.', 'error');
            return;
        }
        if (senha.length < MIN_PASSWORD_LENGTH) {
            showToast(`A senha inicial deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`, 'error');
            return;
        }
    }

    const payload = { ativo: true, dependentes: coletarDependentes() };
    FUNCIONARIO_CAMPOS.forEach((campo) => {
        payload[campo] = fnGet(`fn_${campo}`);
    });

    const existenteId = fnGet('fn_id');
    try {
        const funcionario = existenteId
            ? await api.request(`/cadastros/funcionarios/${existenteId}/`, 'PATCH', payload)
            : await api.request('/cadastros/funcionarios/', 'POST', payload);

        if (criarAcesso) {
            await api.request('/cadastros/usuarios/', 'POST', {
                nome,
                email: loginEmail,
                perfil,
                senha,
                ativo: true,
                funcionario: funcionario?.id || Number(existenteId),
            });
        }

        await loadFuncionarios();
        await loadUsuarios();
        fecharFormFuncionario();
        showToast(`Funcionário ${existenteId ? 'atualizado' : 'cadastrado'} com sucesso!`, 'success');
    } catch (err) {
        showToast(err?.message || 'Não foi possível salvar o colaborador.', 'error');
    }
}

// ─────────────────────────────────────────────────────────────
// MODAL: ESTOQUE
// ─────────────────────────────────────────────────────────────
function openModalEstoque(existente = null) {
    const isEdit = !!existente;
    openModal({
        title: isEdit ? '✏️ Editar Item do Estoque' : '📦 Novo Item no Estoque',
        confirmLabel: isEdit ? 'Salvar Alterações' : 'Cadastrar Item',
        fields: [
            {
                id: 'codigo', label: 'Código do Item',
                value: existente?.codigo || '', placeholder: 'Ex: BR-2024-001', required: true
            },
            {
                id: 'descricao', label: 'Descrição Completa',
                value: existente?.descricao || '', placeholder: 'Ex: Sofá Edgy 3 Lugares Vinho', required: true
            },
            {
                id: 'dimensao', label: 'Dimensões (AxLxP cm)',
                value: existente?.dimensao || '', placeholder: 'Ex: 90x220x100'
            },
            {
                id: 'peso_kg', label: 'Peso (kg)', type: 'number',
                value: existente?.peso_kg || '', placeholder: 'Ex: 45.5'
            },
            {
                id: 'quantidade', label: 'Quantidade', type: 'number',
                value: existente?.quantidade ?? '', placeholder: 'Ex: 10', required: true
            },
            {
                id: 'unidade', label: 'Unidade de Medida', type: 'select', required: true,
                value: existente?.unidade || 'UN',
                options: ['UN', 'CX', 'PC', 'M', 'M2', 'M3', 'KG', 'PAL']
            },
            {
                id: 'localizacao', label: 'Localização no Armazém',
                value: existente?.localizacao || '', placeholder: 'Ex: Setor A — Prateleira 02'
            },
            {
                id: 'etiqueta', label: 'Código de Barras / Etiqueta',
                value: existente?.etiqueta || existente?.codigo_barras || '',
                placeholder: 'Ex: 000000000331821'
            },
            {
                id: 'observacao', label: 'Observações', type: 'textarea',
                value: existente?.observacao || '',
                placeholder: 'Informações adicionais sobre o item...',
                fullWidth: true
            },
        ],
        onConfirm: async (data) => {
            if (!data.codigo?.trim() || !data.descricao?.trim())
                throw new Error('Código e Descrição são obrigatórios.');
            if (isNaN(parseDecimal(data.quantidade)))
                throw new Error('Informe uma quantidade válida.');

            const payload = {
                codigo:      data.codigo.trim(),
                descricao:   data.descricao.trim(),
                dimensao:    data.dimensao || '',
                peso_kg:     data.peso_kg ? parseDecimal(data.peso_kg) : null,
                quantidade:  parseDecimal(data.quantidade),
                unidade:     data.unidade || 'UN',
                localizacao: data.localizacao || '',
                etiqueta:    data.etiqueta || '',
                observacao:  data.observacao || '',
            };

            if (isEdit) {
                await api.request(`/estoque/produtos/${existente.id}/`, 'PATCH', payload);
            } else {
                await api.request('/estoque/produtos/', 'POST', payload);
            }
            await loadEstoque();
            return { mensagem: `Item "${payload.descricao}" ${isEdit ? 'atualizado' : 'cadastrado'} com sucesso!` };
        }
    });
}

// ─────────────────────────────────────────────────────────────
// FICHA: VEÍCULO
// ─────────────────────────────────────────────────────────────
const VEICULO_CAMPOS = [
    'placa', 'ano', 'ano_modelo', 'renavam', 'cor', 'marca', 'data_compra', 'modelo',
    'tara', 'capacidade_peso_kg', 'capacidade_volume_m3', 'tipo_carroceria',
    'cidade_emplacada', 'uf_emplacada', 'tipo_rodado', 'certificado_cronotacografo',
    'medidas_rodado', 'consumo_km_litro', 'km_maximo_rota', 'capacidade_tanque_litros',
    'base_operacao', 'tipo_veiculo', 'categoria_frota', 'seguradora', 'vigencia',
    'gerenciadora', 'id_rastreador', 'codigo_analise_gerenciadora', 'rastreador',
    'status_seguradora', 'validade_seguradora', 'antt', 'data_venda', 'validade_antt',
    'travas_portas_bau', 'chassi', 'validade_licenciamento', 'eixos', 'vencimento_ipva',
    'valor_licenciamento', 'validade_checklist', 'status_operacional',
    'tipo_responsavel', 'unidade_proprietaria', 'tipo_proprietario', 'financiamento',
    'instituicao_financeira', 'tipo', 'motorista', 'equipe', 'tabela',
    'valor_por_entrega', 'primeira_do_dia_diferente', 'valor_por_km',
    'percentual_frete', 'valor_por_diaria', 'observacao',
];
const VEICULO_DATAS = [
    'data_compra', 'vigencia', 'validade_seguradora', 'data_venda', 'validade_antt',
    'validade_licenciamento', 'vencimento_ipva', 'validade_checklist',
];

function preencherSelect(id, opcoes, valor) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = opcoes.map((o) => `<option value="${o.value}">${o.label}</option>`).join('');
    if (valor != null && valor !== '') el.value = String(valor);
}

function openFormVeiculo(existente = null) {
    const form = document.getElementById('veiculoForm');
    const lista = document.getElementById('veiculoConsulta');
    if (!form || !lista) return;
    form.reset();
    fnVal('vei_id', existente?.id || '');
    document.getElementById('veiTitulo').textContent = existente
        ? 'Veículo > Editar cadastro'
        : 'Veículo > Incluir novo';

    const motoristas = funcionariosCache.filter((f) => f.usuario_id && /motorista/i.test(`${f.cargo || ''} ${f.tipo_cadastro || ''}`));
    const listaMotoristas = motoristas.length ? motoristas : funcionariosCache.filter((f) => f.usuario_id);
    preencherSelect('vei_motorista', [
        { value: '', label: 'Selecione' },
        ...listaMotoristas.map((f) => ({
            value: f.usuario_id,
            label: f.nome || `${f.first_name || ''} ${f.last_name || ''}`.trim() || f.username,
        })),
    ], existente?.motorista || '');
    preencherSelect('vei_equipe', [
        { value: '', label: 'Selecione' },
        ...equipesCache.map((eq) => ({ value: eq.id, label: eq.nome || `Equipe ${eq.id}` })),
    ], existente?.equipe || '');

    VEICULO_CAMPOS.forEach((campo) => {
        let valor = existente ? existente[campo] : '';
        if (VEICULO_DATAS.includes(campo)) valor = dataISO(valor);
        if (!existente) {
            if (campo === 'tipo_carroceria') valor = 'Não Aplicável';
            if (campo === 'tipo_rodado') valor = 'Nao aplicavel';
            if (campo === 'base_operacao' || campo === 'unidade_proprietaria') valor = 'UNIDADE III';
            if (campo === 'seguradora') valor = 'SEM SEGURO';
            if (campo === 'rastreador') valor = '(Sem Rastreador)';
            if (campo === 'status_seguradora') valor = 'Nao cadastrado';
            if (campo === 'travas_portas_bau') valor = 0;
            if (campo === 'tipo_responsavel' || campo === 'tipo_proprietario') valor = 'Proprio';
            if (campo === 'financiamento') valor = 'Nenhum';
            if (campo === 'tabela') valor = 'NAO APLICAVEL';
            if (campo === 'status_operacional') valor = 'Disponível';
            if (campo === 'primeira_do_dia_diferente') valor = 'false';
        }
        if (campo === 'primeira_do_dia_diferente') {
            valor = existente?.primeira_do_dia_diferente ? 'true' : 'false';
        }
        fnVal(`vei_${campo}`, valor ?? '');
    });

    const itens = Array.isArray(existente?.itens_adicionais) ? existente.itens_adicionais : [];
    document.querySelectorAll('#veiItensAdicionais input[type="checkbox"]').forEach((el) => {
        el.checked = itens.includes(el.value);
    });
    renderAnexosVeiculo(Array.isArray(existente?.anexos) ? existente.anexos : []);

    lista.classList.add('is-hidden');
    form.classList.add('is-open');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function fecharFormVeiculo() {
    document.getElementById('veiculoForm')?.classList.remove('is-open');
    document.getElementById('veiculoConsulta')?.classList.remove('is-hidden');
}

function renderAnexosVeiculo(lista = []) {
    const body = document.getElementById('veiAnexosBody');
    if (!body) return;
    const itens = lista.length ? lista : [{ nome: '', tipo: '' }];
    body.innerHTML = itens.map((anexo, idx) => `
        <tr data-anexo-row>
            <td><input data-anexo="nome" value="${String(anexo.nome || '').replace(/"/g, '&quot;')}" placeholder="Nome do arquivo"></td>
            <td>
                <select data-anexo="tipo">
                    ${['', 'CRLV', 'SEGURO', 'ANTT', 'FOTO', 'OUTRO'].map((tipo) => `
                        <option value="${tipo}" ${String(anexo.tipo || '') === tipo ? 'selected' : ''}>${tipo || 'TIPO'}</option>
                    `).join('')}
                </select>
            </td>
            <td><button type="button" class="btn-action btn-delete" data-del-anexo="${idx}">✕</button></td>
        </tr>
    `).join('');
    body.querySelectorAll('[data-del-anexo]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const atual = coletarAnexosVeiculo().filter((_, i) => i !== Number(btn.dataset.delAnexo));
            renderAnexosVeiculo(atual.length ? atual : [{ nome: '', tipo: '' }]);
        });
    });
}

function coletarAnexosVeiculo() {
    return Array.from(document.querySelectorAll('#veiAnexosBody [data-anexo-row]')).map((row) => ({
        nome: row.querySelector('[data-anexo="nome"]')?.value.trim() || '',
        tipo: row.querySelector('[data-anexo="tipo"]')?.value || '',
    })).filter((item) => item.nome);
}

function coletarItensAdicionais() {
    return Array.from(document.querySelectorAll('#veiItensAdicionais input[type="checkbox"]:checked')).map((el) => el.value);
}

async function salvarFormVeiculo(event) {
    event.preventDefault();
    const placa = fnGet('vei_placa').toUpperCase();
    const modelo = fnGet('vei_modelo');
    if (!placa || !modelo) {
        showToast('Placa e modelo são obrigatórios.', 'error');
        return;
    }
    const payload = {
        placa,
        modelo,
        ativo: fnGet('vei_status_operacional') !== 'Inativo',
        itens_adicionais: coletarItensAdicionais(),
        anexos: coletarAnexosVeiculo(),
        primeira_do_dia_diferente: fnGet('vei_primeira_do_dia_diferente') === 'true',
        tipo_frota: /terceiro/i.test(fnGet('vei_tipo_proprietario') || fnGet('vei_categoria_frota')) ? 'TERCEIRO' : 'PROPRIA',
    };
    VEICULO_CAMPOS.forEach((campo) => {
        if (['primeira_do_dia_diferente'].includes(campo)) return;
        payload[campo] = fnGet(`vei_${campo}`);
    });
    payload.placa = placa;

    const existenteId = fnGet('vei_id');
    try {
        if (existenteId) {
            await api.request(`/cadastros/veiculos/${existenteId}/`, 'PATCH', payload);
        } else {
            await api.request('/cadastros/veiculos/', 'POST', payload);
        }
        await loadVeiculos();
        fecharFormVeiculo();
        showToast(`Veículo ${placa} ${existenteId ? 'atualizado' : 'cadastrado'} com sucesso!`, 'success');
    } catch (err) {
        showToast(err?.message || 'Não foi possível salvar o veículo.', 'error');
    }
}

function veiculosFiltradosAtuais() {
    const campo = document.getElementById('vf_campo')?.value || 'placa';
    const texto = (document.getElementById('vf_texto')?.value || '').toLowerCase().trim();
    return veiculosCache.filter((v) => !texto || String(v[campo] || '').toLowerCase().includes(texto));
}

function exportarVeiculosExcel() {
    const lista = veiculosCache;
    const header = ['COD', 'PLACA', 'MARCA', 'MODELO', 'COR', 'STATUS', 'UNIDADE', 'CATEGORIA'];
    const rows = lista.map((v) => [
        v.id, v.placa || '', v.marca || '', v.modelo || '', v.cor || '',
        veiculoAtivo(v) ? 'ATIVO' : 'INATIVO',
        v.base_operacao || '', v.categoria_frota || v.tipo_frota || '',
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'cadastro-veiculos.csv';
    link.click();
}

function imprimirQrVeiculos() {
    const ids = Array.from(document.querySelectorAll('[data-vei-check]:checked')).map((el) => el.dataset.veiCheck);
    const lista = (ids.length ? veiculosCache.filter((v) => ids.includes(String(v.id))) : veiculosCache).slice(0, 12);
    if (!lista.length) {
        showToast('Nenhum veículo para gerar QR Code.', 'info');
        return;
    }
    const html = lista.map((v) => `
        <div style="width:180px;border:1px solid #ccc;padding:10px;text-align:center;margin:8px;">
            <strong>${v.placa || ''}</strong><br>
            <small>${v.modelo || ''}</small><br>
            <img alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(v.placa || v.id)}" />
        </div>
    `).join('');
    const win = window.open('', '_blank');
    win.document.write(`<html><body style="font-family:Montserrat,sans-serif;display:flex;flex-wrap:wrap;">${html}</body></html>`);
    win.document.close();
    win.print();
}


// ─────────────────────────────────────────────────────────────
// RENDER & MODAL: EQUIPES
// ─────────────────────────────────────────────────────────────
function renderEquipesTable(data) {
    renderTable('tableEquipesBody', data, row => {
        const motoristaNome = row.motorista_nome || '—';
        return `
            <td><strong>${row.nome || '—'}</strong></td>
            <td>👤 ${motoristaNome}</td>
            <td><small>${row.membros_info || 'Nenhum membro adicional'}</small></td>
            <td>${statusBadge(row.ativo ? 'Ativo' : 'Inativo')}</td>
            ${actionButtons(row.id, 'btn-edit-eq', 'btn-del-eq')}`;
    }, 5);

    attachEvents('tableEquipesBody', 'btn-edit-eq', 'btn-del-eq',
        equipesCache, openModalEquipe, '/cadastros/equipes/');
}

function openModalEquipe(existente = null) {
    const isEdit = !!existente;
    
    const funcionariosComUsuario = funcionariosCache.filter(f => Number.isInteger(f.usuario_id));
    const opcoesFuncionarios = [
        {
            value: '',
            label: funcionariosComUsuario.length
                ? 'Selecione um funcionário...'
                : 'Nenhum funcionário vinculado a usuário (opcional)',
        },
        ...funcionariosComUsuario.map(f => {
            const nomeF = (f.first_name || f.last_name)
                ? `${f.first_name || ''} ${f.last_name || ''}`.trim()
                : (f.nome || f.username || 'Sem Nome');
            return {
                // Equipe.motorista referencia core.Usuario (não Funcionario)
                value: f.usuario_id,
                label: `${nomeF} — CPF: ${f.cpf || 'N/D'}`
            };
        })
    ];

    openModal({
        title: isEdit ? '✏️ Editar Equipe' : '👥 Nova Equipe Operacional',
        confirmLabel: isEdit ? 'Salvar Alterações' : 'Cadastrar Equipe',
        fields: [
            {
                id: 'nome', label: 'Nome da Equipe',
                value: existente?.nome || '', placeholder: 'Ex: Equipe Alpha — Rota SP', required: true
            },
            {
                id: 'motorista', label: 'Motorista Principal (Puxado de Funcionários)', type: 'select',
                value: existente?.motorista || '',
                options: opcoesFuncionarios
            },
            {
                id: 'membros_info', label: 'Membros / Ajudantes da Equipe', type: 'textarea',
                value: existente?.membros_info || '', placeholder: 'Ex: João Ajudante, Pedro Auxiliar',
                fullWidth: true
            },
            {
                id: 'ativo', label: 'Status', type: 'select',
                value: existente?.ativo !== false ? 'true' : 'false',
                options: [{ value: 'true', label: 'Ativo' }, { value: 'false', label: 'Inativo' }]
            }
        ],
        onConfirm: async (data) => {
            if (!data.nome?.trim())
                throw new Error('O nome da equipe é obrigatório.');

            const payload = {
                nome: data.nome.trim(),
                motorista: data.motorista ? parseInt(data.motorista, 10) : null,
                membros_info: data.membros_info || '',
                ativo: data.ativo !== 'false',
            };

            if (isEdit) {
                await api.request(`/cadastros/equipes/${existente.id}/`, 'PATCH', payload);
            } else {
                await api.request('/cadastros/equipes/', 'POST', payload);
            }
            await loadEquipes();
            return { mensagem: `Equipe ${isEdit ? 'atualizada' : 'cadastrada'} com sucesso!` };
        }
    });
}


// ─────────────────────────────────────────────────────────────
// RENDER & MODAL: EMPRESA / PESSOA
// ─────────────────────────────────────────────────────────────
function renderPessoasTable(data) {
    renderTable('tablePessoasBody', data, row => {
        const cidadeUf = [row.cidade, row.uf].filter(Boolean).join(' / ') || '—';
        return `
            <td>
                <div class="user-pill">
                    <div class="user-avatar">${initials(row.nome || '')}</div>
                    <span><strong>${row.nome || '—'}</strong></span>
                </div>
            </td>
            <td>${row.documento || '—'}</td>
            <td><span class="badge badge--vinho">${row.tipo_label || (row.tipo === 'FISICA' ? 'Pessoa Física' : 'Pessoa Jurídica')}</span></td>
            <td><small>${row.papeis_label || row.papeis || '—'}</small></td>
            <td>${cidadeUf}</td>
            <td>${row.origem === 'EMISSAO'
                ? '<span class="badge badge--info">Emissão</span>'
                : '<span class="badge badge--accent">Manual</span>'}</td>
            <td>${row.qtd_emissoes || 0}</td>
            ${actionButtons(row.id, 'btn-edit-pessoa', 'btn-del-pessoa')}`;
    }, 8);

    attachEvents('tablePessoasBody', 'btn-edit-pessoa', 'btn-del-pessoa',
        pessoasCache, openModalPessoa, '/cadastros/pessoas/');
}

function openModalPessoa(existente = null) {
    const isEdit = !!existente;
    openModal({
        title: isEdit ? '✏️ Editar Empresa / Pessoa' : '🏢 Nova Empresa / Pessoa',
        confirmLabel: isEdit ? 'Salvar Alterações' : 'Cadastrar',
        fields: [
            {
                id: 'nome', label: 'Nome',
                value: existente?.nome || '', placeholder: 'Razão social ou nome completo', required: true
            },
            {
                id: 'documento', label: 'CNPJ / CPF',
                value: existente?.documento || '', placeholder: '00.000.000/0000-00'
            },
            {
                id: 'tipo', label: 'Tipo', type: 'select',
                value: existente?.tipo || 'JURIDICA',
                options: [
                    { value: 'JURIDICA', label: 'Pessoa Jurídica' },
                    { value: 'FISICA', label: 'Pessoa Física' },
                ]
            },
            {
                id: 'papeis', label: 'Papel na operação', type: 'select',
                value: existente?.papeis || 'DESTINATARIO',
                options: [
                    { value: 'DESTINATARIO', label: 'Destinatário' },
                    { value: 'REMETENTE', label: 'Remetente' },
                ]
            },
            {
                id: 'endereco', label: 'Endereço',
                value: existente?.endereco || '', placeholder: 'Rua, avenida, quadra...'
            },
            {
                id: 'cidade', label: 'Cidade',
                value: existente?.cidade || ''
            },
            {
                id: 'uf', label: 'UF',
                value: existente?.uf || '', placeholder: 'DF'
            },
            {
                id: 'ativo', label: 'Status', type: 'select',
                value: existente?.ativo !== false ? 'true' : 'false',
                options: [{ value: 'true', label: 'Ativo' }, { value: 'false', label: 'Inativo' }]
            },
        ],
        onConfirm: async (data) => {
            const payload = {
                nome: (data.nome || '').trim(),
                documento: (data.documento || '').trim(),
                tipo: data.tipo || 'JURIDICA',
                papeis: data.papeis || 'DESTINATARIO',
                endereco: (data.endereco || '').trim(),
                cidade: (data.cidade || '').trim(),
                uf: (data.uf || '').trim().toUpperCase(),
                origem: existente?.origem || 'MANUAL',
                ativo: data.ativo !== 'false',
            };
            if (!payload.nome) throw new Error('O nome é obrigatório.');
            if (isEdit) {
                await api.request(`/cadastros/pessoas/${existente.id}/`, 'PATCH', payload);
            } else {
                await api.request('/cadastros/pessoas/', 'POST', payload);
            }
            await loadPessoas();
            return { mensagem: `Cadastro ${isEdit ? 'atualizado' : 'criado'} com sucesso!` };
        }
    });
}