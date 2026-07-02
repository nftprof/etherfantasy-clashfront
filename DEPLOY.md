# Deploying the Clash Front MVP

One process serves everything (world sim + API + WS + client). Needs: **Node 20+** or Docker.

## Option 0 — EF EC2 box + cf.etherfantasy.com (the chosen MVP path)

Run from a session WITH SSH access to the EF server (e.g. local Claude Code). Steps:

```bash
# 1. On the box: get the code (first time; later deploys just fetch/reset)
git clone -b claude/clash-front-overworld-mkcyia <repo-url> ~/clashfront-mvp
# 2. Deploy/restart (idempotent; APP_PORT defaults to 8130, no conflict with MOBA 8080/8090)
bash ~/clashfront-mvp/deploy/remote-deploy.sh
# 3. Nginx vhost (first time only)
sudo cp ~/clashfront-mvp/deploy/nginx-cf.etherfantasy.com.conf /etc/nginx/sites-available/cf.etherfantasy.com
sudo ln -sf /etc/nginx/sites-available/cf.etherfantasy.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# 4. DNS: A/CNAME record  cf.etherfantasy.com → this box   (registrar/Cloudflare)
# 5. TLS (after DNS resolves):
sudo certbot --nginx -d cf.etherfantasy.com
```

Redeploy after new commits: `cd ~/clashfront-mvp && git pull && bash deploy/remote-deploy.sh`
(world state in `data/save.json` survives deploys; delete it to reset the world).

Optional push-to-deploy later: `.github/workflows/deploy.yml` does the same via GitHub Actions —
add repo secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (+`DEPLOY_SSH_PORT` if not 22) and
push to branch `deploy/cf-mvp`. Keys live ONLY in GitHub secrets — never in chat/repo.

## Option A — Docker (recommended)

```bash
docker build -t clashfront-mvp .
docker run -d --name clashfront -p 80:8080 -v clashfront-data:/app/data clashfront-mvp
```

Open `http://<host>/`. The named volume persists `data/save.json` (world survives restarts).

## Option B — bare Node + pm2

```bash
corepack enable && pnpm install && pnpm -r build
pm2 start apps/server/dist/src/main.js --name clashfront
```

## Environment knobs (defaults are demo-tuned)

| Var | Default | Meaning |
|---|---|---|
| `PORT` | 8080 | HTTP + WS port |
| `WORLD_SEED` | `mvp-july7` | deterministic world seed |
| `TICK_MS` | 5000 | wall-clock ms per world tick |
| `TRAVEL_TICKS_PER_STEP` | 12 | march pace (~1 min/parcel at 5 s ticks) |
| `NPC_EVERY_TICKS` | 60 | NPC kingdom action cadence |
| `CHOICE_TIMEOUT_TICKS` | 24 | pillage/occupy decision window |
| `START_CT` / `NPC_CT` | 2000 / 20000 | starting wallets (ct display units) |
| `SAVE_MS` | 30000 | snapshot interval → `data/save.json` |

## World reset

Stop the process, delete `data/save.json`, start again (same seed ⇒ same fresh world).

## Notes

- TLS: put nginx/caddy/cloudflare in front for HTTPS + WSS (WS path is `/ws`).
- One shared world per process. Capacity: hundreds of concurrent players at MVP scale (648
  parcels, 5 s ticks) — the sim work per tick is trivial; WS fan-out is the only real load.
- Demo walkthrough for a showing: join on two browsers → claim adjacent frontier parcels →
  raise + provision armies → march into monsters (fire/smoke + pillage) → then into each other
  (strength preview, TIE gray-smoke or decisive + retreat) → watch the Gnoll Dominion expand.
