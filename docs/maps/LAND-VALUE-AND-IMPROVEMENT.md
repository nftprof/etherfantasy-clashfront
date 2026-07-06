# Land Value & Improvement — the land-layer economic model (PROPOSAL for review)

> **Status: PROPOSAL for the product owner to review — not canon yet.** It synthesizes what is
> already locked (the `INVEST_TIERS` ladder in `map-service/maps/schema.js`, `docs/maps/ECONOMY-SEAM.md`
> Hook 2, the net-sink doctrine + enrichment perks in canon decision 13, landlord tax 30% in decision 6,
> and the parcel/estate split in decisions 4–5) with the new suggestion: **a clear path for an owner to
> spend CT to make a parcel/estate more valuable** — more resource tiles, stronger strategic ground,
> better defenses, and (for estates) castle upgrades. Reviewed edits become canon in `docs/02-economy.md`
> + `docs/08` + the generator's `INVEST_TIERS`.
> Author: Clash Front Overworld design session, 2026-07-06.

---

## TL;DR

**CT is the only thing you spend on land; everything else is what that spend UNLOCKS.**

- An owner **invests CT into a parcel** (`POST …/invest`, ECONOMY-SEAM Hook 2). CT is **burned** (net-sink
  doctrine — deposits > payouts, never a mint). The parcel's **investment tier (0→5)** rises.
- A higher tier raises the parcel's **map budget** → the deterministic generator is allowed to place
  **more + richer resource tiles, more defensive structures, a landmark, and stronger strategic terrain**.
  The tier takes effect on the parcel's next design version and is **permanent until changed**.
- **What the owner gets back** (why they invest): more **gold/wood yield**, better **defensibility**,
  higher **rent/landlord-tax** throughput, **prestige/resale** value, and **enrichment perks** (draft
  cap/speed, pet migration). None of these mint CT — they redistribute or produce the *backend* resources.
- **Land class gates what CT can buy:** a **single parcel** improves toward a resource/defense homestead;
  an **estate** improves toward a **castle** (only estates hold castle maps, decision 5) — walls, gates,
  keep tiers, killzones, and more battle *components*.

So the land layer is a **CT sink with land-bound payoffs**: spend the scarce on-chain currency, get a more
productive and more defensible piece of the fixed world.

---

## 1. The two currencies (keep them separate)

| | **CT** | **Gold / Wood / Timber / Food** |
|---|---|---|
| What | the on-chain currency (gems = CT); the P2W faucet + the sink | backend / in-battle resources (the MOBA's own gold/timber, unified 1:1 — see `docs/reports/ECONOMY-RESOURCE-MAP.md`) |
| Role on land | what you **SPEND to improve** land (burned) | what improved land **YIELDS / stores** |
| Direction | sink (burn) | produced by resource tiles, spent on soldiers/structures |

**The improvement loop:** `spend CT (burn) → raise tier → generator places more/richer resource tiles +
stronger ground + defenses → land yields more gold/wood + defends better + earns more rent → land is
worth more.` CT never comes back from land; the payoff is productivity, defense, and prestige.

---

## 2. Land classes — what each can hold

| Class | Battle map | What CT improvement builds toward |
|---|---|---|
| **Single parcel** (smallest size) | one ±161 battlefield | a **resource/defense homestead**: gold/wood tiles, a strategic strongpoint, a few towers, a landmark |
| **Estate** (100s–10,000 hexes) | a **series** of ±161 components, **castle = final component** (decision 4) | a **castle/fortress**: curtain walls, gates, towers, a keep, bent-approach killzones, and MORE components to fight through |

Rule (decision 5): **only estates hold castle maps.** A single parcel can raise defenses (towers/walls
as buildable modules) but never becomes a castle — that's the estate's premium. This keeps estates the
top of the land-value ladder and gives whales a distinct sink.

---

## 3. The investment ladder (tiers 0→5) — what CT unlocks

Already in `map-service/maps/schema.js INVEST_TIERS` (the hard budget the generator is clamped to; the
LLM is *told* the budget and can never exceed it). CT cost per tier is CF's to set (the sink knob):

| Tier | Name | Resource tiles | Max richness | Mob camps | Towers | Barriers | Landmark |
|---|---|---:|---:|---:|---:|---:|:--:|
| 0 | Untamed | 2 | 40% | 1 | 0 | 0 | — |
| 1 | Settled | 3 | 55% | 2 | 1 | 0 | — |
| 2 | Developed | 4 | 70% | 3 | 2 | 1 | ✓ |
| 3 | Prosperous | 5 | 85% | 4 | 3 | 2 | ✓ |
| 4 | Rich Vein | 6 | 100% | 5 | 4 | 3 | ✓ |
| 5 | Golden | 8 | 100% | 6 | 6 | 4 | ✓ |

"Fighting in a gold mine" is a tier-5 map; a fresh parcel can't fake it. Tiers persist across redesigns
and are **absolute** (a raid/decay can lower the level the same way it's raised).

### 3a. PROPOSED extensions to the ladder (the new "make land value even more" asks)

Add these budgeted axes on top of the existing tier caps (all still generator-clamped + validator-gated):

- **Strategic terrain grade** — CT buys *designed* advantage the generator must honor: a dominating hill /
  ridge / chokepoint the defender holds, or a river/wall that funnels attackers. Higher tier = stronger,
  more defensible ground (maps to the `ridge/riverBand/wall` feature-DSL + high-ground scoring in the
  LLM curriculum). *This is the "strong strategic point" ask.*
- **Natural defensive features scale with ESTATE SIZE (owner 2026-07-06).** Bigger estates get more (and
  more unique) natural defensive terrain — hills, cliffs, ravines, narrow passes, fordable rivers — not
  just more components. This is a size-driven bonus on top of purchased grade: a 10,000-hex estate is a
  *landscape* with real high ground, an EPIC's castle sits on a crag. Ties to `heightField` (elevation as
  gameplay, see the constraints brief) and the atlas's mountain/coast zones.
- **Terrain-as-weapon (defensive actions, `heightField`-driven).** Where an estate has hills, the defender
  can trigger **downhill hazards** — roll boulders / drop logs / release a dammed stream down a slope into
  the attacker's lane (a one-shot, cooldown'd defensive action, cost/charge in CT or materials). This makes
  elevation *actionable*, not just cover, and gives estates a signature "hold the high ground" identity.
  Needs the `heightField` layer + a HAZARD terrain code (both already scoped in the constraints/curriculum
  briefs). **Design note for review — not yet speced into the generator.**
- **Resource-tile TYPE + placement** — beyond count/richness, let the owner bias toward **gold** (economy)
  vs **wood** (soldiers/structures), and toward **defensible** placement (near the keep) vs **contested**
  (mid-map, higher yield but raidable). *This is the "more resource tile for gold and wood" ask.*
- **Castle grade (estates only)** — CT tiers the fortification itself: keep tier (HP/final-component
  strength), wall rings (→ more ±161 components to breach), gatehouse/barbican, killzone quality. Uses the
  castle-template library + the `wall()`/`bentApproach()` primitives.
- **Population / draft capacity** — CT raises the parcel's pet-population cap → higher **draft cap/speed**
  (enrichment perk, decision 13). **Drafting still costs FULL CT** — capacity is a convenience, never a
  free-soldier faucet.

---

## 4. What CT buys, by category (the improvement menu)

The owner-facing "invest in this land" menu, all funded by burning CT:

| Category | What it does | Payoff | Land class |
|---|---|---|---|
| **Resource tiles** (gold mine / wood grove) | more + richer harvest nodes | more gold/wood yield | both |
| **Strategic ground** | designed high-ground / choke / funnel | combat advantage on defense | both |
| **Defensive modules** (tower / wall / gate) | placeable HP structures with anchors | survive raids, hold the map | both (walls/keep = estates) |
| **Castle grade** | wall rings, gatehouse, keep tier, killzones | more components + a stronger final stand | **estates only** |
| **Population cap** | higher pet-population ceiling | faster/bigger drafts (still full CT) | both |
| **Landmark** | rare prestige feature (obelisk, crater lake…) | prestige, resale, thematic pull | tier ≥2 |

Occupiers (non-owners holding the land) may **ADD structures** too (destructible/pillageable for
materials, decision 10) — but the **permanent** tier/value belongs to the landowner.

---

## 5. Why an owner invests (value realization)

CT out is a burn; the return is these land-bound flows (none mint CT — net-sink safe):

1. **Yield** — richer resource tiles produce more gold/wood (backend resources) for the owner/occupier.
2. **Rent / landlord tax** — a 30% landlord tax (decision 6) on activity/battles on the land; a busier,
   more valuable parcel throws off more. *(Hook 3: landowner cut from the battle casualty callback.)*
3. **Defense** — strategic ground + castle grade make the land costly to take → protects the above.
4. **Enrichment perks** (decision 13) — pet-migration rolls, draft cap/speed, DNA-fragment drops scale
   with the parcel's pool/tier — the *real* payoff of enrichment, not the decaying trickle.
5. **Prestige / resale** — a tier-5 "Golden" estate or a famed castle is a scarce, fixed-supply asset
   (the world never regenerates, decision 1) → secondary-market value.

---

## 6. Economic guardrails (must hold)

- **Net-sink doctrine** (decision 13): every CT improvement **burns**; land NEVER mints CT. Yields are
  backend resources or redistribution (rake/tax), never new CT. Keynesian injections = explicit owner
  policy only.
- **No free-soldier faucet**: capacity/population perks raise draft cap/speed but **drafting always costs
  full CT**; granted units' deaths must never feed pools.
- **Tier is a hard budget**: the LLM/generator is *told* the tier and **clamped** to it (`clampParams`);
  the validator guarantees the richer map still plays. Owners can't fabricate a tier they didn't buy.
- **Determinism**: same parcel + same tier + same seed ⇒ byte-identical map (AGENTS.md prime directive).
- **Permanence**: parcel geometry is fixed (decision 1); tiers persist; downgrades (raids/decay) are
  absolute level sets, not additive.

---

## 7. Open questions for the owner (to decide before this becomes canon)

1. **CT cost curve per tier** — linear, or exponential (whale sink)? And per land class (estates cost more)?
2. **Decay / raid downgrade** — does losing a battle / going un-defended lower the tier over time, or is
   tier permanent once bought? (Decay = a recurring CT sink; permanence = a cleaner asset.)
3. **Strategic-terrain grade** — expose it as its own CT axis (§3a) or fold it into the existing tier?
4. **Gold-vs-wood bias** — let owners specialize a parcel's yield, or keep tiles generic?
5. **Castle grade granularity** — how many CT steps between a walled manor and an EPIC fortress, and does
   each wall ring literally add a battle component?
6. **Occupier vs owner split** — occupiers add pillageable structures; should occupiers also be able to
   spend CT on *temporary* improvements, or is permanent value owner-only?

---

## 8. Ties to existing systems (so review is grounded)

- **`map-service/maps/schema.js` `INVEST_TIERS`** — the live tier→budget table (§3).
- **`docs/maps/ECONOMY-SEAM.md` Hook 2** — the `POST /internal/v1/designs/<id>/invest {level}` API CF
  calls after charging/burning CT; **Hook 3** — landowner payout from the casualty callback (§5.2).
- **`docs/maps/BATTLE-MAP-TEMPLATE-LIBRARY.md` + `CASTLE-TEMPLATE-LIBRARY.md`** — the archetypes CT-tier
  maps are drawn from (strategic ground, castle grades).
- **`docs/briefs/MAP-GENERATOR-LLM-CURRICULUM.md`** — the fitness function that turns a tier + intent into
  a playable, balanced map (balance/interest/novelty scoring).
- **Canon decisions 4, 5, 6, 13** — parcel/estate split, estates-only castles, landlord tax 30%,
  net-sink + enrichment perks.
- **`docs/reports/ECONOMY-RESOURCE-MAP.md`** — CT (on-chain) vs gold/wood (backend) separation.
