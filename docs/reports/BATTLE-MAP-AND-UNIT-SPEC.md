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

## 5. The unit model — three roster types (worker / line / elite); the ARMY is two-tier (LINE / ELITE)

**Correction (owner 2026-07-06):** the **roster** has **three** types — but the **fielded army is still the
two-tier LINE / ELITE**. The third type, **WORKER**, is the **unarmed reserve state of a line soldier** (same
mon), so only **worker ⇄ line** interchange. **ELITE is always armed** — it never disarms to a worker.

| # | Roster type | Army role | What it is | Raised by | Cost / speed (⚙) | Strength | Continuity |
|---|---|---|---|---|---|---|---|
| 1 | **WORKER** | — (labor) | base mon, **unarmed** | **CT** population recruit | **cheap + fast** | baseline | **high** — rear role, mostly survives → **accumulates** |
| 2 | **LINE SOLDIER** | **LINE** | a worker **that has been ARMED** | worker **+ crafted arms** (resource) | fast; the **arms** cost resource/craft | ~**same as a worker**, but combat-ready | low — front line, **mostly dies** |
| 3 | **ELITE** | **ELITE** | a line soldier **trained/evolved** in-battle; **always armed** | **GOLD** (train/recruit on the map) | **expensive + slow** | **2–3×** a line soldier | high — **persists + levels** |

**The tier progression (the tech-tree):**
```
  WORKER  ──(ARM: craft arms, spend resource)──►  LINE SOLDIER  ──(TRAIN/EVOLVE in-battle, spend GOLD)──►  ELITE
    ▲                                                   │                                                (always armed —
    └───────────────── disarm / return to labor ────────┘   (1 ⇄ 2 = SAME mon, armored or not)          never disarms)
```

- **Worker ⇄ line soldier are the same mon** — just **unarmed vs armed** (*1 = no armor, 2 = armed*). Only
  **these two** interchange; you **choose ahead of time** which workers to arm (arming needs **crafted arms**
  — a resource/craft sink). They are **about equal strength**; the difference is combat-readiness and
  **role**, not power. So workers farm; armed workers fight; **elites (tier 3) are always armed and stay
  military.**
- **Why worker is its own tier (the math you flagged):** if "line soldier" were the only reserve, you'd end
  a battle with **almost none left** (the front line dies). The **surplus you carry out is WORKERS** (rear
  role, they survive) — so the persistent, accumulating manpower **has** to be a distinct un-armed tier that
  you **re-arm into line** next fight. That's the whole reason for three roster types behind a two-tier army.
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

| Choice | Applies to | Effect | Recovered? |
|---|---|---|---|
| **① Inventory it** | line + elite | keep the unit in your **roster** — elites persist/level; line stays armed | Retained (elites cost **upkeep**) |
| **② Release for its gold** | line + elite | **strip the gold it carries** and **boot it back to the wild** | **Gold recovered** (unit let go) |
| **③ Disarm to worker (farm/guard)** | **line only** (elites are always armed) | surviving **line soldier → WORKER**: farms resources / guards land | Retained as *productivity* + your worker reserve |

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

### 5c. Army composition & caps (owner-decided 2026-07-06)

- **Elite : line ratio — max 1 : 3, enforced at DEPLOYMENT (not on the roster).** Units **come out** during
  the match at **most 1 elite per 3 line** — matching the current MOBA wave (1 : 3). You may **hold any
  ratio in your roster** (even elite-heavy), and you may field **0 elite** (all-line is fine); the cap only
  governs **what spawns onto the field**. If your **line runs out**, deployment **cuts off there** — surplus
  elites beyond what your remaining line can support at 1 : 3 simply **can't deploy**. So line is the
  throughput that lets elites reach the field; you **can't field an all-elite doomstack** because the field
  itself throttles it. This, not a distinct-species cap, is the elite governor.
- **No distinct-elite-per-Master cap — synergy instead.** *(Supersedes the old "2 distinct elite classes
  per Master" line.)* You may train **any** elites and pair them freely, but **Master ↔ unit alignment gives
  synergy**: when a Master sits on land whose **biome/element matches its unit types**, the army fights
  **better in battle AND the land farms faster** (⚙ `alignmentFarmBonus`, `alignmentCombatBonus`). Mismatched
  pairings still work, just without the bonus — so composition is a **soft optimization**, not a hard lock.
- **Master/hero hard cap = 55.** Only **55 commander NFTs** exist (the 47 Masters + heroes). Masters are the
  scarce command layer; scale battles by **more land/pets**, not more commanders.
- **Any land farms with ≥ 100 pets; masterless land still defends.** A parcel is a working farm/garrison as
  long as it holds a **minimum ⚙ `minGarrison` = 100 pets** — **no Master required** (a Master adds command +
  synergy, not the ability to hold land). So **every battle fields ≥ ~100 per side** (attacker army vs. the
  defender's ≥100 garrison, or ≥100 wild on unowned land) — a solid MOBA-scale fight floor. **Recommended
  floors (⚙):** `minGarrison` **100**, wild-land defenders **100–150**, boss camps higher.

### 5d. Arms & salvage — the recurring materials sink (decided 2026-07-06)

- **Arms are consumed when a line soldier dies** (arms = crafted from **iron/timber**, `ECONOMY-RESOURCE-MAP`).
  So even though the **worker** survives free, **re-arming it each fight re-burns materials** — this is the
  loop's recurring sink and what keeps accumulated workers from becoming a free infinite army.
- **The winner salvages 30% of the arms of ALL the fallen — both sides.** Win the field and you scavenge
  **~30%** of every dead unit's arms (your own dead **and** the enemy's). Losing side salvages nothing. So a
  decisive win is also a **materials windfall** (you loot the battlefield), and losing an army means losing
  its arms — a real materials swing that rewards winning and punishes attrition.

### 5e. The swift-win skill reward — auto-balanced vs. your own average (decided 2026-07-06)

The wild-elite-join bonus (§5b) is **skill-gated and self-normalizing** so it can't be farmed:

- **Performance is scored vs. YOUR OWN rolling average** (last ⚙ `perfWindow` ≈ 20 battles) — not vs. other
  players. You must **beat your own median** to earn anything; **below median → nothing.**
- **Metric = a MIX (recommended weights ⚙):** **speed** (time-to-win, faster better) **0.4** · **kill/damage
  share 0.35** · **survivor rate** (own casualties avoided) **0.25**. Blending all three stops one-note
  farming (you can't just turtle for kills or rush and bleed out).
- **Reward scales with deviation above your median:** **+1σ → 1–5 units**, **+2σ → 6–15**, **+3σ+ → up to
  the biome cap** (still capped at **1–2 elites/battle**; the rest are workers/line). New players improve
  fast (easy to beat a low early average → early rewards); veterans must **keep beating themselves** (the
  bar rises with them). Pure auto-balance, no fixed threshold to game.

### 5f. Rare resources — boss-gated, mined on the overworld (decided 2026-07-06)

Rare mats (gems = **Carat/CT-tier**, rare ice cores, arcane reagents — the Arcane/deep-mine tier) are **not**
on ordinary tiles. They are **unlocked by beating a BOSS**:

- **High-tier / wild land spawns a BOSS** (the 10-boss roster). Clearing it (a hard MOBA battle) has a
  **chance to reveal a rare-resource node / deep-mine location** on that land.
- **The fight is in the MOBA; the mining is on the overworld** — consistent with §1 (no in-battle farming):
  the boss battle is the **gate**, the revealed node then **yields rare mats over a limited window** on the
  CF map (finite, enrich/re-clear to refresh — decision-17-safe, doesn't mint CT).
- So bosses are the **rare-resource faucet control**: rare mats flow only to those who **beat the boss**,
  tying the top of the resource ladder to the hardest fights. (Placement/where exactly = a ⚙ dial: wild
  estates, tier-4+ land, or special boss camps.)
- **Bosses are tuned HARDER than the attacking player — they are a NET SINK** (owner 2026-07-06). A boss
  fight should **likely cost the player more resources than the rare mats are worth** in raw CT terms.
  This is the **slot-machine / house-edge doctrine (decision 17) made literal:** the rare node is *your own
  spend coming back*, not profit — like every in-game reward here (skill bonus §5e, pillage, land yield),
  it is a player **earning back their own CT**, bounded by the per-user cap. **In-game play is
  net-negative-to-neutral by construction.**
- **The ONLY net-positive channels are house-granted (decision 17):** the **leaderboard payouts** and
  **discretionary special grants** (e.g. a very strong **weapon-NFT** dropped to a specific vetted user) —
  paid from the developer **vault** (rake + revenue), unpublished and at our discretion. Nothing in the
  core loop pays out more CT than went in; the upside is a **granted prize**, never an emergent faucet.

### 5g. Wild / NPC strength scaling — two zone families (owner-decided 2026-07-06)

Wild forces must never be **trivially weak** vs. players. Strength is set by the **zone**, and zones come in
**two families** with different scaling laws (map team to deliver the full zone brief):

- **UW — Underworld (RANGE-based, chaotic).** Wild strength = **30%–200% of the zone's average player
  strength**, rolled per encounter, **weighted by zone**. Weak UW zones skew low, dangerous ones skew high —
  wild is always a **meaningful** fight and high UW zones can field wild **stronger than the locals**.
  - **`UW3` = Underworld 3** — a hard/late continent at the **upper end of the range** + **ORE-default
    resource** (the industry/arms feedstock).
- **HS — High Society (FIXED-multiplier, strict & orderly).** "Heavenly-guarded" continents — instead of a
  range, wild is **strictly scaled to YOUR strength** by a fixed floor:
  | Zone | Wild strength |
  |---|---|
  | **HS1** | **1×** (exactly your strength) |
  | **HS2** | **2×** |
  | **HS3** (highest floating island) | **3×** (exception-tier — do not mess around) |
  So HS is **guaranteed at least an even fight**, climbing to **3× overmatch** at the top island. *(HS is
  planned for a later phase; recorded now so the zone table carries both families.)*
- **NPC warlords (later phase):** beyond wild mobs, we can add full **AI players that command whole fleets of
  Masters** — an AI faction that marches, holds land, and fights like a human empire. Deferred, but the
  wild-strength model is the seed (wild = leaderless mobs today → NPC-commanded armies later).

### 5h. Food as the battle clock — provisions → morale → effectiveness (owner-decided 2026-07-06)

Units **carry their food** (no in-battle farming, §1); food is the **battle clock**, expressed through the
existing **morale** stat, not a hard cutoff:

- **On attack, the UI states the provision estimate up front:** *"Provisions will last ≈ X minutes"*
  (**minimum 5 min** guaranteed at full effectiveness). Clear before you commit — no surprise starvation.
- **Out of food, the army still fights — but only ≈ 3 more minutes, degrading.** Running out doesn't end
  the battle; it **collapses morale**: hungrier → lower morale → **down to a 10% floor** (as low as **10%
  combat effectiveness**). So a starved army can still swing, but at a fraction of its strength.
- **Food drives morale drives the power formula.** Morale is already a factor in the productivity/combat
  formula (`PET-APTITUDE-ECONOMY-MAP` §2); **low food = low morale = low effectiveness** — one existing
  lever, now fed by provisions. This **mechanically enforces the swift-win incentive** (§5e): you literally
  can't stall forever, and **bigger armies need more food to march**, which naturally caps doomstacks.
- Food comes from the land's granary (**§ food economy below / FARMING §3b**); army size × march distance
  sets the provision load, so **food scarcity is the real throttle on how much force you can project.**

### 5i. Retreat/forfeit & the draw clock — two battle-end mechanisms (owner-decided 2026-07-06)

Two ways a battle ends besides a clean win/loss:

**Retreat (forfeit) — costly, so provision properly.** You may **flee/forfeit** at any time, but routing an
army is dangerous:
- **Arms loss:** you drop/scatter **5%–30% of your arms** as you run.
- **Units captured:** the enemy takes **10%–80% of your units**, **scaled by how badly you were losing** —
  if you were about to lose anyway, you lose *more* (fleeing a lost fight is worse than a clean withdrawal
  from a even one).
- **Captured → enemy soldiers:** **~30% of the units you lose convert to the ENEMY's** side (they recruit
  your routed troops); the rest disperse. So fleeing **arms your opponent** — a real swing.
- **Design intent:** retreat is a **big risk**, which is the point of **bringing enough food** (§5h) — don't
  march into a fight you can't provision and then flee. **⚙ balance note:** tune the % bands over time so
  retreat **doesn't become a dominant determinant of who wins** — it's a cost, not a coin-flip.

**Draw clock — no infinite stalemates.** A **max battle time** (⚙ `battleMaxTicks`, ≈ a live-battle
duration) plus a **stall check**: if **no unit on either side has been killed for ⚙ `stallWindow`**, the
battle is called a **DRAW**. Covers the stuck cases — **both lines run out**, the **map deadlocks**, or
**heroes avoid each other**. **Draw outcome:** **no territory changes hands**, the attacker withdraws, and
**food/arms already spent are lost** (a stalemate still costs both sides what they burned — no free stalls).

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
