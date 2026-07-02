# Mission Brief — Battle Engine Discovery & Repurposing Plan (etherfantasy-browser-moba-game)

Paste this as the first message of a session scoped to
`blockchainsuperheroes/etherfantasy-browser-moba-game`, ideally with
`blockchainsuperheroes/etherfantasy-clashfront` also in scope (read `CLAUDE.md` and `docs/` there
for full context — especially `docs/04-battle-system.md` §7b and `docs/09-api-contracts.md`).
If clashfront is NOT in scope, this brief is self-contained.

---

## Context (read carefully)

We are building **Clash Front**, a persistent grand-strategy war game (Romance of the Three
Kingdoms × EVE Online) layered on top of the hexagone-city NFT land map. The existing EF browser
MOBA (this repo: 3D client + authoritative multiplayer server) becomes its **battle engine**.

Locked design decisions that constrain your work:

1. **It is no longer a MOBA.** The square map becomes a **battlefield where armies collide against
   natural terrain** — lanes, towers, and creep conventions go away. Player hero drop-in stays
   (players join a running battle at start or mid-game, controlling one hero, LoL-style).
2. **One battle map = one overworld hexagon = the size of the smallest land parcel.** Each hexagon's
   battlefield terrain is **procedurally seeded**, deterministic from
   `seed = f(hexId, terrain, zoneType, development, structures)`. Same hex → same battlefield.
3. Large **estates** (hundreds–10,000 hexes) are fought as **multiple linked hex components**, never
   one giant map; attackers advance component-by-component (adjacency-gated internal front). Only
   estates have **pre-designed castle / city-wall maps** (real-world castle design references);
   ordinary parcels are pure seeded terrain.
4. Three battle types on the same engine: **FIELD** (armies vs terrain), **SIEGE** (walls,
   structures with persistent HP, gates, keep as win objective), **NAVAL** (fleets on sea hexes).
5. Battles are spawned by the strategy layer ("Battle Orchestration") which passes a **battle
   context** (armies as NPC unit stacks, garrison, structures, terrain seed, weather) and receives
   a **result callback** (winner, casualties per army, structure damage, hero stats). The armies are
   mostly NPC soldiers simulated by the server; player heroes contribute at most ~20% of combat
   power (`HERO_IMPACT_MAX = 0.20`) — the macro layer decides the rest.
6. Battles must support: AI-only auto-resolution (no clients connected), live play with drop-in /
   mid-game reinforcement, and bot backfill for absent heroes.

## Your mission — DISCOVERY ONLY, do not refactor yet

(The battlefield component dimensions depend on parcel-size data being extracted from the
hexagone-city map repo in a parallel session. Starting the map refactor before that data lands
risks rework.)

Produce a **discovery report + repurposing plan** covering:

1. **Codebase map.** Tech stack (engine/renderer, server framework, networking, tick model),
   repo layout, build/run, how client and server share code.
2. **Map pipeline.** How the current square map is defined, stored, and loaded (data format,
   baked into client vs served dynamically). List EVERYTHING hardcoded to the square map or to
   MOBA conventions (lanes, towers, minion waves, jungle camps, shop, respawn rules).
3. **Match lifecycle & API surface.** How matches are created today (matchmaking? rooms?), the
   exact server API to programmatically create a match with given teams/parameters, whether
   mid-game join is currently possible, how results are emitted, and what auth exists between
   services.
4. **NPC/army capability.** Can the server currently simulate large numbers of AI units
   (hundreds per side)? What pathfinding/AI exists? Estimate feasibility and perf limits for
   army-vs-army combat, and for headless auto-resolve (server-only match with no clients).
5. **Gap analysis → repurposing plan.** Concrete, ordered work items to get from today's MOBA to:
   (a) dynamically loaded, procedurally-seeded hex battlefield components;
   (b) FIELD/SIEGE/NAVAL rule variants;
   (c) an orchestration adapter: `POST create-battle(context) → match → result callback`
       (align with `docs/09-api-contracts.md` in clashfront if readable);
   (d) drop-in/mid-game hero joining + bot backfill.
   For each item: effort estimate (S/M/L), dependencies, and risks.
6. **Reuse verdicts.** What to keep as-is, what to modify, what to delete. Flag anything
   (asset pipeline, netcode, physics) that makes hex-shaped or terrain-heavy maps hard.

## Rules

- **Read-only** on game code this session — no refactors, no deletions. Prototype snippets are
  fine inside the report.
- Prefer primary sources (code, configs, protocol definitions) over inference; quote file paths.
- Flag ambiguities and unknowns explicitly rather than guessing.
- **Deliver:** `BATTLE-ENGINE-DISCOVERY.md` (findings 1–4, 6) + `REPURPOSING-PLAN.md` (item 5).
  If `etherfantasy-clashfront` is in scope, commit them there under `docs/reports/` on branch
  `claude/battle-engine-discovery` (create it; do NOT push to `claude/clash-front-overworld-mkcyia`).
  Otherwise commit to a new branch of the moba repo, or output as files for manual transfer.
