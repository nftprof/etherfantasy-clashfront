#!/usr/bin/env bash
# Clash Front — ISOLATED cfx staging instance (cfx.etherfantasy.com → :8131).
#
# A SEPARATE pm2 app + working dir + world save from the live game on :8130. Deploy freely here;
# restarting clashfront-cfx never touches the live `clashfront` process. PG login and the battle
# engine are OFF on cfx (dev name-only join, instant battle resolves) so this is a pure
# look-and-feel preview with zero coupling to the shared MOBA/PG services.
set -euo pipefail
cd "$(dirname "$0")/.."

APP_PORT="${APP_PORT:-8131}"
APP_NAME="${APP_NAME:-clashfront-cfx}"

command -v pnpm >/dev/null 2>&1 || corepack enable
command -v pm2  >/dev/null 2>&1 || npm i -g pm2

pnpm install --frozen-lockfile
pnpm -r build

# Isolated runtime: own port, own world save (never the live data/save.json).
export PORT="$APP_PORT" WORLD_SEED="${WORLD_SEED:-mvp-july7}" TICK_MS="${TICK_MS:-5000}"
export SAVE_PATH="${SAVE_PATH:-$PWD/data/save.cfx.json}"
# PG_APP_KEY and BATTLE_ENGINE_URL intentionally UNSET → PG login off, instant resolves.

pm2 restart "$APP_NAME" --update-env 2>/dev/null \
  || pm2 start apps/server/dist/src/main.js --name "$APP_NAME" --update-env \
       --max-restarts 1000 --restart-delay 3000 --time
pm2 save

sleep 2
curl -sf "http://127.0.0.1:${APP_PORT}/api/world" >/dev/null \
  && echo "✅ ${APP_NAME} healthy on :${APP_PORT}" \
  || { echo "❌ cfx health check failed"; pm2 logs "$APP_NAME" --lines 30 --nostream; exit 1; }
