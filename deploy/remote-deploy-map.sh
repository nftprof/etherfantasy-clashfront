#!/usr/bin/env bash
# Clash Front — map service (map.etherfantasy.com → :8150).
#
# The standalone map-service process (map-service/server.js): all-maps gallery + designer + registry
# API. It is a NON-workspace, ZERO-dependency ESM folder, so there is NO pnpm install / build — we
# just (re)start it under pm2. Runs on the SAME box + self-hosted runner (label: cf) as the live game
# (`clashfront` :8130), cfx (:8131), cf-battle-api (:8140); its own pm2 app `ef-map-service` on :8150
# is fully isolated. nginx `proxy_pass`es map.etherfantasy.com at :8150 (DEPLOY.md).
set -euo pipefail
# App dir: the synced ~/ef-map-service on the box (stable path for pm2), else the repo's map-service/
# when run from a checkout. MAPS_APP_DIR lets the workflow point us at the synced copy.
cd "${MAPS_APP_DIR:-$(dirname "$0")/../map-service}"

# :8140 is cf-battle-api on the shared box — the map service uses :8150.
APP_PORT="${MAPS_PORT:-8150}"
APP_NAME="${MAPS_APP_NAME:-ef-map-service}"

command -v pm2 >/dev/null 2>&1 || npm i -g pm2

# ---- runtime env -----------------------------------------------------------------------------
export MAPS_PORT="$APP_PORT"
export MAPS_HOST="${MAPS_HOST:-127.0.0.1}"
# READ the shared design registry — never migrate it (immutable per designVersion → safe concurrent
# readers; ONE writer = this service). Same default the registry uses.
export MAPS_DIR="${MAPS_DIR:-$HOME/ef-battlefields}"
# parcel facts + ownership come from the LIVE CF overworld on the same box.
export MAPS_WORLD_URL="${MAPS_WORLD_URL:-https://cf.etherfantasy.com/api/world}"
export MAPS_OWNERS_URL="${MAPS_OWNERS_URL:-https://cf.etherfantasy.com/api/land-owners}"

# PG login verification — same publishable key the live game uses; ~/.cf_pg_app_key overrides for
# rotation. Setting it turns on the gallery/designer Pentagon sign-in (owner-gated designing).
if [ -z "${PG_APP_KEY:-}" ] && [ -f "$HOME/.cf_pg_app_key" ]; then
  PG_APP_KEY="$(cat "$HOME/.cf_pg_app_key")"
fi
if [ -z "${PG_APP_KEY:-}" ]; then
  PG_APP_KEY="pk_live_3e996782bb03792b8787a02b2d076ec2"
fi
export PG_APP_KEY
[ -n "${PG_API_URL:-}" ] && export PG_API_URL || true

# admin ops key (x-maps-key) + optional server-side default LLM — read from box files if present.
[ -n "${MAPS_API_TOKEN:-}" ] && export MAPS_API_TOKEN || true

# ---- (re)start under pm2 ---------------------------------------------------------------------
pm2 restart "$APP_NAME" --update-env 2>/dev/null \
  || pm2 start server.js --name "$APP_NAME" --update-env \
       --max-restarts 1000 --restart-delay 3000 --time
pm2 save

# ---- health gate (POLL — the ESM import chain server→api→registry→auth can take >2s to bind) -----
ok=""
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${APP_PORT}/healthz" >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
if [ -n "$ok" ]; then
  echo "✅ ${APP_NAME} healthy on :${APP_PORT} (map.etherfantasy.com upstream)"
else
  echo "❌ map-service health check failed after 30s"; pm2 logs "$APP_NAME" --lines 40 --nostream; exit 1
fi
