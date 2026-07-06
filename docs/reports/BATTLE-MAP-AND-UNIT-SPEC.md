# Battle-Map Generation Numbers + Cross-Layer Unit & Structure Model (for the MOBA map team)

> Owner asked (2026-07-06) to DECIDE the factors so the map team can generate maps to our logic: how many
> gold/wood spots per land size/tier/biome, how often they replenish, CT cost + effect of land upgrades,
> and how in-battle structures/units translate to the CF land layer. Decisions below are **⚙ starting
> numbers, authoritative for map generation** — grounded in `INVEST_TIERS` (`map-service/maps/schema.js`),
> the ±161 arena (docs/04 §7b), `LAND-VALUE-AND-IMPROVEMENT.md`, the resource model
> (`ECONOMY-RESOURCE-MAP.md`), and the security invariant (decision 17). Governs: the generator's budgets,
> CF's allocate context, and the settlement callback.

---

## 1. Resource-tile spawns per battle map (what the generator places) — for the map team

**Per ±161 component (= one battle map).** Count/richness/camps come straight from the parcel's
`INVEST_TIERS` tier; **type split (gold vs wood) comes from BIOME**; owner may tilt ±1 tile via the
gold-vs-wood bias.

| Tier | Resource tiles | Richness (yield mult) | Mob camps (guardians) | Owner towers | Barriers/walls | Landmark |
|---|---:|---:|---:|---:|---:|:--:|
| 0 Untamed | 2 | 40% | 1 | 0 | 0 | — |
| 1 Settled | 3 | 55% | 2 | 1 | 0 | — |
| 2 Developed | 4 | 70% | 3 | 2 | 1 | ✓ |
| 3 Prosperous | 5 | 85% | 4 | 3 | 2 | ✓ |
| 4 Rich Vein | 6 | 100% | 5 | 4 | 3 | ✓ |
| 5 Golden | 8 | 100% | 6 | 6 | 4 | ✓ |

**Yield per tile per battle (⚙, at 100% richness; scale by the richness mult):**
- **Gold tile:** **50 gold** accessible (surface) per battle · **Wood grove:** **60 wood** per battle · **Ore/iron outcrop:** **40 iron**.
- So a **tier-5 map with 8 tiles** ≈ 8 × ~50 = **~400 gold-equivalent** of harvestable resource — "fighting in a gold mine." A **tier-0** map ≈ 2 × 20 = **~40** — barely worth mining.

**Replenishment (per `ECONOMY-RESOURCE-MAP` §5):**
- **Wood groves = renewable:** regrow to full over **~3 world-days** (⚙ `woodRegrowDays`). Cut in a battle → thinner next battle → back after regrow.
- **Gold/iron = finite:** do **NOT** regrow. The tile's reserve is **enrich-seeded** (owner CT) and **depletes** as mined; re-fill only by re-enriching or deep-mining. So the same map's gold **is gone on replay** until re-seeded (the anti-farm rule, decision 17-safe).
- **Mob camps** scale with tier — **richer land literally spawns more monsters** (the "rich land attracts monsters, fight while you mine" mechanic + the turtle-farm escalation clock).

## 2. Biome → resource bias + unit pool (the geography keystone)

Biome sets the **default tile-type split** and the **local unit species** (see §5). Owner bias can tilt
the split ±20% (one tile type over the other):

| Biome | Gold/ore : Wood split | Signature resource | Local unit species (elite pool) |
|---|---|---|---|
| **Temperate forest** | 30 : 70 | wood | rangers, wolf-riders |
| **Hills / mountain** | 70 : 30 (ore/gold) | iron, gold | dwarves, golems, kobold miners (Ep03) |
| **Plains / grassland** | 50 : 50 | balanced, food | footmen, cavalry |
| **Desert** | 60 : 40 (sparse, +deep gold) | gold (deep), gems | mummies, scarabs (Ep04) |
| **Snow / tundra** | 40 : 60 | wood, pelts | gargoyles, snow-wolves (Ep02) |
| **Volcanic / ruins** | 80 : 20 (rich ore/gems) | gems (deep), rare | statues, minotaur, robots (Ep05/11) |

This is why land is heterogeneous and trade is real: a forest owner farms wood, needs a hills owner's
iron → they trade (or fight). Biome × tier × owner-bias = a unique, meaningful map.

## 3. Land size → number of battle components (the siege scale, docs/04 §7b)

Resources + structures multiply by the number of ±161 components a land holds:

| Class | ±161 components | Max tier | Castle? | Total resource scale |
|---|---:|---|:--:|---|
| **Single parcel** | 1 | 5 | ✗ | 1 map's worth (§1) |
| **Estate — SMALL** | ~28 | 5 | ✓ | 28× a single |
| **Estate — … EPIC** | ~480 | 5 | ✓ | 480× — a campaign, castle = final component |

So a whale's tier-5 EPIC estate is **~480 battle maps × 8 rich tiles** — an enormous productive + defensive
asset (and an enormous CT sink to build). Only estates get a **castle** (decision 5) as the final,
strongest component.

## 4. Land upgrade — CT cost + effect (the owner's invest menu; feeds ECONOMY-SEAM Hook 2)

**Exponential cost (whale sink; estates ~8×). ⚙ starting numbers:**

| Tier | Single parcel (CT) | Estate (CT) | Unlocks |
|---|---:|---:|---|
| →1 | 10 | 80 | +1 tile, 1 tower |
| →2 | 30 | 240 | +1 tile, landmark, richness 70% |
| →3 | 90 | 720 | +1 tile, **strategic ground** (high-ground/choke), richness 85% |
| →4 | 270 | 2,160 | +1 tile, richness 100%, castle **grade I** (estate) |
| →5 | 810 | 6,480 | 8 tiles, 6 towers, castle **grades II–III** (estate) |

- CT is **burned** on invest (net-sink; ≥10% floor of decision 17 always applies). **Tier (the cap) is
  permanent; the reserve that fills it depletes** (raids/mining). Fully-abandoned land slowly reverts.
- **Repair** damaged structures = **~30% of build cost in CT + materials**; destroyed → rubble until rebuilt.
- **Castle grade** (estates): each grade adds **1 wall ring = 1 more ±161 component to breach** + a stronger
  keep (final-component HP). ~3 grades (manor→keep→fortress) gated by estate size.

## 5. The unit model — line = workers (CT), elite = hired biome mons (gold)

The populace mons' **dual role (worker / soldier)** maps *exactly* onto our two unit classes — and the
MOBA's in-match summoning IS elite generation:

| Class | Lore | Raised by | Cost (⚙) | Strength | Where summoned |
|---|---|---|---|---|---|
| **LINE (normal)** | populace mons in **WORKER** role, drafted | **CT** (population draft) | ~0.02 CT / soldier (50 = 1 CT) | baseline | overworld draft → wave soldiers |
| **ELITE** | **hired/recruited biome combatants** (footman, archer…) | **GOLD** (biome mercenary pay) | ~50 gold / elite | 2–3× a line soldier | **in-battle, from the COMMAND CENTER** |

- **The equivalence you asked for:** footmen/archers **summoned in the command center during a MOBA match
  = ELITE soldiers.** They're "hired from the local biome." So in-match unit production feeds your elite
  pool — the two layers are the same soldiers. **Workers → line; hired combatants → elite.**
- **Two-tier economy falls out clean:** **CT → line (mass workers)**, **gold → elite (quality biome
  hires)**. Gold comes from mining (§1), so the resource economy *is* the elite-unit economy.
- **Command center** = the in-battle structure that summons elites (spends gold). It's a **land tier
  structure** (§6) — capturing one intact lets you summon there.

### 5a. Class ownership — NFT (pick) vs random (draft)
- **Default = RANDOM draft:** you summon/draft units and the **class is system-assigned from the local
  BIOME pool** (§2). Forest gives forest species, desert gives desert species. F2P-friendly.
- **Own the pet NFT → PICK that class:** owning a species' pet NFT lets you summon **that specific class
  deliberately** (composition control), anywhere its biome allows. So NFTs buy **army-composition control**,
  not raw power — F2P still fields full armies, just with less say over the mix.
- **2 distinct classes per Master (decision-9 cap):** a Master fields **NORMAL + ELITE**, and only **2
  distinct elite classes** at once — so if you own few elite mons, your mix is limited. Scale via **more
  Masters**, variety via **more pet NFTs**.

### 5b. Post-battle unit fate — your choice for surviving elites (all three of your options)
Hiring elites cost **gold**; what you do with survivors decides whether that gold was worth it:

| Choice | Effect | Gold recovered? |
|---|---|---|
| **① Release to the wild** | mons return to the biome; roster freed | **No** — the hire gold is sunk (a sink) |
| **② Put to work (farm/guard)** | combat mon → **worker role**: farms resources / guards land | Retained as *productivity* (dual-role lore) |
| **③ Retain in the Master's pool** | kept as ready elites, **retain their class** | Retained, but **bounded by the 2-class-per-Master cap** — overflow must release or work |

- Standing elites cost **upkeep** (food + a little gold/day) — so you can't hoard a huge elite army free;
  release or put-to-work the overflow. This is a steady sink + a real roster-management decision.
- Line soldiers (workers) that survive similarly return to population or the labor pool.

## 6. Structure persistence & pillage — what survives a battle on the CF land

| Structure | Origin | Persists after battle? | Value if taken |
|---|---|---|---|
| **Owner tier-defenses** (walls/towers/keep) | landowner CT (INVEST_TIERS §4) | **Yes** — part of the land; damaged→repairable, destroyed→rubble | inherited intact if you **occupy without pillaging** |
| **Command center** | land military development | **Yes** (land structure) | capture intact → **you can summon elites there** |
| **In-battle built** (walls/towers from harvested wood) | attacker/occupier during the match | **per-match** by default; if you **occupy**, they become destructible **occupier** structures (decision 10) | pillage for materials |

**On winning a land, the victor chooses (decision 10 + resource model):**
- **PILLAGE** — strip structures for **materials (~30% of their build value)**; destroys them (owner loses
  the development). The raid economy: take-and-leave.
- **OCCUPY (don't pillage)** — **surviving structures stay and become yours to use** (towers defend you,
  command center summons for you). You inherit the land's development — worth far more than pillaging if
  you can hold it. A tier-5 estate taken intact is a prize; pillaged, it's a one-time material haul.
- **ABANDON + PILLAGE** — strip and leave (materials, no hold).
- **Don't pillage, don't hold** — the land's permanent structures **survive** (damaged); you keep only the
  battle's resource spoils; the owner keeps the land (you raided, didn't take).

**Structure worth (⚙):** tower ≈ 400 timber build → **~120 timber-materials** pillaged; command center ≈
big → **~300 materials**; a full tier-5 estate pillage = a large haul (but destroys the owner's investment
— which is *their* CT sink, so pillage doesn't mint, it redistributes materials). Repair/rebuild burns CT
(decision 17 floor applies).

## 7. What goes back to the map team (the generation contract)

1. **Tile count + richness + mob camps + towers + barriers per tier** — §1 table (from `INVEST_TIERS`).
2. **Gold vs wood split by biome** (+ owner ±20% bias) — §2 table.
3. **Yield per tile** (gold 50 / wood 60 / iron 40 at 100%) + **wood regrow ~3 days, gold finite** — §1.
4. **Components per land size** (single 1 → EPIC ~480; castle = final component, estates only) — §3.
5. **Command-center + tier-defense structures** placed per the land's development (persist across battles);
   in-battle structures are per-match/occupier — §6.
6. **Local unit species per biome** (the elite pool the command center hires from) — §2/§5.
7. All **deterministic** (seed = parcelId+tier+biome) and **generator-clamped** to the tier budget.

## TL;DR

Land tier (bought with **CT**, exponential, estates ~8×) sets **how many resource tiles** (2→8), **richness**
(40→100%), **mob camps** (1→6) and **defenses** a battle map spawns; **biome** sets **gold-vs-wood** and the
**local unit species**; **land size** sets **how many ±161 components** (single 1 → EPIC ~480, castle =
final component). Yields: gold tile ~50 (finite, enrich-seeded), wood ~60 (regrows ~3 days). **Units:
line = drafted workers (CT), elite = command-center-hired biome mons (gold)** — the MOBA's in-match summons
ARE your elite soldiers; own the pet NFT to pick the class, else random-from-biome; 2 classes/Master.
Post-battle elites: **release (lose hire gold) / work (farm-guard) / retain (capped)**. Structures: **owner
tier-defenses + command centers persist**; a victor **pillages for ~30% materials or occupies to inherit
them intact**. All numbers ⚙; all deterministic; all obey the net-sink + per-user cap (decision 17).
