# HS1 (Aeropolis) — world-terrain field build report

**Satellite build for the CF ParcelMap Design Agent, 2026-08-31.**
Deliverables: `map-service/tools/world_terrain_hs1.mjs` (reproducible generator) →
`data/world-terrain/HS1.json` (the authored macro field) + this report. No shared code,
tests, registry, or other zones' data touched.

## Identity delivered

The **Castle in the Sky** (owner-locked `docs/maps/SKY-ZONES-DESIGN.md` 2026-08-31): an
**abandoned leafy utopia** — Machu Picchu / Cusco terraced sky citadel gone green, bird flocks
as the living weather, empty plazas, and the ONE working airship dock as the only maintained
thing. Base pattern = UW2's sealed-vault rims with **sky-void** in place of rock; the only rim
breaks are the three airship gates.

**Owner addendum (2026-08-31), applied:** water is MINIMAL + decorative (two small fill pools +
three narrow garden channels; nothing deep/sailable, no naval semantics), and the terracing is
the **three-band keystone** — three STRONG contour terrace walls (Garden r80 / Middle r50 /
High r30 about the summit heart TC=(100,55)) so windowed parcel maps inherit a 3-level stacked
read. No new data shapes — ridges only.

## Data-reality notes (they shaped the design)

- The one **EPIC (1040345) sits EAST at (101.9, 54.7)**, not at the isle center — so the
  summit heart is the eastern crag (a citadel perched over the void, which IS the Machu Picchu
  read) and the terrace walls arc about it, descending westward.
- **5 of 6 GIANTs cluster in the SOUTH** — so the stepped lower city (the Cusco districts) is
  the dock quarter under the Middle Wall, exactly where the Gate to Heaven lands.
- The EPIC is **not L3-subdivided** (zone-wide 0-EPIC pattern) ⇒ Aeropolis heroParcels
  **DEFERRED** (`heroParcels: []` + note, `estateMapId: 1040345` for the pre-designed estate
  map per canon 4/5). Playable: 5/6 GIANTs, 12/16 LARGEs.
- **SEP = 10** (not UW2's 15): scaled to the smaller isle (viewBox 113.6×116.01 vs UW2's
  150.5); the binding pair is Gardenhold ↔ Empyreawatch at 10.9 u — a hold and its watch-keep,
  intended.

## Pick table (deterministic rules in the tool header; gate keeps picked before the remaining castles)

| Castle | Kind | Estate | At (zone) | Rule | heroParcels |
|---|---|---|---|---|---|
| **The Aeropolis** | PALACE | EPIC 1040345 | 101.9, 54.7 | the one EPIC (summit citadel) | [] deferred + estateMapId |
| **Heavensgate Castle** | CASTLE | GIANT 2040342 | 60.8, 109.0 | playable GIANT nearest the dock (57,114.2) | 5 |
| **Terracehall Castle** | CASTLE | GIANT 2040341 | 78.6, 105.9 | playable GIANT nearest the lower-city heart (75,103) | 5 |
| **Gardenhold Castle** | CASTLE | GIANT 2040339 | 30.1, 16.1 | playable GIANT nearest the garden heart (38,22) | 5 |
| **Emberwatch Keep** | KEEP | LARGE 3040337 | 94.6, 83.3 | playable LARGE nearest the Ember Gate (111.7,82) | 3 |
| **Empyreawatch Keep** | KEEP | LARGE 3040326 | 39.9, 20.2 | playable LARGE nearest the Empyrean Gate (52,1.9) | 3 |
| **Stairwatch Keep** | KEEP | LARGE 3040335 | 51.2, 60.0 | playable LARGE nearest the Middle Wall stair-gate (50.3,60.2) | 3 |

Castle POI point = the estate's L3 child center nearest the estate center (UW2 rule);
heroParcels via the SHARED `world_hero_parcels.mjs` rule (castle parcel first, GIANT 5 /
LARGE 3), 24 designated total.

## Feature counts

| List | Count | Content |
|---|---|---|
| ridges | 16 | 7 sky-rim segments ("The Sky's Edge", breaks only at the 3 gates) + 6 terrace-wall reaches (Garden/Middle/High, widths 2.0–2.2 — the three-band keystone) + 2 Citadel Crown reaches + the Roost Crag |
| rivers | 5 | 2 small `fill:true` pools (the Mirror of Heaven, the Gardens Pool) + 3 narrow channels (the Gardenfall stepping down the walls; the Cloudfall off the WEST rim; the Veilfall off the SOUTH rim — the cataract arriving airships pass) |
| roads | 33 | 1 highway (**The Way of Ascent** — the grand switchback: dock → Middle/High/Crown stair-gates → summit, a true zigzag, one leg per band) + 16 secondary (the Processional Way crescent, the Empyrean Way, the Emberway, + 13 overgrown terrace-web ways) + 16 local (5 dock-quarter/town lanes incl. the Landing Stair + the Silent Plaza round, 10 green lanes — capped at 10, half a living zone's, the abandonment read — 1 approach) |
| castles | 7 | 1 PALACE, 3 CASTLE, 3 KEEP (table above) |
| pois | 6 | **HS1-DOCK-GATEWAY "The Gate to Heaven"** (S rim, connects EDU/BUS→HS1 — the Gateway Anchorage of zoneLinks), **HS1-GATE-EMBER "The Ember Gate"** (E rim → HS2), **HS1-GATE-EMPYREA "The Empyrean Gate"** (N rim → HS3), + 3 flavor landmarks: The Silent Plaza, The Hanging Gardens, The Roost of a Thousand Wings |

File: `data/world-terrain/HS1.json`, 40,567 bytes, sha256 `6e03f24cc09e7637…`.

## Validation results (all pass)

1. **Determinism:** the tool builds twice and sha256-compares before writing — byte-identical.
   Plus an in-tool invariant: the four authored ways (Ascent/Processional/Empyrean/Emberway)
   cross NO terrace-wall ridge (they pass the authored stair-gaps) — hard exit otherwise.
2. **worldfield.js load:** `loadWorldField('HS1')` → castles 7, ridges 16, rivers 5, roads 33,
   pois 6 — loads clean.
3. **generate() sweep:** all 24 hero parcels + 3 plain parcels (dock/garden/summit singles) =
   **27 parcels generated, zero throws**; all 6 castle parcels (first heroParcel of each
   subdivided estate) emit `meta.castleGeom`.
4. **Shared regression:** `node maps/test/castle_geometry.test.js` → 37 castle parcels +
   11 estate maps, **1911 passed, 0 failed** (its zone list is hardcoded EDU/HUB/BUS/ENT/
   UW2/UW3 — HS1 not swept yet; nothing shared was broken).
5. **Bounds:** every feature point inside the viewBox (bbox 1.45–112.03 × 1.48–114.68 within
   0 0 113.6 116.01).

## Follow-ups for the parent session (not done here — out of scope)

- Add `"HS1"` to `castle_geometry.test.js`'s zone list to put the 6 new castle parcels under
  the sweep.
- `aeropolis_terrace` PALACE style key (`SKY-ZONES-DESIGN` §"what building each field
  requires") for the Aeropolis estate map + the estate-map bake (`estate_palace_maps.mjs`).
- Mosaic + heightfield bakes (same pipeline as the eight built zones).
- zone-registry `zoneLinks` skyAnchor strings can now point at `HS1-DOCK-GATEWAY` /
  `HS1-GATE-EMBER` / `HS1-GATE-EMPYREA` (the field was "unbuilt" in their notes).
- Note: `worldfield.js l3Row(parcelId)` takes ONLY the parcelId (zone derived from the id) —
  the brief's `l3Row('HS1', id)` signature is outdated.
