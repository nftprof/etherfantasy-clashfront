# THE SKY ZONES — HS1 / HS2 / HS3 DESIGN (owner-directed 2026-08-31)

**Status:** the three sky continents have l3 parcel data (~13.7–14.1K parcels each) and baked
biome-tint mosaics, but **NO authored macro fields** (`data/world-terrain/` has no HS1/HS2/HS3 —
nor UW1) — no designed coastlines, roads, cities, castles, or heroParcels. They are the last
continents without Arcadia-grade detail. This doc locks their identities BEFORE the fields are
built, so nothing generic ships. Owner rule: **their maps must look DISTINCT.**

## The three identities (owner-locked 2026-08-31)

### HS1 · AEROPOLIS — the Castle in the Sky
> owner: "castle in the sky.. utopia, birds, abandoned, leafy"

The Gate to Heaven (all surface airships land here FIRST — zoneLinks canon). An **abandoned
utopia**: Machu Picchu / Cusco terraced citadel (existing canon), now **overgrown** — vines
swallowing white stone, hanging gardens gone wild, bird flocks as the living weather, empty
plazas, the one working airship dock as the only maintained thing on the isle. Mood: serene,
melancholy, green-on-white. Palette: verdant/overgrown over pale stone (biomeFamily
TEMPERATE_GRASS stays; the field pass supplies the garden-ruin look). Landmark spine: the
terraced ascent → the summit citadel → the DOCK GATEHOUSE (`zoneLinks` anchor).

### HS2 · EMBERFALL — the Ember-Crystal Empire  ✅ wired in code
> owner: "make it LESS VOLCANIC — we got enough of that in the underworld and a volcano in the
> air makes no sense. Ember like crystal gems — ember-red crystals, still fire power FROM the
> crystals… cross that with the high tech: the same fire-crystal power runs the tech imperial…
> red gems and dark scene walls, dark green military color."

The fallen angels' **war capital**: a high-tech IMPERIAL city **powered by ember-red fire
crystals** — crystal reactors, gem-fed forges, floodlit military districts. NOT volcanic: no
magma, no lava water, no ash cones. The ground is dark military green-grey; walls and scenery
near-black; the light comes from **red crystal outcrops** (the ROCK class renders as ember
crystal) and the glow of crystal-powered machinery. Ember-*fall*: the corruption that sank now
risen, industrialized.
**Shipped today:** `biomeFamily: EMBER_CRYSTAL` (zone-registry; subtitle → "The Ember-Crystal
Empire"), new **`ember` palette** through the whole chain — schema PALETTES, BIOME_PALETTES
(`["ember","ashen"]`), thumb colors (dark military-green OPEN 58/66/54 · near-black CLIFF ·
**ROCK = ember red 188/52/48** · water stays WATER, never lava), archetype mix (crystal-heavy
rock, dark scarps), preview3d tint, mosaic land color, worldfield fallback, LLM prompt note.

### HS3 · EMPYREA — the Frozen Pinnacle
> owner: "ice and frozen for one (the highest)"

The rightful summit, reached last. **Ice and frozen** — biomeFamily SNOW (already set): a
white-gold divine city above the weather line, glacial terraces, frozen serenity. Its deep-canon
secret (Empyrea HIDES ancient technology — `SKY_EXPANSION.md` §3) stays **beneath the ice**:
the surface reads pure and cold; at most the faintest wrongness in the vaults. Never surfaced
in-game.

**The War of the Sky Throne (HS2↔HS3, `warFront:true`)** now reads perfectly on sight: the
**fire-crystal empire besieging the frozen pinnacle** — red glow against white ice, the two
palettes as the two armies.

## Distinctness check (the point of the exercise)

| | ground | light source | structures | weather/life |
|---|---|---|---|---|
| HS1 | overgrown green on pale stone | sun, open sky | abandoned terraces, ONE living dock | bird flocks |
| HS2 | dark military green-grey | **red crystal glow** | black imperial walls, forges, war machine | ember sparks, floodlight |
| HS3 | ice white-gold | cold sky-light on ice | divine frozen city | snow stillness |

No two share a dominant hue, light source, or mood; none reuses a surface or UW look (lava
stays in the underworld — owner rule).

## What building each field requires (the Arcadia recipe, sky edition)

1. **Void-rim coastline** — floating isles: the "coast" is the EDGE OF THE SKY (rim cliffs into
   void; the frontier-ridge rule becomes rim-ridge). Deep "water" semantics: HS zones may use
   water bodies as cloud-lakes/ice-melt; approaches/naval layers apply where bodies exist.
2. **Feature networks** per identity: HS1 terraced switchbacks + garden watercourses; HS2
   crystal fields (ember ROCK belts), military grid roads, reactor/forge POIs; HS3 glacial
   terraces, frozen rivers, processional ways.
3. **Castle ladder + heroParcels[]** per canon 22 (EPIC=PALACE …): HS1 summit citadel
   (PALACE style key `aeropolis_terrace`), HS2 imperial war-palace (`ember_bastion`), HS3
   ice-palace (`empyrean_ice`) — style keys to add to PALACE_STYLES when the fields land.
4. **zoneLinks anchors**: HS1 dock gatehouse (surface→HS1), the HS1→HS2 and HS1→HS3 branch
   gates, and the **war-front geography** between HS2 and HS3 (contested link, canon).
5. Mosaic + heightfield bakes after each field lands (same pipeline as the eight built zones).

**Build order (proposal):** HS1 first (it's the gateway every player sees first), then HS2+HS3
together (the war front needs both sides designed as a pair). UW1 Ironhold's missing field is
queued behind them.
