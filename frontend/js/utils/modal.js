// frontend/utils/modal.js — Motor global reutilizável de Modal & Toast TMS Breton

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

function ensureToastContainer() {
    let container = document.getElementById('tms-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'tms-toast-container';
        document.body.appendChild(container);
    }
    return container;
}

export function showToast(message, type = 'success', duration = 3500) {
    const container = ensureToastContainer();
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `tms-toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 350);
    }, duration);
}

// ============================================================
// MODAL ENGINE
// ============================================================

/**
 * Abre um modal genérico com formulário configurável.
 * @param {Object} config
 * @param {string} config.title - Título do modal
 * @param {Array}  config.fields - Array de campos: { id, label, type, placeholder, required, options, value }
 * @param {string} config.confirmLabel - Label do botão de confirmação
 * @param {Function} config.onConfirm - Callback async(formData) => { sucesso, mensagem }
 */
export function openModal({ title, fields = [], confirmLabel = 'Salvar', onConfirm }) {
    // Remove modal anterior se existir
    const existing = document.querySelector('.tms-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'tms-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'tms-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    // Header
    modal.innerHTML = `
        <div class="tms-modal__header">
            <h2 class="tms-modal__title">${title}</h2>
            <button class="tms-modal__close" id="modalCloseBtn" aria-label="Fechar">✕</button>
        </div>
        <form id="tmsModalForm" autocomplete="off">
            ${renderFields(fields)}
        </form>
        <div class="tms-modal__footer">
            <button class="btn-cancel" id="modalCancelBtn">Cancelar</button>
            <button class="btn-confirm" id="modalConfirmBtn">${confirmLabel}</button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Fecha ao clicar fora
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay); });
    document.getElementById('modalCloseBtn').addEventListener('click', () => closeModal(overlay));
    document.getElementById('modalCancelBtn').addEventListener('click', () => closeModal(overlay));

    // Confirmar
    document.getElementById('modalConfirmBtn').addEventListener('click', async () => {
        const form = document.getElementById('tmsModalForm');
        if (!form.checkValidity()) { form.reportValidity(); return; }

        // Coleta campos explícitos (mf_* gerados por renderField)
        const formData = {};
        fields.forEach(f => {
            const el = document.getElementById(`mf_${f.id}`);
            if (el) formData[f.id] = el.multiple
                ? Array.from(el.selectedOptions).map(option => option.value)
                : el.value;
        });

        // Coleta todos os inputs/selects/textareas com id dentro do form
        // (cobre campos type:'html' que injetam ids customizados como ocr_*)
        form.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
            if (!(el.id in formData)) formData[el.id] = el.value;
        });

        const confirmBtn = document.getElementById('modalConfirmBtn');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Salvando...';

        try {
            const result = await onConfirm(formData);
            closeModal(overlay);
            showToast(result?.mensagem || 'Operação realizada com sucesso!', 'success');
        } catch (err) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = confirmLabel;
            showToast(err?.message || 'Erro ao processar solicitação.', 'error');
        }
    });

    // Foco automático no primeiro campo
    setTimeout(() => {
        const firstInput = modal.querySelector('input, select, textarea');
        if (firstInput) firstInput.focus();
    }, 100);

    fields.filter(f => f.type === 'multiselect').forEach(f => {
        const select = document.getElementById(`mf_${f.id}`);
        const search = document.getElementById(`mf_${f.id}_search`);
        const options = document.getElementById(`mf_${f.id}_options`);
        const chips = document.getElementById(`mf_${f.id}_chips`);
        const trigger = document.getElementById(`mf_${f.id}_trigger`);
        const panel = document.getElementById(`mf_${f.id}_panel`);
        const renderChips = () => {
            const selectedOptions = Array.from(select.selectedOptions);
            trigger.querySelector('.tms-multiselect__summary').textContent = selectedOptions.length
                ? `${selectedOptions.length} ajudante${selectedOptions.length > 1 ? 's' : ''} selecionado${selectedOptions.length > 1 ? 's' : ''}`
                : 'Selecione os ajudantes...';
            chips.innerHTML = selectedOptions.map(option =>
                `<span class="tms-multiselect__chip">${option.textContent}<button type="button" data-value="${option.value}" aria-label="Remover ${option.textContent}">×</button></span>`
            ).join('');
            options.querySelectorAll('[data-value]').forEach(option => {
                const selected = Array.from(select.selectedOptions).some(item => item.value === option.dataset.value);
                option.classList.toggle('is-selected', selected);
                option.setAttribute('aria-checked', String(selected));
            });
            chips.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
                const option = Array.from(select.options).find(item => item.value === button.dataset.value);
                if (option) option.selected = false;
                renderChips();
            }));
        };
        trigger.addEventListener('click', () => {
            const isOpen = panel.hidden;
            panel.hidden = !isOpen;
            trigger.setAttribute('aria-expanded', String(isOpen));
            if (isOpen) search.focus();
        });
        search.addEventListener('input', () => {
            const term = search.value.trim().toLowerCase();
            options.querySelectorAll('[data-value]').forEach(option => {
                option.hidden = !!term && !option.textContent.toLowerCase().includes(term);
            });
            document.addEventListener('click', (event) => {
                if (!panel.contains(event.target) && !trigger.contains(event.target)) {
                    panel.hidden = true;
                    trigger.setAttribute('aria-expanded', 'false');
                }
            });
        });
        options.querySelectorAll('[data-value]').forEach(option => option.addEventListener('click', () => {
            const selectOption = Array.from(select.options).find(item => item.value === option.dataset.value);
            if (selectOption) selectOption.selected = !selectOption.selected;
            renderChips();
        }));
        renderChips();
    });
}

export function renderFormFields(fields) {
    return renderFields(fields);
}

function renderFields(fields) {
    const rows = [];
    let i = 0;
    while (i < fields.length) {
        const f1 = fields[i];
        const f2 = fields[i + 1];
        const isSingle = f1.fullWidth || !f2 || f2.fullWidth;
        if (isSingle) {
            rows.push(`<div class="form-row single">${renderField(f1)}</div>`);
            i += 1;
        } else {
            rows.push(`<div class="form-row">${renderField(f1)}${renderField(f2)}</div>`);
            i += 2;
        }
    }
    return rows.join('');
}

function renderField(f) {
    if (f.type === 'html') {
        return f.content || '';
    }

    const required = f.required ? 'required' : '';
    const placeholder = f.placeholder || '';
    const val = f.value !== undefined && f.value !== null ? f.value : '';
    let input = '';

    if (f.type === 'select') {
        const opts = (f.options || []).map(o => {
            const optVal = typeof o === 'string' ? o : o.value;
            const optLabel = typeof o === 'string' ? o : o.label;
            const selected = String(val) === String(optVal) ? 'selected' : '';
            return `<option value="${optVal}" ${selected}>${optLabel}</option>`;
        }).join('');
        input = `<select id="mf_${f.id}" ${required}><option value="">Selecione...</option>${opts}</select>`;
    } else if (f.type === 'multiselect') {
        const selectedValues = Array.isArray(val) ? val.map(String) : [];
        const opts = (f.options || []).map(o => {
            const optVal = typeof o === 'string' ? o : o.value;
            const optLabel = typeof o === 'string' ? o : o.label;
            const selected = selectedValues.includes(String(optVal)) ? 'selected' : '';
            return `<option value="${optVal}" ${selected}>${optLabel}</option>`;
        }).join('');
        input = `
            <div class="tms-multiselect">
                <button type="button" id="mf_${f.id}_trigger" class="tms-multiselect__trigger" aria-expanded="false" aria-controls="mf_${f.id}_panel">
                    <span class="tms-multiselect__summary">Selecione os ajudantes...</span>
                    <span class="tms-multiselect__chevron" aria-hidden="true">▾</span>
                </button>
                <div id="mf_${f.id}_panel" class="tms-multiselect__panel" hidden>
                    <div class="tms-multiselect__search-wrap">
                        <span aria-hidden="true">⌕</span>
                        <input id="mf_${f.id}_search" type="search" placeholder="${placeholder || 'Pesquisar ajudante...'}" aria-label="Pesquisar ${f.label}">
                    </div>
                    <div id="mf_${f.id}_options" class="tms-multiselect__options" role="group" aria-label="${f.label}">
                        ${(f.options || []).map(o => {
                            const optVal = typeof o === 'string' ? o : o.value;
                            const optLabel = typeof o === 'string' ? o : o.label;
                            return `<button type="button" class="tms-multiselect__option" data-value="${optVal}" role="checkbox" aria-checked="${selectedValues.includes(String(optVal))}"><span class="tms-multiselect__check" aria-hidden="true">✓</span><span>${optLabel}</span></button>`;
                        }).join('')}
                    </div>
                </div>
                <select id="mf_${f.id}" multiple ${required} hidden aria-hidden="true" tabindex="-1">${opts}</select>
                <div id="mf_${f.id}_chips" class="tms-multiselect__chips" aria-live="polite"></div>
            </div>`;
    } else if (f.type === 'textarea') {
        input = `<textarea id="mf_${f.id}" placeholder="${placeholder}" ${required} rows="3">${val}</textarea>`;
    } else {
        input = `<input id="mf_${f.id}" type="${f.type || 'text'}" value="${val}" placeholder="${placeholder}" ${required}>`;
    }
    return `<div class="form-group"><label for="mf_${f.id}">${f.label}</label>${input}</div>`;
}

function closeModal(overlay) {
    overlay.style.animation = 'none';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 200);
}