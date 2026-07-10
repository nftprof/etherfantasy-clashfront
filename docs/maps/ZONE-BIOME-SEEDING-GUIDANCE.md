# Zone & Biome Seeding Guidance — the map-side input for economy seeding params

> ⚠ **SERVER FIELDS — read `data/zone-registry.json`, never hardcode.** The server/start-zone topology is owned by the world-planning session and lives ONLY in the registry (4 servers: sg Singapore→Porthaven · jp Tokyo→Arcadia LIVE · us US-West→Mythoria-N · ca Montréal→Mythoria-S; Tianxia = destination). Any regeneration of tables in this doc MUST pull the server column from the registry — hardcoded values here have already caused two collisions.

> **Map-maker session, 2026-07-07 — for the CF Overworld Economics dev.** This is the **map/terrain
> half** of `docs/maps/MAP-ECONOMY-SEEDING-PARAMS.md` (your draft): what every **zone** *is* (biome,
> elevation, elements) and therefore what **materials, resources, POIs, recruits, and hazards** each one
> should seed — so your economic params are tuned to real terrain, then frozen into "what maps must have."
> Grounded in **`CONTINENT-TERRAIN-ATLAS.md`** (the 10-zone constitution), **`BIOME-RECRUITMENT-AND-ARMY.md`**
> (element↔biome↔class), and **Addendum-E**. POI *coordinates* are still pending (owner is sourcing them);
> POI *types per zone* are given here from the atlas so you can proceed.

## 0. The world is 10 zones, not one (the thing to internalize first)

There is **ONE world** of **10 geometried zones** on **3 vertical tiers**, served by the live server
topology in `data/zone-registry.json` (source of truth — see the ⚠ header note; decision 12). Every zone is a distinct **continent with its own biome, elements, and economy** — no zone
gives everything; players campaign across zones to complete an army *and* a materials base.

| Zone | Tier | Server | Biome identity (atlas) | Primary elements | Economy headline |
|---|---|---|---|---|---|
| **HUB** | surface | Montréal | Capital heartland; temperate grass/forest; central massif; river crossroads | Grass, Earth | balanced heartland; trade crossroads |
| **BUS** | surface | Montréal | Northern commercial **coast**; delta swamp; urban ashen | Water, Grass | **fish/salt/trade**; sea-ports |
| **ENT** | surface | Montréal | Warm **sakura coast**; resort marinas; blossom | Wind, Water, Grass | **herb/blossom + coastal**; prestige/leisure |
| **EDU** | surface | Montréal | **Academy highland plateau**; blossom groves; rimwall | Earth, Electric, Wind | **arcane/research + highland stone/iron** |
| **HS1** | sky | Singapore | Cloud-forest mesa; airship gateway | Wind, Grass | **aether/wind-crystal**; light heavy mats |
| **HS2** | sky | Singapore | Floating volcano; storm-ash | Fire, Electric | **obsidian/sulfur + storm-aether**; sky-boss |
| **HS3** | sky | Singapore | Frost sky-ruins; **sacred sanctum** | Wind, (Light) | **light-essence + relic/herb**; prestige |
| **UW1** | underworld | Singapore | Stone cavern warren; fungal swamp | Earth, (Dark) | **stone + iron begins**; level boss |
| **UW2** | underworld | Singapore | Flooded deep caverns; magma veins | Water, Fire | **iron/obsidian/gems**; drowned-palace rares |
| **UW3** | underworld | Singapore | Inferno vault; magma throne | Fire, (Dark) | **richest iron/obsidian/dark**; final boss, best loot |

## 1. The core principle — "broad but thin, concentrated rich" (generalizes your iron note)

Your iron example is the rule for **every scarce material**, not a UW3 exclusive:

> **A material is available *broadly* at low yield, and *concentrates* (rich) in its thematic zone.** The
> hard-to-reach zone is the **best** source, never the **only** source.

So **iron is minable on every tier** — thin on the surface, richer as you descend, **richest in UW3** — with
a monotonic depth gradient. Most players never reach UW3, so they still get iron (slowly) at home; UW3
holders get an *edge*, not a *monopoly*. Apply the same shape to stone (rich in highlands/caverns, present
everywhere), obsidian/sulfur (rich volcanic, trace elsewhere), fish/salt (rich coast), aether (rich sky),
herb (rich sacred/sakura). **Never gate a base material 100% behind one zone** — gate the *richness*, not
the *existence*. Prestige/rare essences (light, dark, relic) *may* be zone-exclusive (they're end-game).

## 2. Materials × zones richness matrix (0 = absent … 5 = signature-rich)

The table your seeding params tune against. Columns are zones; rows are materials. **Bold = the zone's
signature material** (its economic reason to exist).

| Material | HUB | BUS | ENT | EDU | HS1 | HS2 | HS3 | UW1 | UW2 | UW3 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Food** (farm) | 4 | 3 | 3 | 2 | 1 | 1 | 0 | 1 | 1 | 0 |
| **Timber** (forest) | 3 | 2 | 2 | 2 | **3** | 1 | 1 | 1 | 0 | 0 |
| **Stone** (quarry) | 3 | 1 | 1 | 4 | 1 | 2 | 2 | **5** | 4 | 3 |
| **Iron** (ore) — *depth grad* | 1 | 1 | 1 | 2 | 1 | 2 | 1 | 3 | 4 | **5** |
| **Gold** (precious/CT-node) | 3 | 3 | 2 | 2 | 2 | 2 | 2 | 2 | 3 | 3 |
| **Fish / Salt** (coastal) | 1 | **5** | 4 | 0 | 0 | 0 | 0 | 0 | 2 | 0 |
| **Obsidian / Sulfur** (volcanic) | 1 | 0 | 0 | 0 | 0 | **4** | 1 | 1 | 3 | **5** |
| **Gems** (deep/mountain) | 1 | 0 | 1 | 2 | 1 | 2 | 2 | 2 | 3 | **4** |
| **Aether / Wind-crystal** (sky) | 0 | 0 | 1 | 1 | **3** | 3 | 3 | 0 | 0 | 0 |
| **Herb / Blossom** (medicine) | 2 | 1 | **4** | 3 | 2 | 0 | 3 | 1 | 0 | 0 |
| **Arcane / Research** (academy) | 1 | 1 | 1 | **5** | 1 | 2 | 2 | 0 | 1 | 1 |
| **Light-essence** (rare, high sky) | 0 | 0 | 0 | 0 | 1 | 0 | **4** | 0 | 0 | 0 |
| **Dark-essence** (rare, deep) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 2 | **4** |

Notes: **Iron** is the pure depth gradient (surface 1 → UW3 5) — the shape you called out. **Stone** peaks
in the stone-warren UW1, high in the EDU plateau + deep caverns. **Light/Dark essence** are the only
zone-locked prestige mats (end-game). Every non-essence material has a ≥1 somewhere on the surface so
starter players are never hard-walled.

## 3. Per-zone detail cards (biome → seed)

Each card: **biome/terrain**, **materials to seed** (signature **bold**), **recruit elements → classes**,
**POI types** (coords pending), **wild/boss**, **hazards/edges**.

### Surface — Montréal server
- **HUB — Capital Heartland.** Temperate grass/forest, central massif, river crossroads. **Materials:**
  **food**, timber, stone (massif), gold (trade crossroads); trace iron. **Recruits:** Grass→supply/medic,
  Earth→heartland infantry. **POI:** the **Underworld SHAFT (dead centre)**, EPIC-estate belt, river-ford
  crossroads, capital markets. **Wild:** low-tier; **Boss:** shaft-guardian near centre. **Edges:** N/W/S
  blend to BUS/ENT/EDU; E frontier rim; corners = map-void.
- **BUS — Northern Commercial Coast.** Coastal lowland, delta swamp, urban ashen. **Materials:** **fish/
  salt**, trade goods, gold, food (delta); low stone/iron. **Recruits:** Water→marines/naval, Grass→trade
  workers. **POI:** **sea-ports (N coast)**, airship hub, giant harbor estates, markets. **Hazards:** N =
  open sea edge (naval approach); delta marsh slows infantry.
- **ENT — Western Carnival Coast.** Warm sakura coast, blossom, resort marinas. **Materials:** **herb/
  blossom**, fish (W coast), food, timber; leisure/prestige goods. **Recruits:** Wind→cavalry/scouts,
  Water→marines, Grass→medics. **POI:** **sea-ports (W coast)**, resort marinas, sakura landmarks.
  **Hazards:** W = sea edge; N/S caps = void.
- **EDU — Academy Highlands.** Plateau + rimwall/terraces, blossom groves. **Materials:** **arcane/research**,
  stone (rimwall), iron (highland ore, grade 2), herb. **Recruits:** Earth→highland infantry/miners,
  Electric→arcane engineers, Wind→scouts. **POI:** the **Grand Academy** (sole EPIC), airship port,
  scholarly landmarks; river source (N). **Hazards:** S/E/W mountain frontier + void; plateau chokepoints.

### Sky — Singapore server (all rims = sky-void; entry = airship dock)
- **HS1 — Cloud Gateway Isle.** Cloud-forest mesa + terraces. **Materials:** **aether/wind-crystal**,
  timber (cloud-forest), herb; minimal heavy stone/iron (floating). **Recruits:** Wind→recon/skirmishers,
  Grass→foresters. **POI:** the **airship gateway** (sky front door), terraced mesa districts. **Wild:**
  Wind/Grass pets. **Hazards:** all-rim sky-void (fall lines); cloud cataracts.
- **HS2 — Storm & Lava Isle.** Floating volcano, storm-ash. **Materials:** **obsidian/sulfur**, storm-
  aether, iron (volcanic grade 2). **Recruits:** Fire→sky siege/artillery, Electric→arcane. **POI:**
  volcanic landmark, **sky-boss site**, airship dock. **Hazards:** caldera lava fields; storm zones.
- **HS3 — High Sanctum Isle.** Ashen sky-ruins, frost summit, **sacred**. **Materials:** **light-essence**,
  relic/herb, aether, frost stone. **Recruits:** Wind→elite recon, (Light)→prestige lineages. **POI:** the
  **Sky Sanctum** (EPIC), dense sacred landmarks, airship dock. **Hazards:** frost cap; sacred-ground rules.

### Underworld — Singapore server (all edges = rock-void; vertical bossGate chain UW1→UW2→UW3)
- **UW1 — Upper Caverns.** Stone cavern warren, fungal swamp. **Materials:** **stone** (signature), **iron
  begins (grade 3)**, gems, fungal food. **Recruits:** Earth→heavy infantry/miners, (Dark) rare. **POI:**
  **level boss (gate-keeper)**, shaft-up to HUB, bossGate-down to UW2; kobold/mole camps. **Hazards:** no
  sky; cave-warren maze walls.
- **UW2 — Deep Caverns.** Flooded deep caverns, magma veins, Black Lakes. **Materials:** **iron (grade 4)**,
  obsidian/sulfur, gems, dark-essence (grade 2). **Recruits:** Water→amphibious, Fire→siege. **POI:**
  **lake boss + 5 EPIC drowned palaces** (raid-tier rares), bossGates up/down. **Hazards:** black-lake
  causeways (amphibious only); magma veins.
- **UW3 — Inferno Vault.** Inferno vault, magma throne. **Materials:** **richest iron (grade 5), obsidian
  (5), sulfur (5), dark-essence (4), gems (4)** — best loot in the world. **Recruits:** Fire→top-tier
  siege/artillery, (Dark). **POI:** the **FINAL boss (inferno champion)**, central caldera. **Hazards:**
  magma rivers; dead-end (deepest point); highest wild-strength scaling.

## 4. What the generator seeds today, and where it must grow (for you to freeze)

**Today** the map generator (`map-service/maps/generate.js`) seeds only two resource kinds — `GOLD_MINE`
and `WOOD_GROVE` — plus wild `mobs` and `TOWER` structures, counts/richness **budget-capped by invest tier
0..5** (`INVEST_TIERS`, `budget.maxRichness`). That's a placeholder economy.

**To realize this guidance**, the resource-node vocabulary should expand to the material taxonomy above,
**biome-weighted per the §2 matrix**. Proposed contract for your params to drive:

1. **Resource-node kinds** become: `FARM`, `TIMBER`, `QUARRY`, `IRON_VEIN`, `GOLD_MINE`, `FISHERY`/`SALT`,
   `OBSIDIAN`/`SULFUR`, `GEM_VEIN`, `AETHER_NODE`, `HERB_GROVE`, `ARCANE_SITE`, `LIGHT_SHRINE`,
   `DARK_RIFT`. The generator picks the kind-mix from the parcel's **zone/biome** using the §2 matrix as
   spawn weights; richness scales with the matrix value × invest-tier cap.
2. **Iron (and every material) uses the depth/richness gradient** (§1): the matrix value is the *ceiling*;
   surface parcels still roll a low-yield vein so no material is ever fully absent where the matrix says ≥1.
3. **Wild/boss seeding by zone:** wild-strength scales with tier depth (surface < sky < underworld, UW3
   highest); boss anchors at the atlas POI (shaft-guardian HUB, level/lake/inferno bosses UW1/2/3, sky-boss
   HS2). Mob **element** matches the biome (§3 of the recruitment doc).
4. **Recruit pool = the parcel's biome** (already the recruitment-doc contract) — the same biome tag that
   drives materials drives which pet **elements/classes** muster there.

**Frozen once you tune it:** the §2 matrix values (spawn weights), the kind vocabulary, the gradient rule,
and the per-zone wild/boss anchors become the "what maps must have" spec the generator enforces.

## 5. Open items (need owner / pending data)
- **POI coordinates** — types are listed per zone above; exact placements wait on the POI dataset the owner
  is sourcing. Until then the generator anchors POIs at the atlas's described locations (centre/coast/rim).
- **Material → craft chains** — this doc seeds *raw* materials by zone; how iron+timber→weapons, obsidian→
  siege, herb→medicine, etc. is the **economics dev's** half (your `MAP-ECONOMY-SEEDING-PARAMS.md`). This
  doc is the input; you own the sinks/recipes/values.
- **Confirm the §2 matrix** — it's my grounded proposal from the atlas; tune the numbers to your economy,
  then we freeze. In particular confirm the **iron depth gradient** (1/1/1/2/1/2/1/3/4/5) matches your intent.
