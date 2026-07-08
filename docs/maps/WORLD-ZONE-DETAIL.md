# World Zone Detail — full per-zone facts for world planning

> **Map-maker session, 2026-07-07 — published for the world-planning session.** Everything known about
> every zone, from the **real extracted map** (`data/hexagon-city-source/`) joined to the canonical
> **`data/zone-registry.json`**. Machine-readable companion: **`data/world-zone-detail.json`** (same numbers,
> computed). Companion docs: `ZONE-REGISTRY.md` (names/strength/family), `ZONE-BIOME-SEEDING-GUIDANCE.md`
> (materials matrix), `CONTINENT-TERRAIN-ATLAS.md` (macro terrain).

## 1. The world at a glance

- **12 zones** on **3 tiers** (surface / sky / underworld) across **3 launch servers** (Montréal `ca`,
  Singapore `sg`, **Tokyo/Japan `jp`** — coming soon), plus **2 SPECIAL prestige islands** (Olympus/founders,
  Fortuna/influencers) that ship no extracted parcels yet.
  - **Server update (owner 2026-07-08, `WORLD-MAP-AND-SERVER-TRAVEL.md`):** onboarding continents are split
    across the three city servers — **Singapore→Porthaven (BUS)**, **Tokyo→Arcadia (EDU, coming soon)**,
    **Montréal→Mythoria (ENT)**. (Was: all surface on `ca`.) `data/zone-registry.json` is updated.
- **World totals (real extraction):** **8,482 L2 estates** + **284,314 L3 singles** = **292,796 parcels**.
- **L2 by size class:** EPIC 48 · GIANT 172 · LARGE 393 · MEDIUM 1,082 · SMALL 6,787.
- **Parcel-id → zone:** `zoneCode = parcelId.slice(1,3)` (see the registry).

## 2. Per-zone parcel counts (the core table)

Counts are real (from `parcels-l2.json` size classes + the L3 extraction). `L2✦L3` = L2 estates that have
L3 children. **Density** = L3 singles per 1000 viewBox-units² (settlement-density signal: higher = more
urban/dungeon-packed, lower = open country).

| Zone | Name | Tier | Svr | EPIC | GIANT | LARGE | MED | SMALL | **L2** | L2✦L3 | **L3 singles** | **Total parcels** | Density |
|---|---|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| HUB | Tianxia | surface | ca | 24 | 53 | 111 | 238 | 1318 | **1744** | 723 | **58,745** | **60,489** | 710 |
| ENT | Mythoria | surface | ca | 3 | 14 | 31 | 128 | 1316 | **1492** | 669 | **38,284** | **39,776** | 251 |
| BUS | Porthaven | surface | sg | 12 | 68 | 127 | 277 | 703 | **1187** | 610 | **70,467** | **71,654** | 821 |
| EDU | Arcadia | surface | jp | 1 | 8 | 20 | 78 | 265 | **372** | 161 | **13,663** | **14,035** | 593 |
| HS1 | Aeropolis | sky | sg | 1 | 6 | 16 | 57 | 266 | **346** | 178 | **14,071** | **14,417** | 1068 |
| HS2 | Emberfall | sky | sg | 0 | 0 | 16 | 49 | 386 | **451** | 223 | **13,694** | **14,145** | 996 |
| HS3 | Empyrea | sky | sg | 1 | 0 | 6 | 54 | 403 | **464** | 219 | **11,873** | **12,337** | 883 |
| UW1 | Ironhold | underworld | sg | 1 | 9 | 27 | 98 | 1098 | **1233** | 592 | **28,915** | **30,148** | 1276 |
| UW2 | Blackmere | underworld | sg | 5 | 14 | 29 | 73 | 980 | **1101** | 546 | **29,777** | **30,878** | 1315 |
| UW3 | Luxuria | underworld | sg | 0 | 0 | 10 | 30 | 52 | **92** | 43 | **4,825** | **4,917** | 1191 |
| CGI | Olympus | surface·special | ca | — | — | — | — | — | **0** | 0 | **0** | **0** | — |
| KOL | Fortuna | surface·special | ca | — | — | — | — | — | **0** | 0 | **0** | **0** | — |
| — | **WORLD** | — | — | **48** | **172** | **393** | **1082** | **6787** | **8482** | — | **284,314** | **292,796** | — |

Reading the table: **BUS/Porthaven** is the biggest single-parcel zone (70k singles, densest surface urban
sprawl); **HUB/Tianxia** holds nearly half the world's EPIC estates (24/48) — the heartland. **UW1/UW2**
are the densest ground overall (cavern packing, ~1300); **ENT/Mythoria** the most open (251 — a spread
coastal ribbon). **UW3/Luxuria** is tiny (92 estates) but end-game.

## 3. Geometry, biome, strength (per-zone planning columns)

From the registry. `worldOffset` places the zone in the assembled world (x east, z north/south; +y up before
the 90° X-rotation that lays XZ on the ground). `viewBox` = the zone's own SVG coordinate extent.

| Zone | Name | worldOffset (x,z) | viewBox W×H | biomeFamily | primary elements | signature materials | ×mult | avgStr |
|---|---|---|---|---|---|---|--:|--:|
| HUB | Tianxia | (0, 0) | 358×231 | TEMPERATE_GRASS | Grass, Earth | Food, Gold | 1.0 | 100 |
| ENT | Mythoria | (−190, −10) | 290×526 | TEMPERATE_GRASS | Wind, Water, Grass | Herb, Fish | 1.1 | 110 |
| BUS | Porthaven | (40, −200) | 354×242 | SWAMP | Water, Grass | Fish, Salt, Gold | 1.2 | 120 |
| EDU | Arcadia | (100, 150) | 156×148 | TEMPERATE_FOREST | Earth, Electric, Wind | Arcane, Stone, Iron | 1.3 | 130 |
| HS1 | Aeropolis | (300, 100) | 114×116 | TEMPERATE_GRASS | Wind, Grass | Aether, Timber | 2.0 | 200 |
| HS2 | Emberfall | (425, 175) | 118×116 | VOLCANIC | Fire, Electric | Obsidian, Sulfur, Aether | 2.0 | 200 |
| HS3 | Empyrea | (300, 245) | 115×117 | SNOW | Wind, Light | Light-essence, Herb, Aether | 2.0 | 200 |
| UW1 | Ironhold | (310, −210) | 151×151 | SWAMP | Earth, Dark | Stone, Iron, Gems | 2.5 | 250 |
| UW2 | Blackmere | (475, −210) | 150×151 | VOLCANIC | Water, Fire, Dark | Iron, Obsidian, Gems | 3.5 | 350 |
| UW3 | Luxuria | (600, −210) | 63×64 | VOLCANIC | Fire, Dark | Iron, Obsidian, Dark-essence | 5.0 | 500 |
| CGI | Olympus | null (TBD) | — | TEMPERATE_GRASS | Light, Water | Gold, Herb | 1.0 | 100 |
| KOL | Fortuna | null (TBD) | — | TEMPERATE_GRASS | Wind, Light | Gold, Herb | 1.0 | 100 |

**Strength model:** SURFACE = gentle progression ×1.0–1.3 (unlock order); SKY = fixed ×2.0 (parallel
airship-gated islands); UNDERWORLD = range ×2.5/3.5/5.0 (boss-gated descent). `zoneAvgStrength = 100 ×
mult` — the seed pass scales real wild-garrison size from it. Full rationale: `ZONE-REGISTRY.md`.

## 4. The two prestige islands (SPECIAL family)

- **CGI — Olympus (Founders' Isle):** `zoneCode 01`. Dubai-Palm-style, sold in small parcels to project
  founders — the seat of the world's makers. **Ships no extracted parcels** (`worldOffset null`, counts 0).
- **KOL — Fortuna (Influencers' Isle):** `zoneCode 08`. Monaco-glamour, for Key Opinion Leaders.
  **Ships no extracted parcels.**

Both need owner-defined **geometry** (worldOffset + parcel set) and **combat role** (are they fought over,
or purely social/prestige?). Until then they're registry placeholders the generator skips.

## 5. How to consume
- **Machine input:** `data/world-zone-detail.json` (this table, computed) + `data/zone-registry.json`
  (names/strength/biome). Both keyed by `zoneId`; `zoneCode` maps parcelIds → zone.
- **Base pass** keys off `biomeFamily`/`palettes`/`worldOffset`/`viewBox`; **seed pass** off
  `family`/`strengthMultiplier`/`zoneAvgStrength`; **planning/UX** off the counts + density.
- **Open (owner):** CGI/KOL geometry + role; the exact strength numbers (grounded proposal — tune then
  freeze); launch pair (HUB + HS1 or UW1) and whether HUB (biggest surface, half the EPICs) sub-zone-slices.
