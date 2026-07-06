# Clash Front — Continent Terrain Atlas

> **The macro-terrain constitution of the whole world, zone by zone.** This document is the
> **authored-override layer** of the future macro-terrain field: it fixes each continent's identity,
> dominant biomes/palettes, elevation·moisture·temperature profile, mountain ranges, seas, rivers,
> frontier treatment, and where sea-ports / airship-ports / the underworld shaft / bosses / rare
> landmarks concentrate — so a smooth world field + these overrides produce **coherent neighbours**
> (no desert beside grassland) and a **distinct identity per continent**.
>
> **Grounded in the real extracted map** (`data/hexagon-city-source/`): 8,482 L2 estates +
> 284,314 L3 single-parcel paths across **10 geometried zones**. Every parcel count, bbox, and
> world-offset below is read from `parcels-l2.json`, `l3/<ZONE>.json`, and `zone-layout.json`.
> Feeds the future `data/world-terrain.json` (§4 table = its seed) and the map-maker generator
> (biomes/edges reference **[BATTLE-MAP-TEMPLATE-LIBRARY.md](./BATTLE-MAP-TEMPLATE-LIBRARY.md)** B1–B24
> and **[CASTLE-TEMPLATE-LIBRARY.md](./CASTLE-TEMPLATE-LIBRARY.md)** C1–C24 by name).
>
> The overworld map is **FIXED** (canon decision 1 — exact hexagone-city geometry, never
> regenerated). Terrain is not chosen per-parcel; it is **DERIVED** from where a parcel sits in this
> world field. Author: Clash Front Overworld design session, 2026-07-06.

---

## 0. Design contract — how a parcel gets its terrain

A parcel's terrain is a pure function of position under this atlas:

```
terrain(parcel) = biomeOf( sample(worldField, parcel.center) ⊕ authoredOverride(zone, parcel) )
role(parcel)    = deriveRole(parcel.geometry, adjacency, field)   // interior / edge-pentagon(mapVoid) /
                                                                   // corner / coastal / riverine /
                                                                   // mountain-highland / frontier / crossroads
edges(parcel)   = perEdgeType(neighbourAcross(edge))              // land / sea / mapVoid /
                                                                   // river-crossing / mountain-pass
```

- **`worldField`** = smooth low-frequency `{elevation, moisture, temperature}` (value-noise, the same
  family as `env()` in [`docs/12`](../12-environment-and-weather.md)) so neighbours blend.
- **`authoredOverride`** = this atlas: per-zone biome bands, named ranges, coastlines, river spines,
  and special zones. **Overrides win** where present; the smooth field fills the rest.
- **Continuity is a hard rule:** coasts, rivers, and ranges are **continuous across parcel boundaries**
  — a river that leaves parcel A's east edge must enter its eastern neighbour's west edge (§3).
- **8 palettes** (`verdant, autumn, sakura, desert, ashen, tundra, swamp, volcanic`) and the renderer
  biome families (`TEMPERATE_GRASS/FOREST, DESERT, SNOW, VOLCANIC`) are the only vocabulary; every
  zone below picks from them.

---

## 1. World overview

### 1.1 The 10 zones as placed by `worldOffset` (the data truth — the flat picker map)

Zones live in their own SVG viewBox and are assembled in 3D at their `worldOffset (x,y,z)`, rotated
90° about X so the **XZ plane is the ground** (`vendors/LandMap/LandMap.js`). Reading `x` = east(→),
`z` = north/south (I orient **−z = north/up**), the source lays the world out like this:

```
            WEST  ◀────────────────── x (east) ──────────────────▶  EAST
       ┌──────────────────────────────────────────────────────────────────────┐
  N ▲  │   [BUS]                         [UW1]   [UW2]        [UW3]             │  z≈−205
  │    │  Business                    ┌─ Underworld descent row (square vaults)─┐│
  z    │  (great N coast metropolis)  │  cav.1    cav.2         inferno         ││
  │    │                                                                        │
  ▼ S  │ [ENT]              ★[HUB]★                                             │  z≈−5
       │ Entertain          CAPITAL                                            │
       │ (long W-coast      HEARTLAND                                          │
       │  carnival ribbon)  ⟟ shaft ↓ to UW                                    │
       │                                                                        │
       │              [EDU]            [HS1]      [HS2]                         │  z≈+140
       │            Education        Sky-Isle 1  Sky-Isle 2                     │
       │           (academy plateau) (cloud gate)(storm/lava)                  │
       │                               [HS3]                                    │  z≈+245
       │                             Sky-Isle 3 (high sanctum)                  │
       └──────────────────────────────────────────────────────────────────────┘
     x-extent: −190 (ENT) ……………………………………………………………………………………… +600 (UW3)
```

`worldOffset` table (from `zone-layout.json`), plus size (SVG viewBox units) and counts:

| Zone | worldOffset (x, z) | viewBox W×H | L2 | L3 | EPIC est. | Tier |
|---|---|---|---:|---:|---:|---|
| **ENT** | (−190, −10) | 289.6 × 525.9 | 1,492 | 38,284 | 3 | surface |
| **HUB** | (0, 0) | 358.2 × 231.1 | 1,744 | 58,745 | **24** | surface |
| **BUS** | (40, −200) | 354.1 × 242.4 | 1,187 | **70,467** | 12 | surface |
| **EDU** | (100, 150) | 155.8 × 148.1 | 372 | 13,663 | 1 | surface |
| **HS1** | (300, 100) | 113.6 × 116.0 | 346 | 14,071 | 1 | sky |
| **HS2** | (425, 175) | 118.0 × 116.5 | 451 | 13,694 | 0 | sky |
| **HS3** | (300, 245) | 114.7 × 117.2 | 464 | 11,873 | 1 | sky |
| **UW1** | (310, −210) | 150.5 × 150.5 | 1,233 | 28,915 | 1 | underworld |
| **UW2** | (475, −210) | 150.5 × 150.3 | 1,101 | 29,777 | 5 | underworld |
| **UW3** | (600, −210) | 63.3 × 64.0 | 92 | 4,825 | 0 | underworld |

### 1.2 The 3-tier vertical cosmology (the design truth)

The source **spreads the sky and underworld clusters eastward on the flat picker map** for legibility,
but the **canon cosmology is a vertical stack**. The atlas treats the tiers as their own biome
families that read as physically **above** and **below** the surface, reached by dedicated portals —
NOT as more coastline east of the surface continents:

```
        ☁  SKY TIER  — HS1 · HS2 · HS3       floating islands, all rims = sky-void (mapVoid),
        ☁                                     reached ONLY by AIRSHIP from surface mid-land ports
        ─────────────────────────────────────────────────────────────
        ▓  SURFACE   — ENT · HUB · BUS · EDU  one contiguous continent group; real coasts & ranges;
        ▓                                     the ★HUB★ holds the single UNDERWORLD SHAFT at its centre
        ─────────────────────────────────────────────────────────────
        ▼  UNDERWORLD — UW1 → UW2 → UW3       sequential boss-gated descent under the HUB shaft;
        ▼                                     square artificial vaults, all walls = rock (mapVoid)
```

- **Sky and underworld tiers do NOT border the surface horizontally.** Their only connections are
  **vertical portals**: airship ports (surface → sky) and the HUB shaft (surface → UW1 → UW2 → UW3).
  On the map they render "beside" the surface but are gameplay-isolated tiers.
- **Each tier is its own biome family** so the eye reads altitude instantly: surface = full palette
  wheel; sky = cloud-pale verdant + ashen sky-ruin + one volcanic lava-isle; underworld = ashen stone
  → swamp cavern → volcanic inferno, no sky, permanent low light.

### 1.3 Server / continent grouping (decision 12, `docs/07` §4.4)

Shard = zone; each enabled zone is served by **exactly one** regional server. MOBA footprint =
**Montreal (ca)** + **Singapore (sg)** first ⇒ launch with **two enabled continents**. The atlas
proposes a **west→Montreal / east→Singapore** split that mirrors both the real datacentre geography
**and** the source `worldOffset` layout (surface heartland sits west/central at x≤100; the sky &
underworld clusters sit east at x≥300):

| Region | Zones (in unlock order) | Launch continent |
|---|---|---|
| **Montreal (ca)** — west/central surface | **HUB** → ENT → BUS → EDU | **HUB** (the capital heartland; where everyone starts, holds the shaft) |
| **Singapore (sg)** — east sky+underworld | **HS1** → HS2 → HS3 → UW1 → UW2 → UW3 | **HS1** (the sky gateway; showcases the second "world" at launch) |

> **⚠ Owner decision, flagged (not decided unilaterally):** the *exact* launch pair is the owner's
> call. HUB is the obvious Montreal launch (central, biggest EPIC pool, the shaft). The Singapore
> launch could be **HS1** (sky, most novel) or **UW1** (underworld entry). HUB may also need
> **sub-zone slicing** (decision 12) — it is the largest surface footprint (358×231) with half the
> world's EPIC estates; a natural split is the 4 quadrants around the central shaft. All other
> zones fit one shard each.

### 1.4 Global scale anchor

Per canon 5b: 1 SINGLE parcel ≈ a standard battle arena; the overworld map is the source SVG verbatim;
world ≈ **29,900 km²**. Densities below (L3 singles per 1000 viewBox-units²) are the honest
**settlement-density signal** the terrain should echo — sparse = wild/rural, dense = urban/dungeon:

| Zone | L3 / 1000u² | reads as |
|---|---:|---|
| ENT | 252 | sparse — spread coastal ribbon, lots of open ground between estates |
| EDU | 593 | moderate — cultivated academy valleys |
| HUB | 710 | busy — the settled heartland |
| BUS | 821 | dense — urban commercial sprawl |
| HS1/2/3 | 888–1069 | packed — every scrap of a floating island is claimed |
| UW1/2 | 1277 / 1316 | **densest** — claustrophobic cavern warrens |
| UW3 | 1193 | packed inferno vault |

**Takeaway for the field:** density rises as you leave the surface — the underworld is the most
tightly subdivided ground in the world (cave packing), the sky nearly as much (island scarcity),
the surface loosest (open country between cities). Bake this into `roughness`/`density` biasing.

---

## 2. Per-continent terrain constitution

Legend for the profile line: **E** = elevation band (0 sea … 1 peak), **M** = moisture (0 arid … 1
saturated), **T** = temperature (0 frozen … 1 scorching). Bands are the *authored centre*; the smooth
field varies within them.

---

### 2.1 HUB — the Capital Heartland (surface · Montreal launch continent)

**Identity & real character.** Cryptoverse **central hub** — the beating middle of the world where
every road meets. Terrain reading: a **temperate crossroads heartland**, the "green middle kingdom,"
the tutorial continent and the political capital. It holds **half of the world's EPIC estates (24 of
48)** — the great houses cluster around the capital — and, at its exact centre, the **single shaft
down to the Underworld**.

**Spatial facts.** 1,744 L2 (largest L2 count) + 58,745 L3. viewBox 358.2 × 231.1 (tied with BUS as
the largest surface footprint). Mean parcel centre (161.4, 114.7) — well-distributed, a full
continent, not a ring. EPIC 24 · GIANT 53 · LARGE 111 — by far the richest great-estate pool.

**Dominant biomes + palette.** **`verdant`** grassland core (TEMPERATE_GRASS) with **`autumn`**
(TEMPERATE_FOREST) on the margins and hills. A small **`ashen`/`volcanic`** scar ringing the central
shaft (scorched, unnatural ground where the underworld breathes through). **Profile:** E 0.35–0.6
(rolling lowland rising to a central massif around the shaft), M 0.45–0.6, T 0.55 (mild).

**Macro features.**
- **The Shaft (authored, unique):** dead-centre `(x≈179, z≈114 in viewBox)`, a **caldera-like sink**
  of `volcanic`/`ashen` ground ringed by a low crater rim — the mouth of the Underworld. Highest local
  elevation on the rim, then plunging. This is the ONE surface→UW portal in the world.
- **Central massif + radial rivers:** a modest highland around the shaft rim is the **watershed**;
  **3–4 rivers radiate outward** to the continent edges (NE toward BUS, W toward ENT, S toward EDU),
  each a continuous river-crossing spine. Rivers = `verdant` riparian corridors.
- **No true coast of its own** (HUB is landlocked-central); its edges are **river-frontiers and
  land-frontiers into neighbours**, except the NW rim which trends toward BUS's southern sea.

**Frontier / edge treatment.** HUB borders neighbours on **three real sides**: **N→BUS**,
**W→ENT**, **S→EDU** — these are **land / river transition frontiers** (blended biome bands, §2.9),
NOT mapVoid. The **E side** faces open world toward the (isolated) eastern tiers → treat as a
**frontier rim / "beyond the frontier"** land edge, gently drying toward `autumn` steppe. Any clipped
map-boundary pentagons on the far E/NE rim = `mapVoid`.

**Special-element hotspots.** **Underworld shaft = the dead centre** (position-seeded exact). Great-
estate **castles** cluster in the central third (the EPIC/GIANT belt). **Crossroads** parcels (where
the radial rivers/roads meet) are the natural market/POI seeds. No sea-ports (landlocked); the nearest
airship port sits on the NE shoulder facing the sky tier.

**Signature archetypes.** Battlefields **B2 Envelopment Plain** (`openSteppe`, the classic open
capital-field CLASH), **B20 The Open Steppe**, **B8 The Great River** / **B16 The Bridge** on the
radial rivers, **B24 The Terraces** on the massif shoulders. Castles: the full civic ladder — **C1 The
Motte** (entry estates) up to **C12 The Ideal Star City** / **C15 The Grid City** (the capital's great
EPIC estates), **C8 The Three-Tier Castle** for the shaft-guardian estate.

**Coherence.** HUB is the **hub of the biome wheel** too: `verdant` core blends N into BUS's cooler
coastal `verdant`, W into ENT's warm `verdant/sakura`, S into EDU's `sakura/autumn` uplands — every
surface neighbour is one wheel-step away, so all HUB borders blend without a hard seam.

---

### 2.2 BUS — the Northern Commercial Coast (surface · Montreal)

**Identity & real character.** Cryptoverse **Business** district — the mercantile metropolis. Terrain
reading: the **great northern trade coast**, a dense low-lying commercial continent fronting the
world's northern **ocean** — canals, deltas, and port-cities. It is the **most subdivided zone in the
world (70,467 L3, densest surface at 821/1000u²)** — read that as **urban sprawl**: the busiest,
most-built continent.

**Spatial facts.** 1,187 L2 + 70,467 L3 (most L3 anywhere). viewBox 354.1 × 242.4 (twin of HUB).
EPIC 12 (2nd-richest), GIANT 68 (most GIANT estates of any zone). Sits **north** of HUB (worldOffset
z = −200).

**Dominant biomes + palette.** **`verdant`** coastal lowland transitioning to **`ashen`** in the
dense urban cores (the "rubble city" commercial districts) and **`swamp`** in the northern river
**deltas**. Cool-temperate. **Profile:** E 0.1–0.35 (low, deltaic, some reclaimed marsh), M 0.6–0.8
(wet — coast + deltas), T 0.45 (cool-temperate, a northern sea-climate).

**Macro features.**
- **The Northern Ocean (authored):** the **entire N edge is sea** (map-boundary → `sea` edges, not
  mapVoid — it's water, not a clipped void). A broad **coastal plain** and **river deltas** drain the
  continent into it.
- **Delta river network:** several rivers run S→N (down from the HUB watershed and BUS's own low
  hills) fanning into `swamp` deltas at the coast — continuous river-crossings, marsh causeways.
- **Low relief:** no true mountains; at most a line of **low coastal bluffs/dunes** on the NW.

**Frontier / edge treatment.** **N = sea** (open ocean, the world's northern shore). **S = land
frontier into HUB** (blended `verdant`). **E/W** trend to **frontier rim** (drying `autumn`
grassland) with clipped-pentagon `mapVoid` on the far corners. This is the world's primary **naval
frontier**.

**Special-element hotspots.** **Sea-ports concentrate along the whole N coast** — every coastal EPIC/
GIANT estate is a port-city (BUS has the most GIANT estates → the most great ports). **Airship ports**
on inland high ground (BUS is the closest dense surface population to the sky tier's Singapore server —
a natural airship hub). Naval battle templates spawn here.

**Signature archetypes.** Battlefields **B5 Rubble City** (`urbanRubble`/`ashen` — the commercial
core), **B17 Sea-and-Marsh Plain** (`coastalPlain`) and **B1 The Hot Gates** (`coastalDefile`) on the
shore, **B16 The Bridge** / **B8 The Great River** on the deltas, **B23 No-Man's-Land** (`trenchLine`)
for grinding urban sieges. Castles: **C9 The Tidal Fortress** (Mont-Saint-Michel `tidalIsland`) and
**C19 The Sea Fort** (`seaFort`) for the port estates, **C14 The Moated Bailey** (`waterCastle`) and
**C11 The Water Star** (`bastionStar`) in the deltas, **C15 The Grid City** for the metropolis EPICs.

**Coherence.** BUS's cool coastal `verdant` warms southward into HUB's temperate `verdant` — the
S border is a smooth land blend. Its `swamp` deltas are confined to the coast; the `ashen` urban cores
are point-features inside `verdant`, never bleeding to a neighbour.

---

### 2.3 ENT — the Western Carnival Coast (surface · Montreal)

**Identity & real character.** Cryptoverse **Entertainment** district — the pleasure quarter, festival
and spectacle. Terrain reading: a **long, warm, lush western coastal ribbon** — the "Riviera" of the
world, a slender continent hugging the **western ocean** its whole length. Warm, bright, `sakura`-and-
`verdant`, the most **coastline-per-area** of any surface zone and the **sparsest settlement**
(252/1000u²) — open festival grounds between resort-estates.

**Spatial facts.** 1,492 L2 + 38,284 L3. viewBox **289.6 × 525.9 — by far the most elongated zone in
the world (aspect ≈ 1 : 1.8, tall N–S)**. Mean centre (122.6, 342.8) — mass sits toward the south.
1,316 SMALL L2 (overwhelmingly small parcels — many little resort plots). Sits **far west**
(worldOffset x = −190).

**Dominant biomes + palette.** **`sakura`** (festival blossom coast) blended with **`verdant`** —
warm temperate to nearly subtropical. Because it spans 526 units N–S, it has a **latitude gradient**:
**warm/subtropical `verdant`+`sakura` in the south**, cooling to **temperate `autumn`** in the north.
**Profile:** E 0.15–0.4 (coastal lowland with a low interior spine), M 0.55–0.7, T **gradient 0.65
(S) → 0.5 (N)** — the only zone with a strong internal climate gradient.

**Macro features.**
- **The Western Ocean (authored):** the **entire W edge (long side) is sea** — the world's western
  shore, a continuous coastline the full 526-unit length. Bays and headlands.
- **Interior spine:** a low **N–S ridge line** runs the length of the ribbon a little inland,
  separating the coastal strip from a drier eastern back-country — a `ridgePasses` spine, continuous.
- **Short rivers** run W off the spine into the ocean (many small mouths, matching the many-small-
  parcel character).

**Frontier / edge treatment.** **W (long edge) = sea.** **E (long edge) = land frontier into HUB/open
world** (blended `verdant`→`autumn`). **N & S caps = frontier rim** (clipped pentagons → `mapVoid`,
the ribbon's ends fade "beyond the frontier"). The premier **coastal/naval frontier of the west**.

**Special-element hotspots.** **Sea-ports the entire W coast** — resort-ports and marinas; the south
(warm, mass of parcels) is the port-dense heart. **Coastal DUEL** battlefields dominate. Rare
`sakura` landmark parcels (festival monuments) seed here more than anywhere.

**Signature archetypes.** Battlefields **B17 Sea-and-Marsh Plain** and **B1 The Hot Gates**
(`coastalDefile`) along the shore, **B14 Lakeside Defile** and **B24 The Terraces** on the interior
spine, **B21**-adjacent `sakura` festival fields. Castles: **C9 The Tidal Fortress**, **C19 The Sea
Fort**, **C13 The Spiral Keep** (Himeji — the `sakura` signature castle) for the great resort estates,
**C10 The Crag-and-Tail** on the spine headlands.

**Coherence.** ENT's warm `sakura/verdant` cools and dries **eastward** into HUB's temperate
`verdant` (one wheel-step) and **northward** along its own gradient into `autumn`. The interior spine
is the natural moisture divide keeping the wet coast and drier back-country legible.

---

### 2.4 EDU — the Academy Highlands (surface · Montreal)

**Identity & real character.** Cryptoverse **Education** district — the seat of learning. Terrain
reading: a **serene elevated academy plateau**, the world's "monastery in the hills" — cultivated
terraces, cherry-groved campuses, quiet uplands. The **smallest and least-populous surface continent**
(372 L2, viewBox 156×148) — an intimate, sacred, contemplative land.

**Spatial facts.** 372 L2 (fewest of any surface zone) + 13,663 L3. viewBox 155.8 × 148.1 (smallest
surface footprint). EPIC 1 (only one great estate — the Grand Academy), GIANT 8. Sits **south** of HUB
(worldOffset z = +150).

**Dominant biomes + palette.** **`sakura`** campuses and **`autumn`** groves over an **upland**
base — cool, clear, cultivated. Some **`verdant`** in the sheltered valleys. **Profile:** E **0.5–0.75
(the highest surface zone — a plateau)**, M 0.4–0.55 (drier uplands), T 0.4 (cool, thin mountain air).

**Macro features.**
- **The Plateau + terrace ranges:** a raised tableland edged by **terraced ridge lines**
  (`cliffTerraces`) — the signature "academy in the mountains." Highest average surface elevation.
- **Headwater springs:** EDU's uplands are a **river source** — streams rise here and flow **N down
  into HUB** (feeding HUB's southern radial river) — continuous across the EDU→HUB border.
- **Sacred grove zone (authored):** a small `sakura` sanctuary cluster (the Grand Academy EPIC + its
  precinct) — a designated peaceful/POI district.

**Frontier / edge treatment.** **N = land frontier into HUB** (the river-source blend, `sakura/autumn`
→ `verdant`). **S / E / W = frontier rim** (mountain-walled uplands; clipped pentagons → `mapVoid`;
"beyond the frontier" is the high mountains that ring the plateau). No sea. Edges are **mountain-pass**
where a route crosses the rim.

**Special-element hotspots.** The **Grand Academy** (sole EPIC) is the sacred landmark heart. **Airship
port** on the plateau's E shoulder (high, calm air → a natural launch to the sky tier). No sea-ports.
Rare **STANDING_STONES / OBELISK** scholarly landmarks seed on the terraces.

**Signature archetypes.** Battlefields **B24 The Terraces** (`cliffTerraces` — the signature),
**B6 The Shield Ridge** (`ridgeEscarpment`), **B14 Lakeside Defile** on the upland tarns. Castles:
**C24 The Zigzag Rampart** (Sacsayhuamán terraces), **C17 The Switchback Hill Fort** (Mehrangarh),
**C13 The Spiral Keep** (Himeji `sakura`) for the Grand Academy, **C21 The Eagle's Nest** on a peak.

**Coherence.** EDU's cool `sakura/autumn` uplands step **down** to HUB's warm `verdant` lowland via the
river-source valley (one wheel-step, mediated by elevation drop). Its mountain rim isolates the other
three sides cleanly — a deliberately enclosed sanctuary.

---

### 2.5 HS1 — the Cloud Gateway Isle (sky · Singapore launch continent)

**Identity & real character.** Cryptoverse **High Sky 1** — the lowest, nearest floating island; the
**airship gateway to the sky world**. Terrain reading: verdant **cloud-forest mesas** adrift above the
clouds — the welcoming, temperate first step of the sky tier. Proposed **Singapore launch continent**
(most novel "second world" to show at launch).

**Spatial facts.** 346 L2 (fewest sky L2) + 14,071 L3. viewBox 113.6 × 116.0 (all three sky isles are
near-square ~114–118 units — compact islands). Dense (1069/1000u² — every scrap claimed). EPIC 1.

**Dominant biomes + palette.** **`verdant`** cloud-forest (the `skyPlateau` archetype's default),
lush and pale-lit; **`sakura`** hanging gardens on the terraced rims. **Profile:** E **1.0 (a
free-floating plateau — elevation is nominal "in the sky")**, M 0.6 (cloud-fed), T 0.5 (mild, but
thinning). Rendered as a bright cloud biome, visually distinct from any surface green.

**Macro features.**
- **All rims = sky-void:** the island edge is a **cliff into open sky** — every boundary edge is
  **`mapVoid` (sky-void)**, no neighbours in any horizontal direction.
- **Central mesa + terrace rings:** a raised cloud-forest core ringed by descending terraces
  (`cliffTerraces` on a floating plateau).
- **No rivers to a sea** — instead **cloud-cataracts** pour off the rim into the void (cosmetic
  waterfalls; internal tarns only).

**Frontier / edge treatment.** **Entire perimeter = mapVoid (sky-void).** The **only entry = the
airship dock** (authored, one or two rim parcels facing the surface / the BUS-EDU airship ports). The
whole continent is a "frontier" in the sense that it floats in nothing.

**Special-element hotspots.** **Airship port(s)** on the surface-facing rim (the arrival point — the
sky tier's front door). **Rare landmark** OBELISK/STANDING_STONES on the central mesa. No sea-ports,
no shaft. Element-wise a natural **Wind/Grass** pet homeland (sky affinity).

**Signature archetypes.** Battlefield **B21 Sky Plateau** (`skyPlateau` — the signature, the whole
island IS this template), **B24 The Terraces** on the rims. Castles: **C10 The Crag-and-Tail** and
**C21 The Eagle's Nest** (`eyrie`) — sky-fortresses on a rock in the void.

**Coherence.** Sky isles are **their own biome family** — pale cloud-`verdant` reads as "up," never
continuous with surface green (the mapVoid rim is the hard break). HS1 (lowest, mildest) → HS2 (mid,
storm/lava) → HS3 (highest, ashen sanctum) form an **ascending sky gradient** among themselves.

---

### 2.6 HS2 — the Storm & Lava Isle (sky · Singapore)

**Identity & real character.** Cryptoverse **High Sky 2** — the **largest sky island by L2 (451)** and
the most dramatic: a **storm-wracked isle with a floating volcano**. Terrain reading: the "wild middle
sky" — thunderheads, a lava-isle caldera adrift in cloud, the sky tier's danger zone.

**Spatial facts.** 451 L2 (most sky estates) + 13,694 L3. viewBox 118.0 × 116.5 (largest sky
footprint). **EPIC 0, LARGE 16, no GIANT/EPIC** — no single dominant great-estate; a scatter of
medium holdings (a contested, unconsolidated island).

**Dominant biomes + palette.** **`volcanic`** caldera core (a floating volcano — VOLCANIC biome) ringed
by storm-darkened **`ashen`** slopes and a fringe of **`verdant`** on the windward rim. **Profile:**
E 1.0 (floating; internal relief high — a volcanic cone), M 0.5 (storm-wet windward, dry lee), T
**0.7 (hot core from the volcano)** — the sky tier's one warm island.

**Macro features.**
- **Floating volcano (authored):** a **`volcanicCaldera`** at the island's heart — magma, ash cone,
  a single caldera gap. The sky's answer to the underworld's inferno.
- **Storm belt:** perpetual weather (ties to `env()` §12 — this island is authored to sit under a
  standing storm front); frequent lightning-lit `ashen` ground.
- **All rims = sky-void** as HS1.

**Frontier / edge treatment.** **Entire perimeter = mapVoid (sky-void).** Entry by **airship dock**
on the calmer windward (verdant) rim. Internally the caldera is a `mountain-pass`-gated hazard.

**Special-element hotspots.** **Fire/Electric pet homeland** (volcano + storm). **Rare volcanic
landmark** (CRATER_LAKE / OBELISK on the cone). Airship dock singular. A natural **boss-adjacent** sky
site (a fire boss could roost here — mirrors the UW3 inferno above the clouds).

**Signature archetypes.** Battlefields **B13 The Caldera** (`volcanicCaldera` — signature), **B21 Sky
Plateau** on the outer terraces, **B5 Rubble City** (`ashen`) for storm-ruined districts. Castles:
**C21 The Eagle's Nest** and **C20 The Throat-Cutter** (`citadelMound`) on the volcanic mound.

**Coherence.** Sits between HS1 (mild) and HS3 (cold sanctum) in the ascending sky gradient — the hot,
violent middle. Its `volcanic/ashen` is a point-family inside the sky's cloud-`verdant`, mirrored by
UW3's inferno **directly below in the vertical stack** (a nice sky↔underworld thematic rhyme).

---

### 2.7 HS3 — the High Sanctum Isle (sky · Singapore)

**Identity & real character.** Cryptoverse **High Sky 3** — the **highest, southern-most** floating
island (worldOffset z = +245, the far corner). Terrain reading: the **cold sacred summit of the sky**
— ancient sky-ruins in thin, freezing air, the pilgrimage-end of the sky tier.

**Spatial facts.** 464 L2 (most sky L2 by a hair) + 11,873 L3 (fewest sky L3 — big, sparse sacred
precincts). viewBox 114.7 × 117.2. EPIC 1 (the Sky Sanctum). Notably **403 SMALL + 54 MEDIUM + only 6
LARGE + 1 EPIC** — many small shrine-plots around one great sanctum.

**Dominant biomes + palette.** **`ashen`** sky-ruins (ancient pale stone) with **`tundra`** frost on
the highest ground — cold and thin. Faint `verdant` only in sheltered hollows. **Profile:** E 1.0
(highest sky isle), M 0.35 (thin, dry air), T **0.3 (cold — altitude frost)** — the sky tier's cold
pole.

**Macro features.**
- **Sky-ruins (authored):** a field of **ancient ruined towers / OBELISK / STANDING_STONES** — the
  sacred archaeology of a lost sky civilization. The Sky Sanctum EPIC is the summit temple.
- **Frost cap:** `tundra` on the central high ground; frozen tarns.
- **All rims = sky-void.**

**Frontier / edge treatment.** **Entire perimeter = mapVoid (sky-void).** Entry by a single **airship
dock** on the lower windward rim (the pilgrim's landing). The most remote, hardest-reached parcel-set
in the sky tier.

**Special-element hotspots.** **Sacred landmark density is highest here** (OBELISK/STANDING_STONES/
RUINED_TOWER seeded thickly around the Sanctum). **Light/Wind pet** affinity (thin high air). No sea,
no shaft. The sky tier's "final" reward continent.

**Signature archetypes.** Battlefields **B21 Sky Plateau** (`ashen` sky-ruin variant — signature),
**B22**-adjacent ruin mazes, **B12 Battle on the Ice** (`frozenLake`) on the frost tarns. Castles:
**C21 The Eagle's Nest**, **C8 The Three-Tier Castle** (the tiered Sanctum), **C24 The Zigzag Rampart**
on the ruin terraces.

**Coherence.** Caps the ascending sky gradient (HS1 mild verdant → HS2 hot volcanic → HS3 cold ashen/
tundra sanctum). `tundra` appears **only** at the sky's cold summit and (by the wheel) never touches a
warm surface biome — the mapVoid rims guarantee it.

---

### 2.8 UW1 — the Upper Caverns (underworld · Singapore)

**Identity & real character.** Cryptoverse **Underworld 1** — the **first level below the HUB shaft**,
the entry to the sequential boss-gated descent. Terrain reading: **cool stone cavern warrens** — the
"upper dark," fungal galleries and echoing halls just beneath the surface.

**Spatial facts.** 1,233 L2 (most UW estates) + 28,915 L3. viewBox **150.5 × 150.5 — a perfect square**
(all UW zones are square: they are *constructed vaults*, not organic land). Dense (1277/1000u²). EPIC 1
(the first Boss Warren).

**Dominant biomes + palette.** **`ashen`** stone (the `cavernWarren` cave biome) with patches of
**`swamp`** (fungal pools, damp galleries). Permanent low light — no sky, no day/night (the `env()`
tint is authored dark here). **Profile:** E 0.4 nominal (underground; "elevation" = cave-floor relief),
M 0.6 (damp), T 0.5 (cool cave-stable). Renderer: SNOW/DESERT families do NOT apply — this is a dark
`ashen`/`swamp` cave family.

**Macro features.**
- **The Shaft head (authored):** the **descent from HUB lands at UW1's centre** — the one entrance;
  from here a **boss-gated passage leads down to UW2** (you clear the level's boss to proceed — decision
  8 / `docs/05` §9).
- **Underground rivers:** dark `swamp` rivers thread the warren (continuous cavern watercourses).
- **Rock walls all around:** all four square edges = solid rock.

**Frontier / edge treatment.** **All four edges = `mapVoid` (rock wall)** — the vault is sealed; the
**only connections are vertical**: **up = the HUB shaft**, **down = the boss-gate to UW2**. No coast,
no sky, no horizontal neighbour. The purest "frontier = solid rock" treatment.

**Special-element hotspots.** **Bosses garrison the deep centre** (UW1's boss = the gate-keeper to
UW2). **Wild monster** density high (Ep03 kobolds/moles → mines & hills theme, `docs/05` §9). **Earth/
Dark pet** affinity. No sea/airship — the shaft is the only door.

**Signature archetypes.** Battlefield **B22 The Underworld** (`cavernWarren` — the signature, the whole
zone IS this), **B9 Back-to-the-River** (`boxCanyon`+river) on the cave rivers. Castles: **C16 The Pass
Fort** (`passFort` — the boss-gate), **C22 The Drystone Enclosure**, **C8 The Three-Tier Castle** for
the Boss Warren.

**Coherence.** Underworld is **its own biome family** (dark `ashen`→`swamp`→`volcanic`), never
continuous with the surface — the only surface link is the single HUB shaft (a hard vertical seam, not
a blend). UW1 (cool upper) → UW2 (damp deep) → UW3 (inferno) is a **descending heat gradient**, the
mirror of the sky's ascending cold gradient.

---

### 2.9 UW2 — the Deep Caverns (underworld · Singapore)

**Identity & real character.** Cryptoverse **Underworld 2** — the **middle depth**, hotter and wetter,
the drowned and molten-veined heart of the descent. Terrain reading: **flooded deep caverns** — black
lakes, sulphur pools, the first breath of the inferno below.

**Spatial facts.** 1,101 L2 + **29,777 L3 (most L3 in the underworld; the world's densest zone at
1316/1000u²)**. viewBox 150.5 × 150.3 (square vault, twin of UW1). **EPIC 5 (the richest EPIC pool
outside HUB/BUS)** — the deep holds surprisingly great estates (drowned palaces).

**Dominant biomes + palette.** **`swamp`** (black-water caverns) grading to **`volcanic`** veins near
the floor — the transition band between UW1's stone and UW3's fire. **`ashen`** on the dry ledges.
**Profile:** E 0.3 (deeper), M **0.8 (flooded — the wettest UW level)**, T **0.65 (warming toward the
inferno)**.

**Macro features.**
- **The Black Lakes (authored):** large subterranean **water bodies** (`marshCauseways` — causeway-
  gated), the deep's defining feature; ferry-crossings between estate clusters.
- **Magma veins:** first `volcanic` intrusions creep up from UW3 — glowing fissures in the swamp.
- **Boss-gate up (from UW1) and down (to UW3):** UW2's boss guards the final descent.

**Frontier / edge treatment.** **All four edges = `mapVoid` (rock wall).** Vertical only: **up = boss-
gate to UW1**, **down = boss-gate to UW3**. Internally the Black Lakes are `river-crossing`/causeway
chokes.

**Special-element hotspots.** **Bosses at the lake-heart** (the descent-guardian; UW2 holds 5 EPIC
"drowned palace" estates — the richest deep-loot). **Water/Dark pet** affinity (black lakes). **Raid-
tier boss** candidate site (`docs/05` §9 `Raid_LeeKoon`). No sea/airship.

**Signature archetypes.** Battlefields **B22 The Underworld** (`cavernWarren`), **B15 The Basin**
(`valleyBasin` — a flooded deep basin), **B16 The Bridge** / **B14 Lakeside Defile** on the Black
Lakes. Castles: **C14 The Moated Bailey** (`waterCastle` — drowned palaces), **C19 The Sea Fort** on a
lake, **C11 The Water Star** for the EPIC deep-estates.

**Coherence.** The **transition band** of the underworld: `swamp` (from UW1) + `volcanic` (from UW3)
overlap here, so the descent reads as a smooth heat/wet gradient across the boss-gates rather than three
disconnected rooms. Its wet `swamp` never touches the surface (mapVoid walls).

---

### 2.10 UW3 — the Inferno Vault (underworld · Singapore)

**Identity & real character.** Cryptoverse **Underworld 3** — the **deepest, final level**; the world's
**smallest zone by far** (63×64, 92 L2). Terrain reading: **the Inferno** — a compact molten throne-
room, the end of the descent, the ultimate boss vault. Its tininess is the point: not a continent, a
**final chamber**.

**Spatial facts.** **92 L2 (fewest of any zone) + 4,825 L3.** viewBox **63.3 × 64.0 — less than a fifth
the linear size of any other zone**. **52 SMALL + 30 MEDIUM + 10 LARGE, no GIANT/EPIC** — no room for
great estates; the whole vault is a single climactic arena. Dense (1193/1000u²).

**Dominant biomes + palette.** **`volcanic`** wall to wall (VOLCANIC biome — magma, obsidian, ash) with
a thin `ashen` rim. **Profile:** E 0.2 (the world's floor), M 0.2 (baked dry), T **1.0 (scorching — the
hottest ground in the world)**. Permanent fire-glow lighting.

**Macro features.**
- **The Magma Throne (authored):** a central **`volcanicCaldera`** lava lake — the final boss's seat;
  the deepest point of the world.
- **Lava rivers** radiating from the throne (hazard `river` of magma, not water).
- **No water, no sky, no exit but up.**

**Frontier / edge treatment.** **All four edges = `mapVoid` (rock/magma wall).** The **only connection
is up = the boss-gate to UW2**. A dead-end vault — the bottom of the world.

**Special-element hotspots.** **THE final boss** (the inferno champion — a Fire boss per `docs/05` §9's
elemental-champion roster; `World_4`/`Elemental` tier). Highest **Fire pet** affinity in the world.
Best material/loot drops (deepest risk). No sea/airship/estate great-castles — pure boss arena.

**Signature archetypes.** Battlefields **B13 The Caldera** (`volcanicCaldera` — the signature),
**B22 The Underworld** (`cavernWarren`, `volcanic` magma-cave variant). Castles: **C20 The Throat-
Cutter** (`citadelMound`) and **C16 The Pass Fort** as the final boss-gate approach; the vault itself
is more arena than castle.

**Coherence.** The **hot pole** of the descending underworld gradient (UW1 cool → UW2 warm → UW3
inferno) and the vertical **mirror of HS3** (the sky's cold sanctum) — top and bottom of the world are
thematic opposites (frozen ashen summit vs molten volcanic floor). Sealed on all sides; the only seam is
the boss-gate up.

---

## 3. Cross-continent coherence rules (global constraints)

These are the invariants the world field + overrides must satisfy so the whole map reads as one
coherent planet with three tiers.

1. **Biome-adjacency wheel.** Two families, bridged by `tundra`:
   ```
   MOIST-TEMPERATE family:   sakura ── verdant ── autumn ── swamp
   ARID/HOT family:          desert ── ashen ── volcanic
   BRIDGE (cool):            tundra  (may sit next to autumn, ashen, or verdant highlands)
   ```
   **Neighbouring parcels may differ by at most ONE wheel-step** across a land edge. A hard jump
   (e.g. `verdant`→`desert`) is illegal without an intervening transition band (`autumn`/`ashen`) or a
   natural barrier (sea, range, mapVoid). This is why no surface zone here places `desert` beside
   `verdant` — the surface family is entirely `sakura/verdant/autumn/swamp`, with `ashen`/`volcanic`
   confined to point-features (the HUB shaft, BUS urban cores) that are ringed by their own transition.

2. **Continuous coasts.** A `sea` edge on one parcel forces a `sea`/`coastal` role on the parcel across
   that edge if it exists; coastlines are unbroken polylines. The world's seas: **BUS north coast** and
   **ENT west coast** are the two great surface oceans; they **join at the NW corner** (BUS-west meets
   ENT-north as one continuous shore around the surface continent's NW). No inland zone (HUB, EDU) has a
   sea; sky/underworld have none (void/rock instead).

3. **Continuous rivers.** A river spine is a single polyline crossing many parcels; a `river` on
   parcel A's edge = a `river` on the neighbour's shared edge (a `river-crossing` edge type both sides).
   The world's rivers **source in the highlands and mouth at a sea**: **EDU plateau → HUB (radial) →
   BUS deltas → northern ocean**, and **HUB west-radial → ENT spine → western ocean**. Underworld
   rivers (UW1 stone-streams, UW2 black lakes, UW3 magma) are **internal** (no sea mouth — they pool).

4. **Continuous ranges.** Mountain ranges are polylines too. The named ranges: **EDU's rimwall**
   (encloses the academy plateau), **ENT's interior N–S spine**, **HUB's central massif** (the shaft
   rim). A `mountain-pass` edge is where a route crosses a range; a range edge with no pass = impassable
   (blends to `mapVoid`-like on the battle map's flank).

5. **Tiers are their own biome families — hard vertical seams, no horizontal blend.**
   - **Sky tier (HS):** pale cloud-`verdant` + `ashen` sky-ruin + one `volcanic` isle + `tundra`
     summit. **Every island rim = `mapVoid` (sky-void).** The **only** sky↔surface link is an
     **airship dock** (a designated rim parcel). Sky isles blend only *among themselves* (HS1→HS2→HS3
     ascending gradient), never into the surface.
   - **Underworld tier (UW):** dark `ashen` → `swamp` → `volcanic`, permanent low/fire light. **Every
     vault edge = `mapVoid` (rock wall).** The **only** UW↔surface link is the **single HUB shaft**
     (surface centre → UW1); UW levels connect only by **boss-gates** (UW1↔UW2↔UW3). Descending heat
     gradient; mirror of the sky's ascending cold gradient.
   - **Consequence:** a parcel's tier is read instantly from its palette + light + edge family. The
     three tiers never share a blended border — they share **portals** (airship dock, HUB shaft, boss-
     gate) only.

6. **Frontier rim treatment.** Where a zone's map-boundary is neither sea nor a tier-void, its clipped
   edge-pentagons are **`mapVoid`** and render as **"beyond the frontier"** (decision 12 / `docs/07`
   §4.4 — visible, not playable). Approaching a frontier rim, the surface field gently dries toward
   `autumn`/`ashen` steppe (a "the land runs out" fade) so the boundary reads as world's-edge, not a
   hard cut. Disabled zones (not yet server-enabled) render this way wholesale.

7. **Density echoes settlement.** `roughness`/`density`/urban-`ashen` biasing tracks §1.4's L3 density:
   loosest on ENT's open coast, tightest in the UW warrens — so the terrain visibly gets more built-up/
   claustrophobic from open surface country → dense cities → sky islands → cave vaults.

---

## 4. Machine-usable summary table (seed for `world-terrain.json`)

Per-zone authored-override seed. `E/M/T` = elevation / moisture / temperature centre bands (0–1);
`frontierEdges` lists which sides are `sea` / `mapVoid(void)` / `land`(blended) / `shaft` / `bossGate`.
Palettes/archetypes reference the template libraries by name.

| zone | tier | dominant biomes | palettes | E band | M | T | sea? | mountains? | frontier edges | special hotspots | signature templates |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **HUB** | surface | temperate grass/forest; ashen-volcanic shaft scar | verdant, autumn, (ashen) | 0.35–0.60 | 0.55 | 0.55 | no | central massif (shaft rim) | N/W/S = land-blend (BUS/ENT/EDU); E = frontier rim; corners = void | **Underworld SHAFT (dead centre)**; EPIC-estate belt; river crossroads | B2, B20, B8/B16, B24 · C1→C12/C15, C8 |
| **BUS** | surface | coastal lowland, urban ashen, delta swamp | verdant, ashen, swamp | 0.10–0.35 | 0.70 | 0.45 | **yes (N ocean)** | low coastal bluffs | N = sea; S = land-blend (HUB); E/W = frontier rim+void | **sea-ports (N coast)**; airship hub; great GIANT ports | B5, B17, B1, B16 · C9, C19, C14, C11, C15 |
| **ENT** | surface | warm coastal ribbon, blossom | sakura, verdant, autumn(N) | 0.15–0.40 | 0.60 | 0.65→0.50 grad | **yes (W ocean)** | interior N–S spine | W = sea; E = land-blend (HUB); N/S caps = void | **sea-ports (W coast)**; resort marinas; sakura landmarks | B17, B1, B14, B24 · C9, C19, C13, C10 |
| **EDU** | surface | academy plateau, blossom groves | sakura, autumn, verdant | 0.50–0.75 | 0.45 | 0.40 | no | **plateau rimwall + terraces** | N = land-blend (HUB, river-source); S/E/W = mountain frontier+void | **Grand Academy** (sole EPIC); airship port; scholarly landmarks | B24, B6, B14 · C24, C17, C13, C21 |
| **HS1** | sky | cloud-forest mesa | verdant, sakura | 1.0 (float) | 0.60 | 0.50 | no (cloud-cataracts) | central mesa + terraces | **ALL rims = sky-void**; entry = airship dock | **airship gateway** (sky front door); Wind/Grass pets | B21, B24 · C10, C21 |
| **HS2** | sky | floating volcano, storm-ash | volcanic, ashen, verdant | 1.0 (float) | 0.50 | 0.70 | no | **floating caldera** | **ALL rims = sky-void**; entry = airship dock | Fire/Electric pets; volcanic landmark; sky-boss site | B13, B21, B5 · C21, C20 |
| **HS3** | sky | ashen sky-ruins, frost summit | ashen, tundra, verdant | 1.0 (float) | 0.35 | 0.30 | no | frost cap | **ALL rims = sky-void**; entry = airship dock | **Sky Sanctum** (EPIC); dense sacred landmarks; Light/Wind pets | B21, B12, B22-adj · C21, C8, C24 |
| **UW1** | underworld | stone cavern warren, fungal swamp | ashen, swamp | 0.40 (subterr.) | 0.60 | 0.50 | no (cave streams) | cave-warren walls | **ALL edges = rock-void**; up = **HUB shaft**; down = **bossGate→UW2** | **level boss** (gate-keeper); kobold/mole monsters; Earth/Dark pets | B22, B9 · C16, C22, C8 |
| **UW2** | underworld | flooded deep caverns, magma veins | swamp, volcanic, ashen | 0.30 (deeper) | 0.80 | 0.65 | no (Black Lakes) | causeway lakes | **ALL edges = rock-void**; up = bossGate→UW1; down = bossGate→UW3 | **lake boss** + 5 EPIC drowned palaces; Water/Dark pets; raid-tier | B22, B15, B16/B14 · C14, C19, C11 |
| **UW3** | underworld | inferno vault, magma throne | volcanic, ashen | 0.20 (world floor) | 0.20 | **1.0** | no (magma rivers) | central caldera | **ALL edges = rock-void**; up = bossGate→UW2 (dead-end) | **FINAL boss** (inferno champion); best loot; Fire pets | B13, B22 · C20, C16 |

**Server/tier grouping seed:** Montreal(ca) = {HUB★, ENT, BUS, EDU}; Singapore(sg) = {HS1★, HS2, HS3,
UW1, UW2, UW3}. ★ = proposed launch continent (owner to confirm; HUB may sub-shard by quadrant).

**Vertical gradients seed:** sky ascends HS1(mild verdant) → HS2(hot volcanic) → HS3(cold ashen/tundra);
underworld descends UW1(cool stone) → UW2(warm swamp) → UW3(inferno volcanic). HS3 (frozen summit) and
UW3 (molten floor) are the world's opposite poles.

**Surface river/coast seed:** two oceans — BUS-north + ENT-west, joined at the NW corner. Two river
systems — [EDU plateau → HUB radial → BUS deltas → N ocean] and [HUB west-radial → ENT spine → W ocean].
Three ranges — EDU rimwall, ENT interior spine, HUB central massif (shaft rim).
