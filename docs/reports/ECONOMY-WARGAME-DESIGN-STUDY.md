# Clash Front — Economy & War-Game Design Study (regression + genre study + cross-layer resource model)

> Commissioned 2026-07-06: (1) regression on what we've built for UI/UX coherence, (2) study the
> economy/war-game genre and return the 10 best elements to make Clash Front "not ordinary" and as
> real as possible to real economics + war, (3) design the **cross-layer resource economy** — what to
> farm, how the overworld connects to the MOBA battle layer (which has trees to cut + gold to mine),
> and how the original-spec **mining / deep-mine** fits across layers. Grounded in existing canon:
> `docs/02` (economy), `docs/05` (PvE/materials), `VISION-BIBLE-v0.2` (Geology→…→Marketplace chain).

---

## 1. Regression — is what we built coherent?

**What's shipped and cohesive (the CONTROL layer is genuinely strong):**
- Overworld: fixed parcel map, ownership, terrain visuals, claim/develop/abandon, march with a live
  **battle-start ETA** countdown, supply/desertion/morale scaffolding in `balance.json`.
- Battle: **COMMAND-vs-AUTO keystone** (scarce live 30 Hz vs default accelerated), pre-committed
  command queue (fee ladder canon-locked), **hero-mode ⚡ doorway** (ticket → `/play`), **command
  view** rendering the real ±161 Battlefield JSON, **recent-battles review**, **launch-live** button.
- Identity/economy plumbing: PG login, Masters roster gate, CT deposit/enrich/top-up, land-owners feed,
  net-sink doctrine + enrichment perks.

**Verdict:** the **battle/command/hero control surface is deep and internally consistent.** The
**economy is thin relative to its own ambition.** Today the player really manipulates only two things —
**CT** (money/sink) and **soldiers** (drafted with CT, destroyed in battle) — with food/gold/wood
present but purely as battle logistics (food = battle clock, gold+wood = command-center tier). The
VISION-BIBLE promises a full production civilization; the sim delivers a war-with-a-wallet. That gap is
the single biggest lever on "make it not ordinary."

**Concrete UX/coherence gaps (all trace to the same root — no production economy):**
1. **Land value is flat.** Every parcel is economically ~interchangeable (CT treasury + prosperity);
   there's no reason to *covet a specific parcel* beyond position. Real war is fought over *resources*.
2. **The battle map and the overworld don't share an economy.** A battle is a real battle, but nothing
   about *which land* you fight over changes *what the battle contains*. The MOBA's local gold/wood
   harvest exists in the engine but isn't seeded by, or fed back to, the parcel.
3. **Development tracks are abstract.** AGRI/ECON/DEFENSE/MILITARY raise numbers; players don't *see* a
   production chain or a supply of goods. Numbers going up ≠ a living economy.
4. **CT does everything**, so every decision collapses to "spend CT." Real economies have *multiple
   non-fungible inputs* (you can't eat gold; you can't forge swords from grain) that create genuine
   trade-offs and logistics.
5. **The living population (PentaPets) — the VISION-BIBLE's connective tissue — isn't in the sim.**
   Workers/soldiers/consumers with needs are what tie economy to war in every great title.

The rest of this study is the fix: a resource model that makes land heterogeneous, wires the two
layers into one loop, and pulls the dormant canon (geology, mining, materials, blueprints) into play.

---

## 2. Genre study — what the best economy + war games actually nail

| Game | The one thing it nails (that we should steal) |
|---|---|
| **EVE Online** | Player-*produced* economy + **full-loss** PvP: everything is mined/built by players and can be destroyed, so war is the economy's demand engine. Regional markets, real price discovery. |
| **Victoria 3** | **Goods markets with emergent supply/demand prices**; population "pops" with tiered *needs* and a standard of living that drives loyalty/unrest. |
| **Anno 1800** | **Production chains** + population tiers whose escalating needs pull the whole chain. Logistics as content. |
| **Civilization** | **Geography-driven specialization** — strategic/luxury/bonus resources on tiles make land unequal and conquest-worthy; eras/tech gate power. |
| **Total War** | **Two-layer model = ours**: strategic campaign map + tactical battles where army composition + terrain decide the fight; attrition + supply. |
| **Hearts of Iron / Foundation** | **Supply lines & logistics** as a hard war constraint; overextension is punished. (We already have `supply` — unused as a real constraint.) |
| **Crusader Kings** | **Character-driven** persistence — dynasties, legitimacy, lifecycles. We have **Masters** (RoTK generals, KO/revive, fame) already. |
| **Albion Online** | **Localized, full-loot production** — where a thing is made/lost matters; risk sets price. |
| **Dwarf Fortress** | **Depth = danger**: geology layers, deep mining awakens horrors; risk scales with reward. |
| **Frostpunk / Anno (ecology)** | **Sustainability pressure** — overexploitation, depletion, pollution force long-term stewardship vs short-term extraction. |
| **Factorio** | **Throughput/logistics as the core loop** — production *rate* and transport, not just stockpiles. |

The pattern across all of them: **land is unequal, production has depth, destruction creates demand,
population is the engine, and geography drives conflict.** Clash Front has the war half; it's missing
the economy half — which is precisely the canon that's written but unbuilt.

---

## 3. The 10 best elements to incorporate (ranked; each grounded in our canon + a proof game)

1. **Geography-driven resource endowment (parcel geology).** Every parcel carries a geological/biome
   endowment — arable, timber, ore, precious, rare, and *deep* deposits. Land becomes heterogeneous:
   some parcels are breadbaskets, some iron ranges, some gold veins. *This is the master key* — it
   makes land worth coveting and is the bridge to the battle layer (§4). *Civ / EVE. Canon: VISION-BIBLE
   §73 Geology already specifies it.*

2. **Real production chains (raw → refined → goods → military), not point-buy.** Timber→lumber→siege
   engines; ore→iron→weapons→stronger soldiers; grain→food→population→draft capacity; deep materials→
   blueprints→elite units. Depth turns "spend CT" into meaningful sequencing. *Anno / Victoria / Factorio.
   Canon: VISION-BIBLE §101 chain, docs/05 materials.*

3. **Population as the engine (workers/soldiers/consumers with needs).** PentaPets are the living pop:
   they *work* resources, are *drafted* into soldiers (full CT cost — no free army), and *consume*
   (food + goods → standard of living → loyalty/morale/unrest). Population is the connective tissue
   between economy and war — starve it or over-tax it and the war effort collapses. *Victoria / Anno.
   Canon: VISION-BIBLE PentaPets, docs/05 §9.*

4. **Destruction as the demand engine + real stakes (fits the net-sink doctrine perfectly).** Because
   every battle is real and soldiers/materials are *destroyed*, war permanently consumes the economy →
   perpetual demand for production → the sink is *sustainable and emergent*, not a faucet. Full-stakes
   loss (you can lose what you built) is what gives an economy gravity. *EVE / Albion. Canon: net-sink
   doctrine, docs/02 §13.*

5. **Supply lines & logistics as a binding war constraint.** Armies project power only within supply
   range from friendly production; cut or overextended supply → attrition + desertion. Makes adjacency,
   roads, and forward bases matter; punishes blitz-everything. *HoI / Total War. Canon: `supply` in
   balance.json — already modeled, not yet load-bearing.*

6. **Emergent markets & price discovery (per-region supply/demand).** Resources and CT trade at prices
   that move with scarcity; landlords/merchants arbitrage between a timber region and an iron one.
   Turns fixed costs into a living market and gives the on-chain CT real price context. *Victoria / EVE.*

7. **The battle-map local economy, seeded by the parcel and feeding back (THE cross-layer link).** The
   Battlefield JSON's `resources[]` (gold mines, forests) are *derived from the parcel's endowment*;
   harvesting them mid-match funds defenses/reinforcements; the victor extracts a share to the overworld
   stockpile. This is exactly the MOBA's trees-and-gold loop — but now *meaningful*, because it mirrors
   the land you're fighting over. *Total War terrain + MOBA economy. See §4.*

8. **Deep mining & exploration with escalating risk/reward.** Surface → shafts → deep veins →
   "underdark." Deeper = rarer materials (gems, alloys, **pet DNA fragments**, blueprint components) but
   awakens monsters/bosses (PvE) and, in battle, adds subterranean map features (caverns, monster camps).
   Ties the economy to the creature/boss layer and to NFT crafting. *Dwarf Fortress / EVE wormholes.
   Canon: VISION-BIBLE §75 deep mining, docs/05 PvE nodes/bosses, Ep03 "mines & hills" monsters.*

9. **Sustainability / collapse pressure (ecology + overexploitation).** Per canon "resources never
   fully deplete — extraction gets progressively harder"; over-harvest scars the land (deforestation,
   mine exhaustion, war pollution) and drops prosperity unless stewarded (replanting, fallow, **pets
   gathering + guarding + tending**). Forces long-term stewardship — real environmental economics, and
   the *reason* the pet steward role exists. *Frostpunk / Anno. Canon: VISION-BIBLE §73, pets §9.*

10. **History, legacy & living civilization (dynasties, wonders, eras, ruins).** The persistent world
    remembers: Masters are dynastic characters (fame/lineage, KO/revive); **wonders/great works** on
    estates confer regional bonuses; fallen empires leave **ruins/relics** to plunder; the world
    advances through **ages** (bronze→iron→…) that gate tech. Turns a war arena into a civilization with
    memory. *Civ / CK / EVE history. Canon: Masters, estates, blueprint NFTs.*

Ordering rationale: **1→2→3 are the foundation** (heterogeneous land, chains, population). **4→5→6** make
it a *real economy* (sinks, logistics, markets). **7→8→9** are the *cross-layer + depth + longevity*
systems. **10** is the civilization skin that makes it memorable. Build roughly in that order.

---

## 4. The cross-layer resource economy — the core answer

### The connection principle: **geology is the bridge**

There are two layers, and they must share **one economy** through the **parcel's resource endowment**:

```
   OVERWORLD (strategic, persistent)                 BATTLE (tactical, per-match, REAL)
   ┌──────────────────────────────────┐  seeds  ┌────────────────────────────────────┐
   │ parcel GEOLOGY/ENDOWMENT          │ ───────▶│ Battlefield JSON resources[]:       │
   │  arable · timber · ore · gold ·   │         │  gold mines, forests, quarries      │
   │  gems · DEEP deposits             │         │  ← the MOBA "trees to cut, gold to  │
   │                                   │         │     mine" — now MEANINGFUL          │
   │ stockpiles ← pets gather + mines  │         │ harvest mid-match → fund defenses,  │
   │ CT = money/sink (liquid)          │         │   reinforcements, field upgrades    │
   │ control of endowment ◀────────────┼─────────┤ battle OUTCOME: victor controls the │
   └──────────────────────────────────┘ feeds   └─ parcel + plunders a share to stock ┘
                                         back
```

**The loop:** parcel endowment **seeds** the battle map's harvest nodes → the battle's local economy is
literally the land you're fighting over → **who wins controls that geology** → and plunder extracts a
slice into the overworld stockpile. So "every battle is a real battle" gains an economic *why*: you
fight over *this* parcel because it's the gold vein / the timber the siege train needs / the deep gem
seam. **Nothing is abstract — the resource on the map is the resource in the war.**

### What to farm — the resource taxonomy (5 strategic tiers + materials)

Keep **CT** as the singular *money/sink* (liquid, on-chain, the P2W faucet cap + burn). Layer *physical,
non-fungible* resources under it as **production inputs** (you can't pay soldiers in gems or forge swords
from grain — that non-fungibility is what creates real trade-offs):

| Tier | Resource | Overworld use | Battle-layer expression | Source |
|---|---|---|---|---|
| 0 | **Food** (grain/livestock) | population growth + **army upkeep** (already the battle clock) | attacker carries it = battle endurance clock (exists today) | arable parcels; AGRI track |
| 1 | **Timber** (wood) | construction, siege engines, **defense modules** | **forests to cut** → build walls/towers/traps in-match | forested biomes; pets gather |
| 2 | **Ore → Iron** (refined) | weapons/armor → **soldier quality** (not just count) | forges/anvils on-map → field-upgrade units | hills/mountain parcels |
| 3 | **Precious (gold/silver)** | mints toward CT liquidity, mercenary pay, luxury goods | **gold mines to capture** → summon reinforcements / hire in-match | gold-vein parcels |
| 4 | **Rare (gems/crystals/essence)** | high-tier crafting, wonders, **pet DNA / blueprints** | rare nodes (guarded) → elite unit unlocks | deep mining; PvE dungeons |
| — | **Materials** (hide/ore/essence) | **crafting inputs & repair discounts — a *sink enabler*, not currency** (docs/05 already says this) | dropped by mobs/bosses on WILD maps | monster nodes, plunder |

Design rule: **CT is horizontal (money), resources are vertical (a production ladder).** You climb the
ladder with geography + labor + time; CT lubricates it but can't skip it. That's what makes the economy
feel *real* instead of "buy power with the wallet."

### The MOBA local economy = the tactical layer of the same resources

The MOBA's built-in "cut trees / mine gold" loop becomes the **battle-scoped tactical economy**, but its
*endowment* comes from the overworld parcel and its *spoils* return there:
- **Seeded:** a timber-rich parcel → a forested Battlefield JSON with many `WOOD_GROVE` nodes; a
  gold-vein parcel → multiple `GOLD_MINE` nodes; an iron parcel → ore outcrops + a forge build-spot.
  (The map-maker already emits `resources[]`/`buildSpots[]` — now *derive their type/density from the
  parcel endowment*, per `COMMAND-MAP-SPEC.md` + `BATTLEFIELD-SCHEMA.md`.)
- **Spent in-match:** harvested wood → raise walls/towers/traps (the CoC defense modules); gold →
  summon a reinforcement wave or field-upgrade a squad; food (carried) → the endurance clock.
- **Fed back:** victory grants control of the parcel's endowment; **plunder/scavenge** extracts a bounded
  share of the harvested + stored resources into the winner's overworld stockpile (and ⚙ a slice diverts
  to the battlefield's enrichment pool — battle-kill enrichment, already canon).

This is the answer to "if every battle is real, what's the connection for extra resources mined on the
map": **the map's mines/forests are the parcel's geology made tactical; harvesting them wins the battle;
winning the battle wins the geology.** One resource, three states — stockpiled (overworld), harvestable
(battle), plundered (transfer).

### Mining & deep-mine across layers (the depth axis)

Per canon (VISION-BIBLE §73–76: "resources never fully deplete; extraction gets progressively harder;
supports surveys, prospecting and deep mining"), model **extraction as a depth ladder**, not a stock:

| Depth | Overworld action | Yield | Cost / risk | Battle-layer expression |
|---|---|---|---|---|
| **Surface** | pets gather, basic mine | food/timber/low ore | cheap; depletes → yield curve flattens | forests/outcrops on the battle map |
| **Shaft mine** | build a mine (CT + timber) | ore, gold | upkeep; needs supply | mine-shaft build-spots, tougher to hold |
| **Deep vein** | *survey → prospect → deep-mine* | rare gems/alloys, **DNA fragments**, blueprint mats | expensive; **awakens monsters/raises Taming threat** | subterranean map features: caverns, **monster camps**, boss anchors (ties to docs/05 PvE) |
| **Underdark** | expedition (Masters + army) | exotic/unique mats, relics | boss-guarded; can fail/lose the army | a PvE dungeon battle *on that parcel* |

So **deep mining is the economy's bridge into the PvE/creature layer**: digging deep is how you reach
rare materials *and* how you wake the bosses (docs/05 Taming Score, capstone den/boss spawns, Ep03
"mines & hills" monsters). It gives the wild-monster layer an economic *purpose* (guardians of depth) and
gives crafting/blueprints/pet-DNA their *source*. It also self-regulates: deeper = richer but more
dangerous and more supply-hungry, so nobody trivially floods the market with exotics (protects prices +
the net-sink).

### Keeping it honest (determinism + net-sink + integer money)

- All of this stays **deterministic** (seeded geology from parcel id; no `Date.now`/`Math.random` in
  sim) and **integer** (resource units like `ct_units`). Endowment is a pure function of the parcel —
  fixed forever, like parcel size (canon decision: map is fixed).
- **CT remains the only mint/sink token.** Physical resources are *produced and consumed*, never minted
  as money; they can be *sold for CT* on the market (price discovery), but war *destroys* them → demand
  → the sink stays net-negative. This *strengthens* the net-sink doctrine rather than fighting it.
- Sustainability (depletion harder-not-zero + war/mine scarring lowering prosperity) is the natural
  brake that keeps the economy from inflating and gives **pets** their steward role real teeth.

---

## 5. Recommended integration path (phased, non-breaking)

1. **Endowment (foundation).** Add a deterministic `endowment` to each parcel (arable/timber/ore/gold/
   gems/deep, seeded from parcel id + biome). Surface it on the parcel card. *No battle change yet* —
   just makes land heterogeneous and visible. Small, safe, high narrative payoff.
2. **Seed the battle map from endowment.** Derive Battlefield JSON `resources[]`/`buildSpots[]` type +
   density from the parcel endowment (map-maker + `game.ts` allocate context). Now the fight *looks like*
   the land. *Cross-layer link lands here.*
3. **Battle spoils → stockpile.** Extend the result callback settlement to credit a bounded share of
   harvested/stored resources to the victor (plunder), plus the enrichment-pool diversion. *Loop closes.*
4. **Production chains + population.** Wire timber→defense, ore→soldier quality, food→population→draft
   cap, with PentaPets as the labor/soldier/consumer pop. *This is the big one — the living economy.*
5. **Markets, supply-as-constraint, deep-mine/PvE, wonders/eras.** The depth + longevity systems, in
   that priority.

Phases 1–3 are the minimum to make "every battle is a real battle over *this specific land*" true — and
they're mostly additive to systems that already exist (endowment field, `resources[]`, settlement
callback). Phase 4 is where Clash Front stops being "a war game with a wallet" and becomes the economic-
civilization war-sim the VISION-BIBLE describes.

---

## TL;DR

We built a **deep control layer** (command/hero/auto battles) on a **thin economy** (CT + soldiers).
The genre's best (EVE, Victoria, Anno, Civ, Total War, Dwarf Fortress) all share five traits we're
missing: **unequal land, production depth, destruction-as-demand, population-as-engine, geography-driven
war.** The fix is one idea — **the parcel's geology is the bridge between layers**: it seeds the battle
map's mines/forests (the MOBA's own trees-and-gold loop, now meaningful), the battle is fought over that
geology, and winning + plundering feeds it back to the overworld stockpile. Deep mining extends this
downward into rare materials + the PvE/boss layer (blueprints, pet DNA). CT stays the money/sink;
physical resources become the production ladder war consumes. Build endowment → seed the map → close the
plunder loop → then population + chains. That turns "a real battle" into "a real battle *over something
real*."
