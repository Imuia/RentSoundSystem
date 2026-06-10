@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0telecharger_tous_les_logos.ps1"
pause
