@echo off
setlocal
cd /d %~dp0

set "NODE_EXE="
set "NPM_CLI="
call :resolve_node

echo.
echo ⚓ ClawBox starting...

if not defined NODE_EXE (
  echo.
  echo Node.js not found. Running setup.ps1 first...
  powershell -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
  if errorlevel 1 (
    echo.
    echo Setup failed. Please check the messages above.
    pause
    exit /b 1
  )
  call :resolve_node
)

if not defined NODE_EXE (
  echo.
  echo Node.js is still not available after setup.
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo Installing dependencies...
  call :resolve_npm
  if not defined NPM_CLI (
    echo.
    echo npm was not found next to node.exe.
    pause
    exit /b 1
  )
  call "%NODE_EXE%" "%NPM_CLI%" install --registry https://registry.npmjs.org/
  if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo.
echo Launching ClawBox on http://127.0.0.1:3456 ...
set "CLAWBOX_NO_AUTO_OPEN=1"
start "" http://127.0.0.1:3456
"%NODE_EXE%" src\server.js
exit /b %errorlevel%

:resolve_node
set "NODE_EXE="
for %%I in (node.exe) do if not defined NODE_EXE set "NODE_EXE=%%~$PATH:I"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\nodejs\node.exe"
if not defined NODE_EXE if exist "%USERPROFILE%\scoop\apps\nodejs-lts\current\node.exe" set "NODE_EXE=%USERPROFILE%\scoop\apps\nodejs-lts\current\node.exe"
if not defined NODE_EXE if exist "%USERPROFILE%\scoop\apps\nodejs\current\node.exe" set "NODE_EXE=%USERPROFILE%\scoop\apps\nodejs\current\node.exe"
goto :eof

:resolve_npm
set "NPM_CLI="
if not defined NODE_EXE goto :eof
for %%I in ("%NODE_EXE%") do set "NODE_DIR=%%~dpI"
if exist "%NODE_DIR%node_modules\npm\bin\npm-cli.js" set "NPM_CLI=%NODE_DIR%node_modules\npm\bin\npm-cli.js"
goto :eof
