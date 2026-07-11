# A-Artifact Schema (RASTER) — the frozen Map-maker ↔ sim seam

> **Map-maker session, 2026-07-07.** This freezes the **raster A-artifact** the generator emits — the
> shape the **sim ingests to build a battle world** (network agent's ask: "the generator's A-artifact
> schema, frozen, in a shape the sim can ingest — terrain grid + obstacles + lanes + structures + spawns").
> Companion to **`BATTLEFIELD-SCHEMA.md`** (the derived **A1 vector** `command.json` = file **B**).
> Emitted by `map-service/maps/generate.js` (`generate(parcel, params?, version?)`); constants in
> `map-service/maps/schema.js`. **Real sample committed:** `data/cf-maps/artifacts/60200010000.artifact.json`
> (raster A) + `data/cf-maps/parcels/60200010000.json` (vector B) — the same real EDU parcel.

## 0. Two forms, one design — who reads which (resolves the raster-vs-vector question)

The generator bakes **one design** into **two serializations**:

| Form | File | Shape | **Consumer** |
|---|---|---|---|
| **A — raster artifact** | `…/artifacts/<id>.artifact.json` | terrain **grid** (`cells`+`walk`) + entities | **the SIM** — builds the battle world (collision from `walk`, entities from the arrays). Also the generator's native output + the 3D source. |
| **B — A1 vector** | `…/parcels/<id>.json` | `bounds` + lane polylines + obstacle **footprints** + structures (incl. synthesized CORE) | **the command view** (2D) + the **live wire** (`battle_hello`). Derived from A by `toBattlefieldA1`. |

**So the command view standardizes on ONE schema — the A1 vector (B) — for BOTH live and static.** That is
already true: `battle_hello`'s `battlefield` is A1 vector, and the static `command.json`/`parcels/<id>.json`
is the same A1 vector; `battle.js drawBattlefieldMap` renders either. The **raster A is never consumed by
the command view** — it is the *sim's* input and the generator's native form. No conflict, no second
renderer. (Network agent's flag #1: keep the command view on A1 vector for live; you do **not** need to
derive a vector per-snapshot — B is static per battle.)

**The production gap (network agent's flag #2) closes when:** the sim builds its world from **A** (this
schema) instead of `makeWorld`'s fixed 3-lane arena. That is engine work on the network side; this frozen
schema + the committed sample is the input it was waiting on.

## 1. Top-level shape (13 keys)

```jsonc
{
  "arena":      { "shape": "square"|"polygon", "sizeM": 322, "bounds": [[x,z],…] },
  "laneCount":  1,                              // 1 (single) | 3 (estate component)
  "terrain":    { "cellM": 2, "w": 161, "h": 161, "cells": "<b64>", "walk": "<b64>" },
  "obstacles":  [ { "kind":"TREE"|"ROCK", "x":n, "z":n, "r":n } ],   // point PROPS (lone scenery)
  "resources":  [ { "kind":"GOLD_MINE"|"WOOD_GROVE", "x":n, "z":n, "richness":0..1 } ],
  "buildSpots": [ { "anchorId":"bs_…", "x":n, "z":n, "size":n } ],
  "spawnZones": [ { "id":s, "side":"ATTACKER"|"DEFENDER"|"ANY"|"OBJECTIVE", "edge":"N|S|E|W|C", "x":n, "z":n } ],
  "lanes":      [ [ [x,z], … ] ],               // DUEL attacker→base push, polyline(s)
  "routes":     [ { "id":s, "side":s, "wp":[[x,z],…] } ],   // per-edge entry→center chains (dumb-AI paths)
  "barriers":   [ { "id":s, "kind":"BOULDER_PILE"|…, "axis":"h"|"v", "x":n, "z":n, "hp":n, "opens":[[x,z],…] } ],
  "mobs":       [ { "id":s, "kind":"GOLEM"|"WOLF"|…, "x":n, "z":n, "count":n } ],
  "structures": [ { "anchorId":s, "kind":"TOWER"|…, "side":"DEFENDER", "x":n, "z":n, "hpMax":n } ],
  "meta":       { "seed":n, "designVersion":0, "parcelId":s, "biome":s, "zone":s, "params":{…}, "budget":{"level":0..5,"name":s} }
}
```

Coordinates are **world-units**, center-origin, **+z north**, in the fixed **±161** frame (`sizeM 322`) —
identical to `BATTLEFIELD-SCHEMA.md`. ATTACKER spawns S (−z), DEFENDER base N (+z).

## 2. The terrain grid (the part the sim needs for collision)

`terrain = { cellM: 2, w, h, cells, walk }` — a **`w × h` grid** (161×161 for a single; `w = round(sizeM/cellM)`).

- **`cells`** — base64 of a `w*h`-byte array; each byte is a **terrain code**:
  `T = { OPEN:0, FOREST:1, ROCK:2, WATER:3, CLIFF:4, ROAD:5, OOB:6 }`.
- **`walk`** — base64 of a `w*h`-byte array; `1` = walkable, `0` = blocked. This is the **authoritative
  collision field** (already accounts for `BLOCKED = {FOREST,ROCK,WATER,CLIFF,OOB}` + the polygon cut +
  repair erosion). **The sim should build pathing/collision from `walk`.**

**Decode (both arrays):**
```js
const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));  // length === w*h
const idx   = (cx, cz) => cz * w + cx;                            // row-major, cz = north axis
const walkable = (cx, cz) => bytes[idx(cx, cz)] === 1;            // for `walk`
// cell center → world:  wx = (cx + 0.5) * cellM - sizeM/2 ;  wz = (cz + 0.5) * cellM - sizeM/2
// world → cell:         cx = floor((wx + sizeM/2) / cellM)
```
`cells` and `walk` are **byte-per-cell** (not bit-packed) so decode is a plain `atob`.

## 3. Element notes (the entity layers)

- **`obstacles`** are **point props** (`{kind,x,z,r}`, lone trees/rocks) — cosmetic-ish scatter. **Dense,
  blocking terrain is in the grid** (`cells`=FOREST/ROCK/WATER + `walk`=0), *not* here. (In the **B**
  vector these grid-blocks become obstacle **footprint polygons**; in **A** they stay in the grid.)
- **`structures`** in A are the DEFENDER **towers** only. **CORE is NOT in A** — `toBattlefieldA1`
  **synthesizes** the ATTACKER/DEFENDER COREs in **B** from the base spawns (`def_base` / `atk_S`). If the
  sim needs cores, take them from `spawnZones` (`def_base`, `atk_S`) or from **B**.
- **`spawnZones`** — `atk_S` (DUEL attacker), `def_base` (DUEL/SIEGE defender), one `entry_e*` per real
  parcel edge (multi-side arrivals — satisfies the ≥1-entry-per-edge invariant), `center` (OBJECTIVE hold).
- **`lanes`** = the attacker→base push; **`routes`** = a guaranteed entry→center chain per arrival edge for
  the dumb lane-AI. **`barriers`** = destructible HP gates sealing shortcuts (never the main path); `opens`
  = the cells re-opened when destroyed.
- **`mobs`** / **`resources`** = the **seeded** layer (wild camps + gather nodes). Present only when the
  parcel has been seeded (invest/near-player); a **base-terrain-only** artifact has these empty. Deliver
  them to the sim **in the allocate context** (see §4) — do **not** re-derive with a second generator.

## 4. The seam contract (allocate → sim)

1. **CF passes the parcel's A-artifact (or a reference to it) in the allocate context**, plus the seeded
   entity layer (`mobs`/`resources`/`structures`) explicitly — network agent's recommendation (a),
   **agreed**: explicit beats two-generators-must-match. Determinism is preserved because A is itself a
   pure seeded function.
2. **The sim builds its world from A**: collision/pathing from `terrain.walk`; lanes/routes/spawns/
   structures/mobs/resources from the arrays — instead of `makeWorld`'s fixed arena + 4 hardcoded camps.
3. **Live still wins for the command view**: the running sim serializes to A1 vector (B) for
   `battle_hello`, exactly as today. Static B (`parcels/<id>.json`) is the fallback/preview only.

**Frozen fields** (won't change without a `designVersion`/schema-version bump): the 13 top-level keys, the
`terrain` grid encoding (byte-per-cell, codes `T`, `walk` 1/0, row-major, center-origin ±sizeM/2), the
`±161`/`sizeM 322` frame, and the spawnZone id/side/edge vocabulary. Element arrays may gain **optional**
fields additively.

## 5. Real samples (committed, validated)

- **A (raster):** `data/cf-maps/artifacts/60200010000.artifact.json` — real EDU parcel, seeded (invest tier
  2): 161×161 grid, 2 towers, 2 GOLD_MINE, 2 GOLEM camps, 1 lane + 5 routes, 1 barrier gate.
- **B (vector):** `data/cf-maps/parcels/60200010000.json` — the same design as A1; **passes CF
  `validateBattlefield` (all 5 invariants)** and loads via `loadParcelBattlefield("60200010000")`
  (test: `apps/server/test/parcelSample.test.ts`, green).
- Regenerate deterministically: `generate({parcelId:"60200010000",zone:"EDU",biome:"TEMPERATE_FOREST",sizeM:322,investLevel:2})`.
