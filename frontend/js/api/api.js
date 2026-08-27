// frontend/js/services/api.js
// API Service Refatorado com suporte a PATCH, Enums, Paginação e Exports Auxiliares


import { initLineIcons } from '../utils/icons.js';

function normalizeBase(url) {
    return String(url || '').trim().replace(/\/+$/, '');
}

function tmsRootFromPath() {
    const path = window.location.pathname || '/';
    const match = path.match(/^(.*)\/frontend(?:\/|$)/i);
    return match ? match[1] : '';
}

export function getLoginHref() {
    const path = window.location.pathname || '/';
    if (/\/frontend\/pages\//i.test(path) || /\/pages\//i.test(path)) {
        return '../index.html';
    }
    return './index.html';
}

export function candidateApiBases() {
    const origin = window.location.origin;
    const root = tmsRootFromPath();
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const seen = [];
    const add = (url) => {
        const base = normalizeBase(url);
        if (base && !seen.includes(base)) seen.push(base);
    };

    add(window.TMS_API_BASE);
    add(localStorage.getItem('api_base_url'));
    if (root) add(`${origin}${root}/api/v1`);
    if (window.location.protocol === 'file:') add('http://127.0.0.1:8002/api/v1');
    add(`${origin}/api/v1`);
    if (isLocal && window.location.port !== '8002') add('http://127.0.0.1:8002/api/v1');
    return seen;
}

export function resolveApiBaseUrl() {
    return candidateApiBases()[0] || `${window.location.origin}/api/v1`;
}

let API_BASE_URL = resolveApiBaseUrl();

export function getApiBaseUrl() {
    return API_BASE_URL;
}

export function setApiBaseUrl(url) {
    API_BASE_URL = normalizeBase(url);
    localStorage.setItem('api_base_url', API_BASE_URL);
}

const extractApiErrorMessage = (errorData, status) => {
    if (!errorData || typeof errorData !== 'object') {
        return `Erro ${status}`;
    }
    if (errorData.detail) return String(errorData.detail);
    if (errorData.message) return String(errorData.message);

    for (const [field, value] of Object.entries(errorData)) {
        if (Array.isArray(value) && value.length) {
            return `${field}: ${value[0]}`;
        }
        if (typeof value === 'string' && value.trim()) {
            return `${field}: ${value}`;
        }
    }
    return `Erro ${status}`;
};

class ApiService {
    constructor() {
        this.token = localStorage.getItem('access_token');
    }

    setToken(token) {
        this.token = token;
        localStorage.setItem('access_token', token);
    }

    clearToken() {
        this.token = null;
        localStorage.removeItem('access_token');
    }

    async request(endpoint, method = 'GET', data = null, params = null) {
        let cleanEndpoint = String(endpoint || '').replace(/\/{2,}/g, '/');
        if (!cleanEndpoint.startsWith('/')) {
            cleanEndpoint = '/' + cleanEndpoint;
        }
        if (!cleanEndpoint.endsWith('/') && !cleanEndpoint.includes('?')) {
            cleanEndpoint += '/';
        }

        const url = new URL(`${API_BASE_URL}${cleanEndpoint}`);
        
        if (params) {
            Object.keys(params).forEach(key => {
                if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
                    url.searchParams.append(key, params[key]);
                }
            });
        }

        const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
        const options = { method, headers: { 'Accept': 'application/json' } };
        if (!isFormData) {
            options.headers['Content-Type'] = 'application/json';
        }

        if (this.token) {
            options.headers['Authorization'] = 'Bearer ' + this.token;
        }

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            options.body = isFormData ? data : JSON.stringify(data);
        }

        const response = await fetch(url.toString(), options);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw {
                status: response.status,
                data: errorData,
                message: extractApiErrorMessage(errorData, response.status)
            };
        }

        if (response.status === 204) {
            return null;
        }

        return await response.json();
    }

    // === ENUMS PARA SELETORES ===
    getEnums() {
        return {
            statusVeiculo: ['Disponível', 'Em Trânsito', 'Manutenção'],
            statusMotorista: ['Disponível', 'Em Viagem', 'Folga'],
            vinculoMotorista: ['Próprio', 'Agregado', 'Terceiro'],
            categoriaCNH: ['B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'],
            tipoPessoa: ['FISICA', 'JURIDICA']
        };
    }

    // === CLIENTES ===
    async getClientes(params = {}) {
        return this.request('/cadastros/clientes', 'GET', null, {
            skip: params.skip || 0,
            limit: params.limit || 20,
            search: params.search || undefined,
            active: params.active !== undefined ? params.active : undefined
        });
    }

    async getCliente(id) {
        return this.request(`/cadastros/clientes/${id}`, 'GET');
    }

    async createCliente(data) {
        return this.request('/cadastros/clientes', 'POST', data);
    }

    async updateCliente(id, data) {
        const cleanData = this.cleanPatchData(data);
        return this.request(`/cadastros/clientes/${id}`, 'PATCH', cleanData);
    }

    async deleteCliente(id) {
        return this.request(`/cadastros/clientes/${id}`, 'DELETE');
    }

    // === VEÍCULOS ===
    async getVeiculos(params = {}) {
        return this.request('/cadastros/veiculos', 'GET', null, {
            skip: params.skip || 0,
            limit: params.limit || 20,
            search: params.search || undefined,
            status: params.status || undefined
        });
    }

    async getVeiculo(id) {
        return this.request(`/cadastros/veiculos/${id}`, 'GET');
    }

    async createVeiculo(data) {
        return this.request('/cadastros/veiculos', 'POST', data);
    }

    async updateVeiculo(id, data) {
        const cleanData = this.cleanPatchData(data);
        return this.request(`/cadastros/veiculos/${id}`, 'PATCH', cleanData);
    }

    async deleteVeiculo(id) {
        return this.request(`/cadastros/veiculos/${id}`, 'DELETE');
    }

    // === MOTORISTAS ===
    async getMotoristas(params = {}) {
        return this.request('/cadastros/funcionarios', 'GET', null, {
            skip: params.skip || 0,
            limit: params.limit || 20,
            search: params.search || undefined,
            status: params.status || undefined,
            vinculo: params.vinculo || undefined
        });
    }

    async getMotorista(id) {
        return this.request(`/cadastros/funcionarios/${id}`, 'GET');
    }

    async createMotorista(data) {
        return this.request('/cadastros/funcionarios', 'POST', data);
    }

    async updateMotorista(id, data) {
        const cleanData = this.cleanPatchData(data);
        return this.request(`/cadastros/funcionarios/${id}`, 'PATCH', cleanData);
    }

    async deleteMotorista(id) {
        return this.request(`/cadastros/funcionarios/${id}`, 'DELETE');
    }

    // === UTILITY: Limpeza para PATCH ===
    cleanPatchData(data) {
        const clean = {};
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined && value !== null && value !== '') {
                clean[key] = value;
            }
        }
        return clean;
    }

    // === TRATAMENTO DE ERROS AMIGÁVEL ===
    handleError(error) {
        const status = error.status;
        const message = error.message;

        if (status === 400) {
            if (message.includes('CNPJ') || message.includes('CPF')) {
                return 'CNPJ/CPF já cadastrado no sistema.';
            }
            return 'Dados inválidos. Verifique os campos informados.';
        }
        if (status === 422) {
            const errors = error.data?.detail;
            if (Array.isArray(errors)) {
                return errors.map(e => e.msg || e).join(', ');
            }
            return 'Erro de validação. Verifique os dados informados.';
        }
        if (status === 401) {
            this.clearToken();
            window.location.href = getLoginHref();
            return 'Sessão expirada. Faça login novamente.';
        }
        if (status === 404) {
            return 'Registro não encontrado.';
        }
        if (status === 500) {
            return 'Erro interno do servidor. Tente novamente mais tarde.';
        }
        return message || 'Erro na comunicação com o servidor.';
    }
}

// 🟢 Instância global única
export const api = new ApiService();

// 🟢 Helper para chamadas diretas como no cadastros.js
export async function apiFetch(endpoint, options = {}) {
    const method = options.method || 'GET';
    let data = null;
    if (options.body) {
        try {
            data = JSON.parse(options.body);
        } catch (e) {
            data = options.body;
        }
    }
    return await api.request(endpoint, method, data);
}

// 🟢 Mapeamentos para o cadastros.js e outros módulos
export const cadastrosService = {
    getClients: (params) => api.getClientes(params),
    createClient: (data) => api.createCliente(data),
    getVehicles: (params) => api.getVeiculos(params),
    createVehicle: (data) => api.createVeiculo(data),
    getDrivers: (params) => api.getMotoristas(params),
    createDriver: (data) => api.createMotorista(data),
    getRoutes: () => api.request('/cadastros/rotas', 'GET'),
    createRoute: (data) => api.request('/cadastros/rotas', 'POST', data),
    getFreightTables: () => api.request('/cadastros/tabelas-frete', 'GET'),
    createFreightTable: (data) => api.request('/cadastros/tabelas-frete', 'POST', data)
};

export const financeiroService = {
    calcularFrete: (payload) => api.request('/financeiro/calcular-frete', 'POST', payload),
    createAcerto: (payload) => api.request('/financeiro/acertos', 'POST', payload),
    getCalculos: () => api.request('/financeiro/calculos', 'GET'),
    getContasReceber: () => api.request('/financeiro/contas-receber', 'GET'),
    getAcertos: () => api.request('/financeiro/acertos', 'GET'),
    getContasPagar: () => api.request('/financeiro/contas-pagar', 'GET')
};

export const documentalService = {
    emitirCTe: (payload) => api.request('/documental/cte', 'POST', payload),
    emitirMDFe: (payload) => api.request('/documental/mdfe', 'POST', payload),
    getCTes: () => api.request('/documental/cte', 'GET'),
    getMDFes: () => api.request('/documental/mdfe', 'GET'),
    encerrarMDFe: (id, payload) => api.request(`/documental/mdfe/${id}/encerrar`, 'POST', payload)
};

export const entregaPremiumService = {
    createAgendamento: (payload) => api.request('/premium/agendamentos', 'POST', payload),
    getAgendamentos: () => api.request('/premium/agendamentos', 'GET'),
    registerChecklist: (id, payload) => api.request(`/premium/agendamentos/${id}/checklist`, 'POST', payload)
};

export const frotaService = {
    createManutencao: (payload) => api.request('/frota/manutencoes', 'POST', payload),
    createAbastecimento: (payload) => api.request('/frota/abastecimentos', 'POST', payload),
    getManutencoes: () => api.request('/frota/manutencoes', 'GET'),
    getAbastecimentos: () => api.request('/frota/abastecimentos', 'GET'),
    getDocumentos: () => api.request('/frota/documentos', 'GET')
};

export const roteirizacaoService = {
    getPlanos: () => api.request('/roteirizacao/planos', 'GET'),
    simular: (payload) => api.request('/roteirizacao/simular', 'POST', payload)
};

export const torreControleService = {
    createViagem: (payload) => api.request('/torre-controle/viagens', 'POST', payload),
    getViagens: () => api.request('/torre-controle/viagens', 'GET'),
    getAlertas: () => api.request('/torre-controle/alertas', 'GET'),
    updateAlertaStatus: (id, payload) => api.request(`/torre-controle/alertas/${id}/status`, 'PATCH', payload)
};

function initResponsiveSidebar() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return;
    }

    if (window.__tmsSidebarInitialized) {
        return;
    }

    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) {
        return;
    }

    let toggle = document.getElementById('sidebarToggle');
    if (!toggle) {
        toggle = document.createElement('button');
        toggle.id = 'sidebarToggle';
        toggle.type = 'button';
        toggle.className = 'sidebar-toggle';
        toggle.setAttribute('aria-label', 'Abrir menu');
        toggle.setAttribute('aria-controls', 'sidebarNavigation');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = '☰';
        document.body.insertBefore(toggle, document.body.firstChild);
    }

    let backdrop = document.querySelector('.sidebar-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'sidebar-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');
        document.body.insertBefore(backdrop, document.body.firstChild);
    }

    const setSidebarState = (isOpen) => {
        sidebar.classList.toggle('is-open', isOpen);
        document.body.classList.toggle('sidebar-open', isOpen);
        toggle.classList.toggle('is-active', isOpen);
        toggle.setAttribute('aria-expanded', String(isOpen));
        toggle.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
    };

    const closeSidebar = () => setSidebarState(false);
    const openSidebar = () => setSidebarState(true);

    toggle.addEventListener('click', () => {
        const isOpen = sidebar.classList.contains('is-open');
        if (isOpen) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    backdrop.addEventListener('click', closeSidebar);

    sidebar.querySelectorAll('.sidebar__link').forEach((link) => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 920) {
                closeSidebar();
            }
        });
    });

    if (!window.__tmsSidebarResizeBound) {
        window.addEventListener('resize', () => {
            if (window.innerWidth > 920) {
                closeSidebar();
            }
        }, { passive: true });
        window.__tmsSidebarResizeBound = true;
    }

    window.__tmsSidebarInitialized = true;
    closeSidebar();
}

const SUBMENU_MAP = {
    'dashboard.html': {
        label: 'Dashboard',
        items: [
            { label: 'Visão Geral', scroll: '.kpi-grid' },
            { label: 'Atalhos', scroll: '.shortcuts' },
            { label: 'Operacional', href: 'pedidos.html' },
            { label: 'Indicadores', href: 'indicadores.html' },
        ],
    },
    'cadastros.html': {
        label: 'Cadastros',
        items: [
            { label: 'Empresa / Pessoa', tab: 'pessoas' },
            { label: 'Usuários', tab: 'usuarios' },
            { label: 'Funcionários', tab: 'funcionarios' },
            { label: 'Equipes', tab: 'equipes' },
            { label: 'Estoque', tab: 'estoque' },
            { label: 'Veículos', tab: 'veiculos' },
        ],
    },
    'estoque.html': {
        label: 'Estoque',
        items: [
            { label: 'Painel', scroll: '.wh-kpi-grid' },
            { label: 'Itens', scroll: '.table-responsive' },
            { label: 'Nova Entrada', click: '#btnEntrada' },
            { label: 'Baixa Manual', click: '#btnBaixa' },
            { label: 'Movimentações', scroll: '.mov-timeline' },
            { label: 'Cadastro de SKUs', href: 'cadastros.html#estoque' },
        ],
    },
    'pedidos.html': {
        label: 'Operacional',
        items: [
            {
                label: 'Emissão',
                view: 'lista',
                href: 'pedidos.html#lista',
                children: [
                    { label: 'Emissão manual', view: 'manual', href: 'pedidos.html#manual' },
                    { label: 'Emissão com PDF', view: 'pdf', href: 'pedidos.html#pdf' },
                ],
            },
            {
                label: 'Manifestar',
                view: 'propria',
                href: 'roteirizacao.html#propria',
                children: [
                    { label: 'Manifesto', view: 'propria', href: 'roteirizacao.html#propria' },
                    { label: 'Painel de entrega', view: 'painel-entrega', href: 'roteirizacao.html#painel-entrega' },
                ],
            },
        ],
    },
    'roteirizacao.html': {
        label: 'Operacional',
        items: [
            {
                label: 'Emissão',
                view: 'lista',
                href: 'pedidos.html#lista',
                children: [
                    { label: 'Emissão manual', view: 'manual', href: 'pedidos.html#manual' },
                    { label: 'Emissão com PDF', view: 'pdf', href: 'pedidos.html#pdf' },
                ],
            },
            {
                label: 'Manifestar',
                view: 'propria',
                href: 'roteirizacao.html#propria',
                children: [
                    { label: 'Manifesto', view: 'propria', href: 'roteirizacao.html#propria' },
                    { label: 'Painel de entrega', view: 'painel-entrega', href: 'roteirizacao.html#painel-entrega' },
                ],
            },
        ],
    },
    'indicadores.html': {
        label: 'Indicadores',
        items: [
            { label: 'KPIs', scroll: '#kpiGrid' },
            { label: 'Evolução', scroll: '.charts-grid' },
            { label: 'OTIF', scroll: '#otifGauges' },
            { label: 'Satisfação', href: 'satisfacao.html' },
        ],
    },
    'satisfacao.html': {
        label: 'Satisfação',
        items: [
            { label: 'NPS', scroll: '#npsHero' },
            { label: 'Qualidade', scroll: '#satKpiGrid' },
            { label: 'Feedbacks', scroll: '.feedback-toolbar' },
            { label: 'Avaliações', href: 'avaliacoes.html' },
        ],
    },
    'avaliacoes.html': {
        label: 'Avaliações',
        items: [
            { label: 'Central', scroll: '.data-table' },
            { label: 'NPS', href: 'satisfacao.html' },
        ],
    },
    'administracao.html': {
        label: 'Administração',
        items: [
            { label: 'Usuários & Perfis', tab: 'usuarios' },
            { label: 'Parâmetros', tab: 'parametros' },
            { label: 'Logs', tab: 'logs' },
        ],
    },
};

function getCurrentPageName() {
    const page = (window.location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();
    return page || 'dashboard.html';
}

function resolveModuleFromHref(href) {
    if (!href) return '';
    const file = String(href).split('#')[0].split('?')[0].split('/').pop().toLowerCase();
    return file;
}

function activatePageTab(tabId) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) {
        btn.click();
        return true;
    }
    const panel = document.getElementById(`tab-${tabId}`);
    if (panel) {
        document.querySelectorAll('.tab-content').forEach((el) => el.classList.remove('tab-content--active'));
        panel.classList.add('tab-content--active');
        return true;
    }
    return false;
}

function runSubmenuAction(item, options = {}) {
    if (item.tab) {
        if (typeof options.onTabSelect === 'function') {
            options.onTabSelect(item.tab);
        }
        activatePageTab(item.tab);
        history.replaceState(null, '', `#${item.tab}`);
    }
    if (item.scroll) {
        document.querySelector(item.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (item.click) {
        document.querySelector(item.click)?.click();
    }
    if (item.view) {
        const targetPage = resolveModuleFromHref(item.href || window.location.pathname);
        if (!item.href || targetPage === getCurrentPageName()) {
            window.dispatchEvent(new CustomEvent('tms:show-view', { detail: { view: item.view } }));
            history.replaceState(null, '', `#${item.view}`);
            return;
        }
        window.location.assign(item.href);
    }
}

function bindSubmenuAction(el, item, list, options = {}) {
    el.addEventListener('click', (event) => {
        if (item.href && item.href.includes('#') && resolveModuleFromHref(item.href) === getCurrentPageName()) {
            event.preventDefault();
        }
        if (!item.href || item.view) {
            event.preventDefault();
        }

        list.querySelectorAll('.submenu__link').forEach((node) => node.classList.remove('submenu__link--active'));
        el.classList.add('submenu__link--active');
        el.closest('.submenu__item--has-children')?.querySelector('.submenu__link--parent')?.classList.add('submenu__link--active');
        document.querySelectorAll('.submenu__item--has-children.is-open').forEach((node) => {
            if (!el.classList.contains('submenu__link--parent')) {
                node.classList.remove('is-open');
            }
        });

        runSubmenuAction(item, options);
    });
}

function createSubmenuLink(item, list, options = {}, extraClass = '') {
    const el = document.createElement(item.href ? 'a' : 'button');
    el.className = `submenu__link${extraClass ? ` ${extraClass}` : ''}`;
    el.textContent = item.label;
    if (item.href) {
        el.href = item.href;
    } else {
        el.type = 'button';
    }
    bindSubmenuAction(el, item, list, options);
    return el;
}

function itemMatchesHash(item, hash) {
    if (!hash || !item) return false;
    if (item.view && item.view === hash) return true;
    if (item.tab && item.tab === hash) return true;
    const hrefHash = String(item.href || '').split('#')[1] || '';
    if (hrefHash && hrefHash === hash) return true;
    return (item.children || []).some((child) => itemMatchesHash(child, hash));
}

function renderSubmenuItems(container, moduleKey, options = {}) {
    const { markFirstActive = true, activeTab = '' } = options;
    const config = SUBMENU_MAP[moduleKey];
    container.innerHTML = '';

    const label = document.createElement('span');
    label.className = 'submenu__label';
    label.textContent = config?.label || 'Menu';
    container.appendChild(label);

    const list = document.createElement('div');
    list.className = 'submenu__items';
    container.appendChild(list);

    const items = config?.items || [];
    if (!items.length) {
        const empty = document.createElement('span');
        empty.className = 'submenu__empty';
        empty.textContent = 'Nenhum submenu neste módulo';
        list.appendChild(empty);
        return;
    }

    items.forEach((item, index) => {
        const isActive = itemMatchesHash(item, activeTab) || (markFirstActive && !activeTab && index === 0);

        if (item.children?.length) {
            const wrap = document.createElement('div');
            wrap.className = 'submenu__item submenu__item--has-children';

            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'submenu__link submenu__link--parent';
            toggle.innerHTML = `${item.label} <span class="submenu__caret">▾</span>`;
            if (isActive) {
                toggle.classList.add('submenu__link--active');
            }

            const drop = document.createElement('div');
            drop.className = 'submenu__dropdown';
            item.children.forEach((child) => {
                const childLink = createSubmenuLink(child, list, options, 'submenu__link--child');
                if (itemMatchesHash(child, activeTab)) {
                    childLink.classList.add('submenu__link--active');
                }
                drop.appendChild(childLink);
            });

            toggle.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                wrap.classList.add('is-open');
                list.querySelectorAll('.submenu__item--has-children').forEach((other) => {
                    if (other !== wrap) other.classList.remove('is-open');
                });
                list.querySelectorAll('.submenu__link').forEach((node) => node.classList.remove('submenu__link--active'));
                toggle.classList.add('submenu__link--active');
                runSubmenuAction(item, options);
            });

            wrap.appendChild(toggle);
            wrap.appendChild(drop);
            list.appendChild(wrap);
            return;
        }

        const link = createSubmenuLink(item, list, options);
        if (isActive) {
            link.classList.add('submenu__link--active');
        }
        list.appendChild(link);
    });
}

function initSubmenuBar(sidebarEl) {
    if (document.querySelector('.submenu')) {
        return;
    }

    const currentPage = getCurrentPageName();
    const sidebar = sidebarEl || document.querySelector('.sidebar');
    if (!sidebar) {
        return;
    }

    let topNav = sidebar.parentElement;
    if (!topNav?.classList.contains('top-nav')) {
        topNav = document.createElement('div');
        topNav.className = 'top-nav';
        sidebar.parentNode.insertBefore(topNav, sidebar);
        topNav.appendChild(sidebar);
    }

    const submenu = document.createElement('nav');
    submenu.className = 'submenu';
    submenu.setAttribute('aria-label', 'Submenu do módulo');
    topNav.appendChild(submenu);
    document.body.classList.add('has-submenu');

    let selectedTab = (window.location.hash || '').replace('#', '');
    if (currentPage === 'roteirizacao.html' && !selectedTab) {
        selectedTab = 'painel-entrega';
    }
    const paintCurrent = () => renderSubmenuItems(submenu, currentPage, {
        markFirstActive: true,
        activeTab: selectedTab,
        onTabSelect: (tabId) => { selectedTab = tabId; },
    });

    paintCurrent();

    if (!window.__tmsSubmenuOutsideBound) {
        document.addEventListener('click', (event) => {
            if (event.target.closest('.submenu__item--has-children')) {
                return;
            }
            document.querySelectorAll('.submenu__item--has-children.is-open').forEach((item) => {
                item.classList.remove('is-open');
            });
        });
        window.__tmsSubmenuOutsideBound = true;
    }

    const hashTab = (window.location.hash || '').replace('#', '');
    if (hashTab) {
        setTimeout(() => activatePageTab(hashTab), 0);
    }
}

const INACTIVITY_TIMEOUT_MS = 180000;
let inactivityTimer = null;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initLineIcons();
        initResponsiveSidebar();
        initSubmenuBar();
        if (localStorage.getItem('access_token')) {
            startInactivityMonitor();
        }
    }, { once: true });
} else {
    initLineIcons();
    initResponsiveSidebar();
    initSubmenuBar();
    if (localStorage.getItem('access_token')) {
        startInactivityMonitor();
    }
}

export function stopInactivityMonitor() {
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }
}

export function resetInactivityTimer() {
    if (typeof window === 'undefined') {
        return;
    }

    if (!localStorage.getItem('access_token')) {
        stopInactivityMonitor();
        return;
    }

    stopInactivityMonitor();
    inactivityTimer = setTimeout(() => {
        const message = 'Sessão encerrada por inatividade por motivos de segurança.';
        api.clearToken();
        localStorage.removeItem('user');
        localStorage.setItem('session_expired_message', message);
        window.location.replace(`${getLoginHref()}?message=${encodeURIComponent(message)}`);
    }, INACTIVITY_TIMEOUT_MS);
}

export function startInactivityMonitor() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return;
    }

    if (window.__tmsInactivityMonitorStarted || !localStorage.getItem('access_token')) {
        return;
    }

    const activityEvents = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    activityEvents.forEach((eventName) => {
        document.addEventListener(eventName, resetInactivityTimer, { passive: true });
    });

    window.addEventListener('beforeunload', stopInactivityMonitor, { once: true });
    window.__tmsInactivityMonitorStarted = true;
    resetInactivityTimer();
}

export const authService = {
    logout: () => {
        stopInactivityMonitor();
        api.clearToken();
        localStorage.removeItem('user');
        localStorage.removeItem('session_expired_message');
        window.location.href = getLoginHref();
    }
};

export const authStorage = {
    getToken: () => localStorage.getItem('access_token') || api.token || null,
    setToken: (token) => api.setToken(token),
    clearToken: () => api.clearToken(),
    getUser: () => {
        try {
            const raw = localStorage.getItem('user');
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    },
    setUser: (user) => {
        if (!user) {
            localStorage.removeItem('user');
            return;
        }
        localStorage.setItem('user', JSON.stringify(user));
    }
};

export const indicadoresService = {
    getDashboard: async () => {
        try {
            const metrics = await api.request('/indicadores/metrics', 'GET');
            return {
                pedidos_em_transito: metrics.em_transito ?? 0,
                otif: metrics.otif ?? 0,
                emissao_co2: metrics.emissao_co2 ?? '—',
                satisfacao_nps: metrics.satisfacao_nps ?? '—',
            };
        } catch (error) {
            console.warn('[indicadoresService] fallback para dados mockados:', error);
            return {
                pedidos_em_transito: 0,
                otif: 0,
                emissao_co2: '—',
                satisfacao_nps: '—',
            };
        }
    }
};