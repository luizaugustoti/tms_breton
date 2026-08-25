import { api, authStorage, candidateApiBases, setApiBaseUrl } from '../api/api.js?v=17';

document.addEventListener('DOMContentLoaded', () => {
    const redirectByRole = (user) => {
        const role = (user?.role || user?.cargo || '').toString().trim();
        const normalizedRole = role.toLowerCase();

        if (normalizedRole === 'motorista' || normalizedRole === 'ajudante') {
            window.location.replace('./pages/painel-motorista.html');
            return;
        }

        window.location.replace('./pages/dashboard.html');
    };

    // Redireciona automaticamente se já houver um token
    if (authStorage.getToken()) {
        const user = authStorage.getUser();
        redirectByRole(user);
        return;
    }

    const form = document.getElementById('loginForm');
    const alertBox = document.getElementById('loginAlert');
    const btnLogin = document.getElementById('btnLogin');

    // Verifica se há alguma mensagem de expiração na URL
    const urlParams = new URLSearchParams(window.location.search);
    const msg = urlParams.get('message');
    if (msg) {
        showError(msg, 'warning');
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        if (!username || !password) return;

        // Reseta estado
        alertBox.style.display = 'none';
        btnLogin.disabled = true;
        btnLogin.textContent = 'Autenticando...';

        try {
            let response = null;
            let lastError = null;
            for (const base of candidateApiBases()) {
                setApiBaseUrl(base);
                try {
                    response = await api.request('/auth/login/', 'POST', { username, password });
                    lastError = null;
                    break;
                } catch (err) {
                    lastError = err;
                    if (err?.status && err.status !== 404) break;
                }
            }
            if (lastError) throw lastError;
            
            if (response && response.access) {
                // Sucesso: Salva o access token
                authStorage.setToken(response.access);
                
                // Salva os dados do usuário devolvidos pelo CustomTokenObtainPairView
                if (response.user) {
                    authStorage.setUser(response.user);
                }

                const user = response.user || authStorage.getUser();
                redirectByRole(user);
            } else {
                showError('Resposta inválida do servidor.', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            // Pode ser 401 Unauthorized ou servidor offline
            if (error.status === 401) {
                showError('Usuário ou senha inválidos. Tente novamente.', 'error');
            } else if (error.status === 404 || error.status === 503) {
                showError(error.message || 'A API Django não está no ar neste site. No servidor precisa existir o backend Python, não só a pasta frontend. No PC use iniciar_tms.bat e abra http://127.0.0.1:8002/', 'error');
            } else {
                showError('Erro ao conectar com o servidor. Verifique sua conexão.', 'error');
            }
        } finally {
            // Restaura o botão caso tenha dado erro
            if (alertBox.style.display !== 'none') {
                btnLogin.disabled = false;
                btnLogin.textContent = 'Entrar no Sistema';
            }
        }
    });

    function showError(msg, type = 'error') {
        alertBox.textContent = msg;
        alertBox.style.display = 'block';
        
        if (type === 'error') {
            alertBox.style.backgroundColor = '#fdf0ee';
            alertBox.style.color = '#721c24';
            alertBox.style.border = '1px solid #f5c6cb';
        } else {
            alertBox.style.backgroundColor = '#fff3cd';
            alertBox.style.color = '#856404';
            alertBox.style.border = '1px solid #ffeeba';
        }
    }
});