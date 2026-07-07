# Brief: deploy moba.etherfantasy.com via the same self-hosted-runner flow CF uses

> For the **MOBA / L3 hero-engine session** (repo `etherfantasy-browser-moba-game`), asking how the GitHub
> Action should reach the live box now that SSH is retired. **Answer: yes — option #1, the self-hosted
> runner.** It's exactly what CF already runs (three apps ship this way today). This brief is a
> copy-paste-ready template of that proven flow, adapted for `moba.etherfantasy.com` (the L3 hero engine —
> its own single-player MOBA **and** the CF-parcel battle maps).

## Why self-hosted runner (not SSH / IP-allowlist)

The runner process lives **on the box** and dials **outbound** to GitHub to pick up jobs. So:
- **No inbound SSH / port 22**, **no IP allowlist**, **no deploy key in CI** — the box's security group stays
  fully closed. This is why we moved off SSH.
- The checkout + build + restart all happen **locally on the box** (fast, no scp of build artifacts).
- Secrets never touch the repo or GitHub — they're read from `~/.dotfiles` on the box (below).

The **one-time box-side setup is ~5 lines** (register the runner). That's the part a sandbox can't do — a
human with box shell access runs it once; everything after is git-push-to-deploy.

## The model (how CF does it — mirror this)

**One self-hosted runner per box** serves **many apps**, each fully isolated:

| App | pm2 name | Port | Repo/branch that ships it | Box |
|---|---|---|---|---|
| CF overworld | `clashfront` | 8130 | `etherfantasy-clashfront` @ `deploy/cf-mvp` | ef-sing (13.250.39.41) |
| CF cfx staging | `cfx` | 8131 | same repo @ `deploy/cfx` | ef-sing |
| CF battle API | `cf-battle-api` | 8140 | (MOBA bridge) | ef-sing |
| CF map service | `ef-map-service` | 8150 | `etherfantasy-clashfront` @ `deploy/map` | ef-sing |
| **MOBA L3 engine** | **`ef-moba`** | **8160 (pick a free port)** | **`…-moba-game` @ `deploy/moba`** | see below |

Each app = its own **pm2 process on its own port**; restarting one **never touches** the others. **nginx**
terminates TLS (certbot) and `proxy_pass`es the hostname to the local port. So `moba.etherfantasy.com` just
needs: a pm2 app on a free port + an nginx vhost → that port.

### Same box or a new box?

- **Same box (ef-sing, 13.250.39.41):** the MOBA match server + bridge (`cf-battle-api` :8140) already live
  here. If the hero engine rides along, **reuse the existing `cf` runner** — just add a **new workflow +
  new pm2 app on a new port (8160)** + a new nginx vhost. **Zero box setup** beyond the vhost.
- **New/dedicated box** (recommended if the 3D engine needs its own CPU/RAM, or for the Montreal zone per
  the geo-zone plan, `docs/07` §4.4): **register a fresh runner on that box** with its own label (e.g.
  `moba`), then the workflow targets `runs-on: [self-hosted, moba]`. The 5-line registration is the only
  extra step.

## One-time box setup (the ~5 lines — run once, by hand, on the box)

```bash
# On the target box, as the deploy user:
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -o r.tar.gz -L https://github.com/actions/runner/releases/download/v2.319.1/actions-runner-linux-x64-2.319.1.tar.gz
tar xzf r.tar.gz
# Token + URL come from: GitHub repo → Settings → Actions → Runners → "New self-hosted runner"
./config.sh --url https://github.com/blockchainsuperheroes/etherfantasy-browser-moba-game \
            --token <RUNNER_REG_TOKEN> --labels moba --unattended
sudo ./svc.sh install && sudo ./svc.sh start   # runs as a service, survives reboot
```
Notes:
- Give the runner user **passwordless sudo** only if the deploy needs it (CF's does for nginx/certbot; a
  pure pm2 restart doesn't). CF box has it.
- **Reuse the CF runner instead** if same box: skip all of the above; just set `runs-on: [self-hosted, cf]`.

## The workflow (`.github/workflows/moba-deploy.yml` in the MOBA repo)

```yaml
name: Deploy MOBA hero engine (moba.etherfantasy.com)

on:
  push:
    branches: [deploy/moba]
    paths-ignore:            # don't bounce the live server for docs-only pushes
      - '**/*.md'
      - '.github/workflows/**'
  workflow_dispatch: {}

concurrency:
  group: moba-deploy
  cancel-in-progress: false   # never interrupt an in-flight deploy

jobs:
  deploy:
    runs-on: [self-hosted, moba]   # or [self-hosted, cf] if same box as CF
    steps:
      - uses: actions/checkout@v4

      - name: Sync working copy → ~/ef-moba (preserve runtime state)
        run: |
          mkdir -p "$HOME/ef-moba"
          # --delete keeps the box copy == the repo; exclude anything the box owns at runtime
          # (save files, uploaded maps, logs). Add excludes as needed.
          rsync -a --delete --exclude='.git' --exclude='data/live/**' \
            "$GITHUB_WORKSPACE"/ "$HOME"/ef-moba/

      - name: Build + (re)start ef-moba on :8160 (health-gated)
        run: |
          MOBA_APP_DIR="$HOME/ef-moba" MOBA_PORT=8160 \
          bash "$GITHUB_WORKSPACE"/deploy/remote-deploy-moba.sh
```

## The deploy script (`deploy/remote-deploy-moba.sh` in the MOBA repo)

Mirror CF's `remote-deploy.sh` / `remote-deploy-map.sh`. The three things that make it robust: **build,
pm2 start-or-restart with crash-resilience flags, and a POLLING health gate** (the process can take >2s to
bind). Secrets are **read from `~/.dotfiles`**, never from the repo.

```bash
#!/usr/bin/env bash
# MOBA L3 hero engine — moba.etherfantasy.com → :8160. Idempotent (re)start.
set -euo pipefail
cd "${MOBA_APP_DIR:-$(dirname "$0")/..}"

APP_PORT="${MOBA_PORT:-8160}"
APP_NAME="${MOBA_APP_NAME:-ef-moba}"

command -v pnpm >/dev/null 2>&1 || corepack enable
command -v pm2  >/dev/null 2>&1 || npm i -g pm2

# --- build the 3D client + server (adapt to the repo's real build) ---
pnpm install --frozen-lockfile
pnpm run build            # bundles the client; server compiles if TS

# --- runtime env + secrets from box files (chmod 600) — NEVER in the repo ---
export PORT="$APP_PORT"
# e.g. the bridge/allocate HMAC the engine shares with CF:
[ -z "${CF_BRIDGE_SECRET:-}" ] && [ -f "$HOME/.cf_bridge_secret" ] && CF_BRIDGE_SECRET="$(cat "$HOME/.cf_bridge_secret")"
[ -n "${CF_BRIDGE_SECRET:-}" ] && export CF_BRIDGE_SECRET
# PG publishable key (same one CF uses; file overrides for rotation):
[ -z "${PG_APP_KEY:-}" ] && [ -f "$HOME/.cf_pg_app_key" ] && PG_APP_KEY="$(cat "$HOME/.cf_pg_app_key")"
export PG_APP_KEY="${PG_APP_KEY:-pk_live_3e996782bb03792b8787a02b2d076ec2}"

# --- (re)start under pm2 with crash-resilience (survives crash-loops + reboot) ---
pm2 restart "$APP_NAME" --update-env 2>/dev/null \
  || pm2 start <ENTRY>.js --name "$APP_NAME" --update-env \
       --max-restarts 1000 --restart-delay 3000 --time
pm2 save

# --- POLLING health gate (bind can take >2s; fail loud with diagnostics) ---
ok=""
for i in $(seq 1 30); do
  curl -sf "http://127.0.0.1:${APP_PORT}/healthz" >/dev/null 2>&1 && { ok=1; break; }
  sleep 1
done
[ -n "$ok" ] && echo "✅ ${APP_NAME} healthy on :${APP_PORT}" || {
  echo "❌ health check failed"; pm2 logs "$APP_NAME" --lines 40 --nostream; exit 1; }
```
Replace `<ENTRY>.js` with the server entry, `pnpm run build` with the real build, and add a `/healthz`
route (CF's map service returns 200 on `/healthz`; the game returns 200 on `/api/world`).

## nginx vhost (once, on the box)

```nginx
# /etc/nginx/sites-available/moba.etherfantasy.com
server {
  server_name moba.etherfantasy.com;
  location / {
    proxy_pass http://127.0.0.1:8160;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;      # WebSocket: the match server needs this
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;                    # long-lived match sockets
  }
}
```
Then `sudo certbot --nginx -d moba.etherfantasy.com` for TLS, `sudo nginx -t && sudo systemctl reload
nginx`. (CF ships these vhosts as files under `deploy/nginx-*.conf` and a `setup-*` workflow applies them —
you can do the same, or apply by hand once.) **The WebSocket upgrade headers matter** for the live 30 Hz
match stream — CF's plain HTTP vhost doesn't need them, the hero engine does.

## Secrets (the box-file convention)

Never commit secrets. The box holds them as `chmod 600` dotfiles, and the deploy script reads them:
`~/.cf_bridge_secret` (CF↔engine allocate/callback HMAC), `~/.cf_pg_app_key` (PG login, publishable so it
also has a safe default), plus any engine-specific keys. Absent file ⇒ the feature stays off — same
graceful-degrade pattern CF uses.

## Checklist for the MOBA session

1. **Pick the box** — same as CF (reuse `cf` runner, port **8160**) or dedicated (register a `moba` runner).
2. **Register the runner** (5 lines above) — only if new box.
3. Add **`.github/workflows/moba-deploy.yml`** + **`deploy/remote-deploy-moba.sh`** (templates above).
4. Add a **`/healthz`** (or reuse an existing 200 route) so the deploy gate works.
5. **nginx vhost + certbot** for `moba.etherfantasy.com` (WebSocket upgrade headers).
6. Drop any secrets as `~/.dotfiles` (chmod 600) on the box.
7. **Push to `deploy/moba`** → it ships. `workflow_dispatch` gives you a manual button too.

Ping the CF Overworld session if you want the exact CF workflow/scripts to diff against — they're in
`etherfantasy-clashfront` under `.github/workflows/{deploy,map-deploy}.yml` and `deploy/remote-deploy*.sh`.
