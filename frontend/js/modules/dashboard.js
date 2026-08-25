// frontend/js/modules/dashboard.js
import { indicadoresService, authService, authStorage } from '../api/api.js?v=17';

let pollTimer = null;

function initDashboard() {
    initSidebar();

    // 1. Guard de Autenticação
    const token = authStorage.getToken();
    if (!token) {
        authService.logout();
        return;
    }

    // 2. Preenche os dados do usuário logado na interface
    loadUserProfile();

    // 3. Evento de Logout na Sidebar
    document.querySelector('.sidebar__logout')?.addEventListener('click', (e) => {
        e.preventDefault();
        stopPolling();
        authService.logout();
    });

    // 4. Inicializa os eventos de clique dos Atalhos de Acesso Rápido
    initShortcuts();

    // 5. Primeira atualização imediata
    updateDashboardCards();

    // 6. Inicia atualização em tempo real (Polling a cada 30 segundos)
    startPolling(30000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard, { once: true });
} else {
    initDashboard();
}

function initSidebar() {
    if (window.__tmsSidebarInitialized) {
        return;
    }

    const sidebar = document.querySelector('.sidebar');
    let toggle = document.getElementById('sidebarToggle');
    let backdrop = document.querySelector('.sidebar-backdrop');

    if (!sidebar) {
        return;
    }

    if (!toggle) {
        toggle = document.createElement('button');
        toggle.id = 'sidebarToggle';
        toggle.type = 'button';
        toggle.className = 'sidebar-toggle';
        toggle.setAttribute('aria-label', 'Abrir menu');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = '☰';
        document.body.insertBefore(toggle, document.body.firstChild);
    }

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

    if (!window.__tmsSidebarReady) {
        window.addEventListener('resize', () => {
            if (window.innerWidth > 920) {
                closeSidebar();
            }
        }, { passive: true });
        window.__tmsSidebarReady = true;
    }

    window.__tmsSidebarInitialized = true;
    closeSidebar();
}

// Limpa o temporizador ao descarregar a página
window.addEventListener('beforeunload', () => {
    stopPolling();
});

/**
 * Preenche o Header com as informações do usuário logado no localStorage
 */
function loadUserProfile() {
    const user = authStorage.getUser();
    if (!user) return;

    const roleEl = document.querySelector('.header__role');
    const nameEl = document.querySelector('.header__name');

    if (roleEl) {
        roleEl.textContent = `Perfil: ${user.role || 'Usuário'}`;
    }
    if (nameEl) {
        nameEl.textContent = user.nome || user.email || 'Operações Breton';
    }
}

/**
 * Mapeia e vincula os botões de atalho rápido às respectivas páginas
 */
function initShortcuts() {
    const buttons = document.querySelectorAll('.shortcut-btn');
    if (buttons.length < 4) return;

    // Botão 1: Novo Pedido -> redireciona para Pedidos & Cargas
    buttons[0].addEventListener('click', () => {
        window.location.href = 'pedidos.html';
    });

    // Botão 2: Emitir Carga -> redireciona para Roteirização
    buttons[1].addEventListener('click', () => {
        window.location.href = 'roteirizacao.html';
    });

    // Botão 3: Rastrear Viagem -> redireciona para Torre de Controle
    buttons[2].addEventListener('click', () => {
        window.location.href = 'torre-controle.html';
    });

    // Botão 4: Agendar Montagem -> redireciona para Logística Premium
    buttons[3].addEventListener('click', () => {
        window.location.href = 'entrega-premium.html';
    });
}

function startPolling(intervalMs = 30000) {
    stopPolling();
    pollTimer = setInterval(() => {
        if (!document.hidden) {
            updateDashboardCards();
        }
    }, intervalMs);
}

function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

/**
 * Busca e renderiza os indicadores reais no Dashboard
 */
async function updateDashboardCards() {
    try {
        const data = await indicadoresService.getDashboard();

        if (!data) return;

        // 1. Pedidos em Trânsito
        const elOrders = document.getElementById('kpiOrders');
        if (elOrders && data.pedidos_em_transito !== undefined && data.pedidos_em_transito !== null) {
            elOrders.textContent = data.pedidos_em_transito;
        }

        // 2. Índice OTIF
        const elOtif = document.getElementById('kpiOtif');
        if (elOtif) {
            let percentual = null;
            if (typeof data.otif === 'number') {
                percentual = data.otif;
            } else if (data.otif?.otif_percentual !== undefined) {
                percentual = data.otif.otif_percentual;
            }

            if (percentual !== null && percentual !== undefined) {
                elOtif.textContent = `${Number(percentual).toFixed(1)}%`;
            }
        }

        // 3. Emissão de CO2
        const elCo2 = document.getElementById('kpiCo2');
        if (elCo2 && data.emissao_co2 !== undefined && data.emissao_co2 !== null) {
            elCo2.textContent = typeof data.emissao_co2 === 'number' 
                ? `${data.emissao_co2} t` 
                : data.emissao_co2;
        }

        // 4. NPS / Satisfação
        const elNps = document.getElementById('kpiNps');
        if (elNps && data.satisfacao_nps !== undefined && data.satisfacao_nps !== null) {
            elNps.textContent = data.satisfacao_nps;
        }

    } catch (err) {
        console.warn('[Dashboard Real-Time] Sincronização temporariamente indisponível:', err.message || err);
        // Se a requisição retornar 401 (Não autorizado/Token expirado), encerra a sessão
        if (err.status === 401 || err.message?.includes('401')) {
            stopPolling();
            authService.logout();
        }
    }
}