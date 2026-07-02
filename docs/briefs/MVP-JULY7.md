# MVP — Playable by July 7 (hard deadline) — COMPRESSED TO JULY 5 (v2, 2026-07-02)

> **v2 update (product owner):** target pulled in to ~3 days via PARALLEL build streams; battle
> logistics (docs/04 §7c: provisions, command center, clock, TIE, retreat) added to scope as
> stream B. Coordination contract: all streams build against the SAME server API views
> (`apps/server/src/views.ts`) and canon types; the orchestrator session merges streams and owns
> integration. Stream plan:
>
> | Stream | What | When |
> |---|---|---|
> | A — Client | item 4 map UI (running) | Jul 2 |
> | B — Battle economy | provisions (food/gold/wood bought with CT), battle clock, TIE outcome, retreat/scatter, provision API + NPC provisioning | Jul 2, parallel (worktree) |
> | C — Integration | merge A+B: provision UI, battle timer/tie/retreat surfacing, direction arrows, polish | Jul 3 |
> | D — Deploy + playtest | single box, 2-browser test, balance | Jul 4 → ship Jul 5, Jul 6–7 buffer |

> Product owner directive 2026-07-02: **first playable MVP by 2026-07-07** (5 days). Focus on top
> features, lowest-hanging fruit; **demo units are fine**. This brief is the scope contract —
> anything not listed under IN is OUT until after July 7.

## The playable loop (what "playable" means)

A new player opens the browser and within 2 minutes is at war:

1. **Enter** — name-only login (session id). No wallet, no NFT checks.
2. **See the real map** — one zone slice of the actual hexagon-city geometry (from
   `data/hexagon-city-source/`), rendered as clickable parcels. Wild parcels show monster
   occupancy; a few NPC-held parcels have demo garrisons.
3. **Claim a start parcel** — pick any unowned parcel on the frontier → it becomes yours, a demo
   Master (named from `data/CHARACTER_ROSTER.csv`) is auto-assigned as overseer.
4. **Raise an army** — one button, demo unit stacks (INFANTRY/ARCHER/CAVALRY presets). CT is a
   simple starting-balance counter (no ledger service).
5. **March** — order the army to an adjacent parcel; travel takes REAL time (demo-tuned:
   ~1–3 min/step, `TICK_SECONDS` demo override 5 s). March is visible to everyone.
6. **Battle** — arriving at a hostile/wild parcel spawns a battle that **auto-resolves** via the
   WarScore formula (`docs/04` §5: army strength × morale × terrain; hero term capped 20%).
7. **Pillage or Occupy** — winner chooses: pillage (+CT, parcel degrades) or occupy (parcel joins
   your color, needs an overseer — the 55-officer cap is LIVE in the MVP; it's cheap and it's the
   signature rule).
8. **The world moves without you** — wild monsters hold parcels; a trivial NPC kingdom AI
   (`docs/06` Military AI doctrine, dumbest version) occasionally expands into wild land so the
   map visibly changes.

Multiplayer: everyone shares the one world; seeing another player's march/battle happen live is
the demo's magic moment. WS push, no polling.

## IN (build these, in order)

| # | Item | Where | Notes |
|---|------|-------|-------|
| 1 | Zone slice pipeline: pick ONE zone → parcel graph (id, polygon, center, neighbors) | `packages/sim-engine` script → `data/demo-world.json` | **Adjacency from polygon geometry — NO hexification for MVP** (see below) |
| 2 | Minimal live phases in tick engine: movement, battle spawn+resolve, occupy/pillage, army raise | `packages/sim-engine` | Replace stubs only where the loop needs them |
| 3 | Game server: Express+WS wrapping the tick engine, in-memory world, session login, order API | `apps/server` | Endpoints: join, world snapshot, claim, raise, march, resolve-choice; WS: tick deltas |
| 4 | Overworld client: canvas/SVG map from real parcel polygons, parcel card, order UI, battle toasts, occupy/pillage dialog | `apps/web` | Static bundle served by apps/server; keep deps ~zero (vanilla/Preact) |
| 5 | Demo content: monster garrisons on wild parcels (roster names, biome-flavored), 3 demo Masters/player, NPC kingdom AI (expand every N min) | server seed | Pull names from `data/` rosters for authenticity |
| 6 | Deploy: single box / single process, one shared world, reset button | pm2 or docker | Same host serves client |
| 7 | Balance pass + playtest day | — | July 6–7 is polish + buffer, NOT feature work |

## OUT (post-MVP, do not touch)

Chain/NFT integration (both chains), Masters API live sync (demo roster hardcoded), EF MOBA LIVE
drop-in (see stretch), estates & linked-component sieges (L2 parcels render but are inert), naval,
supply lines, diplomacy/contracts, pets, fog of war, economy beyond a CT counter, rewilding decay
timers (wild parcels just START wild), persistence beyond a JSON snapshot on disk, auth.

## STRETCH (only if all IN items are done early)

- **Hero duel hook**: when a battle spawns and both sides are human, offer a 60 s window to settle
  it in the existing EF MOBA (manual match, winner reported by honor-system button) → applies a
  ±15% WarScore swing. Zero engine work, pure UI + trust. Cheap taste of the real vision.
- SIEGE flavor: defender development level adds a wall bonus + longer battle timer.

## Hexification punt (important scope decision)

The extraction found the source has **no hexes** — parcels are irregular polygons. Hexifying is a
PERMANENT footprint decision (`data/README.md`) and must not be rushed in an MVP week. The MVP
therefore runs on the **parcel graph** (polygon adjacency = borders sharing an edge/threshold
overlap): movement is parcel→parcel, battles are per-parcel, and all canon rules read the same
(a parcel plays the role of `Hex` in `docs/08`; the importer's hex requirement is deferred).
Post-MVP, hexification proceeds per the extraction report §9 recipe with product-owner sign-off.

## Day plan (aggressive but honest)

- **Jul 2 (today):** zone-slice pipeline + adjacency (item 1); tick phases movement/battle (item 2).
- **Jul 3:** apps/server complete (item 3); first end-to-end march+battle via curl.
- **Jul 4:** apps/web map render + orders (item 4); loop playable solo in browser.
- **Jul 5:** demo content + NPC AI + multiplayer polish (item 5); deploy (item 6).
- **Jul 6:** playtest, balance, bugfix.
- **Jul 7:** ship. Demo script for the walkthrough.

## Definition of done

Two people in two browsers on the deployed URL can each claim land, raise armies, watch each
other march in real time, fight the wild + each other, pillage/occupy, and see the map
permanently changed — with zero developer intervention.
