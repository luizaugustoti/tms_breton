// frontend/js/modules/avaliacoes.js
import '../api/api.js?v=17';

document.addEventListener('DOMContentLoaded', () => {
    loadAllEvaluations();
    initFilterEvents();
    initPresentationMode();
});

// Lista completa de todas as avaliações registradas no sistema TMS Breton
const todasAvaliacoes = [
    {
        pedido: 'PED-8801',
        cliente: 'Loja Gabriel Monteiro (Showroom)',
        cidade: 'São Paulo/SP',
        data: '10/08/2026',
        notaGeral: '5.0 ★★★★★',
        pontualidade: '100% No Prazo',
        embalagem: 'Intacta (Madeira Nobre)',
        montagem: 'Impecável / Limpeza OK',
        item: 'Sofá Orgânico Customizado',
        comentario: 'Entrega pontual e equipe de montagem extremamente cuidadosa com o piso da loja. Excelente atendimento prestado.',
        podStatus: '📷 Assinatura & Foto OK'
    },
    {
        pedido: 'PED-8802',
        cliente: 'Residencial Alphaville (Sr. Fernando)',
        cidade: 'Barueri/SP',
        data: '11/08/2026',
        notaGeral: '4.8 ★★★★☆',
        pontualidade: '100% No Prazo',
        embalagem: 'Proteção Tripla Calacatta',
        montagem: 'Nivelamento Perfeito',
        item: 'Mesa Mármore Calacatta',
        comentario: 'A peça chegou em perfeito estado com embalagem especial de madeira. Ótimo trabalho da equipe de logística!',
        podStatus: '📷 Assinatura & Foto OK'
    },
    {
        pedido: 'PED-8803',
        cliente: 'Cobertura Jardins (Dra. Juliana)',
        cidade: 'São Paulo/SP',
        data: '12/08/2026',
        notaGeral: '5.0 ★★★★★',
        pontualidade: '100% No Prazo',
        embalagem: 'Acolchoado Especial Veludo',
        montagem: 'Sapatilhas & Luvas Utilizadas',
        item: 'Poltrona Curva Veludo Marsala',
        comentario: 'A equipe de montagem usou sapatilhas de proteção e deixou o ambiente impecável após a instalação.',
        podStatus: '📷 Assinatura & Foto OK'
    },
    {
        pedido: 'PED-8798',
        cliente: 'Residencial Mansões da Barra',
        cidade: 'Rio de Janeiro/RJ',
        data: '08/08/2026',
        notaGeral: '4.9 ★★★★★',
        pontualidade: '100% No Prazo',
        embalagem: 'Caixa de Madeira Reforçada',
        montagem: 'Montador Especialista',
        item: 'Aparador Vidro Bisotê',
        comentario: 'Transporte de longo percurso muito bem executado. Vidro entregue sem qualquer avaria.',
        podStatus: '📷 Assinatura & Foto OK'
    },
    {
        pedido: 'PED-8795',
        cliente: 'Loja Campinas Cambuí',
        cidade: 'Campinas/SP',
        data: '05/08/2026',
        notaGeral: '5.0 ★★★★★',
        pontualidade: '100% No Prazo',
        embalagem: 'Lona Térmica & Plastico Bolha',
        montagem: 'Showroom Montado em 2h',
        item: 'Conjunto Varanda Gourmet Breton',
        comentario: 'Recebimento de lote para novo showroom. Tudo em conformidade absoluta com o pedido de fabricação.',
        podStatus: '📷 Assinatura & Foto OK'
    },
    {
        pedido: 'PED-8790',
        cliente: 'Franquia Brasília Sudoeste',
        cidade: 'Brasília/DF',
        data: '02/08/2026',
        notaGeral: '4.7 ★★★★☆',
        pontualidade: '+10 min (Avisado antecipadamente)',
        embalagem: 'Embalagem Ecológica Reciclada',
        montagem: 'Concluído com Sucesso',
        item: 'Cama King Size Couro Conhaque',
        comentario: 'Motorista comunicou a pequena retenção no trânsito urbano com 1h de antecedência. Transparência nota 10.',
        podStatus: '📷 Assinatura & Foto OK'
    }
];

function loadAllEvaluations(data = todasAvaliacoes) {
    const tbody = document.getElementById('tableTodasAvaliacoesBody');
    const totalCount = document.getElementById('totalAvaliacoesCount');

    if (totalCount) totalCount.textContent = `${data.length} avaliações encontradas`;
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color: var(--color-text-light);">Nenhuma avaliação encontrada com o filtro selecionado.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(row => `
        <tr>
            <td>
                <strong>${row.pedido}</strong><br>
                <small style="color: var(--color-text-light);">${row.data}</small>
            </td>
            <td>
                <strong>${row.cliente}</strong><br>
                <small style="color: var(--color-accent);">${row.cidade}</small>
            </td>
            <td>
                <span class="badge-score">${row.notaGeral}</span><br>
                <small style="color: #2E7D32;">${row.pontualidade}</small>
            </td>
            <td>
                <strong>${row.item}</strong><br>
                <small style="color: var(--color-text-light);">${row.embalagem}</small>
            </td>
            <td>
                <div class="comment-box-full">
                    "${row.comentario}"
                </div>
            </td>
            <td>
                <span class="badge badge--active">${row.podStatus}</span>
            </td>
        </tr>
    `).join('');
}

function initFilterEvents() {
    const searchInput = document.getElementById('inputSearch');
    const filterSelect = document.getElementById('selectRatingFilter');

    function applyFilters() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const rating = filterSelect ? filterSelect.value : 'all';

        const filtered = todasAvaliacoes.filter(item => {
            const matchesQuery = 
                item.pedido.toLowerCase().includes(query) ||
                item.cliente.toLowerCase().includes(query) ||
                item.item.toLowerCase().includes(query) ||
                item.comentario.toLowerCase().includes(query) ||
                item.cidade.toLowerCase().includes(query);

            const matchesRating = 
                rating === 'all' || 
                (rating === '5' && item.notaGeral.includes('5.0')) ||
                (rating === '4' && item.notaGeral.includes('4.'));

            return matchesQuery && matchesRating;
        });

        loadAllEvaluations(filtered);
    }

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (filterSelect) filterSelect.addEventListener('change', applyFilters);
}

// Lógica de Modo de Apresentação (Tecla F11)
function initPresentationMode() {
    const btnPresentation = document.getElementById('btnPresentation');

    function togglePresentation() {
        document.body.classList.toggle('presentation-mode');

        if (document.body.classList.contains('presentation-mode')) {
            if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
            }
        } else {
            if (document.exitFullscreen && document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
            }
        }
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'F11') {
            e.preventDefault();
            togglePresentation();
        } else if (e.key === 'Escape') {
            if (document.body.classList.contains('presentation-mode')) {
                document.body.classList.remove('presentation-mode');
                if (document.exitFullscreen && document.fullscreenElement) {
                    document.exitFullscreen().catch(() => {});
                }
            }
        }
    });

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && document.body.classList.contains('presentation-mode')) {
            document.body.classList.remove('presentation-mode');
        }
    });
}
