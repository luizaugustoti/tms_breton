import { api, authService, getApiBaseUrl } from '../api/api.js?v=18';
import { checkAuth } from '../utils/auth-guard.js';
import { openModal, showToast } from '../utils/modal.js';

const API_BASE_URL = getApiBaseUrl();
let pedidosCache = [];
const evidenciasPreview = new Map();
let proximoIdEvidencia = 0;

document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;

    // Logout
    document.querySelector('.sidebar__logout')?.addEventListener('click', (e) => {
        e.preventDefault();
        authService.logout();
    });

    loadPedidosData();
    initAcoesPedidos();
    initMinutaForm();
    initViewsOperacional();
    document.addEventListener('click', (event) => {
        const botao = event.target.closest('[data-evidence-preview]');
        if (!botao) return;
        event.preventDefault();
        abrirEvidencia(evidenciasPreview.get(botao.dataset.evidencePreview));
    });
});

// --- CONTROLE DE INTERFACE E VISÕES ---
function atualizarCabecalho(titulo, subtitulo) {
    const title = document.getElementById('pageTitle');
    const subtitle = document.getElementById('pageSubtitle');
    if (title) title.textContent = titulo;
    if (subtitle) subtitle.textContent = subtitulo;
}

function mostrarView(viewName) {
    const alias = {
        lista: 'lista',
        'emitir-manual': 'manual',
        manual: 'manual',
        'emitir-pdf': 'pdf',
        pdf: 'pdf',
    };
    const view = alias[viewName] || 'lista';

    document.querySelectorAll('.page-view').forEach((el) => {
        el.classList.toggle('page-view--active', el.id === `view-${view}`);
    });
    document.body.classList.toggle('view-minuta', view === 'manual');

    if (view === 'lista') {
        atualizarCabecalho('Pedidos & Cargas (Manifesto de Chegada)', 'Gerenciamento de Notas Fiscais e conferência de volumes da carga');
    } else if (view === 'manual') {
        atualizarCabecalho('Comprovante de Entrega', 'Preencha os dados de entrega, volumes e conferência no local');
    } else if (view === 'pdf') {
        atualizarCabecalho('Emitir com PDF', 'Importe a nota fiscal ou comprovante em PDF na própria tela');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function initViewsOperacional() {
    window.addEventListener('tms:show-view', (event) => {
        const view = event.detail?.view || 'lista';
        if (view === 'manual' || view === 'emitir-manual') {
            abrirEmissaoManual();
            return;
        }
        mostrarView(view);
    });

    const hash = (window.location.hash || '').replace('#', '');
    if (hash === 'manual' || hash === 'emitir-manual') {
        abrirEmissaoManual();
        return;
    }
    mostrarView(hash || 'lista');
}

// --- DRAG & DROP E IMPORTAÇÃO PDF ---
function initAcoesPedidos() {
    const btnEscanear = document.getElementById('btnEscanearNota');
    if (btnEscanear) {
        const clone = btnEscanear.cloneNode(true);
        btnEscanear.parentNode.replaceChild(clone, btnEscanear);
        clone.addEventListener('click', () => abrirSeletorNativo());
    }

    const dropzone = document.getElementById('pdfDropzone');
    if (dropzone) {
        dropzone.addEventListener('click', () => abrirSeletorNativo());
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('is-dragover');
        });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('is-dragover');
            const file = e.dataTransfer?.files?.[0];
            if (!file) return;

            const valido = validarArquivoNota(file);
            if (!valido.ok) {
                showToast(valido.mensagem, 'error');
                return;
            }
            processarArquivoNota(file);
        });
    }

    document.getElementById('searchPedidos')?.addEventListener('input', (e) => {
        const termo = e.target.value.toLowerCase();
        const filtrados = pedidosCache.filter(p =>
            (p.pedido_numero || '').toLowerCase().includes(termo) ||
            (p.cliente_nome || '').toLowerCase().includes(termo) ||
            (p.cidade_uf || '').toLowerCase().includes(termo)
        );
        renderPedidosTable(filtrados);
    });
}

function abrirSeletorNativo() {
    const input = document.getElementById('nf-hidden-input') || document.createElement('input');
    input.type = 'file';
    input.id = 'nf-hidden-input';
    input.accept = 'application/pdf, image/jpeg, image/png';
    input.style.display = 'none';

    if (!input.isConnected) document.body.appendChild(input);

    input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const valido = validarArquivoNota(file);
        if (!valido.ok) {
            showToast(valido.mensagem, 'error');
            e.target.value = '';
            return;
        }

        processarArquivoNota(file);
        e.target.value = '';
    };

    input.click();
}

function validarArquivoNota(file) {
    const tiposAceitos = new Set(['application/pdf', 'image/jpeg', 'image/png']);
    if (!file) return { ok: false, mensagem: 'Nenhum arquivo selecionado.' };
    if (!tiposAceitos.has(file.type)) {
        return { ok: false, mensagem: 'Formato inválido. Envie apenas arquivo PDF ou Imagem (JPG/PNG).' };
    }
    if (file.size > 25 * 1024 * 1024) {
        return { ok: false, mensagem: 'O arquivo excede o limite permitido de 25 MB.' };
    }
    return { ok: true };
}

async function processarArquivoNota(arquivo) {
    const spinner = criarSpinnerProcessamento(arquivo.name);
    document.body.appendChild(spinner);

    try {
        const formData = new FormData();
        formData.append('arquivo', arquivo);

        const token = localStorage.getItem('access_token');
        const response = await fetch(`${API_BASE_URL}/pedidos/importa-nota/`, {
            method: 'POST',
            headers: {
                'Authorization': token ? 'Bearer ' + token : '',
                'Accept': 'application/json',
            },
            body: formData,
        });

        spinner.remove();

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            showToast(`Erro ao processar PDF: ${errData?.detail || `Erro ${response.status}`}`, 'error');
            return;
        }

        const resultado = await response.json();
        exibirResultadoImportacao(resultado);
        await loadPedidosData();
    } catch (err) {
        spinner.remove();
        console.error('[Importar NF] Erro:', err);
        showToast('Erro de conexão ao enviar o arquivo.', 'error');
    }
}

function criarSpinnerProcessamento(nomeArquivo) {
    const div = document.createElement('div');
    div.id = 'nf-spinner-overlay';
    div.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.7);
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; z-index: 10000; color: #fff; font-family: sans-serif;
    `;
    div.innerHTML = `
        <div style="background: #fff; border-radius: 12px; padding: 32px; text-align: center; max-width: 380px; color: #1e293b;">
            <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 8px;">Processando PDF</h3>
            <p style="font-size: 0.85rem; color: #64748b;">Extraindo dados da entrega e tabela de volumes...</p>
            <small style="color: #94a3b8; font-size: 0.78rem; display: block; margin-top: 12px;">📎 ${escapeHtml(nomeArquivo)}</small>
        </div>
    `;
    return div;
}

// --- TRATAMENTO E PREENCHIMENTO DA MINUTA ---
function obterNumeroPedido(nota = {}) {
    const valor = [
        nota.numero_nota,
        nota.numero_pedido,
        nota.pedido_numero,
        nota.numeroPedido,
        nota.id_pedido,
        nota.pedido_id,
    ].find((item) => item !== null && item !== undefined && String(item).trim() !== '');

    return valor === undefined ? '' : String(valor).trim();
}

function normalizeNotaPayload(nota = {}) {
    const dest = nota.destinatario || {};
    const endComp = nota.endereco_completo || {};
    const numeroPedido = obterNumeroPedido(nota);

    const itens = (nota.produtos || nota.itens || []).map((it, idx) => ({
        etiqueta: it.etiqueta || it.codigo || `${numeroPedido || '0000'}-${String(idx + 1).padStart(3, '0')}`,
        volumes: it.volumes || '01/01',
        qtd: it.quantidade || it.qtd || 1,
        descricao: it.descricao || it.desc || 'VOLUME DE MÓVEL',
        dimensao: it.dimensao || it.dimensoes || '',
        entregue: it.entregue ?? true,
    }));

    return {
        _pedido_id: nota.id || nota._pedido_id || null,
        numero: numeroPedido,
        pedido_web: nota.pedido_web || '',
        ord_carregamento: nota.ord_carregamento || nota.ordem_carregamento || '',
        tipo_pedido: nota.tipo_pedido || nota.tipo_operacao || 'TROCA DE ASSISTENCIA',
        data_emissao: nota.data_emissao || hojeISO(),
        hora_emissao: nota.hora_emissao || '',
        loja: nota.loja || nota.loja_emitente || '',
        cliente_nome: dest.nome || nota.cliente_nome || nota.cliente || '',
        endereco: dest.logradouro || endComp.logradouro || nota.endereco || '',
        bairro: dest.bairro || endComp.bairro || nota.bairro || '',
        cidade: dest.cidade || endComp.cidade || nota.cidade || '',
        uf: dest.uf || endComp.uf || nota.uf || '',
        cep: dest.cep || endComp.cep || nota.cep || '',
        data_entrega: nota.data_entrega || '',
        periodo: nota.periodo || '',
        placa_veiculo: nota.placa_veiculo || nota.placa || '',
        observacao: nota.observacao || nota.obs || '',
        recebido_por: nota.recebido_por || '',
        historico_entrega: nota.historico || nota.historico_entrega || nota.historico_eventos || [],
        itens,
    };
}

function exibirResultadoImportacao(resultado) {
    const dadosNf = normalizeNotaPayload(resultado.dados_nf || {});
    preencherMinuta(dadosNf);
    mostrarView('manual');
}

function setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
}

function getVal(id) {
    return (document.getElementById(id)?.value || '').trim();
}

function hojeISO() {
    return new Date().toISOString().slice(0, 10);
}

function addNotaRow(item = {}) {
    const tbody = document.getElementById('mnNotasBody');
    if (!tbody) return;

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input data-nf="etiqueta" value="${escapeHtml(item.etiqueta || '')}"></td>
        <td><input data-nf="volumes" value="${escapeHtml(item.volumes || '01/01')}" style="width: 60px;"></td>
        <td><input data-nf="qtd" type="number" step="0.01" value="${item.qtd || 1}" style="width: 60px;"></td>
        <td><input data-nf="descricao" value="${escapeHtml(item.descricao || '')}"></td>
        <td><input data-nf="dimensao" value="${escapeHtml(item.dimensao || '')}" placeholder="0.000X0.000X0.000"></td>
        <td style="text-align: center;">
            <select data-nf="entregue">
                <option value="Sim" ${item.entregue !== false ? 'selected' : ''}>Sim</option>
                <option value="Não" ${item.entregue === false ? 'selected' : ''}>Não</option>
            </select>
        </td>
        <td><button type="button" class="minuta-btn minuta-btn--icon mn-del">✕</button></td>
    `;

    tr.querySelector('.mn-del').addEventListener('click', () => {
        tr.remove();
        somarTransportado();
    });

    tr.querySelectorAll('input').forEach((input) => {
        input.addEventListener('input', somarTransportado);
    });

    tbody.appendChild(tr);
    somarTransportado();
}

function renderHistoricoTabela(eventos) {
    const tbody = document.getElementById('mnHistoricoBody');
    if (!tbody) return;
    const lista = Array.isArray(eventos) ? [...eventos].sort((a, b) =>
        new Date(a.timestamp || a.ocorrido_em || a.data_hora || a.data || 0) - new Date(b.timestamp || b.ocorrido_em || b.data_hora || b.data || 0)
    ) : [];
    tbody.innerHTML = lista.length ? lista.map(evento => {
        const data = evento.timestamp || evento.ocorrido_em || evento.data_hora || evento.data;
        const evidencias = evento.evidencias || evento.anexos || evento.dados?.evidencias || [];
        const anexos = Array.isArray(evidencias) && evidencias.length
            ? evidencias.map(item => {
                const nome = item.nome || item.filename || 'Evidência';
                const url = normalizarUrlEvidencia(item);
                return url ? criarAcaoEvidencia(item, nome, url) : escapeHtml(nome);
            }).join(', ')
            : '—';
        return `<tr>
            <td>${escapeHtml(evento.titulo || evento.descricao || evento.tipo || evento.etapa || 'Evento')}</td>
            <td>${escapeHtml(data ? new Date(data).toLocaleString('pt-BR') : '—')}</td>
            <td>${anexos}</td>
            <td>${escapeHtml(evento.observacao || evento.observacoes_entrega || '—')}</td>
            <td>${escapeHtml(evento.status_novo || evento.status || '')}</td>
        </tr>`;
    }).join('') : '<tr><td colspan="5" class="pedido-history-empty">Nenhum evento registrado para este pedido.</td></tr>';
}

function somarTransportado() {
    const rows = Array.from(document.querySelectorAll('#mnNotasBody tr'));
    let qtdEtiquetas = rows.length;
    let totalVolumes = 0;

    rows.forEach((tr) => {
        const qtd = parseFloat(tr.querySelector('[data-nf="qtd"]')?.value) || 0;
        totalVolumes += qtd;
    });

    setVal('mn_total_etiquetas', qtdEtiquetas);
    setVal('mn_volumes', totalVolumes.toFixed(2));
}

function resetMinutaForm() {
    const form = document.getElementById('minutaForm');
    if (!form) return;
    form.reset();
    setVal('mn_pedido_id', '');
    setVal('mn_data_emissao', hojeISO());
    document.getElementById('mnNotasBody').innerHTML = '';
    somarTransportado();
}

function preencherMinuta(nota) {
    resetMinutaForm();
    setVal('mn_pedido_id', nota._pedido_id || '');
    setVal('mn_pedido_numero', nota.numero || '');
    setVal('mn_pedido_web', nota.pedido_web || '');
    setVal('mn_ord_carregamento', nota.ord_carregamento || '');
    setVal('mn_tipo_pedido', nota.tipo_pedido || '');
    setVal('mn_data_emissao', nota.data_emissao || hojeISO());
    setVal('mn_hora_emissao', nota.hora_emissao || '');
    setVal('mn_loja', nota.loja || '');
    setVal('mn_dest_nome', nota.cliente_nome || '');
    setVal('mn_dest_end', nota.endereco || '');
    setVal('mn_dest_bairro', nota.bairro || '');
    setVal('mn_dest_cidade', [nota.cidade, nota.uf].filter(Boolean).join(' | '));
    setVal('mn_dest_cep', nota.cep || '');
    setVal('mn_entrega_data', nota.data_entrega || '');
    setVal('mn_entrega_periodo', nota.periodo || '');
    setVal('mn_placa_veiculo', nota.placa_veiculo || '');
    setVal('mn_observacao', nota.observacao || '');
    setVal('mn_recebido_por', nota.recebido_por || '');

    document.getElementById('mnNotasBody').innerHTML = '';
    if (nota.itens && nota.itens.length > 0) {
        nota.itens.forEach((it) => addNotaRow(it));
    } else {
        addNotaRow();
    }
    somarTransportado();
    renderHistoricoTabela(nota.historico_entrega || []);
}

function abrirEmissaoManual() {
    resetMinutaForm();
    addNotaRow();
    mostrarView('manual');
}

function initMinutaForm() {
    const form = document.getElementById('minutaForm');
    if (!form || form.dataset.bound === '1') return;
    form.dataset.bound = '1';

    document.getElementById('btnMinutaVoltar')?.addEventListener('click', () => mostrarView('lista'));
    document.getElementById('btnMinutaVoltar2')?.addEventListener('click', () => mostrarView('lista'));
    document.getElementById('btnAddVolumeItem')?.addEventListener('click', () => addNotaRow());

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const pedidoNumero = getVal('mn_pedido_numero');
        const clienteNome = getVal('mn_dest_nome');
        if (!pedidoNumero || !clienteNome) {
            showToast('Nº do Pedido e Nome do Cliente são obrigatórios.', 'error');
            return;
        }

        // Separa cidade e UF do campo combinado
        const cidadeUfRaw = getVal('mn_dest_cidade');
        let cidade = cidadeUfRaw;
        let uf = '';
        const matchUf = cidadeUfRaw.match(/^(.*?)\s*\|\s*([A-Z]{2})$/i);
        if (matchUf) {
            cidade = matchUf[1].trim();
            uf = matchUf[2].trim().toUpperCase();
        }

        const payload = {
            id: getVal('mn_pedido_id') || undefined,
            // CORRECAO: enviar numero_nota (nome do campo no backend)
            numero_nota: pedidoNumero,
            pedido_web: getVal('mn_pedido_web'),
            ordem_carregamento: getVal('mn_ord_carregamento'),
            tipo_pedido: getVal('mn_tipo_pedido'),
            data_emissao: getVal('mn_data_emissao'),
            hora_emissao: getVal('mn_hora_emissao'),
            loja: getVal('mn_loja'),
            // CORRECAO: enviar cliente (nome do campo no backend)
            cliente: clienteNome,
            endereco: getVal('mn_dest_end'),
            bairro: getVal('mn_dest_bairro'),
            // CORRECAO: enviar cidade e uf separados
            cidade: cidade,
            uf: uf,
            cep: getVal('mn_dest_cep'),
            data_entrega: getVal('mn_entrega_data'),
            periodo: getVal('mn_entrega_periodo'),
            placa_veiculo: getVal('mn_placa_veiculo'),
            observacao: getVal('mn_observacao'),
            permanencia_entrada: getVal('mn_hora_entrada'),
            permanencia_saida: getVal('mn_hora_saida'),
            recebido_por: getVal('mn_recebido_por'),
            checklist: {
                luvas: document.getElementById('mn_chk_luvas')?.checked || false,
                sapatilhas: document.getElementById('mn_chk_sapatilhas')?.checked || false,
                uniforme: document.getElementById('mn_chk_uniforme')?.checked || false,
                ferramentas: document.getElementById('mn_chk_ferramentas')?.checked || false,
            },
            itens: Array.from(document.querySelectorAll('#mnNotasBody tr')).map((tr) => ({
                etiqueta: tr.querySelector('[data-nf="etiqueta"]')?.value.trim() || '',
                codigo: tr.querySelector('[data-nf="etiqueta"]')?.value.trim() || '',
                volumes: tr.querySelector('[data-nf="volumes"]')?.value.trim() || '01/01',
                quantidade: parseFloat(tr.querySelector('[data-nf="qtd"]')?.value || '1') || 1,
                descricao: tr.querySelector('[data-nf="descricao"]')?.value.trim() || '',
                dimensao: tr.querySelector('[data-nf="dimensao"]')?.value.trim() || '',
                unidade: 'UN',
                entregue: tr.querySelector('[data-nf="entregue"]')?.value === 'Sim',
            })),
        };

        try {
            const pedidoId = getVal('mn_pedido_id');
            await api.request(pedidoId ? `/pedidos/${pedidoId}/` : '/pedidos/', pedidoId ? 'PATCH' : 'POST', payload);
            await loadPedidosData();
            showToast('Comprovante salvo com sucesso.', 'success');
            mostrarView('lista');
        } catch (err) {
            showToast(err?.message || 'Falha ao salvar o comprovante.', 'error');
        }
    });
}

// --- CARREGAMENTO DE DADOS E TABELA ---
async function loadPedidosData() {
    try {
        const response = await api.request('/pedidos/', 'GET');
        const rawData = response?.items ?? (Array.isArray(response) ? response : []);

        pedidosCache = rawData.map(p => ({
            id: p.id || p.pedido_numero,
            dados: p,
            pedido_numero: p.numero_nota || p.pedido_numero || p.numero || '—',
            cliente_nome: p.cliente || p.cliente_nome || '—',
            cidade_uf: [p.cidade, p.uf].filter(Boolean).join('/') || p.cidade_uf || '—',
            volumes: p.volumes || p.total_volumes || (p.itens ? p.itens.length : '—'),
            data_entrega: p.data_entrega || '—',
            status: p.status || 'Pendente'
        }));

        renderPedidosTable(pedidosCache);
    } catch (e) {
        console.warn('Erro ao carregar pedidos:', e);
        showToast('Não foi possível carregar a lista de pedidos.', 'error');
    }
}

function renderPedidosTable(data) {
    const tbody = document.getElementById('tablePedidosBody');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b; padding:24px;">Nenhum comprovante de entrega cadastrado.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(row => `
        <tr data-id="${row.id}">
            <td><strong>#${escapeHtml(row.pedido_numero)}</strong></td>
            <td>${escapeHtml(row.cliente_nome)}</td>
            <td>${escapeHtml(row.cidade_uf)}</td>
            <td>${escapeHtml(row.volumes)}</td>
            <td>${escapeHtml(row.data_entrega)}</td>
            <td><span class="badge badge--accent">${escapeHtml(row.status)}</span></td>
            <td>
                <div style="display: flex; gap: 6px;">
                    <button class="btn-visualizar btn-icon-action" data-id="${row.id}" title="Visualizar pedido" aria-label="Visualizar pedido" data-icon="eye"></button>
                    <button class="btn-editar btn-icon-action" data-id="${row.id}" title="Editar pedido" aria-label="Editar pedido" data-icon="pencil"></button>
                    <button class="btn-excluir btn-icon-action" data-id="${row.id}" title="Excluir pedido" aria-label="Excluir pedido" data-icon="trash"></button>
                </div>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.btn-visualizar').forEach(btn => {
        btn.addEventListener('click', () => abrirVisualizacaoPedido(btn.dataset.id));
    });

    tbody.querySelectorAll('.btn-editar').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const p = await api.request(`/pedidos/${id}/`, 'GET');
            preencherMinuta(normalizeNotaPayload(p));
            mostrarView('manual');
        });
    });

    tbody.querySelectorAll('.btn-excluir').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            if (confirm(`Deseja realmente remover o registro #${id}?`)) {
                await api.request(`/pedidos/${id}/`, 'DELETE');
                showToast('Comprovante excluído.', 'success');
                await loadPedidosData();
            }
        });
    });
}

async function abrirVisualizacaoPedido(id) {
    try {
        const pedido = await api.request(`/pedidos/${id}/`, 'GET');
        let historico = [
            ...(Array.isArray(pedido.historico) ? pedido.historico : []),
            ...(Array.isArray(pedido.historico_entrega) ? pedido.historico_entrega : []),
        ];
        try {
            const respostaHistorico = await api.request(`/pedidos/${id}/historico/`, 'GET');
            const eventosPersistidos = respostaHistorico?.items || respostaHistorico?.results || respostaHistorico;
            if (Array.isArray(eventosPersistidos)) historico = [...eventosPersistidos, ...(pedido.historico_entrega || [])];
        } catch (erroHistorico) {
            if (erroHistorico?.status !== 404) throw erroHistorico;
        }
        historico = dedupeHistorico(historico);

        openModal({
            title: `Visualizar pedido #${pedido.numero_nota || pedido.id}`,
            confirmLabel: 'Fechar',
            fields: [{
                id: 'visualizacao',
                type: 'html',
                fullWidth: true,
                content: renderVisualizacaoPedido(pedido, historico),
            }],
            onConfirm: async () => ({ mensagem: '' }),
        });
    } catch (erro) {
        showToast(erro?.message || 'Não foi possível carregar os detalhes do pedido.', 'error');
    }
}

function renderVisualizacaoPedido(pedido, historico) {
    const veiculo = pedido.veiculo_detalhes || pedido.veiculo_info || {};
    const motorista = pedido.motorista_nome || pedido.motorista?.nome || pedido.motorista || '—';
    const volumeCalculado = (pedido.itens || []).reduce((total, item) => total + (Number(item.quantidade) || 0), 0);
    const volumes = Number(pedido.volume_total) > 0 ? pedido.volume_total : volumeCalculado || 'Não informado';
    const eventos = Array.isArray(historico) ? [...historico].sort((a, b) =>
        new Date(b.timestamp || b.ocorrido_em || b.data_hora || b.data || 0) - new Date(a.timestamp || a.ocorrido_em || a.data_hora || a.data || 0)
    ) : [];

    return `
        <div class="pedido-view">
            <div class="pedido-view__eyebrow">Consulta operacional</div>
            <div class="pedido-view__title-row">
                <div>
                    <h3>Pedido #${escapeHtml(pedido.numero_nota || pedido.id)}</h3>
                    <p>${escapeHtml(pedido.loja || 'Manifesto de chegada')}</p>
                </div>
                <span class="pedido-view__status pedido-view__status--${statusClass(pedido.status)}">${escapeHtml(pedido.status || 'Não informado')}</span>
            </div>
            <div class="pedido-view__summary">
                <div><strong>Cliente</strong><span>${escapeHtml(pedido.cliente || '—')}</span></div>
                <div><strong>Cidade / UF</strong><span>${escapeHtml([pedido.cidade, pedido.uf].filter(Boolean).join('/') || '—')}</span></div>
                <div><strong>Volumes</strong><span>${escapeHtml(volumes)}</span></div>
                <div><strong>Data agendada</strong><span>${escapeHtml(pedido.data_entrega || '—')}</span></div>
                <div><strong>Veículo</strong><span title="${escapeHtml(veiculo.modelo || '')}">${escapeHtml(veiculo.placa || pedido.placa_veiculo || 'Não alocado')}</span></div>
                <div><strong>Motorista</strong><span>${escapeHtml(motorista)}</span></div>
                <div><strong>Equipe</strong><span>${escapeHtml(veiculo.equipe || '—')}</span></div>
            </div>
            <h3 class="pedido-view__heading">Histórico da Emissão &amp; Eventos</h3>
            ${eventos.length ? `<div class="pedido-history">${eventos.map(renderEventoHistorico).join('')}</div>` : '<p class="pedido-view__empty">Nenhum evento registrado para este pedido.</p>'}
        </div>`;
}

function renderEventoHistorico(evento) {
    const evidencias = evento.evidencias || evento.anexos || evento.dados?.evidencias || [];
    const data = evento.timestamp || evento.ocorrido_em || evento.data_hora || evento.data;
    const dataFormatada = data ? new Date(data).toLocaleString('pt-BR') : 'Data não informada';
    const titulo = evento.titulo || evento.descricao || evento.tipo || evento.etapa || 'Evento';
    const status = evento.status_novo || evento.status || '';
    const responsavel = evento.responsavel_nome || evento.usuario_nome || evento.responsavel || '';
    const observacao = evento.observacao || evento.observacoes_entrega || '';
    return `
        <article class="pedido-history__event pedido-history__event--${statusClass(status || evento.tipo)}">
            <div class="pedido-history__date">${escapeHtml(dataFormatada)}</div>
            <div class="pedido-history__content">
                <strong>${escapeHtml(titulo)}</strong>
                ${status ? `<span>Status: ${escapeHtml(status)}</span>` : ''}
                ${evento.status_anterior ? `<span>Status anterior: ${escapeHtml(evento.status_anterior)}</span>` : ''}
                ${responsavel ? `<span>Responsável: ${escapeHtml(responsavel)}</span>` : ''}
                ${evento.veiculo_placa ? `<span>Veículo: ${escapeHtml(evento.veiculo_placa)}</span>` : ''}
                ${observacao ? `<span>Observação: ${escapeHtml(observacao)}</span>` : ''}
                <div class="pedido-history__attachments">${renderAnexos(evidencias)}</div>
            </div>
        </article>`;
}

function dedupeHistorico(eventos) {
    const vistos = new Set();
    return eventos.filter(evento => {
        const data = evento.timestamp || evento.ocorrido_em || evento.data_hora || evento.data || '';
        const chave = evento.id
            ? `id:${evento.id}`
            : [data, evento.tipo || evento.etapa || '', evento.descricao || evento.titulo || '', evento.status_novo || evento.status || ''].join('|');
        if (vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
    });
}

function statusClass(status) {
    const normalizado = String(status || '').toLowerCase();
    if (['entregue', 'concluído', 'concluido'].includes(normalizado)) return 'done';
    if (['ocorrência', 'ocorrencia', 'ressalva'].includes(normalizado)) return 'problem';
    return 'progress';
}

function renderAnexos(evidencias) {
    if (!Array.isArray(evidencias) || !evidencias.length) {
        return '<span class="pedido-history__no-attachment">Sem evidência anexada</span>';
    }
    const unicos = [];
    const vistos = new Set();
    evidencias.forEach(evidencia => {
        const url = normalizarUrlEvidencia(evidencia);
        const chave = evidencia.hash || evidencia.sha256 || url;
        if (chave && vistos.has(chave)) return;
        if (chave) vistos.add(chave);
        unicos.push(evidencia);
    });
    return `<span class="pedido-history__attachment-label">Evidências</span><div class="pedido-history__thumbs">${unicos.map(evidencia => {
        const nome = evidencia.nome || evidencia.filename || 'Evidência';
        const url = normalizarUrlEvidencia(evidencia);
        const imagem = String(evidencia.mime || '').startsWith('image/') && url
            ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(nome)}">`
            : '<span class="pedido-history__file-icon">DOC</span>';
        return url
            ? `<button type="button" class="pedido-history__thumb" data-evidence-preview="${registrarEvidencia(evidencia, nome, url)}" title="Visualizar ${escapeHtml(nome)}">${imagem}<span>${escapeHtml(nome)}</span></button>`
            : `<span class="pedido-history__thumb is-unavailable" title="${escapeHtml(nome)}">${imagem}<span>${escapeHtml(nome)}</span></span>`;
    }).join('')}</div>`;
}

function normalizarUrlEvidencia(evidencia = {}) {
    const valor = evidencia.data_base64 || evidencia.url || evidencia.arquivo_url || '';
    if (!valor) return '';
    if (evidencia.data_base64 && !/^data:/i.test(valor)) {
        return `data:${evidencia.mime || 'application/octet-stream'};base64,${valor}`;
    }
    return valor;
}

function registrarEvidencia(evidencia, nome, url) {
    const id = String(++proximoIdEvidencia);
    evidenciasPreview.set(id, {
        nome,
        mime: evidencia.mime || 'application/octet-stream',
        url,
    });
    return id;
}

function criarAcaoEvidencia(evidencia, nome, url) {
    const id = registrarEvidencia(evidencia, nome, url);
    return `<button type="button" class="pedido-history__file-link" data-evidence-preview="${id}" title="Visualizar ${escapeHtml(nome)}">${escapeHtml(nome)}</button>`;
}

function abrirEvidencia(evidencia) {
    if (!evidencia?.url) {
        showToast('Este anexo não possui conteúdo disponível para visualização.', 'error');
        return;
    }
    const mime = String(evidencia.mime || '').toLowerCase();
    const conteudo = mime.startsWith('image/')
        ? `<img class="pedido-evidence-preview__image" src="${escapeHtml(evidencia.url)}" alt="${escapeHtml(evidencia.nome)}">`
        : `<iframe class="pedido-evidence-preview__document" src="${escapeHtml(evidencia.url)}" title="${escapeHtml(evidencia.nome)}"></iframe>`;
    openModal({
        title: evidencia.nome || 'Anexo',
        confirmLabel: 'Fechar',
        fields: [{
            id: 'evidencia-preview',
            type: 'html',
            fullWidth: true,
            content: `<div class="pedido-evidence-preview">${conteudo}</div>`,
        }],
        onConfirm: async () => ({ mensagem: '' }),
    });
}

const escapeHtml = (val) => String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');