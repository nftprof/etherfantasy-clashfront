# Deploying the Clash Front MVP

One process serves everything (world sim + API + WS + client). Needs: **Node 20+** or Docker.

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
