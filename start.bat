@echo off
echo ================================================
echo   Starting Agentic MCP Gateway...
echo ================================================
echo.

cd /d "d:\Downloads\agentic-mcp-gateway-modified"

echo [1/2] Installing dependencies...
call npm install
echo.

echo [2/2] Starting server...
node index.js

pause
