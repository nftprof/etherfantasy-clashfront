# Battlefield JSON — the map contract (generator → MOBA + CF, single source of truth)

> The A1 schema referenced across `ALLOCATE-CALLBACK-SCHEMA.md`, `MAP-GENERATOR.md`, and
> `docs/04` §7b, written out in full. The map-generator session emits THIS; the MOBA match
> server loads it to play the 3D battle; CF's command view renders it as the minimap. One
> object, three consumers — build to this exactly and no adapters are needed on any side.

## Coordinate system & units (LOCKED — do not vary)

- **1 unit = 1 meter** (canon scale law).
- **Origin at arena CENTER `(0,0)`. `x` = east (+right), `z` = north (+up-screen).** `y` (optional)
  = elevation in metres. This matches CF's existing viewer/bridge convention (`x east, z north`;
  viewer maps it to screen with north = top).
- The arena spans roughly `[-sizeM/2, +sizeM/2]` in x and z. `sizeM` = the parcel's normalized
  arena size (SINGLE ≈ 240 m; estates scale up per the ladder in `docs/04` §7b).
- **`bounds` is the parcel's REAL polygon**, centered and normalized to `sizeM` — this is what
  "building maps based on exact size/shape" produces. Non-convex is fine; wind CCW.

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
    "sizeM": 240,
    "laneCount": 1                  // 1 default; 3 for estates. A PARAMETER, not a gate.
  },

  "arena": {
    "shape": "polygon",
    "sizeM": 240,
    "bounds": [[-118,-120],[118,-120],[120,118],[-120,120]]  // [x,z] metres, CCW, the parcel shape
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

  // Anchor points occupiers may build defense modules on (docs/04 §7b.2b). side omitted = neutral.
  "buildSpots": [
    { "anchorId": "spot_01", "x": 20, "z": 60, "size": "M", "side": "DEFENDER" }
  ],

  // Where each side's units enter. edge = compass hint (matches overworld approach direction).
  "spawnZones": [
    { "id": "spawn_atk_s", "side": "ATTACKER", "edge": "S", "x": 0, "z": -112 },
    { "id": "spawn_def_n", "side": "DEFENDER", "edge": "N", "x": 0, "z":  112 }
  ],

  // Lane corridors: ordered waypoints spawn → enemy base. One per lane; reinforcements add edge lanes.
  "lanes": [
    { "id": "lane_mid", "side": "ATTACKER", "waypoints": [[0,-112],[0,-40],[0,40],[0,108]] }
  ],

  // Defensive furniture ANCHORS (positions + kind + side). The GENERATOR sets positions;
  // game-time fills hp/hpMax/ownership from the battle context (wild=towers+mobs, player=CC+towers).
  "structures": [
    { "anchorId": "anchor_t1", "kind": "TOWER", "side": "DEFENDER", "x": 0, "z": 60 },
    { "anchorId": "anchor_cc", "kind": "CORE",  "side": "DEFENDER", "x": 0, "z": 106 }
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

1. **Every `spawnZone` edge has a corridor** of min width ⚙ `W` (≈ 8 m) reaching the base area —
   no spawn can be walled off (reinforcements enter at ANY edge, `docs/04` §7b).
2. **Every lane is pathable end-to-end** on the walkability rule above.
3. **All `buildSpots`, `resources`, `structures`, `mobs` sit on walkable ground**, not inside an
   obstacle or outside `bounds`.
4. **Base area clear radius** ⚙ around each `CORE`/main structure.
5. **Deterministic**: same `seed` + params ⇒ byte-identical object (no Date.now/Math.random).

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
