# Clash Front Battle Engine — working copy of the EF browser MOBA

**Read this first, then `docs/reports/BATTLE-ENGINE-DISCOVERY.md`, then
`docs/reports/REPURPOSING-PLAN.md`.**

This repo is a **verbatim copy of `blockchainsuperheroes/etherfantasy-browser-moba-game`
@ `15d610c`** (its initial commit is preserved as this branch's parent), checked into
Clash Front as the **starting code for the battle engine**: the MOBA is being repurposed
into the battlefield layer of Clash Front, where each overworld hexagon becomes a
procedurally seeded, hexagon-shaped battle map (armies vs natural terrain; hero drop-in
stays; no more lanes/towers/creeps).

## Context

- **Clash Front** (grand-strategy overworld, design bible + canon):
  `blockchainsuperheroes/etherfantasy-clashfront`, branch `claude/clash-front-overworld-mkcyia`
  — see its `docs/04-battle-system.md` §7b (battlefield generation canon) and
  `docs/09-api-contracts.md` §5 (allocation + result-callback wire contract this engine
  must implement).
- **Discovery report** (`docs/reports/BATTLE-ENGINE-DISCOVERY.md`): full survey of this
  codebase — what the server sim already gives us (deterministic, headless, pure-data),
  the complete inventory of MOBA/square-map hardcoding, match lifecycle/API gaps, and
  reuse verdicts.
- **Repurposing plan** (`docs/reports/REPURPOSING-PLAN.md`): ordered work items A–G with
  milestones. **M1 (headless AUTO/ACCELERATED battles + result callbacks) needs no parcel
  data and no client changes** — start there. Battlefield dimensions (A2+) are blocked on
  the parcel-size extraction from hexagone-city (parallel maps session →
  `data/parcels.json` in the clashfront repo).

## Orientation (details in the discovery report)

- `server/` — authoritative Node game server. `sim/` is the deterministic battle kernel
  to KEEP; `net/match.js`/`matchmaker.js` get reshaped by plan items D/E; the map is just
  a ±120 square clamp (`config.js`) — hex battlefields replace it (plan A1–A3).
- `shared/ef_core.js` — element ability kits shared by both clients (hero drop-in keeps
  these). ⚠ hand-mirrored by `server/sim/abilities.js`.
- `index.html` — MOBA client monolith (own baked square map — diverges from the server's;
  see discovery §2.3). Client work is deliberately last (plan G).
- `pve.html` — single-player ARPG; not battle-relevant, but its heightfield→mesh terrain
  recipe is the pattern for the seeded battlefield generator (discovery §2.5).

## Caveats

- **Git LFS:** `.glb`/`.vrm`/`.png` model & image assets are LFS *pointer files* here —
  the binaries were not transferred. Code, configs, and docs are complete. Fetch assets
  from the original MOBA repo if you need to run the client with models.
- The original MOBA remains a live product — keep the legacy mode working behind flags
  rather than deleting shared systems (plan B1).

## Working rules

- Branch: `claude/browser-moba-clashfont-gmiy7p` — commit and push here.
- Same prime directives as clashfront (`docs/AGENTS.md` there): determinism in the sim
  (no `Math.random`/`Date.now`), canon names from `docs/08-data-models.md`, doc-first.
