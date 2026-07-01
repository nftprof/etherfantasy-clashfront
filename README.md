# EtherFantasy MOBA

Browser-based 3D MOBA (Three.js) + its authoritative multiplayer game server, for the
EtherFantasy ecosystem on Pentagon Chain.

## Repository layout

```
EF Moba/
├── index.html            Game CLIENT (Three.js) — the /play app. Also pve.html, launcher.html,
│                         hotkeys.html, wiki.html, audit.html, model_calibration.js
├── hero/  boss/  masters/  mons/  pets/  vrm/   3D model assets (.glb) — tracked via Git LFS
├── shared/  fx/  audio/                          shared client code, effects, sound
├── build/                Client build/obfuscation pipeline (build.mjs)
├── CLIENT_FILES.txt      Canonical manifest of everything /play ships
├── deploy_client.sh      Ships the manifest to both region boxes (see below)
│
├── server/               Authoritative multiplayer game SERVER (Node, ESM)
│   ├── net/              gateway, matchmaker, match loop
│   ├── sim/              deterministic seeded simulation (state, step, systems)
│   ├── lobby/            lobby + matchmaking service + landing page (public/)
│   ├── chain/            PlayEscrow on-chain client (CT economy)
│   ├── loot.js  vip.js  stats.js  snapshot.js  config.js
│
└── *.md                  Design docs, logs, plans (world, story, balance, deploy queues…)
```

> **Planned:** the game client (currently at repo root) will move into a `client/` subfolder so
> `client/` and `server/` are cleanly separated. Deferred until it can be coordinated with the
> deploy pipeline (`deploy_client.sh`, `build/build.mjs`, `CLIENT_FILES.txt` all reference root
> paths today).

## Client

Vanilla HTML/JS + Three.js. `index.html` is served statically at `/play`. Assets are `.glb`
models under `hero/`, `pets/`, etc. (Git LFS). `build/build.mjs` produces the hardened `RELEASE/`
(control-flow-flattening is the FPS cost — ship rename+minify only for near-zero runtime overhead).

## Server

`server/` runs an authoritative sim at a fixed tick, broadcasts snapshots, and settles the CT
economy (PvP escrow + single-player loot) via the `PlayEscrow` contract. Deterministic seeded
simulation (`server/sim/`) → reproducible/repayable. See `SERVER_PLAN.md`, `PATCH_NETPLAY.md`.

## Deploy

- **Client:** `bash deploy_client.sh` — tars the `CLIENT_FILES.txt` manifest and unpacks it into
  `~/ef-moba-game/` on both region boxes (Singapore + Montreal); nginx serves it, no restart.
- **Server:** pm2 procs `ef-moba-server` (game, :8080) + `ef-moba-lobby` (lobby, :8090) per box.

## Git LFS

Binary assets (`.glb/.vrm/.png/.mp3/.docx/.xlsx/.zip`, see `.gitattributes`) are tracked via LFS.
After cloning: `git lfs install && git lfs pull`.
