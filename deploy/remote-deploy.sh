#!/usr/bin/env bash
# Clash Front MVP — idempotent server-side deploy/restart.
# Run on the EC2 box from the repo root (default ~/clashfront-mvp).
# Env overrides: APP_PORT (default 8130), APP_NAME (clashfront), WORLD_SEED, TICK_MS.
set -euo pipefail
cd "$(dirname "$0")/.."

APP_PORT="${APP_PORT:-8130}"
APP_NAME="${APP_NAME:-clashfront}"

# toolchain (EF boxes already run node+pm2; corepack ships with node>=16)
command -v pnpm >/dev/null 2>&1 || corepack enable
command -v pm2  >/dev/null 2>&1 || npm i -g pm2

pnpm install --frozen-lockfile
pnpm -r build

# keep data/save.json (world persistence) — never clobbered by deploys
# start-or-restart: `pm2 startOrRestart <script>` misparses a raw script as an ecosystem file
# ("Cannot read properties of undefined (reading 'deploy')"), so restart if the process exists
# else start fresh. --update-env picks up the exported PORT/WORLD_SEED/TICK_MS on both paths.
export PORT="$APP_PORT" WORLD_SEED="${WORLD_SEED:-mvp-july7}" TICK_MS="${TICK_MS:-5000}"
pm2 restart "$APP_NAME" --update-env 2>/dev/null \
  || pm2 start apps/server/dist/src/main.js --name "$APP_NAME" --update-env
pm2 save

sleep 2
curl -sf "http://127.0.0.1:${APP_PORT}/api/world" >/dev/null \
  && echo "✅ ${APP_NAME} healthy on :${APP_PORT}" \
  || { echo "❌ health check failed"; pm2 logs "$APP_NAME" --lines 30 --nostream; exit 1; }
