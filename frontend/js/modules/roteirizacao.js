// frontend/js/modules/roteirizacao.js
// ─────────────────────────────────────────────────────────────
// Módulo de Roteirização — Quadro Kanban TMS Breton V2
// Colunas: Backlog | [Veículos Dinâmicos com Motorista e Equipe Editáveis] | Concluído
// ─────────────────────────────────────────────────────────────

import { api, authService } from '../api/api.js?v=17';
import { checkAuth } from '../utils/auth-guard.js';
import { showToast } from '../utils/modal.js';

const state = {
    pedidos:  [],
    veiculos: [],
    equipes: [],
    funcionarios: [],
    rotas: [],
    sortables: [],
    view: 'propria',
    manifestosFiltrados: [],
    pedidosLivres: [],
    formEntregas: [],
    formColetas: [],
    manifestoEditandoId: null,
};

const VIEW_PROPRIA = 'propria';
const VIEW_PAINEL_ENTREGA = 'painel-entrega';

const posicaoAnterior = new Map();

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function rotaPorId(id) {
    return (state.rotas || []).find((rota) => String(rota.id) === String(id));
}

function normalizarViewManifesto(viewName) {
    const view = String(viewName || '').replace('#', '');
    if (view === 'terceiros' || view === VIEW_PAINEL_ENTREGA) {
        return VIEW_PAINEL_ENTREGA;
    }
    return VIEW_PROPRIA;
}

function iconeManifesto(tipo) {
    if (tipo === 'ver') {
        return `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5c-5.5 0-9.8 4.1-11.5 7 1.7 2.9 6 7 11.5 7s9.8-4.1 11.5-7C21.8 9.1 17.5 5 12 5Zm0 11.5A4.5 4.5 0 1 1 12 7a4.5 4.5 0 0 1 0 9.5Zm0-2.5A2 2 0 1 0 12 10a2 2 0 0 0 0 4Z" />
            </svg>`;
    }
    if (tipo === 'editar') {
        return `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Zm2.92 2.33H5v-.92l8.88-8.88.92.92-8.88 8.88ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" />
            </svg>`;
    }
    return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 3h6l1 2h5v2h-1.1l-1.1 12.2A2 2 0 0 1 16.82 21H7.18a2 2 0 0 1-1.98-1.8L4.1 7H3V5h5l1-2Zm1.3 4h2.4l-.2 10h-2l-.2-10Zm4.4 0h-2.4l.2 10h2l.2-10ZM7.2 7l1 11h7.6l1-11H7.2Z" />
        </svg>`;
}

function manifestoActionButton(tipo, id, label) {
    const classes = ['mf-icon-btn', `mf-icon-btn--${tipo}`].join(' ');
    return `
        <button type="button" class="${classes}" data-manifesto-acao="${tipo}" data-id="${id}" title="${label}" aria-label="${label}">
            ${iconeManifesto(tipo)}
            <span class="mf-sr-only">${label}</span>
        </button>`;
}

document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;

    document.getElementById('btnLogout')?.addEventListener('click', e => {
        e.preventDefault();
        authService.logout();
    });

    document.getElementById('btnRefresh')?.addEventListener('click', () => carregarDados());
    document.getElementById('btnPublicarRotas')?.addEventListener('click', publicarRotas);
    initManifestoList();

    window.addEventListener('tms:show-view', (event) => {
        aplicarView(event.detail?.view);
    });
    window.addEventListener('hashchange', () => {
        aplicarView((window.location.hash || '').replace('#', ''));
    });
    aplicarView((window.location.hash || '').replace('#', '') || VIEW_PAINEL_ENTREGA, { skipReload: true });
    carregarDados();
});

function tipoFrotaVeiculo(veiculo) {
    return String(veiculo?.tipo_frota || 'PROPRIA').toUpperCase() === 'TERCEIRO' ? 'TERCEIRO' : 'PROPRIA';
}

function aplicarView(viewName, options = {}) {
    const view = normalizarViewManifesto(viewName);
    state.view = view;
    document.getElementById('view-propria')?.classList.toggle('mf-hidden', view !== VIEW_PROPRIA);
    document.getElementById('view-terceiros')?.classList.toggle('mf-hidden', view !== VIEW_PAINEL_ENTREGA);
    const main = document.getElementById('manifestarMain');
    if (main) {
        main.style.overflow = view === VIEW_PROPRIA ? 'auto' : 'hidden';
    }
    if (window.location.hash.replace('#', '') !== view) {
        history.replaceState(null, '', `#${view}`);
    }
    if (options.skipReload) return;
    if (view === VIEW_PROPRIA) {
        renderManifestos();
    } else if (state.veiculos.length) {
        construirBoard();
        atualizarStats();
    }
}

function veiculosDaView() {
    return state.veiculos.filter((veiculo) => {
        const tipo = tipoFrotaVeiculo(veiculo);
        const disponivel = !veiculo.status_operacional || /dispon/i.test(veiculo.status_operacional);
        if (state.view === VIEW_PAINEL_ENTREGA) return tipo === 'TERCEIRO' && disponivel;
        return tipo === 'PROPRIA';
    });
}

// --- Função Auxiliar de Skeleton ---
function mostrarSkeleton(ativo) {
    const board = document.getElementById('kanbanBoard');
    if (!board) return;
    if (ativo && board.children.length === 0) {
        board.innerHTML = '<div style="padding: 20px; text-align: center; color: #64748b; font-size: 0.85rem;">Carregando dados do quadro...</div>';
    }
}

async function carregarDados() {
    mostrarSkeleton(true);
    try {
        // 1. Busca todos os dados necessários em paralelo
        const [veiculosRes, rotasRes, equipesRes, funcionariosRes] = await Promise.all([
            api.request('/cadastros/veiculos/', 'GET'),
            api.request('/roteirizacao/rotas/', 'GET'),
            api.request('/cadastros/equipes/', 'GET'),
            api.request('/cadastros/funcionarios/', 'GET').catch(() => []),
        ]);

        // 2. Atualiza o State com os dados recebidos
        state.veiculos = Array.isArray(veiculosRes) ? veiculosRes : (veiculosRes.results || []);
        state.equipes = Array.isArray(equipesRes) ? equipesRes : (equipesRes.results || []);
        state.funcionarios = Array.isArray(funcionariosRes) ? funcionariosRes : (funcionariosRes.results || []);
        state.rotas = Array.isArray(rotasRes) ? rotasRes : (rotasRes.results || []);

        // 3. Processa os pedidos com normalização rigorosa do ID/Placa do veículo
        state.pedidos = [];
        if (Array.isArray(rotasRes)) {
            rotasRes.forEach(rota => {
                let veiculoRef = rota.veiculo || rota.veiculo_id || rota.vehicle_id || rota.vehicle;
                if (typeof veiculoRef === 'object' && veiculoRef !== null) {
                    veiculoRef = veiculoRef.id || veiculoRef.placa;
                }

                const paradas = Array.isArray(rota.paradas) ? rota.paradas : [];
                
                paradas.forEach(p => {
                    if (p && p.pedido) {
                        state.pedidos.push({
                            ...p.pedido, 
                            status: p.status || p.pedido.status, 
                            rota_id: rota.id,
                            veiculo_id: veiculoRef,
                            vehicle_id: veiculoRef,
                            parada_id: p.id
                        });
                    }
                });
            });
        }

        preencherFiltrosManifesto();
        if (state.view === 'propria') {
            renderManifestos();
        } else {
            construirBoard();
            atualizarStats();
        }
    } catch (err) {
        console.error('[Kanban] Erro ao carregar dados do backend:', err);
        showToast('Erro ao carregar dados do backend.', 'error');
    } finally {
        mostrarSkeleton(false);
    }
}

function construirBoard() {
    state.sortables.forEach(s => s.destroy());
    state.sortables = [];

    const board = document.getElementById('kanbanBoard');
    board.innerHTML = '';

    const backlog = [];
    const porVeiculo = {};
    const veiculosView = veiculosDaView();
    
    veiculosView.forEach(v => { porVeiculo[v.id] = []; });
    
    state.pedidos.forEach(p => {
        const statusStr = String(p.status || '').toUpperCase();
        const ehConcluidoPedido = (
            statusStr === 'CONCLUIDO' ||
            statusStr === 'CONCLUÍDO' ||
            statusStr === 'ENTREGUE' ||
            statusStr === 'FINALIZADO' ||
            statusStr === 'ENTREGA_REALIZADA' ||
            statusStr === 'RESSALVA'
        );
        
        if (ehConcluidoPedido) {
            return; 
        }

        const vid = String(p.veiculo_id || p.vehicle_id || '');

        const veiculoEncontrado = state.veiculos.find(v => 
            String(v.id) === vid || String(v.placa) === vid
        );

        if (veiculoEncontrado && porVeiculo[veiculoEncontrado.id]) {
            porVeiculo[veiculoEncontrado.id].push(p);
        } else if (!veiculoEncontrado) {
            backlog.push(p);
        }
    });

    // Coluna Backlog
    board.appendChild(criarColuna({
        id: 'col-backlog',
        tipo: 'backlog',
        titulo: '📋 Backlog — Pedidos Pendentes',
        subtitulo: 'Pedidos aguardando alocação em veículo',
        cards: backlog,
        grupo: 'kanban',
    }));

    if (!veiculosView.length) {
        const empty = document.createElement('div');
        empty.className = 'kanban-col';
        empty.style.minWidth = '320px';
        empty.innerHTML = `
            <div class="col-header">
                <div class="col-title">${state.view === VIEW_PAINEL_ENTREGA ? 'Painel de entrega' : 'Frota Própria'}</div>
            </div>
            <div style="padding:18px;color:#7A6055;font-size:0.85rem;line-height:1.5;">
                Nenhum veículo cadastrado nesta frota.<br>
                Cadastre em <strong>Cadastros → Veículos</strong> e marque o tipo de frota.
            </div>`;
        board.appendChild(empty);
    }

    // Colunas de Veículos
    veiculosView.forEach(v => {
        const equipeId = v.equipe_id || v.equipe;
        
        const eqCadastrada = state.equipes?.find(eq => 
            String(eq.id) === String(equipeId) || String(eq.nome) === String(equipeId)
        );

        let nomeCompleto = eqCadastrada?.motorista_nome || v.motorista_nome || v.motorista?.nome || 'Não atribuído';

        let motoristaExibicao = nomeCompleto;
        if (nomeCompleto !== 'Não atribuído') {
            const partes = nomeCompleto.trim().split(' ');
            motoristaExibicao = partes.length > 1 ? `${partes[0]} ${partes[1]}` : partes[0];
        }

        let equipeExibicao = 'Não informada';
        let equipeMembros = '';
        if (eqCadastrada) {
            equipeExibicao = eqCadastrada.nome;
            if (eqCadastrada.membros_info) {
                equipeMembros = eqCadastrada.membros_info.replace(/\n/g, ', ');
            }
        } else if (v.equipe_nome) {
            equipeExibicao = v.equipe_nome;
        }

        board.appendChild(criarColuna({
            id: `col-veiculo-${v.id}`,
            tipo: 'vehicle',
            titulo: `🚚 ${v.placa}`,
            subtitulo: `${v.tipo_equipamento || 'Veículo'} · ${v.capacidade_peso_kg ? v.capacidade_peso_kg + ' kg' : ''}`,
            cards: porVeiculo[v.id] || [],
            grupo: 'kanban',
            veiculoId: v.id,
            placa: v.placa,
            motorista: motoristaExibicao,
            equipe: equipeExibicao,
            equipeMembros
        }));
    });
}

function criarColuna({ id, tipo, titulo, subtitulo, cards, grupo, veiculoId = null, placa = null, motorista = '', equipe = '', equipeMembros = '' }) {
    const col = document.createElement('div');
    col.className = `kanban-col kanban-col--${tipo}`;
    col.dataset.colId = id;
    col.dataset.tipo = tipo;
    col.dataset.veiculoId = veiculoId || '';
    col.dataset.placa = placa || '';

    const dataHoje = new Date().toLocaleDateString('pt-BR');

    let headerExtraHtml = '';
    if (tipo === 'vehicle') {
        const equipeTexto = equipe ? equipe : 'Não informada';
        const motoristaTexto = motorista ? motorista : 'Não atribuído';
        const membrosTexto = equipeMembros ? truncarTexto(equipeMembros, 54) : '';

        headerExtraHtml = `
            <div style="margin-top: 10px; background: #ffffff; color: #1e293b; padding: 10px 11px; border-radius: 9px; font-size: 0.75rem; display: flex; flex-direction: column; gap: 6px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);">
                <div style="display: grid; grid-template-columns: 78px minmax(0, 1fr); align-items: center; gap: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">
                    <span style="font-weight: 700; color: #64748b; white-space: nowrap;">📅 Data</span>
                    <span style="font-weight: 700; color: #0f172a; text-align: right; white-space: nowrap;">${dataHoje}</span>
                </div>
                <div style="display: grid; grid-template-columns: 78px minmax(0, 1fr); align-items: center; gap: 8px;">
                    <span style="font-weight: 700; color: #64748b; white-space: nowrap;">👤 Motor.</span>
                    <span style="font-weight: 600; color: #1e293b; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${motoristaTexto}">${motoristaTexto}</span>
                </div>
                <div style="display: grid; grid-template-columns: 78px minmax(0, 1fr); align-items: center; gap: 8px;">
                    <span style="font-weight: 700; color: #64748b; white-space: nowrap;">👥 Equipe</span>
                    <span style="font-weight: 600; color: #1e293b; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${equipeTexto}">${equipeTexto}</span>
                </div>
                ${membrosTexto ? `<div style="font-size: 0.68rem; color: #64748b; border-top: 1px dashed #e2e8f0; padding-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${equipeMembros}"><strong style="color:#475569;">Membros:</strong> ${membrosTexto}</div>` : ''}
            </div>
        `;
    }

    col.innerHTML = `
        <div class="col-header">
            <div class="col-header-top">
                <span class="col-title">${titulo}</span>
                <span class="col-badge" id="badge-${id}">${cards.length}</span>
            </div>
            <div class="col-subtitle">${subtitulo}</div>
            ${headerExtraHtml}
        </div>
        <div class="kanban-list" id="list-${id}"></div>`;

    const lista = col.querySelector(`#list-${id}`);

    if (cards.length === 0) {
        lista.innerHTML = emptyState();
    } else {
        cards.forEach(p => {
            lista.appendChild(renderCard(p, tipo)); 
        });
    }

    const sortable = Sortable.create(lista, {
        group: grupo,
        animation: 180,
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        chosenClass: 'sortable-chosen',
        delay: 80,
        delayOnTouchOnly: true,

        onStart(evt) {
            const pedidoId = evt.item.dataset.pedidoId;
            const colAtual = evt.from.closest('.kanban-col');
            posicaoAnterior.set(pedidoId, {
                lista: evt.from,
                index: evt.oldIndex,
                veiculoId: colAtual?.dataset.veiculoId || '',
                tipo: colAtual?.dataset.tipo || 'backlog',
            });
        },

        onAdd(evt) {
            const colDest = evt.to.closest('.kanban-col');
            const pedidoId = evt.item.dataset.pedidoId;
            const novoTipo = colDest.dataset.tipo;
            const novoVid = colDest.dataset.veiculoId || null;
            const novaPlaca = colDest.dataset.placa || '';

            const idsOrdenados = Array.from(evt.to.children)
                .map(card => parseInt(card.dataset.pedidoId, 10))
                .filter(id => !isNaN(id));

            persistirMovimento({ pedidoId, novoTipo, novoVid, novaPlaca, idsOrdenados, evt });
        },

        onUpdate(evt) {
            const colDest = evt.to.closest('.kanban-col');
            const veiculoId = colDest.dataset.veiculoId;
            
            const idsOrdenados = Array.from(evt.to.children)
                .map(card => parseInt(card.dataset.pedidoId, 10))
                .filter(id => !isNaN(id));
            
            atualizarOrdemRota(veiculoId, idsOrdenados);
        }
    });

    state.sortables.push(sortable);
    return col;
}

function calcularPrioridade(dataEntrega) {
    if (!dataEntrega) return 'normal';
    const hoje = new Date().toISOString().split('T')[0];
    if (dataEntrega < hoje) return 'alta';
    if (dataEntrega === hoje) return 'media';
    return 'normal';
}

async function atualizarStatusParada(paradaId, novoStatus) {
    try {
        await api.request(`/roteirizacao/paradas/${paradaId}/`, 'PATCH', { status: novoStatus });
        showToast('Status atualizado com sucesso!', 'success');
        carregarDados();
    } catch (err) {
        console.error('[Kanban] Erro ao atualizar status:', err);
        showToast('Erro ao atualizar status da parada.', 'error');
    }
}

function renderCard(pedido, tipoColuna = 'backlog') {
    const numero = pedido.pedido_numero || pedido.numero_nota || pedido.id || '';
    
    let clienteNome = pedido.cliente || pedido.cliente_nome;
    if (typeof clienteNome === 'object' && clienteNome !== null) {
        clienteNome = clienteNome.nome || '';
    }
    const cliente = clienteNome || pedido.destinatario?.nome || '—';

    let cidadeNome = pedido.cidade;
    if (typeof cidadeNome === 'object' && cidadeNome !== null) {
        cidadeNome = cidadeNome.nome || '';
    }
    const cidade = cidadeNome || pedido.destinatario?.cidade || '—';

    let bairroNome = pedido.bairro || pedido.regiao || pedido.destinatario?.bairro || '';
    if (typeof bairroNome === 'object' && bairroNome !== null) {
        bairroNome = bairroNome.nome || '';
    }

    let totalVolumes = 1;
    if (Array.isArray(pedido.itens) && pedido.itens.length > 0) {
        totalVolumes = pedido.itens.length;
    } else {
        totalVolumes = pedido.volume_total || pedido.volumes || pedido.qtde_volumes || pedido.qtd_volumes || 1;
    }
    const volumes = totalVolumes;

    const tipoOperacao = (pedido.tipo_operacao || 'ENTREGA').toUpperCase();
    const statusAtual = String(pedido.status || 'PENDENTE').toUpperCase();
    const prioridade = calcularPrioridade(pedido.data_entrega);
    const paradaId = pedido.parada_id || pedido.id;

    const hSaida = pedido.hora_saida || pedido.saida_entrega || null;
    const hChegada = pedido.hora_chegada || pedido.chegada_cliente || null;
    const hInicio = pedido.hora_inicio || null;
    const hFim = pedido.hora_fim || pedido.finalizado || null;

    const card = document.createElement('div');
    card.className = `kanban-card priority-${prioridade}`;
    card.setAttribute('draggable', 'true');
    card.dataset.pedidoId = pedido.id;
    card.title = `${cliente} — ${cidade}`;
    
    card.style.cssText = 'background: #ffffff; border-radius: 6px; padding: 10px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); font-size: 0.72rem; border-left: 4px solid #C5A059;';

    let timelineHtml = '';
    if (hSaida || hChegada || hInicio || hFim) {
        timelineHtml = `
            <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed #e2e8f0; font-size: 0.65rem; color: #64748b; display: flex; flex-direction: column; gap: 2px;">
                ${hSaida ? `<div>🚚 SAÍDA ENTREGA: ${hSaida}</div>` : ''}
                ${hChegada ? `<div>📍 CHEGADA CLIENTE: ${hChegada}</div>` : ''}
                ${hInicio ? `<div>📦 INÍCIO: ${hInicio}</div>` : ''}
                ${hFim ? `<div>✅ FINALIZADO: ${hFim}</div>` : ''}
            </div>
        `;
    }

    let localizacaoTexto = cidade.toUpperCase();
    if (bairroNome) {
        localizacaoTexto += ` / ${bairroNome.toUpperCase()}`;
    }

    let seletorStatusHtml = '';
if (tipoColuna === 'vehicle' && paradaId) {
    seletorStatusHtml = `
        <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 4px;" onclick="event.stopPropagation();">
            <label style="font-size: 0.62rem; font-weight: 700; color: #64748b;">ALTERAR STATUS:</label>
            <select class="status-select" data-parada-id="${paradaId}" style="width: 100%; padding: 4px; font-size: 0.7rem; border-radius: 4px; border: 1px solid #cbd5e1; background: #f8fafc; color: #0f172a; cursor: pointer;">
                <option value="PENDENTE" ${statusAtual === 'PENDENTE' ? 'selected' : ''}>Pendente</option>
                <option value="SAIDA" ${statusAtual === 'SAIDA' ? 'selected' : ''}>Saída para Entrega</option>
                <option value="CHEGADA" ${statusAtual === 'CHEGADA' ? 'selected' : ''}>Chegada no Cliente</option>
                <option value="INICIO" ${statusAtual === 'INICIO' ? 'selected' : ''}>Início</option>
                <option value="ENTREGA_REALIZADA" ${statusAtual === 'ENTREGA_REALIZADA' ? 'selected' : ''}>Entrega Realizada</option>
                <option value="RESSALVA" ${statusAtual === 'RESSALVA' ? 'selected' : ''}>Ressalva</option>
            </select>
        </div>
    `;
}

    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 0.62rem; background: #f8fafc; color: #64748b; font-weight: 700; padding: 1px 4px; border-radius: 2px; border: 1px solid #e2e8f0;">${tipoOperacao}</span>
            <span style="font-size: 0.62rem; background: #f1f5f9; padding: 2px 5px; border-radius: 3px; color: #C5A059; font-weight: bold;">${statusAtual}</span>
        </div>
        <div style="color: #334155; font-weight: 700; margin-bottom: 3px; font-size: 0.78rem;">
            DESTINATÁRIO: ${cliente.toUpperCase()}
        </div>
        <div style="display: flex; justify-content: space-between; color: #475569; margin-bottom: 3px; font-weight: 600;">
            <span>PEDIDO: #${numero}</span>
            <span>📦 ${volumes} VOL.</span>
        </div>
        <div style="color: #64748b; margin-bottom: 4px;">
            LOCAL: ${localizacaoTexto}
        </div>
        ${timelineHtml}
        ${seletorStatusHtml}
    `;

    const selectStatus = card.querySelector('.status-select');
    if (selectStatus) {
        selectStatus.addEventListener('change', (e) => {
            const novoSt = e.target.value;
            atualizarStatusParada(paradaId, novoSt);
        });
    }

    card.addEventListener('click', (e) => {
        if (e.target.tagName === 'SELECT' || e.target.closest('select')) return;
        abrirModalDetalhesPedido(pedido);
    });

    return card;
}

function emptyState() {
    return `<div class="col-empty"><span class="col-empty-icon">📭</span>Arraste pedidos para cá</div>`;
}

function truncarTexto(valor, limite = 60) {
    const texto = String(valor || '').trim();
    if (texto.length <= limite) return texto;
    return `${texto.slice(0, limite)}...`;
}

async function persistirMovimento({ pedidoId, novoTipo, novoVid, novaPlaca, idsOrdenados, evt }) {
    try {
        const veiculoObj = state.veiculos.find(v => String(v.id) === String(novoVid) || String(v.placa) === String(novaPlaca));
        const idParaEnvio = veiculoObj ? veiculoObj.id : novoVid;

        if (novoTipo === 'vehicle' && novoVid) {
            await api.request(`/roteirizacao/pedidos/${pedidoId}/mover/`, 'PATCH', {
                status: 'Em Rota',
                veiculo_id: Number(idParaEnvio)
            });
        } else if (novoTipo === 'backlog') {
            await api.request(`/roteirizacao/pedidos/${pedidoId}/mover/`, 'PATCH', {
                status: 'Pendente',
                veiculo_id: ''
            });
        }

        showToast(`Pedido alocado com sucesso.`, 'success');
        posicaoAnterior.delete(pedidoId);
        carregarDados();

    } catch (err) {
        console.error('[Kanban] Erro ao persistir movimento:', err);
        const anterior = posicaoAnterior.get(pedidoId);
        if (anterior) {
            const card = evt.item;
            const refNode = anterior.lista.children[anterior.index] || null;
            anterior.lista.insertBefore(card, refNode);
            posicaoAnterior.delete(pedidoId);
        }
        showToast(`Erro ao mover pedido: ${err?.message || 'Tente novamente.'}`, 'error');
        atualizarStats();
    }
}

async function atualizarOrdemRota(veiculoId, idsOrdenados) {
    try {
        const dataHoje = new Date().toISOString().split('T')[0];
        const rotasAtuais = await api.request('/roteirizacao/rotas/', 'GET');
        const rotaExistente = Array.isArray(rotasAtuais) 
            ? rotasAtuais.find(r => {
                let rVeh = r.veiculo?.id || r.veiculo;
                return String(rVeh) === String(veiculoId) && String(r.data_rota) === String(dataHoje);
              })
            : null;

        if (rotaExistente) {
            await api.request(`/roteirizacao/rotas/${rotaExistente.id}/`, 'PATCH', {
                pedido_ids: idsOrdenados
            });
            showToast('Sequência de entrega atualizada para o motorista.', 'success');
        }
    } catch (err) {
        console.error('[Kanban] Erro ao atualizar ordem da rota:', err);
        showToast('Erro ao atualizar a ordem dos pedidos.', 'error');
    }
}

function abrirModalDetalhesPedido(pedido) {
    const modalAntigo = document.getElementById('modalDetalhesPedido');
    if (modalAntigo) modalAntigo.remove();

    const numero = pedido.pedido_numero || pedido.numero_nota || pedido.id || '';
    const cliente = pedido.cliente || pedido.cliente_nome || pedido.destinatario?.nome || '—';
    const cidade = pedido.cidade || pedido.destinatario?.cidade || '—';
    const bairro = pedido.bairro || pedido.regiao || pedido.destinatario?.bairro || '';
    const endereco = pedido.endereco || pedido.destinatario?.logradouro || 'Não informado';
    const status = pedido.status || 'Pendente';
    const tipoOperacao = (pedido.tipo_operacao || 'ENTREGA').toUpperCase();
    const volumes = pedido.volume_total || pedido.volumes || pedido.qtde_volumes || (Array.isArray(pedido.itens) ? pedido.itens.length : 1);
    
    const observacoesPedido = pedido.observacoes || pedido.obs || pedido.observacao || 'Nenhuma observação registrada para este pedido.';

    let itensHtml = '<div style="color: #64748b; font-size: 0.8rem;">Nenhum item detalhado encontrado para este pedido.</div>';
    if (Array.isArray(pedido.itens) && pedido.itens.length > 0) {
        const itensAgrupados = {};
        
        pedido.itens.forEach(item => {
            const codigo = item.codigo || item.sku || item.etiqueta || item.cod_produto || item.produto_codigo || item.produto?.codigo || item.produto?.sku || item.produto?.etiqueta || '—';
            const desc = item.descricao || item.nome || item.produto || 'Item sem descrição';
            const qtd = parseInt(item.quantidade || item.qtd || 1, 10);
            
            const chave = `${codigo}_${desc}`;
            if (itensAgrupados[chave]) {
                itensAgrupados[chave].qtd += qtd;
            } else {
                itensAgrupados[chave] = { codigo, desc, qtd };
            }
        });

        itensHtml = `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.78rem;">
                <thead>
                    <tr style="background: #f1f5f9; color: #475569; text-align: left;">
                        <th style="padding: 6px; border-bottom: 1px solid #cbd5e1; width: 110px;">Código</th>
                        <th style="padding: 6px; border-bottom: 1px solid #cbd5e1;">Produto / Descrição</th>
                        <th style="padding: 6px; border-bottom: 1px solid #cbd5e1; text-align: center; width: 70px;">Qtd</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.values(itensAgrupados).map(item => `
                        <tr>
                            <td style="padding: 6px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600;">${item.codigo}</td>
                            <td style="padding: 6px; border-bottom: 1px solid #e2e8f0; color: #334155;">${item.desc}</td>
                            <td style="padding: 6px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #334155; font-weight: 600;">${item.qtd}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    const fotoChegada = pedido.foto_chegada || null;
    const fotoProdutos = pedido.foto_produtos || null;
    const fotoNota = pedido.foto_nota_assinada || null;

    const overlay = document.createElement('div');
    overlay.id = 'modalDetalhesPedido';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 9999; backdrop-filter: blur(2px);';

    overlay.innerHTML = `
        <div style="background: #ffffff; width: 750px; max-width: 92%; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh;">
            <div style="background: #1e293b; color: #fff; padding: 16px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h3 style="margin: 0; font-size: 1rem; color: #C5A059;">Detalhes Completos do Pedido #${numero}</h3>
                    <span style="font-size: 0.75rem; color: #94a3b8;">Tipo: ${tipoOperacao} | Status atual: ${status}</span>
                </div>
                <button id="fecharModalDetalhes" style="background: transparent; border: none; color: #fff; font-size: 1.2rem; cursor: pointer;">✕</button>
            </div>

            <div style="padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; font-size: 0.85rem; color: #334155;">
                
                <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <div style="font-weight: 700; color: #0f172a; margin-bottom: 6px;">📍 INFORMAÇÕES DE ENTREGA E CLIENTE</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                        <div><strong>Destinatário:</strong> ${cliente}</div>
                        <div><strong>Volumes:</strong> ${volumes} vol(s)</div>
                        <div><strong>Local:</strong> ${cidade} ${bairro ? `/ ${bairro}` : ''}</div>
                        <div><strong>Endereço:</strong> ${endereco}</div>
                    </div>
                </div>

                <div style="background: #fdf8e2; padding: 10px 12px; border-radius: 6px; border: 1px solid #f9e8a2; color: #856404;">
                    <div style="font-weight: 700; margin-bottom: 2px; font-size: 0.78rem;">📝 OBSERVAÇÕES DO PEDIDO</div>
                    <div style="font-size: 0.8rem; color: #533f03;">${observacoesPedido}</div>
                </div>

                <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <div style="font-weight: 700; color: #0f172a; margin-bottom: 6px;">⏱️ HISTÓRICO OPERACIONAL E TIMELINE</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 0.8rem;">
                        <div>🚚 <strong>Saída Entrega:</strong> ${pedido.saida_entrega || pedido.hora_saida || 'Aguardando'}</div>
                        <div>📍 <strong>Chegada Cliente:</strong> ${pedido.chegada_cliente || pedido.hora_chegada || 'Aguardando'}</div>
                        <div>📦 <strong>Início Descarga:</strong> ${pedido.inicio_descarregamento || pedido.hora_inicio || 'Aguardando'}</div>
                        <div>✅ <strong>Finalizado:</strong> ${pedido.finalizado || pedido.hora_fim || 'Aguardando'}</div>
                    </div>
                </div>

                <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <div style="font-weight: 700; color: #0f172a; margin-bottom: 6px;">📦 ITENS / PRODUTOS DO PEDIDO</div>
                    ${itensHtml}
                </div>

                <div>
                    <div style="font-weight: 700; color: #0f172a; margin-bottom: 8px;">📷 GALERIA DE EVIDÊNCIAS FOTOGRÁFICAS</div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                        <div style="border: 1px dashed #cbd5e1; padding: 8px; text-align: center; border-radius: 6px; background: #f8fafc;">
                            <div style="font-size: 0.7rem; color: #64748b; margin-bottom: 4px;">Chegada</div>
                            ${fotoChegada ? `<img src="${fotoChegada}" style="width:100%; height:80px; object-fit:cover; border-radius:4px;" />` : '<span style="font-size:0.65rem; color:#94a3b8;">Sem foto</span>'}
                        </div>
                        <div style="border: 1px dashed #cbd5e1; padding: 8px; text-align: center; border-radius: 6px; background: #f8fafc;">
                            <div style="font-size: 0.7rem; color: #64748b; margin-bottom: 4px;">Produtos</div>
                            ${fotoProdutos ? `<img src="${fotoProdutos}" style="width:100%; height:80px; object-fit:cover; border-radius:4px;" />` : '<span style="font-size:0.65rem; color:#94a3b8;">Sem foto</span>'}
                        </div>
                        <div style="border: 1px dashed #cbd5e1; padding: 8px; text-align: center; border-radius: 6px; background: #f8fafc;">
                            <div style="font-size: 0.7rem; color: #64748b; margin-bottom: 4px;">NF Assinada</div>
                            ${fotoNota ? `<img src="${fotoNota}" style="width:100%; height:80px; object-fit:cover; border-radius:4px;" />` : '<span style="font-size:0.65rem; color:#94a3b8;">Sem foto</span>'}
                        </div>
                    </div>
                </div>

            </div>

            <div style="background: #f1f5f9; padding: 12px 16px; display: flex; justify-content: flex-end; align-items: center; border-top: 1px solid #e2e8f0;">
                <button id="fecharModalDetalhesFooter" style="background: #0f172a; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; font-size: 0.75rem; cursor: pointer; font-weight: 600;">Fechar</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('fecharModalDetalhes').addEventListener('click', () => overlay.remove());
    document.getElementById('fecharModalDetalhesFooter').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

async function publicarRotas() {
    try {
        showToast('Publicando rotas do dia...', 'info');
        showToast('Rotas publicadas com sucesso!', 'success');
    } catch (err) {
        console.error('[Kanban] Erro ao publicar rotas:', err);
        showToast('Erro ao publicar rotas.', 'error');
    }
}

function hojeISO() {
    return new Date().toISOString().slice(0, 10);
}

function formatarDataBR(value) {
    if (!value) return '—';
    const raw = String(value).slice(0, 10);
    const [y, m, d] = raw.split('-');
    if (!y || !m || !d) return value;
    return `${d}/${m}/${y}`;
}

function formatarHora(value) {
    if (!value) return '';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value).slice(11, 16);
    return dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function situacaoLabel(status) {
    const map = {
        PLANEJADA: 'PLANEJADA',
        EM_ANDAMENTO: 'EM ANDAMENTO',
        CONCLUIDA: 'CONCLUÍDA',
        CANCELADA: 'CANCELADA',
    };
    return map[String(status || '').toUpperCase()] || status || 'PLANEJADA';
}

function veiculoDaRota(rota) {
    const ref = rota.veiculo || rota.veiculo_id;
    const id = typeof ref === 'object' && ref ? ref.id : ref;
    return state.veiculos.find((v) => String(v.id) === String(id) || String(v.placa) === String(rota.veiculo_placa || '')) || null;
}

function motoristaDaRota(rota) {
    if (rota.motorista_nome) return rota.motorista_nome;
    const obsMotorista = String(rota.observacoes || '').match(/Motorista\s+([^;]+)/i);
    if (obsMotorista?.[1] && obsMotorista[1].trim()) return obsMotorista[1].trim();
    if (rota.equipe_nome) return rota.equipe_nome;
    const equipeId = rota.equipe?.id || rota.equipe;
    const equipe = state.equipes.find((eq) => String(eq.id) === String(equipeId));
    return equipe?.motorista_nome || equipe?.nome || '';
}

function resumoParadas(rota) {
    const paradas = Array.isArray(rota.paradas) ? rota.paradas : [];
    let coletas = 0;
    let entregas = 0;
    let concluidas = 0;
    let saida = '';
    let chegada = '';
    paradas.forEach((p) => {
        const tipo = String(p.pedido?.tipo_operacao || 'ENTREGA').toUpperCase();
        if (tipo.includes('COLETA')) coletas += 1;
        else entregas += 1;
        const st = String(p.status || '').toUpperCase();
        if (['ENTREGA_REALIZADA', 'RESSALVA', 'CONCLUIDO', 'CONCLUÍDO'].includes(st)) concluidas += 1;
        if (p.saida_entrega && !saida) saida = p.saida_entrega;
        if (p.chegada_cliente) chegada = p.chegada_cliente;
        if (p.finalizado) chegada = p.finalizado;
    });
    const progresso = paradas.length ? Math.round((concluidas / paradas.length) * 100) : 0;
    return { coletas, entregas, progresso, saida, chegada, total: paradas.length };
}

function tempoRota(saida, chegada) {
    if (!saida || !chegada) return '';
    const a = new Date(saida);
    const b = new Date(chegada);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return '';
    const min = Math.round((b - a) / 60000);
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function manifestosPropria() {
    return (state.rotas || []).filter((rota) => {
        const veiculo = veiculoDaRota(rota);
        if (!veiculo) return Boolean(rota.veiculo_placa || rota.codigo);
        return tipoFrotaVeiculo(veiculo) === 'PROPRIA';
    });
}

function preencherFiltrosManifesto() {
    const selMf = document.getElementById('mfManifesto');
    const selRota = document.getElementById('mfRota');
    if (!selMf || !selRota) return;
    const atualMf = selMf.value;
    const atualRota = selRota.value;
    const lista = manifestosPropria();
    selMf.innerHTML = '<option value="">TODOS</option>' + lista
        .map((r) => `<option value="${r.codigo || r.id}">${r.codigo || r.id}</option>`)
        .join('');
    selRota.innerHTML = '<option value="">TODAS</option>' + [...new Set(lista.map((r) => r.codigo).filter(Boolean))]
        .map((codigo) => `<option value="${codigo}">${codigo}</option>`)
        .join('');
    selMf.value = atualMf;
    selRota.value = atualRota;
    if (!document.getElementById('mfDataIni').value) document.getElementById('mfDataIni').value = hojeISO();
    if (!document.getElementById('mfDataFim').value) document.getElementById('mfDataFim').value = hojeISO();
}

function filtrarManifestos() {
    const codigo = document.getElementById('mfManifesto')?.value || '';
    const situacao = document.getElementById('mfSituacao')?.value || '';
    const motorista = (document.getElementById('mfMotorista')?.value || '').toLowerCase();
    const dataIni = document.getElementById('mfDataIni')?.value || '';
    const dataFim = document.getElementById('mfDataFim')?.value || '';
    const rotaFiltro = document.getElementById('mfRota')?.value || '';

    return manifestosPropria().filter((rota) => {
        if (codigo && String(rota.codigo) !== codigo && String(rota.id) !== codigo) return false;
        if (situacao && String(rota.status || '').toUpperCase() !== situacao) return false;
        if (motorista && !motoristaDaRota(rota).toLowerCase().includes(motorista)) return false;
        if (rotaFiltro && String(rota.codigo) !== rotaFiltro) return false;
        const data = String(rota.data_rota || rota.criado_em || '').slice(0, 10);
        if (dataIni && data && data < dataIni) return false;
        if (dataFim && data && data > dataFim) return false;
        return true;
    });
}

function renderManifestos() {
    const tbody = document.getElementById('mfTabelaBody');
    if (!tbody) return;
    const lista = filtrarManifestos();
    state.manifestosFiltrados = lista;
    document.getElementById('mfTotal').textContent = String(lista.length);
    document.getElementById('mfTotalDir').textContent = String(lista.length);

    if (!lista.length) {
        tbody.innerHTML = `<tr><td class="mf-empty" colspan="23">Nenhum manifesto encontrado para o filtro informado.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map((rota) => {
        const veiculo = veiculoDaRota(rota);
        const resumo = resumoParadas(rota);
        const saida = formatarHora(resumo.saida);
        const chegada = formatarHora(resumo.chegada);
        return `
            <tr data-id="${rota.id}">
                <td><input type="checkbox" class="mf-check" data-id="${rota.id}"></td>
                <td>${rota.id || '—'}</td>
                <td>
                    <div class="mf-actions-inline">
                        ${manifestoActionButton('ver', rota.id, 'Visualizar manifesto')}
                        ${manifestoActionButton('editar', rota.id, 'Editar manifesto')}
                        ${manifestoActionButton('excluir', rota.id, 'Excluir manifesto')}
                    </div>
                </td>
                <td>${escapeHtml(rota.unidade_emissora || '—')}</td>
                <td>${formatarDataBR(rota.data_rota)}</td>
                <td>${escapeHtml(rota.ciot || 'Não informado')}</td>
                <td>${escapeHtml(rota.mdfe || 'Não informado')}</td>
                <td>${escapeHtml(rota.status_mdfe || 'Não informado')}</td>
                <td>${motoristaDaRota(rota) || '—'}</td>
                <td>${rota.veiculo_placa || veiculo?.placa || '—'}</td>
                <td>${rota.codigo || '—'}</td>
                <td>${saida || '—'}</td>
                <td>${chegada || '—'}</td>
                <td>${situacaoLabel(rota.status)}</td>
                <td>—</td>
                <td>${rota.km_inicial ?? '—'}</td>
                <td>${rota.km_final ?? '—'}</td>
                <td>${rota.km_inicial != null && rota.km_final != null ? Math.max(0, rota.km_final - rota.km_inicial) : '—'}</td>
                <td>${tempoRota(resumo.saida, resumo.chegada) || '—'}</td>
                <td>${resumo.coletas}</td>
                <td>${resumo.entregas}</td>
                <td><span class="mf-progress" title="${resumo.progresso}%"><span style="width:${resumo.progresso}%"></span></span> ${resumo.progresso}%</td>
                <td>${escapeHtml(rota.xml_url || 'Não informado')}</td>
            </tr>`;
    }).join('');

    tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
        tr.addEventListener('click', (event) => {
            if (event.target.closest('input')) return;
            const check = tr.querySelector('.mf-check');
            if (check) check.checked = !check.checked;
            tr.classList.toggle('is-selected', check?.checked);
        });
        tr.querySelector('.mf-check')?.addEventListener('change', (event) => {
            tr.classList.toggle('is-selected', event.target.checked);
        });
    });

    tbody.querySelectorAll('[data-manifesto-acao]').forEach((btn) => {
        btn.addEventListener('click', async (event) => {
            event.stopPropagation();
            const rota = rotaPorId(btn.dataset.id);
            if (!rota) return;
            if (btn.dataset.manifestoAcao === 'ver') {
                abrirVisualizarManifesto(rota);
            } else if (btn.dataset.manifestoAcao === 'editar') {
                await abrirEditarManifesto(rota);
            } else if (btn.dataset.manifestoAcao === 'excluir') {
                await excluirManifesto(rota);
            }
        });
    });
}

function idsManifestosSelecionados() {
    return Array.from(document.querySelectorAll('.mf-check:checked')).map((el) => el.dataset.id);
}

function imprimirManifestosSelecionados() {
    const ids = idsManifestosSelecionados();
    const manifestos = (state.manifestosFiltrados || []).filter((rota) => ids.includes(String(rota.id)));
    if (!manifestos.length) {
        showToast('Selecione ao menos um manifesto para imprimir.', 'info');
        return;
    }

    const conteudo = manifestos.map((rota) => {
        const paradas = [...(rota.paradas || [])]
            .filter((parada) => parada && parada.pedido)
            .sort((a, b) => Number(a.sequencia || 0) - Number(b.sequencia || 0));
        const resumo = resumoParadas(rota);
        const veiculo = veiculoDaRota(rota);
        return `
            <section class="manifesto">
                <h1>Manifesto ${escapeHtml(rota.codigo || rota.id || '')}</h1>
                <div class="dados">
                    <span><strong>Data:</strong> ${escapeHtml(formatarDataBR(rota.data_rota))}</span>
                    <span><strong>Unidade:</strong> ${escapeHtml(rota.unidade_emissora || 'Não informado')}</span>
                    <span><strong>Motorista:</strong> ${escapeHtml(motoristaDaRota(rota) || 'Não informado')}</span>
                    <span><strong>Veículo:</strong> ${escapeHtml(rota.veiculo_placa || veiculo?.placa || 'Não informado')}</span>
                    <span><strong>Situação:</strong> ${escapeHtml(situacaoLabel(rota.status))}</span>
                    <span><strong>Pedidos:</strong> ${paradas.length}</span>
                </div>
                <table>
                    <thead><tr><th>Seq.</th><th>Pedido</th><th>Cliente</th><th>Cidade</th><th>Tipo</th><th>Status</th></tr></thead>
                    <tbody>${paradas.map((parada) => `
                        <tr>
                            <td>${escapeHtml(parada.sequencia)}</td>
                            <td>${escapeHtml(parada.pedido.numero_nota || parada.pedido.pedido_web || parada.pedido.id || '—')}</td>
                            <td>${escapeHtml(parada.pedido.cliente || '—')}</td>
                            <td>${escapeHtml(parada.pedido.cidade || '—')}</td>
                            <td>${escapeHtml(String(parada.pedido.tipo_operacao || 'ENTREGA').toUpperCase())}</td>
                            <td>${escapeHtml(parada.status || 'PENDENTE')}</td>
                        </tr>`).join('')}</tbody>
                </table>
                <p class="resumo">Coletas: ${resumo.coletas} | Entregas: ${resumo.entregas} | Progresso: ${resumo.progresso}%</p>
            </section>`;
    }).join('');

    const janela = window.open('', '_blank', 'noopener,noreferrer');
    if (!janela) {
        showToast('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.', 'error');
        return;
    }
    janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Manifestos</title>
        <style>
            body { font-family: Arial, sans-serif; color: #111; margin: 24px; }
            .manifesto { page-break-after: always; }
            .manifesto:last-child { page-break-after: auto; }
            h1 { font-size: 20px; border-bottom: 2px solid #111; padding-bottom: 8px; }
            .dados { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 20px; margin-bottom: 18px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #999; padding: 6px; text-align: left; }
            th { background: #eee; }
            .resumo { font-size: 12px; margin-top: 12px; }
        </style></head><body>${conteudo}</body></html>`);
    janela.document.close();
    janela.focus();
    janela.addEventListener('load', () => {
        janela.print();
        janela.close();
    }, { once: true });
}

function initManifestoList() {
    document.getElementById('mfFiltros')?.addEventListener('submit', (event) => {
        event.preventDefault();
        renderManifestos();
    });
    document.getElementById('btnIncluirManifesto')?.addEventListener('click', abrirIncluirManifesto);
    document.getElementById('btnImprimirManifestos')?.addEventListener('click', imprimirManifestosSelecionados);
    document.getElementById('btnExcelManifestos')?.addEventListener('click', exportarManifestosExcel);
    document.getElementById('btnSaidaEfetiva')?.addEventListener('click', registrarSaidaEfetiva);
    document.getElementById('btnVoltarManifesto')?.addEventListener('click', fecharFormManifesto);
    document.getElementById('mfForm')?.addEventListener('submit', salvarFormManifesto);
    // CORRECAO: forcar type="button" e preventDefault para nao submeter o form ao clicar
    const btnMaisEntrega = document.getElementById('btnMaisEntrega');
    if (btnMaisEntrega) {
        btnMaisEntrega.type = 'button';
        btnMaisEntrega.addEventListener('click', (e) => {
            e.preventDefault();
            adicionarPedidoAoForm('entrega');
        });
    }
    const btnPesquisarColeta = document.getElementById('btnPesquisarColeta');
    if (btnPesquisarColeta) {
        btnPesquisarColeta.type = 'button';
        btnPesquisarColeta.addEventListener('click', (e) => {
            e.preventDefault();
            adicionarPedidoAoForm('coleta');
        });
    }
    document.getElementById('incBuscaEntrega')?.addEventListener('input', () => preencherSelectEmissoes('incEmissaoEntrega', 'incBuscaEntrega'));
    document.getElementById('incBuscaColeta')?.addEventListener('input', () => preencherSelectEmissoes('incEmissaoColeta', 'incBuscaColeta'));
    document.getElementById('incBuscaEntrega')?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); adicionarPedidoAoForm('entrega'); }
    });
    document.getElementById('incBuscaColeta')?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); adicionarPedidoAoForm('coleta'); }
    });
    document.getElementById('btnAddMotorista')?.addEventListener('click', () => {
        document.getElementById('incMotorista')?.focus();
        showToast('Os motoristas vêm do cadastro de funcionários.', 'info');
    });
    document.getElementById('incEquipe')?.addEventListener('change', aplicarEquipeNoFormulario);
    initAjudantesSelector();
}

function mostrarFormManifesto(aberto) {
    document.getElementById('mfLista')?.classList.toggle('mf-hidden', aberto);
    document.getElementById('mfForm')?.classList.toggle('mf-hidden', !aberto);
    const title = document.getElementById('pageTitle');
    const btnSalvar = document.getElementById('btnSalvarManifesto');
    if (title) {
        if (!aberto) {
            title.textContent = '189 - Manifestos > Motorista / Rota';
        } else if (state.manifestoEditandoId) {
            title.textContent = 'EDITAR MANIFESTO > Motorista / Rota';
        } else {
            title.textContent = 'MANIFESTO DE CARGA > Motorista';
        }
    }
    if (btnSalvar) {
        btnSalvar.textContent = state.manifestoEditandoId ? 'Salvar alterações' : 'Salvar manifesto';
    }
}

function nomeFuncionario(func) {
    return (func.nome || `${func.first_name || ''} ${func.last_name || ''}`.trim() || func.username || 'Sem nome').trim();
}

function cargoFuncionario(func) {
    return String(func.cargo || func.role || '').toLowerCase();
}

function funcionariosMotoristas() {
    const lista = state.funcionarios.filter((f) => f.ativo !== false && (/motorista/.test(cargoFuncionario(f)) || f.cnh));
    return lista.length ? lista : state.funcionarios.filter((f) => f.ativo !== false);
}

function funcionariosAjudantes() {
    const lista = state.funcionarios.filter((f) => f.ativo !== false && /ajudante/.test(cargoFuncionario(f)));
    return lista.length ? lista : state.funcionarios.filter((f) => f.ativo !== false && !/motorista/.test(cargoFuncionario(f)));
}

function equipePorId(id) {
    return state.equipes.find((e) => String(e.id) === String(id));
}

function renderAjudantesSelector() {
    const select = document.getElementById('incAjudantes');
    const options = document.getElementById('ajudantesOptions');
    const summary = document.getElementById('ajudantesSummary');
    const count = document.getElementById('ajudantesCount');
    if (!select || !options || !summary || !count) return;

    const selecionados = Array.from(select.selectedOptions);
    summary.textContent = selecionados.length
        ? selecionados.map((option) => option.textContent).join(', ')
        : 'Nenhum ajudante selecionado';
    count.textContent = `${selecionados.length} selecionado${selecionados.length === 1 ? '' : 's'}`;
    options.innerHTML = Array.from(select.options)
        .filter((option) => option.value)
        .map((option) => {
            const selected = option.selected;
            return `
                <button type="button" class="mf-multiselect__option${selected ? ' is-selected' : ''}"
                    data-value="${option.value}" role="checkbox" aria-checked="${selected}">
                    <span class="mf-multiselect__check" aria-hidden="true">✓</span>
                    <span class="mf-multiselect__option-text">${option.textContent}</span>
                </button>`;
        }).join('');

    options.querySelectorAll('[data-value]').forEach((optionButton) => {
        optionButton.addEventListener('click', () => {
            const option = Array.from(select.options)
                .find((item) => item.value === optionButton.dataset.value);
            if (!option) return;
            option.selected = !option.selected;
            renderAjudantesSelector();
        });
    });
}

function initAjudantesSelector() {
    const trigger = document.getElementById('ajudantesTrigger');
    const panel = document.getElementById('ajudantesPanel');
    const selector = document.getElementById('ajudantesSelector');
    if (!trigger || !panel || !selector || selector.dataset.initialized === 'true') return;
    selector.dataset.initialized = 'true';
    trigger.addEventListener('click', () => {
        const aberto = panel.hidden;
        panel.hidden = !aberto;
        trigger.setAttribute('aria-expanded', String(aberto));
    });
    document.addEventListener('click', (event) => {
        if (!selector.contains(event.target)) {
            panel.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
        }
    });
    renderAjudantesSelector();
}

function idsDosMembrosDaEquipe(equipe) {
    const membros = Array.isArray(equipe?.membros) ? equipe.membros : [];
    const ids = membros
        .map((membro) => {
            if (membro && typeof membro === 'object') {
                return membro.id || membro.funcionario_id;
            }
            return membro;
        })
        .filter((id) => id !== undefined && id !== null && String(id) !== '');
    if (ids.length) return ids.map(String);

    // Compatibilidade com respostas antigas que retornam somente os nomes.
    const nomes = Array.isArray(equipe?.membros_nomes) ? equipe.membros_nomes : [];
    return state.funcionarios
        .filter((funcionario) => nomes.some((nome) =>
            nomeFuncionario(funcionario).toLowerCase() === String(nome).trim().toLowerCase()
        ))
        .map((funcionario) => String(funcionario.id));
}

async function aplicarEquipeNoFormulario() {
    const equipeId = document.getElementById('incEquipe')?.value || '';
    const motoristaSelect = document.getElementById('incMotorista');
    const ajudantesSelect = document.getElementById('incAjudantes');
    const veiculoSelect = document.getElementById('incVeiculo');
    const semiSelect = document.getElementById('incSemi');
    if (!equipeId) {
        if (motoristaSelect) motoristaSelect.value = '';
        if (ajudantesSelect) Array.from(ajudantesSelect.options).forEach((option) => { option.selected = false; });
        if (veiculoSelect) veiculoSelect.value = '';
        if (semiSelect) semiSelect.value = '';
        renderAjudantesSelector();
        return;
    }
    let equipe = equipePorId(equipeId);
    try {
        equipe = await api.request(`/cadastros/equipes/${equipeId}/`, 'GET');
    } catch (err) {
        showToast(err?.message || 'Não foi possível carregar os dados da equipe.', 'error');
        return;
    }
    const motorista = state.funcionarios.find((f) => String(f.usuario_id || '') === String(equipe.motorista || ''));
    const membros = idsDosMembrosDaEquipe(equipe);
    const veiculosEquipe = state.veiculos.filter((v) => String(v.equipe || v.equipe_id || '') === String(equipe.id));
    const veiculo = veiculosEquipe.find((v) => !/semi|reboque/i.test(`${v.tipo_equipamento || ''} ${v.modelo || ''}`)) || veiculosEquipe[0];
    const semi = veiculosEquipe.find((v) => /semi|reboque/i.test(`${v.tipo_equipamento || ''} ${v.modelo || ''}`));
    if (motoristaSelect) motoristaSelect.value = motorista ? String(motorista.id) : '';
    if (ajudantesSelect) Array.from(ajudantesSelect.options).forEach((option) => { option.selected = membros.includes(option.value); });
    if (veiculoSelect) veiculoSelect.value = veiculo ? String(veiculo.id) : '';
    if (semiSelect) semiSelect.value = semi ? String(semi.id) : '';
    renderAjudantesSelector();
}

function veiculosCadastro(tipoFrota = '') {
    return state.veiculos.filter((v) => {
        if (v.ativo === false) return false;
        if (!tipoFrota) return true;
        return tipoFrotaVeiculo(v) === tipoFrota;
    });
}

function idsPedidosJaManifestados(excluirRotaId = null) {
    const ids = new Set();
    (state.rotas || []).forEach((rota) => {
        if (excluirRotaId !== null && String(rota.id) === String(excluirRotaId)) return;
        const temVeiculo = Boolean(rota.veiculo || rota.veiculo_id || rota.veiculo_placa);
        if (!temVeiculo) return;
        (rota.paradas || []).forEach((p) => {
            const id = p.pedido?.id || p.pedido_id;
            if (id) ids.add(String(id));
        });
    });
    return ids;
}

function emissoesDisponiveis(termo = '') {
    const t = String(termo || '').trim().toLowerCase();
    const usados = new Set([
        ...idsPedidosJaManifestados(state.manifestoEditandoId),
        ...state.formEntregas.map((p) => String(p.id)),
        ...state.formColetas.map((p) => String(p.id)),
    ]);
    return (state.pedidosLivres || []).filter((p) => {
        if (usados.has(String(p.id))) return false;
        if (!t) return true;
        return [p.numero_nota, p.pedido_web, p.cliente, p.loja, p.cidade]
            .some((campo) => String(campo || '').toLowerCase().includes(t));
    });
}

function labelEmissao(pedido) {
    const numero = pedido.numero_nota || pedido.pedido_web || pedido.id;
    const cliente = pedido.cliente || pedido.destinatario?.nome || 'Sem destinatário';
    const cidade = pedido.cidade || pedido.destinatario?.cidade || '';
    return `${numero} — ${cliente}${cidade ? ` / ${cidade}` : ''}`;
}

function preencherSelect(el, vazio, itens) {
    if (!el) return;
    el.innerHTML = `<option value="">${vazio}</option>` + itens.map((item) => (
        `<option value="${item.value}">${item.label}</option>`
    )).join('');
}

function preencherSelectsForm() {
    preencherSelect(
        document.getElementById('incEquipe'),
        state.equipes.length ? 'NENHUMA EQUIPE' : 'Nenhuma equipe no cadastro',
        state.equipes.filter((e) => e.ativo !== false).map((e) => ({ value: e.id, label: e.nome }))
    );
    preencherSelect(
        document.getElementById('incMotorista'),
        state.funcionarios.length ? 'NENHUM DEFINIDO' : 'Nenhum motorista no cadastro',
        funcionariosMotoristas().map((f) => ({
            value: f.id,
            label: `${nomeFuncionario(f)}${f.cpf ? ` — ${f.cpf}` : ''}${f.usuario_id ? '' : ' (sem acesso ao app)'}`,
        }))
    );
    preencherSelect(
        document.getElementById('incAjudantes'),
        state.funcionarios.length ? 'NENHUM' : 'Nenhum ajudante no cadastro',
        funcionariosAjudantes().map((f) => ({
            value: f.id,
            label: `${nomeFuncionario(f)}${f.cpf ? ` — ${f.cpf}` : ''}${f.usuario_id ? '' : ' (sem acesso ao app)'}`,
        }))
    );
    renderAjudantesSelector();
    const veiculos = veiculosCadastro('PROPRIA');
    const listaVeiculo = (veiculos.length ? veiculos : veiculosCadastro()).map((v) => ({
        value: v.id,
        label: `${v.placa} — ${v.modelo || v.tipo_equipamento || 'Veículo'}`,
    }));
    preencherSelect(document.getElementById('incVeiculo'), listaVeiculo.length ? 'NENHUM' : 'Nenhum veículo no cadastro', listaVeiculo);
    preencherSelect(
        document.getElementById('incSemi'),
        'NENHUM',
        veiculosCadastro().map((v) => ({ value: v.id, label: `${v.placa} — ${v.tipo_equipamento || v.modelo || 'Implemento'}` }))
    );
    preencherSelectEmissoes('incEmissaoEntrega', 'incBuscaEntrega');
    preencherSelectEmissoes('incEmissaoColeta', 'incBuscaColeta');
}

function preencherSelectEmissoes(selectId, filtroId) {
    const termo = document.getElementById(filtroId)?.value || '';
    const emissoes = emissoesDisponiveis(termo);
    preencherSelect(
        document.getElementById(selectId),
        emissoes.length ? 'Selecione uma emissão...' : 'Nenhuma emissão disponível',
        emissoes.map((p) => ({ value: p.id, label: labelEmissao(p) }))
    );
}

async function abrirIncluirManifesto() {
    state.manifestoEditandoId = null;
    state.formEntregas = [];
    state.formColetas = [];
    document.getElementById('incKmIni').value = '0';
    document.getElementById('incKmFim').value = '0';
    document.getElementById('incUnidade').value = 'HOLDING PACHECO';
    document.getElementById('incEquipe').value = '';
    document.getElementById('incMotorista').value = '';
    Array.from(document.getElementById('incAjudantes').options).forEach((option) => { option.selected = false; });
    renderAjudantesSelector();
    document.getElementById('incVeiculo').value = '';
    document.getElementById('incSemi').value = '';
    document.getElementById('incGerenciadora').value = 'NENHUM';
    document.getElementById('incSaidaData').value = hojeISO();
    document.getElementById('incChegadaData').value = hojeISO();
    const agora = new Date();
    document.getElementById('incSaidaHora').value = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
    document.getElementById('incChegadaHora').value = '';
    document.getElementById('incBuscaEntrega').value = '';
    document.getElementById('incBuscaColeta').value = '';
    if (!state.funcionarios.length) {
        try {
            const res = await api.request('/cadastros/funcionarios/', 'GET');
            state.funcionarios = Array.isArray(res) ? res : (res.results || []);
        } catch {
            state.funcionarios = [];
        }
    }
    if (!state.veiculos.length) {
        try {
            const res = await api.request('/cadastros/veiculos/', 'GET');
            state.veiculos = Array.isArray(res) ? res : (res.results || []);
        } catch {
            state.veiculos = [];
        }
    }
    try {
        const res = await api.request('/pedidos/', 'GET');
        state.pedidosLivres = Array.isArray(res) ? res : (res.results || []);
    } catch {
        state.pedidosLivres = [];
    }
    preencherSelectsForm();
    renderFormTabelas();
    mostrarFormManifesto(true);
}

function fecharFormManifesto() {
    state.manifestoEditandoId = null;
    state.formEntregas = [];
    state.formColetas = [];
    mostrarFormManifesto(false);
}

function aplicarObservacoesNoFormulario(observacoes) {
    const texto = String(observacoes || '');
    const unidade = texto.match(/Unidade\s+([^;]+)/i);
    const km = texto.match(/KM\s+(\d+)\s*-\s*(\d+)/i);
    if (unidade && document.getElementById('incUnidade')) {
        document.getElementById('incUnidade').value = unidade[1].trim();
    }
    if (km) {
        document.getElementById('incKmIni').value = km[1];
        document.getElementById('incKmFim').value = km[2];
    }
}

function combinarDataHora(data, hora) {
    return data && hora ? `${data}T${hora}:00` : null;
}

function preencherDataHora(idData, idHora, valor) {
    const texto = String(valor || '');
    document.getElementById(idData).value = texto.slice(0, 10);
    document.getElementById(idHora).value = texto.length >= 16 ? texto.slice(11, 16) : '';
}

function normalizarPedidoManifesto(pedido) {
    return {
        id: pedido.id,
        numero: pedido.numero_nota || pedido.pedido_web || pedido.id,
        emissao: formatarDataBR(pedido.criado_em || hojeISO()),
        destinatario: pedido.cliente || pedido.destinatario?.nome || '—',
        remetente: pedido.loja || pedido.emitente?.nome || '—',
        cidade: pedido.cidade || pedido.destinatario?.cidade || '—',
        volumes: Number(pedido.volume_total || pedido.volumes || 0) || 0,
        peso: Number(pedido.peso_total || 0) || 0,
        valor: Number(pedido.valor_total || 0) || 0,
        tipoOperacao: String(pedido.tipo_operacao || '').toUpperCase(),
    };
}

async function abrirEditarManifesto(rota) {
    const rotaAtual = typeof rota === 'object' && rota ? rota : rotaPorId(rota);
    if (!rotaAtual) {
        showToast('Manifesto não encontrado.', 'error');
        return;
    }

    state.manifestoEditandoId = rotaAtual.id;
    state.formEntregas = [];
    state.formColetas = [];

    if (!state.funcionarios.length) {
        const res = await api.request('/cadastros/funcionarios/', 'GET');
        state.funcionarios = Array.isArray(res) ? res : (res.results || []);
    }
    if (!state.veiculos.length) {
        const res = await api.request('/cadastros/veiculos/', 'GET');
        state.veiculos = Array.isArray(res) ? res : (res.results || []);
    }
    if (!state.pedidosLivres.length) {
        const res = await api.request('/pedidos/', 'GET');
        state.pedidosLivres = Array.isArray(res) ? res : (res.results || []);
    }

    document.getElementById('incSaidaData').value = String(rotaAtual.data_rota || hojeISO());
    document.getElementById('incChegadaData').value = String(rotaAtual.data_rota || hojeISO());
    document.getElementById('incSaidaHora').value = '';
    document.getElementById('incChegadaHora').value = '';
    document.getElementById('incBuscaEntrega').value = '';
    document.getElementById('incBuscaColeta').value = '';
    document.getElementById('incKmIni').value = '0';
    document.getElementById('incKmFim').value = '0';
    document.getElementById('incUnidade').value = rotaAtual.unidade_emissora || 'HOLDING PACHECO';
    document.getElementById('incSemi').value = String(rotaAtual.semireboque || '');
    document.getElementById('incGerenciadora').value = rotaAtual.gerenciadora || 'NENHUM';
    preencherDataHora('incSaidaData', 'incSaidaHora', rotaAtual.saida_prevista);
    preencherDataHora('incChegadaData', 'incChegadaHora', rotaAtual.chegada_prevista);
    aplicarObservacoesNoFormulario(rotaAtual.observacoes);

    const paradasOrdenadas = [...(rotaAtual.paradas || [])]
        .filter((parada) => parada && parada.pedido)
        .sort((a, b) => Number(a.sequencia || 0) - Number(b.sequencia || 0));
    paradasOrdenadas.forEach((parada) => {
        const pedidoForm = normalizarPedidoManifesto(parada.pedido);
        if (pedidoForm.tipoOperacao.includes('COLETA')) {
            state.formColetas.push(pedidoForm);
        } else {
            state.formEntregas.push(pedidoForm);
        }
    });

    preencherSelectsForm();
    const motoristaEdit = state.funcionarios.find((f) => String(f.usuario_id || f.id) === String(rotaAtual.motorista || rotaAtual.motorista_id || ''));
    const ajudanteEdit = state.funcionarios.find((f) => String(f.usuario_id || f.id) === String(rotaAtual.ajudante || rotaAtual.ajudante_id || ''));
    const veiculoEdit = state.veiculos.find((v) => String(v.id) === String(rotaAtual.veiculo || rotaAtual.veiculo_id || ''));
    if (document.getElementById('incVeiculo')) document.getElementById('incVeiculo').value = veiculoEdit ? String(veiculoEdit.id) : String(rotaAtual.veiculo || rotaAtual.veiculo_id || '');
    if (document.getElementById('incMotorista')) document.getElementById('incMotorista').value = motoristaEdit ? String(motoristaEdit.id) : '';
    if (document.getElementById('incEquipe')) document.getElementById('incEquipe').value = String(rotaAtual.equipe || rotaAtual.equipe_id || '');
    if (document.getElementById('incAjudantes')) {
        const ajudantes = (rotaAtual.ajudantes || []).map((item) => String(typeof item === 'object' ? item.id : item));
        if (!ajudantes.length && ajudanteEdit) ajudantes.push(String(ajudanteEdit.id));
        Array.from(document.getElementById('incAjudantes').options).forEach((option) => {
            option.selected = ajudantes.includes(option.value);
        });
        renderAjudantesSelector();
    }
    renderFormTabelas();
    mostrarFormManifesto(true);
}

function fecharModalManifesto() {
    document.getElementById('modalManifestoDetalhe')?.remove();
}

function abrirVisualizarManifesto(rota) {
    fecharModalManifesto();
    const paradas = [...(rota.paradas || [])]
        .filter((parada) => parada && parada.pedido)
        .sort((a, b) => Number(a.sequencia || 0) - Number(b.sequencia || 0));
    const veiculo = veiculoDaRota(rota);
    const semireboque = state.veiculos.find((item) => String(item.id) === String(rota.semireboque || ''));
    const modal = document.createElement('div');
    modal.id = 'modalManifestoDetalhe';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
        <div style="background:#fff;max-width:980px;width:100%;max-height:90vh;overflow:auto;border-radius:8px;">
            <div style="padding:14px 16px;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;align-items:center;">
                <strong>Manifesto ${escapeHtml(rota.codigo || rota.id || '')}</strong>
                <button type="button" class="mf-btn mf-btn--ghost" id="btnFecharDetalheManifesto">Fechar</button>
            </div>
            <div style="padding:16px;display:grid;gap:14px;">
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;font-size:12px;">
                    <div><strong>Data:</strong> ${escapeHtml(formatarDataBR(rota.data_rota))}</div>
                    <div><strong>Unidade:</strong> ${escapeHtml(rota.unidade_emissora || '—')}</div>
                    <div><strong>Motorista:</strong> ${escapeHtml(motoristaDaRota(rota) || '—')}</div>
                    <div><strong>Ajudante:</strong> ${escapeHtml(rota.ajudante_nome || '—')}</div>
                    <div><strong>Equipe:</strong> ${escapeHtml(rota.equipe_nome || '—')}</div>
                    <div><strong>Veículo:</strong> ${escapeHtml(rota.veiculo_placa || veiculo?.placa || '—')}</div>
                    <div><strong>Semirreboque:</strong> ${escapeHtml(semireboque?.placa || '—')}</div>
                    <div><strong>Gerenciadora:</strong> ${escapeHtml(rota.gerenciadora || '—')}</div>
                    <div><strong>KM:</strong> ${escapeHtml(`${rota.km_inicial ?? '—'} / ${rota.km_final ?? '—'}`)}</div>
                    <div><strong>Saída prevista:</strong> ${escapeHtml(rota.saida_prevista || '—')}</div>
                    <div><strong>Chegada prevista:</strong> ${escapeHtml(rota.chegada_prevista || '—')}</div>
                </div>
                <div style="font-size:12px;"><strong>Observações:</strong> ${escapeHtml(rota.observacoes || '—')}</div>
                <table class="mf-table" style="min-width:0;">
                    <thead>
                        <tr>
                            <th>Seq.</th>
                            <th>Pedido</th>
                            <th>Cliente</th>
                            <th>Cidade</th>
                            <th>Tipo</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${paradas.map((parada) => `
                            <tr>
                                <td>${parada.sequencia}</td>
                                <td>${escapeHtml(parada.pedido?.numero_nota || parada.pedido?.pedido_web || parada.pedido?.id || '—')}</td>
                                <td>${escapeHtml(parada.pedido?.cliente || '—')}</td>
                                <td>${escapeHtml(parada.pedido?.cidade || '—')}</td>
                                <td>${escapeHtml(String(parada.pedido?.tipo_operacao || 'ENTREGA').toUpperCase())}</td>
                                <td>${escapeHtml(parada.status || 'PENDENTE')}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
                <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
                    <button type="button" class="mf-btn mf-btn--ghost" id="btnEditarDetalheManifesto">Editar</button>
                    <button type="button" class="mf-btn mf-btn--ghost" id="btnExcluirDetalheManifesto">Excluir</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('btnFecharDetalheManifesto')?.addEventListener('click', fecharModalManifesto);
    document.getElementById('btnEditarDetalheManifesto')?.addEventListener('click', async () => {
        fecharModalManifesto();
        await abrirEditarManifesto(rota);
    });
    document.getElementById('btnExcluirDetalheManifesto')?.addEventListener('click', async () => {
        await excluirManifesto(rota);
    });
    modal.addEventListener('click', (event) => {
        if (event.target === modal) fecharModalManifesto();
    });
}

async function excluirManifesto(rota) {
    const rotaAtual = typeof rota === 'object' && rota ? rota : rotaPorId(rota);
    if (!rotaAtual) {
        showToast('Manifesto não encontrado.', 'error');
        return;
    }
    if (!confirm(`Deseja realmente excluir o manifesto ${rotaAtual.codigo || rotaAtual.id}?`)) {
        return;
    }
    try {
        await api.request(`/roteirizacao/rotas/${rotaAtual.id}/`, 'DELETE');
        if (String(state.manifestoEditandoId) === String(rotaAtual.id)) {
            fecharFormManifesto();
        }
        fecharModalManifesto();
        showToast('Manifesto excluído com sucesso.', 'success');
        await carregarDados();
    } catch (err) {
        showToast(err?.message || 'Não foi possível excluir o manifesto.', 'error');
    }
}

function normalizarPedidoForm(pedido) {
    return {
        id: pedido.id,
        numero: pedido.numero_nota || pedido.pedido_web || pedido.id,
        emissao: formatarDataBR(pedido.criado_em || hojeISO()),
        destinatario: pedido.cliente || pedido.destinatario?.nome || '—',
        remetente: pedido.loja || pedido.emitente?.nome || '—',
        cidade: pedido.cidade || pedido.destinatario?.cidade || '—',
        volumes: Number(pedido.volume_total || pedido.volumes || 0) || 0,
        peso: Number(pedido.peso_total || 0) || 0,
        valor: Number(pedido.valor_total || 0) || 0,
    };
}

function adicionarPedidoAoForm(tipo) {
    const selectId = tipo === 'coleta' ? 'incEmissaoColeta' : 'incEmissaoEntrega';
    const filtroId = tipo === 'coleta' ? 'incBuscaColeta' : 'incBuscaEntrega';
    const selecionado = document.getElementById(selectId)?.value;
    const termo = document.getElementById(filtroId)?.value;
    const pedido = (state.pedidosLivres || []).find((p) => String(p.id) === String(selecionado))
        || emissoesDisponiveis(termo)[0];
    if (!pedido) {
        showToast('Selecione uma emissão já realizada.', 'info');
        return;
    }
    const escolhido = normalizarPedidoForm(pedido);
    if (tipo === 'coleta') state.formColetas.push(escolhido);
    else state.formEntregas.push(escolhido);
    preencherSelectEmissoes('incEmissaoEntrega', 'incBuscaEntrega');
    preencherSelectEmissoes('incEmissaoColeta', 'incBuscaColeta');
    renderFormTabelas();
}

function removerPedidoDoForm(tipo, id) {
    if (tipo === 'coleta') state.formColetas = state.formColetas.filter((p) => String(p.id) !== String(id));
    else state.formEntregas = state.formEntregas.filter((p) => String(p.id) !== String(id));
    preencherSelectEmissoes('incEmissaoEntrega', 'incBuscaEntrega');
    preencherSelectEmissoes('incEmissaoColeta', 'incBuscaColeta');
    renderFormTabelas();
}

function renderFormTabelas() {
    const entBody = document.getElementById('incEntregasBody');
    const colBody = document.getElementById('incColetasBody');
    if (entBody) {
        entBody.innerHTML = state.formEntregas.length
            ? state.formEntregas.map((p) => `
                <tr>
                    <td>${p.numero}</td>
                    <td>${p.emissao}</td>
                    <td></td>
                    <td></td>
                    <td>${p.destinatario}</td>
                    <td>${p.cidade}</td>
                    <td>0</td>
                    <td>${p.volumes}</td>
                    <td>${p.peso.toFixed(2)}</td>
                    <td>${p.valor.toFixed(2)}</td>
                    <td>${p.valor.toFixed(2)}</td>
                    <td><button type="button" class="mf-btn mf-btn--ghost" data-del-ent="${p.id}">✕</button></td>
                </tr>`).join('')
            : '<tr><td class="mf-empty" colspan="12">Nenhuma emissão incluída. Selecione uma minuta já emitida e clique em + MAIS +.</td></tr>';
        entBody.querySelectorAll('[data-del-ent]').forEach((btn) => {
            btn.addEventListener('click', () => removerPedidoDoForm('entrega', btn.dataset.delEnt));
        });
    }
    if (colBody) {
        colBody.innerHTML = state.formColetas.length
            ? state.formColetas.map((p) => `
                <tr>
                    <td>${p.numero}</td>
                    <td>${p.emissao}</td>
                    <td>COLETA</td>
                    <td>${p.remetente}</td>
                    <td>${p.cidade}</td>
                    <td>${p.numero}</td>
                    <td>0</td>
                    <td>${p.volumes}</td>
                    <td>${p.peso.toFixed(2)}</td>
                    <td>${p.valor.toFixed(2)}</td>
                    <td><button type="button" class="mf-btn mf-btn--ghost" data-del-col="${p.id}">✕</button></td>
                </tr>`).join('')
            : '<tr><td class="mf-empty" colspan="11">Nenhuma coleta incluída.</td></tr>';
        colBody.querySelectorAll('[data-del-col]').forEach((btn) => {
            btn.addEventListener('click', () => removerPedidoDoForm('coleta', btn.dataset.delCol));
        });
    }
    const todos = [...state.formEntregas, ...state.formColetas];
    const volumes = todos.reduce((acc, p) => acc + (Number(p.volumes) || 0), 0);
    const peso = todos.reduce((acc, p) => acc + (Number(p.peso) || 0), 0);
    document.getElementById('incVol').value = String(volumes || 0);
    document.getElementById('incPeso').value = peso.toFixed(2);
    document.getElementById('incFrete').value = '0.00';
    document.getElementById('incQtdEnt').value = String(state.formEntregas.length);
    document.getElementById('incQtdCol').value = String(state.formColetas.length);
}

async function salvarFormManifesto(event) {
    event.preventDefault();
    const veiculo = document.getElementById('incVeiculo')?.value;
    const motoristaId = document.getElementById('incMotorista')?.value;
    const ajudanteIds = Array.from(document.getElementById('incAjudantes')?.selectedOptions || [])
        .map((option) => Number(option.value)).filter(Number.isInteger);
    const ajudanteId = ajudanteIds[0] || '';
    if (!veiculo) {
        showToast('Selecione o veículo do cadastro.', 'error');
        return;
    }
    if (!motoristaId) {
        showToast('Selecione o motorista do cadastro.', 'error');
        return;
    }
    const motorista = state.funcionarios.find((f) => String(f.id) === String(motoristaId));
    const ajudante = state.funcionarios.find((f) => String(f.id) === String(ajudanteId));
    if (!motorista?.usuario_id) {
        showToast('Este motorista precisa de usuário de acesso ao aplicativo. Cadastre o login em Colaboradores.', 'error');
        return;
    }
    const equipeSelecionada = equipePorId(document.getElementById('incEquipe')?.value);
    const equipeDoMotorista = equipeSelecionada || state.equipes.find((eq) => (
        String(eq.motorista) === String(motorista?.usuario_id || '') ||
        String(eq.motorista_nome || '').toLowerCase() === nomeFuncionario(motorista || {}).toLowerCase()
    ));
    const ids = [...state.formEntregas, ...state.formColetas].map((p) => p.id);
    if (!ids.length) {
        showToast('Inclua ao menos uma entrega ou coleta.', 'error');
        return;
    }
    try {
        const payload = {
            data_rota: document.getElementById('incSaidaData')?.value || hojeISO(),
            veiculo: Number(veiculo),
            unidade_emissora: document.getElementById('incUnidade')?.value || '',
            semireboque: document.getElementById('incSemi')?.value ? Number(document.getElementById('incSemi').value) : null,
            gerenciadora: document.getElementById('incGerenciadora')?.value || '',
            km_inicial: Number(document.getElementById('incKmIni')?.value || 0),
            km_final: Number(document.getElementById('incKmFim')?.value || 0),
            saida_prevista: combinarDataHora(
                document.getElementById('incSaidaData')?.value,
                document.getElementById('incSaidaHora')?.value
            ),
            chegada_prevista: combinarDataHora(
                document.getElementById('incChegadaData')?.value,
                document.getElementById('incChegadaHora')?.value
            ),
            motorista: Number(motorista.usuario_id),
            ajudante: ajudante?.usuario_id ? Number(ajudante.usuario_id) : null,
            ajudantes: ajudanteIds,
            equipe: equipeDoMotorista ? equipeDoMotorista.id : null,
            observacoes: [
                `Unidade ${document.getElementById('incUnidade')?.value || ''}`,
                `Motorista ${nomeFuncionario(motorista || { nome: '' })}`,
                `Ajudantes ${ajudanteIds.map((id) => nomeFuncionario(state.funcionarios.find((f) => Number(f.id) === id) || {})).join(', ') || 'NENHUM'}`,
                `KM ${document.getElementById('incKmIni')?.value || 0}-${document.getElementById('incKmFim')?.value || 0}`,
            ].join('; '),
        };
        if (!state.manifestoEditandoId) {
            payload.codigo = `MF-${hojeISO().replace(/-/g, '')}-${veiculo}-${Date.now().toString().slice(-4)}`;
            payload.status = 'PLANEJADA';
        } else {
            payload.pedido_ids = ids;
        }

        const rota = state.manifestoEditandoId
            ? await api.request(`/roteirizacao/rotas/${state.manifestoEditandoId}/`, 'PATCH', payload)
            : await api.request('/roteirizacao/rotas/', 'POST', payload);
        if (!state.manifestoEditandoId) {
            await api.request(`/roteirizacao/rotas/${rota.id}/adicionar_pedidos/`, 'POST', { pedido_ids: ids });
        }
        showToast(state.manifestoEditandoId ? 'Manifesto atualizado com sucesso.' : 'Manifesto incluído com sucesso.', 'success');
        fecharFormManifesto();
        await carregarDados();
    } catch (err) {
        showToast(err?.message || 'Não foi possível salvar o manifesto.', 'error');
    }
}

function exportarManifestosExcel() {
    const lista = state.manifestosFiltrados || filtrarManifestos();
    const header = ['COD', 'BASE', 'DATA', 'MOTORISTA', 'VEICULO', 'ROTA', 'SITUACAO', 'COLETAS', 'ENTREGAS', 'PROGRESSO'];
    const rows = lista.map((rota) => {
        const resumo = resumoParadas(rota);
        return [
            rota.id,
            rota.unidade_emissora || '—',
            formatarDataBR(rota.data_rota),
            motoristaDaRota(rota),
            rota.veiculo_placa || '',
            rota.codigo || '',
            situacaoLabel(rota.status),
            resumo.coletas,
            resumo.entregas,
            `${resumo.progresso}%`,
        ].join(';');
    });
    const csv = [header.join(';'), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `manifestos-frota-propria-${hojeISO()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

async function registrarSaidaEfetiva() {
    const ids = idsManifestosSelecionados();
    if (!ids.length) {
        showToast('Selecione ao menos um manifesto para registrar a saída efetiva.', 'info');
        return;
    }
    try {
        await Promise.all(ids.map((id) => api.request(`/roteirizacao/rotas/${id}/`, 'PATCH', { status: 'EM_ANDAMENTO' })));
        showToast('Saída efetiva registrada.', 'success');
        await carregarDados();
    } catch (err) {
        showToast(err?.message || 'Não foi possível registrar a saída efetiva.', 'error');
    }
}

function atualizarStats() {
    const totalBacklog = document.querySelectorAll('#list-col-backlog .kanban-card').length;
    const badgeBacklog = document.getElementById('badge-col-backlog');
    if (badgeBacklog) badgeBacklog.textContent = totalBacklog;

    let totalEmRota = 0;
    let veiculosAtivos = 0;

    veiculosDaView().forEach(v => {
        const lista = document.getElementById(`list-col-veiculo-${v.id}`);
        const badge = document.getElementById(`badge-col-veiculo-${v.id}`);
        if (lista && badge) {
            const qtdCardsReais = lista.querySelectorAll('.kanban-card').length;
            badge.textContent = qtdCardsReais;
            totalEmRota += qtdCardsReais;
            if (qtdCardsReais > 0) veiculosAtivos += 1;
        }
    });

    const totalConcluidos = state.pedidos.filter(p => {
        const status = String(p?.status || '').toUpperCase();
        return ['CONCLUIDO', 'CONCLUÍDO', 'ENTREGUE', 'FINALIZADO', 'ENTREGA_REALIZADA'].includes(status);
    }).length;

    const statBacklogEl = document.getElementById('statBacklog');
    const statEmRotaEl = document.getElementById('statEmRota');
    const statConcluidosEl = document.getElementById('statConcluidos');
    const statVeiculosEl = document.getElementById('statVeiculos');

    if (statBacklogEl) statBacklogEl.textContent = String(totalBacklog);
    if (statEmRotaEl) statEmRotaEl.textContent = String(totalEmRota);
    if (statConcluidosEl) statConcluidosEl.textContent = String(totalConcluidos);
    if (statVeiculosEl) statVeiculosEl.textContent = String(veiculosAtivos);
}