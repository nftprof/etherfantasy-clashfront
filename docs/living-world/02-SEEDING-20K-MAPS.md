# 02 — Seeding every map (≈ 20 K minted, 284 K total parcels)

Owner question: *"We have 20K maps. What's the best way to build a world that's interesting and unique
on each play: procedural, or does it need custom testing?"*

**Answer: both, in layers.** Hand-author the few places that carry the story. Generate everything else
from **archetype templates × procedural parameters**. Test the **templates**, not the maps: by
invariants on every map, and by **headless-sim sampling** of a few hundred.

## 1. What "20K maps" is

| Set | Count | Source |
|---|---|---|
| Minted land (what players own) | 17,066 L3 + 729 L2 ≈ **17.8 K** | `LAND-CONTRACTS-AND-SALE.md` |
| All L2 estates | 8,482 | `parcels-l2.json` |
| All L3 singles | 284,314 | `l3/<ZONE>.json` |
| Castles / authored world POIs | 67 / 80 | `world-terrain/*.json` |

## 2. Three layers (matches the map pipeline's base vs seed split)

| Layer | What | Made by | When | Re-runnable |
|---|---|---|---|---|
| ① **Base terrain** | Landscape, water, ridges, roads (no units) | Map pipeline bake (exists, `MAP-PIPELINE-GLOSSARY`) | Once | yes |
| ② **Living-world seed** (this work) | POI Nodes + garrison templates + event-deck seeds per parcel | `tools/living-world/*` from archetype templates | Lazily, on first visit, or in bulk offline (cheap) | yes: same input → same bytes |
| ③ **Runtime draw** | Which events fire on *this* visit | The sim: `PRNG(world.seed, tick, nodeId)` | Every battle | replayable |

Uniqueness comes from ③ as much as ②. The **same** harbour plays differently every visit (S2 lesson
10: the event deck), so a map is not "used up" after one play.

## 3. Who is hand-authored vs procedural

| Tier | Count | How it's made | Tested by |
|---|---|---|---|
| **Story places**: 67 castles, 80 authored POIs (ports, gates, boss stage), hero parcels | ≈ 450 | Authored positions; POIs seeded by context (`castle-pois.json`), then **designer-frozen** (`OWNER_FROZEN` in the map registry) after review | Hand play + sim sampling |
| **Estates** (L2) | 8,482 | Procedural: 1–3 POIs by size class and context | Invariants + sim sampling per archetype × biome |
| **Singles** (L3) | 284,314 | Procedural: 0–1 POI. Most stay quiet frontier (density cap) | Invariants only, plus a sampled 1 % |

Design effort goes into **~12 archetypes × ~6 biomes**, about 70 templates, not 20,000 maps.

## 4. The seed function (per parcel)

```
lwSeed      = fnv1a(`${parcelId}|${zone}|${biome}|lw1`)        // same style as the base pipeline's seedFor
context     = { layer, zoneStrength, sizeClass, distToCastle, coastD, riverD, ridgeD, roadD, nearestPort }
ring        = distToCastle ≤ 12 → CASTLE (castle-pois own it)
            | ≤ 40          → FRONTIER (merc posts, caravans, airdrops, war camps)
            | > 40          → WILD     (lairs, barbarian camps, salvage, vents)
candidates  = archetypes whose layer + affinity match the context and ring
count       = sizeClass budget (EPIC 3, GIANT/LARGE 2, MEDIUM 1, SMALL 1, SINGLE 0–1 with a density roll)
pick        = weighted draw over candidates with mulberry32(lwSeed); ≤ 6 Nodes per parcel (overlay rule)
params      = template defaults × zoneStrength (threat, garrison stats) × a ±15 % seeded jitter
```

**Region guarantees** apply on top of the per-parcel draws:

- every region gets ≥ 1 of each event type it can host;
- no two barbarian camps sit within 20 u of each other;
- harbours only where `coast` exists.

These are enforced by a second deterministic pass.

## 5. Validation without hand-testing 20 K maps

1. **Invariants on every seeded parcel** (CI, seconds):
   - the build is deterministic (built twice, byte-compared, the pipeline's rule);
   - caps hold (≤ 6 Nodes, garrison ≤ 6, threat 0–100);
   - layer and affinity are valid;
   - every region meets its guarantees.
2. **Headless-sim sampling** (nightly):
   - For each archetype × biome, draw **N = 30** seeded parcels and run the battle in the deterministic
     server kernel (`server/sim`, already headless).
   - Measure: hold time, attacker losses, event count per battle, and whether the S2 floors hold.
   - Floors checked: the idle defender lasts ≥ 10 min; a 1.5× attacker breaches ≤ 12 min (doc 03); the
     Guardian's share ≤ 20 % (doc 04).
   - A template out of band gets **re-tuned in `poi-archetypes.json`**, never patched map by map.
3. **Designer overrides** for the story tier only. The designer can freeze or edit a parcel's Nodes; the
   seeder respects `OWNER_FROZEN`.

## 6. Cost

Seeding all 284 K parcels is a pure function over JSON (seconds of CPU). The sim sample is about
70 templates × 30 runs = **2,100 headless battles a night**. Nothing per map is hand-made except the
≈ 450 story places.
