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
threat      = bandThreat(ring, zoneStrength, jitter)  // D6f: the ring's range (threatBands), ordered by log zone strength
params      = template defaults × threat (garrison stats)
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

## 7. First matrix run (D6e, `reports/SIM-MATRIX.md`)

`tools/living-world/sim_matrix.mjs` runs §5.2 for real. Every (archetype, ring, ground) cell the seeders produce gets
N = 4 seeded POIs through the shared harness (`sim_harness.mjs`), judged against its band from doc 06 §2: in-castle
POIs are a **RAID** (6–12 min); frontier and wild POIs are a **SKIRMISH** (3–6 min).

- **57 cells: 30 ok, 14 SOFT, 8 SLOW, 5 HARD.** That leaves **46 % of seeded garrisoned POIs** in out-of-band cells.
- **The cause is the threat curve, not the templates.** Threat follows zone strength, so:
  - Underworld POIs (median threat 50–85) are **SLOW** or **HARD**: wild lairs under the surface never breach in 12 min;
  - surface in-castle POIs (threat 12–26) are **SOFT** raids at 1–5 min;
  - surface frontier lairs and war camps (threat ≈ 16) fall in about 2:30.
- **Fix (next item, D6f):** clamp each ring's threat into the range that lands its band, keeping zone strength as the
  *ordering* inside that range. Deep zones stay the hardest skirmishes, but still skirmishes. The tuning lives in
  `poi-archetypes.json` (doc 02 §5 rule), never per map.
- The battlefield is still flat in the harness, so ground only acts through threat. Terrain modifiers are a later item.

### 7b. The banded threat curve (D6f): 46 % → 0.3 % out of band

`tools/living-world/threat.mjs` replaces the three seeders' separate formulas with one curve:

```
threat = lo + (hi − lo) × clamp(0.8 × depth + 0.3 × (jitter − 0.5) + 0.1)        // estates + singles
threat = lo + (hi − lo) × clamp(0.55 × depth + 0.35 × (tier − 1)/2 + 0.1)         // in-castle POIs
depth  = log(zoneStrength) / log(5)                                              // CGI ×1 → 0, UW3 ×5 → 1
```

| Ring | Band | Threat range (`poi-archetypes.json` `threatBands`) |
|---|---|---|
| CASTLE | RAID 6–12 min | 36–60 |
| FRONTIER | SKIRMISH 3–6 min | 18–30 |
| WILD | SKIRMISH 3–6 min | 24–34 |

- **Re-seeded and re-run: 56 of 57 cells ok.** Only 16 of 6,270 POIs sit out of band: in-castle barbarian camps at 5:38,
  just under the 6-min floor.
- **The Underworld is still the hardest place to fight, but now a hard skirmish, not a wall.** An attacker who walks
  in with a sensible force breaks a UW3 lair in about 6 minutes, not never.
- **Same placements.** The jitter uses the same single seeded draw, so every Node stays where it was; only its threat
  changed. The ≥ 85 % in-band floor is now a test.

### 7c. Terrain in the harness (D14)

The harness now applies cf-overworld's canon terrain modifiers (doc 04, attacker / defender) by POI ground, from
`data/living-world/terrain-mods.json`:

| Ground | Canon row | Modifiers |
|---|---|---|
| FOREST | FOREST | 0.95 / 1.05 |
| RIDGE | HILLS | 0.90 / 1.10 |
| WATER | RIVER crossing | 0.90 / 1.10 |
| SKY, UNDER | none yet | neutral ⚙ |

They act as damage-taken multipliers: defenders take attacker damage × the attacker mod, attackers take defender
damage × the defender mod. It's opt-in, so `SIM-SAMPLE` and the Guardian numbers are unchanged; `sim_matrix` turns it
on (`--terrain off` gives the flat baseline).

- **Ground now matters.** Forest adds ~0:30 to a skirmish; ridges and water crossings add 1:20–2:40. Lairs: plain 4:06,
  forest 4:40, ridge 6:44.
- **51 / 57 cells ok; 5 % of POIs out of band.** The 5 SLOW cells are wild lairs on ridges and in water, frontier
  harbours on ridges and water, and salvage sites. They run 6:05–6:44, just past the 6-min skirmish ceiling.
- **That's the canon high-ground advantage doing its job.** The tuning question is whether defensible ground should
  get a slightly lower threat so the fight still lands in band. That's the next item (D14b), still in `threatBands`
  and never per map.

### 7d. Ground-aware threat (D14b): back to 56 / 57 with terrain on

`threatBands.groundShift` gives **RIDGE and WATER −6 threat**: the ground where canon gives the defender ×1.10. The
ring's floor moves down with the shift, because the wild lairs were already at the WILD floor (24) and still ran 6:15.
The terrain makes up the difference.

| Ground | Wild lair, before | Wild lair, after |
|---|---|---|
| Plain | 4:06 | 4:06 |
| Ridge | 6:44 | 4:49 |
| Water | 6:44 | 4:49 |

- High ground still holds longer than open plain: plain 4:06 < forest 4:40 < ridge 4:49.
- **Matrix with canon terrain: 56 / 57 cells ok, 0.3 % of POIs out of band** (only the 16 in-castle barbarian camps,
  at 5:38).
- The test floor is now ≥ 95 % in band.
- Re-seeded estates and singles: same placements, only the threat on ridge and water parcels changed.

### 7e. The last cell (D24): 57 / 57

In-castle barbarian camps fell at 5:38, under the 6-min RAID floor. `threatBands.kindShift` `CASTLE:BARBARIAN_CAMP`
+5 is a per-archetype nudge inside one ring, still in the template and never per map. With it the surface camps hold
to **6:21**. The UNDER camps, which the band clamp now caps at 60, come down from 11:17 at a 50 % breach rate to
**8:36** at 100 %.

**The matrix now reads 57 / 57 cells in band with canon terrain on, and 0 of 6,270 seeded POIs out of band.** A test
holds every cell there.

