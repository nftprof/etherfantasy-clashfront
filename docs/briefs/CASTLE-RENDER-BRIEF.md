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
  "rings": [                                // outer→inner enceintes; v1 emits 1 ring
    { "pts": [[x,z], …],                    // CLOSED wall polyline (last→first implied)
      "h": 9,                               // curtain height: KEEP 7 / CASTLE 9 / PALACE 11
      "gates": [ { "at": [x,z], "structureId": "castle_gate_0" } ] }
  ],
  "keep": { "at": [x,z], "tiers": 2, "h": 22 },   // KEEP 2×16 / CASTLE 2×22 / PALACE 3×30
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
   (+~30% thickness, bottom 22%), wall body (`h`), **crenellated parapet** (merlon boxes every
   ~2.2u along the top). A wall is CONTINUOUS — towers punctuate, gates interrupt, nothing else.
3. **Drum towers** every ~26u of accumulated curtain run: r≈4.5–5.2, h = wall+5, crenellated
   crown + roof (style-keyed: cone / square / pavilion).
4. **Gatehouse** per `gates[]`: twin flanking towers (h ≈ wall×1.55), recessed arch block over
   the opening, portcullis slit (dark + faint emissive). Leave the wall OPEN within ~7u of the
   gate point — the road passes through.
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

- A castle parcel in your client shows: raised ward, continuous crenellated curtain with drum
  towers, an open gate where the road enters, a keep silhouette taller than the walls, banner.
- Non-castle parcels: zero change. Old manifests without `castleGeom`: zero change.
- Collision/pathing/HP identical before/after (visuals draped over the same structure anchors).
