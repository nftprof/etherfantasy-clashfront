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
- **Story**: the region feed calls it out ("⚔ Gullshoal raiders broke Tidegate's walls — 34 CT
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
