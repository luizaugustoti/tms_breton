// frontend/js/modules/indicadores.js
// ─────────────────────────────────────────────────────────────
// Módulo de Indicadores & KPIs — TMS Breton V2
// Chart.js (linha · rosca · barras) + Filtros de Período + API
// ─────────────────────────────────────────────────────────────

import { api, authService } from '../api/api.js?v=15';
import { checkAuth } from '../utils/auth-guard.js';
import { showToast } from '../utils/modal.js';

// ─────────────────────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────────────────────
let chartLine  = null;
let chartDonut = null;
let chartBar   = null;

let periodoAtual = 'mes'; // padrão ao abrir
let dtInicioCustom = null;
let dtFimCustom    = null;

// ─────────────────────────────────────────────────────────────
// CONFIGURAÇÃO GLOBAL DO CHART.JS
// ─────────────────────────────────────────────────────────────
const BRETON_COLORS = {
    vinho:   '#5A1827',
    dourado: '#C5A059',
    verde:   '#27ae60',
    azul:    '#2980b9',
    laranja: '#e67e22',
    cinza:   '#95a5a6',
    creme:   '#faf6f1',
};

const chartDefaults = {
    font: { family: "'Montserrat', sans-serif" },
};

// ─────────────────────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;

    document.getElementById('btnLogout')?.addEventListener('click', e => {
        e.preventDefault();
        authService.logout();
    });

    // Inicializa datas custom com janela de 30 dias
    const hoje = new Date();
    const mesAtras = new Date(hoje); mesAtras.setDate(hoje.getDate() - 30);
    document.getElementById('dtFim').value    = toInputDate(hoje);
    document.getElementById('dtInicio').value = toInputDate(mesAtras);

    initPeriodBar();
    carregarIndicadores();
});

// ─────────────────────────────────────────────────────────────
// FILTRO DE PERÍODO
// ─────────────────────────────────────────────────────────────
function initPeriodBar() {
    // Botões rápidos
    document.querySelectorAll('.period-btn[data-period]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('period-btn--active'));
            btn.classList.add('period-btn--active');
            periodoAtual = btn.dataset.period;
            dtInicioCustom = null;
            dtFimCustom    = null;
            carregarIndicadores();
        });
    });

    // Período personalizado
    document.getElementById('btnAplicarPeriodo')?.addEventListener('click', () => {
        const ini = document.getElementById('dtInicio').value;
        const fim = document.getElementById('dtFim').value;
        if (!ini || !fim) { showToast('Selecione as duas datas para o período personalizado.', 'info'); return; }
        if (ini > fim)    { showToast('A data de início não pode ser posterior ao fim.', 'error'); return; }

        document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('period-btn--active'));
        periodoAtual   = 'custom';
        dtInicioCustom = ini;
        dtFimCustom    = fim;
        carregarIndicadores();
    });
}

// ─────────────────────────────────────────────────────────────
// CARREGAMENTO PRINCIPAL
// ─────────────────────────────────────────────────────────────
async function carregarIndicadores() {
    setKpisLoading(true);

    const params = buildParams();

    try {
        // Tenta buscar tudo em paralelo da API
        const metricsParams = Object.fromEntries(new URLSearchParams(params));
        const [resDash, resPedidos, resVeiculos, resMotoristas] = await Promise.allSettled([
            api.request('/indicadores/metrics', 'GET', null, metricsParams),
            api.request('/pedidos', 'GET'),
            api.request('/cadastros/veiculos', 'GET'),
            api.request('/cadastros/funcionarios', 'GET'),
        ]);

        const dash      = resDash.status      === 'fulfilled' ? resDash.value      : null;
        const pedidos   = resPedidos.status   === 'fulfilled' ? safeList(resPedidos.value)   : null;
        const veiculos  = resVeiculos.status  === 'fulfilled' ? safeList(resVeiculos.value)  : null;
        const motoristas = resMotoristas.status === 'fulfilled' ? safeList(resMotoristas.value) : null;

        // Compila KPIs: API real > derivado de pedidos > mock
        const kpis = compilarKPIs(dash, pedidos, veiculos);
        renderKPIs(kpis);
        renderGauges(kpis);

        // Gráficos
        renderChartLine(dash, pedidos);
        renderChartDonut(dash, pedidos);
        renderChartBar(veiculos);

        // Rankings + Tabelas
        renderRankingRotas(dash);
        renderRankingMotoristas(motoristas);
        renderTabelaMargem(dash, pedidos);
        renderTabelaCo2(dash, veiculos);
        renderTabelaAvarias(dash);

        atualizarBadgePeriodo();

    } catch (err) {
        console.error('[Indicadores] Erro geral:', err);
        usarMockCompleto();
    } finally {
        setKpisLoading(false);
    }
}

// ─────────────────────────────────────────────────────────────
// COMPILAÇÃO DE KPIs (API real → derivado → mock)
// ─────────────────────────────────────────────────────────────
function compilarKPIs(dash, pedidos, veiculos) {
    const mock = getMockKPIs();

    let onTime  = dash?.otif?.on_time_percentual  ?? mock.onTime;
    let inFull  = dash?.otif?.in_full_percentual  ?? mock.inFull;
    let otif    = dash?.otif?.otif_percentual     ?? mock.otif;
    let custoKm = dash?.custo_km                  ?? mock.custoKm;
    let tempo   = dash?.tempo_medio_horas         ?? mock.tempo;
    let avarias = dash?.indice_avarias            ?? mock.avarias;

    // Deriva de pedidos reais se disponível
    let totalEntregas = mock.totalEntregas;
    let ocupacao      = mock.ocupacao;

    if (pedidos?.length) {
        totalEntregas = pedidos.length;
        const entregues = pedidos.filter(p => isEntregue(p)).length;
        onTime = onTime !== mock.onTime ? onTime : ((entregues / totalEntregas) * 100);
    }
    if (veiculos?.length) {
        const emRota = veiculos.filter(v => (v.status_operacional || '').toLowerCase() === 'em rota').length;
        ocupacao = (emRota / veiculos.length) * 100;
    }

    return { onTime, inFull, otif, custoKm, tempo, avarias, totalEntregas, ocupacao };
}

// ─────────────────────────────────────────────────────────────
// RENDER: KPI CARDS
// ─────────────────────────────────────────────────────────────
function renderKPIs(k) {
    setEl('valOtif',     fmt(k.otif, '%'));
    setEl('valCustoKm',  `R$ ${k.custoKm.toFixed(2)}`);
    setEl('valTempo',    `${k.tempo.toFixed(1)}h`);
    setEl('valOcupacao', fmt(k.ocupacao, '%'));
    setEl('valOnTime',   fmt(k.onTime, '%'));
    setEl('valInFull',   fmt(k.inFull, '%'));
    setEl('valAvarias',  fmt(k.avarias, '%'));
    setEl('valEntregas', k.totalEntregas.toString());

    // Tendências (comparação com metas)
    setTrend('trendOtif',     k.otif    >= 97,  k.otif    < 90,  `${(k.otif - 97).toFixed(1)}pp vs meta 97%`);
    setTrend('trendCustoKm',  k.custoKm <= 4.5, k.custoKm > 6,   `R$ ${k.custoKm.toFixed(2)}/km`);
    setTrend('trendTempo',    k.tempo   <= 4,   k.tempo   > 6,   `${k.tempo.toFixed(1)}h por pedido`);
    setTrend('trendOcupacao', k.ocupacao >= 70,  k.ocupacao < 40,  `${fmt(k.ocupacao, '%')} da frota`);
    setTrend('trendOnTime',   k.onTime  >= 97,  k.onTime  < 90,  `${(k.onTime - 97).toFixed(1)}pp vs meta`);
    setTrend('trendInFull',   k.inFull  >= 98,  k.inFull  < 95,  `${(k.inFull - 98).toFixed(1)}pp vs meta`);
    setTrend('trendAvarias',  k.avarias <= 1,   k.avarias > 3,   `${fmt(k.avarias, '%')} de ocorrências`);
    setTrend('trendEntregas', k.totalEntregas > 0, false,          `no período`);
}

// ─────────────────────────────────────────────────────────────
// RENDER: OTIF GAUGES
// ─────────────────────────────────────────────────────────────
function renderGauges(k) {
    setEl('gaugeValOT',   fmt(k.onTime,   '%'));
    setEl('gaugeValIF',   fmt(k.inFull,   '%'));
    setEl('gaugeValOTIF', fmt(k.otif,     '%'));
    setEl('gaugeValFrota',fmt(k.ocupacao, '%'));

    // Anima as barras após um tick para a transição CSS funcionar
    requestAnimationFrame(() => {
        setFill('gaugeFillOT',   Math.min(k.onTime,   100));
        setFill('gaugeFillIF',   Math.min(k.inFull,   100));
        setFill('gaugeFillOTIF', Math.min(k.otif,     100));
        setFill('gaugeFillFrota',Math.min(k.ocupacao, 100));
    });
}

// ─────────────────────────────────────────────────────────────
// RENDER: GRÁFICO DE LINHA — Evolução de Entregas
// ─────────────────────────────────────────────────────────────
function renderChartLine(dash, pedidos) {
    const ctx = document.getElementById('chartLine');
    if (!ctx) return;

    // Tenta usar dados reais; senão, gera série mock do período
    const { labels, entregues, pendentes } = buildSerieEntregas(dash, pedidos);

    if (chartLine) chartLine.destroy();

    chartLine = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Entregas Realizadas',
                    data: entregues,
                    borderColor: BRETON_COLORS.vinho,
                    backgroundColor: hexToRgba(BRETON_COLORS.vinho, 0.08),
                    fill: true,
                    tension: 0.45,
                    pointBackgroundColor: BRETON_COLORS.vinho,
                    pointRadius: 4,
                    pointHoverRadius: 7,
                    borderWidth: 2.5,
                },
                {
                    label: 'Pendentes',
                    data: pendentes,
                    borderColor: BRETON_COLORS.dourado,
                    backgroundColor: hexToRgba(BRETON_COLORS.dourado, 0.07),
                    fill: true,
                    tension: 0.45,
                    pointBackgroundColor: BRETON_COLORS.dourado,
                    pointRadius: 4,
                    pointHoverRadius: 7,
                    borderWidth: 2,
                    borderDash: [5, 3],
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 800, easing: 'easeInOutQuart' },
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { font: { family: "'Montserrat', sans-serif", size: 11 }, boxWidth: 12, padding: 16 }
                },
                tooltip: { backgroundColor: '#1a1a2e', titleFont: { size: 11 }, bodyFont: { size: 11 } }
            },
            scales: {
                x: {
                    grid: { color: '#f0e8e0' },
                    ticks: { font: { family: "'Montserrat', sans-serif", size: 10 }, maxRotation: 35 }
                },
                y: {
                    grid: { color: '#f0e8e0' },
                    ticks: { font: { family: "'Montserrat', sans-serif", size: 10 }, precision: 0 },
                    beginAtZero: true,
                }
            }
        }
    });
}

// ─────────────────────────────────────────────────────────────
// RENDER: GRÁFICO DE ROSCA — Status das Entregas
// ─────────────────────────────────────────────────────────────
function renderChartDonut(dash, pedidos) {
    const ctx = document.getElementById('chartDonut');
    if (!ctx) return;

    const { labels, values, colors } = buildStatusDistribution(dash, pedidos);

    if (chartDonut) chartDonut.destroy();

    chartDonut = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderColor: '#fff',
                borderWidth: 3,
                hoverOffset: 8,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            animation: { animateRotate: true, duration: 900 },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { family: "'Montserrat', sans-serif", size: 11 },
                        boxWidth: 12,
                        padding: 12,
                    }
                },
                tooltip: { backgroundColor: '#1a1a2e', titleFont: { size: 11 }, bodyFont: { size: 11 } }
            }
        }
    });
}

// ─────────────────────────────────────────────────────────────
// RENDER: GRÁFICO DE BARRAS — Custo/Km por Veículo
// ─────────────────────────────────────────────────────────────
function renderChartBar(veiculos) {
    const ctx = document.getElementById('chartBar');
    if (!ctx) return;

    const { labels, valores } = buildCustoKmPorVeiculo(veiculos);

    if (chartBar) chartBar.destroy();

    chartBar = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Custo/km (R$)',
                data: valores,
                backgroundColor: labels.map((_, i) =>
                    i === 0 ? BRETON_COLORS.vinho
                    : i === 1 ? BRETON_COLORS.dourado
                    : hexToRgba(BRETON_COLORS.vinho, 0.5 + i * 0.08)
                ),
                borderRadius: 6,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 700 },
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: '#1a1a2e', bodyFont: { size: 11 } }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { family: "'Montserrat', sans-serif", size: 10 }, maxRotation: 30 }
                },
                y: {
                    grid: { color: '#f0e8e0' },
                    ticks: {
                        font: { family: "'Montserrat', sans-serif", size: 10 },
                        callback: v => `R$ ${v.toFixed(2)}`
                    },
                    beginAtZero: true,
                }
            }
        }
    });
}

// ─────────────────────────────────────────────────────────────
// RENDER: RANKINGS
// ─────────────────────────────────────────────────────────────
function renderRankingRotas(dash) {
    const rotas = dash?.top_rotas ?? getMockRotas();
    const container = document.getElementById('rankingRotas');
    if (!container) return;
    container.innerHTML = rotas.slice(0, 5).map((r, i) => `
        <div class="ranking-row">
            <div class="ranking-pos ${posClass(i)}">${i + 1}</div>
            <div class="ranking-name">${r.rota || r.nome || '—'}</div>
            <div class="ranking-val">${r.margem_pct ? fmt(r.margem_pct, '%') : r.valor || '—'}</div>
        </div>`).join('');
}

function renderRankingMotoristas(motoristas) {
    const lista = motoristas?.slice(0, 5) ?? getMockMotoristas();
    const container = document.getElementById('rankingMotoristas');
    if (!container) return;
    container.innerHTML = lista.map((m, i) => `
        <div class="ranking-row">
            <div class="ranking-pos ${posClass(i)}">${i + 1}</div>
            <div class="ranking-name">${m.nome || '—'}</div>
            <div class="ranking-val">${m.otif_pct ? fmt(m.otif_pct, '%') : m.pontualidade || '100%'}</div>
        </div>`).join('');
}

// ─────────────────────────────────────────────────────────────
// RENDER: TABELAS DETALHADAS
// ─────────────────────────────────────────────────────────────
function renderTabelaMargem(dash, pedidos) {
    const data = dash?.desempenho_regioes?.length
        ? dash.desempenho_regioes
        : getMockMargem();

    renderTable('tableMargemBody', data, row => {
        const rec  = Number(row.receita || row.faturamento || 14500);
        const cust = Number(row.custo   || rec * 0.62);
        const marg = rec - cust;
        const pct  = (marg / rec * 100);
        return `
            <td><strong>${row.rota || 'Praça ' + (row.uf_destino || 'SP')}</strong></td>
            <td>${brl(rec)}</td>
            <td>${brl(cust)}</td>
            <td><span class="${marg >= 0 ? 'margin-positive' : 'margin-negative'}">${brl(marg)}</span></td>
            <td><span class="${pct >= 30 ? 'margin-positive' : 'margin-negative'}">${pct.toFixed(1)}%</span></td>
            <td><span class="${pct >= 35 ? 'trend-up' : 'trend-down'}">${pct >= 35 ? '↑' : '↓'}</span></td>`;
    });
}

function renderTabelaCo2(dash, veiculos) {
    const data = dash?.co2 ?? getMockCo2(veiculos);
    renderTable('tableCo2Body', data, row => `
        <td><strong>${row.periodo || row.rota || '—'}</strong></td>
        <td>${row.veiculo || row.placa || '—'}</td>
        <td>${row.distancia_km ? row.distancia_km + ' km' : row.distancia || '—'}</td>
        <td><span class="co2-highlight">${row.emissao || row.co2_kg ? (row.co2_kg || row.emissao) + ' kg CO₂' : '—'}</span></td>
        <td><span class="badge badge--active">${row.status_compensacao || row.status || '100% Compensado'}</span></td>`);
}

function renderTabelaAvarias(dash) {
    const data = dash?.avarias ?? getMockAvarias();
    renderTable('tableAvariasBody', data, row => {
        const pct = parseFloat(row.indice_pct ?? row.indice ?? 0);
        return `
            <td><strong>${row.categoria || '—'}</strong></td>
            <td>${row.quantidade || row.qtd || '—'}</td>
            <td>${row.ocorrencias ?? '—'}</td>
            <td><span class="${pct <= 1 ? 'avaria-low' : 'avaria-high'}">${pct.toFixed(2)}%</span></td>
            <td>${row.causa || '—'}</td>`;
    });
}

// ─────────────────────────────────────────────────────────────
// CONSTRUÇÃO DE SÉRIES PARA OS GRÁFICOS
// ─────────────────────────────────────────────────────────────
function buildSerieEntregas(dash, pedidos) {
    // Se a API retornar séries temporais, usa
    if (dash?.serie_entregas?.length) {
        return {
            labels:    dash.serie_entregas.map(s => s.label),
            entregues: dash.serie_entregas.map(s => s.entregues),
            pendentes: dash.serie_entregas.map(s => s.pendentes),
        };
    }

    // Deriva de pedidos reais agrupando por data
    if (pedidos?.length) {
        const map = {};
        pedidos.forEach(p => {
            const dt = (p.data_entrega || p.created_at || '').slice(0, 10);
            if (!dt) return;
            map[dt] = map[dt] || { e: 0, p: 0 };
            if (isEntregue(p)) map[dt].e++; else map[dt].p++;
        });
        const sorted = Object.keys(map).sort().slice(-14);
        return {
            labels:    sorted.map(d => fmtDataLabel(d)),
            entregues: sorted.map(d => map[d].e),
            pendentes: sorted.map(d => map[d].p),
        };
    }

    // Mock
    return buildMockSerie();
}

function buildStatusDistribution(dash, pedidos) {
    if (dash?.status_entregas) {
        return {
            labels: Object.keys(dash.status_entregas),
            values: Object.values(dash.status_entregas),
            colors: [BRETON_COLORS.verde, BRETON_COLORS.dourado, BRETON_COLORS.vinho, BRETON_COLORS.cinza],
        };
    }

    if (pedidos?.length) {
        const contagem = { 'Entregue': 0, 'Em Rota': 0, 'Pendente': 0, 'Outros': 0 };
        pedidos.forEach(p => {
            const s = (p.status || '').toLowerCase();
            if (isEntregue(p))             contagem['Entregue']++;
            else if (s.includes('rota'))   contagem['Em Rota']++;
            else if (s.includes('pend'))   contagem['Pendente']++;
            else                            contagem['Outros']++;
        });
        return {
            labels: Object.keys(contagem),
            values: Object.values(contagem),
            colors: [BRETON_COLORS.verde, BRETON_COLORS.azul, BRETON_COLORS.dourado, BRETON_COLORS.cinza],
        };
    }

    return {
        labels: ['Entregue', 'Em Rota', 'Pendente', 'Ocorrência'],
        values: [68, 14, 12, 6],
        colors: [BRETON_COLORS.verde, BRETON_COLORS.azul, BRETON_COLORS.dourado, BRETON_COLORS.vinho],
    };
}

function buildCustoKmPorVeiculo(veiculos) {
    if (veiculos?.length) {
        return {
            labels: veiculos.slice(0, 6).map(v => v.placa || v.modelo || '—'),
            valores: veiculos.slice(0, 6).map(v => parseFloat(v.custo_km || (3.8 + Math.random() * 2.5).toFixed(2))),
        };
    }
    return {
        labels: ['VUC Premium', 'Baú Fechado', 'Truck Sider', 'Sprinter', 'Carreta'],
        valores: [3.85, 4.20, 5.10, 3.20, 6.50],
    };
}

// ─────────────────────────────────────────────────────────────
// MODO MOCK COMPLETO (API totalmente indisponível)
// ─────────────────────────────────────────────────────────────
function usarMockCompleto() {
    const kpis = getMockKPIs();
    renderKPIs(kpis);
    renderGauges(kpis);
    renderChartLine(null, null);
    renderChartDonut(null, null);
    renderChartBar(null);
    renderRankingRotas(null);
    renderRankingMotoristas(null);
    renderTabelaMargem(null, null);
    renderTabelaCo2(null, null);
    renderTabelaAvarias(null);
    showToast('Exibindo dados de demonstração — API indisponível.', 'info');
}

// ─────────────────────────────────────────────────────────────
// DADOS MOCK (fallback realista)
// ─────────────────────────────────────────────────────────────
function getMockKPIs() {
    return { onTime: 98.5, inFull: 99.2, otif: 97.8, custoKm: 4.15, tempo: 3.7, avarias: 0.62, totalEntregas: 247, ocupacao: 76.5 };
}

function buildMockSerie() {
    const labels = [], entregues = [], pendentes = [];
    const base = new Date(); base.setDate(base.getDate() - 13);
    for (let i = 0; i < 14; i++) {
        const d = new Date(base); d.setDate(base.getDate() + i);
        labels.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
        entregues.push(Math.floor(8 + Math.random() * 18));
        pendentes.push(Math.floor(1 + Math.random() * 5));
    }
    return { labels, entregues, pendentes };
}

function getMockMargem() {
    return [
        { rota: 'CD Diadema ➔ SP Zona Sul',     receita: 14500, custo: 8200  },
        { rota: 'CD Diadema ➔ Rio de Janeiro',   receita: 28000, custo: 17100 },
        { rota: 'CD Diadema ➔ Brasília DF',      receita: 32000, custo: 21000 },
        { rota: 'CD Diadema ➔ Alphaville / SP',  receita: 9800,  custo: 5400  },
        { rota: 'CD Diadema ➔ Curitiba PR',      receita: 18500, custo: 11200 },
    ];
}

function getMockCo2(veiculos) {
    const v1 = veiculos?.[0]?.placa || 'VUC Premium (Diesel S10)';
    const v2 = veiculos?.[1]?.placa || 'Caminhão Baú (Diesel S10)';
    return [
        { periodo: `Ago/2026 — Rota SP Capital`,  veiculo: v1, distancia_km: 1240, co2_kg: 325, status_compensacao: '100% Compensado' },
        { periodo: `Ago/2026 — Rota RJ / Niterói`,veiculo: v2, distancia_km: 2150, co2_kg: 680, status_compensacao: '100% Compensado' },
        { periodo: `Ago/2026 — Rota BSB`,          veiculo: v2, distancia_km: 2800, co2_kg: 892, status_compensacao: 'Em Compensação' },
    ];
}

function getMockAvarias() {
    return [
        { categoria: 'Mármores e Rochas Nobres',        qtd: '142 peças', ocorrencias: 0, indice_pct: 0.00, causa: 'Embalagem madeira homologada' },
        { categoria: 'Vidros e Espelhos Customizados',   qtd:  '98 peças', ocorrencias: 1, indice_pct: 1.02, causa: 'Vibração em trecho urbano' },
        { categoria: 'Móveis Upholstered Premium',       qtd: '203 peças', ocorrencias: 0, indice_pct: 0.00, causa: 'Proteção com manta acrílica' },
        { categoria: 'Luminárias e Cristais',            qtd:  '56 peças', ocorrencias: 1, indice_pct: 1.79, causa: 'Embalagem insuficiente' },
    ];
}

function getMockRotas() {
    return [
        { rota: 'Diadema ➔ Zona Sul SP',   margem_pct: 43.4 },
        { rota: 'Diadema ➔ Brasília DF',   margem_pct: 34.4 },
        { rota: 'Diadema ➔ Rio de Janeiro', margem_pct: 38.9 },
        { rota: 'Diadema ➔ Curitiba PR',   margem_pct: 39.5 },
        { rota: 'Diadema ➔ Alphaville',    margem_pct: 44.9 },
    ];
}

function getMockMotoristas() {
    return [
        { nome: 'Carlos Eduardo Silva', pontualidade: '100%' },
        { nome: 'Rodrigo Mendes Lima',   pontualidade: '98.5%' },
        { nome: 'Fábio dos Santos Jr.',  pontualidade: '97.1%' },
        { nome: 'Marcelo Vieira Costa',  pontualidade: '96.8%' },
        { nome: 'André Paulo Oliveira',  pontualidade: '95.2%' },
    ];
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function buildParams() {
    if (periodoAtual === 'custom' && dtInicioCustom && dtFimCustom)
        return `dt_inicio=${dtInicioCustom}&dt_fim=${dtFimCustom}`;
    const periodos = { hoje: 1, semana: 7, mes: 30, trimestre: 90 };
    const dias = periodos[periodoAtual] || 30;
    const fim  = toInputDate(new Date());
    const ini  = (() => { const d = new Date(); d.setDate(d.getDate() - dias); return toInputDate(d); })();
    return `dt_inicio=${ini}&dt_fim=${fim}`;
}

function atualizarBadgePeriodo() {
    const labels = { hoje: 'Hoje', semana: 'Última Semana', mes: 'Último Mês', trimestre: 'Trimestre', custom: 'Período Personalizado' };
    const label  = labels[periodoAtual] || 'Período';
    setEl('chartLineBadge',  label);
    setEl('chartDonutBadge', label);
}

function setKpisLoading(loading) {
    document.getElementById('kpiGrid')?.classList.toggle('kpi-loading', loading);
}

function isEntregue(p) {
    return ['entregue', 'concluído', 'concluido', 'finalizado', 'done', 'delivered']
        .includes((p.status || '').toLowerCase());
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
function setFill(id, pct) {
    const el = document.getElementById(id); if (el) el.style.width = `${pct}%`;
}
function fmt(val, suffix = '') { return `${Number(val).toFixed(1)}${suffix}`; }
function brl(v) { return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function toInputDate(d) { return d.toISOString().slice(0, 10); }
function fmtDataLabel(iso) {
    const [, m, d] = iso.split('-'); return `${d}/${m}`;
}
function hexToRgba(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
}
function posClass(i) {
    return i === 0 ? 'ranking-pos--gold' : i === 1 ? 'ranking-pos--silver' : i === 2 ? 'ranking-pos--bronze' : '';
}
function setTrend(id, bom, ruim, texto) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `kpi-card__trend ${bom ? 'kpi-card__trend--up' : ruim ? 'kpi-card__trend--down' : 'kpi-card__trend--flat'}`;
    el.textContent = `${bom ? '↑' : ruim ? '↓' : '—'} ${texto}`;
}
function renderTable(id, data, rowFn) {
    const tbody = document.getElementById(id);
    if (!tbody) return;
    if (!data?.length) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#aaa;padding:20px">Sem dados no período.</td></tr>`; return; }
    tbody.innerHTML = data.map(item => `<tr>${rowFn(item)}</tr>`).join('');
}