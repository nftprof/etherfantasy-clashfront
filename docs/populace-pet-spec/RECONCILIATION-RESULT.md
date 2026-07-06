# Reconciliation result — populace pet spec vs the Clash Front economy

> The CF Overworld design session's per-item verdict on `README.md`'s 5 asks. **Headline: strong MATCH.**
> The site's 5 aptitudes, rank ladder, per-element vectors, formula, and scarcity distribution align with
> the CF economy model (`../reports/ECONOMY-MASTER-SUMMARY.md`, `../reports/PET-APTITUDE-ECONOMY-MAP.md`,
> `../reports/BATTLE-MAP-AND-UNIT-SPEC.md`, canon decision 17). **No per-pet numbers need revising** — so
> **no `pets-aptitudes.revised.csv` is required.** The only site-copy changes are **framing** (roadmap
> labels on not-yet-built systems) + **aura scope terms**, listed below.

## Verdict table

| # | Item | Verdict | Target state |
|---|---|---|---|
| 1 | The 5 aptitude axes | **MATCH** | Keep exactly. They map 1:1 to CF roles (below). No rename/drop. |
| 2 | Rank multiplier ×1.0–2.2 | **MATCH** | Rarity = real power (combat + work), the NFT/rental core; decision-17 cap holds P2W. |
| 2b | Auras (party/district/kingdom + edict) | **REVISE (scope + phase)** | Keep the concept; relabel scopes to CF terms; **party-buff now, district/kingdom auras + mythic edict = roadmap**. |
| 3 | Role lists (Kingdom work / War duties / Brings home) | **MATCH as flavor over real buckets** | Keep all the flavor; each resolves to a CF unit archetype / resource (mapping below). Trim nothing; roadmap-label the Arcane/diplomacy ones. |
| 4 | Productivity formula | **MATCH** | It IS the live CF engine (already adopted). No site-text change. |
| 5 | Over-promises | **REVISE (roadmap-label, don't remove)** | List below — flavor stays, but mark future systems "roadmap" so launch isn't over-promised. |

## 1. Aptitude axes → CF roles (MATCH, with phase)

| Aptitude | CF role | CF activity | Phase |
|---|---|---|---|
| **Industry** | Crafter | ore→iron→gear production chain | **SOON** |
| **Agriculture** | Farmer | food + timber gathering | **NOW (MVP)** |
| **Military** | Soldier (elite) | combat units (see §3) | **NOW (MVP)** |
| **Logistics** | Hauler | transport/supply — kept *light* (market-order + raidable caravan) | **LATER** |
| **Arcane** | Adept | deep-mine/gems, blueprints, pet-DNA, magic | **LATER (expansion)** |

Dormant ≠ removed: Logistics + Arcane stay on the sheet, they just activate in later phases.

## 2b. Aura scoping + phasing (REVISE the copy)

| Site aura | CF scope term | Phase |
|---|---|---|
| rare **+5% to a work party** | +5% to the **army/work-crew** it joins | **near-term** (simple, keep) |
| legendary **+10% to its district** | +10% to the owner's **region/zone** | **roadmap** |
| mythic **+15% kingdom-wide + unique edict** | +15% across the owner's **empire (holdings)** + a **unique ability** | **roadmap** (don't promise a bespoke edict at launch) |

Keep them on the pages, but frame district/kingdom auras + the mythic edict as **"future / roadmap"** so
launch isn't on the hook for empire-wide aura systems day one.

## 3. Role lists → CF real buckets (MATCH; the flavor resolves cleanly)

The element role-lists are excellent worldbuilding and **all resolve to CF's real categories** — keep the
flavor, it just maps mechanically:

**War duties → CF ELITE unit archetype** (the class the command center hires; `BATTLE-MAP-AND-UNIT-SPEC` §5):
| Flavor (examples) | CF unit archetype |
|---|---|
| Front Line, Heavy Infantry, Shield/Bulwark Units, Line Breakers, Vanguard | **INFANTRY / heavy line** |
| Siege Engineers, Artillery, Warmachine Crews, Fortress/Defensive Engineers | **SIEGE** |
| Fast Cavalry, Ambush, Elite Shock Units | **CAVALRY** |
| Naval Crew, Marines, River Logistics | **MARINE / SHIP** (naval is canon: SEA/SHIP/MARINE — later phase) |
| Reconnaissance, Scouts, Espionage, Night Ops | **scouting/intel** (light; roadmap for deep espionage) |
| Battle Magi, Ward Casters, Ritual/Arcane Engineering | **ARCANE units** (expansion) |
| Medical/Supply Corps, Battlefield Support | **support** (morale/logistics; light) |

**Brings home → CF resource** (`ECONOMY-RESOURCE-MAP`):
| Flavor | CF resource |
|---|---|
| Stone, Clay, Iron, Granite, Ore, Steel, Fortifications | **iron / materials** |
| Weapons, Armor, Industrial Production, Machinery | **crafted goods** (Industry output) |
| Food, Timber, Medicine, Population Growth | **food / timber** |
| Treasure, Tribute, Prestige, Trade, Shipping | **gold** |
| Scrolls, Enchantments, Knowledge, Reagents, Rare Ice Cores | **gems/CT-tier + materials** (Arcane, expansion) |
| Silk, Honey, Potions, Antidotes | **materials / luxuries** |

**Kingdom work → the Industry/Agriculture activity** (Blacksmithing/Smelting/Refining = *craft*;
Farming/Forestry/Herbalism = *farm*; Mining/Quarrying = *mine*). The specific job names are flavor over
the generic craft/farm/mine buckets — **no distinct minigame promised per job name.**

## 5. Roadmap-label list (REVISE copy — keep as flavor, don't build at launch)

Frame these as **future/roadmap** on the site so launch isn't over-promised:
- **Arcane systems** — enchanting, scrolls, divination, wards, rituals, academy/research (expansion).
- **Deep diplomacy/administration/espionage** — treaties, census, interrogation, sabotage, night ops (later).
- **Granular craft sub-jobs** as distinct mechanics — glass-making, dream-tending, waste reclamation, etc.
  (they collapse into generic craft/farm/mine; keep as flavor, not separate systems).
- **District/kingdom auras + mythic edict** (§2b).
- **Heavy logistics/trade + naval** — auto-caravans, trade routes, naval combat (light/later; naval is
  canon but later-phase).

Everything else — **Military (all combat archetypes), Agriculture (food/timber), basic Industry
(craft→gear), and all "Brings home" resources** — is launch-real.

## Integration of your scarcity numbers (accepted — and economically ideal)

`role-scarcity-summary.md` answers my three finalization items, and the distribution is **great** for the
economy — I'm adopting it:

- **Role supply → prices (adopted):** Farmers (1,945) & Adepts (1,824) are **scarcest → premium**;
  Soldiers (4,005) & Crafters (4,028) **abundant → cheap**. This is *ideal*: it makes **food/farming a
  genuine premium** (food is our army-upkeep + battle-clock constraint, so scarce farmers = food matters),
  makes **mass soldiers cheap** (the meatgrinder sink works), and makes **Adepts/Arcane rare** (fits the
  high-tier expansion). No change requested.
- **Rank ceiling → power cap (adopted):** mythic **20 pets total (0.1%)**, legendary+mythic **2.9%** — a
  **tight, healthy power ceiling.** Combined with decision-17's per-user CT cap, rarity is *real power*
  without breaking F2P or the token. Perfect.
- **Biome pools (adopted as the seed; CF wheel consolidates):** your 16 element-derived biomes map onto
  CF's battle-map biome set (`BATTLE-MAP-AND-UNIT-SPEC` §2) — I'll consolidate them into the CF wheel:

| Your biome(s) | CF battle biome |
|---|---|
| Forest, Jungle, Swamp | **Temperate/forest** (wood-biased; rangers/insect/leaf) |
| Highlands, Mountains, Ironworks, Volcanic Peaks | **Hills/mountain** (ore/gold; earth/rock/iron) |
| Grassland, Battleplains | **Plains** (balanced; combat/neutral) |
| Volcanic, Haunted Wastes | **Volcanic/ruins** (rich ore/gems; fire/toxin/phantom) |
| Tundra | **Snow/tundra** (ice) |
| Coast/River | **Coast** (naval/trade; water/flyer — later naval phase) |
| Skyreach, Storm Plains, Arcane Ruins | **Arcane/sky** (expansion; lightning/mystic/telepath/dragon) |

So the command center's **hire pool per battle = the pets whose element sits in that CF biome** — exactly
the geography/specialization keystone. Element→biome is a design choice; the mapping above is my
recommended consolidation for the CF biome wheel.

## Net: what the website should change

1. **No number/aptitude changes** — the per-pet vectors are accepted as CF-canon-compatible.
2. **Add "roadmap/future" framing** to the §5 systems (Arcane, deep diplomacy/espionage, granular
   craft-jobs, district/kingdom auras + edict, heavy logistics/naval) so launch copy is honest.
3. **Relabel aura scopes** to CF terms (party→army, district→region, kingdom→empire), §2b.
4. Everything else ships as-is. The spec is adopted into the CF economy as the pet/unit foundation.
