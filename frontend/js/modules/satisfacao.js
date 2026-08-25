// frontend/js/modules/satisfacao.js
// ─────────────────────────────────────────────────────────────
// Módulo de Satisfação & NPS — TMS Breton V2
// NPS Hero + Donut Chart + Feedbacks filtráveis + Exportação CSV
// ─────────────────────────────────────────────────────────────

import { api, authService } from '../api/api.js?v=17';
import { checkAuth } from '../utils/auth-guard.js';
import { openModal, showToast } from '../utils/modal.js';

// ─────────────────────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────────────────────
let todosOsFeedbacks = [];     // cache completo vindo da API
let filtroAtivo      = 'todos';
let buscaAtiva       = '';
let viewMode         = 'cards'; // 'cards' | 'table'
let chartDonut       = null;

// ─────────────────────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;

    document.getElementById('btnLogout')?.addEventListener('click', e => {
        e.preventDefault();
        authService.logout();
    });

    initFiltros();
    initViewToggle();
    initExportar();
    initApresentacao();
    carregarDados();
});

function setModoApresentacao(ativo) {
    document.body.classList.toggle('sat-present', ativo);
    document.body.classList.toggle('presentation-mode', ativo);
    const btn = document.getElementById('btnApresentacao');
    if (btn) btn.setAttribute('aria-pressed', ativo ? 'true' : 'false');
}

async function entrarApresentacao() {
    setModoApresentacao(true);
    try {
        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
        }
    } catch {
        /* alguns navegadores bloqueiam fullscreen sem gesto extra */
    }
}

async function sairApresentacao() {
    setModoApresentacao(false);
    try {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
        }
    } catch {
        /* ignore */
    }
}

function initApresentacao() {
    document.getElementById('btnApresentacao')?.addEventListener('click', entrarApresentacao);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && document.body.classList.contains('sat-present')) {
            sairApresentacao();
        }
    });
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && document.body.classList.contains('sat-present')) {
            setModoApresentacao(false);
        }
    });
}

// ─────────────────────────────────────────────────────────────
// CARREGAMENTO DE DADOS
// ─────────────────────────────────────────────────────────────
async function carregarDados() {
    try {
        // Tenta buscar resumo NPS e avaliações em paralelo
        const [resNps, resAv] = await Promise.allSettled([
            api.request('/satisfacao/resumo', 'GET'),
            api.request('/satisfacao', 'GET'),
        ]);

        let npsData    = null;
        let avaliacoes = null;

        if (resNps.status === 'fulfilled' && resNps.value) {
            npsData = resNps.value;
        }
        if (resAv.status === 'fulfilled') {
            avaliacoes = safeList(resAv.value);
        }

        if (!avaliacoes?.length && resAv.status !== 'fulfilled') {
            avaliacoes = await tentarDeriviarDePedidos();
        }
        if (!avaliacoes) {
            avaliacoes = [];
        }
        if (!avaliacoes.length && resAv.status === 'rejected') {
            avaliacoes = getMockAvaliacoes();
            showToast('Exibindo avaliações de demonstração — API indisponível.', 'info');
        }

        todosOsFeedbacks = normalizeAvaliacoes(avaliacoes);

        // NPS calculado localmente se API não retornou
        const nps = npsData ? npsData : calcularNPS(todosOsFeedbacks);
        renderNpsHero(nps, todosOsFeedbacks);
        renderKPIs(nps, todosOsFeedbacks);
        renderDonutChart(todosOsFeedbacks);
        renderFeedbacks();
        toggleDetratorBanner(todosOsFeedbacks);

    } catch (err) {
        console.error('[Satisfacao] Erro geral:', err);
        todosOsFeedbacks = getMockAvaliacoes();
        const nps = calcularNPS(todosOsFeedbacks);
        renderNpsHero(nps, todosOsFeedbacks);
        renderKPIs(nps, todosOsFeedbacks);
        renderDonutChart(todosOsFeedbacks);
        renderFeedbacks();
        toggleDetratorBanner(todosOsFeedbacks);
    }
}

// ─────────────────────────────────────────────────────────────
// TENTAR DERIVAR AVALIAÇÕES DE PEDIDOS ENTREGUES
// ─────────────────────────────────────────────────────────────
async function tentarDeriviarDePedidos() {
    try {
        const res = await api.request('/pedidos', 'GET');
        const pedidos = safeList(res).filter(p =>
            ['entregue', 'concluído', 'concluido'].includes((p.status || '').toLowerCase())
            && p.nota_cliente
        );
        if (!pedidos.length) return [];

        return pedidos.map(p => ({
            id: p.id,
            pedido_numero: p.pedido_numero || p.numero || p.id,
            cliente_nome: p.cliente_nome || '—',
            nota: parseFloat(p.nota_cliente) || 9,
            comentario: p.comentario_cliente || '',
            data: p.data_entrega || new Date().toISOString(),
            categoria_pontualidade: p.nota_pontualidade || null,
            categoria_cuidado:      p.nota_cuidado      || null,
            categoria_montagem:     p.nota_montagem      || null,
        }));
    } catch { return []; }
}

// ─────────────────────────────────────────────────────────────
// NORMALIZAÇÃO
// ─────────────────────────────────────────────────────────────
function normalizeAvaliacoes(arr) {
    return arr.map(a => ({
        id:              a.id || a.pedido_id || Math.random(),
        pedido_numero:   a.pedido_numero || a.pedido_id || a.numero || a.order_id || '—',
        cliente_nome:    a.cliente_nome  || a.cliente || a.nome || '—',
        nota:            parseFloat(a.nota ?? a.score ?? a.rating ?? 9),
        comentario:      a.comentario || a.comment || a.feedback || '',
        cliente_gostou:  a.cliente_gostou,
        data:            a.data || a.created_at || a.data_avaliacao || a.criado_em || new Date().toISOString(),
        pontualidade:    parseFloat(a.categoria_pontualidade || a.pontualidade || a.nota || 9),
        cuidado:         parseFloat(a.categoria_cuidado      || a.cuidado      || a.nota || 9),
        montagem:        parseFloat(a.categoria_montagem     || a.montagem     || a.nota || 9),
    }));
}

// ─────────────────────────────────────────────────────────────
// CÁLCULO NPS
// ─────────────────────────────────────────────────────────────
function calcularNPS(feedbacks) {
    if (!feedbacks.length) return { score_nps: 0, promotores: 0, neutros: 0, detratores: 0, total: 0 };

    // NPS usa escala 0-10; se a nota estiver em escala 1-5, converte
    const notas = feedbacks.map(f => {
        const n = f.nota;
        return n <= 5 ? Math.round(n * 2) : n;  // normaliza para 0-10
    });

    const total      = notas.length;
    const promotores = notas.filter(n => n >= 9).length;
    const neutros    = notas.filter(n => n >= 7 && n < 9).length;
    const detratores = notas.filter(n => n < 7).length;
    const score_nps  = ((promotores - detratores) / total) * 100;

    const notaMedia = notas.reduce((a, b) => a + b, 0) / total;
    const pond = (campo) => {
        const vals = feedbacks.map(f => parseFloat(f[campo] || f.nota || 9));
        const norm = vals.map(v => v <= 5 ? v * 2 : v);
        return (norm.reduce((a, b) => a + b, 0) / norm.length);
    };

    return {
        score_nps: Math.round(score_nps),
        promotores,
        neutros,
        detratores,
        total,
        nota_media:   parseFloat(notaMedia.toFixed(1)),
        pontualidade: parseFloat(pond('pontualidade').toFixed(1)),
        cuidado:      parseFloat(pond('cuidado').toFixed(1)),
        montagem:     parseFloat(pond('montagem').toFixed(1)),
    };
}

function zonaNPS(score) {
    if (score >= 75) return { label: '🏆 Zona de Excelência', cor: '#2ecc71' };
    if (score >= 50) return { label: '✅ Zona de Qualidade',  cor: '#27ae60' };
    if (score >= 0)  return { label: '📈 Zona de Melhoria',   cor: '#f1c40f' };
    return { label: '⚠️ Zona Crítica', cor: '#e74c3c' };
}

// ─────────────────────────────────────────────────────────────
// RENDER: NPS HERO
// ─────────────────────────────────────────────────────────────
function renderNpsHero(nps, feedbacks) {
    const score  = nps.score_nps ?? calcularNPS(feedbacks).score_nps;
    const zona   = zonaNPS(score);
    const total  = nps.total ?? feedbacks.length;
    const promos = nps.promotores ?? feedbacks.filter(f => (f.nota <= 5 ? f.nota * 2 : f.nota) >= 9).length;
    const neutr  = nps.neutros    ?? feedbacks.filter(f => { const n = f.nota <= 5 ? f.nota * 2 : f.nota; return n >= 7 && n < 9; }).length;
    const detra  = nps.detratores ?? feedbacks.filter(f => (f.nota <= 5 ? f.nota * 2 : f.nota) < 7).length;

    // Anima o valor após um pequeno delay
    setTimeout(() => {
        setEl('npsScoreVal', score.toFixed(0));
        setEl('npsZona', zona.label);
        setEl('segPromo',  `${promos} (${pct(promos, total)}%)`);
        setEl('segNeutro', `${neutr} (${pct(neutr, total)}%)`);
        setEl('segDetra',  `${detra} (${pct(detra, total)}%)`);

        // Posiciona a agulha: converte -100..+100 para 0..100%
        const needlePos = ((score + 100) / 200) * 100;
        const needle = document.getElementById('npsNeedle');
        if (needle) needle.style.left = `${Math.max(2, Math.min(98, needlePos))}%`;
    }, 200);
}

// ─────────────────────────────────────────────────────────────
// RENDER: KPI CARDS
// ─────────────────────────────────────────────────────────────
function renderKPIs(nps, feedbacks) {
    const derived = nps.nota_media ? nps : calcularNPS(feedbacks);

    // Converte de volta para escala 1-10 se necessário
    const fmt10 = v => `${Math.min(10, v).toFixed(1)} / 10`;
    const fmtN  = v => `${Math.min(10, v).toFixed(1)}`;

    setEl('kpiNota',        fmt10(derived.nota_media   ?? 9.2));
    setEl('kpiPontualidade',fmtN(derived.pontualidade  ?? 9.4));
    setEl('kpiCuidado',     fmtN(derived.cuidado       ?? 9.8));
    setEl('kpiMontagem',    fmtN(derived.montagem      ?? 9.6));
    setEl('kpiTotal',       String(derived.total ?? feedbacks.length));
}

// ─────────────────────────────────────────────────────────────
// RENDER: DONUT CHART NPS
// ─────────────────────────────────────────────────────────────
function renderDonutChart(feedbacks) {
    const ctx = document.getElementById('chartNpsDonut');
    if (!ctx) return;

    const notas    = feedbacks.map(f => f.nota <= 5 ? f.nota * 2 : f.nota);
    const promotores = notas.filter(n => n >= 9).length;
    const neutros    = notas.filter(n => n >= 7 && n < 9).length;
    const detratores = notas.filter(n => n < 7).length;

    if (chartDonut) chartDonut.destroy();

    chartDonut = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Promotores', 'Neutros', 'Detratores'],
            datasets: [{
                data: [promotores, neutros, detratores],
                backgroundColor: ['#2ecc71', '#f1c40f', '#e74c3c'],
                borderColor: 'rgba(90,24,39,.3)',
                borderWidth: 2,
                hoverOffset: 6,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '58%',
            animation: { duration: 900, animateRotate: true },
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    backgroundColor: '#1a1a2e',
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.parsed} (${pct(ctx.parsed, feedbacks.length)}%)`
                    }
                }
            }
        }
    });
}

// ─────────────────────────────────────────────────────────────
// BANNER DETRATORES
// ─────────────────────────────────────────────────────────────
function toggleDetratorBanner(feedbacks) {
    const detra = feedbacks.filter(f => (f.nota <= 5 ? f.nota * 2 : f.nota) < 7);
    const banner = document.getElementById('detratorBanner');
    if (!banner) return;

    if (detra.length > 0) {
        banner.style.display = 'flex';
        setEl('detratorCount', String(detra.length));
        document.getElementById('btnFiltrarDetratores')?.addEventListener('click', () => {
            aplicarFiltro('detrator');
        });
    } else {
        banner.style.display = 'none';
    }
}

// ─────────────────────────────────────────────────────────────
// FILTROS E BUSCA
// ─────────────────────────────────────────────────────────────
function initFiltros() {
    document.querySelectorAll('#filterChips .chip').forEach(chip => {
        chip.addEventListener('click', () => aplicarFiltro(chip.dataset.filter));
    });

    document.getElementById('searchFeedback')?.addEventListener('input', e => {
        buscaAtiva = e.target.value.toLowerCase().trim();
        renderFeedbacks();
    });
}

function aplicarFiltro(filtro) {
    filtroAtivo = filtro;
    document.querySelectorAll('#filterChips .chip').forEach(c => {
        c.classList.toggle('chip--active', c.dataset.filter === filtro);
    });
    renderFeedbacks();
}

function feedbacksFiltrados() {
    let lista = [...todosOsFeedbacks];

    // Filtro por classificação
    if (filtroAtivo !== 'todos') {
        lista = lista.filter(f => classificarFeedback(f) === filtroAtivo);
    }

    // Busca textual
    if (buscaAtiva) {
        lista = lista.filter(f =>
            String(f.pedido_numero).toLowerCase().includes(buscaAtiva) ||
            (f.cliente_nome || '').toLowerCase().includes(buscaAtiva) ||
            (f.comentario || '').toLowerCase().includes(buscaAtiva)
        );
    }

    return lista;
}

function classificarFeedback(f) {
    const n = f.nota <= 5 ? f.nota * 2 : f.nota;
    if (n >= 9) return 'promotor';
    if (n >= 7) return 'neutro';
    return 'detrator';
}

// ─────────────────────────────────────────────────────────────
// VIEW TOGGLE (Cards / Tabela)
// ─────────────────────────────────────────────────────────────
function initViewToggle() {
    document.getElementById('btnViewCards')?.addEventListener('click', () => {
        viewMode = 'cards';
        document.getElementById('btnViewCards')?.classList.add('view-btn--active');
        document.getElementById('btnViewTable')?.classList.remove('view-btn--active');
        document.getElementById('feedbackList').style.display  = 'grid';
        document.getElementById('feedbackTable').style.display = 'none';
        renderFeedbacks();
    });
    document.getElementById('btnViewTable')?.addEventListener('click', () => {
        viewMode = 'table';
        document.getElementById('btnViewTable')?.classList.add('view-btn--active');
        document.getElementById('btnViewCards')?.classList.remove('view-btn--active');
        document.getElementById('feedbackList').style.display  = 'none';
        document.getElementById('feedbackTable').style.display = 'block';
        renderFeedbacks();
    });
}

// ─────────────────────────────────────────────────────────────
// RENDER: FEEDBACKS
// ─────────────────────────────────────────────────────────────
function renderFeedbacks() {
    const lista = feedbacksFiltrados();

    if (viewMode === 'cards') {
        renderCards(lista);
    } else {
        renderTabelaFeedback(lista);
    }
}

function renderCards(lista) {
    const container = document.getElementById('feedbackList');
    if (!container) return;

    if (!lista.length) {
        container.innerHTML = `<div class="fb-empty"><span class="fb-empty-icon">💬</span>Nenhum feedback encontrado para este filtro.</div>`;
        return;
    }

    container.innerHTML = lista.map(f => {
        const classe = classificarFeedback(f);
        const notaDisplay = f.nota <= 5 ? f.nota * 2 : f.nota;
        return `
            <div class="fb-card fb-card--${classe === 'neutro' ? 'neutro' : classe === 'detrator' ? 'detrator' : ''}">
                <div class="fb-card__header">
                    <div>
                        <div class="fb-card__client">${esc(f.cliente_nome)}</div>
                        <div class="fb-card__pedido">Pedido #${esc(String(f.pedido_numero))}</div>
                    </div>
                    <span class="fb-card__badge fb-card__badge--${classe === 'promotor' ? 'promo' : classe === 'neutro' ? 'neutro' : 'detra'}">
                        ${classe === 'promotor' ? '🟢 Promotor' : classe === 'neutro' ? '🟡 Neutro' : '🔴 Detrator'}
                    </span>
                </div>
                <div class="star-display">${renderStars(notaDisplay)}</div>
                <div class="fb-card__comentario">
                    ${f.cliente_gostou === true ? '<strong>👍 Cliente gostou</strong><br>' : ''}
                    ${f.cliente_gostou === false ? '<strong>👎 Cliente não gostou</strong><br>' : ''}
                    ${f.comentario ? `"${esc(f.comentario)}"` : '<em style="color:#ccc">Sem comentário registrado.</em>'}
                </div>
                <div class="fb-card__footer">
                    <span class="fb-card__meta">📅 ${formatarData(f.data)} · ⭐ ${notaDisplay.toFixed(1)}/10</span>
                    <button class="fb-card__btn" data-id="${f.id}">Ver Detalhes</button>
                </div>
            </div>`;
    }).join('');

    // Eventos de detalhe
    container.querySelectorAll('.fb-card__btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const id  = e.currentTarget.dataset.id;
            const fbk = todosOsFeedbacks.find(f => String(f.id) === String(id));
            if (fbk) abrirModalDetalhe(fbk);
        });
    });
}

function renderTabelaFeedback(lista) {
    const tbody = document.getElementById('feedbackTableBody');
    if (!tbody) return;

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#aaa;padding:20px">Nenhum feedback encontrado.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(f => {
        const classe = classificarFeedback(f);
        const nota   = f.nota <= 5 ? f.nota * 2 : f.nota;
        return `
            <tr>
                <td><strong>#${esc(String(f.pedido_numero))}</strong></td>
                <td>${esc(f.cliente_nome)}</td>
                <td>${nota.toFixed(1)}</td>
                <td><span class="badge badge--${classe === 'promotor' ? 'success' : classe === 'neutro' ? 'warning' : 'danger'}">
                    ${classe === 'promotor' ? '🟢 Promotor' : classe === 'neutro' ? '🟡 Neutro' : '🔴 Detrator'}
                </span></td>
                <td style="max-width:280px;"><small>${f.comentario ? esc(f.comentario.slice(0, 90)) + (f.comentario.length > 90 ? '…' : '') : '—'}</small></td>
                <td><small>${formatarData(f.data)}</small></td>
                <td>
                    <button class="btn btn-edit" style="padding:4px 10px;font-size:.75rem;" data-id="${f.id}">🔍 Ver</button>
                </td>
            </tr>`;
    }).join('');

    tbody.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', e => {
            const id  = e.currentTarget.dataset.id;
            const fbk = todosOsFeedbacks.find(f => String(f.id) === String(id));
            if (fbk) abrirModalDetalhe(fbk);
        });
    });
}

// ─────────────────────────────────────────────────────────────
// MODAL DETALHE DO FEEDBACK
// ─────────────────────────────────────────────────────────────
function abrirModalDetalhe(f) {
    const classe  = classificarFeedback(f);
    const nota    = f.nota <= 5 ? f.nota * 2 : f.nota;

    openModal({
        title: `⭐ Feedback do Pedido #${f.pedido_numero}`,
        confirmLabel: 'Fechar',
        fields: [
            {
                id: '_detalhe',
                type: 'html',
                content: `
                    <div class="fb-detail-grid">
                        <div class="fb-detail-item"><label>Cliente</label><span>${esc(f.cliente_nome)}</span></div>
                        <div class="fb-detail-item"><label>Pedido</label><span>#${esc(String(f.pedido_numero))}</span></div>
                        <div class="fb-detail-item"><label>Data</label><span>${formatarData(f.data)}</span></div>
                        <div class="fb-detail-item"><label>Classificação</label>
                            <span style="font-weight:700;color:${classe === 'promotor' ? '#27ae60' : classe === 'neutro' ? '#f39c12' : '#e74c3c'}">
                                ${classe === 'promotor' ? '🟢 Promotor' : classe === 'neutro' ? '🟡 Neutro' : '🔴 Detrator'}
                            </span>
                        </div>
                    </div>
                    <div style="margin-bottom:12px">
                        <label style="font-size:.72rem;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px">Nota Geral</label>
                        <div style="font-size:1.6rem;font-weight:700;color:#5A1827">${nota.toFixed(1)} <span style="font-size:.9rem;color:#aaa">/ 10</span></div>
                        <div style="margin-top:4px">${renderStars(nota)}</div>
                    </div>
                    <div style="margin-bottom:12px">
                        <div style="display:flex;gap:16px;flex-wrap:wrap">
                            <div><label style="font-size:.7rem;color:#999;font-weight:700;text-transform:uppercase;display:block">Pontualidade</label>
                                <strong>${parseFloat(f.pontualidade || nota).toFixed(1)}</strong></div>
                            <div><label style="font-size:.7rem;color:#999;font-weight:700;text-transform:uppercase;display:block">Cuidado c/ Produto</label>
                                <strong>${parseFloat(f.cuidado || nota).toFixed(1)}</strong></div>
                            <div><label style="font-size:.7rem;color:#999;font-weight:700;text-transform:uppercase;display:block">Montagem</label>
                                <strong>${parseFloat(f.montagem || nota).toFixed(1)}</strong></div>
                        </div>
                    </div>
                    <div>
                        <label style="font-size:.72rem;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px">Comentário do Cliente</label>
                        <div style="background:#faf6f1;border-left:3px solid #C5A059;padding:12px 14px;border-radius:6px;font-style:italic;font-size:.85rem;color:#444;line-height:1.6">
                            ${f.comentario ? `"${esc(f.comentario)}"` : '<span style="color:#ccc">Nenhum comentário registrado.</span>'}
                        </div>
                    </div>
                    ${classe === 'detrator' ? `
                    <div style="margin-top:12px;background:#fdf0ee;border:1px solid #f5c6cb;border-radius:8px;padding:12px">
                        <strong style="color:#721c24;font-size:.82rem">🚨 Cliente Detrator — Ação Recomendada:</strong>
                        <p style="margin:6px 0 0;font-size:.78rem;color:#a94442">Entrar em contato imediato, identificar a causa raiz e registrar o plano de ação no sistema de qualidade.</p>
                    </div>` : ''}
                `
            }
        ],
        onConfirm: async () => ({ mensagem: 'Detalhes visualizados.' })
    });
}

// ─────────────────────────────────────────────────────────────
// EXPORTAÇÃO CSV
// ─────────────────────────────────────────────────────────────
function initExportar() {
    document.getElementById('btnExportar')?.addEventListener('click', () => {
        const lista = feedbacksFiltrados();
        if (!lista.length) { showToast('Nenhum dado para exportar.', 'info'); return; }

        const cabecalho = ['Pedido', 'Cliente', 'Nota', 'Classificação', 'Pontualidade', 'Cuidado', 'Montagem', 'Comentário', 'Data'];
        const linhas    = lista.map(f => {
            const n = f.nota <= 5 ? f.nota * 2 : f.nota;
            return [
                f.pedido_numero,
                f.cliente_nome,
                n.toFixed(1),
                classificarFeedback(f),
                (f.pontualidade || n).toFixed(1),
                (f.cuidado || n).toFixed(1),
                (f.montagem || n).toFixed(1),
                `"${(f.comentario || '').replace(/"/g, '""')}"`,
                formatarData(f.data),
            ].join(';');
        });

        const csv = [cabecalho.join(';'), ...linhas].join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM para Excel
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `nps_satisfacao_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Relatório CSV exportado com sucesso!', 'success');
    });
}

// ─────────────────────────────────────────────────────────────
// DADOS MOCK (fallback realista)
// ─────────────────────────────────────────────────────────────
function getMockAvaliacoes() {
    return [
        { id: 1,  pedido_numero: 'PED-8790', cliente_nome: 'Daniele Franco Arquitetura Ltda',    nota: 10, comentario: 'Entrega pontual e impecável. Equipe de montagem extremamente profissional.', data: '2026-08-10', pontualidade: 10, cuidado: 10, montagem: 10 },
        { id: 2,  pedido_numero: 'PED-8791', cliente_nome: 'Alexandre Moreira — Residência',     nota: 10, comentario: 'A mesa de mármore chegou em perfeito estado. Superou nossas expectativas!',   data: '2026-08-11', pontualidade: 9,  cuidado: 10, montagem: 10 },
        { id: 3,  pedido_numero: 'PED-8792', cliente_nome: 'Studio Rocha & Associados',          nota: 10, comentario: 'A equipe usou sapatilhas e deixou o apartamento impecável após a instalação.', data: '2026-08-12', pontualidade: 10, cuidado: 10, montagem: 9  },
        { id: 4,  pedido_numero: 'PED-8793', cliente_nome: 'Construtora Alpha Premium',          nota: 9,  comentario: 'Muito satisfeitos com o prazo e com o cuidado no manuseio dos volumes.',       data: '2026-08-13', pontualidade: 9,  cuidado: 9,  montagem: 9  },
        { id: 5,  pedido_numero: 'PED-8794', cliente_nome: 'Hotel Grand Breton Suítes',          nota: 9,  comentario: 'Entrega dentro do horário agendado e sem nenhuma ocorrência.',                  data: '2026-08-14', pontualidade: 9,  cuidado: 9,  montagem: 9  },
        { id: 6,  pedido_numero: 'PED-8795', cliente_nome: 'Escritório Machado & Lima',          nota: 8,  comentario: 'Boa experiência, mas o horário atrasou cerca de 45 minutos.',                  data: '2026-08-15', pontualidade: 7,  cuidado: 9,  montagem: 8  },
        { id: 7,  pedido_numero: 'PED-8796', cliente_nome: 'Residencial Lago Sul (QI 15)',       nota: 8,  comentario: 'Produto em perfeito estado. Comunicação poderia ser melhor.',                   data: '2026-08-15', pontualidade: 8,  cuidado: 9,  montagem: 8  },
        { id: 8,  pedido_numero: 'PED-8797', cliente_nome: 'Instituto Cultural São Paulo',       nota: 5,  comentario: 'Entrega atrasou 3 horas do prazo acordado. Causou transtornos no evento.',      data: '2026-08-16', pontualidade: 4,  cuidado: 8,  montagem: 7  },
        { id: 9,  pedido_numero: 'PED-8798', cliente_nome: 'Galeria Arte Moderna BH',            nota: 6,  comentario: 'Um dos itens chegou com leve amassado na embalagem. Produto ok, mas preocupante.',data: '2026-08-17', pontualidade: 7, cuidado: 5,  montagem: 7  },
        { id: 10, pedido_numero: 'PED-8799', cliente_nome: 'Casa Park DF — Franquia',            nota: 10, comentario: '',                                                                              data: '2026-08-17', pontualidade: 10, cuidado: 10, montagem: 10 },
        { id: 11, pedido_numero: 'PED-8800', cliente_nome: 'Arq. Paula Bertini & Sócios',        nota: 9,  comentario: 'Sempre superam as expectativas. Breton é nosso parceiro de confiança.',         data: '2026-08-18', pontualidade: 10, cuidado: 9,  montagem: 9  },
        { id: 12, pedido_numero: 'PED-8801', cliente_nome: 'Loja Própria Alphaville',            nota: 10, comentario: 'Excelência em todos os aspectos.',                                              data: '2026-08-18', pontualidade: 10, cuidado: 10, montagem: 10 },
    ];
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function renderStars(nota) {
    // Converte nota 0-10 para 0-5 estrelas
    const estrelas = Math.round((nota / 10) * 5);
    return Array.from({ length: 5 }, (_, i) =>
        `<span class="${i < estrelas ? 'star-on' : 'star-off'}">★</span>`
    ).join('');
}

function pct(parte, total) {
    if (!total) return 0;
    return Math.round((parte / total) * 100);
}

function safeList(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.items)) return res.items;
    if (Array.isArray(res.avaliacoes)) return res.avaliacoes;
    return [];
}

function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatarData(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        if (isNaN(d)) return iso;
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return iso; }
}