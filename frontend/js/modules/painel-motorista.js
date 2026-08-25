// frontend/js/modules/painel-motorista.js
// ─────────────────────────────────────────────────────────────
// Portal do Motorista — TMS Breton V2
// Workflow completo: Iniciar Rota → Registrar Ocorrência → Marcar Entregue
// Assinatura digital (canvas) + upload de foto + sync com API
// ─────────────────────────────────────────────────────────────

import { api, authService, authStorage } from '../api/api.js?v=17';
import { checkAuth } from '../utils/auth-guard.js?v=2';

// ─────────────────────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────────────────────
const state = {
    motorista:  null,   // perfil do motorista autenticado
    entregas:   [],     // todas as entregas do dia
    filtro:     'todos',
    modoAcao:   'finalizacao',
    ultimoRecebedor: '',
    ultimoDocumento: '',
    ultimaObservacao: '',
    // Comprovante em andamento
    pedidoAtivo: null,
    sigCanvas:   null,
    sigCtx:      null,
    sigDesenhando: false,
    sigTemAssinatura: false,
    fotoBase64:  null,
    fotoFile:    null,
    fotosFiles:  [],
    fotosRessalvaFiles: [],
    checkinEntrega: null,
    checkinGostou: null,
    checkinResolve: null,
};

// ─────────────────────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (authStorage.getToken()) {
        checkAuth();
    }

    state.motorista = authStorage.getUser() || { nome: 'Motorista de Teste', cargo: 'Motorista' };
    renderPerfil();

    document.getElementById('btnRefresh')?.addEventListener('click',  carregarEntregas);
    document.getElementById('navRefresh')?.addEventListener('click',  carregarEntregas);
    document.getElementById('btnNavLogout')?.addEventListener('click', () => authService.logout());

    initFiltros();
    initComprovante();
    initCheckinSatisfacao();
    atualizarStats();
    renderEntregas();
    carregarEntregas();
});

// ─────────────────────────────────────────────────────────────
// PERFIL DO MOTORISTA
// ─────────────────────────────────────────────────────────────
function renderPerfil() {
    const u = state.motorista;
    const nome   = u?.nome || u?.name || u?.username || 'Motorista';
    const inicio = initials(nome);
    const cnh    = u?.cnh    ? `CNH ${u.cnh}` : '';
    const placa  = u?.placa  ? `🚚 ${u.placa}` : '🚚 Sem veículo atribuído';

    setEl('driverName',   nome);
    setEl('driverMeta',   u?.cargo || 'Motorista');
    setEl('driverVeiculo',placa);
    setEl('topAvatar',    inicio);
    setEl('driverPhoto',  inicio);
}

// ─────────────────────────────────────────────────────────────
// CARREGAMENTO DE ENTREGAS
// ─────────────────────────────────────────────────────────────
function normalizarParadaParaEntrega(parada) {
    const pedido = parada?.pedido || {};
    return {
        id: parada?.id || pedido?.id,
        parada_id: parada?.id || pedido?.id,
        pedido_id: pedido?.id || parada?.pedido_id || null,
        pedido_numero: pedido?.numero_nota || pedido?.pedido_numero || pedido?.id || '#',
        cliente_nome: pedido?.cliente || pedido?.destinatario?.nome || '—',
        endereco: pedido?.endereco || pedido?.destinatario?.logradouro || '—',
        endereco_entrega_rua: pedido?.endereco || pedido?.destinatario?.logradouro || '',
        endereco_entrega_bairro: pedido?.bairro || pedido?.destinatario?.bairro || '',
        endereco_entrega_cidade: pedido?.cidade || pedido?.destinatario?.cidade || '',
        endereco_entrega_uf: pedido?.uf || pedido?.destinatario?.uf || '',
        endereco_entrega_cep: pedido?.cep || pedido?.destinatario?.cep || '',
        cidade_uf: pedido?.cidade && pedido?.uf ? `${pedido.cidade} / ${pedido.uf}` : '',
        periodo: pedido?.periodo || parada?.periodo || '',
        total_volumes: pedido?.volume_total || parada?.volume_total || '',
        volumes: pedido?.volume_total || parada?.volume_total || '',
        itens_descricao: (Array.isArray(pedido?.itens) ? pedido.itens.map(i => i?.descricao || i?.codigo || '').filter(Boolean).join(', ') : ''),
        status: parada?.status || pedido?.status || 'PENDENTE',
        data_entrega: pedido?.data_entrega || '',
        observacao: pedido?.observacao || '',
        ...parada,
    };
}

function usarEntregasDemo() {
    return new URLSearchParams(window.location.search).get('demo') === '1';
}

async function carregarEntregas() {
    mostrarSkeleton();

    try {
        const res = await api.request('/roteirizacao/motorista/entregas/', 'GET');
        const lista = safeList(res).map(normalizarParadaParaEntrega);
        if (lista.length) {
            state.entregas = lista;
        } else if (usarEntregasDemo()) {
            state.entregas = getMockEntregas();
            showToast('Mostrando entregas de exemplo (modo demo).', 'info');
        } else {
            state.entregas = [];
        }
    } catch (e) {
        console.error('[Motorista] Falha ao carregar entregas:', e);
        if (usarEntregasDemo()) {
            state.entregas = getMockEntregas();
            showToast('Mostrando entregas de exemplo (modo demo).', 'info');
        } else {
            state.entregas = [];
            showToast('Não foi possível carregar as entregas do manifesto.', 'error');
        }
    }

    atualizarStats();
    renderEntregas();
}

function atualizarStats() {
    const total     = state.entregas.length;
    const concl     = state.entregas.filter(e => isEntregue(e)).length;
    const pendentes = state.entregas.filter(e => isPendente(e)).length;

    setEl('statTotal',     String(total));
    setEl('statConcluidas',String(concl));
    setEl('statPendentes', String(pendentes));
}

// ─────────────────────────────────────────────────────────────
// FILTROS
// ─────────────────────────────────────────────────────────────
function initFiltros() {
    document.querySelectorAll('#filterBar .filter-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('filter-pill--active'));
            btn.classList.add('filter-pill--active');
            state.filtro = btn.dataset.filter;
            renderEntregas();
        });
    });
}

function entregasFiltradas() {
    if (state.filtro === 'todos') return ordenarEntregasFiltroTodos(state.entregas);
    return state.entregas.filter(e => getStatusKey(e) === state.filtro);
}

function ordenarEntregasFiltroTodos(entregas = []) {
    const agora = new Date();
    const limiteConcluidos = new Date(agora.getTime() - (15 * 24 * 60 * 60 * 1000));

    const elegiveis = entregas.filter((e) => {
        if (!isEntregue(e)) return true;
        const dataConclusao = obterDataConclusao(e);
        return !!dataConclusao && dataConclusao >= limiteConcluidos;
    });

    return [...elegiveis].sort((a, b) => {
        const pa = prioridadeFiltroTodos(a);
        const pb = prioridadeFiltroTodos(b);
        if (pa !== pb) return pa - pb;

        if (pa === 3) {
            const da = obterDataConclusao(a)?.getTime() || 0;
            const db = obterDataConclusao(b)?.getTime() || 0;
            return db - da;
        }

        const sa = Number(a?.sequencia || 0);
        const sb = Number(b?.sequencia || 0);
        if (sa !== sb) return sa - sb;
        return Number(a?.parada_id || a?.id || 0) - Number(b?.parada_id || b?.id || 0);
    });
}

function prioridadeFiltroTodos(entrega) {
    const statusBruto = String(entrega?.status || '').trim().toUpperCase();
    if (statusBruto === 'INICIO') return 0;
    if (getStatusKey(entrega) === 'pendente') return 1;
    if (isEntregue(entrega)) return 3;
    return 2;
}

function obterDataConclusao(entrega) {
    const candidatos = [
        entrega?.finalizado,
        entrega?.updated_at,
        entrega?.data_atualizacao,
        entrega?.data_entrega,
    ];
    for (const valor of candidatos) {
        if (!valor) continue;
        const dt = new Date(valor);
        if (!Number.isNaN(dt.getTime())) return dt;
    }
    return null;
}

// ─────────────────────────────────────────────────────────────
// RENDER: LISTA DE ENTREGAS
// ─────────────────────────────────────────────────────────────
function renderEntregas() {
    const lista     = entregasFiltradas();
    const container = document.getElementById('entregasList');
    if (!container) return;

    const totalFiltrado = lista.length;
    setEl('sectionCount', `${totalFiltrado} ${totalFiltrado === 1 ? 'pedido' : 'pedidos'}`);

    const labelFiltro = {
        todos: '📋 Entregas de Hoje',
        'pendente': '⏳ Pendentes',
        'em-rota':  '🚀 Em Rota',
        'entregue': '✅ Entregues',
        'ocorrencia':'⚠️ Ocorrências',
    };
    setEl('sectionTitle', labelFiltro[state.filtro] || '📋 Entregas');

    if (!lista.length) {
        const semManifesto = !state.entregas.length;
        container.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1">
                <span class="empty-state__icon">📭</span>
                <p>${semManifesto
                    ? 'Nenhuma entrega do manifesto aparece para este motorista. Confira se o colaborador tem usuário de app e se o manifesto foi incluído com esse motorista.'
                    : 'Nenhuma entrega encontrada para este filtro.'}</p>
            </div>`;
        return;
    }

    container.innerHTML = lista.map((e, idx) => renderCardEntrega(e, idx + 1, lista.length)).join('');

    // Eventos dos botões de cada card
    lista.forEach(e => {
        const id = e.id;
        document.getElementById(`btnSmart-${id}`)?.addEventListener('click',     () => executarAcaoInteligente(e));
        document.getElementById(`btnNavMap-${id}`)?.addEventListener('click',   () => abrirMaps(e));
    });
}

function renderCardEntrega(e, idx, total) {
    const statusKey  = getStatusKey(e);
    const statusInfo = getStatusInfo(statusKey);
    const numero     = e.pedido_numero || e.numero || `#${e.id}`;
    const cliente    = e.cliente_nome || '—';
    const endereco   = buildEndereco(e);
    const periodo    = e.periodo || e.periodo_entrega || '';
    const volumes    = e.total_volumes || e.volumes || '';
    const itens      = e.itens_descricao || e.item || '';
    const pct        = Math.round((idx / total) * 100);

    // Botões conforme status
    const botoesHtml = renderBotoes(e, statusKey);

    return `
        <div class="entrega-card" id="card-${e.id}">
            <div class="entrega-card__header">
                <span class="entrega-card__num">Pedido ${numero} · Parada ${idx}/${total}</span>
                <span class="status-badge status-badge--${statusKey}">${statusInfo.emoji} ${statusInfo.label}</span>
            </div>
            <div class="entrega-card__body">
                <div class="entrega-card__cliente">${esc(cliente)}</div>
                <div class="entrega-card__endereco">
                    <span>📍</span>
                    <span>${esc(endereco)}</span>
                </div>
                <div class="entrega-card__tags">
                    ${periodo ? `<span class="entrega-card__tag entrega-card__tag--periodo">⏰ ${periodo}</span>` : ''}
                    ${volumes ? `<span class="entrega-card__tag entrega-card__tag--vol">📦 ${volumes} vol.</span>` : ''}
                    ${itens   ? `<span class="entrega-card__tag">${esc(truncar(itens, 35))}</span>` : ''}
                </div>
                <div class="parada-prog">
                    <span>Progresso do dia</span>
                    <div class="parada-prog__bar">
                        <div class="parada-prog__fill" style="width:${pct}%"></div>
                    </div>
                    <span>${pct}%</span>
                </div>
            </div>
            ${botoesHtml}
            <!-- Form inline de Ocorrência -->
            <div class="ocorrencia-form" id="ocForm-${e.id}">
                <div class="ocorrencia-form__label">⚠️ Registrar Ocorrência</div>
                <select id="ocTipo-${e.id}">
                    <option value="">Selecione o tipo...</option>
                    <option>Cliente Ausente</option>
                    <option>Endereço Não Encontrado</option>
                    <option>Recusa de Recebimento</option>
                    <option>Produto Avariado</option>
                    <option>Acesso Bloqueado</option>
                    <option>Tentativa Sem Sucesso</option>
                    <option>Outro</option>
                </select>
                <textarea id="ocDesc-${e.id}" placeholder="Descreva a ocorrência em detalhes..." rows="2" style="margin-top:6px;width:100%;padding:8px 10px;border:1px solid #f5c6cb;border-radius:8px;font-family:'Montserrat',sans-serif;font-size:.78rem;resize:none;"></textarea>
                <div class="ocorrencia-btns">
                    <button class="btn-cancel-oc" id="btnCancelOc-${e.id}">Cancelar</button>
                    <button class="btn-send-oc"   id="btnSendOc-${e.id}">📤 Enviar</button>
                </div>
            </div>
        </div>`;
}

function renderBotoes(e, statusKey) {
    const id = e.id;
    const acao = getAcaoInteligente(e.status);

    if (acao.disabled) {
        return `
            <div class="entrega-card__actions">
                <button class="action-btn action-btn--concluido" disabled>
                    <span class="action-btn__icon">✅</span>${acao.label}
                </button>
            </div>`;
    }

    return `
        <div class="entrega-card__actions entrega-card__actions--2col">
            <button class="action-btn action-btn--entregar" id="btnSmart-${id}" data-action="${acao.tipo}">
                <span class="action-btn__icon">${acao.icon}</span>${acao.label}
            </button>
            <button class="action-btn action-btn--nav" id="btnNavMap-${id}">
                <span class="action-btn__icon">🗺️</span>Navegar
            </button>
        </div>`;
}

function getAcaoInteligente(statusRaw) {
    const s = String(statusRaw || '').trim().toUpperCase();
    if (['ENTREGA_REALIZADA', 'ENTREGUE', 'CONCLUIDO', 'CONCLUÍDO', 'FINALIZADO', 'RESSALVA'].includes(s)) {
        return { label: 'Entregue', icon: '✅', tipo: 'entregue', disabled: true };
    }
    if (s === 'SAIDA') {
        return { label: 'Registrar Chegada', icon: '📍', tipo: 'chegada', disabled: false };
    }
    if (s === 'CHEGADA') {
        return { label: 'Iniciar Descarregamento', icon: '📦', tipo: 'inicio', disabled: false };
    }
    if (s === 'INICIO') {
        return { label: 'Finalizar Entrega', icon: '✅', tipo: 'finalizar', disabled: false };
    }
    return { label: 'Iniciar Saída (A Caminho)', icon: '🚀', tipo: 'saida', disabled: false };
}

async function executarAcaoInteligente(e) {
    const acao = getAcaoInteligente(e.status);
    const paradaId = e.parada_id || e.id;
    const btn = document.getElementById(`btnSmart-${e.id}`);

    if (acao.disabled) return;
    if (!paradaId && !e._demo) return;

    if (acao.tipo === 'saida') {
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Iniciando...'; }
        await atualizarStatusMotorista(e, 'SAIDA', { observacoes_entrega: e.observacao || '' }, 'Saída registrada com sucesso!');
        return;
    }

    if (acao.tipo === 'chegada') {
        abrirComprovanteChegada(e);
        return;
    }

    if (acao.tipo === 'inicio') {
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Processando...'; }
        await atualizarStatusMotorista(e, 'INICIO', {}, 'Descarregamento iniciado!');
        return;
    }

    if (acao.tipo === 'finalizar') {
        abrirComprovante(e);
    }
}

async function atualizarStatusMotorista(entrega, novoStatus, extraPayload = {}, sucessoMsg = 'Status atualizado!') {
    const paradaId = entrega?.parada_id || entrega?.id;
    if (!paradaId) return;

    if (entrega._demo) {
        atualizarStatusEntregaLocal(paradaId, novoStatus);
        renderEntregas();
        atualizarStats();
        showToast(sucessoMsg, 'success');
        return;
    }

    try {
        await postStatusMotorista(paradaId, { status: novoStatus, ...extraPayload });
        atualizarStatusEntregaLocal(paradaId, novoStatus);
        await carregarEntregas();
        showToast(sucessoMsg, 'success');
    } catch (err) {
        console.error(`[Motorista] Erro ao atualizar ${novoStatus}:`, err);
        showToast(`Não foi possível atualizar para ${novoStatus}.`, 'error');
    } finally {
        renderEntregas();
        atualizarStats();
    }
}

function atualizarStatusEntregaLocal(paradaId, novoStatus) {
    const alvo = String(paradaId);
    const entry = state.entregas.find(x => String(x.parada_id || x.id) === alvo || String(x.id) === alvo);
    if (entry) entry.status = novoStatus;
}

// ─────────────────────────────────────────────────────────────
// AÇÃO: TOGGLE FORMULÁRIO DE OCORRÊNCIA
// ─────────────────────────────────────────────────────────────
function toggleOcorrencia(e) {
    const form = document.getElementById(`ocForm-${e.id}`);
    if (!form) return;
    form.classList.toggle('is-open');
}

async function enviarOcorrencia(e) {
    const tipo = document.getElementById(`ocTipo-${e.id}`)?.value;
    const desc = document.getElementById(`ocDesc-${e.id}`)?.value?.trim();

    if (!tipo) { showToast('Selecione o tipo de ocorrência.', 'error'); return; }

    const btn = document.getElementById(`btnSendOc-${e.id}`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Enviando...'; }

    try {
        await api.request('/ocorrencias', 'POST', {
            pedido_id:   e.id,
            tipo_ocorrencia: tipo,
            descricao:   desc || tipo,
            data_hora:   new Date().toISOString(),
            motorista_id: state.motorista?.id || null,
        });

        // Marca pedido com ocorrência
        await api.request(`/pedidos/${e.id}/`, 'PATCH', { status: 'Ocorrência' });

        const entry = state.entregas.find(x => x.id === e.id);
        if (entry) entry.status = 'Ocorrência';

        showToast(`Ocorrência "${tipo}" registrada!`, 'success');
        renderEntregas();
        atualizarStats();
    } catch (err) {
        console.error('[Motorista] Ocorrência:', err);
        showToast('Falha ao registrar ocorrência no servidor.', 'error');
    }
}

// ─────────────────────────────────────────────────────────────
// AÇÃO: NAVEGAR NO MAPS
// ─────────────────────────────────────────────────────────────
function abrirMaps(e) {
    const addr = buildEndereco(e);
    if (!addr || addr === '—') { showToast('Endereço não disponível.', 'info'); return; }
    const query = encodeURIComponent(addr);
    // Detecta iOS / Android
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const url   = isIOS
        ? `maps://maps.apple.com/?q=${query}`
        : `https://maps.google.com/?q=${query}`;
    window.open(url, '_blank');
}

// ─────────────────────────────────────────────────────────────
// COMPROVANTE DE ENTREGA (Bottom Sheet)
// ─────────────────────────────────────────────────────────────
function initComprovante() {
    // Assinatura canvas
    const canvas = document.getElementById('sigCanvas');
    if (canvas) {
        state.sigCanvas = canvas;
        state.sigCtx    = canvas.getContext('2d');
        setupCanvas(canvas);
    }

    document.getElementById('btnLimparSig')?.addEventListener('click', limparAssinatura);
    document.getElementById('btnCancelarComprovante')?.addEventListener('click', fecharComprovante);
    document.getElementById('btnConfirmarEntrega')?.addEventListener('click', confirmarEntrega);
    document.getElementById('btnCapturarSig')?.addEventListener('click', () => {
        document.getElementById('fotoInput')?.click();
    });

    // Foto
    document.getElementById('fotoInput')?.addEventListener('change', onFotoSelecionada);
    document.getElementById('fotoRessalvaInput')?.addEventListener('change', onFotoRessalvaSelecionada);
    renderFotoPreview();
    renderFotoRessalvaPreview();
    document.getElementById('statusFinalEntrega')?.addEventListener('change', atualizarVisibilidadeRessalva);

    // Fecha ao clicar no overlay
    document.getElementById('comprovanteOverlay')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) fecharComprovante();
    });
}

function getItensDaEntrega(entrega) {
    const itens = Array.isArray(entrega?.pedido?.itens) ? entrega.pedido.itens : [];
    return itens.map((it, idx) => ({
        codigo: String(it?.codigo || it?.etiqueta || `ITEM-${idx + 1}`),
        descricao: String(it?.descricao || it?.desc || it?.produto || `Item ${idx + 1}`),
    }));
}

function renderItensRessalva(entrega) {
    const list = document.getElementById('ressalvaItensList');
    if (!list) return;
    const itens = getItensDaEntrega(entrega);
    if (!itens.length) {
        list.innerHTML = '<div style="font-size:.76rem;color:#777;">Nenhum produto detalhado neste pedido.</div>';
        return;
    }
    list.innerHTML = itens.map((item, idx) => `
        <label class="ressalva-itens-item">
            <input type="checkbox" data-ressalva-item value="${esc(item.codigo)}||${esc(item.descricao)}" />
            <span><strong>${esc(item.codigo)}</strong> - ${esc(item.descricao)}</span>
        </label>
    `).join('');
}

function atualizarVisibilidadeRessalva() {
    const wrap = document.getElementById('ressalvaItensWrap');
    const fotosWrap = document.getElementById('ressalvaFotosWrap');
    const statusFinal = document.getElementById('statusFinalEntrega')?.value || 'ENTREGA_REALIZADA';
    if (!wrap) return;
    const mostrar = state.modoAcao !== 'chegada' && statusFinal === 'RESSALVA';
    wrap.style.display = mostrar ? 'block' : 'none';
    if (fotosWrap) fotosWrap.style.display = mostrar ? 'block' : 'none';
}

function setupCanvas(canvas) {
    const ctx = state.sigCtx;

    const getPos = (e, rect) => {
        const src = e.touches ? e.touches[0] : e;
        return { x: src.clientX - rect.left, y: src.clientY - rect.top };
    };

    const startDraw = e => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const { x, y } = getPos(e, rect);
        ctx.beginPath();
        ctx.moveTo(x, y);
        state.sigDesenhando = true;
        document.getElementById('sigPlaceholder').style.display = 'none';
    };

    const draw = e => {
        if (!state.sigDesenhando) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const { x, y } = getPos(e, rect);
        ctx.lineTo(x, y);
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth   = 2.5;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.stroke();
        state.sigTemAssinatura = true;
    };

    const endDraw = () => { state.sigDesenhando = false; };

    canvas.addEventListener('mousedown',  startDraw);
    canvas.addEventListener('mousemove',  draw);
    canvas.addEventListener('mouseup',    endDraw);
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove',  draw,       { passive: false });
    canvas.addEventListener('touchend',   endDraw);
}

function limparAssinatura() {
    const canvas = state.sigCanvas;
    const ctx    = state.sigCtx;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.sigTemAssinatura = false;
    const ph = document.getElementById('sigPlaceholder');
    if (ph) ph.style.display = 'flex';
}

async function onFotoSelecionada(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const otimizadas = await Promise.all(files.map((file) => otimizarImagemParaUpload(file)));
    state.fotosFiles = [...state.fotosFiles, ...otimizadas];
    state.fotoFile = state.fotosFiles[0] || null;
    state.fotoBase64 = null;
    renderFotoPreview();
    e.target.value = '';
}

async function onFotoRessalvaSelecionada(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const otimizadas = await Promise.all(files.map((file) => otimizarImagemParaUpload(file)));
    state.fotosRessalvaFiles = [...state.fotosRessalvaFiles, ...otimizadas];
    renderFotoRessalvaPreview();
    e.target.value = '';
}

function otimizarImagemParaUpload(file) {
    if (!file || !String(file.type || '').startsWith('image/')) {
        return Promise.resolve(file);
    }
    return new Promise((resolve) => {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = () => { img.src = String(reader.result || ''); };
        reader.onerror = () => resolve(file);
        img.onload = () => {
            const maxLado = 1600;
            const ratio = Math.min(1, maxLado / Math.max(img.width || 1, img.height || 1));
            const largura = Math.max(1, Math.round((img.width || 1) * ratio));
            const altura = Math.max(1, Math.round((img.height || 1) * ratio));

            const canvas = document.createElement('canvas');
            canvas.width = largura;
            canvas.height = altura;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(file);
                return;
            }
            ctx.drawImage(img, 0, 0, largura, altura);
            canvas.toBlob((blob) => {
                if (!blob) {
                    resolve(file);
                    return;
                }
                const ext = blob.type === 'image/png' ? 'png' : 'jpg';
                const nomeBase = String(file.name || 'foto').replace(/\.[^.]+$/, '');
                resolve(new File([blob], `${nomeBase}-opt.${ext}`, { type: blob.type || 'image/jpeg' }));
            }, 'image/jpeg', 0.78);
        };
        img.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });
}

function renderFotoPreview() {
    const grid = document.getElementById('fotoPreviewGrid');
    const empty = document.getElementById('fotoPreviewEmpty');
    if (!grid || !empty) return;

    if (!state.fotosFiles.length) {
        grid.innerHTML = '';
        grid.style.display = 'none';
        empty.style.display = 'block';
        return;
    }

    grid.style.display = 'grid';
    empty.style.display = 'none';
    grid.innerHTML = state.fotosFiles.map((file, idx) => `
        <div class="foto-preview-grid__item">
            <img src="${URL.createObjectURL(file)}" alt="Foto ${idx + 1}" />
            <button type="button" class="foto-preview-grid__remove" data-foto-index="${idx}">✕</button>
        </div>
    `).join('');

    grid.querySelectorAll('[data-foto-index]').forEach(btn => {
        btn.addEventListener('click', (ev) => {
            const idx = Number(ev.currentTarget.getAttribute('data-foto-index'));
            if (Number.isNaN(idx)) return;
            state.fotosFiles.splice(idx, 1);
            state.fotoFile = state.fotosFiles[0] || null;
            renderFotoPreview();
        });
    });
}

function renderFotoRessalvaPreview() {
    const grid = document.getElementById('fotoRessalvaPreviewGrid');
    const empty = document.getElementById('fotoRessalvaPreviewEmpty');
    if (!grid || !empty) return;

    if (!state.fotosRessalvaFiles.length) {
        grid.innerHTML = '';
        grid.style.display = 'none';
        empty.style.display = 'block';
        return;
    }

    grid.style.display = 'grid';
    empty.style.display = 'none';
    grid.innerHTML = state.fotosRessalvaFiles.map((file, idx) => `
        <div class="foto-preview-grid__item">
            <img src="${URL.createObjectURL(file)}" alt="Ressalva ${idx + 1}" />
            <button type="button" class="foto-preview-grid__remove" data-foto-ressalva-index="${idx}">✕</button>
        </div>
    `).join('');

    grid.querySelectorAll('[data-foto-ressalva-index]').forEach(btn => {
        btn.addEventListener('click', (ev) => {
            const idx = Number(ev.currentTarget.getAttribute('data-foto-ressalva-index'));
            if (Number.isNaN(idx)) return;
            state.fotosRessalvaFiles.splice(idx, 1);
            renderFotoRessalvaPreview();
        });
    });
}

function resetFotosComprovante() {
    state.fotoBase64 = null;
    state.fotoFile = null;
    state.fotosFiles = [];
    state.fotosRessalvaFiles = [];
    const fotoInput = document.getElementById('fotoInput');
    if (fotoInput) fotoInput.value = '';
    const fotoRessalvaInput = document.getElementById('fotoRessalvaInput');
    if (fotoRessalvaInput) fotoRessalvaInput.value = '';
    renderFotoPreview();
    renderFotoRessalvaPreview();
}

function abrirComprovante(e) {
    state.modoAcao = 'finalizacao';
    state.pedidoAtivo = e;
    limparAssinatura();
    resetFotosComprovante();
    const nomeEl = document.getElementById('nomeRecebedor');
    if (nomeEl) nomeEl.value = state.ultimoRecebedor || '';
    const docEl = document.getElementById('documentoRecebedor');
    if (docEl) docEl.value = state.ultimoDocumento || '';
    const obsEl = document.getElementById('obsEntrega');
    if (obsEl) obsEl.value = state.ultimaObservacao || '';
    const statusFinalEl = document.getElementById('statusFinalEntrega');
    if (statusFinalEl) statusFinalEl.value = 'ENTREGA_REALIZADA';
    renderItensRessalva(e);
    atualizarVisibilidadeRessalva();

    setModoComprovante('finalizacao');

    setEl('compPedidoInfo', `Pedido ${e.pedido_numero || '#' + e.id} — ${e.cliente_nome || '—'}`);

    // Ajusta canvas para o DOM já renderizado
    const canvas = state.sigCanvas;
    if (canvas) {
        canvas.width  = canvas.offsetWidth || 300;
        canvas.height = 160;
    }

    const overlay = document.getElementById('comprovanteOverlay');
    if (overlay) overlay.style.display = 'flex';
    nomeEl?.focus();
}

function abrirComprovanteChegada(e) {
    state.modoAcao = 'chegada';
    state.pedidoAtivo = e;
    limparAssinatura();
    resetFotosComprovante();
    setModoComprovante('chegada');
    renderItensRessalva(e);
    atualizarVisibilidadeRessalva();
    setEl('compPedidoInfo', `Pedido ${e.pedido_numero || '#' + e.id} — Registrar foto de chegada`);

    const canvas = state.sigCanvas;
    if (canvas) {
        canvas.width  = canvas.offsetWidth || 300;
        canvas.height = 160;
    }

    const overlay = document.getElementById('comprovanteOverlay');
    if (overlay) overlay.style.display = 'flex';
    document.getElementById('fotoInput')?.focus();
}

function setModoComprovante(modo) {
    const titulo = document.querySelector('#comprovanteSheet h3');
    const lblSig = document.getElementById('lblAssinatura');
    const sigWrap = document.getElementById('sigWrap');
    const nomeWrap = document.getElementById('nomeRecebedorWrap');
    const docWrap = document.getElementById('documentoRecebedorWrap');
    const obsWrap = document.getElementById('obsEntregaWrap');
    const statusWrap = document.getElementById('statusFinalWrap');
    const fotoLabel = document.querySelector('#fotoUploadArea p');
    const btnConfirm = document.getElementById('btnConfirmarEntrega');

    const isChegada = modo === 'chegada';
    if (titulo) titulo.textContent = isChegada ? '📍 Registrar Chegada' : '✅ Finalizar Entrega';
    if (lblSig) lblSig.style.display = isChegada ? 'none' : 'block';
    if (sigWrap) sigWrap.style.display = isChegada ? 'none' : 'block';
    if (nomeWrap) nomeWrap.style.display = isChegada ? 'none' : 'block';
    if (docWrap) docWrap.style.display = isChegada ? 'none' : 'block';
    if (obsWrap) obsWrap.style.display = isChegada ? 'none' : 'block';
    if (statusWrap) statusWrap.style.display = isChegada ? 'none' : 'block';
    if (fotoLabel) fotoLabel.textContent = isChegada
        ? 'Adicionar foto(s) da chegada (obrigatório)'
        : 'Adicionar foto(s) da entrega/produtos';
    if (btnConfirm) btnConfirm.textContent = isChegada ? '📍 Confirmar Chegada' : '✅ Confirmar Entrega';
    atualizarVisibilidadeRessalva();
}

function fecharComprovante() {
    const overlay = document.getElementById('comprovanteOverlay');
    if (overlay) overlay.style.display = 'none';
    state.pedidoAtivo = null;
}

function avancarParaProximaParada(paradaAtualId) {
    const ordenadas = [...state.entregas].sort((a, b) => {
        const seqA = Number(a?.sequencia || 0);
        const seqB = Number(b?.sequencia || 0);
        if (seqA !== seqB) return seqA - seqB;
        return Number(a?.parada_id || a?.id || 0) - Number(b?.parada_id || b?.id || 0);
    });

    const indiceAtual = ordenadas.findIndex(x => (x.parada_id || x.id) === paradaAtualId);
    const candidatas = ordenadas.filter(x => !isEntregue(x));
    let proxima = null;

    if (indiceAtual >= 0) {
        for (let i = indiceAtual + 1; i < ordenadas.length; i += 1) {
            if (!isEntregue(ordenadas[i])) {
                proxima = ordenadas[i];
                break;
            }
        }
    }
    if (!proxima && candidatas.length) proxima = candidatas[0];
    if (!proxima) return;

    state.filtro = 'todos';
    document.querySelectorAll('#filterBar .filter-pill').forEach(b => {
        b.classList.toggle('filter-pill--active', b.dataset.filter === 'todos');
    });
    renderEntregas();

    const targetId = proxima.id;
    const card = document.getElementById(`card-${targetId}`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const prev = card.style.boxShadow;
        card.style.boxShadow = '0 0 0 3px rgba(197,160,89,.55)';
        setTimeout(() => { card.style.boxShadow = prev; }, 1200);
    }
    showToast(`Próxima parada: ${proxima.cliente_nome || 'cliente'}`, 'info');
}

async function confirmarEntrega() {
    const e = state.pedidoAtivo;
    const btn = document.getElementById('btnConfirmarEntrega');
    const paradaId = e?.parada_id || e?.id;
    const modo = state.modoAcao;

    if (!e || !paradaId) return;

    if (modo === 'chegada' && !state.fotosFiles.length) {
        showToast('Adicione ao menos uma foto da chegada.', 'error');
        return;
    }
    if (modo !== 'chegada' && !state.sigTemAssinatura && !state.fotosFiles.length) {
        showToast('Colete assinatura ou foto para finalizar.', 'error');
        return;
    }

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Confirmando...'; }

    const nome = document.getElementById('nomeRecebedor')?.value?.trim() || '';
    const documento = document.getElementById('documentoRecebedor')?.value?.trim() || '';
    const observacoes = document.getElementById('obsEntrega')?.value?.trim() || '';
    const statusFinal = document.getElementById('statusFinalEntrega')?.value || 'ENTREGA_REALIZADA';
    const assinatura = state.sigTemAssinatura ? state.sigCanvas.toDataURL('image/png') : null;
    const itensRessalva = Array.from(document.querySelectorAll('[data-ressalva-item]:checked')).map((el) => {
        const [codigo, descricao] = String(el.value || '').split('||');
        return { codigo: codigo || '', descricao: descricao || '' };
    });

    if (modo !== 'chegada' && statusFinal === 'RESSALVA' && !itensRessalva.length) {
        showToast('Selecione os produtos com observação para salvar a ressalva.', 'error');
        return;
    }
    if (modo !== 'chegada' && statusFinal === 'RESSALVA' && !state.fotosRessalvaFiles.length) {
        showToast('Adicione fotos dos produtos com ressalva.', 'error');
        return;
    }
    const resumoRessalva = itensRessalva.length
        ? `Itens com ressalva: ${itensRessalva.map((it) => `${it.codigo} - ${it.descricao}`).join('; ')}`
        : '';
    const observacoesComRessalva = [observacoes || e?.observacao || '', resumoRessalva].filter(Boolean).join(' | ');

    const payload = modo === 'chegada'
        ? {
            status: 'CHEGADA',
            foto_chegada: state.fotosFiles[0] || undefined,
            fotos_chegada: state.fotosFiles,
        }
        : {
            status: statusFinal,
            recebedor: nome,
            documento_recebedor: documento,
            observacoes_entrega: observacoesComRessalva,
            itens_ressalva: itensRessalva.length ? JSON.stringify(itensRessalva) : undefined,
            foto_produtos: state.fotosFiles[0] || undefined,
            fotos_entrega: state.fotosFiles,
            fotos_ressalva: state.fotosRessalvaFiles,
            foto_nota_assinada: assinatura ? dataUrlToFile(assinatura, 'nota-assinada.png') : undefined,
        };

    try {
        await postStatusMotorista(paradaId, payload);
        const novoStatus = modo === 'chegada' ? 'CHEGADA' : statusFinal;
        atualizarStatusEntregaLocal(paradaId, novoStatus);
        await carregarEntregas();
        if (modo !== 'chegada') {
            state.ultimoRecebedor = nome;
            state.ultimoDocumento = documento;
            state.ultimaObservacao = observacoes;
        }
        showToast(modo === 'chegada' ? 'Chegada registrada com sucesso!' : `Entrega de ${e.cliente_nome || 'cliente'} confirmada! ✅`, 'success');
        fecharComprovante();
        if (modo !== 'chegada') {
            await abrirCheckinSatisfacao(e);
            avancarParaProximaParada(paradaId);
        }
    } catch (err) {
        console.warn('[Motorista] Confirmação offline:', err);
        showToast(modo === 'chegada' ? 'Erro ao registrar chegada.' : 'Erro ao finalizar entrega.', 'error');
        fecharComprovante();
    } finally {
        renderEntregas();
        atualizarStats();
        if (btn) btn.disabled = false;
    }
}

function initCheckinSatisfacao() {
    document.querySelectorAll('#checkinOverlay [data-gostou]').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.checkinGostou = btn.dataset.gostou === '1';
            document.querySelectorAll('#checkinOverlay [data-gostou]').forEach((el) => {
                el.classList.toggle('is-active', el === btn);
            });
        });
    });
    document.getElementById('checkinEnviar')?.addEventListener('click', enviarCheckinSatisfacao);
    document.getElementById('checkinPular')?.addEventListener('click', fecharCheckinSatisfacao);
}

function abrirCheckinSatisfacao(entrega) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('checkinOverlay');
        if (!overlay) {
            resolve();
            return;
        }
        state.checkinEntrega = entrega;
        state.checkinGostou = null;
        state.checkinResolve = resolve;
        const clienteEl = document.getElementById('checkinCliente');
        const comentarioEl = document.getElementById('checkinComentario');
        if (clienteEl) clienteEl.textContent = entrega?.cliente_nome || 'Cliente';
        if (comentarioEl) comentarioEl.value = '';
        document.querySelectorAll('#checkinOverlay [data-gostou]').forEach((el) => el.classList.remove('is-active'));
        overlay.style.display = 'flex';
    });
}

function fecharCheckinSatisfacao() {
    const overlay = document.getElementById('checkinOverlay');
    if (overlay) overlay.style.display = 'none';
    const resolve = state.checkinResolve;
    state.checkinResolve = null;
    state.checkinEntrega = null;
    state.checkinGostou = null;
    if (typeof resolve === 'function') resolve();
}

async function enviarCheckinSatisfacao() {
    const entrega = state.checkinEntrega;
    if (state.checkinGostou === null || state.checkinGostou === undefined) {
        showToast('Informe se o cliente gostou da entrega.', 'error');
        return;
    }
    const comentario = document.getElementById('checkinComentario')?.value?.trim() || '';
    const pedidoId = entrega?.pedido_id;
    if (pedidoId && !entrega?._demo) {
        try {
            await api.request('/satisfacao/', 'POST', {
                pedido: pedidoId,
                cliente: entrega.cliente_nome || '',
                nota: state.checkinGostou ? 10 : 4,
                comentario,
                cliente_gostou: state.checkinGostou,
            });
        } catch (err) {
            showToast(err?.message || 'Não foi possível gravar a satisfação.', 'error');
            return;
        }
    }
    showToast(state.checkinGostou ? 'Check-in: cliente gostou.' : 'Check-in: cliente não gostou.', 'success');
    fecharCheckinSatisfacao();
}

async function postStatusMotorista(paradaId, payload) {
    const form = new FormData();
    Object.entries(payload || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        if (Array.isArray(value)) {
            value.forEach((item) => {
                if (item !== undefined && item !== null && item !== '') {
                    form.append(key, item);
                }
            });
            return;
        }
        form.append(key, value);
    });
    return api.request(`/roteirizacao/paradas/${paradaId}/atualizar-status-motorista/`, 'POST', form);
}

function dataUrlToFile(dataUrl, fileName) {
    const [meta, content] = String(dataUrl || '').split(',');
    const mimeMatch = /data:(.*?);base64/.exec(meta || '');
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const binary = atob(content || '');
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], fileName, { type: mime });
}

// ─────────────────────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────────────────────
function mostrarSkeleton() {
    const container = document.getElementById('entregasList');
    if (!container) return;
    container.innerHTML = `
        <div class="skeleton" style="height:170px"></div>
        <div class="skeleton" style="height:150px"></div>
        <div class="skeleton" style="height:180px"></div>`;
}

// ─────────────────────────────────────────────────────────────
// DADOS MOCK
// ─────────────────────────────────────────────────────────────
function getMockEntregas() {
    const hoje = new Date().toISOString();
    return [
        {
            _demo: true,
            id: 9001,
            parada_id: 9001,
            pedido_numero: 'MF-1001',
            cliente_nome: 'Daniele Franco Arquitetura Ltda',
            endereco_entrega_rua: 'SQSW 306 Bloco B Ap. 204',
            cidade_uf: 'Brasília / DF',
            periodo: 'MANHÃ',
            total_volumes: 4,
            itens_descricao: 'Sofá Orgânico + Mesa Jantar',
            status: 'PENDENTE',
            data_entrega: hoje,
        },
        {
            _demo: true,
            id: 9002,
            parada_id: 9002,
            pedido_numero: 'MF-1002',
            cliente_nome: 'Alexandre Moreira Silva',
            endereco_entrega_rua: 'SHIS QI 15 Conjunto 2 Casa 8',
            cidade_uf: 'Lago Sul / DF',
            periodo: 'TARDE',
            total_volumes: 2,
            itens_descricao: 'Mesa de Mármore + 6 Cadeiras',
            status: 'SAIDA',
            data_entrega: hoje,
        },
        {
            _demo: true,
            id: 9003,
            parada_id: 9003,
            pedido_numero: 'MF-1003',
            cliente_nome: 'Hotel Grand Breton Suítes',
            endereco_entrega_rua: 'SHN Quadra 1 Bloco A',
            cidade_uf: 'Brasília / DF',
            periodo: 'MANHÃ',
            total_volumes: 8,
            itens_descricao: 'Mobiliário de quarto (8 unid.)',
            status: 'ENTREGUE',
            data_entrega: hoje,
        },
    ];
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function getStatusKey(e) {
    const raw = String(e?.status || '').trim();
    const s = raw.toLowerCase();

    if (['entregue', 'concluído', 'concluido', 'delivered', 'entrega_realizada', 'entrega realizada', 'entrega-realizada', 'ressalva'].includes(s)) return 'entregue';
    if (['saída', 'saida', 'chegada', 'inicio', 'iniciada', 'em rota', 'em_rota', 'em-rota', 'in_transit', 'in transit', 'andamento'].includes(s)) return 'em-rota';
    if (['ocorrência', 'ocorrencia', 'occurrence', 'ocorrencia registrada'].includes(s)) return 'ocorrencia';
    if (['pendente', 'pendente', 'aguardando', 'na fila', 'novo', ''].includes(s)) return 'pendente';

    if (['entrega_realizada', 'entregue', 'concluido', 'concluído', 'ressalva'].includes(s.replace(/\s+/g, '_'))) return 'entregue';
    if (['saida', 'chegada', 'inicio', 'em_rota', 'em_rota', 'em-rota'].includes(s.replace(/\s+/g, '_'))) return 'em-rota';

    return 'pendente';
}

function getStatusInfo(key) {
    const map = {
        pendente:   { label: 'Pendente',    emoji: '⏳' },
        'em-rota':  { label: 'Em Rota',     emoji: '🚀' },
        entregue:   { label: 'Entregue',    emoji: '✅' },
        ocorrencia: { label: 'Ocorrência',  emoji: '⚠️' },
    };
    return map[key] || { label: key, emoji: '📦' };
}

function isEntregue(e)  { return getStatusKey(e) === 'entregue'; }
function isPendente(e)  { return getStatusKey(e) === 'pendente'; }

function buildEndereco(e) {
    const partes = [
        e.endereco_entrega_rua || e.endereco,
        e.endereco_entrega_bairro,
        e.cidade_uf || [e.endereco_entrega_cidade, e.endereco_entrega_uf].filter(Boolean).join(' / '),
        e.endereco_entrega_cep ? `CEP ${e.endereco_entrega_cep}` : '',
    ].filter(Boolean);
    return partes.length ? partes.join(', ') : '—';
}

function safeList(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.items)) return res.items;
    if (Array.isArray(res.entregas)) return res.entregas;
    return [];
}

function initials(nome = '') {
    return nome.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
}

function truncar(str, n) {
    return String(str || '').length > n ? str.slice(0, n) + '…' : str;
}

function setEl(id, val) {
    const el = document.getElementById(id); if (el) el.textContent = val;
}

function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Toast inline (sem importar modal.js para manter o módulo auto-suficiente em mobile)
function showToast(msg, type = 'success') {
    let c = document.getElementById('tms-toast-container');
    if (!c) { c = document.createElement('div'); c.id = 'tms-toast-container'; document.body.appendChild(c); }
    const t = document.createElement('div');
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    t.className = `tms-toast ${type}`;
    t.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
    c.appendChild(t);
    setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 350); }, 3500);
}