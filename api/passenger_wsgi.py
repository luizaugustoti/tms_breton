"""WSGI do TMS para Apache/Passenger (cPanel > Setup Python App).

A aplicacao deve apontar para esta pasta `api`, com URL publica:

  /Sistema/gerenciador-de-ambientes/TransCorp/Operacional/Breton_TMS/api

Assim o login do frontend (ja hospedado em /frontend) chama:

  .../Breton_TMS/api/v1/auth/login/
"""
import glob
import os
import sys

API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(API_DIR)
BACKEND_DIR = os.path.join(PROJECT_DIR, 'backend')


def _activate_virtualenv():
    candidates = [
        os.path.join(BACKEND_DIR, '.venv'),
        os.path.join(PROJECT_DIR, 'virtualenv'),
        os.path.join(PROJECT_DIR, '.venv'),
        os.environ.get('VIRTUAL_ENV', ''),
    ]
    for venv in candidates:
        if not venv or not os.path.isdir(venv):
            continue
        site_packages = glob.glob(os.path.join(venv, 'lib', 'python*', 'site-packages'))
        site_packages += glob.glob(os.path.join(venv, 'Lib', 'site-packages'))
        for path in site_packages:
            if path not in sys.path:
                sys.path.insert(0, path)
        interp = os.path.join(venv, 'bin', 'python')
        if os.name == 'nt':
            interp = os.path.join(venv, 'Scripts', 'python.exe')
        if os.path.isfile(interp) and os.path.abspath(sys.executable) != os.path.abspath(interp):
            os.execl(interp, interp, *sys.argv)


_activate_virtualenv()
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
os.chdir(BACKEND_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'tms_backend.settings')
os.environ.setdefault('DJANGO_DEBUG', 'False')
os.environ.setdefault('DJANGO_ALLOWED_HOSTS', 'holdingpacheco.com.br,www.holdingpacheco.com.br,127.0.0.1,localhost')

from tms_backend.wsgi import application as django_application  # noqa: E402


def application(environ, start_response):
    """Ajusta SCRIPT_NAME/PATH_INFO quando o Passenger monta so a pasta /api."""
    script = (environ.get('SCRIPT_NAME') or '').rstrip('/')
    path = environ.get('PATH_INFO') or '/'
    if script.endswith('/api'):
        environ['SCRIPT_NAME'] = script[:-4]
        if not path.startswith('/api'):
            environ['PATH_INFO'] = '/api' + (path if path.startswith('/') else '/' + path)
    return django_application(environ, start_response)
