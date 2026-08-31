# HS2 (Emberfall) world-terrain field — build report

**Satellite build for the CF ParcelMap Design Agent, 2026-08-31.**
Deliverables: `map-service/tools/world_terrain_hs2.mjs` (generator) → `data/world-terrain/HS2.json`
(sha256 `dd384437fc400f87…`, 55,230 bytes) + this report. No shared code, tests, registry, or other
zones' data touched.

## Identity applied

**THE EMBER-CRYSTAL EMPIRE** (owner-locked 2026-08-31, `docs/maps/SKY-ZONES-DESIGN.md` —
supersedes the atlas §2.6 "floating volcano/caldera"): the fallen angels' high-tech war capital
powered by ember-red fire crystals. **Zero volcanism** — no magma rivers, no lava, no `magma: true`
flag anywhere in the field (grep-clean). Crystal is expressed as ROCK-class ridge spurs; the wired
`EMBER_CRYSTAL` → `ember`/`ashen` palette chain renders them red crystal automatically. Massing
kept from `CONTINUOUS-WORLD-TERRAIN` §3b: Mont-Saint-Michel / Minas-Tirith tiered fortress, one
switchback gate-road, the keep crowning the top.

**Owner addendum (2026-08-31, relayed mid-build — both applied):**
1. Water minimal ("probably no river" on sky isles): the field carries exactly **one** small
   reservoir — the Forge Basin, `fill: true`, r ≈ 1.8 u, nothing deep/sailable.
2. Three stacked land layers (5th-Element vertical city → 3 walkable decks): the tier rings are
   **exactly three** strong banded concentric tierwalls — LOWER WORKS (r 26) / MID CITY (r 17) /
   CROWN (r 9) — pure ridge structure, no new data shapes, so windowed parcel maps inherit the
   3-level terraced read.

## Layout summary

- **All four edges = sky-void rim ridges** (5 rim pieces). One authored break: the WEST rim gate.
- **West**: poi `HS2-GATE-AEROPOLIS` ("The Ember Gate", GATE, connects HS1↔HS2) — the isle's ONLY
  friendly door (zoneLinks HS1→HS2 airship branch). Westgate Bastion keeps its approach.
- **North rim = the war front vs HS3**: poi `HS2-WARFRONT` ("The Sky-Throne Front", `warFront:
  true`, `facing: "HS3"`, NO gate/link — registry `skyWar` respected), fortified by THE BULWARK
  (second ridge line, 2 reaches, one gap for the War Road) + 2 WAR_CAMP pois (Westmuster /
  Eastmuster) + the Bulwark Keep + the Arsenal Yards staging landmark.
- **The tiered imperial city** centred on the crown castle parcel: 3 tierwalls with one gap each,
  rotated W→S→E, so **THE GRAND ASCENT** (highway) switchbacks from the Ember Gate through every
  tierwall to the war-palace. Military geometry: the Muster Ring (outer ring avenue) + one Parade
  per annulus + the Crown Court, 14 verbatim-straight radial cross-streets, and the gridded Forge
  Ward (4 straight streets) around the Forge Basin + The Crystal Forges. Second highway: **THE WAR
  ROAD** (Muster Ring north point → Arsenal Yards → Bulwark gap → front staging).
- **Crystal fields** (ROCK spur clusters outside the city, 17 spurs) with 4 MINE pois: the
  Emberglass Reach (NE), the Shard Tiers (SE), the Cindersea (SW), the Redvein Scarps (W).
- **Forge/reactor flavor pois** (3): The Crystal Forges, Reactor Ward (Mid City), The Arsenal Yards.
- **Rural web**: 16 LARGE "Garrison" anchors (union-find, connect-don't-double, straighter/lower
  meander than surface zones — an empire marches) + 18 seeded MEDIUM "Steading" local feeders.

## Deterministic pick table (rules in the tool header; SEP 15; playable = has L3 subdivision)

HS2 ships **0 EPIC / 0 GIANT** (16 LARGE / 49 MEDIUM / 386 SMALL), so the §3c importance→size
ladder adapts: LARGE (biggest class present) carries the PALACE. All picks landed on their
expected estates; every castle POI sits on a playable L3 parcel (UW2 `castleAt` rule).

| Castle | Kind | Rule (nearest playable LARGE to…) | Estate | Castle parcel | heroParcels |
|---|---|---|---|---|---|
| **The Ember Throne** | PALACE | zone center (59.0, 58.24) | 3050435 | 30504350016 @ (62.4, 50.6) | 3 (+`estateMapId` 3050435) |
| Westgate Bastion | KEEP | the Ember Gate (2, 54) | 3050441 | 30504410088 | 3 |
| The Bulwark Keep | KEEP | war-front staging (60, 10) | 3050448 | 30504480153 | 3 |
| Paradewatch Keep | KEEP | south approach (57, 80) | 3050439 | 30504390106 | 3 |
| Shardwatch Keep | KEEP | the Shard Tiers (96, 89) | 3050436 | 30504360107 | 3 |
| Cinderholm Keep | KEEP | the Cindersea (33, 93) | 3050438 | 30504380121 | 3 |
| Seamwatch Keep | KEEP | the Redvein seams (25, 26) | 3050449 | 30504490110 | 3 |

heroParcels via the shared `world_hero_parcels.mjs` rule (castle parcel first, LARGE quota 3 —
no deferrals: all 7 estates are subdivided). A sanity guard throws if the crown pick ever leaves
the authored tier-geometry window (45–75 × 38–68).

Note: `attachHeroParcels` stamps `estateMapId: "3050435"` on the PALACE per the shared schema —
the pre-designed estate map for it does not exist yet (`estate_palace_maps.mjs` has not run for
HS2); flagging for the parent session. `SKY-ZONES-DESIGN.md` also proposes a PALACE style key
`ember_bastion` for `PALACE_STYLES` — shared-code change, deliberately NOT made here.

## Feature counts (loadWorldField('HS2'))

| list | count | breakdown |
|---|---|---|
| rivers | 1 | the Forge Basin (`fill: true`; **0 `magma` flags**) |
| roads | 56 | 2 highways (Grand Ascent, War Road) · 16 secondaries (Muster Ring, 2 Parades, Crown Court, Forge Road + 11 garrison-web) · 38 locals (14 cross-streets, 4 Forge Ward grid, 2 camp lanes, 18 steading feeders; 0 approaches needed — every castle already sits ≤1 u from the network) |
| ridges | 27 | 5 sky-void rims · 2 Bulwark reaches · 3 tierwalls · 17 crystal spurs |
| castles | 7 | 1 PALACE + 6 KEEP (table above) |
| pois | 11 | gate ·1, war front ·1, war camps ·2, forge/reactor landmarks ·3, mines ·4 |

## Validation results (all pass)

1. **Determinism**: in-tool double-build sha256 compare passes; a full second process rerun
   reproduces byte-identical output (`dd384437fc400f87…`).
2. **worldfield loads**: `loadWorldField('HS2')` → counts above; `allPlaces` sees 18 field places.
3. **Parcel generation** — 10 parcels through `worldParcel(l3Row(id))` → `generate()`:
   - all 7 castle heroParcel[0]s → `meta.castleGeom` emitted with correct tier (PALACE ×1, KEEP ×6);
   - 3 feature-straddling singles: 50500620001 (on the Grand Ascent — 1 road windowed + edge
     crossing), 50501120003 (on Tierwall II — 1 ridge windowed), 50500690001 (on the Forge Basin —
     the fill river + the Forge Ward road windowed);
   - palette roll on every artifact ∈ {`ember`, `ashen`} (the EMBER_CRYSTAL biome roll) —
     observed both (ember ×7, ashen ×3).
4. **Shared suite**: `node maps/test/castle_geometry.test.js` → `37 castle parcels + 11 estate
   maps | 1911 passed, 0 failed` (HS2 is not in the sweep's zone list; nothing shared broke).
