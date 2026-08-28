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
let filtroDataInicio = '';
let filtroDataFim    = '';
let filtroMotorista  = '';
let filtroNota       = '';
let paginaAtual      = 1;
let totalAvaliacoes  = 0;
let carregandoMais   = false;
let viewMode         = 'cards'; // 'cards' | 'table'
let chartDonut       = null;
let carregandoDados  = false;
const INTERVALO_ATUALIZACAO_MS = 60 * 1000;

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
    setInterval(() => {
        if (!document.hidden) carregarDados({ silencioso: true });
    }, INTERVALO_ATUALIZACAO_MS);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) carregarDados({ silencioso: true });
    });
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
async function carregarDados({ silencioso = false } = {}) {
    if (carregandoDados) return;
    carregandoDados = true;

    try {
        // Tenta buscar resumo NPS e avaliações em paralelo
        const [resNps, resAv] = await Promise.allSettled([
            api.request('/satisfacao/resumo', 'GET'),
            api.request('/satisfacao?page=1&page_size=50', 'GET'),
        ]);

        let npsData    = null;
        let avaliacoes = null;

        if (resNps.status === 'fulfilled' && resNps.value) {
            npsData = {
                ...resNps.value,
                score_nps: resNps.value.score_nps ?? resNps.value.nps ?? null,
            };
        }
        if (resAv.status === 'fulfilled') {
            avaliacoes = safeList(resAv.value);
            totalAvaliacoes = Number(resAv.value?.count ?? avaliacoes.length);
            paginaAtual = 1;
        }

        if (!avaliacoes) {
            avaliacoes = [];
        }
        if (resAv.status === 'rejected' && !silencioso) {
            showToast('Não foi possível carregar as avaliações reais.', 'error');
        }

        todosOsFeedbacks = normalizeAvaliacoes(avaliacoes);
        atualizarFiltroMotoristas(todosOsFeedbacks);

        // NPS calculado localmente se API não retornou
        const nps = npsData ? npsData : calcularNPS(todosOsFeedbacks);
        renderNpsHero(nps, todosOsFeedbacks);
        renderKPIs(nps, todosOsFeedbacks);
        renderSatisfacaoMetrics(todosOsFeedbacks);
        renderDonutChart(todosOsFeedbacks);
        renderFeedbacks();
        toggleDetratorBanner(todosOsFeedbacks);
        atualizarPaginacao();

    } catch (err) {
        console.error('[Satisfacao] Erro geral:', err);
        todosOsFeedbacks = [];
        if (!silencioso) showToast('Não foi possível carregar os dados de satisfação.', 'error');
        const nps = calcularNPS(todosOsFeedbacks);
        renderNpsHero(nps, todosOsFeedbacks);
        renderKPIs(nps, todosOsFeedbacks);
        renderSatisfacaoMetrics(todosOsFeedbacks);
        renderDonutChart(todosOsFeedbacks);
        renderFeedbacks();
        toggleDetratorBanner(todosOsFeedbacks);
        atualizarPaginacao();
    } finally {
        carregandoDados = false;
    }
}

// ─────────────────────────────────────────────────────────────
// NORMALIZAÇÃO
// ─────────────────────────────────────────────────────────────
function normalizeAvaliacoes(arr) {
    return arr.map(a => ({
        id:              a.id || a.pedido_id || Math.random(),
        pedido_numero:   a.pedido_numero || a.pedido_id || a.numero || a.order_id || '—',
        cliente_nome:    a.cliente_nome  || a.cliente || a.nome || '—',
        nota:            parseFloat(a.nota ?? a.score ?? a.rating),
        nota_satisfacao: normalizeNotaSatisfacao(a.nota_satisfacao),
        comentario:      a.comentario || a.comment || a.feedback || '',
        cliente_gostou:  a.cliente_gostou,
        motorista_nome:  a.motorista_nome || '',
        data:            a.data || a.created_at || a.data_avaliacao || a.criado_em || null,
        pontualidade:    parseFloat(a.categoria_pontualidade || a.pontualidade),
        cuidado:         parseFloat(a.categoria_cuidado      || a.cuidado),
        montagem:        parseFloat(a.categoria_montagem     || a.montagem),
    }));
}

function normalizeNotaSatisfacao(value) {
    const nota = Number(value);
    return Number.isInteger(nota) && nota >= 1 && nota <= 5 ? nota : null;
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
    }).filter(Number.isFinite);

    if (!notas.length) return { score_nps: 0, promotores: 0, neutros: 0, detratores: 0, total: 0 };

    const total      = notas.length;
    const promotores = notas.filter(n => n >= 9).length;
    const neutros    = notas.filter(n => n >= 7 && n < 9).length;
    const detratores = notas.filter(n => n < 7).length;
    const score_nps  = ((promotores - detratores) / total) * 100;

    const notaMedia = notas.reduce((a, b) => a + b, 0) / total;
    const pond = (campo) => {
        const vals = feedbacks.map(f => parseFloat(f[campo])).filter(Number.isFinite);
        if (!vals.length) return null;
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
        pontualidade: pond('pontualidade') === null ? null : parseFloat(pond('pontualidade').toFixed(1)),
        cuidado:      pond('cuidado') === null ? null : parseFloat(pond('cuidado').toFixed(1)),
        montagem:     pond('montagem') === null ? null : parseFloat(pond('montagem').toFixed(1)),
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
    const fmt10 = v => v == null ? '—' : `${Math.min(10, v).toFixed(1)} / 10`;
    const fmtN  = v => v == null ? '—' : `${Math.min(10, v).toFixed(1)}`;

    setEl('kpiNota',        fmt10(derived.nota_media));
    setEl('kpiPontualidade',fmtN(derived.pontualidade));
    setEl('kpiCuidado',     fmtN(derived.cuidado));
    setEl('kpiMontagem',    fmtN(derived.montagem));
    setEl('kpiTotal',       String(derived.total ?? feedbacks.length));
}

function renderSatisfacaoMetrics(feedbacks) {
    const avaliadas = feedbacks.filter(f =>
        Number.isInteger(f.nota_satisfacao) && f.nota_satisfacao >= 1 && f.nota_satisfacao <= 5
    );
    const mediaEl = document.getElementById('satAverage');
    const likedEl = document.getElementById('satLikedSummary');
    const distributionEl = document.getElementById('satRatingDistribution');
    const trendEl = document.getElementById('satTrend');
    const crossEl = document.getElementById('satRatingCross');
    if (!mediaEl || !likedEl || !distributionEl || !trendEl || !crossEl) return;

    if (!avaliadas.length) {
        mediaEl.textContent = '—';
        likedEl.textContent = 'Ainda não há avaliações de 1 a 5 estrelas.';
        distributionEl.innerHTML = '<span class="sat-metrics__muted">Nenhuma nota registrada.</span>';
        trendEl.innerHTML = '';
        crossEl.innerHTML = '<span class="sat-metrics__muted">Nenhum cruzamento disponível.</span>';
        return;
    }

    const total = avaliadas.length;
    const media = avaliadas.reduce((sum, f) => sum + f.nota_satisfacao, 0) / total;
    mediaEl.textContent = media.toFixed(1);
    const gostaram = avaliadas.filter(f => f.cliente_gostou === true).length;
    const naoGostaram = avaliadas.filter(f => f.cliente_gostou === false).length;
    likedEl.textContent = `${gostaram} gostaram · ${naoGostaram} não gostaram · ${total} com nota`;

    const contagem = [1, 2, 3, 4, 5].map(nota => avaliadas.filter(f => f.nota_satisfacao === nota).length);
    distributionEl.innerHTML = contagem.map((quantidade, indice) => `
        <div class="sat-rating-row">
            <span>${indice + 1} estrela${indice ? 's' : ''}</span>
            <div class="sat-rating-row__bar"><div class="sat-rating-row__fill" style="width:${(quantidade / total) * 100}%"></div></div>
            <strong>${quantidade}</strong>
        </div>`).join('');

    const cruzadas = avaliadas.filter(f => f.cliente_gostou === true || f.cliente_gostou === false);
    if (!cruzadas.length) {
        crossEl.innerHTML = '<span class="sat-metrics__muted">Ainda não há respostas Gostou/Não gostou associadas às notas.</span>';
    } else {
        crossEl.innerHTML = `
            <div class="sat-cross__header"><span>Nota</span><span>Gostou</span><span>Não gostou</span></div>
            ${[1, 2, 3, 4, 5].map(nota => {
                const grupo = cruzadas.filter(f => f.nota_satisfacao === nota);
                const gostaramNota = grupo.filter(f => f.cliente_gostou === true).length;
                const naoGostaramNota = grupo.filter(f => f.cliente_gostou === false).length;
                return `<div class="sat-cross__row"><strong>${nota}★</strong><span>${gostaramNota}</span><span>${naoGostaramNota}</span></div>`;
            }).join('')}
            <div class="sat-metrics__muted" style="margin-top:6px">${cruzadas.length} respostas com nota e opinião.</div>`;
    }

    const meses = {};
    avaliadas.forEach(feedback => {
        const data = new Date(feedback.data);
        if (Number.isNaN(data.getTime())) return;
        const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
        if (!meses[chave]) meses[chave] = { soma: 0, total: 0 };
        meses[chave].soma += feedback.nota_satisfacao;
        meses[chave].total += 1;
    });
    const tendencia = Object.entries(meses).sort(([a], [b]) => a.localeCompare(b)).slice(-6);
    const maxMedia = 5;
    trendEl.innerHTML = tendencia.map(([mes, dados]) => {
        const valor = dados.soma / dados.total;
        const [ano, mesNumero] = mes.split('-');
        const labelMes = new Date(Number(ano), Number(mesNumero) - 1, 1)
            .toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
        return `<div class="sat-trend__item" title="${valor.toFixed(1)} de 5 em ${mes}">
            <span>${valor.toFixed(1)}</span><div class="sat-trend__bar" style="height:${Math.max(4, (valor / maxMedia) * 58)}px"></div><span>${labelMes}/${ano.slice(2)}</span>
        </div>`;
    }).join('');
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

    document.getElementById('filterDataInicio')?.addEventListener('change', e => {
        filtroDataInicio = e.target.value;
        renderFeedbacks();
    });
    document.getElementById('filterDataFim')?.addEventListener('change', e => {
        filtroDataFim = e.target.value;
        renderFeedbacks();
    });
    document.getElementById('filterMotorista')?.addEventListener('change', e => {
        filtroMotorista = e.target.value;
        renderFeedbacks();
    });
    document.getElementById('filterNota')?.addEventListener('change', e => {
        filtroNota = e.target.value;
        renderFeedbacks();
    });
    document.getElementById('btnCarregarMais')?.addEventListener('click', carregarMaisAvaliacoes);
}

function atualizarFiltroMotoristas(feedbacks) {
    const select = document.getElementById('filterMotorista');
    if (!select) return;

    const motoristaAtual = filtroMotorista;
    const motoristas = [...new Set(feedbacks.map(f => f.motorista_nome).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    select.innerHTML = '<option value="">Todos os motoristas</option>' +
        motoristas.map(nome => `<option value="${esc(nome)}">${esc(nome)}</option>`).join('');
    select.value = motoristas.includes(motoristaAtual) ? motoristaAtual : '';
    filtroMotorista = select.value;
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

    if (filtroDataInicio) {
        lista = lista.filter(f => String(f.data).slice(0, 10) >= filtroDataInicio);
    }
    if (filtroDataFim) {
        lista = lista.filter(f => String(f.data).slice(0, 10) <= filtroDataFim);
    }
    if (filtroMotorista) {
        lista = lista.filter(f => f.motorista_nome === filtroMotorista);
    }
    if (filtroNota) {
        lista = lista.filter(f => f.nota_satisfacao === Number(filtroNota));
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

async function carregarMaisAvaliacoes() {
    if (carregandoMais || todosOsFeedbacks.length >= totalAvaliacoes) return;
    carregandoMais = true;
    const botao = document.getElementById('btnCarregarMais');
    if (botao) {
        botao.disabled = true;
        botao.textContent = 'Carregando...';
    }

    try {
        const resposta = await api.request(`/satisfacao?page=${paginaAtual + 1}&page_size=50`, 'GET');
        const novas = normalizeAvaliacoes(safeList(resposta));
        todosOsFeedbacks = [...todosOsFeedbacks, ...novas];
        paginaAtual += 1;
        totalAvaliacoes = Number(resposta?.count ?? todosOsFeedbacks.length);
        atualizarFiltroMotoristas(todosOsFeedbacks);
        renderNpsHero(calcularNPS(todosOsFeedbacks), todosOsFeedbacks);
        renderKPIs(calcularNPS(todosOsFeedbacks), todosOsFeedbacks);
        renderSatisfacaoMetrics(todosOsFeedbacks);
        renderDonutChart(todosOsFeedbacks);
        renderFeedbacks();
        toggleDetratorBanner(todosOsFeedbacks);
    } catch (err) {
        console.error('[Satisfacao] Erro ao carregar mais avaliações:', err);
        showToast('Não foi possível carregar mais avaliações.', 'error');
    } finally {
        carregandoMais = false;
        atualizarPaginacao();
    }
}

function atualizarPaginacao() {
    const area = document.getElementById('feedbackPagination');
    const botao = document.getElementById('btnCarregarMais');
    if (!area || !botao) return;
    const restante = Math.max(0, totalAvaliacoes - todosOsFeedbacks.length);
    area.style.display = restante > 0 ? 'flex' : 'none';
    botao.disabled = carregandoMais;
    botao.textContent = carregandoMais ? 'Carregando...' : `Carregar mais (${restante})`;
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
                ${f.nota_satisfacao !== null
                    ? `<div class="sat-metrics__muted">Avaliação: ${renderStars(f.nota_satisfacao * 2)} ${f.nota_satisfacao}/5</div>`
                    : ''}
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
    const notaValida = Number.isFinite(nota);
    const indicador = valor => Number.isFinite(valor) ? valor.toFixed(1) : '—';
    const opiniao = f.cliente_gostou === true ? 'Gostou' : f.cliente_gostou === false ? 'Não gostou' : 'Não informada';

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
                        <div class="fb-detail-item"><label>Motorista</label><span>${esc(f.motorista_nome || 'Não informado')}</span></div>
                        <div class="fb-detail-item"><label>Data</label><span>${formatarData(f.data)}</span></div>
                        <div class="fb-detail-item"><label>Opinião</label><span>${opiniao}</span></div>
                        <div class="fb-detail-item"><label>Classificação</label>
                            <span style="font-weight:700;color:${classe === 'promotor' ? '#27ae60' : classe === 'neutro' ? '#f39c12' : '#e74c3c'}">
                                ${classe === 'promotor' ? '🟢 Promotor' : classe === 'neutro' ? '🟡 Neutro' : '🔴 Detrator'}
                            </span>
                        </div>
                    </div>
                    <div style="margin-bottom:12px">
                        <label style="font-size:.72rem;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px">Nota Geral</label>
                        <div style="font-size:1.6rem;font-weight:700;color:#5A1827">${notaValida ? nota.toFixed(1) : '—'} <span style="font-size:.9rem;color:#aaa">/ 10</span></div>
                    <div style="margin-top:4px">${notaValida ? renderStars(nota) : ''}</div>
                    </div>
                    ${f.nota_satisfacao !== null ? `
                    <div style="margin-bottom:12px">
                       <label style="font-size:.72rem;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px">Nota de Satisfação (1 a 5)</label>
                       <div style="font-size:1.4rem;font-weight:700;color:#5A1827">${f.nota_satisfacao}/5 ${renderStars(f.nota_satisfacao * 2)}</div>
                    </div>` : ''}
                    <div style="margin-bottom:12px">
                        <div style="display:flex;gap:16px;flex-wrap:wrap">
                            <div><label style="font-size:.7rem;color:#999;font-weight:700;text-transform:uppercase;display:block">Pontualidade</label>
                                <strong>${indicador(parseFloat(f.pontualidade))}</strong></div>
                            <div><label style="font-size:.7rem;color:#999;font-weight:700;text-transform:uppercase;display:block">Cuidado c/ Produto</label>
                                <strong>${indicador(parseFloat(f.cuidado))}</strong></div>
                            <div><label style="font-size:.7rem;color:#999;font-weight:700;text-transform:uppercase;display:block">Montagem</label>
                                <strong>${indicador(parseFloat(f.montagem))}</strong></div>
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

        const cabecalho = ['Pedido', 'Cliente', 'Motorista', 'Nota NPS', 'Classificação', 'Nota satisfação', 'Opinião', 'Pontualidade', 'Cuidado', 'Montagem', 'Comentário', 'Data'];
        const linhas    = lista.map(f => {
            const n = f.nota <= 5 ? f.nota * 2 : f.nota;
            const opiniao = f.cliente_gostou === true ? 'Gostou' : f.cliente_gostou === false ? 'Não gostou' : 'Não informada';
            return [
                f.pedido_numero,
                f.cliente_nome,
                f.motorista_nome || 'Não informado',
                Number.isFinite(n) ? n.toFixed(1) : '',
                classificarFeedback(f),
                f.nota_satisfacao ?? '',
                opiniao,
                Number.isFinite(f.pontualidade) ? f.pontualidade.toFixed(1) : '',
                Number.isFinite(f.cuidado) ? f.cuidado.toFixed(1) : '',
                Number.isFinite(f.montagem) ? f.montagem.toFixed(1) : '',
                f.comentario || '',
                formatarData(f.data),
            ].map(csvValue).join(';');
        });

        const csv = [cabecalho.map(csvValue).join(';'), ...linhas].join('\n');
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

function csvValue(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
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
    if (Array.isArray(res.results)) return res.results;
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