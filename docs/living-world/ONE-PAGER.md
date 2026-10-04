# Clash Front: the Living World, on two pages

**What it is.** The PvE layer that makes the map worth coming back to:
- points of interest (POIs) on every castle, estate and single parcel;
- fights that each tell a short story;
- defences and NFT Guardians that defenders pay for and attackers pay to break, in units;
- events that players post for each other;
- ships and airships moving across the world.

Built in 5-minute cycles (`CYCLE-LOG.md`): deterministic, seeded, and validated by the **real** headless battle kernel.

## 1. Every map is seeded (one function, all 20K+ maps)

| Layer | Count | Living world |
|---|---|---|
| Castles | 67 | 325 POIs (Guardian perches, harbours, airship docks, mercenary posts, war camps, …) |
| Estates (L2) | 8,482 | 8,233 POIs, seeded in 1.2 s |
| Single parcels (L3) | 284,314 | 24,646 POIs, seeded lazily at **18 µs a parcel** (4.4 s for all) |
| Regions | 11 | 23,489 holdable POIs; sea lanes 55, sky lanes 6 |

- **Templates, not maps.** 12 POI archetypes × procedural parameters.
- **Difficulty follows a banded threat curve:** ring → band; zone strength sets the order inside the band; terrain
  and kind shifts adjust it.
- **Validated in the real kernel:** 57 archetype × ring × ground cells with canon terrain; **57 / 57 land their target
  fight length** (frontier/wild skirmish 3–6 min, castle raid 6–12 min).
- No map is hand-tuned; the tests fail if a cell drifts out of band.

## 2. Defend with CT, attack with units (canon CT scale)

| | Defender pays | Bare castle breaks at |
|---|---|---|
| Nothing | 0 | 8:59 |
| Full defence stack (canon module costs, 7 days) | 9.07 CT | 9:35 (attacker must bring 1.6× the army) |
| Form 2 **Warden** | 1 CT | 13:34 |
| Form 3 **Ascendant** (5 % damage for 8 min from first contact, Ward Stones cut it, then it tires) | 6 CT | 17:16 |

- **Guardians are always beaten eventually:** nothing is bought forever. They're capped at **20 % of their side's
  damage** (measured: 19.5–19.9 %).
- **Economy check:** a 7-day CT-flow simulation (canon start balances 5 / 50 / 500 CT) mints nothing, never
  overdraws and settles every escrow. **28 % of spend is burned**, against a 10 % floor.
- **No farm loop:** a main account + alt trying to farm bounties, dares, airdrops, Guardian or defence escrows, or
  mercenary auctions **always loses CT**.
- **Mercenaries** are hired at posts as canon contracts. If both sides want the same company, an auction decides it;
  losing bids are refunded in full.

## 3. It plays like an experience, not a grind

- **The board is never empty.** Each region has a world calendar: airdrops, caravans, eruptions, barbarian or sky raids
  every 3 h, Kraken sightings, storms. That's ≥ 8 events a day with no empty 3-hour window, plus player posts and
  Guardian challenges. A board view costs 0.09 ms.
- **Stories:**
  - a curated region feed (top 8 a day);
  - a personal journal line for every fight, won or lost;
  - fixed text keys, so every line is translatable.
- **A new player's first week:**
  - following the board earns **8.9 reward per win**; grinding one POI earns **1.65**;
  - board-followers get a fresh story every session, and can post events by day 2.
- **A month with 400 players:** the heaviest player holds **1.6 %** of everything. No one leads more than 1 region,
  and banners changed hands 74 times. *No single player decides the world.*
- **A 28-day rhythm:** storm season, a threat peak with a lull after it, and a weekly Ascension night.
- **Ships:** 166 ships and airships move on seeded lanes; storms close sea lanes. Fleets land at real piers and
  airships at real pads on the battle maps.

## 4. Wired to the battle engine

A POI fight becomes the v1 allocate request, plus one additive `livingWorld@1` block (Guardian, event deck, terrain,
arrivals). The result callback flows back through a resolver:
- POI holder, escrows and Guardian bounty settle by outcome;
- the hero is clamped to `HERO_IMPACT_MAX`;
- a broken castle gives the winner the canon PILLAGE / OCCUPY choice;
- it's idempotent, and a conflicting result gets a 409.

It runs end to end through the real kernel (`reports/E2E.md`). All 22 events have an engine contract (shape, scope,
typed fields).

## 5. Your calls (`OWNER-DECISIONS.md`): each recommended option is one pre-tested command

| Call | Recommendation | Command |
|---|---|---|
| Points vs CT | CT for lasting effects, Points for one-off experiences | doc-only |
| Form 3 stand-in art | Allow, with a "Form 3" badge | doc-only |
| Guardians vs the 12-min floor | Exempt, but capped at 20 min | `apply_decision.mjs guardian-20min-cap` |
| What a Guardian hunt is for | The castle is the prize; Warden fee 1 → 3 CT | `apply_decision.mjs warden-fee-x3` |
| Sky / Underworld terrain | SKY → HILLS, UNDER → MOUNTAIN + seed shifts | `apply_decision.mjs sky-under-terrain` |
| Close stale MOBA PR #50 | Close it | GitHub |
| Overworld PRs #1 / #2 | Apply the refresh patches in `handoff/` | `git apply …` |

## 6. Numbers to watch after launch

There are 13 metrics with healthy bands and alerts (`09-LIVE-OPS.md`), and all are healthy today. Three are hard
invariants:
- burn ≥ 10 %;
- Guardian damage share ≤ 20 %;
- no coalition profit.

**Run it all:** `node tools/living-world/test_living_world.mjs` (the full suite, ≈ 2 min). Start reading at
`README.md`.
