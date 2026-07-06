# Biome-Gated Recruitment & the Persistent Army (PROPOSAL for review)

> **Status: PROPOSAL for the product owner — not canon yet.** It connects three things already in the
> bible: the **PentaPet affinity framework** (`docs/ADDENDUM-E-PentaPet-Species-Affinity.pdf` — 6
> elements, each with military + civilian roles), the **per-zone biomes** (`docs/maps/CONTINENT-TERRAIN-ATLAS.md`
> + `docs/briefs/MAP-MACRO-TERRAIN-AND-POSITION-CONSTRAINTS.md`), and the **persistent-pet vision**
> (Addendum-E: one creature, carried across EF Hunt → economy → Clash Front → MOBA). The new mechanic:
> **which soldier/worker classes you can recruit on a map is gated by that map's biome, and recruited
> PentaPets persist into your army inventory after the battle.** Canon lands in `docs/05` §9 + `docs/08`
> once you sign off. Author: Clash Front Overworld design session, 2026-07-06.

---

## TL;DR

- **PentaPets ARE the soldiers/workers** (canon decision 10). Their **element (species) defines their best
  class** (Addendum-E): Earth → heavy infantry, Fire → siege, Water → marines, Grass → supply/medic,
  Wind → cavalry/scouts, Electric → arcane support.
- **Biome ↔ element.** Each zone/parcel has a biome (the atlas). A biome hosts certain **elements** of
  pets. **You can only recruit the classes whose element belongs to that biome** — a desert/volcanic map
  offers Fire siege; a coast offers Water marines; a mountain offers Earth heavy infantry; a plain/sky
  offers Wind cavalry; a forest offers Grass supply.
- **Recruit costs CT** (net-sink, decision 13 — drafting always costs full CT) and **the pets you raise
  persist into your army inventory** after the battle (the same PentaPet then carries on — Addendum-E's
  persistent ecosystem). Losses are real; survivors accrue experience.
- **Strategic consequence:** a **balanced army requires campaigning across biomes.** No single continent
  gives you every class — you must take a volcanic zone for siege, a coast for marines, a mountain for
  infantry. Biome diversity is the reason to expand.

So the map generator's biome (from `world-terrain.json`) directly drives the **recruitment pool** offered
on that parcel, and the battle's survivors feed a **persistent, growing army**.

---

## 1. The persistent-pet through-line (why recruitment matters)

Addendum-E: a PentaPet is **one persistent creature** — discovered in EF Hunt, trained in the kingdom,
**joins armies in Clash Front**, fights in EF MOBA, and keeps progressing. So in Clash Front:

`recruit a pet on a biome map (pay CT) → it fights in the battle → survivors return to your ARMY
INVENTORY with experience → it deploys again next battle (or works the economy between wars).`

This is why the biome gate matters: the units you can *acquire* depend on *where you fight*, and they're
not disposable tokens — they're a persistent roster you build over a campaign.

---

## 2. The 6 elements → unit classes (from Addendum-E)

Species (element) sets natural aptitude. Every pet *can* do any job, but each **excels** at its element's
specialties — so recruitment offers an element's **best classes** at full effectiveness:

| Element | Military classes (soldiers) | Civilian classes (workers) | "Footman/archer/worker" read |
|---|---|---|---|
| **Earth** | Heavy Infantry · Shield Units · Defensive Engineers · Fortress Builders | Mining · Quarrying · Construction · Masonry | the **heavy footman / sapper / builder** |
| **Fire** | Siege Engineers · Assault Units · Artillery | Blacksmithing · Smelting · Weapon Crafting | the **siege / assault / ranged-artillery** |
| **Water** | Naval Crew · Marines · River Logistics | Fishing · Harbor Ops · Water Mills | the **marine / naval / amphibious** |
| **Grass** | Medical Support · Supply Corps | Farming · Forestry · Herbalism · Ranching | the **medic / supply / food+timber worker** |
| **Electric** | Battlefield Support · Arcane Engineering | Workshops · Automation · Research | the **arcane support / engineer** |
| **Wind** | Reconnaissance · Fast Cavalry · Ambush Specialists | Couriers · Scouts · Caravan Leaders | the **archer/skirmisher / cavalry / scout** |
| *(future)* Ice · Light · Dark · Dragon | specialized lineages | — | rare elite classes (sky/underworld) |

**Generic-class mapping** (so "footman / archer / worker" always resolves): **footman/heavy** = Earth/Fire
melee · **archer/skirmisher** = Wind (+ Fire artillery for ranged siege) · **cavalry/scout** = Wind ·
**marine** = Water · **support/medic** = Grass/Electric · **worker** = every element's civilian tier
(biased to its economy: Earth→stone/iron, Grass→food/timber, Fire→weapons/armor, Water→trade/fish).

---

## 3. Element ↔ biome mapping (PROPOSED)

Which elements a biome hosts (so the biome gates the recruit pool). This is the missing `element↔biome`
link flagged OPEN in `docs/05` §9 — proposed here for review:

| Biome / terrain | Primary element(s) | Recruitable classes headline |
|---|---|---|
| Grassland / temperate | **Grass** (+ Earth) | supply, medic, food/timber workers |
| Temperate / autumn forest | **Grass** (+ Wind) | forestry workers, supply, skirmishers |
| Mountain / highland / rock | **Earth** | heavy infantry, shield, fortress builders, miners |
| Desert / dunes | **Fire** (+ Earth) | assault, artillery, smiths |
| Volcanic / ashen | **Fire** (+ Dark) | siege engineers, artillery |
| Coast / sea / river / marsh | **Water** | marines, naval, harbor/trade workers |
| Plains / steppe (open) | **Wind** | fast cavalry, scouts, couriers |
| Sky / floating (HS tier) | **Wind** + **Electric** (+ Light) | recon, arcane support, elite fliers |
| Underworld / cavern (UW tier) | **Earth** + **Fire** (+ Dark) | infantry, siege, miners, rare deep lineages |
| Sakura / sacred (authored) | **Grass** + **Wind** (+ Light) | medics, scouts, prestige units |

---

## 4. Per-continent recruitment (tie to the Continent Terrain Atlas)

Applying §3 to the 10 zones — the **recruit roster each continent offers** (why you campaign there):

| Zone | Biome (atlas) | Recruitable elements | Headline classes you go there FOR |
|---|---|---|---|
| **HUB** | temperate grass/forest | Grass, Earth | supply/medic + heartland infantry |
| **BUS** | northern coast, delta, urban | Water, Grass | **marines/naval** + trade workers |
| **ENT** | warm sakura coast | Wind, Water, Grass | **cavalry/scouts** + marines |
| **EDU** | academy highland plateau | Earth, Electric, Wind | **arcane support/engineers** + highland infantry |
| **HS1** | cloud-forest sky | Wind, Grass | recon/skirmishers, fliers |
| **HS2** | storm/lava sky | Fire, Electric | **sky siege + arcane** elites |
| **HS3** | frost sky ruins | Wind, (Ice/Light) | rare elite lineages |
| **UW1** | stone caverns | Earth, (Dark) | **heavy infantry**, miners |
| **UW2** | flooded deep + magma | Water, Fire | amphibious + **siege** |
| **UW3** | inferno vault | Fire, (Dark) | **top-tier siege/artillery** |

Read across the table: **no one zone gives everything.** Want a full combined-arms army (infantry +
marines + cavalry + siege + support)? You must project power across biomes — the recruitment gate is what
makes continental diversity strategically necessary.

---

## 5. The recruitment mechanic (proposed rules)

1. **Recruit pool = the parcel's biome** (from `world-terrain.json`). The march/muster UI on a parcel
   offers only that biome's element classes; foreign classes are greyed with "not native to this biome —
   recruit them where they live."
2. **Recruit costs CT** (net-sink; decision 13 — *drafting always costs full CT*, no free-soldier faucet).
   Cost scales by class tier; the parcel's **investment tier + pet-den/PET_DEN anchors** raise the
   recruit **cap/speed** (enrichment perk) but never the per-unit cost.
3. **Capacity is land-bound:** a parcel's **population/pet-den tier** (see `LAND-VALUE-AND-IMPROVEMENT.md`
   §3a) sets how many you can muster there; resource tiles (Grass→food/timber, Earth→stone/iron) feed the
   upkeep.
4. **Persistence (the key ask):** pets you raise are **added to your army inventory** and, as survivors of
   the battle, **carry forward** (experience, morale, equipment — Addendum-E's productivity model). Deaths
   are permanent removals from the roster; survivors get stronger. This is what makes the army a built,
   owned asset rather than per-battle throwaway.
5. **Species define talent, not a hard cage (Addendum-E nuance):** the biome gate governs *availability*
   (which pets live/recruit there), and element sets *best class*. A pet can still be re-tasked later
   (a Grass pet trained into a miner over time) — but the *native recruitment offer* on a biome map is its
   element's specialties. (Owner call in §7: hard-gate availability, or soft-bias with cross-recruit penalty.)

---

## 6. Map-generation hook (how the generator serves this)

- The generator already stamps **`meta.biome`** per map (from `world-terrain.json`, the macro-terrain
  field). The recruitment service reads that biome → offers the matching element pool.
- **Resource tiles** the generator places (`GOLD_MINE`/`WOOD_GROVE`, and proposed element-typed tiles)
  feed the **upkeep economy** of the recruited workforce (Grass biome → timber/food for Supply Corps;
  Earth biome → stone/iron for Fortress Builders).
- **PET_DEN build anchors** (decision 9, CoC layer) are the muster points — their count/tier (bought with
  CT) is the recruit **capacity** on that parcel.
- So a parcel's **biome + invest tier + resource tiles + pet-dens** together define *what* and *how many*
  you can recruit there — all deterministic, all from the map artifact.

---

## 7. Open questions for the owner

1. **Per-pet element assignment** — the blocker: which of the 128 pets is Earth/Fire/Water/Grass/Electric/
   Wind (+ future Ice/Light/Dark/Dragon)? Not in `PETS_ROSTER.csv` (names/models only). Need the element
   sheet, or a rule (e.g. by model/theme) to assign them. **Everything else is ready once this lands.**
2. **Hard-gate vs soft-bias** — can you *only* recruit a biome's native elements (hard), or recruit others
   at a cost/efficiency penalty (soft, per Addendum-E's "any task possible")?
3. **Class granularity** — do we expose the full element class lists (heavy infantry / shield / siege /
   marine / cavalry / support …), or a simplified footman / archer / cavalry / siege / worker set mapped
   onto elements?
4. **Flying pets (24)** — a distinct air class (scouts/naval-spotters, `docs/05` §9 hook) recruited only in
   Wind/sky biomes?
5. **Worker vs soldier** — are workers recruited the same way (biome-gated) and do they also persist into a
   civilian workforce inventory, or is v1 soldiers-only (workforce sim was punted in decision 10)?
6. **Experience/loss model** — how much do survivors gain; is death permanent roster loss (recommended, ties
   to CT sink + stakes) or revive-for-CT?

---

## 8. Ties to existing systems

- **`docs/ADDENDUM-E-PentaPet-Species-Affinity.pdf`** — the 6-element affinity + persistent-ecosystem source.
- **`docs/maps/CONTINENT-TERRAIN-ATLAS.md`** + **`docs/briefs/MAP-MACRO-TERRAIN-AND-POSITION-CONSTRAINTS.md`**
  — the per-zone/parcel biomes the gate reads.
- **`docs/05-pve-integration.md` §9** — rosters + the OPEN `element↔biome` + per-pet element questions (§7.1).
- **`docs/maps/LAND-VALUE-AND-IMPROVEMENT.md`** — pet-den/population capacity + resource tiles = recruit cap + upkeep.
- **Canon decisions 9, 10, 13** — PET_DEN build anchors, pets = soldier unit types, net-sink + full-CT
  drafting + element↔biome pet migration.
- **`data/PETS_ROSTER.csv` / `data/CHARACTER_ROSTER.csv`** — the 128 pets / Masters+monsters+bosses.
