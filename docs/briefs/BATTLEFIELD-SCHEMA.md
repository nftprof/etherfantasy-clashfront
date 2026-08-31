# Battlefield JSON — the map contract (generator → MOBA + CF, single source of truth)

> The A1 schema referenced across `ALLOCATE-CALLBACK-SCHEMA.md`, `MAP-GENERATOR.md`, and
> `docs/04` §7b, written out in full. The map-generator session emits THIS; the MOBA match
> server loads it to play the 3D battle; CF's command view renders it as the minimap. One
> object, three consumers — build to this exactly and no adapters are needed on any side.

## Coordinate system & units (LOCKED — do not vary)

- **Coordinates are dimensionless WORLD-UNITS**, post-MAPK — **consumed AS-IS, NEVER re-scaled**
  by any consumer (do NOT multiply by MAPK / 1.4 anywhere; that double-scales). Real-world size
  is a DECLARED mapping on top (see the scale declaration below), not a per-unit metre.
- **Origin at arena CENTER `(0,0)`. `x` = east (+right), `z` = north (+up-screen).** `y` (optional)
  = elevation. This matches CF's existing viewer/bridge convention (`x east, z north`; viewer maps
  it to screen with north = top). **blue/ATTACKER = SW (−,−); red/DEFENDER = NE (+,+)** (single-lane
  N–S: attacker enters south −z, defender holds north +z).
- **FIXED standard arena: half-edge ±161 world-units ⇒ `sizeM = 322`** (the client's real frame:
  `clampMap ±115 · MAPK 1.4`). `sizeM` is the coordinate EDGE in world-units (the field name is kept
  for compat; it is NOT metres). This is THE arena for **every** CF battle. Known-good magnitudes:
  **spawns at ±131.6, cores at ±114.8** (both OUTSIDE the RETIRED ±120/240 pre-scale frame — that
  old frame clipped them). The earlier "sizeM = the parcel's normalized size (SINGLE ≈ 240,
  estates scale up)" framing is **SUPERSEDED for arena DIMENSIONS**: estates fight as a SERIES of
  standard ±161 component battles (canon decision 4 / `docs/04` §7b), so parcel size scales
  army/structure COUNT and component COUNT, **not** arena size. Source of truth = the MOBA
  BattleEngine's `legacy.json` (matches the client 1:1); prefer it over any stand-in.
- **`bounds` is the parcel-shaped polygon**, centered and normalized to the fixed `sizeM = 322`
  (span `[-161, +161]`). Non-convex is fine; wind CCW.

### Real-world scale declaration (world-units ↦ metres)

The ±161 world-unit frame ≡ **1 CF parcel ≡ ~14 acres**. 14 acres = 56,656 m² ⇒ edge ≈ 238 m;
the battlefield edge is 322 units, so **1 world-unit ≈ 0.74 m (~1.35 units/m).** This is a DECLARED
mapping layered on top of the dimensionless coordinates — the frame itself is always ±161 units.
The **EF v2 CF Moba (map maker) (F5)** session authors per-parcel terrain at ~0.74 m/unit to fill
the ±161 frame without distortion. (Note: the overworld/sim's own "1 unit = 1 m" is a SEPARATE
coordinate space — the battlefield frame is world-units at ≈0.74 m/unit, not 1 m/unit.)

## The object

```jsonc
{
  "v": 1,
  "meta": {
    "parcelId": "60203370020",
    "seed": "9f2c4a61d0b3785e",     // deterministic: same seed+params ⇒ byte-identical map
    "designVersion": 3,             // bumps as the AI gardener / owner iterates
    "biome": "TEMPERATE_FOREST",    // palette + prop set selector
    "sizeClass": "SINGLE",          // SINGLE … EPIC (docs/04 §7b ladder)
    "sizeM": 322,                   // world-UNIT edge (fixed ±161 frame), NOT metres; ~0.74 m/unit
    "laneCount": 1,                 // 1 default; 3 for estates. A PARAMETER, not a gate.

    // Mode CAPABILITY flags (owner 2026-07-15, ParcelMap feedback point 2). Universal modes
    // (DUEL/SIEGE/GUARD) are always supported — no need to list them. CLASH/DOMINION are
    // OPTIONAL: geometry that can't produce fair per-edge starts (elongated slivers, ~2.5% of
    // real parcels) omits them here rather than being rejected. CF's battleModeOf() intersects
    // its ideal-mode pick with this list and falls back through the taxonomy
    // (CLASH→DUEL, DOMINION→DUEL) when the parcel doesn't support the ideal. 3+ armies on a
    // non-CLASH parcel resolve as DUEL + Scenario H reinforcement queue for the extras.
    "modes": ["DUEL", "SIEGE", "GUARD", "CLASH", "DOMINION"],

    // Weather source of truth (owner 2026-07-15, WEATHER-CONTINENT-PLAN.md). CF derives the
    // battle's weather from this continent's probability card at allocate time via
    // weatherAt(seed, continentId, tick). Present on every generated map so the renderer +
    // match-server + CF sim all read the same state. Empty = "no continent context" (used only
    // by isolated stand-in maps; production maps ALWAYS set it).
    "continentId": "ENT"
  },

  "arena": {
    "shape": "polygon",
    "sizeM": 322,                   // fixed standard arena edge in world-units (±161)
    "bounds": [[-161,-161],[161,-161],[161,161],[-161,161]]  // [x,z] world-units, CCW, the parcel shape
  },

  // Optional low-res elevation for hillshade/cliffs. Omit for flat maps.
  "heightField": { "cols": 32, "rows": 32, "cellM": 7.5, "data": [ /* row-major metres, len cols*rows */ ] },

  // Impassable/soft terrain. `passable:false` blocks pathing; radius OR footprint polygon.
  "obstacles": [
    { "id": "tree_01", "kind": "TREE",   "x": 60, "z": 90, "r": 4,  "passable": false },
    { "id": "rock_01", "kind": "BOULDER","x": -30,"z": 12, "r": 6,  "passable": false },
    { "id": "water_01","kind": "WATER",  "footprint": [[..],[..]],  "passable": false },
    { "id": "cliff_01","kind": "CLIFF",  "footprint": [[..],[..]],  "passable": false }
  ],

  // Economy/CoC layer — harvest nodes (docs/02 §13, docs/05 §9).
  "resources": [
    { "id": "gold_01", "kind": "GOLD_MINE",  "x": 0,  "z": 100, "richness": 3 },
    { "id": "wood_01", "kind": "WOOD_GROVE", "x": -70,"z": -40, "richness": 2 }
  ],

  // Anchor points occupiers may build defense modules on (docs/04 §7b.2b), AND spots the
  // in-battle RTS layer spends gold on to erect towers/gates/walls mid-fight (owner Q1
  // 2026-07-15 — CF wants in-battle build/collect; the CT↔Gold round-trip needs deterministic
  // slot positions on every generated map). REQUIRED — never empty on a generated map.
  //
  // Fields (owner 2026-07-15, ParcelMap feedback + coord doc COORD-001):
  //   id           stable slug (bs_ne_1); anchorId emitted alongside during migration
  //   x, z         world-units in the ±161 frame (y = height and unused here)
  //   type         'WALL' | 'TOWER' | 'GATE' | 'ANY' (ANY = player picks at build time)
  //   side         'DEFENDER' | 'ATTACKER' | 'NEUTRAL' (defender ring vs mid-field vs contested)
  //   size         build-footprint radius (world-units) — sim reach check + scatter keep-outs
  //                consume it; per-type defaults ⚙ WALL 3 / TOWER 4 / GATE 5 / ANY 4
  //   bakedInto?   structure anchorId when the fortification ladder already consumed this slot
  //                (EPIC=PALACE, GIANT=CASTLE, LARGE=KEEP → their WALL/GATE/TOWER structures
  //                emit as buildSpots with bakedInto: <structure anchorId>, so CF knows the
  //                slot is spent and doesn't offer it to the "auto-upgrade defense" flow)
  //   tierUnlock?  0..5 unlock priority — CF reads first N spots where N = 4 + 2·tier (cap 16);
  //                if omitted, CF falls back to stable array ordering (defender-ring first,
  //                midfield mid, forward-field last is the ParcelMap-recommended order)
  //
  // Counts per sizeClass (max, seeded at mass-gen; CF reveals per investment tier):
  //   SMALL/open single: 6      (4 base + 2 tier)
  //   MEDIUM manor:      10     (4 base + 6 tier)
  //   LARGE KEEP:        14     (4 baked ring + 4 base + 6 tier)
  //   GIANT CASTLE:      16     (6 baked ring + 4 base + 6 tier)
  //   EPIC PALACE:       per-component (same formula on each POI parcel of the estate board)
  "buildSpots": [
    { "id": "bs_def_1", "anchorId": "bs_def_1", "x": 20, "z": 60, "type": "TOWER", "side": "DEFENDER", "size": 4, "tierUnlock": 0 },
    { "id": "bs_mid_1", "anchorId": "bs_mid_1", "x":  0, "z":  0, "type": "ANY",   "side": "NEUTRAL",  "size": 4, "tierUnlock": 3 }
  ],

  // Where each side's units enter. edge = compass hint (matches overworld approach direction).
  "spawnZones": [
    { "id": "spawn_atk_s", "side": "ATTACKER", "edge": "S", "x": 0, "z": -131.6 },
    { "id": "spawn_def_n", "side": "DEFENDER", "edge": "N", "x": 0, "z":  131.6 }
  ],

  // Lane corridors: ordered waypoints spawn → enemy base. One per lane; reinforcements add edge lanes.
  "lanes": [
    { "id": "lane_mid", "side": "ATTACKER", "waypoints": [[0,-131.6],[0,-40],[0,40],[0,131.6]] }
  ],

  // Defensive furniture ANCHORS (positions + kind + side). The GENERATOR sets positions;
  // game-time fills hp/hpMax/ownership from the battle context (wild=towers+mobs, player=CC+towers).
  // CORE at the known-good ±114.8 magnitude (blue SW / red NE; here single-lane N–S).
  "structures": [
    { "anchorId": "anchor_t1", "kind": "TOWER", "side": "DEFENDER", "x": 0, "z": 61.7 },
    { "anchorId": "anchor_cc", "kind": "CORE",  "side": "DEFENDER", "x": 0, "z": 114.8 }
  ],

  // WILD maps only — mob camps (positions + pack).
  "mobs": [ { "id": "camp_1", "kind": "WOLF", "x": 40, "z": 0, "count": 6 } ],

  // Top-down PNG for the overworld parcel texture (data URI or a path the server can serve).
  "thumbnail": "designs/60203370020/v3.png"
}
```

## Passability rule (both consumers MUST agree)

A point is **walkable** iff: inside `bounds` AND not inside any `passable:false` obstacle
footprint/radius AND (if `heightField` present) slope below the step threshold ⚙. Both the MOBA
pathing and CF's render derive walkability from this same rule — do not ship a separate navmesh
that could disagree with the geometry.

## Validation invariants the generator MUST guarantee (playability gate)

**Aligned 2026-07-15 (ParcelMap feedback point 2, coord doc COORD-001):** the gate is HARD
invariants + universal-mode support. CLASH/DOMINION were formerly rejection criteria; sliver
geometry (~2.5% of real parcels) can't produce fair per-edge starts and re-rolling a
deterministic seed never fixes it (same seed ⇒ same shape). Those modes are now capability
flags in `meta.modes` — the map SHIPS with them omitted rather than being rejected, and the
CF sim reads `meta.modes` before offering the mode. At 292k parcels this saves ~7,000 from a
permanent stuck-in-the-floodgate outcome.

**HARD invariants (all must pass — reject if any fails):**

1. **Every `spawnZone` edge has a corridor** of min width ⚙ `W` (≈ 8 m) reaching the base area —
   no spawn can be walled off (reinforcements enter at ANY edge, `docs/04` §7b).
2. **Every lane is pathable end-to-end** on the walkability rule above.
3. **All `buildSpots`, `resources`, `structures`, `mobs` sit on walkable ground**, not inside an
   obstacle or outside `bounds`.
4. **Base area clear radius** ⚙ around each `CORE`/main structure.
5. **Deterministic**: same `seed` + params ⇒ byte-identical object (no Date.now/Math.random).
6. **DUEL / SIEGE / GUARD supported** on every generated map (universal, geometry-agnostic).
7. **`buildSpots` populated** per the sizeClass count table above (never `[]` on production maps).

**Capability flags (recorded in `meta.modes`, NOT gates):**

- **CLASH** supported iff ≥ 2 mutually-fair edge starts exist (`sim.fairEdges` check).
- **DOMINION** supported iff a viable center objective slot exists on walkable ground.

CF sim consequence: `battleModeOf()` intersects its ideal pick with `meta.modes` and falls
back through the taxonomy (CLASH→DUEL, DOMINION→DUEL) on non-supporting parcels; excess
armies queue via Scenario H reinforcement (`REINFORCEMENT-LANE-QUEUE.md`, already shipped).

Fail any invariant ⇒ the generator repairs (carve corridor / move node) and re-validates before
emitting. A map that ships MUST pass all five — that's what lets owner-prompted maps be safe.

## Delivery

- Emit one object per parcel, keyed by `parcelId`, into the design registry (`MAP-GENERATOR.md`
  D1). The match server pulls it at allocate; CF pulls the same for the minimap.
- Owner-prompt maps (`MAP-GENERATOR.md` D6): LLM → generator PARAMETERS → this object via the
  deterministic generator + validator. The LLM never writes this JSON directly — parameters only.
- **Versioning:** bump `meta.designVersion` on every save; keep `seed` stable so v0 always
  reproduces. CF caches by `parcelId+designVersion`.

## Interim stand-in maps (2026-07-04 — until the generator/real export lands)

Per-parcel generated maps do not exist yet (§1a of `ALLOCATE-CALLBACK-SCHEMA.md`). CF therefore
ships **standard MOBA-style stand-ins** at `data/moba-maps/*.json`, each a valid object of THIS
schema (tagged with a top-level `"_placeholder"`) that passes all five playability invariants:
- `legacy-3lane.json` — symmetric competitive layout: two CORE bases at opposite corners, three
  lanes (top / mid / bot) with per-side TOWER anchors, a diagonal decorative river (WATER
  footprints, `passable:true`), jungle TREE/BOULDER camps, four resource nodes, gate/wall furniture.
  Used for estates and as the DEFAULT.
- `legacy-1lane.json` — one central lane, two bases (S/N), 1 attacker + 2 defender towers, flanking
  obstacles. Used for single parcels.

The CF command view (`apps/server/public/js/battle.js`) renders these with a fully data-driven
Battlefield-JSON renderer, so **the MOBA team's real exported map replaces the stand-in with zero
renderer changes** — same schema, same renderer. The server (`game.ts`/`bridge.ts` `battleStatic`)
prefers a real per-match battlefield when the match server/bridge supplies one, else loads the
stand-in (validated at load by `apps/server/src/battlefield.ts`). Retire these files once real
per-parcel designs flow through the registry.

## v30 addendum — THE THREE-LAYER DOCTRINE (2026-08-31, owner-directed; spec: `NAVAL-AIRSHIP-THREE-LAYER-MAPS.md`)

Two traversal planes join the ground plane on every map. **Additive** — a consumer that ignores
them sees exact pre-v30 semantics.

### `terrain.water` — the per-cell depth channel
Base64 Uint8, same `w×h` grid as `cells`/`walk`:

| value | grade | who operates there |
|---|---|---|
| 0 | none | — |
| 1 | **SHALLOW** (~8u wade rim off every shore) | water pets wade in and ATTACK from it (the amphibious flank walls don't cover); land units per engine wade rules |
| 2 | **DEEP** (body ≥110 cells past the rim; a river cutting the map gets a deep centerline once wider than ~2× the rim) | NORMAL/LARGE ship hulls + swimming water pets — a moored ship here is a **floating fortress** |
| 3 | **OCEAN** (deep + map-edge/OOB-connected + ≥250 deep cells) | the only water an **IMPERIAL** carrier may occupy — it stays offshore and LAUNCHES normal hulls |

Derived masks (compute, never shipped): land-walk = `walk` (unchanged — all water blocked);
SWIM = `water>0`; SAIL = `water≥2`; SAIL_IMPERIAL = `water==3`.
Invariants (CI, R-LAYERS): depth only on WATER cells; DEEP/OCEAN never 4-adjacent to land — a
SHALLOW rim always intervenes (so every beach-landing crosses the wade band).

### `LANDING_PAD` structure anchors — where airships may land (they MUST land to act)
Estates only, never single parcels (owner rule). `{ anchorId:"landing_pad_N", kind:"LANDING_PAD",
side:"NEUTRAL", blocking:"NONE", r, x, z, flat:true, markers:"HELI_RING", class, plaza? }`.
Count ladder ⚙ (owner sign-off pending): SMALL/MEDIUM 1 · LARGE 2 · GIANT 3 · EPIC 4.

| `class` | r | seats (vessel classes from MOBA `build/voyage/vessel.js`: NORMAL hull ≈16×36u, wings ≈36u span) |
|---|---|---|
| `HEAVY` | 26 | LARGE + NORMAL + LIGHT (GIANT/EPIC estates try one first) |
| `NORMAL` | 16 | NORMAL hull (helideck-style wing overhang) + LIGHT |
| `LIGHT` | 12 | scout-class only — a full hull won't seat |

`plaza:true` = the pad paints on street paving (walled cities — Yong'an — have squares, not
lawns). IMPERIAL vessels never land anywhere: sea-side they hold OCEAN water, sky-side the map
edge, launching NORMAL hulls; an imperial DECK is itself a future battlefield artifact.
Render contract: flat marked circle (apron + ring + H) — never a solid blob; ground stays
walkable when no vessel is seated. Reference: `preview3d.html` (renders pads in every mode).

### v31 refinements (same day, naval-sim hardening — 20-iteration loop)
- **OCEAN grade is per SAIL REGION**, not per water body: `water==3` only where the DEEP component
  itself is edge/OOB-connected + ≥250 cells (a body touching the edge through a shallow arm no
  carrier fits stays grade 2).
- **`PIER` anchors** (see the v30 table's naval doctrine): `{anchorId:"pier_N", kind:"PIER",
  blocking:"NONE", x, z, r:3, dir:[dx,dz] (shore→deep), len, walkable:true}` — ONE per arrivable
  sail region, at its best wade corridor (roads preferred). The plank strip is walkable ground
  over water — engines add it to collision at load.
- **`meta.approaches`** `{naval:[edges], air:["N","S","E","W"]}` — deep entry cells (grid border or
  OOB-adjacent) vote for their compass edge; ≥4 votes lists the edge. +z = NORTH.
- **`meta.sailRegions`** `[{cells, edge, draft}]` — draft NORMAL / LARGE (≥60 cells, ≥30% interior)
  / IMPERIAL (ocean-grade region).
- **Pad placement law grew two guards** (CI): kill-box (≥30u from every buildable spot — owner:
  airborne airships are shootable by archers/flyers, but never into a prepared tower nest) and
  inner-ward (≥45u from the keep — no airborne coup de main past the walls; walled cities pad
  their outer districts/plazas).
- **CI R-NAVAL:** the headless naval sim (`runNavalAudit`) is asserted per artifact — every
  arrivable region has a beachhead AND a pier; every pad + pier + sampled beach landing marches
  to the defended heart.
