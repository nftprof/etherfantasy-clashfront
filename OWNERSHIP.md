# EF Moba — Ownership & division of labor

> Read this before editing anything. Two work-streams run in parallel on this repo.
> The goal: never clobber each other. Most files have a single clear owner; **`index.html`
> is shared** and needs care.

## Who owns what

### 🎮 Game session — game content + client UI/UX
Heroes, balance, abilities' *design*, the map, art, single-player (EF Hunt / `pve.html`),
and all on-screen client UX.
- `index.html` — **gameplay + UI only** (see shared-file rule below)
- `pve.html` (EF Hunt) and everything single-player
- `shared/ef_core.js` (ability/kit source of truth), `shared/ef_touch.js`
- `model_calibration.js`, `mon_lineage.json`
- `audit.html`, `wiki.html`, `launcher.html`, `home.html`, art (`hero/ pets/ npc/ vrm/ wiki_img/`)
- `build/` (client obfuscation → `RELEASE/`)

### 🛰️ Server session — authoritative server + netplay glue
The Node game server, the lobby's server side, and the *networking code paths* in the client.
- `server/**` — **100% server session** (sim, abilities mirror, items, AI, economy, matchmaker, gateway, lobby service)
- `index.html` — **networking paths only**, all gated to online/server mode:
  `netServer*` bridge (`?net=server`), client prediction + entity interpolation, the
  `NET.mode==='guest'` branch in the joystick, the `mpMode==='server'` branch on champion-select cards, wire data.
- Deploy/infra: the EC2 boxes, nginx/TLS, pm2, regions.

## The shared file: `index.html`
Both sessions edit it; today both edit-sets coexist cleanly (verified). Rules:
1. **One canonical source: this repo** (`C:\Users\ADMIN\Desktop\EF Moba`). Edit here, not a separate checkout.
2. **Always build/deploy `/play` from this repo** so BOTH the netplay bridge and the UI ship together.
   `cd build && npm run build:prod` → `RELEASE/` → deploy. The obfuscated build includes the
   netplay bridge automatically (it's in source).
3. **Pause the hourly auto-builder during a `/play` redeploy.** It's the one actor that can rebuild
   `index.html` from a stale state and wipe the multiplayer bridge → "no movement online."
4. Keep edits in your own lane: game session = gameplay/UI functions; server session = `netServer*`,
   prediction, guest branches. Don't refactor across the boundary without a heads-up.

## Sync points (ping the other session when these change)
- **Ability / item numbers.** Game session changes `shared/ef_core.js` kits or the client `ITEMS`
  list → tell server session to update the mirrors `server/sim/abilities.js` / `server/sim/items.js`
  (they carry ⚠ "keep in sync" notes). These are a *separate reimplementation*, not auto-synced.
- **New client→server verbs.** e.g. the **`signal`** verb (ping wheel) emits
  `netSendInput({a:'signal',k,x,z})`; server relays it (spec in `server/HANDOFF_LOBBY_TO_SERVER.md`).
- **New gameplay *rules*** that should reach online play, e.g. **air/land** ("melee can't hit flyers",
  `canHitAir` + `AIR`/`ATK` sets). Rules aren't "numbers" — call them out for server-combat parity.
- **Server-only rules** the game session should know about (currently online-only): **tower-gating**
  (core invulnerable while a tower stands), **champion draft** (60s pick), **AI bot-fill**, **minion
  wave cadence**. Decide per item whether local should match for parity.

## Key docs
- `PATCH_NETPLAY.md` — server session's client/server netplay changelog (read before rebuilding `/play`).
- `server/HANDOFF_LOBBY_TO_SERVER.md` — lobby → game-server integration + ACK checklist (`party`, `signal`, `?net=server`).
- `server/DEPLOY_MOBA_SUBDOMAIN.md` — nginx + TLS + pm2 deploy runbook.
- `SERVER_PLAN.md` — server-authoritative architecture plan.
- `build/README.md` — SOURCE → RELEASE obfuscation build.
- `HANDOFF.md` — overall project handoff.
