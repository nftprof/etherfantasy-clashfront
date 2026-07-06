# Clash Front — Resource Economy Map & Simulation (starting numbers, pre-finalization)

> Companion to `ECONOMY-WARGAME-DESIGN-STUDY.md`. Before we finalize *which layer seeds what* and *how
> resources are collected/spent*, this maps the **complete resource set, every source and sink, the
> conversion recipes, and STARTING NUMBERS**, then **simulates** a new player, a whale estate, and a
> battle to check the flows balance (net-sink holds). **All numbers are ⚙ starting values for tuning**,
> chosen to be internally consistent with the locked anchors below — not final.

## 0. Anchors (locked) & the time base

- **1 CT = 10,000 `ct_units` = $0.10.** Start balances: **5 CT** (most) / **50** (casual) / **500** (whale).
- **A batch of ~50 soldiers ≈ 1 CT** ⇒ **200 ct_units / soldier**. Most single actions ≈ 1 CT.
- **Command fee ladder:** 1 / 3 / 5 / 10 / 20 CT (max 5 queued).
- **Time:** 1 tick = 1 sim-minute; **1 "day" = 1440 ticks**. At `tickMs=5000`, 1 world-day ≈ **2 real
  hours**. All "/day" rates below are per 1440 ticks.
- **Integer money** (ct_units) and **deterministic** everywhere (seeded, no wall-clock in sim).

## 1. Resource catalog

| Resource | Unit | Tier | Renewable? | Ref. value (ct_units) | Primary role |
|---|---|---|---|---|---|
| **CT** | ct_units | — | inject-only | — (the numeraire) | money / the only base-layer currency |
| **Food** | food | 0 | ✅ farm | 20 (0.002 CT) | army upkeep + battle clock + population growth |
| **Timber** | wood | 1 | ✅ regrows | 40 (0.004 CT) | walls/towers/traps, armor frames |
| **Iron** | iron | 2 | ❌ mine | 100 (0.01 CT) | weapons/armor → **soldier quality** |
| **Gold** | gold | 3 | ❌ mine (enrich-seeded) | 500 (0.05 CT) | mercenary pay, luxuries; sells for CT |
| **Gems** | gem | 4 | ❌ deep-mine | 5,000 (0.5 CT) | blueprints, pet DNA, elite units |
| **Materials** | mat | — | ❌ drop | 100 (0.01 CT) | crafting inputs / repair (a sink enabler, not money) |
| **Goods** (sword, armor, siege, mount) | item | — | crafted | see recipes §4 | equip/upgrade soldiers; sold at estate markets |

Reference values set the market scale; live prices float ±with supply/demand (§6 study). CT is never a
"resource" — it's the money everything is priced in.

## 2. SOURCES — how each resource is collected / found (and which layer)

| Resource | Source | Layer | Starting yield (⚙) |
|---|---|---|---|
| **CT** | player **deposit** (other EF games + P2W cap) | meta | the ONLY injection; grows the economy |
| Food | pet farms arable parcel | overworld | **50 food / pet / day** (×AGRI dev level) |
| Timber | pet works forest parcel | overworld | **30 timber / pet / day**; forest **regrows +30/day** to a cap |
| Timber | cut forests **in battle** | battle | up to the map's grove stock (spend in-match; §5) |
| Iron | pet shaft-mines hills | overworld | **20 iron / pet / day**, depletes reserve (hardening curve) |
| Iron | forge/outcrop **in battle** | battle | field-refine to arm units mid-match |
| Gold | pet mines gold-vein | overworld | **10 gold / pet / day**, **depletes the enrich-seeded reserve** |
| Gold | capture gold-mine **in battle** | battle | up to the parcel's surface reserve (auto to winner, §5 study) |
| Gems | **deep-mine** (survey→prospect→dig) | overworld+PvE | **~1 gem / pet / day**, wakes monsters/boss (risk-gated) |
| Materials | mob/boss kills, **plunder** | battle/PvE | per docs/05 drop tables |
| Goods | **crafted** from raw + CT burn | commerce | see §4 (never "found" — always made) |

**Seed rule (the answer to "which layer seeds what"):** the **overworld parcel's fixed geology** seeds
the **battle map's node types/positions** (map-maker), and the **live reserve level** fills node yields
at battle time (server). Gold reserves are seeded by **enrichment** (CT sink), not geology alone.

## 3. SINKS — how each resource is spent

| Resource | Sinks (⚙ starting cost) |
|---|---|
| **CT** | raise soldiers (200/soldier) · enrich (seed reserve) · develop track · **command fee** (1–20 CT) · **craft burn floor** · buy goods at market · landlord tax (transfer) |
| Food | army **upkeep** (1 food/soldier/day) · battle **endurance clock** (400 food per 100 soldiers per battle) · population growth |
| Timber | wall (200 timber + 0.2 CT) · tower (400 + 0.4 CT) · trap (100 + 0.1 CT) · armor frame (2 timber/armor) |
| Iron | **sword** (3 iron) · **armor** (5 iron) · soldier-quality upgrade |
| Gold | mercenary pay · **sold for CT** at market (transfer) · luxury goods for prosperity |
| Gems | **blueprint** craft · **pet DNA** craft · elite-unit unlock |
| Materials | equipment craft · structure repair discount |
| Goods | **equip soldiers** (consumed on the unit) · sold/resold at markets |

## 4. Conversion recipes (every craft carries the CT **burn floor** — monetary constitution)

| Craft | Inputs | + CT burn (⚙) | Output / effect |
|---|---|---|---|
| Refine ore→iron | 2 ore | 0.005 CT | 1 iron |
| **Sword** | 3 iron + 1 timber | **0.02 CT** | +50% attack on 1 soldier |
| **Armor** | 5 iron + 2 timber | **0.03 CT** | +50% survivability on 1 soldier |
| Wall (defense module) | 200 timber | 0.2 CT | HP block on a build-spot |
| Siege engine | 20 timber + 10 iron | 0.5 CT | breaches walls faster |
| **Blueprint NFT** | 50 gem + 200 mat | 5 CT | reusable recipe (royalties) |
| **Pet DNA craft** | 20 gem + 100 mat | 3 CT | new/upgraded pet NFT |

Rule: resources **reduce** the CT an action needs but never remove the burn — so a richer economy burns
*more* CT, never less. Nothing is created without a burn.

## 5. The cross-layer flow map

```
 INJECTION            OVERWORLD (persist)             BATTLE (per-match, real)          COMMERCE
 ─────────            ───────────────────             ────────────────────────          ────────
 player deposit ─CT─▶ treasury ─raise(200/sol)─▶ ARMY ─collide─▶ BATTLE
                       │                                            │ harvest map nodes
                       │ enrich(100CT)                              │ (seeded by parcel
                       │  → 30% gold reserve (600 gold)             │  geology + reserve)
                       │  → 70% region/lords/BURN                   │   ├─ SPEND in-match: walls/reinf
                       ▼                                            │   └─ EXTRACT on WIN: surface
                 pet FARM/MINE ──raw──▶ pet CRAFT ─(+CT burn)─▶ GOODS │       reserve → stockpile
                 (50 food, 30 wood,      (iron→swords)            │   │        (minus tax+burn)
                  20 iron, 10 gold/day)         │                │   ▼
                       ▲                        └──────▶ estate MARKET ◀── buy gear/sell raw (CT transfer)
                       │ plunder share ◀──────── battle OUTCOME ─┘         price = f(supply,demand)
                       └───────── war destroys soldiers (BURN the CT that raised them) ──────────┘
```

## 6. Simulation A — a new player (5 CT start), 7 world-days

Assume: claims 1 small parcel (free founding), owns 4 starter pets, a forge, a small forest+hill parcel.

| Day | Action | CT (Δ, balance) | Resources produced/held | Notes |
|---|---|---|---|---|
| 0 | Start; claim founding parcel (free) | 5.00 | — | 4 pets assigned |
| 1 | 2 pets farm food, 1 forest, 1 iron | 5.00 | +100 food, +30 wood, +20 iron | passive, no micro |
| 2 | Refine 20 iron→10 iron; craft 3 swords (9 iron+3 wood+0.06 CT) | 4.94 | 3 swords, upkeep −4 food | gear for a raid |
| 3 | Raise 25 soldiers (0.5 CT); equip 3 swords | 4.44 | army of 25 (3 elite) | ~0.5 CT army |
| 4 | **MARCH & AUTO** onto a weak WILD parcel (gold surface 80) | 4.44 | — | auto-resolve (free; no command fee) |
| 4 | WIN → auto-collect surface reserve (80 gold, −20% tax) | 4.44 | **+64 gold** (worth ~3.2 CT) | lost 8 soldiers = 0.16 CT burned |
| 5 | Sell 40 gold at estate market (~0.05 CT each) | 6.44 | 24 gold kept | CT transfer from a buyer |
| 6 | Buy 5 armor at a whale estate market (0.25 CT) | 6.19 | +5 armor | gearing for a bigger fight |
| 7 | Farm continues (+100 food, +30 wood, +20 iron/day) | 6.19 | stockpile grows | net: **+1.19 CT & gear** in a week |

**Read:** a new player with 5 CT **grows** by farming → gearing → conquering *weak* land → selling
surplus → buying better gear. No hauling; all market clicks. Growth is real but **modest and
risk-gated** (a lost battle burns their army). The 64 gold they gained was **seeded by whoever enriched
that land earlier** (a net CT sink upstream) — the newbie recovers a slice, the *system* still net-burned.

## 7. Simulation B — a whale estate (500 CT), the production engine

| Lever | Numbers | Effect |
|---|---|---|
| 40 pets on facilities | 40 × (mixed) ≈ **800 iron + 1200 wood + 400 gold + 20 gem / day** | passive raw |
| Crafts | ~200 swords + 100 armor / day (burns ~5 CT/day) | fills market stock |
| Market | sells gear to 100s of small players (CT in) | whale income; **CT transfers, not mint** |
| Enrich own estate | 200 CT/week → gold reserve + prosperity | **big CT sink**; makes land richer *and a target* |
| Defense | multi-component castle (canon dec. 4) | **too costly for smalls to take** → stays a hub |

The whale is a **CT sink** (enrich + craft burns) and a **goods faucet** (gear for the masses), funded by
**selling to many players** (transfers) — never minting. Their estate anchors a regional economy: smalls
sell them raw, buy their gear. **Symbiosis, not just war.**

## 8. Simulation C — one battle's economic ledger (two 50-soldier armies)

| Line | ct_units | CT |
|---|---|---|
| Attacker army raised | −10,000 | −1.0 (already spent) |
| Defender army raised | −10,000 | −1.0 (already spent) |
| Command fee (if live-commanded, 1st) | −10,000 | −1.0 **burned** |
| Casualties: ~70 soldiers die | −14,000 | **−1.4 burned** (the CT that raised them) |
| Winner extracts surface gold (parcel had 100 gold, −20% tax) | +40,000 | +4.0 to stockpile (was enrich-seeded upstream) |
| Landlord tax on extraction (to land owner) | +10,000 | +1.0 transfer |
| Battle-kill enrichment (⚙ share to the pool) | −2,000 | −0.2 redistribution |
| **Net new CT minted** | **0** | **0 — never** |
| **Net CT burned this battle** | **~26,000** | **~2.6 CT burned** |

Every battle is **net-negative CT** (soldiers + fees + enrichment leakage burned); the "gains" are
resource *transfers* of previously-sunk value. **The sink is emergent and constant.**

## 9. Aggregate — does the net-sink hold? (daily, illustrative server slice)

Say 1,000 active players, ~2 battles each/day:

| Flow | Direction | ~CT/day |
|---|---|---|
| **Injection** — deposits (new + returning players) | **+ (in)** | +X (set by playerbase & faucet) |
| Soldier burn (2,000 battles × ~1.4 CT) | − (burn) | −2,800 |
| Command fees (say 10% battles commanded, avg 2 CT) | − (burn) | −400 |
| Enrichment leakage (players enriching land) | − (burn) | −Y |
| Craft burn floor (gear production) | − (burn) | −Z |
| Payouts | — | **0 minted** — all "gains" are transfers of sunk value |

**Result:** total CT can only **rise via deposits** and **falls via burns** — deposits are the sole
faucet, war+craft+enrich the sinks. As long as `deposits < burns` over a window, the token is
deflationary (net-sink doctrine, `docs/02` §13). Richer resource play ⇒ *more* craft/army/enrich burns ⇒
**deeper economy = deeper sink.** The pie grows only when real players bring real CT in.

## 10. What to finalize (the decisions these numbers tee up)

1. **Reference values** (§1) — set the whole scale; confirm gold≈0.05 CT, gem≈0.5 CT feel right.
2. **Yields** (§2) — per-pet/day rates; controls how fast the economy moves. Start conservative.
3. **Recipe burn floors** (§4) — the sink per craft; keep ≥ a floor so nothing is burn-free.
4. **Enrich→reserve conversion %** (30% proposed) + its leakage split — the anti-free-gold dial.
5. **Extraction tax + battle-kill-enrichment %** — how much of a fight's spoils flow to owner vs pool.
6. **Deposit cap per epoch** — the faucet ceiling (already ⚙ `depositCapCtPerEpoch`).

All are single ⚙ numbers in `balance.json`; none change the *structure* above. Tune to taste once the
CT re-scale (5/50/500 start, ~1 CT actions) lands.

## 11. Reconciliation with the REAL systems (owner, 2026-07-06)

Owner clarifications ground the abstract model in what actually exists:

### On-chain vs backend — only CT touches the chain
- **CT (Carat) = the sole on-chain token** and the real money. Settlement via a **vault contract +
  keeper-issued payouts**. Today CT payout is just a frontend tracking number; it moves to a **backend
  vault + keeper** (the daily-payout keeper).
- **All other resources — gold, iron, timber, food — are BACKEND tokens** (off-chain ledger). No gas, no
  chain; they trade/craft/deplete server-side. Value settles on-chain **only when it withdraws to CT**.
  So the resource economy stays fast + free and **CT is the settlement layer**.

### The CT faucet is the mobile game; Clash Front is the SINK (macro loop, concrete numbers)
- A player buys an **EF Genesis character (~$50 NFT)**. In the mobile game each char **farms 1–32 CT/
  session** (scales with level → caps at 32), **3 energy/day** (1 per session) ⇒ **3–96 CT/day/char**.
- **Death → 7-day cooldown OR pay 5 CT to revive** — a faucet-side sink.
- **That CT is the supply Clash Front must sink.** → **mobile game = faucet, Clash Front = sink**, exactly
  the net-sink doctrine with real faucet numbers. Scale implication: a mid char farming ~30 CT/day must
  find ~30 CT/day of CF consumption — i.e. CF sinks (soldiers mainly, + enrich/craft/command/revive) must
  absorb the faucet, so the game is deliberately consumptive (big armies, frequent battles, enrichment).

### Gems collapse into CT (Carat) — drop the separate premium token
- The deep/rare tier **is CT itself** ("CT = Carat"). Deep-mining doesn't drop a gem token — it
  **recovers CT/Carat that enrichment buried in the land** (risk/boss-gated). Enrich = bury CT deep;
  deep-mine = dig it back out, dangerously. **No new mint** (recovers sunk CT), and it removes a whole
  token from the stack. Crafts that needed "gems" (blueprints, pet-DNA) now cost **CT + materials**.

### Gold & timber are the MOBA's OWN resources — unify, don't reinvent
- **Gold and timber already exist in the MOBA match** (gold currency; trees to cut). CF does **not** mint
  parallel resources — it **shares** them. Match-gold earned in a battle, **extracted on a win**, becomes
  **CF backend gold** (spendable in both, sells → CT). Timber likewise. Renewable-vs-finite is a *tuning
  detail*, not a layer rule.
- **Action item (cross-session):** set the MOBA's gold value so it **translates 1:1 through to CF gold**
  (coordinate with the MOBA / bridge sessions) — **one gold, two layers.**

### Items — three tiers, cleanly separated (proposal — confirm)
| Tier | What | Where earned | Persistence |
|---|---|---|---|
| **MOBA shop items** | in-match power spikes | MOBA match, bought with **match-gold** | per-match (temporary) |
| **Soldier gear** (sword/armor) | mass army quality | **crafted in CF** from resources (+ CT burn) | persistent on the unit |
| **Hero artifacts** | unique Master equipment | **found RoTK-style** — search/discovery/random, ruins, deep-mine, boss drops (CF layer) | persistent NFT, tradeable |

So **crafting is for the mass soldier economy; hero items are DISCOVERED, not crafted** (your RoTK
instinct). Character progression stays special and off the production line.

### Revised currency stack
```
 CT (Carat)   — ON-CHAIN — mobile-game faucet → CF sink; deep-reserve = buried CT recovered by deep-mine
   ▲ withdraw / ▼ deposit  (vault contract + keeper)
 GOLD             — backend — shared MOBA↔CF currency (match economy + CF trade); sells → CT
 IRON/TIMBER/FOOD — backend — farmed/mined/harvested; crafted into soldier gear (+ CT burn)
 HERO ARTIFACTS   — NFT     — RoTK-style discovery, for Masters (not crafted)
```

## 12. Equipment & army composition (owner, 2026-07-06) — modest buffs, salvage, 2-type armies

### Army composition — simple and capped
- **Each Master commands ONE army of at most 2 unit types: NORMAL (line/basic) + ELITE (advanced).** No
  more than 2 compositions — keeps rosters legible and the MOBA spawn/lane logic simple.
- **⚙ Max units per Master** (`maxUnitsPerMaster`, TBD) caps army size — bounds battle scale and keeps a
  Master's force meaningful, not infinite.
- **Scale comes from MORE Masters, not one god-army:** several Masters/armies converge on a battle via
  the existing reinforcement model, so power = numbers of commanders + tactics, not a single stacked hero.

### Soldier gear — per-unit, modest, tied to the unit
- **1:1 with units** — 200 elite soldiers need **200** sets of gear (e.g. leather armor). Gear is a real
  per-unit cost, never a cheap global multiplier.
- **Modest buff (⚙ ~+10–20%, NOT +50%)** — gear *tilts* a fight, never decides it. Scale + tactics +
  Masters win battles; gear-checking doesn't.
- **Destroyed with the unit** if it dies; **~30% salvage** back to resources if the unit survives / on a
  win. **Transferable** between your own units out of battle.
- Made from resources + a CT burn.

### Hero equipment ("shop"/per-match layer) — per match, 30% salvage on win
- **Store/crafted hero items buff the HERO (Master) for that match** — swords, boots, trinkets.
- Per-match, BUT **you don't just throw crafted gear away: WIN → salvage ~30% of its value back to gold,
  brought home.** That's *why* it's per-match and still feels fair — a win recovers a third; a loss loses
  it (real stakes). Keeps hero power spikes tactical + temporary while respecting that you crafted them.

### Hero artifacts (unchanged) — RoTK discovery, persistent NFT
- The *unique* Master equipment stays **found, not crafted**, permanent, tradeable — the special-item
  progression *above* the crafted/per-match layer.

### Revised recipe/buff table (supersedes §4's +50% buffs)
| Item | Buff (⚙) | Cost | On death | On win/survive |
|---|---|---|---|---|
| Leather armor (soldier) | **+15% survivability** | 3 iron + 1 timber + 0.02 CT | destroyed | ~30% salvage |
| Iron sword (soldier) | **+15% attack** | 3 iron + 1 timber + 0.02 CT | destroyed | ~30% salvage |
| Hero gear (per-match) | modest hero spike | resources + CT burn | lost | **30% → gold, brought home** |

**Why this is economically healthy:** gear is a **consumable** — units die → gear destroyed → recraft →
**CT burn every replacement.** Constant attrition = constant crafting demand = a steady sink, *without*
gear-gated god-armies (1:1 cost + modest buff caps the power). The 30% salvage softens the loss enough
that crafting feels worthwhile, while 70% is genuinely consumed — a net sink on every fight.

## TL;DR

CT is the numeraire (10,000 units = $0.10; start 5/50/500). Resources have reference values (food 0.002 →
gem 0.5 CT), are **produced** by pets (50 food/30 wood/20 iron/10 gold per pet-day), **seeded into
battles** by parcel geology + enrich-reserves, **spent** in-match (walls/reinforcements) or **extracted**
on a win, and **crafted** into goods with a mandatory **CT burn floor**. A new player grows ~+1 CT + gear
per week by farm→gear→conquer-weak→trade; a whale runs a passive production hub that sinks CT (enrich +
craft) and sells gear (transfers). Every battle nets **~2.6 CT burned, 0 minted**. The economy grows
**only** via deposits — so deeper resource play = deeper sink, exactly per the net-sink doctrine. Numbers
are ⚙ starting points; §10 lists the six dials to finalize.
