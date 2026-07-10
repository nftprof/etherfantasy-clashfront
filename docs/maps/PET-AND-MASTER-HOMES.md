# PentaPet Populations & Master Homes — per-zone element mapping

> **Map-maker session, 2026-07-07.** Maps **which PentaPet element-types populate each zone** (the recruit/
> wildlife pool per region) and gives each **Master a home zone**. Grounded in the real rosters:
> `docs/populace-pet-spec/pets-aptitudes.csv` (228 typed pets, 17 elements → biome) + `data/CHARACTER_ROSTER.csv`
> (47 Masters, 10 Bosses) + `data/zone-registry.json` (the 12 zones). Element↔biome from the pet spec;
> biome↔zone from the Continent Atlas.
>
> **Gameplay note (owner):** a Master **buffs units of its matching element** — so a Master's home is not
> purely cosmetic: home = the land of the Master's element, where its buffed pet-type also recruits. That
> makes home ↔ element ↔ local pet population one coherent chain.

## 1. The element → biome → zone ladder (the backbone)

The pet spec gives a clean 1:1 **element → biome_hint** (228 pets). I fold its 16 fine biomes onto the 12
CF zones by identity (Atlas). Each element has a **primary home zone** (its signature population) and may
appear **secondarily** in kindred zones.

| Pet element | pets | biome_hint | **Primary CF zone** | also in |
|---|--:|---|---|---|
| **Neutral** | 16 | Grassland | **HUB** Tianxia | — |
| **Combat** | 9 | Battleplains | **HUB** Tianxia | EDU |
| **Leaf** | 29 | Forest | **ENT** Mythoria | HUB, EDU, HS1 |
| **Insect** | 17 | Jungle | **ENT** Mythoria | HS1 |
| **Water** | 29 | Coast/River | **BUS** Porthaven | ENT, UW2 |
| **Toxin** | 9 | Swamp | **BUS** Porthaven | UW1 |
| **Earth** | 10 | Highlands | **EDU** Arcadia | UW1 |
| **Telepath** | 9 | Arcane Ruins | **EDU** Arcadia | HS3, CGI |
| **Flyer** | 9 | Skyreach | **HS1** Aeropolis | HS3, KOL |
| **Fire** | 20 | Volcanic | **HS2** Emberfall | UW2, UW3 |
| **Lightning** | 9 | Storm Plains | **HS2** Emberfall | — |
| **Ice** | 13 | Tundra | **HS3** Empyrea | — |
| **Iron** | 12 | Ironworks | **UW1** Ironhold | EDU |
| **Rock** | 2 | Mountains | **UW1** Ironhold | EDU |
| **Phantom** | 13 | Haunted Wastes | **UW2** Blackmere | UW3 |
| **Mystic** | 9 | Arcane Ruins | **UW3** Luxuria | HS3, CGI |
| **Dragon** | 13 | Volcanic Peaks | **UW3** Luxuria | HS2 |

*(Light / Dark are reserved future elements — Light → HS3/Empyrea + CGI; Dark folds into Phantom+Mystic in
the underworld today.)*

## 2. Zone → PentaPet population + RARITY GATE (owner-tuned)

What population each region hosts (wild + recruit pool) **and the rarity band** allowed there. Machine
form: **`data/zone-pet-population.json`**. Rarity ladder: common < uncommon < rare < legendary < mythic.

**Progression (the keystone):** the **up-to-RARE surface is the shared starting world** — **Tianxia** (the
great convergence hub, biggest land, where everyone joins) + the three starters **Arcadia · Porthaven ·
Mythoria**. The **Sky (HS) and Underworld (UW) tiers are RARE-GATED** — you need rare-tier progression to
enter, and they hold the **legendary/mythic** pets. **HS3 + UW3** (highest sky / deepest hell) reach
**mythic**. Common(31)/uncommon(81)/rare(80) ≈ 192 pets are open to all; legendary(26) gated to HS/UW;
mythic(10) only HS3/UW3 + the prestige islands.

| Zone | Name | Role | **Rarity band** | **Pet elements (population)** | example pets |
|---|---|---|---|---|---|
| **HUB** | Tianxia | convergence hub | **common → rare** | Neutral · Combat · Leaf · Water · Earth · Fire · Lightning · Flyer · Toxin | Cesstoid, Blockid, Nageel |
| **ENT** | Mythoria | starter | **common → rare** | Leaf · Insect · Fire · Lightning · Water · Earth · Toxin | Dilloom, Vivorin, Kyari |
| **BUS** | Porthaven | starter | **common → rare** | Water · Toxin · Flyer | Nageel, Palytid, Gremin |
| **EDU** | Arcadia | starter | **common → rare** | Earth · Telepath · Iron · Leaf | Keradon, Geckno, Mintol |
| **HS1** | Aeropolis | rare-gated · sky | **uncommon → legendary** | Flyer · Leaf | Gremin, Inkami, Pangrass |
| **HS2** | Emberfall | rare-gated · sky | **rare → legendary** | Fire · Lightning · Dragon | Chulember, Mianari, Baulder |
| **HS3** | Empyrea | rare-gated · sky apex | **rare → mythic** | Ice · Telepath · Flyer · *Light* | Tygloo, Swifty, Silvyx |
| **UW1** | Ironhold | rare-gated · underworld | **uncommon → legendary** | Iron · Rock · Earth · Toxin | Morinori, Thermolophus, Matara |
| **UW2** | Blackmere | rare-gated · underworld | **rare → legendary** | Phantom · Water · Fire | Eekape, Vibe, Mirrie |
| **UW3** | Luxuria | rare-gated · deepest | **rare → mythic** | Mystic · Dragon · Phantom — the dark/mystic deep | Berrball, Cobrus, Intelix |
| **CGI** | Olympus | prestige · founders | **legendary → mythic** | Mystic · Dragon · Telepath (residents, no wild pool) | Intelix, Dredrock |
| **KOL** | Fortuna | prestige · influencers | **legendary → mythic** | Flyer · Neutral (residents, no wild pool) | Inkami, Geenee |

**UW3/Luxuria = mostly dark/mystic, rare→mythic** ✅. Underworld reads Iron/stone (UW1) → haunted/drowned
(UW2) → dark/mystic/dragon inferno (UW3). Note common/uncommon elements like Fire/Water/Earth appear in BOTH
a starter band (their low-rarity forms, e.g. Tianxia/Mythoria) AND their gated home (their legendary/mythic
forms, e.g. Fire→Emberfall) — the *element* spans zones, the *rarity* is what gates.

**Recruitment tie-in:** a parcel's battle map offers the recruit classes of **its zone's elements**, **only
within the zone's rarity band** (`BIOME-RECRUITMENT-AND-ARMY.md` + the gate above) — so a starter can muster
common→rare Fire units on Mythoria, but the legendary Fire lineages only unlock on rare-gated Emberfall.

## 3. Master homes (lore + the element-buff coherence)

**Rule:** `masterHome = primaryZoneOf(master.element)` — a Master hails from, and homes in, the land of its
element, which is also where its **matching-element buff** resonates with the pet population (§2). Use the
element→home lookup:

| Master element | Home zone | | Master element | Home zone |
|---|---|---|---|---|
| Neutral / Combat | **HUB** Tianxia | | Ice | **HS3** Empyrea |
| Leaf / Insect | **ENT** Mythoria | | Iron / Rock / Earth | **UW1** Ironhold |
| Water / Toxin | **BUS** Porthaven | | Phantom | **UW2** Blackmere |
| Earth / Telepath | **EDU** Arcadia | | Mystic / Dragon | **UW3** Luxuria |
| Flyer | **HS1** Aeropolis | | (rare/legendary) | **CGI** Olympus |
| Fire / Lightning | **HS2** Emberfall | | (celebrity/prestige) | **KOL** Fortuna |

> **⚠ §3 SUPERSEDED (2026-07-10):** Masters are **ELEMENT-FREE** (owner ruling —
> `MASTERS-ELEMENT-FREE-RULING.md`): no Master element exists, so homes are NOT element-derived and the
> blocker below is **dissolved**. Homes were instead assigned by **LORE** (website session, live at
> etherfantasy.com/world) — **source of truth: `src/data/masterHomes.json` in the fe-website repo.**
> §1–§2 of this doc (pet element→zone ladder, populations, rarity gates) remain adopted canon.

### ⚠ Blocker: the 47 Masters have **no element data** in any file
`data/CHARACTER_ROSTER.csv` lists all 47 Masters by name, but the **Element column is empty** for every one
(only **Bosses** encode element in their names — Centaur_Warrior_**Fire**, Sunwon_Magician_**Fire**, etc.).
So I can apply the home rule the moment each Master's element is supplied — but I won't invent 47 elements.

**To finalize, I need the Master → element list** (one of):
- the **live Masters API** (`api.etherfantasy.com`, `docs/09` §7) almost certainly carries each Master's
  element — unreachable from this sandbox, but CF can pull it and auto-derive homes via the table above; or
- an owner-provided `Master,Element` list — drop it in and I'll home all 47 in one pass.

**Provisional (name-inferred, low confidence — confirm):** a few names hint an element →
`Dragon_Cho` → Dragon → **UW3 Luxuria**; `Death_Jinook` → Phantom/dark → **UW2 Blackmere**. The rest
(Maple, Purin, Blis, the `Type_*` series, …) need the real element.

### Bosses (elements ARE in the data) — homed now
| Boss | element | Home |
|---|---|---|
| Centaur_Warrior_Fire · Sunwon_Magician_Fire · Zouwan_Warrior_Fire | Fire | **HS2** Emberfall (secondary UW2/UW3) |
| Centaur_Warrior_Water | Water | **BUS** Porthaven |
| Elemental | multi | **UW3** Luxuria (the final vault) |
| World_1..4 · Raid_LeeKoon | raid tier | the underworld chain (UW1→UW2→UW3), deepest = hardest |

## 4. What this feeds
- **Base/seed pass:** the zone's signature elements set the **wild creature population** + the **recruit
  pool** the seed layer spawns (mob camps, pet-den populations) — `ZONE-BIOME-SEEDING-GUIDANCE.md`.
- **Master roster:** homes are lore flags on each Master; the element-buff makes home ↔ local population
  coherent. Purely presentational until the Master→element list lands.
- **Open (owner):** supply Master elements (or greenlight pulling them from the Masters API); confirm the
  two future elements (Light→Empyrea/Olympus, Dark→underworld); confirm the prestige islands host no wild
  recruit pool (residents only).
