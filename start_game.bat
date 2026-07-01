@echo off
title EtherFantasy MOBA - Local Server
cd /d "%~dp0"
echo ==========================================================
echo   ETHERFANTASY MOBA - starting local server...
echo   When it says the server line, open this in your browser:
echo.
echo        http://localhost:8000/
echo.
echo   (Press Ctrl+C in this window to stop the server.)
echo ==========================================================
echo.
py serve.py 2>nul || python serve.py 2>nul || py -m http.server 8000 2>nul || python -m http.server 8000 2>nul || (
  echo Python was not found.
  echo Install Python from https://python.org  -OR-  run:  npx http-server -p 8000
  pause
)
