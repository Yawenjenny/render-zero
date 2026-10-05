@echo off
rem Double-click to play Render Zero. Keep this window open while playing; close it to stop.
rem Uses the web server built into Windows, so nothing needs to be installed.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\serve.ps1"
if errorlevel 1 pause
