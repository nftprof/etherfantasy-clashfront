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

# Battle-bridge auth (M1.5 smoke test): the MOBA match server shares this box; the
# secret lives at ~/.cf_bridge_secret (chmod 600, provisioned by the MOBA session).
# Bridge stays 503-disabled when the file is absent. Env override wins for local runs.
if [ -z "${BRIDGE_SECRET:-}" ] && [ -f "$HOME/.cf_bridge_secret" ]; then
  BRIDGE_SECRET="$(cat "$HOME/.cf_bridge_secret")"
fi
if [ -n "${BRIDGE_SECRET:-}" ]; then export BRIDGE_SECRET; fi

# External M1 battle engine (docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md): token +
# HMAC secret live at ~/.cf_battle_api_token / ~/.cf_battle_hmac_secret
# (chmod 600, provisioned by the engine session — same pattern as BRIDGE_SECRET).
# Feature stays OFF (instant resolves) when BATTLE_ENGINE_URL ends up unset.
if [ -z "${CF_BATTLE_API_TOKEN:-}" ] && [ -f "$HOME/.cf_battle_api_token" ]; then
  CF_BATTLE_API_TOKEN="$(cat "$HOME/.cf_battle_api_token")"
fi
if [ -n "${CF_BATTLE_API_TOKEN:-}" ]; then export CF_BATTLE_API_TOKEN; fi
if [ -z "${CF_BATTLE_HMAC_SECRET:-}" ] && [ -f "$HOME/.cf_battle_hmac_secret" ]; then
  CF_BATTLE_HMAC_SECRET="$(cat "$HOME/.cf_battle_hmac_secret")"
fi
if [ -n "${CF_BATTLE_HMAC_SECRET:-}" ]; then export CF_BATTLE_HMAC_SECRET; fi
# Engine shares the box: default the allocate URL when both secret files exist.
if [ -z "${BATTLE_ENGINE_URL:-}" ] && [ -f "$HOME/.cf_battle_api_token" ] && [ -f "$HOME/.cf_battle_hmac_secret" ]; then
  BATTLE_ENGINE_URL="http://127.0.0.1:8140/internal/v1/matches/allocate"
fi
if [ -n "${BATTLE_ENGINE_URL:-}" ]; then export BATTLE_ENGINE_URL; fi

# Pentagon Games identity (docs/briefs/PG-IDENTITY.md): the app key is PUBLISHABLE
# (pk_ prefix — the browser sends it too), so it defaults right here; a
# ~/.cf_pg_app_key file (chmod 600 by convention) overrides it for rotation.
# Setting PG_APP_KEY turns the join overlay into the Pentagon sign-in form.
if [ -z "${PG_APP_KEY:-}" ] && [ -f "$HOME/.cf_pg_app_key" ]; then
  PG_APP_KEY="$(cat "$HOME/.cf_pg_app_key")"
fi
if [ -z "${PG_APP_KEY:-}" ]; then
  PG_APP_KEY="pk_live_3e996782bb03792b8787a02b2d076ec2"
fi
export PG_APP_KEY
if [ -n "${PG_API_URL:-}" ]; then export PG_API_URL; fi

# EF Masters roster gate (docs/09 §7, docs/briefs/PG-IDENTITY.md §3b): a PG-logged-in
# player commands only the Masters their wallet owns/rents. Base URL defaults to the
# live host inside the server; export an override if set. The box MUST be able to reach
# api.etherfantasy.com or every login silently falls back to the demo roster.
if [ -n "${MASTERS_API_URL:-}" ]; then export MASTERS_API_URL; fi

# Crash resilience: if the process ever DOES exit (despite the in-process
# uncaughtException/unhandledRejection guards in main.ts), pm2 must keep bringing
# it back and never give up. --restart-delay spaces retries so a fast crash-loop
# can't trip pm2's max-restarts giveup; these flags apply on a fresh start.
pm2 restart "$APP_NAME" --update-env 2>/dev/null \
  || pm2 start apps/server/dist/src/main.js --name "$APP_NAME" --update-env \
       --max-restarts 1000 --restart-delay 3000 --time
pm2 save

sleep 2
curl -sf "http://127.0.0.1:${APP_PORT}/api/world" >/dev/null \
  && echo "✅ ${APP_NAME} healthy on :${APP_PORT}" \
  || { echo "❌ health check failed"; pm2 logs "$APP_NAME" --lines 30 --nostream; exit 1; }
