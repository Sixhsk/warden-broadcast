@echo off
cd /d "%~dp0"
start "" "%~dp0WardenBroadcast.exe" --no-sandbox --user-data-dir="%~dp0userdata"
