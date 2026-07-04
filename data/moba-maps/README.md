# MOBA legacy battle map — `legacy.json`

The **real geometry of the existing EF MOBA 3-lane arena**, extracted into a `Battlefield` object
(`docs/briefs/BATTLEFIELD-SCHEMA.md` v1). This is the exact layout the MOBA in-game minimap draws
— so CF's command view can render the true battlefield instead of the placeholder square the
bridge currently sends in `battle_hello`.

## What this unblocks

The bridge hands CF a generic square today; CF has never seen the actual arena. Drop this file in
and CF's command view becomes a faithful "bigger minimap" of the MOBA battlefield — lanes, the 12
towers, both cores/town-halls, the jungle ridge walls, the two hills (= boss lairs), fountains,
wild camps, and resource nodes, all in metres, origin-centered, `x` east / `z` north.

## Provenance & determinism

- **Source:** `blockchainsuperheroes/etherfantasy-browser-moba-game @ 15d610c`, `index.html`
  (the client map — `MAPK = 1.4`; every constant is line-referenced in `extract-legacy.mjs`).
- Regenerate: `node data/moba-maps/extract-legacy.mjs` (deterministic; no `Date.now`/`Math.random`).
- Only **stable structural geometry** is emitted. The engine's cosmetic tree/grass scatter uses
  `Math.random` (varies per load) and is intentionally omitted — it's decoration, not layout.

## Coordinate notes (read before rendering)

- Origin at arena center; `x` = east, `z` = north; 1 unit = 1 m — matches CF's viewer/bridge.
- `arena.bounds` is the engine's **hard** movement clamp, a ±161 m square (`clampMap`,
  `index.html:2919-2920`, `±115·MAPK`). All units and economy live inside it — render this.
- `meta.softClampBoxM` / `arena.softClampBoxM` (±126 m) is a **second** clamp `clampMap` applies to
  **every unit** (`index.html:2927`, `const R=90*MAPK`) — **not** hero-only — that pulls units back
  into a ±126 box **except** the two diagonal fountain pockets (blue SW / red NE), so spawn/recall
  pads behind each base stay reachable. It's the tighter *functional* play area; pathing should
  honor `box ∪ pockets`, but the rendered arena outline is `bounds` (±161). (The `126` here is
  world-metres from `90·MAPK`; do not confuse it with the unrelated minimap-gradient pixel radius.)
- Side labels: the MOBA is symmetric PvP (blue SW vs red NE). Mapped blue → `ATTACKER`,
  red → `DEFENDER` purely for the schema; swap freely per battle context.
- `sizeClass: "LEGACY"` — this is the full legacy arena, **not** a hex parcel; `meta.sizeM` (322 m)
  is authoritative for scale. Real per-parcel maps come from the generator (`MAP-GENERATOR.md`).
- Structure/mob HP are under `_ref` for reference; per the schema, game-time fills real hp/ownership
  from the battle context.

## Contents

3 lanes · 2 cores (±114.8) · 12 towers (6/side) · 12 ridge-wall segments · 2 fountains/spawns ·
5 build pads (attacker side) · 2 wild camps (3 guards each) · 2 boss lairs (+2 adds each) ·
18 resource nodes · 21×21 coarse heightField (two ~4 m hills). Validated: every placed entity sits
inside `bounds`.

## The dynamic path (end state)

This static file is the fast unblock. The end state is the match server sending this same
`Battlefield` shape live in `battle_hello`/allocate per match (repurposing-plan items A/C3, D1) —
which also covers procedurally generated parcel maps. Same schema, so CF's renderer built against
`legacy.json` consumes the live maps unchanged.
