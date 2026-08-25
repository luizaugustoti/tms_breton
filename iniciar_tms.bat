@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "BACKEND_DIR=%ROOT_DIR%\backend"
set "FRONTEND_DIR=%ROOT_DIR%\frontend"
set "VENV_DIR=%BACKEND_DIR%\.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "LOG_DIR=%ROOT_DIR%\logs"
set "BACKEND_LOG_OUT=%LOG_DIR%\backend.out.log"
set "BACKEND_LOG_ERR=%LOG_DIR%\backend.err.log"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1

if not exist "%BACKEND_DIR%\manage.py" (
    echo [ERRO] Pasta backend invalida: "%BACKEND_DIR%"
    exit /b 1
)

if not exist "%FRONTEND_DIR%" (
    echo [ERRO] Pasta frontend invalida: "%FRONTEND_DIR%"
    exit /b 1
)

where py >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set "BOOTSTRAP_PY=py -3"
) else (
    where python >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo [ERRO] Python nao encontrado no PATH.
        exit /b 1
    )
    set "BOOTSTRAP_PY=python"
)

if not exist "%VENV_PY%" (
    echo [INFO] Criando ambiente virtual...
    %BOOTSTRAP_PY% -m venv "%VENV_DIR%"
    if %ERRORLEVEL% NEQ 0 (
        echo [ERRO] Falha ao criar ambiente virtual.
        exit /b 1
    )
)

echo [INFO] Instalando/atualizando dependencias...
"%VENV_PY%" -m pip install --upgrade pip
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao atualizar pip.
    exit /b 1
)

"%VENV_PY%" -m pip install -r "%BACKEND_DIR%\requirements.txt"
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao instalar requirements.
    exit /b 1
)

echo [INFO] Aplicando migracoes...
pushd "%BACKEND_DIR%"
"%VENV_PY%" manage.py migrate
if %ERRORLEVEL% NEQ 0 (
    popd
    echo [ERRO] Falha ao executar migracoes.
    exit /b 1
)
popd

echo [INFO] Encerrando servidor antigo na porta 8002...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ids = Get-NetTCPConnection -LocalPort 8002 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach($id in $ids){Stop-Process -Id $id -Force -ErrorAction SilentlyContinue}"

echo [INFO] Iniciando TMS (waitress:8002, frontend + API)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%VENV_PY%' -WorkingDirectory '%BACKEND_DIR%' -ArgumentList '-m','waitress','--listen=0.0.0.0:8002','tms_backend.wsgi:application' -WindowStyle Hidden -RedirectStandardOutput '%BACKEND_LOG_OUT%' -RedirectStandardError '%BACKEND_LOG_ERR%'"
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao iniciar o TMS.
    exit /b 1
)

echo [INFO] Aguardando servico iniciar...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 6" >nul

echo [INFO] Abrindo sistema no navegador...
start "" "http://127.0.0.1:8002/"

echo [OK] Sistema iniciado.
exit /b 0
