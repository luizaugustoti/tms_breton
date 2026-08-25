// frontend/js/utils/auth-guard.js
import { authStorage, authService } from '../api/api.js?v=15';

const PAGE_ACCESS = {
    'dashboard.html': ['TI', 'Admin', 'Gestor', 'Gestor Operacional', 'Operacional', 'Motorista', 'Ajudante'],
    'painel-motorista.html': ['TI', 'Admin', 'Gestor', 'Gestor Operacional', 'Operacional', 'Motorista', 'Ajudante'],
    'cadastros.html': ['TI', 'Admin', 'Gestor', 'Gestor Operacional', 'Operacional'],
    'pedidos.html': ['TI', 'Admin', 'Gestor', 'Gestor Operacional', 'Operacional'],
    'roteirizacao.html': ['TI', 'Admin', 'Gestor', 'Gestor Operacional', 'Operacional'],
    'indicadores.html': ['TI', 'Admin', 'Gestor', 'Gestor Operacional', 'Operacional'],
    'estoque.html': ['TI', 'Admin', 'Gestor', 'Gestor Operacional', 'Operacional'],
    'satisfacao.html': ['TI', 'Admin', 'Gestor', 'Gestor Operacional', 'Operacional'],
    'avaliacoes.html': ['TI', 'Admin', 'Gestor', 'Gestor Operacional', 'Operacional'],
    'administracao.html': ['TI', 'Admin'],
};

function normalizeRole(value) {
    if (!value) return '';
    const normalized = String(value).trim().toLowerCase().replace(/[_-]/g, ' ');
    const aliases = {
        'gestor operacional': 'Gestor Operacional',
        'gestor': 'Gestor',
        'operacional': 'Operacional',
        'motorista': 'Motorista',
        'ajudante': 'Ajudante',
        'ti': 'TI',
        'admin': 'Admin',
    };
    return aliases[normalized] || String(value).trim();
}

function getCurrentPageName() {
    return (window.location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();
}

export function userHasPageAccess(role, pageName) {
    const normalizedRole = normalizeRole(role);
    const allowed = PAGE_ACCESS[pageName] || PAGE_ACCESS['dashboard.html'];
    return allowed.includes(normalizedRole);
}

export function checkAuth() {
    if (!authStorage.getToken()) {
        authService.logout();
        return false;
    }

    const currentPage = getCurrentPageName();
    const user = authStorage.getUser();
    const currentRole = normalizeRole(user?.role || user?.cargo || '');

    if (currentPage === 'login.html') {
        return true;
    }

    const targetPage = currentPage in PAGE_ACCESS ? currentPage : 'dashboard.html';
    if (currentPage === 'painel-motorista.html') {
        return true;
    }
    if (!userHasPageAccess(currentRole, targetPage)) {
        const fallback = ['Motorista', 'Ajudante'].includes(currentRole) ? 'painel-motorista.html' : 'dashboard.html';
        window.location.replace(`./${fallback}`);
        return false;
    }

    return true;
}
