import os
import sys
from waitress import serve
from tms_backend.wsgi import application

def main():
    """
    Script de inicialização do servidor de produção Waitress.
    Ideal para hospedar o Django no Windows com alta performance.
    """
    # Assegura que o módulo de configurações do Django esteja carregado
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'tms_backend.settings')
    
    # Adiciona a pasta atual ao sys.path para importações relativas funcionarem
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.append(current_dir)
        
    print("🚀 Iniciando Servidor TMS Breton (Modo Produção/Waitress)")
    print("📡 Escutando conexões em: http://0.0.0.0:8000")
    print("Pressione CTRL+C para encerrar.")
    
    # Serve a aplicação WSGI
    # host='0.0.0.0' expõe a aplicação para a rede local (se o firewall permitir)
    serve(application, host='0.0.0.0', port=8000, threads=4)

if __name__ == '__main__':
    main()
