# 03 — Defend / attack economy

Owner brief: **one player buys defence (pays); another attacks and tries to win (pays as they lose
units).** Numbers live in `data/living-world/defences.json`; tests keep this doc in sync.

## 1. The core idea: defence is a *stake*, not a purchase

Every CT a defender spends on a POI or castle is **staked for a fixed duration**. It splits like a
Guardian fee (doc 04):

| Share | Goes to | Why |
|---|---|---|
| **40 % spoils escrow** | Paid to the attacker who **breaks** the defence. Refunded to the defender if the defence **holds** for its full duration | Defending is a bet on holding; attacking has a prize |
| **30 % burn** | Burned (`LedgerEntry reason:'burn'`) | Decision 17: rake ≥ 10 % burned; CT stays scarce |
| **30 % pool** | LAND-YIELD / zone pool (doc 02 circular split) | Rewards the region, not just the two players |

So **the defender's real cost is 60 % when they hold** and **100 % when they're broken**. The
**attacker's cost is units**, which they lose for real (upkeep, supply, re-training; nothing refunded),
plus nothing else. CT is only ever redistributed or burned, never minted (doc 02).

## 2. What a defender can buy

All of these are **time-bound** (they decay; doc 02 "structure decay maintenance") and **capped**.

| Upgrade | Canon module | Effect in the battle | Levels | Lasts |
|---|---|---|---|---|
| **Walls** | `WALL` | +25 % wall HP per level | 3 | 7 d |
| **Gates** | `GATE` | +1 gate state step (opens and closes slower: 10 s → 14 s → 18 s) and +30 % gate HP per level | 2 | 7 d |
| **Traps** | `TRAP` | 2 / 4 / 6 telegraphed traps (0.9 s ground decal, then 180 dmg + 2 s root); single-use per battle | 3 | 3 d |
| **Granary** | `GRANARY` | +5 min to the siege `FOOD_CLOCK` before defenders starve | 2 | 7 d |
| **Pet den** | `PET_DEN` | +1 / +2 garrison pets (KO'd, never lost) | 2 | 7 d |
| **Watchtower** | `TOWER` (estate-only, canon rule 2b) | +1 tower; **only on estate castles** | 1 | 7 d |
| **Mercenary guards** | `Contract` `MERCENARY_DEFEND` | +2 / +4 named mercenaries in the garrison (S2 Hired Blades) | 2 | 24 h / 72 h |

Mercenaries are hired at a **`MERCENARY_POST`** POI (doc 01). The contract is escrowed per canon
(escrow → fulfil → refund).

- **Unhired companies at a post are for anyone, attackers included** (the `MERC_BIDDING` event). This is the S2
  lesson "every Master you don't rent rides against you": if you don't hire them, your enemy might.

### The market as code (D28, `tools/living-world/merc_market.mjs`)

- **Roster:** each `MERCENARY_POST` has 2 seeded companies (⚙), e.g. "Hired Blades" or "Saltwind Lances".
- **Prices** (from `defences.json`): level 1 = **0.6 CT** for +2 mercs for 24 h; level 2 = **0.96 CT** for +4 mercs for
  72 h.
- **Hiring creates a canon `Contract`** (`MERCENARY_DEFEND` for the holder, `MERCENARY_ATTACK` for a raider) in
  state `TAKEN`. When it expires it becomes `FULFILLED` and the company is free again.
- **The money:**
  - A DEFEND hire is a defence stake: 40 % spoils escrow, 30 % burn, 30 % pool. The escrow comes home if the defence
    holds.
  - An ATTACK hire has no defence to lose, so it's 50 % burn and 50 % pool (⚙ proposal).
- **`MERC_BIDDING`:** if both sides want the same free company, a 10-min ascending auction opens. Each raise must be
  ≥ +10 % and ties go to the earlier bid. Every bid is *held*, not spent: losers get theirs back in full, and only the
  winner pays, at their bid.
- **Relation check:** you can't hire against your own alliance.
- **Worked example** (`merc-market.sample.json`): the holder bids 0.96, the raider 1.06, the holder 1.20 and wins.
  The raider is refunded 1.06. CT is conserved and 0.36 CT is burned.

> **Scale (D40):** every CT number in the living world is on the canon `balance.json` v2 scale (re-scaled ÷100, owner
> 2026-07-10: 1 CT ≈ $0.02–0.10; start balances ≈ 5 / 50 / 500 CT).
> - **Defences:** each upgrade's level-1 price *is* the canon module cost (WALL 0.4, GATE 0.5, TRAP 0.3, GRANARY 0.5,
>   PET_DEN 0.5, TOWER 0.6 CT). A full castle stack costs ~9 CT for 7 days.
> - **Everything else** (Guardian fees 1 / 6 CT, mercenaries 0.6 CT, bounty and dare minimums 0.25 CT) was divided by
>   20. Every ratio and split is unchanged.

## 3. Diminishing returns: no impregnable fortress

- **Defence rating** = 1 + Σ(level × weight), capped at **×1.6** over an undefended castle of the same
  kind. A fully upgraded keep is hard, never unbeatable.
- **Each level costs more and adds less.** Level *n* costs `base × 1.6^(n−1)`; the weight per level
  falls by 25 %.
- **The breach floor.** The sim guarantees that an attacking army of at least
  **1.5 × the defence-weighted garrison** can break the walls inside **12 minutes**. This mirrors the
  S2 "10-minute floor", turned around: defence buys *time and cost*, not immunity.
- **Stacking with a Guardian** (doc 04): the Guardian's aura and walls multiply, but the total
  structure-damage reduction is capped at **−45 %**.

## 4. What the attacker gets

- **Spoils**: the defender's live spoils escrow (all active upgrades) plus the Guardian bounty (doc 04),
  split among attackers **by damage share**.
- **The POI's hold reward** (doc 01): the harbour toll, the airship reinforcement right, and so on.
- **Story**: the region feed calls it out ("⚔ Gullshoal raiders broke Tidegate's walls — 1.7 CT
  spoils"). Players come back for stories, not for grind.

## 5. Why this isn't a grind

- **Nobody has to defend everything.** Upgrades are per POI and expire. You choose *which* hills to
  hold this week.
- **Attacks are events, not chores.** A defended POI announces its defences, so attackers pick fights
  they find interesting. The region feed and the event board (doc 05) surface them.
- **Holding pays you back.** A defence that holds refunds its spoils escrow, so good defenders aren't
  bled dry.
- **No upkeep treadmill.** Defences expire instead of charging daily. Re-buying is a choice, not a tax.

> ❓ OPEN: currency for upgrades. Proposal (doc 01): lasting world effects are **CT only**; Pentagon
> **Points** buy one-off experiences (event entries, revives, cosmetic war banners). Owner decision.

## Balance sheet (D15, `reports/BALANCE-SHEET.md`)

The sheet sets each scenario's CT paid against the attacker's units lost (canon re-training cost, at several
soldiers-per-sim-unit ratios). Three findings:

1. **Guardians are priced far below defences for the same pain:** 0.033 CT vs 3.0 CT per extra attacker unit lost (canon scale, D40; after the D31 damage cap).
2. **A Guardian's bounty is tiny next to the losses it costs to win.**
3. **Defences buy force, not time.** The full stack adds 0:36 to the breach, but makes the attacker bring 1.6× the
   army.

Findings 1–2 are owner call §5 in `OWNER-DECISIONS.md`.

## CT flow simulation (D19, `reports/CT-FLOW.md`)

`tools/living-world/ct_flow_sim.mjs` runs the money side of docs 03–05 for 7 days: 60 agents in 8 alliances, using
defence stakes, Guardian fees, bounties, sponsored airdrops and SIEGE_ME dares. Every move is one double-entry
`LedgerEntry` in integer centi-CT. Outcomes are drawn by PRNG; the battles themselves aren't simulated.

- **Every invariant holds:**
  - no CT is minted;
  - no player balance goes negative;
  - every escrow settles to 0 (paid, refunded, raked or pooled);
  - burn ≥ 10 %.
- The same holds for **5 seeds × 200 agents × 14 days** in the tests.
- **Burn runs at ~28–30 % of all spend, three times the Decision 17 floor.** Defence stakes and Guardian fees burn
  30 % up front, even when the defence holds. That makes the living world a strong CT sink, which is good against
  inflation. If the economy owner wants defending to feel cheaper, the lever is `stakeSplit.burn` 0.3 → 0.2; the burn
  would stay above 10 %.
- **The doc-05 relation check burned ~15 CT** of shares claimed by the poster's own alliance (out of 262 CT spent at canon scale, D40),
  so the self-farming defence is live in the ledger.

