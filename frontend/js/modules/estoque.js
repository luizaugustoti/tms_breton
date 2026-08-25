// frontend/js/modules/estoque.js
// ─────────────────────────────────────────────────────────────
// Módulo de Gestão de Estoque — TMS Breton V2
// KPIs · Tabela dinâmica · Entrada/Baixa via modal · Exportação CSV
// ─────────────────────────────────────────────────────────────

import { api, authService } from '../api/api.js?v=17';
import { checkAuth } from '../utils/auth-guard.js';
import { openModal, showToast } from '../utils/modal.js';

// ─────────────────────────────────────────────────────────────
// ESTADO
// ─────────────────────────────────────────────────────────────
let estoqueCache   = [];   // todos os itens carregados da API
let movimentacoes  = [];   // histórico de movimentações

let buscaAtiva     = '';
let filtroCategoria = '';
let filtroNivel    = '';

// Quantidade mínima padrão p/ alertas (substitua por campo da API se disponível)
const QTY_BAIXO   = 5;
const QTY_CRITICO = 0;

// ─────────────────────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;

    document.getElementById('btnLogout')?.addEventListener('click', e => {
        e.preventDefault();
        authService.logout();
    });

    initToolbar();
    carregarDados();
});

// ─────────────────────────────────────────────────────────────
// INICIALIZAÇÃO DA TOOLBAR
// ─────────────────────────────────────────────────────────────
function initToolbar() {
    // Busca em tempo real
    document.getElementById('searchEstoque')?.addEventListener('input', e => {
        buscaAtiva = e.target.value.toLowerCase().trim();
        renderTabela();
    });

    // Filtro categoria
    document.getElementById('filtroCategoria')?.addEventListener('change', e => {
        filtroCategoria = e.target.value;
        renderTabela();
    });

    // Filtro nível
    document.getElementById('filtroNivel')?.addEventListener('change', e => {
        filtroNivel = e.target.value;
        renderTabela();
    });

    // Botões de ação
    document.getElementById('btnEntrada')?.addEventListener('click', () => openModalEntrada());
    document.getElementById('btnBaixa')?.addEventListener('click',   () => openModalBaixa());
    document.getElementById('btnExportarEstoque')?.addEventListener('click', exportarCSV);
}

// ─────────────────────────────────────────────────────────────
// CARREGAMENTO DE DADOS
// ─────────────────────────────────────────────────────────────
async function carregarDados() {
    mostrarSkeleton();
    try {
        const [resEstoque, resMov] = await Promise.allSettled([
            api.request('/estoque/', 'GET'),
            api.request('/estoque/movimentacoes', 'GET'),
        ]);

        // Estoque
        if (resEstoque.status === 'fulfilled') {
            estoqueCache = safeList(resEstoque.value);
        } else {
            console.warn('[Estoque] API /estoque/ falhou:', resEstoque.reason?.message);
            estoqueCache = getMockEstoque();
            showToast('Exibindo estoque de demonstração.', 'info');
        }

        // Movimentações
        if (resMov.status === 'fulfilled') {
            movimentacoes = safeList(resMov.value);
        } else {
            movimentacoes = getMockMovimentacoes();
        }

    } catch (err) {
        console.error('[Estoque] Erro geral:', err);
        estoqueCache  = getMockEstoque();
        movimentacoes = getMockMovimentacoes();
        showToast('Modo demonstração — API indisponível.', 'info');
    }

    renderKPIs();
    renderTabela();
    renderMovimentacoes();
}

// ─────────────────────────────────────────────────────────────
// KPIs DE ARMAZÉM
// ─────────────────────────────────────────────────────────────
function renderKPIs() {
    const items    = estoqueCache;
    const total    = items.length;
    const unidades = items.reduce((s, i) => s + (parseFloat(i.quantidade) || 0), 0);
    const baixo    = items.filter(i => {
        const q = parseFloat(i.quantidade) || 0;
        return q > QTY_CRITICO && q <= QTY_BAIXO;
    }).length;
    const critico  = items.filter(i => (parseFloat(i.quantidade) || 0) <= QTY_CRITICO).length;
    const volume   = items.reduce((s, i) => {
        const dims = parseDimensoes(i.dimensao);
        return s + dims * (parseFloat(i.quantidade) || 0);
    }, 0);
    const peso     = items.reduce((s, i) => s + ((parseFloat(i.peso_kg) || 0) * (parseFloat(i.quantidade) || 0)), 0);

    setEl('kpiSkus',    String(total));
    setEl('kpiUnidades',String(Math.round(unidades)));
    setEl('kpiBaixo',   String(baixo));
    setEl('kpiCritico', String(critico));
    setEl('kpiVolume',  volume > 0  ? volume.toFixed(1) + ' m³' : '—');
    setEl('kpiPeso',    peso > 0    ? (peso / 1000).toFixed(1) + ' t'  : '—');
}

// ─────────────────────────────────────────────────────────────
// RENDER: TABELA
// ─────────────────────────────────────────────────────────────
function itensFiltrados() {
    return estoqueCache.filter(item => {
        const haystack = [item.codigo, item.descricao, item.localizacao, item.categoria]
            .join(' ').toLowerCase();

        if (buscaAtiva     && !haystack.includes(buscaAtiva)) return false;
        if (filtroCategoria && (item.categoria || '') !== filtroCategoria) return false;
        if (filtroNivel) {
            const nivel = getNivel(item);
            if (nivel !== filtroNivel) return false;
        }
        return true;
    });
}

function renderTabela() {
    const tbody = document.getElementById('estoqueTableBody');
    if (!tbody) return;

    const lista = itensFiltrados();

    if (!lista.length) {
        tbody.innerHTML = `
            <tr><td colspan="10">
                <div class="empty-state">
                    <span class="empty-state__icon">📭</span>
                    Nenhum item encontrado para os filtros aplicados.
                </div>
            </td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(item => renderRow(item)).join('');

    // Eventos de linha
    tbody.querySelectorAll('.btn-edit-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = estoqueCache.find(i => String(i.id) === btn.dataset.id);
            if (item) openModalEditarItem(item);
        });
    });
    tbody.querySelectorAll('.btn-mov-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = estoqueCache.find(i => String(i.id) === btn.dataset.id);
            if (item) openModalMovimentacao(item);
        });
    });
    tbody.querySelectorAll('.btn-del-item').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (!confirm('Remover este item do estoque? Esta ação não pode ser desfeita.')) return;
            try {
                await api.request(`/estoque/${id}`, 'DELETE');
                showToast('Item removido com sucesso!', 'success');
                await carregarDados();
            } catch (err) {
                showToast(`Erro ao remover: ${err?.message || 'Tente novamente.'}`, 'error');
            }
        });
    });
}

function renderRow(item) {
    const qty    = parseFloat(item.quantidade) ?? 0;
    const nivel  = getNivel(item);
    const pct    = calcPct(qty, item.quantidade_maxima || 50);
    const catStr = item.categoria || '—';
    const valor  = item.valor_unitario ? brl(item.valor_unitario) : '—';

    return `
        <tr>
            <td><strong style="font-family:monospace;font-size:.82rem;color:#5A1827">${esc(item.codigo || '—')}</strong></td>
            <td>
                <div style="font-weight:600;font-size:.85rem">${esc(item.descricao || '—')}</div>
                ${item.etiqueta ? `<small style="color:#aaa;font-size:.68rem">${esc(item.etiqueta)}</small>` : ''}
            </td>
            <td><span class="cat-badge">${esc(catStr)}</span></td>
            <td>
                <div class="qty-bar">
                    <span class="qty-bar__num">${qty}</span>
                    <div class="qty-bar__track">
                        <div class="qty-bar__fill qty-bar__fill--${nivel === 'ok' ? '' : nivel}"
                             style="width:${pct}%"></div>
                    </div>
                </div>
            </td>
            <td><small>${esc(item.unidade || 'UN')}</small></td>
            <td><small style="color:#666">${esc(item.localizacao || '—')}</small></td>
            <td><small>${item.peso_kg ? item.peso_kg + ' kg' : '—'}</small></td>
            <td><small style="font-weight:600">${valor}</small></td>
            <td>${renderNivelBadge(nivel, qty)}</td>
            <td>
                <div class="btn-row" style="display:flex;gap:4px;flex-wrap:nowrap">
                    <button class="btn-edit btn-edit-item"  data-id="${item.id}" title="Editar item">✏️</button>
                    <button class="btn-edit btn-mov-item"   data-id="${item.id}" title="Movimentar" style="background:#e8f5e9;color:#2e7d32">📦</button>
                    <button class="btn-delete btn-del-item" data-id="${item.id}" title="Remover">🗑️</button>
                </div>
            </td>
        </tr>`;
}

function renderNivelBadge(nivel, qty) {
    if (nivel === 'critico') return `<span class="stock-badge stock-badge--critico">🚨 ${qty <= 0 ? 'Zerado' : 'Crítico'}</span>`;
    if (nivel === 'baixo')   return `<span class="stock-badge stock-badge--baixo">⚠️ Baixo</span>`;
    return `<span class="stock-badge stock-badge--ok">✅ Normal</span>`;
}

// ─────────────────────────────────────────────────────────────
// RENDER: MOVIMENTAÇÕES
// ─────────────────────────────────────────────────────────────
function renderMovimentacoes() {
    const ul = document.getElementById('movTimeline');
    if (!ul) return;

    if (!movimentacoes.length) {
        ul.innerHTML = `<li style="color:#bbb;font-size:.82rem;text-align:center;padding:16px">Nenhuma movimentação registrada.</li>`;
        return;
    }

    ul.innerHTML = movimentacoes.slice(0, 15).map(m => {
        const tipo = (m.tipo || '').toLowerCase();
        const ehEntrada = tipo === 'entrada';
        const ehAjuste  = tipo === 'ajuste';
        const dotClass  = ehEntrada ? 'entrada' : ehAjuste ? 'ajuste' : 'saida';
        const qtyClass  = ehEntrada ? 'pos' : 'neg';
        const sinal     = ehEntrada ? '+' : '−';
        const desc      = m.descricao || m.item_descricao || m.codigo || '—';

        return `
            <li class="mov-item">
                <div class="mov-dot mov-dot--${dotClass}"></div>
                <div class="mov-info">
                    <strong>${esc(desc)}</strong>
                    <small>${m.motivo || m.tipo || '—'} · ${formatarData(m.data || m.created_at)}</small>
                </div>
                <span class="mov-qty mov-qty--${qtyClass}">${sinal}${Math.abs(parseFloat(m.quantidade) || 0)} ${m.unidade || ''}</span>
            </li>`;
    }).join('');
}

// ─────────────────────────────────────────────────────────────
// MODAL: NOVA ENTRADA
// ─────────────────────────────────────────────────────────────
function openModalEntrada() {
    const opcoesItens = estoqueCache.map(i => ({
        value: String(i.id),
        label: `${i.codigo} — ${i.descricao}`,
    }));
    opcoesItens.unshift({ value: '__novo', label: '+ Novo Item (preencher abaixo)' });

    openModal({
        title: '📥 Nova Entrada de Estoque',
        confirmLabel: 'Registrar Entrada',
        fields: [
            {
                id: 'item_id', label: 'Item em Estoque', type: 'select', required: true,
                options: opcoesItens,
            },
            {
                id: 'codigo', label: 'Código (se novo item)',
                placeholder: 'Ex: BR-2024-099',
            },
            {
                id: 'descricao', label: 'Descrição (se novo item)',
                placeholder: 'Ex: Sofá Edgy 3 Lugares Vinho',
            },
            {
                id: 'quantidade', label: 'Quantidade Recebida', type: 'number', required: true,
                placeholder: 'Ex: 10',
            },
            {
                id: 'unidade', label: 'Unidade', type: 'select',
                value: 'UN',
                options: ['UN', 'CX', 'PC', 'M', 'M2', 'M3', 'KG', 'PAL'],
            },
            {
                id: 'localizacao', label: 'Localização no Armazém',
                placeholder: 'Ex: Setor B — Prateleira 03',
            },
            {
                id: 'valor_unitario', label: 'Valor Unitário (R$)', type: 'number',
                placeholder: 'Ex: 3500.00',
            },
            {
                id: 'motivo', label: 'Motivo / Nota Fiscal', type: 'textarea', fullWidth: true,
                placeholder: 'NF-e 123456 · Fornecedor: Fábrica Breton Diadema',
            },
        ],
        onConfirm: async (data) => {
            const qty = parseFloat(data.quantidade);
            if (!qty || qty <= 0) throw new Error('Informe uma quantidade válida.');

            const isNovo = data.item_id === '__novo' || !data.item_id;

            if (isNovo) {
                if (!data.codigo?.trim() || !data.descricao?.trim())
                    throw new Error('Para novo item, informe Código e Descrição.');

                // Cria o item primeiro
                const novoItem = await api.request('/estoque/', 'POST', {
                    codigo:         data.codigo.trim(),
                    descricao:      data.descricao.trim(),
                    quantidade:     qty,
                    unidade:        data.unidade || 'UN',
                    localizacao:    data.localizacao || '',
                    valor_unitario: data.valor_unitario ? parseFloat(data.valor_unitario) : null,
                });

                // Registra movimentação
                await api.request('/estoque/movimentacoes', 'POST', {
                    item_id: novoItem.id,
                    tipo: 'entrada',
                    quantidade: qty,
                    motivo: data.motivo || 'Entrada manual',
                }).catch(() => {});
            } else {
                // Movimentação de entrada em item existente
                await api.request('/estoque/movimentacoes', 'POST', {
                    item_id:   parseInt(data.item_id, 10),
                    tipo:      'entrada',
                    quantidade: qty,
                    motivo:    data.motivo || 'Entrada manual',
                });

                // Atualiza a quantidade somando ao item
                const item = estoqueCache.find(i => String(i.id) === String(data.item_id));
                if (item) {
                    const novaQty = (parseFloat(item.quantidade) || 0) + qty;
                    await api.request(`/estoque/${item.id}`, 'PATCH', {
                        quantidade: novaQty,
                        localizacao: data.localizacao || item.localizacao,
                    });
                }
            }

            await carregarDados();
            return { mensagem: `Entrada de ${qty} unidades registrada com sucesso!` };
        },
    });
}

// ─────────────────────────────────────────────────────────────
// MODAL: BAIXA / AJUSTE MANUAL
// ─────────────────────────────────────────────────────────────
function openModalBaixa() {
    const opcoesItens = estoqueCache.map(i => ({
        value: String(i.id),
        label: `${i.codigo} — ${i.descricao} (${i.quantidade} ${i.unidade || 'UN'})`,
    }));

    openModal({
        title: '📤 Baixa / Ajuste Manual de Estoque',
        confirmLabel: 'Registrar Baixa',
        fields: [
            {
                id: 'item_id', label: 'Item em Estoque', type: 'select', required: true,
                options: opcoesItens,
            },
            {
                id: 'tipo_mov', label: 'Tipo de Movimentação', type: 'select', required: true,
                value: 'saida',
                options: [
                    { value: 'saida',  label: '📤 Saída para Entrega / Pedido' },
                    { value: 'ajuste', label: '🔧 Ajuste de Inventário' },
                    { value: 'avaria', label: '⚠️ Avaria / Perda' },
                    { value: 'devolucao', label: '↩️ Devolução ao Fornecedor' },
                ],
            },
            {
                id: 'quantidade', label: 'Quantidade', type: 'number', required: true,
                placeholder: 'Quantidade a baixar',
            },
            {
                id: 'pedido_ref', label: 'Nº do Pedido (se saída)',
                placeholder: 'Ex: PED-8790',
            },
            {
                id: 'motivo', label: 'Observação / Justificativa', type: 'textarea', fullWidth: true,
                placeholder: 'Descreva o motivo da baixa ou ajuste...',
            },
        ],
        onConfirm: async (data) => {
            if (!data.item_id) throw new Error('Selecione o item.');
            const qty = parseFloat(data.quantidade);
            if (!qty || qty <= 0) throw new Error('Informe uma quantidade válida.');

            const item = estoqueCache.find(i => String(i.id) === String(data.item_id));
            if (!item) throw new Error('Item não encontrado.');

            const qtyAtual = parseFloat(item.quantidade) || 0;
            if (data.tipo_mov === 'saida' && qty > qtyAtual)
                throw new Error(`Quantidade insuficiente. Estoque atual: ${qtyAtual} ${item.unidade || 'UN'}.`);

            // Registra movimentação
            await api.request('/estoque/movimentacoes', 'POST', {
                item_id:    parseInt(data.item_id, 10),
                tipo:       data.tipo_mov || 'saida',
                quantidade: qty,
                pedido_ref: data.pedido_ref || null,
                motivo:     data.motivo || data.tipo_mov,
            });

            // Atualiza quantidade
            const delta   = data.tipo_mov === 'ajuste' ? 0 : -qty; // ajuste não subtrai automaticamente
            const novaQty = Math.max(0, qtyAtual + delta);
            await api.request(`/estoque/${item.id}`, 'PATCH', { quantidade: novaQty });

            await carregarDados();
            return { mensagem: `Baixa de ${qty} ${item.unidade || 'un'} de "${item.descricao}" registrada!` };
        },
    });
}

// ─────────────────────────────────────────────────────────────
// MODAL: EDITAR ITEM
// ─────────────────────────────────────────────────────────────
function openModalEditarItem(item) {
    openModal({
        title: `✏️ Editar Item — ${item.codigo}`,
        confirmLabel: 'Salvar Alterações',
        fields: [
            { id: 'codigo',     label: 'Código',         value: item.codigo      || '', required: true },
            { id: 'descricao',  label: 'Descrição',       value: item.descricao   || '', required: true },
            {
                id: 'categoria', label: 'Categoria', type: 'select',
                value: item.categoria || '',
                options: ['Sofás','Mesas','Cadeiras','Camas','Armários','Mármores','Luminárias','Vidros','Embalagem','Acessórios','Outro'],
            },
            { id: 'dimensao',   label: 'Dimensões (AxLxP cm)', value: item.dimensao || '', placeholder: '90x220x100' },
            { id: 'peso_kg',    label: 'Peso (kg)',     type: 'number', value: item.peso_kg  || '' },
            { id: 'valor_unitario', label: 'Valor Unit. (R$)', type: 'number', value: item.valor_unitario || '' },
            { id: 'localizacao', label: 'Localização no Armazém', value: item.localizacao || '', placeholder: 'Setor A — Prateleira 02' },
            { id: 'etiqueta',   label: 'Cód. de Barras / Etiqueta', value: item.etiqueta || '' },
            {
                id: 'unidade', label: 'Unidade', type: 'select',
                value: item.unidade || 'UN',
                options: ['UN','CX','PC','M','M2','M3','KG','PAL'],
            },
        ],
        onConfirm: async (data) => {
            if (!data.codigo?.trim() || !data.descricao?.trim())
                throw new Error('Código e Descrição são obrigatórios.');

            await api.request(`/estoque/${item.id}`, 'PATCH', {
                codigo:         data.codigo.trim(),
                descricao:      data.descricao.trim(),
                categoria:      data.categoria || '',
                dimensao:       data.dimensao || '',
                peso_kg:        data.peso_kg ? parseFloat(data.peso_kg) : null,
                valor_unitario: data.valor_unitario ? parseFloat(data.valor_unitario) : null,
                localizacao:    data.localizacao || '',
                etiqueta:       data.etiqueta || '',
                unidade:        data.unidade || 'UN',
            });
            await carregarDados();
            return { mensagem: `Item "${data.descricao}" atualizado com sucesso!` };
        },
    });
}

// ─────────────────────────────────────────────────────────────
// MODAL: MOVIMENTAÇÃO RÁPIDA (ícone 📦 na tabela)
// ─────────────────────────────────────────────────────────────
function openModalMovimentacao(item) {
    openModal({
        title: `📦 Movimentar: ${item.descricao}`,
        confirmLabel: 'Registrar',
        fields: [
            {
                id: 'tipo_mov', label: 'Tipo', type: 'select', required: true,
                value: 'entrada',
                options: [
                    { value: 'entrada', label: '📥 Entrada' },
                    { value: 'saida',   label: '📤 Saída' },
                    { value: 'ajuste',  label: '🔧 Ajuste' },
                ],
            },
            { id: 'quantidade', label: 'Quantidade', type: 'number', required: true, placeholder: '0' },
            {
                id: 'motivo', label: 'Motivo', type: 'textarea', fullWidth: true,
                placeholder: 'Descreva brevemente o motivo da movimentação...', required: true,
            },
        ],
        onConfirm: async (data) => {
            const qty = parseFloat(data.quantidade);
            if (!qty || qty <= 0) throw new Error('Informe uma quantidade válida.');

            await api.request('/estoque/movimentacoes', 'POST', {
                item_id:   item.id,
                tipo:      data.tipo_mov || 'entrada',
                quantidade: qty,
                motivo:    data.motivo,
            });

            const qtyAtual = parseFloat(item.quantidade) || 0;
            const delta    = data.tipo_mov === 'entrada' ? qty : -qty;
            await api.request(`/estoque/${item.id}`, 'PATCH', {
                quantidade: Math.max(0, qtyAtual + delta),
            });

            await carregarDados();
            return { mensagem: `Movimentação de ${qty} ${item.unidade || 'un'} registrada!` };
        },
    });
}

// ─────────────────────────────────────────────────────────────
// EXPORTAÇÃO CSV
// ─────────────────────────────────────────────────────────────
function exportarCSV() {
    const lista = itensFiltrados();
    if (!lista.length) { showToast('Nenhum item para exportar.', 'info'); return; }

    const cab = ['Código', 'Descrição', 'Categoria', 'Quantidade', 'Unidade', 'Localização', 'Peso (kg)', 'Valor Unit. (R$)', 'Nível'];
    const rows = lista.map(i => [
        i.codigo || '',
        `"${(i.descricao || '').replace(/"/g,'""')}"`,
        i.categoria || '',
        i.quantidade ?? '',
        i.unidade || 'UN',
        i.localizacao || '',
        i.peso_kg || '',
        i.valor_unitario || '',
        getNivel(i),
    ].join(';'));

    const csv  = [cab.join(';'), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `estoque_breton_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Planilha de estoque exportada!', 'success');
}

// ─────────────────────────────────────────────────────────────
// SKELETON LOADER
// ─────────────────────────────────────────────────────────────
function mostrarSkeleton() {
    const tbody = document.getElementById('estoqueTableBody');
    if (!tbody) return;
    tbody.innerHTML = Array.from({ length: 4 }).map(() => `
        <tr class="sk-row">
            ${Array.from({ length: 10 }).map(() => `<td>—</td>`).join('')}
        </tr>`).join('');
}

// ─────────────────────────────────────────────────────────────
// MOCK FALLBACK
// ─────────────────────────────────────────────────────────────
function getMockEstoque() {
    return [
        { id: 1,  codigo: 'BR-SO-001', descricao: 'Sofá Orgânico 3 Lugares — Vinho',           categoria: 'Sofás',      quantidade: 8,  unidade: 'UN', localizacao: 'Setor A — P01', peso_kg: 95,  dimensao: '90x230x105', valor_unitario: 12500, etiqueta: '7891234000001' },
        { id: 2,  codigo: 'BR-SO-002', descricao: 'Sofá Edgy 2 Lugares — Champanhe',           categoria: 'Sofás',      quantidade: 3,  unidade: 'UN', localizacao: 'Setor A — P02', peso_kg: 68,  dimensao: '85x190x90',  valor_unitario: 8900,  etiqueta: '7891234000002' },
        { id: 3,  codigo: 'BR-ME-001', descricao: 'Mesa de Jantar Mármore Calacatta Ø1.6m',    categoria: 'Mesas',      quantidade: 2,  unidade: 'UN', localizacao: 'Setor B — P01', peso_kg: 280, dimensao: '75x160x160', valor_unitario: 28000, etiqueta: '7891234000003' },
        { id: 4,  codigo: 'BR-ME-002', descricao: 'Mesa de Centro Vidro Fumê + Base Aço',      categoria: 'Mesas',      quantidade: 12, unidade: 'UN', localizacao: 'Setor B — P03', peso_kg: 45,  dimensao: '45x120x70',  valor_unitario: 3200,  etiqueta: '7891234000004' },
        { id: 5,  codigo: 'BR-CA-001', descricao: 'Cadeira Austin — Couro Natural',            categoria: 'Cadeiras',   quantidade: 24, unidade: 'UN', localizacao: 'Setor C — P01', peso_kg: 12,  dimensao: '92x48x54',   valor_unitario: 1850,  etiqueta: '7891234000005' },
        { id: 6,  codigo: 'BR-CA-002', descricao: 'Poltrona Lara — Veludo Musgo',              categoria: 'Cadeiras',   quantidade: 5,  unidade: 'UN', localizacao: 'Setor C — P02', peso_kg: 22,  dimensao: '86x80x85',   valor_unitario: 4200,  etiqueta: '7891234000006' },
        { id: 7,  codigo: 'BR-CM-001', descricao: 'Cama Box King Size Couro Conhaque',         categoria: 'Camas',      quantidade: 4,  unidade: 'UN', localizacao: 'Setor D — P01', peso_kg: 135, dimensao: '120x193x204',valor_unitario: 18500, etiqueta: '7891234000007' },
        { id: 8,  codigo: 'BR-CM-002', descricao: 'Cabeceira Estofada Recamier — Bege',        categoria: 'Camas',      quantidade: 0,  unidade: 'UN', localizacao: 'Setor D — P02', peso_kg: 38,  dimensao: '160x10x130', valor_unitario: 5800,  etiqueta: '7891234000008' },
        { id: 9,  codigo: 'BR-MR-001', descricao: 'Mármore Estatuário Branco — Placa 160x80cm',categoria: 'Mármores',   quantidade: 1,  unidade: 'PC', localizacao: 'Setor E — P01', peso_kg: 340, dimensao: '2x160x80',   valor_unitario: 9200,  etiqueta: '7891234000009' },
        { id: 10, codigo: 'BR-LU-001', descricao: 'Lustre Cristal Swarovski Ø80cm',            categoria: 'Luminárias', quantidade: 2,  unidade: 'UN', localizacao: 'Setor F — P01', peso_kg: 14,  dimensao: '80x80x60',   valor_unitario: 22000, etiqueta: '7891234000010' },
        { id: 11, codigo: 'BR-EM-001', descricao: 'Caixa Madeira Breton (reforçada)',           categoria: 'Embalagem',  quantidade: 58, unidade: 'UN', localizacao: 'Setor G — P01', peso_kg: 8,   dimensao: '30x60x40',   valor_unitario: 85,    etiqueta: '7891234000011' },
        { id: 12, codigo: 'BR-VI-001', descricao: 'Espelho Lapidado Retangular 120x80cm',      categoria: 'Vidros',     quantidade: 0,  unidade: 'UN', localizacao: 'Setor H — P01', peso_kg: 22,  dimensao: '5x120x80',   valor_unitario: 3400,  etiqueta: '7891234000012' },
    ];
}

function getMockMovimentacoes() {
    return [
        { id: 1, tipo: 'entrada',  item_descricao: 'Sofá Orgânico 3 Lugares', quantidade: 10, unidade: 'UN', motivo: 'Recebimento NF-e 00145', data: new Date().toISOString() },
        { id: 2, tipo: 'saida',    item_descricao: 'Mesa de Jantar Mármore',   quantidade: 1,  unidade: 'UN', motivo: 'Saída — Pedido PED-8790',  data: new Date(Date.now()-86400000).toISOString() },
        { id: 3, tipo: 'saida',    item_descricao: 'Cadeira Austin — Couro',   quantidade: 6,  unidade: 'UN', motivo: 'Saída — Pedido PED-8791',  data: new Date(Date.now()-86400000*2).toISOString() },
        { id: 4, tipo: 'entrada',  item_descricao: 'Caixa Madeira Breton',     quantidade: 50, unidade: 'UN', motivo: 'Compra de embalagens',      data: new Date(Date.now()-86400000*3).toISOString() },
        { id: 5, tipo: 'ajuste',   item_descricao: 'Lustre Cristal Swarovski', quantidade: 2,  unidade: 'UN', motivo: 'Inventário mensal — corr.',  data: new Date(Date.now()-86400000*5).toISOString() },
    ];
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function getNivel(item) {
    const qty = parseFloat(item.quantidade) ?? 0;
    if (qty <= QTY_CRITICO) return 'critico';
    if (qty <= QTY_BAIXO)   return 'baixo';
    return 'ok';
}

function calcPct(qty, max) {
    if (!max || max <= 0) return Math.min(100, qty * 5);
    return Math.min(100, Math.round((qty / max) * 100));
}

function parseDimensoes(dim) {
    if (!dim) return 0;
    const parts = String(dim).split(/[xX×\s]+/).map(Number).filter(Boolean);
    if (parts.length >= 3) return (parts[0] / 100) * (parts[1] / 100) * (parts[2] / 100);
    return 0;
}

function safeList(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.items)) return res.items;
    return [];
}

function setEl(id, val) {
    const el = document.getElementById(id); if (el) el.textContent = val;
}

function brl(v) {
    return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatarData(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
}
