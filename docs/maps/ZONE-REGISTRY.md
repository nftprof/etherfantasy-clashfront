# Zone Registry — the canonical 10-continent list (names · strength · family/multiplier)

> **Map-maker session, 2026-07-07.** The **machine-readable** registry is **`data/zone-registry.json`** —
> the generator + sim input the CF main session asked for (`zoneId`, `zoneAvgStrength`, the family/
> multiplier table). This doc explains it and carries the **naming decision** (owner to finalize with me).
> Grounded in `CONTINENT-TERRAIN-ATLAS.md` (identity/biome/real counts) + `ZONE-BIOME-SEEDING-GUIDANCE.md`
> (materials) + `BIOME-RECRUITMENT-AND-ARMY.md` (elements).

## Why this exists (two generator passes read it)
- **Base pass** (terrain) reads `biomeFamily` / `palettes` / `worldOffset` — biome derives from **zone +
  position**, not a per-parcel dice roll.
- **Seed pass** (wild/economy) reads `family` / `strengthMultiplier` / `zoneAvgStrength` (wild sizing) and
  `signatureMaterials` / `primaryElements` (what seeds + who musters).
- **CF main / sim** reads `zoneId` + `zoneAvgStrength` + the family/multiplier table directly.
- **Lookup:** a parcelId encodes its zone — `6 + zoneCode(2) + parentIndex(4) + subIndex(4)`, so
  `zoneCode = parcelId.slice(1,3)` → the zone. (Verified: `60200010000`→EDU, `60700010000`→HUB,
  `60000080000`→BUS.)

## The 10 continents — names (LOCKED 2026-07-07, ENT provisional)

Owner-locked names + the theme each is designed to. **ENT = `Champa` provisional** — owner is picking from
a mythology/beautiful-scenery shortlist; everything else is final.

| zoneId | Name | Subtitle (atlas identity) | Design theme (owner) | Tier |
|---|---|---|---|---|
| **HUB** | **Tianxia** | Capital Heartland | mainland China / Romance of the Three Kingdoms ("all under heaven") | surface |
| **ENT** | **Champa** *(provisional)* | Western Carnival Coast | Thailand/Vietnam + mythology, beautiful scenery | surface |
| **BUS** | **Porthaven** | Northern Commercial Coast | New York + Singapore mercantile port | surface |
| **EDU** | **Lyceon** | Academy Highlands | famous-school (Lyceum) + Kyoto | surface |
| **HS1** | **Aeropolis** | Cloud Gateway Isle | "Castle in the Sky" (Laputa/Ghibli) | sky |
| **HS2** | **Emberfall** | Storm & Lava Isle | tiered fire-fortress (Minas Tirith over lava) | sky |
| **HS3** | **Empyrea** | High Sanctum Isle | tech-modern heaven city; space/parallel-universe gateway (future) | sky |
| **UW1** | **Ironhold** | Upper Caverns | dwarven city deep in the mountains | underworld |
| **UW2** | **Blackmere** | Deep Caverns | Minas Morgul dead-keep + drowned lakes | underworld |
| **UW3** | **Luxuria** | Inferno Vault | Hell + the deadly sin of Lust | underworld |

(`zoneId` stays the stable 3-letter code in all data/token ids; the **name** is the display label. So we
can rename freely without touching parcel ids or the generator.)

## Family + strength/multiplier model (the "HS fixed / UW range" rule, finalized)

Three families, each with its own wild-strength shape. `zoneAvgStrength = 100 (baseline) ×
strengthMultiplier` — a **relative index**; the seed pass scales real wild-garrison size from it.

| Family | Zones | Multiplier shape | Values |
|---|---|---|---|
| **SURFACE** | HUB · ENT · BUS · EDU | gentle progression (tutorial → frontier) by unlock order | ×1.0 · ×1.1 · ×1.2 · ×1.3 |
| **SKY** | HS1 · HS2 · HS3 | **FIXED** — parallel airship-gated islands, one elevated tier | ×2.0 each |
| **UNDERWORLD** | UW1 · UW2 · UW3 | **RANGE** — sequential boss-gated descent, deeper = deadlier | ×2.5 · ×3.5 · ×5.0 |

Rationale: surface is the open onboarding band (mild ramp). The sky tier is gated *once* (airship access),
then uniform — so a **fixed** multiplier. The underworld is a *sequential* descent (UW1→UW2→UW3 boss-gated),
so a **range** that climbs with depth, peaking at UW3 (final boss, best loot). This dovetails with the
material gradient in `ZONE-BIOME-SEEDING-GUIDANCE.md` (iron 1→5, richest UW3) and the density signal in the
atlas (underworld is the densest, most claustrophobic ground).

**zoneAvgStrength values:** HUB 100 · ENT 110 · BUS 120 · EDU 130 · HS1/HS2/HS3 200 · UW1 250 · UW2 350 ·
UW3 500.

## What's frozen vs open
- **Stable now:** `zoneId`/`zoneCode` (they're in the token ids — never change), tier, family, server,
  biomeFamily, worldOffset, real parcel counts.
- **LOCKED:** the **names** (table above; ENT provisional). Still needs sign-off: the exact
  **strengthMultiplier / zoneAvgStrength** numbers (grounded proposal; tune to the economy then freeze).
- **Owner-flagged elsewhere:** the launch pair (HUB + HS1 or UW1) and HUB sub-zone slicing (atlas §1.3);
  the aerial city refs (`CONTINUOUS-WORLD-TERRAIN.md` §3).

Once you confirm names + numbers, I freeze `data/zone-registry.json` and the bulk base/seed run keys off it.
