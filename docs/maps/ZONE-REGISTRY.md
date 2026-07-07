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

## The 10 continents — names (PROPOSED, let's lock these)

Naming is your call — here's a proposed proper name per continent (evocative but short), keeping the
atlas identity as the subtitle. **Tell me your picks / edits and I'll freeze them into the registry.**

| zoneId | Proposed name | Subtitle (atlas identity) | Aerial city-ref | Tier |
|---|---|---|---|---|
| **HUB** | **Aurelia** | Capital Heartland | Paris | surface |
| **ENT** | **Solmara** | Western Carnival Coast | Rio de Janeiro | surface |
| **BUS** | **Porthaven** | Northern Commercial Coast | New York | surface |
| **EDU** | **Highmar** | Academy Highlands | Kyoto | surface |
| **HS1** | **Cirrane** | Cloud Gateway Isle | Cusco | sky |
| **HS2** | **Emberfall** | Storm & Lava Isle | volcanic caldera | sky |
| **HS3** | **Aetheria** | High Sanctum Isle | Lhasa | sky |
| **UW1** | **Grimwarren** | Upper Caverns | Derinkuyu (underground) | underworld |
| **UW2** | **Drowndeep** | Deep Caverns | flooded cavern net | underworld |
| **UW3** | **Infernus** | Inferno Vault | volcanic vent | underworld |

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
- **Proposed — needs your sign-off before freeze:** the **names** (table above), and the exact
  **strengthMultiplier / zoneAvgStrength** numbers (grounded proposal; tune to the economy then freeze).
- **Owner-flagged elsewhere:** the launch pair (HUB + HS1 or UW1) and HUB sub-zone slicing (atlas §1.3);
  the aerial city refs (`CONTINUOUS-WORLD-TERRAIN.md` §3).

Once you confirm names + numbers, I freeze `data/zone-registry.json` and the bulk base/seed run keys off it.
