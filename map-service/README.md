# map-service — Clash Front battlefield map system (consolidated)

The per-parcel battlefield **map generator + designer + registry + render pipeline**, consolidated
into the CF repo from the MOBA repo (`blockchainsuperheroes/etherfantasy-browser-moba-game`,
`server/maps/` @ `87e7d20`). Maps are a **Clash Front asset**; the MOBA map-engine remains the
**quality-parity reference** — re-pull `maps/` on future engine upgrades.

> **Isolation:** this folder is deliberately **NOT** a pnpm workspace member (the workspace globs are
> `packages/*` + `apps/*`). It never participates in `pnpm -r build && pnpm -r test`, so it **cannot
> affect the live CF build/deploy gate**. Run its own tests with `node maps/test/<x>.test.js`.

## What's here (lifted wholesale — pure ESM, zero npm deps)

`maps/` — `schema.js` (params/tiers/modes/trust-boundary `clampParams`), `generate.js` (deterministic
seed→params→archetype→validate→bake), `archetypes.js`, `features.js`, `validate.js` (connectivity +
auto-repair), `simulate.js` (the deploy "gate"), `registry.js` (versioned JSON store + manifest cache),
`api.js` (framework-agnostic `mapsApi(req,res)`), `loader.js` (game-time consumer), `llm.js` (optional
directive→params), `thumb.js`/`png.js` (top-down PNG), `designer.html`, `preview3d.html`, `test/`.
`sim/rng.js` — the one PRNG dep (copied). `lobby/auth.js` — PG identity (copied verbatim; portable,
needs only `PG_APP_KEY`, which CF already provisions).

## Status (verified in this repo, no network / no LLM)

- **`maps.test.js` 66/66 ✓** — generator/validator/simulator/registry/freeze all pass.
- **`loader.test.js` 9/9 ✓** — ref resolution, lazy v0, grid lookups.
- **`api.test.js` 37/41** — the 4 failures are ALL the `render.json` manifest tests, which require the
  engine team's `tools/battlefield_converter.cjs` (NOT committed to either repo — deployed onto the
  boxes). `registry.js` degrades gracefully (`converter_unavailable` → 501). Not a port defect.

Deterministic: same `(parcelId, params)` ⇒ byte-identical artifact. Generation works fully without the
LLM (LLM only picks PARAMETERS, then `clampParams`+validator-gated).

## Wiring into CF (the port's remaining seams)

- **Parcel feed:** `MAPS_WORLD_URL` already defaults to `https://cf.etherfantasy.com/api/world`. ✓
- **Owner gating:** point `MAPS_OWNERS_URL` at CF's `GET /api/land-owners` (the land-owners feed from
  the map-import work) — the natural CF ownership source. Seam: `editDecision()` in `maps/api.js`.
- **Identity:** `lobby/auth.js` verifies PG tokens with `PG_APP_KEY` (CF has it). Same PG backend the
  CF app uses — no change needed to work; revisit if CF wants a single shared session.
- **Mount:** `mapsApi(req,res)` returns `true` if it owned the request — drop it into CF's HTTP layer
  (or run map-service as its own small Node process on the box behind `map.etherfantasy.com`).
- **Store:** `MAPS_DIR` (default `~/ef-battlefields`) — the immutable `design.v{N}.json` per parcel.
  Safe to share the existing dir on the box (immutable per designVersion).

## Two TODOs (from the handover — the real work)

1. **§3 — command-view reconciliation — ✅ DONE (`maps/command_converter.js`).** Our artifact is
   **raster** (a 161×161 terrain grid); CF's command view (`apps/server/public/js/battle.js
   drawBattlefieldMap`) is **vector** (A1 schema: `bounds` + obstacle footprints +
   `lanes[]{id,side,waypoints}` + `structures[]` incl. `CORE`), so the raw artifact renders nearly
   empty there. `toBattlefieldA1(artifact)` closes the gap deterministically:
   - clusters BLOCKED terrain cells (FOREST/WATER/ROCK/CLIFF) into obstacle **footprint polygons**
     (`passable:false` = the walkability truth) via 4-connected components + boundary trace + collinear
     simplify; sub-`MIN_FOOTPRINT_CELLS` specks become round obstacles; décor props carry through as
     `passable:true` visual layer, so grid-walkability is preserved 1:1;
   - wraps bare lane arrays as `{id,side,waypoints}`; synthesizes `CORE`/`GATE`/`TOWER` anchored on
     the generator's guaranteed-clear ATTACKER/DEFENDER base spawns (NOT a fixed ±114.8 — a generated
     map's real cleared base is authoritative);
   - **force-opens a clear pocket** around bases (`CORE_CLEAR`), spawns (`SPAWN_CLEAR`) and along each
     lane centerline (`LANE_CLEAR`) so vectorized terrain never seals a staging area or corridor —
     making CF's validator invariants 1 (corridor) + 4 (base clear) true by construction;
   - stamps ids everywhere; normalizes `buildSpots.size` numeric→`"S"/"M"/"L"` + side; carries
     `meta.biome/sizeClass/sizeM/laneCount`.

   **Verified in-repo:** `maps/test/command_converter.test.js` 8/8 (shape + walkability parity), and
   every converted map passes CF's real `apps/server/src/battlefield.ts validateBattlefield`
   (**120/120** across biomes) — the identical schema `drawBattlefieldMap` + `data/moba-maps/legacy-*.json`
   use, so it renders with zero renderer changes. Refs: `docs/briefs/BATTLEFIELD-SCHEMA.md` (A1) +
   `docs/briefs/COMMAND-MAP-SPEC.md`.
2. **§4 — `map.etherfantasy.com` portal.** Login → all-maps gallery → owned-parcel filter → designer.
   Needs DNS (`map → 13.250.39.41`), an nginx vhost + cert, a gallery page, and owned-parcel filtering
   wired to CF ownership. The designer (`designer.html`) is standalone static hitting `/internal/v1/*`.

Also pending (engine-side): the 3D `render.json` converter (`battlefield_converter.cjs`) — obtain from
the engine team, or `render.json` stays 501.
