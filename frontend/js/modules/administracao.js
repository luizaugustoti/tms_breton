// frontend/js/modules/administracao.js
import '../api/api.js?v=15';

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadMockData();
    initDatabaseConfig();
});

function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');

            tabButtons.forEach(btn => btn.classList.remove('tab-btn--active'));
            tabContents.forEach(content => content.classList.remove('tab-content--active'));

            button.classList.add('tab-btn--active');
            document.getElementById(`tab-${tabId}`)?.classList.add('tab-content--active');
        });
    });

    const hashTab = (window.location.hash || '').replace('#', '');
    if (hashTab) {
        const target = document.querySelector(`.tab-btn[data-tab="${hashTab}"]`);
        if (target) target.click();
    }
}

function loadMockData() {
    const usuarios = [
        {
            nome: 'Administrador Breton',
            email: 'admin@breton.com.br',
            perfil: 'Admin Geral',
            ultimoAcesso: 'Hoje às 11:45',
            statusClass: 'badge--active',
            status: 'Ativo'
        },
        {
            nome: 'Carlos Eduardo Silva',
            email: 'carlos.motorista@breton.com.br',
            perfil: 'Motorista (App)',
            ultimoAcesso: 'Hoje às 10:12',
            statusClass: 'badge--active',
            status: 'Ativo'
        }
    ];

    renderTable('tableUsuariosBody', usuarios, row => `
        <td><strong>${row.nome}</strong><br><small style="color:var(--color-text-light);">${row.email}</small></td>
        <td><span class="badge badge--accent">${row.perfil}</span></td>
        <td>${row.ultimoAcesso}</td>
        <td><span class="badge ${row.statusClass}">${row.status}</span></td>
        <td><button class="btn" style="padding:4px 8px; font-size:0.75rem;">Editar Permissões</button></td>
    `);

    const logs = [
        {
            dataHora: '12/08/2026 11:30',
            usuario: 'admin@breton.com.br',
            acao: 'Emissão de CT-e nº 000.045.120',
            modulo: 'Documental / Fiscal',
            ip: '192.168.1.102'
        },
        {
            dataHora: '12/08/2026 10:05',
            usuario: 'admin@breton.com.br',
            acao: 'Aprovação de Rota Otimizada Cluster ZS',
            modulo: 'Roteirização',
            ip: '192.168.1.102'
        }
    ];

    renderTable('tableLogsBody', logs, row => `
        <td>${row.dataHora}</td>
        <td><strong>${row.usuario}</strong></td>
        <td>${row.acao}</td>
        <td>${row.modulo}</td>
        <td><span class="log-ip">${row.ip}</span></td>
    `);
}

function renderTable(tableId, data, rowTemplate) {
    const tbody = document.getElementById(tableId);
    if (!tbody) return;
    tbody.innerHTML = data.map(item => `<tr>${rowTemplate(item)}</tr>`).join('');
}

// Configuração MySQL via Modal
function initDatabaseConfig() {
    const modalDB = document.getElementById('modalConfigDB');
    const btnConfigDB = document.getElementById('btnConfigDB');
    const btnCloseModalDB = document.getElementById('btnCloseModalDB');
    const selectEnv = document.getElementById('db_environment');
    const formConfigDB = document.getElementById('formConfigDB');
    const btnTestarConexao = document.getElementById('btnTestarConexao');

    btnConfigDB?.addEventListener('click', () => {
        if (modalDB) modalDB.style.display = 'flex';
    });

    const closeModal = () => { if (modalDB) modalDB.style.display = 'none'; };
    btnCloseModalDB?.addEventListener('click', closeModal);
    modalDB?.addEventListener('click', (e) => {
        if (e.target === modalDB) closeModal();
    });

    selectEnv?.addEventListener('change', (e) => {
        const hostInput = document.getElementById('db_host');
        if (hostInput) {
            hostInput.value = e.target.value === 'local' ? 'localhost' : '';
        }
    });

    const getFormData = () => ({
        environment: selectEnv?.value || 'local',
        host: document.getElementById('db_host')?.value || 'localhost',
        port: document.getElementById('db_port')?.value || '3306',
        dbname: document.getElementById('db_name')?.value || '',
        user: document.getElementById('db_user')?.value || 'root',
        pass_key: document.getElementById('db_pass')?.value || ''
    });

    btnTestarConexao?.addEventListener('click', async () => {
        const payload = getFormData();
        if (!payload.host || !payload.dbname || !payload.user) {
            alert('⚠️ Preencha Host, Nome do Banco e Usuário para testar!');
            return;
        }

        btnTestarConexao.innerText = '⏳ Testando...';
        btnTestarConexao.disabled = true;

        try {
            const response = await fetch('/api/v1/administracao/test-db-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (response.ok) {
                alert('✅ ' + data.message);
            } else {
                alert('❌ ' + (data.detail || 'Falha na conexão com o MySQL.'));
            }
        } catch (error) {
            alert('❌ Erro de comunicação com o servidor backend.');
        } finally {
            btnTestarConexao.innerText = '🧪 Testar Conexão';
            btnTestarConexao.disabled = false;
        }
    });

    formConfigDB?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = getFormData();

        try {
            const response = await fetch('/api/v1/administracao/save-db-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (response.ok) {
                const lblTipoDB = document.getElementById('lblTipoDB');
                if (lblTipoDB) {
                    lblTipoDB.innerText = payload.environment === 'local' ? 'MySQL Local' : 'MySQL Nuvem';
                }
                alert('⚙️ ' + data.message);
                closeModal();
            } else {
                alert('❌ ' + (data.detail || 'Erro ao salvar configurações.'));
            }
        } catch (error) {
            alert('❌ Erro de comunicação ao salvar.');
        }
    });
}