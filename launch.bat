@echo off
cd /d "%~dp0"
echo ================================================
echo   Agentic MCP Gateway - Starting...
echo ================================================
echo.
echo [1/2] Installing dependencies...
call npm install --silent 2>nul
echo.
echo [2/2] Starting server...
node index.js
pause
