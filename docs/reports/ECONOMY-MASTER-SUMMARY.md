# Clash Front — The Complete Economy, in Tables (master summary)

> The consolidated, tabular re-explanation of the whole economy after the 2026-07-06 owner refinements:
> real CT peg ($0.02–0.10), P2E faucet from the mobile game, 20K scarce parcels, whales + **rental**
> (Axie-style scholarship), **land-improvement caps**, on-chain CT vs backend resources, modest gear,
> 2-type armies. Companion to `ECONOMY-WARGAME-DESIGN-STUDY.md` + `ECONOMY-RESOURCE-MAP.md`. **All
> numbers ⚙ starting values.** Structure is fixed; dials are tunable.

## 0. The one idea that ties every layer together: the CHARACTER is the through-line

The **EF Genesis character = the Master = the rentable asset.** One NFT, every layer (`docs/05`: "the
same Hero record fights PvE and leads Clash Front armies"):

| Layer | The character's role | Earns | Costs (sinks) |
|---|---|---|---|
| **Mobile game (faucet)** | farms CT per session | **1–32 CT/session × 3 energy = 3–96 CT/day** | $50 buy · **5 CT revive** or 7-day CD on death |
| **Clash Front (war)** | leads an army as a **Master**; embody in hero mode | plunder, conquest, land yield | **KO/revive**, command fee, soldier/gear attrition |
| **Economy (asset)** | **rentable** (whale owns → scholar plays) | rent income to the owner | scarcity value; upkeep |

So the same asset is the **faucet source, the war unit, and the store of value.** Everything below hangs
off this.

## 1. The value stack — three tiers (on-chain money · scarce NFTs · backend resources)

| Tier | Asset | On-chain? | Supply | Role | Axie analogue |
|---|---|---|---|---|---|
| **Money** | **CT (Carat)** | ✅ on-chain (vault + keeper) | inflation-controlled by **net-sink** | the only currency; everything priced in it | ~SLP (utility) but **sink-disciplined** |
| **Scarce NFTs** | **Land** (20K parcels), **Masters** (=Genesis chars), **Legendary items/artifacts** | ✅ NFT | **hard-capped** (20K land; limited chars/legendaries) | store of value, yield-bearing, **rentable** | ~AXS + Axies (appreciating assets) |
| **Backend resources** | gold, iron, timber, food, materials, soldiers, gear | ❌ off-chain ledger | produced/destroyed | the "real economy" of goods | ~in-game items |

**Two-layer value system (the Axie lesson done right):** CT is the *utility/spending* token kept scarce
by burns; **NFTs (land/Masters/items) are the appreciating store-of-value layer.** No second fungible
token needed — the NFTs play the AXS role. Axie died because SLP inflated (faucet ≫ sink); our **net-sink
doctrine is the fix** — CT can only enter via deposits and is burned by war/craft/enrich.

## 2. CT peg & P2E math (why we keep it modest)

| Quantity | Value |
|---|---|
| **1 CT** | **$0.02 – $0.10** (initial; say **$0.05** mid) = 10,000 ct_units |
| Start balances | 5 / 50 / 500 CT = **$0.25 / $2.50 / $25** |
| Char P2E yield | 3–96 CT/day = **$0.06–$4.80/day** (at $0.05) → a $50 char pays back in weeks–months |
| Design rule | **P2E must stay modest** — many players earn, so a big faucet needs *bigger sinks* (below), or the token inflates. Affordable to start, not a money-printer. |

## 3. The faucet vs the sinks (the balance that must hold)

| FAUCET (grows supply) | SINKS (shrink supply) |
|---|---|
| **Mobile char farming** — the ONLY CT inflow (3–96 CT/day/char) | **Soldiers** (raise 200 units each; die → the CT that raised them is burned) ← main |
| | **Gear attrition** (units die → gear destroyed → recraft → CT burn; 70% consumed even on a win) |
| | **Enrichment / land improvement** (CT → land spawn-cap + reserve; leaks to burn) |
| | **Command fee** (1/3/5/10/20 CT, burned) |
| | **Revive** (5 CT mobile; Master KO/revive in CF) |
| | **Breeding/crafting** (pet DNA, blueprints — CT burn) |
| | **Rental & market fees** (⚙ % to burn) |

**Rule:** total CT rises *only* via deposits, falls via these sinks. Sinks must be sized so a typical
player **burns ≈ what they farm** (~30 CT/day mid) or the token inflates. Attrition-heavy war + land
investment are the load-bearing sinks.

## 4. Resources — source → use (backend tokens)

| Resource | Collected (source) | Spent (sink) | Cross-layer |
|---|---|---|---|
| **Gold** (shared w/ MOBA) | pet-mine vein · capture mine in battle · MOBA match gold | units, gear, market → sells to CT | **1 gold, both layers** (translate 1:1) |
| **Timber** (shared w/ MOBA) | pet forest (regrows) · cut in battle | walls/towers/traps, armor frames | MOBA trees = CF timber |
| **Iron** | pet shaft-mine hills · forge in battle | swords/armor (soldier quality) | — |
| **Food** | pet farm arable | army upkeep + battle clock + population | — |
| **CT-in-ground (deep reserve)** | **deep-mine** (recovers enrich-buried CT; boss-gated) | — (it *is* CT) | gems collapse into CT ("Carat") |
| **Materials** | mob/boss kills, plunder | crafting/repair inputs | PvE layer |

## 5. Land — the yield-bearing asset with IMPROVEMENT CAPS (owner refinement)

Land is the scarce anchor (20K parcels). Owners **invest CT to improve** it, which **raises the CAP** on
what/how much it can spawn — richer land yields more **but becomes a bigger war target**:

| Owner CT investment | Raises | Consequence |
|---|---|---|
| **Improve** (development ladder) | the parcel's **resource-spawn CAP** (which types + max amount it can hold) | higher ceiling to fill; a **CT sink** |
| **Enrich** | the current **reserve**, filling toward the cap (seeds extractable gold/CT-in-ground) | richer to raid; leaks to burn |
| **Fortify** | defense modules / castle components | costs to take → holds the land |
| Net effect | **richer land = more yield = a bigger prize = attracts warlords** | **conflict generation** — investment *creates* the war it must defend |

So the land loop is: **spend CT to improve/enrich → land spawns more → richer target → defend or lose →
war.** Caps mean improvement is finite (you buy the ceiling up, with diminishing returns), and the whole
thing is a **CT sink that manufactures conflict** — exactly what a war game wants.

### 5b. Alignment — the concrete mechanism is the `INVEST_TIERS` ladder (land team, 2026-07-06)

The land-creator team delivered **`docs/maps/LAND-VALUE-AND-IMPROVEMENT.md`** — the authoritative
land-improvement spec. It **is** the concrete form of the "improvement caps" above: the live
`INVEST_TIERS` ladder (in `map-service/maps/schema.js`) is the cap mechanism. CT-spend raises a parcel's
**tier 0→5**, which raises the **map budget** the deterministic generator is clamped to:

| Tier | Name | Resource tiles | Max richness | Mob camps | Towers | Barriers |
|---|---|---:|---:|---:|---:|---:|
| 0 | Untamed | 2 | 40% | 1 | 0 | 0 |
| 2 | Developed | 4 | 70% | 3 | 2 | 1 |
| 5 | Golden | 8 | 100% | 6 | 6 | 4 |

Higher tier = more/richer resource tiles + more mob camps (**richer land literally spawns more monsters →
my "rich land attracts warlords + monsters" is the same knob**) + stronger defenses. It's wired to
ECONOMY-SEAM Hook 2 (`POST …/invest {level}`, CT burned) + Hook 3 (landowner payout). **Adopt it as the
mechanism; my §5 is the *why*, their doc is the *how*.**

**Recommended answers to their 6 open questions (from this economy model):**

| # | Their question | Recommendation (grounded in the numbers) |
|---|---|---|
| 1 | CT cost curve per tier — linear/exponential? per class? | **Exponential** (whale sink; the faucet needs deep sinks) — e.g. single-parcel ~10/30/90/270/810 CT for tiers 1–5; **estates 5–10× more** (castle grades = the whale premium). |
| 2 | Decay/raid downgrade, or permanent? | **Split cap from reserve:** the **tier (cap) is permanent** (clean, resale-able asset), but the **reserve (fill toward it) depletes** via extraction/raid (§5, resource-map). Fully-abandoned land slowly reverts. |
| 3 | Strategic terrain — own axis or folded? | **Fold into the tier for MVP** (fewer dials); tier ≥3 unlocks designed high-ground. Separate axis is a post-MVP refinement. |
| 4 | Gold-vs-wood bias — specialize or generic? | **Specialize** — this *is* the geology/heterogeneity keystone. Seed a baseline bias from biome (forest→wood, hills→iron/gold), let owners tilt further. Specialization creates trade demand (§6 commerce). |
| 5 | Castle granularity — steps? each ring a component? | **Yes, each wall ring = one more ±161 component** (decision 4) → bigger castle = more battles to breach = defensibility *and* a whale sink. ~3–4 grades (manor→keep→castle→epic), gated by estate size. |
| 6 | Occupier vs owner CT spend? | **Owner buys permanent tier; occupiers spend CT on *temporary*, destructible/pillageable structures** (decision 10) — a sink, but lost when the land changes hands. Permanent value = owner-only. |

## 6. The rental economy (Axie-style scholarship — for whales + F2P access)

Scarce NFTs (Masters, legendary items, prime land) can be **rented**, so whales monetize ownership and
F2P players access power without buying:

| Asset rented | Owner (whale) | Renter (scholar/player) | Split (⚙) |
|---|---|---|---|
| **Master** (already rentable, canon) | earns a rent cut of the Master's yield/plunder | commands it in CF / farms it in mobile | e.g. owner 30% / renter 70% |
| **Legendary item / artifact** | rents out rare power | equips it for a term or per-battle | owner cut + a burn fee |
| **Prime land (tenancy)** | landlord tax on tenant's extraction (exists) | occupies + works the land | landlord % (exists) |

**Why it matters:** whales invest real money into scarce NFTs and earn by **renting** (not by
out-farming F2P), F2P players get an on-ramp (play a whale's Master for a cut), and every rental carries a
⚙ burn fee → another sink. This is Axie's scholarship model — but with the **net-sink keeping CT from
inflating**, which is the part Axie got wrong.

## 7. Player archetypes — how each fits the economy

| Type | Start CT | Owns | Plays for | Economic role |
|---|---|---|---|---|
| **F2P / new** | ~5 CT | maybe a rented Master | grow: farm → gear → conquer weak land → trade | demand for gear/land; supplies raw to estates |
| **Casual** | ~50 CT | 1 Master, small land | steady war + a little P2E | mid consumer + producer |
| **Whale** | ~500 CT+ | multiple Masters, legendaries, **prime land** | own the scarce assets, **rent** them, run production hubs, dominate regions | **CT sink** (enrich/improve/craft) + **NFT store of value** + rental income; anchors regional economies |

## 8. Items — the three tiers (finalized)

| Tier | What | Earned | Persistence | Buff |
|---|---|---|---|---|
| **MOBA shop / hero gear** | per-match hero power | bought/crafted; buffs the **hero** | per-match, **30% salvage → gold on WIN** | modest hero spike |
| **Soldier gear** (sword/armor) | mass army quality | **crafted in CF** (+ CT burn) | on the unit; **destroyed on death, ~30% salvage on survive**; transferable | **~+15%** (never massive) |
| **Hero artifacts / legendaries** | unique Master power | **found RoTK-style** (discovery/boss/deep-mine); **rentable** | permanent NFT | significant but scarce/rented |

## 9. Army composition (finalized)

| Rule | Value |
|---|---|
| Unit types per Master | **exactly 2: NORMAL (line) + ELITE (advanced)** |
| Armies per Master | **1** |
| Max units per Master | **⚙ `maxUnitsPerMaster`** (TBD) — scale comes from *more Masters*, not one god-army |
| Gear buff | **modest (~+15%)**, 1:1 per unit — tilts, never decides |

## 10. Anti-inflation & anti-exploit summary (the guardrails)

| Risk | Guard |
|---|---|
| CT inflation (the Axie killer) | **net-sink**: CT enters only via deposits; war/craft/enrich/revive/rental burn it |
| Free gold farming | gold reserve is **enrich-seeded (sunk CT) + finite + monster-guarded + raidable + taxed** |
| Turtle-farm (greed while winning) | winner **auto-collects surface**; greed-beyond wakes an escalating boss clock; third-party wipe |
| Gear-gated god-armies | gear **1:1 + modest (~15%) + consumable**; 2-type armies; unit cap |
| P2E over-earning | modest yields + **sinks sized to the faucet**; deposit cap per epoch |
| Whale pay-to-win-forever | whales win by **owning + renting scarce NFTs**, not by out-farming; war can take their land |

## 11. Open dials to finalize (all ⚙, structure fixed)

1. **CT peg** ($0.02–0.10 → pick a launch value).
2. **Per-pet yields** + **char farm rate** (the faucet size).
3. **Sink sizing** — soldier/gear attrition rate so burn ≈ farm (~30 CT/day mid).
4. **Enrich→reserve %** + **improvement cap curve** (anti-free-gold + land ceiling).
5. **Rental splits + fees** (owner/renter %, burn fee).
6. **maxUnitsPerMaster** + gear buff % (~15%).
7. **Deposit cap per epoch** (faucet ceiling).

## TL;DR

The **character (Genesis = Master = rentable NFT)** is the through-line: it farms CT in mobile (the
faucet), commands armies in CF (the war), and is the whale's rentable store of value. Value lives in
**three tiers — on-chain CT (money, kept scarce by the net-sink), scarce NFTs (land/Masters/legendaries,
the appreciating + rentable layer), and backend resources (the goods economy).** CT (~$0.05) enters only
via mobile P2E and is burned by soldiers, gear attrition, enrichment, land improvement, command fees,
revives, breeding and rentals — so a bigger economy is a deeper sink, never a faucet (the Axie fix).
**Land improvement raises spawn caps → richer land → bigger war target → conflict**; **rentals** give
whales income and F2P access; **gear is modest + consumable** (a steady sink, no god-armies). Every
guardrail (turtle-farm, free-gold, inflation, P2W) has an explicit answer. Numbers are ⚙; §11 lists the
seven dials to set.
