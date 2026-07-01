@echo off
title EtherFantasy MOBA - Local PeerJS Server (optional)
echo ==========================================================
echo   OPTIONAL local PeerJS signaling server (port 9000).
echo   Use this for LAN play without internet. If you skip it,
echo   the game uses the free PeerJS cloud automatically.
echo.
echo   The game auto-detects this server when it's running.
echo   (Press Ctrl+C to stop.)
echo ==========================================================
echo.
npx --yes -p peer peerjs --port 9000 || (
  echo.
  echo Node.js / npx not found or download failed.
  echo Install Node.js from https://nodejs.org then rerun this.
  pause
)
