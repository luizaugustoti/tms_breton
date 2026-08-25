@echo off
setlocal
chcp 65001 >nul

:: ============================================================
:: TMS BRETON - Iniciador
:: Comandos: start | stop | restart | status
:: ============================================================

set "BACKEND=C:\Breton_TMS\backend"
set "VENV=%BACKEND%\.venv\Scripts\python.exe"
set "PORTA=8002"
set "URL=http://127.0.0.1:%PORTA%/"

:: --- Comando ---
set "COMANDO=%~1"
if "%COMANDO%"=="" set "COMANDO=start"

:: ============================================================
:: COMANDO: STOP
:: ============================================================
if /I "%COMANDO%"=="stop" goto :parar
if /I "%COMANDO%"=="restart" goto :reiniciar
if /I "%COMANDO%"=="status" goto :ver_status

:: ============================================================
:: COMANDO: START
:: ============================================================
if /I "%COMANDO%"=="start" goto :iniciar

echo [ERRO] Comando desconhecido: %COMANDO%
echo Use: start, stop, restart ou status
pause
exit /b 1

:: ============================================================
:: INICIAR SERVIDOR
:: ============================================================
:iniciar
echo.
echo ============================================
echo TMS BRETON - INICIANDO
echo ============================================
echo.

:: --- Verifica Python ---
echo [PASSO 1] Verificando Python...
where py >nul 2>&1
if %ERRORLEVEL% EQU 0 (set "PY=py -3") else (
    where python >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo [ERRO] Python nao encontrado!
        pause
        exit /b 1
    )
    set "PY=python"
)
echo [OK] Python encontrado.

:: --- Cria venv ---
echo.
echo [PASSO 2] Verificando ambiente virtual...
if not exist "%VENV%" (
    echo [INFO] Criando venv...
    %PY% -m venv "%BACKEND%\.venv"
    if %ERRORLEVEL% NEQ 0 (
        echo [ERRO] Falha ao criar venv!
        pause
        exit /b 1
    )
    echo [OK] venv criado.
) else (
    echo [OK] venv ja existe.
)

:: --- Instala dependencias ---
echo.
echo [PASSO 3] Instalando dependencias...
"%VENV%" -m pip install -q --upgrade pip
"%VENV%" -m pip install -q -r "%BACKEND%\requirements.txt"
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao instalar dependencias!
    pause
    exit /b 1
)
echo [OK] Dependencias instaladas.

:: --- Migracoes ---
echo.
echo [PASSO 4] Aplicando migracoes...
pushd "%BACKEND%"
"%VENV%" manage.py migrate --run-syncdb >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    popd
    echo [ERRO] Falha nas migracoes!
    pause
    exit /b 1
)
popd
echo [OK] Migracoes aplicadas.

:: --- Verifica se ja roda ---
echo.
echo [PASSO 5] Verificando se ja esta rodando...
tasklist /FI "WINDOWTITLE eq TMS Breton - Servidor" 2>nul | findstr "python" >nul
if %ERRORLEVEL% EQU 0 (
    echo [AVISO] Servidor ja esta rodando!
    goto :abrir_navegador
)

:: --- Inicia servidor ---
echo.
echo [PASSO 6] Iniciando servidor na porta %PORTA%...
start "TMS Breton - Servidor" /MIN cmd /c "cd /d "%BACKEND%" && "%VENV%" -m waitress --listen=0.0.0.0:%PORTA% tms_backend.wsgi:application"

:: --- Aguarda ---
echo [INFO] Aguardando servidor iniciar...
timeout /t 4 /nobreak >nul

:: --- Abre navegador ---
:abrir_navegador
echo.
echo [PASSO 7] Abrindo navegador na tela de login...
start "" "%URL%"

echo.
echo ============================================
echo TMS BRETON INICIADO!
echo ============================================
echo.
echo Navegador aberto em: %URL%
echo.
echo Para parar o servidor:
echo   - Feche a janela "TMS Breton - Servidor"
echo   - Ou execute: iniciar_tms.bat stop
echo.
pause
exit /b 0

:: ============================================================
:: PARAR SERVIDOR
:: ============================================================
:parar
echo.
echo ============================================
echo TMS BRETON - PARANDO
echo ============================================
echo.

echo [INFO] Procurando processo do servidor...
set "PID_STOP="
for /f "tokens=2 delims=," %%a in ('wmic process where "CommandLine like '%%waitress%%listen=0.0.0.0:%PORTA%%%%'" get ProcessId /format:csv 2^>nul ^| findstr "[0-9]"') do (
    set "PID_STOP=%%a"
)

if not defined PID_STOP (
    echo [AVISO] Nenhum processo encontrado na porta %PORTA%.
    echo          O servidor pode ja estar parado.
    pause
    exit /b 0
)

echo [INFO] Encerrando processo PID %PID_STOP%...
taskkill /PID %PID_STOP% /F >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao encerrar processo.
    pause
    exit /b 1
)

echo [OK] TMS Breton parado com sucesso.
pause
exit /b 0

:: ============================================================
:: REINICIAR
:: ============================================================
:reiniciar
echo [INFO] Reiniciando TMS Breton...
call :parar
timeout /t 2 /nobreak >nul
goto :iniciar

:: ============================================================
:: STATUS
:: ============================================================
:ver_status
echo.
echo ============================================
echo TMS BRETON - STATUS
echo ============================================
echo.

set "PID_STATUS="
for /f "tokens=2 delims=," %%a in ('wmic process where "CommandLine like '%%waitress%%listen=0.0.0.0:%PORTA%%%%'" get ProcessId /format:csv 2^>nul ^| findstr "[0-9]"') do (
    set "PID_STATUS=%%a"
)

if defined PID_STATUS (
    echo [OK] TMS Breton esta RODANDO
    echo      PID: %PID_STATUS%
    echo      Porta: %PORTA%
    echo      URL: %URL%
) else (
    echo [INFO] TMS Breton esta PARADO
    echo        Porta %PORTA% esta livre.
)

pause
exit /b 0