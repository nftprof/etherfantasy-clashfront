# Command-mode map — spec for the AI map-maker (two renderers, one artifact, in sync)

> For the **EF v2 CF Moba (map maker) (F5)** session generating a unique battlefield per CF parcel.
> You already have the spec for the **hero / actual 3D battle map** (`BATTLEFIELD-SCHEMA.md`). This
> adds the piece you flagged as missing: what the **command-mode map** needs. Read with
> `BATTLEFIELD-SCHEMA.md` (the schema) and `docs/04` §7b.

## TL;DR — do NOT author two maps

There is **ONE artifact per parcel: the `Battlefield` JSON (A1 schema), in the fixed ±161 world-unit
frame.** The hero map and the command-mode map are **two renderers of that same JSON**, not two files:

| Renderer | Who | What it draws |
|---|---|---|
| **Hero / 3D** | MOBA game client (`/play`) | the playable match — terrain meshes, unit control, full game |
| **Command mode** | CF command view (`battle.js` `drawBattlefieldMap`) | a **top-down 2D** render of the *same* JSON — watch + issue orders + drop into hero mode |

Deliver **one complete, valid `Battlefield` JSON** and both work, **in sync, for free.** You do not
produce a separate "command map." The command view is a data-driven renderer that draws **any**
conformant Battlefield JSON — CF changes nothing when your real map lands.

## Why the two layers stay in sync (by construction, not by hand)

Both renderers consume the **same JSON in the same coordinate frame** — the fixed **±161 world-unit
arena** (`sizeM = 322`), **center-origin, +z north**, blue/ATTACKER SW, red/DEFENDER NE, spawns
±131.6, cores ±114.8 (see `BATTLEFIELD-SCHEMA.md` "Coordinate system"). Because a point `(x,z)` means
the identical world position to both:
- a click in command mode maps **1:1** to what the hero sees in 3D;
- a lane/structure the commander targets is the exact lane/structure the hero fights on;
- switching command ↔ hero (possession, one-hero rule) is seamless — same space, no re-projection.

**This is the keystone:** sync is guaranteed only if you emit **one JSON in the ±161 frame** and both
sides consume it as-is (no ×MAPK, no re-scale). Never emit a separate, differently-scaled command map.

## What the command layer actually renders (must be present + correct in the JSON)

CF's `drawBattlefieldMap` projects every point with `bfProject(x,z)` normalized by `arena.sizeM`, and
draws **only** these fields — so if a field is missing/empty, the command map is blank there:

| Battlefield JSON field | Command-view usage |
|---|---|
| `arena.sizeM` + `arena.bounds` (CCW polygon) | the parcel's shape + scale — the outline everything sits in |
| `meta.biome` | terrain palette / backdrop tint |
| `obstacles[]` — `{x,z,r}` **or** `footprint:[[x,z]…]`, `kind`, `passable` | water / forest / rock / cliffs drawn as 2D footprints or discs |
| `lanes[]` — `{id, side, waypoints:[[x,z]…]}` | lane corridors (the commander's push routes) |
| `structures[]` — `{anchorId, kind (CORE/TOWER/GATE/WALL), side, x, z}` | defensive furniture, coloured by side; command targets |
| `spawnZones[]` — `{id, side, edge, x, z}` | where each side enters / reinforcements arrive |
| `resources[]` — `{id, kind, x, z, richness}` | harvest nodes |
| `buildSpots[]` — `{anchorId, x, z, size, side}` | placeable-defense anchors |
| `heightField` (optional) | hillshade under the top-down view |

Live unit positions, tower HP, rally flags come from the **match server telemetry at battle time** —
NOT from you. You supply the static stage; the server overlays the moving pieces.

## The one thing that's easy to get wrong

**The command view has NO 3D mesh to fall back on.** If you author only a beautiful 3D terrain and
leave the *semantic* fields thin (no `lanes`, structures without `anchorId`/`side`, obstacles as mesh
only with no `footprint`/`r`, no `spawnZones`), then the **hero map looks great but the command map is
empty/unusable** — the exact split you're worried about. So the rule is:

> **Populate the full semantic layer, not just terrain.** Every lane, structure, spawn zone, obstacle
> footprint, resource and build-spot the 3D map has must exist as data in the JSON, in ±161 coords,
> with stable ids. That data IS the command map.

## Commandable — why command mode needs semantic ids

In command mode the player issues **high-level orders on the top-down map** (direct armies down a lane,
focus a structure, set a rally point, then possibly possess a Master and play it in 3D). Those orders
reference JSON elements, so:
- **`lanes[].id`** must be **stable** — "push mid" / "hold bot" targets a lane by id.
- **`structures[].anchorId` + `kind` + `side`** must be **stable** — "focus the north tower" / "defend
  the core" targets a structure by anchor.
- **`spawnZones[].side` + `edge`** drive reinforcement arrival + rally placement (a march arriving at
  edge E spawns there and opens a new lane — `docs/04` decision 11).
- **Walkability** = inside `bounds` AND outside any `passable:false` obstacle (the schema's shared
  rule). The command view uses it to show where orders can go; the 3D pathing uses the same rule — so
  an order the commander gives is always executable by the hero-side pather. Don't ship a navmesh that
  could disagree with the geometry.

## Deliverables per parcel (the full picture)

1. **`Battlefield` JSON (A1)** — the one artifact both renderers consume (this spec + `BATTLEFIELD-SCHEMA.md`). Mandatory, complete semantic layer, ±161 frame, passes the 5 playability invariants, deterministic per seed.
2. **`meta.thumbnail` PNG** (optional but wanted) — a top-down raster to **texture the parcel on the overworld map**. This is a *separate raster*, distinct from the interactive command view (which is vector, drawn live from the JSON). Nice-to-have, not required for command mode to work.

## Self-test

CF's `apps/server/public/js/battle.js` `drawBattlefieldMap` is the **reference command-mode renderer**
— it renders any conformant Battlefield JSON. The interim stand-ins `data/moba-maps/legacy-3lane.json`
and `legacy-1lane.json` are worked examples (valid, pass all 5 invariants, ±161 frame). If your JSON
renders correctly there (readable bounds, lanes as corridors, coloured structures, spawn markers), it
will render correctly in command mode in production — same code. Ship to that.
