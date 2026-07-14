# Asset packs — themed render skins, CT-gated (owner directive 2026-07-13)

> Owner: (a) cluster asset THEMES so a dried/desert region never grows lush green trees — force-limit
> prop types by biome; (b) SPECIAL asset packs ("candy world" — cotton-candy rocks etc.), including
> AI-authored packs where the model proposes the exact polygons/shapes; (c) packs are **paid ⚙ $CT
> upgrades only, never the default**. This brief specs all three so the maps + MOBA + economy sides
> build against one contract.

## 1. Theme coherence (the DEFAULT look — free, always on)

Already shipped 2026-07-13 (`worldfield.zoneBiomeFamily` + `generate()` palette bounding): a parcel
with no declared biome rolls its palette ONLY within its zone's `biomeFamily`
(`data/zone-registry.json`) — EDU/Arcadia = verdant/autumn/sakura, UW3/Luxuria = volcanic, HS3 =
snow… Regional bucketing (~6 zone-units) keeps neighbours matching. Remaining coherence gaps, in
order:

1. **Scatter colours are biome-blind (MOBA module).** `ef_battlefield.js` TUNED scatter (grass
   tufts/bushes) is always green — on a desert/volcanic floor that reads wrong (the owner's dried-land
   screenshot). ASK MOBA BattleEngine RAW: drive scatter + tree HSL from `manifest.biome` (the
   converter already ships per-palette `treeHSL`; scatter needs the same). Tracked as the one
   remaining upstream item.
2. **Tree TYPE by biome** (owner: "force limit type of trees placement"): the pack schema below
   covers it — the default pack per biomeFamily simply restricts the prop set (desert → scrub +
   cactus-shape + dead-tree; snow → firs; volcanic → obsidian shards + charred trunks).

## 2. The pack contract — `RenderAssetPack` (data-driven, exact shapes)

A pack is pure DATA consumed by the one renderer (module/converter) — no new art pipeline. Geometry
is specified as **parametric primitive stacks** (the same vocabulary the module already builds trees
from), so an AI can author a pack by emitting JSON — "exact polygon and shapes":

```jsonc
{
  "schema": "ef-asset-pack/1",
  "packId": "candy_world_v1",
  "name": "Candy World",
  "gate": { "kind": "CT_UPGRADE", "priceCt": null },   // ⚙ owner prices it; null = not yet listed
  "floor": "candy_01",                                  // optional custom floor png (else tint an existing one)
  "floorTint": "#ffd9ec", "fogTint": "#2a1420", "waterMode": "water", "waterTint": "#ff9ecb",
  "props": {
    "TREE": [{                                          // replaces the biome's tree set
      "id": "cotton_candy", "weight": 3,
      "parts": [
        { "geo": "cylinder", "args": [0.35, 0.5, 2.6, 6], "y": 1.3, "color": "#c98a5a" },       // stick
        { "geo": "sphere",   "args": [2.6, 7, 6],        "y": 4.2, "color": "#ff9ecb", "hslJitter": [0.02, 0.1, 0.08], "squash": [1, 0.85, 1] },
        { "geo": "sphere",   "args": [1.7, 7, 6],        "y": 5.6, "color": "#ffc1de", "offset": [0.9, 0, 0.4] }
      ], "flatShading": true, "scaleJitter": [0.8, 1.3]
    }],
    "ROCK": [{ "id": "gumdrop", "weight": 1,
      "parts": [{ "geo": "dodecahedron", "args": [2.2], "y": 1.2, "color": "#7ad1ff", "hslJitter": [0.3, 0.2, 0.1], "squash": [1, 0.72, 1] }] }],
    "SCATTER_GRASS":  [{ "id": "candy_cane_sprout", "parts": [{ "geo": "cone", "args": [0.12, 0.9, 5], "color": "#ff5a7a" }] }],
    "SCATTER_BUSH":   [{ "id": "marshmallow",       "parts": [{ "geo": "sphere", "args": [0.8, 6, 5], "color": "#fff3f6", "squash": [1, 0.8, 1] }] }]
  }
}
```

- `geo` ∈ the r128 primitive set the module already uses: `cone | cylinder | sphere | dodecahedron |
  box | octahedron | torus` (+ `lathe` with a 2D profile polyline for true custom silhouettes —
  that's the "exact polygon" hook: the AI emits the lathe profile points).
- Determinism: `hslJitter`/`scaleJitter` draw from the parcel's seeded RNG — same look every load.
- The pack REPLACES the default prop set for the parcel; placement/counts/keep-outs stay the
  converter's (playability invariants untouched — packs are pure cosmetics, never gameplay).

## 3. AI-authored packs

The designer's existing LLM prompt flow gains a "theme pack" verb: the owner types "make it a candy
world" → the LLM emits an `ef-asset-pack/1` JSON (schema-validated, primitive whitelist, colour +
count caps) → stored in the registry next to the design (`pack.v{N}.json`), previewed live in the
3D designer. Guardrails: schema validation is the sandbox — an LLM can only compose whitelisted
primitives with bounded args; nothing executable.

## 4. The ⚙ $CT gate (never default)

- Default render = the biome pack. A special pack applies ONLY while the parcel carries a PAID
  upgrade: `packId` + purchase receipt on the design row.
- Sits exactly on **maps economy Hook 2** (invest CT → map budget tier, `docs/maps/ECONOMY-SEAM.md`
  — the still-owed keyed POST): same flow, `kind: "ASSET_PACK"` purchase. CT price = ⚙ owner's;
  burns/rake per decision 17 (net-sink).
- Enforcement server-side: `render.json` embeds pack data only if the row's purchase is valid — a
  client can't opt into a paid skin.
- On resale/occupation the pack follows the LAND (it's a land improvement, `LAND-VALUE-AND-
  IMPROVEMENT.md`).

## 5. Build order

1. (mine) `pack.v{N}.json` registry slot + `render.json` embedding + designer LLM verb + validation.
2. (MOBA BattleEngine RAW) module reads `manifest.pack` → builds props from primitive stacks
   (superset of its current tree builder); biome-driven scatter colours (item 1.1) ships with it.
3. (CF Overworld eco) Hook 2 purchase POST + receipt on the design row.
Owner prices packs; nothing goes live priced by default.
