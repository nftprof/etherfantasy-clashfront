# Castle render brief — what the battle engine must render (castleGeom)

**To: MOBA BattleEngine RAW.** Owner 2026-07-21: "I don't think I have seen any castles to date —
go to full prototype and build now." The generator has emitted tiered-fortress geometry since
GEN_VERSION 5, but nothing rendered it. That gap is now closed on the CF side: the manifest carries
the block, and the CF 3D preview ships a working reference implementation you can copy from.
**View it live: `map.etherfantasy.com/designer/3d?parcel=60203670103`** (Westgate Castle, EDU).

## 1. Where the data is

- **Artifact:** `meta.castleGeom` (emitted by `map-service/maps/generate.js`, v5+).
- **Render manifest (`render.json`), the input you consume:** top-level **`castleGeom`**, passed
  through the converter VERBATIM (additive — `battlefield_converter.cjs`, one spread line; mirror
  it into your repo's copy of the converter). Absent on non-castle parcels — ignore when missing.
- Present on every parcel that hosts a world fortification POI (EDU: Westgate `60203670103`,
  Cliffwatch `60203520121`, Lantern Hill `60203510131`, Southreach `60203680154`).
  ⚠ DATA FLAG: EDU's PALACE (The Grand Academy) `at` sits on NO parcel bbox — being fixed on the
  CF side; until then EDU has no EPIC palace parcel.

## 2. The block (all coords = the manifest's ±161 world-unit frame, [x, z], +z north)

```jsonc
"castleGeom": {
  "tier": "KEEP|CASTLE|PALACE",            // LARGE / GIANT / EPIC ladder (canon decision 22)
  "styleKey": "fieldstone|collegiate|hanseatic|vermilion|carnavale|drowned_bastion",
  "rings": [                                // outer→inner enceintes; multi-ring for CASTLE/PALACE
    { "pts": [[x,z], …],                    // CLOSED wall polyline (last→first implied)
      "h": 16,                              // curtain height HERO-SCALE: KEEP 14 / CASTLE 16 / PALACE 18
      "gates": [ { "at": [x,z], "structureId": "castle_gate_0", "door": "PORTCULLIS|DOUBLE_LEAF" } ] }
  ],
  "gateOpenWidth": 13,                      // clear gate passage width (world-units, ≈9.6 m)
  "keep": { "at": [x,z], "tiers": 2, "h": 24 },   // KEEP 2×20 / CASTLE 2×24 / PALACE 3×30
  "mound": { "steps": [ { "ring": 0, "raise": 4 } ] },  // earthwork raise inside ring N
  "moat": false                             // true only for drowned_bastion (UW2 palace)
}
```

Ring vertices map 1:1 onto `structures[]` WALL anchors (`castle_wall_N` / `castle_tower_N` /
`castle_gate_N`) — **HP/collision truth stays the structures; castleGeom is visuals only.**
Damage states = drape your rubble/breach visuals per-anchor from structure HP, geometry unchanged.

## 3. What to build from it (CASTLE-ARCHITECTURE-SPEC §3 — the kit; reference impl below)

1. **Mound first** (§1 rule: fortresses climb): raise the ward interior by `mound.steps[].raise`
   (heightfield bump or a stepped earthwork mesh). Everything castle sits on top.
2. **Curtain walls**: for each ring, extrude wall segments pts[i]→pts[i+1]: batter footing
   (+~30% thickness, bottom 22%), wall body (`h`), then the **wall-walk** on top. **⚠ THE WALL TOP
   IS WALKABLE (handshake 2026-08-22) — read `wallRing.wallWalk` and honor it:**
   - the top surface (`wallWalk.surfaceY` = `h`) is a **walkable platform** — units patrol it,
     stairs land on it. It is the `WALL_WALK` elevation tier (`siege.elevationTiers.tier2`).
   - **merlons are EDGE TEETH on BOTH parapet edges** (`wallWalk.merlons.edge:"BOTH"`), spaced
     `gap` (~2.2u), each ~`w`×`depth` (1.15×1.1) inset `inset` (~1.5u) from the centreline on each
     edge. They are decoration on the rims — **NEVER lay a merlon (or any block) across the walk.**
   - a **clear central walkway of `wallWalk.walkWidth`** (~1.9u) runs the full ring between the two
     tooth rows. A consumer that reads `wallWalk` and still bars the centre is violating the contract
     — that is exactly the "can't walk on the wall / units trip on blocks" bug this handshake closes.
   - build the navmesh so the walkway is traversable and only the teeth (and the outer face) block.
   A wall is CONTINUOUS — towers punctuate, gates interrupt, nothing else.
3. **Drum towers** every ~26u of accumulated curtain run: r≈4.5–5.2, h = wall+5, crenellated
   crown + roof (style-keyed: cone / square / pavilion). The wall-walk **passes THROUGH** each tower
   (two-part tower: solid base to walk level, turret hut floating above an open walk-through band) —
   never a solid drum that dead-ends the walk.
4. **Gatehouse** per `gates[]`: twin flanking towers (h ≈ wall×1.55) set **OUTSIDE** the passage so
   they do NOT pinch it, a recessed arch block over the opening (arch clear = `archClearH` = 0.65·h,
   above head height). **Gate opening width = `wallRing.gateOpenWidth` (~13u, ≈9.6 m)** — carve the
   wall this wide at each gate point (NOT a per-engine ~7u guess). **Two DOOR TYPES, read `gates[].door`:**
   - `PORTCULLIS` (the main/road gate) — an iron grid that **raises straight up** into the gatehouse;
     draw it retracted (bottom above head) for the OPEN state.
   - `DOUBLE_LEAF` — two timber leaves that **swing open left/right** from the jambs.
   The door itself is the destructible `castle_gate_N` structure (HP; CLOSED/OPEN/BROKEN). The road
   passes straight through the opening.
5. **Keep** at `keep.at`: `tiers` stacked blocks (each ~0.74× the last, total height `h`),
   corner turrets on the top tier, roof + **banner** (the one dominant vertical — §1 rule 3).
6. **Moat** when `moat:true`: water annulus hugging the outer ring.

**Style keys** swap materials/roofs/ornament ONLY (palette table in the reference impl):
fieldstone grey/timber · collegiate pale-stone/slate-blue · hanseatic brick-red/dark ·
vermilion red-walls/gold-roofs · carnavale pale/violet · drowned_bastion black-basalt + moat.

## 4. Reference implementation (copy freely)

`map-service/maps/preview3d.html`, the `CASTLE KIT` block (~90 lines, plain three.js primitives +
the existing canvas stone texture — no assets). It implements §3 steps 1–6 exactly, including the
double-render guard: when `castleGeom` exists, `castle_*` structures are NOT handed to the
placeholder path (`isCastleAnchor`). Screenshot-verified on Westgate (EDU).

## 5. Acceptance

- A castle parcel in your client shows: continuous crenellated curtain with drum towers, a keep
  silhouette taller than the walls, banner. (Flat on the land — no mound; elevation = the wall-walk.)
- **Wall-top is WALKABLE end-to-end:** a unit can walk the full ring on the wall-walk; merlons are
  edge teeth on both rims with a clear central path; the walk passes through every tower; no block
  bars the walkway. (This is the 2026-08-22 handshake acceptance — the "can't walk on the wall /
  units trip on the blocks" report must be gone.)
- **Gates are WIDE + typed:** each opening is `gateOpenWidth` (~13u) wide with flanking towers OUTSIDE
  the passage (not pinched); the main/road gate renders as a raise-up PORTCULLIS, others as swing
  DOUBLE_LEAF, per `gates[].door`.
- Non-castle parcels: zero change. Old manifests without `castleGeom`/`wallWalk`: fall back gracefully
  (walkable top assumed; `gateOpenWidth` default 13; door default = main gate portcullis).
- Collision/pathing/HP identical before/after for the STRUCTURES (visuals draped over the same
  anchors); the ONLY navmesh change is that the wall-walk is now correctly traversable.
