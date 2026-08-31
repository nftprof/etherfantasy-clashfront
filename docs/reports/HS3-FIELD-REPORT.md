# HS3 (Empyrea) — World-Terrain Field Report

**Satellite build for the CF ParcelMap Design Agent, 2026-08-31.**
Deliverables: `map-service/tools/world_terrain_hs3.mjs` (generator) → `data/world-terrain/HS3.json`
(sha256 `7f58a577fbb749d0…`, byte-identical double-build). No shared code, tests, registry, or other
zones' data touched.

## Identity implemented

**THE FROZEN PINNACLE** (`docs/maps/SKY-ZONES-DESIGN.md`, owner-locked 2026-08-31): the highest
place, ice and frozen (biomeFamily SNOW) — a white-gold divine city above the weather line,
pilgrim ways converging upward through glacial terraces to the summit Sanctum. Floating sky isle:
UW2's sealed-edge pattern with sky-void rims. The deep-canon secret stays beneath the ice — one
sealed poi, neutrally named, no tech language anywhere in the JSON.

**Owner addendum (2026-08-31), applied:**
- **Minimal frozen water** — ONE small still summit pool (the Mirror of Heaven, `fill:true`,
  authored width 2.6 zone-u / pool radius 1.3 — nothing deep or sailable) + TWO short melt
  channels (the Weeping of the Ice ~20 u, the Dawnmelt ~12 u). No long rivers, no magma.
- **Three stacked land layers** — EXACTLY three strong banded glacial terrace rings (pure
  `ridges[]`, no new shapes): **Layer 1 the Pilgrims' Ring** (r ≈ 52) → **Layer 2 the White
  Terraces** (r ≈ 30) → **Layer 3 the Sanctum Ring** (r ≈ 12, the precinct wall with three 12°
  processional doorways). Ring gaps exist only where the pilgrim ways pass, so windowed parcel
  battle maps inherit the 3-level terraced read.

## Pick table (deterministic rules in the tool header; SEP = 12, ties by parcelId)

| Role | Rule | Pick | Center | L3? |
|---|---|---|---|---|
| **PALACE — The Sanctum of Empyrea** | the EPIC nearest summit anchor (45,21) — the zone's only EPIC | **1060463** | (45.5, 20.6) | **NO → heroParcels DEFERRED** (estate-map path, canon 4/5; `estateMapId: 1060463`) |
| **KEEP — Pilgrimwatch** (gate/anchorage watch) | playable LARGE nearest the Aeropolis Gate (2.9,92) | **3060459** | (20.8, 45.4) | 3 heroParcels, castle parcel `30604590122` |
| **KEEP — Shieldgate** (war bastion, the War Road) | playable LARGE nearest the war front (57,111) | **3060457** | (52.3, 32.9) | 3 heroParcels, `30604570104` |
| **KEEP — Dawnshield** (war bastion, the Dawnway) | playable LARGE (excl. prior) nearest the war front | **3060461** | (64.7, 32.6) | 3 heroParcels, `30604610102` |
| **KEEP — Aurora** (NE terrace keep) | playable LARGE nearest the NE anchor (95,12) | **3060462** | (79.3, 21.5) | 3 heroParcels, `30604620149` |

Data facts surfaced: HS3 has **0 GIANTs** (no CASTLE tier) and every LARGE sits in the **northern
terraces** (y 21–46) — the estate table put no LARGE at the south rim, so the war rim itself is
held by the **Bastion Line ridge + HS3-WARFRONT poi**, and the two bastion KEEPs anchor where the
southern climbs (War Road / Dawnway) pass the terrace rings (documented in `_meta.castles`). The
2 non-playable LARGEs (3060458 E, 3060460 NW) are left wild. Castle POI point = nearest L3 child
center to the estate center (UW2 rule) — all four keep POIs sit on their castle parcels.

## Feature counts (loadWorldField('HS3'))

- **rivers 3** — 1 fill pool (HS3-LK-MIRROR) + 2 band-clamped melt channels
- **roads 84** — 1 highway (the Way of Ascent: gate → anchorage → summit) + 56 secondary (the
  War Road, Dawnway, Vesper Way, Aurora Stair, the straight Last Ascent processional + the
  51-way shrine web over the 60 LARGE+MEDIUM anchors) + 27 local (Sanctum Walk, Dawn/Vesper
  platform spokes, Anchorage Quay, 4 keep crescents, 18 seeded SMALL shrine lanes, 1 castle
  approach)
- **ridges 18** — 5 sky-void rims (W rim split at the ONLY break, the Aeropolis Gate) + 2
  Bastion Line reaches (the fortified war rim, one sally gap, no friendly gate) + 4+4+3
  terrace-ring arcs (the three layers)
- **castles 5** — 1 PALACE + 4 KEEPs (ladder: EPIC=PALACE / LARGE=KEEP; no GIANT in HS3)
- **pois 8** — HS3-GATE-AEROPOLIS (GATE, connects HS1↔HS3 — the branch; canon: all surface
  airships land at HS1 first), HS3-ANCHORAGE (AIRSHIP_PORT — receives the Arcadia/Porthaven
  ways via HS1), HS3-WARFRONT (WAR_FRONT, `warFront:true` — the Emberfall Front, south rim,
  gateless), HS3-VAULTS (LANDMARK, `sealed:true`, "The Deep Vaults" — neutral wording only),
  HS3-MIRROR, HS3-TERRACE-WHITE, HS3-PLAT-DAWN, HS3-PLAT-VESPER (the clean radial platforms)

## Validation results (all pass)

1. **Determinism:** in-tool double-build sha256 compare — byte-identical (`7f58a577fbb749d0`).
2. **worldfield loads:** `loadWorldField('HS3')` → counts above; probes confirm rims, Bastion
   Line, all three ring layers, the Mirror pool, the processional, and the ring GAPS (War Road
   passes az-90 with 4 edge crossings, no ridge) window into the right parcels.
3. **Parcel generation:** all 4 keep heroParcel castle parcels + 3 non-castle probes
   (anchorage / warfront / mid-terrace) generate clean; every castle parcel emits
   `meta.castleGeom` (KEEP tier, 1 ring). Bonus: full `runAudit` on all four keep maps —
   1 walk component, 0 isolated cells, 100/100 walks, all stairs ok.
4. **Shared suite untouched-and-green:** `maps/test/castle_geometry.test.js` 1911 passed / 0
   failed (37 castle parcels + 11 estate maps); `hero_parcels.test.js` 34/0;
   `worldmap.test.js` green.

## Notes / follow-ups for the parent session

- **PALACE style key:** `SKY-ZONES-DESIGN.md` names `empyrean_ice` for the HS3 ice-palace —
  `PALACE_STYLES` in `maps/generate.js` is shared code, deliberately NOT touched here. Add
  `HS3: "empyrean_ice"` when integrating.
- The Sanctum EPIC (1060463) is un-subdivided → its pre-designed estate map
  (`estate_palace_maps.mjs`, key 1060463) is still to be generated/committed.
- `castle_geometry.test.js` / `hero_parcels.test.js` sweep a hard-coded zone list — adding
  `"HS3"` there is the parent's call (the HS3 castle parcels already pass the audit invariants
  spot-checked above).
- Mosaic + heightfield bakes (SKY-ZONES-DESIGN step 5) are downstream of this field landing.
