@echo off
setlocal
cd /d "%~dp0"
set "UD=%~dp0userdata"
set "LOG=%UD%\logs\main.log"
set "OUT=%~dp0diag-result.txt"
if exist "%LOG%" del /q "%LOG%" >nul 2>&1
echo === LAUNCH (--no-sandbox --user-data-dir=userdata) === > "%OUT%"
echo %DATE% %TIME% >> "%OUT%"
start "" "%~dp0WardenBroadcast.exe" --no-sandbox --user-data-dir="%UD%"
timeout /t 8 /nobreak >nul
echo. >> "%OUT%"
echo === PROCESS === >> "%OUT%"
tasklist /FI "IMAGENAME eq WardenBroadcast.exe" >> "%OUT%" 2>&1
echo. >> "%OUT%"
echo === LOG (%LOG%) === >> "%OUT%"
if exist "%LOG%" (type "%LOG%" >> "%OUT%") else (echo [NO LOG - died before main.cjs] >> "%OUT%")
echo. >> "%OUT%"
echo === USERDATA === >> "%OUT%"
dir /b "%UD%" >> "%OUT%" 2>&1
echo. >> "%OUT%"
echo === ENV === >> "%OUT%"
set ELECTRON >> "%OUT%" 2>&1
echo. >> "%OUT%"
echo === GPU === >> "%OUT%"
wmic path win32_VideoController get name >> "%OUT%" 2>&1
echo. >> "%OUT%"
echo done.
start "" notepad "%OUT%"
