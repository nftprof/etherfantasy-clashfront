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

## 5. The unit model — a THREE-tier progression: worker → armed line soldier → elite

**Correction (owner 2026-07-06):** it is a **three-tier** progression, not a two-class binary. Pet mons are
the population; a mon moves **up the tiers** by being **armed** then **trained/evolved**. The tiers are the
three friendly unit types you field in any battle:

| # | Type | What it is | Raised by | Cost / speed (⚙) | Strength | Continuity |
|---|---|---|---|---|---|---|
| 1 | **WORKER** | base mon, **unarmed** | **CT** population recruit | **cheap + fast** | baseline | **high** — rear role, mostly survives → **accumulates** |
| 2 | **LINE SOLDIER** | a worker **that has been ARMED** | worker **+ crafted arms** (resource) | fast; the **arms** cost resource/craft | ~**same as a worker**, but combat-ready | low — front line, **mostly dies** |
| 3 | **ELITE** | a line soldier **trained/evolved** in-battle | **GOLD** (train/recruit on the map) | **expensive + slow** | **2–3×** a line soldier | high — **persists + levels** |

**The tier progression (the tech-tree):**
```
  WORKER  ──(ARM: craft arms, spend resource)──►  LINE SOLDIER  ──(TRAIN/EVOLVE in-battle, spend GOLD)──►  ELITE
    ▲                                                   │
    └───────────────── disarm / return to labor ────────┘   (1 ⇄ 2 are the SAME mon, armored or not)
```

- **Worker ⇄ line soldier are interchangeable** — the **same mon**, just **unarmed vs armed**. Think *1 = no
  armor, 2 = armed.* You **choose ahead of time** which workers to arm for a fight (arming needs **crafted
  arms** — a resource/craft sink). They are **about equal strength**; the difference is combat-readiness and
  **role**, not power. So workers farm; armed workers fight.
- **The accumulation loop (why two names for near-equal units):** a battle **starts** with few workers on
  the field and **ends** with the **most workers** (they're the rear/labor role and don't always fight),
  while **line soldiers mostly die**. So after a battle you're **left holding workers** — which you then
  **ARM again as soldiers for the next fight**. Workers are your **persistent manpower reserve**; soldiers
  are the **consumable armed state** of that reserve.
- **Elites are grown from line soldiers, in the match.** They **evolve from tier 2** by **training/recruiting
  on the battle map** with **gold** (the command center / on-map recruit — "they're wild on this map; you
  have gold, so they come to work for you"). Elites carry **continuity** (they persist and level), so a
  trained elite is a real, lasting asset — expensive, slow, and worth keeping.
- **Command center** = the in-battle structure where gold buys elite training/recruiting. Land structure
  (§6); capture one intact and you can train there.

### 5a. Ownership — NFT is per CLASS (a training right), not per unit; pets do **not** KO
**Correction (owner 2026-07-06):** a **pet NFT is a species/CLASS, not an individual unit.** Master heroes
are the NFTs that **KO + revive** (7-day CD or pay 5 CT); **pets do NOT KO** — they are population.

- **Own the pet NFT → TRAIN that class directly.** Owning a species' pet NFT is a **training right**: you can
  **recruit/train that species deliberately**, anywhere (in a battle or outside), instead of hoping it
  spawns. It buys **access + composition control**, not per-unit power.
- **Don't own it → CATCH IT IN THE WILD.** That species **spawns on maps whose biome hosts it** (§2). You
  recruit the wild version by **fighting/training it on that map** (gold). **Richer / more expensive land has
  a chance to spawn STRONGER units** — so high-tier land is also a better hunting ground for good mons.
- **Pets are population, never lost.** A pet that loses a fight is **not KO'd/destroyed** — it returns to the
  wild or your reserve. Only **Master heroes** have the KO→revive lifecycle. (Decision 14 / the pets-never-
  lost rule.)
- **Composition cap:** a Master still fields a **bounded mix** of distinct elite species at once (⚙ decision-9
  cap) — own more pet NFTs for more variety, field more Masters for more scale.

### 5b. Post-battle unit fate — inventory it, or release it for its gold
What you keep after a battle decides whether the gold/arms were worth it:

| Choice | Effect | Recovered? |
|---|---|---|
| **① Inventory the trained unit** | keep the elite/soldier in your **roster** — persists (continuity), levels | Retained (costs **upkeep**) |
| **② Release for its gold** | **strip the gold it carries** and **boot it back to the wild** | **Gold recovered** (the unit is let go) |
| **③ Put to work (farm/guard)** | armed mon → **disarm to WORKER**: farms resources / guards land | Retained as *productivity* + your worker reserve |

- **Workers mostly come home**; **soldiers mostly don't**; **elites you choose to keep** cost **upkeep**
  (food + a little gold/day) so you can't hoard a huge standing elite army free.
- **Swift-win bonus (⚙):** win **quickly** (a decisive win, not stalling to grind the map) → a **chance a
  wild version of an elite** on that map **joins you** for free. Reward for winning clean; you usually
  collect **few** elites this way, but your **workers** reliably accumulate.
- **Outside-the-MOBA recruiting** (the overworld alternative to in-battle training), cost/speed trade:
  | Recruit outside | Speed | Cost | Note |
  |---|---|---|---|
  | **Worker** | **fast** | **cheap** | unarmed — must **ARM** (craft arms, resource) to field as a soldier |
  | **Soldier (pre-armed)** | fast | **expensive** | a worker **+ arms bundled** — costs much more (you skip the craft step) |
  | **Elite** | **slow** | cheaper than **in-game** training | lets you **pre-build elites** to bring to battle |

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
6. **Local unit species per biome** (the pool a battle map spawns; **richer land can spawn stronger
   units**) — §2/§5.
7. All **deterministic** (seed = parcelId+tier+biome) and **generator-clamped** to the tier budget.

## TL;DR

Land tier (bought with **CT**, exponential, estates ~8×) sets **how many resource tiles** (2→8), **richness**
(40→100%), **mob camps** (1→6) and **defenses** a battle map spawns; **biome** sets **gold-vs-wood** and the
**local unit species**; **land size** sets **how many ±161 components** (single 1 → EPIC ~480, castle =
final component). Yields: gold tile ~50 (finite, enrich-seeded), wood ~60 (regrows ~3 days). **Units = a
three-tier progression: WORKER (CT, cheap/fast, unarmed, accumulates) → ARM it → LINE SOLDIER (armed,
consumable) → train in-battle with GOLD → ELITE (persists/levels).** Worker⇄soldier are the same mon
(unarmed vs armed); pet **NFT = a training right for that CLASS** (else catch it wild on its biome map,
richer land = stronger spawns); **pets don't KO — only Master heroes do.** Post-battle: **inventory it /
release for its gold / put to work**; **swift win → chance a wild elite joins**. Structures: **owner
tier-defenses + command centers persist**; a victor **pillages for ~30% materials or occupies to inherit
them intact**. All numbers ⚙; all deterministic; all obey the net-sink + per-user cap (decision 17).
