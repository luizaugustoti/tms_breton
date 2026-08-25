"""Ponto de entrada WSGI na raiz do projeto (cPanel Setup Python App).

Use este arquivo se a aplicacao Python apontar para a pasta Breton_TMS inteira.
Se a URL publica for .../Breton_TMS/api, prefira api/passenger_wsgi.py.
"""
import glob
import os
import sys

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
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

from tms_backend.wsgi import application  # noqa: E402
