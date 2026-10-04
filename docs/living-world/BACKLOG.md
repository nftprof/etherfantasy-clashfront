# Living World — backlog (5-minute build cycles, 2026-10-04 → 2026-10-05)

Ordered by value. Each cycle takes the top unticked item and ships one tested increment.
Owner brief: POIs for every castle/terrain; defenders pay for defences, attackers pay in lost units;
player-created events; NFT Guardians (Form 2 beatable, Form 3 near-invincible but time-limited);
airships, landing spots, harbours + sea ships; seed all 20K maps; an experience, not a grind.

## Design (doc-first)
- [x] 00 — Season 2 lessons → living-world rules (`00-S2-LESSONS.md`)
- [x] 01 — POI catalogue: types, terrain/biome affinity, garrison template, event deck, rewards
- [x] 02 — Seeding 20K maps: archetype templates × procedural params; determinism; validation by headless sim samples
- [x] 03 — Defend / attack economy: defender upgrades + mercenary guards (pay), attacker pays in units lost; CT/Points flows via LedgerEntry; caps and decay
- [x] 04 — NFT Guardians: Form 2 / Form 3 rules, durations, cooldowns, costs, counterplay, HERO_IMPACT_MAX / North Star check
- [x] 05 — Player-created events (bounties, sieges, guardian challenges) and how other players find and join them
- [x] 06 — Experience, not grind: session shapes, lulls, rewards cadence, anti-farming
- [x] 07 — Naval + air layer: harbours, sea ships, airship docks, landing spots, ferry routes
- [x] 08 — Canon reconciliation: add new terms to the data-model canon (PR to the overworld branch)

## Data & code
- [x] D1 — Inventory castles / parcels / terrain from the overworld data (counts, fields, biomes, coast)
- [x] D2 — `poi-archetypes.json`: the archetype templates (data the sim and docs both read)
- [x] D3 — Deterministic seeder: (parcel/castle, seed) → POI placements + event decks
- [x] D4 — Seed every castle → `data/living-world/castle-pois.json` + tests (determinism, coverage, bounds)
- [x] D5 — Scale to all maps: per-terrain seeding over the full parcel set, plus a summary report
- [x] D6 — Headless sim samples: run N seeded POIs through `server/sim`, report win/hold-time spread
- [x] D7 — Guardian + defence balance tables (`guardians.json`, `defences.json`) + tests
- [x] D8 — Map designer: POI types (airship dock, landing spot, harbour, sea ship lane) — PR
- [x] D4b — Rebalance: caravan waypoints are thin (4) — every castle with a port gets a caravan route; salvage only 1
- [x] D5b — L3 singles (284 K): lazy seed function export + 1 % sampled report (no bulk commit)
- [x] D5c — Tune: UW1 vent-heavy (655/1,233), barbarian camps rare (44) — revisit with sim sampling
- [x] D8b — Battle-map anchors: PIER / LANDING_PAD placement + NAVAL_APPROACH / AIR_APPROACH spawn classes in generate.js (designer follow-up PR)
- [x] D6b — Calibrate the sim harness: model castle structures (wall rings, gates, keep 2,400×tier, doc-03 defences) so the CALIBRATION row lands near the S2 floors; then tune archetypes
- [x] D6c — Per-tier target bands: frontier skirmish POIs 3–6 min vs castle-tier 6–12 min; re-tune MERCENARY_POST (3:42) / HARBOUR (4:03) garrisons accordingly; add a defences (doc 03) + Guardian (doc 04) scenario to the sampler
- [x] D6d — Model Ward Stones + Guardian aura in the sampler; per-tier target bands (frontier 3–6 min vs castle 6–12); widen the F2/F3 gap

## Wave 2 (added cycle 22, after the first backlog emptied)
- [x] D9 — Ambient ship traffic: seeded `shipsAt(world.seed, tick)` over `sea-air-lanes.json` (merchant hulls + airships, storm-season lane closures) + determinism tests — doc 07 step 1
- [x] D6e — Archetype × biome sampling matrix (doc 02 §5.2): N seeded parcels per template through the sampler; flag any template outside its tier band
- [x] D6f — Threat curve per ring: clamp seeded threat into the range that lands each band (SKIRMISH 3–6, RAID 6–12), keeping zone strength as the ordering; re-seed, re-run SIM-MATRIX → target ≥ 85 % of POIs in band
- [x] D10 — Region feed: deterministic headline generator from `player-events.json` + POI outcomes (doc 05/06 "something happened" stories), with sample output
- [x] D11 — Influence ladder (doc 06 §5) as data + function: POIs held per region → unlocks (SIEGE_ME, ship 5, airship 10, Ascendant 25) + tests against vessel thresholds
- [x] D12 — Anti-farm + lull rules as a pure reward function (×1/0.6/0.3/0.1 repeat curve, 48 h camp quiet) + tests
- [x] D13 — Owner-decision sheet: one page of the 4 open ❓ calls (Points vs CT, Form 3 stand-ins, Guardians vs 12-min floor, PR #50) with the proposals and what each answer changes

## Wave 3 (added cycle 29)
- [x] D17 — World events calendar: seeded per-region daily schedule of auto events (airdrops, barbarian raids, Kraken sightings, storms, Guardian wakes) — check doc 05's promise "always something on the board" (≥ N per region per day, no dead hours)
- [x] D15 — Defend/attack balance sheet: the CT a defender pays (stakes, mercenaries, Guardian fees) vs the units an attacker loses (sim SIM-SAMPLE losses × unit upkeep) per scenario; is either side's price obviously wrong?
- [x] D19 — CT flow simulation: a seeded 7-day multi-agent run of stakes / bounties / escrows / burns → prove no CT is minted, burn ≥ 10 %, escrows always settle
- [x] D14 — Terrain in the sim harness: forest cover (ranged −), ridge high ground (range +), water crossings (speed −) so SIM-MATRIX ground columns mean something
- [x] D14b — Ground-aware threat: `threatBands.groundShift` (e.g. RIDGE / WATER −3) so defensible-ground skirmishes land in 3–6 min with canon terrain on; re-seed (placements unchanged), re-run SIM-MATRIX → ≥ 95 % in band
- [x] D16 — Event board at tick T: one region's live + upcoming events (player-posted + auto), filter/sort per doc 05 §2.2, sample output

## Wave 4 (added cycle 35)
- [x] D21 — Allocation payload: a living-world POI battle → the doc-09 §5 allocate request (BattleInstance + POI garrison, threat, ground/terrain mods, seeded event deck, Guardian/defence state) — the wire between overworld and this engine; schema + builder + tests
- [x] D22 — First-week walkthrough: script a new player's 7 days through the real functions (board, clears, rewards curve, influence ladder, feed) → report: time to first unlock, CT in/out, stories generated; checks the doc-06 "experience, not grind" claims
- [x] D24 — Last out-of-band cell: in-castle BARBARIAN_CAMP raids fall at 5:38 (< 6 min RAID floor) — tune in poi-archetypes (garrison or castle threat mix)
- [x] D25 — NAVAL_LANDING / AIRSHIP_DROP spawn at the derived approaches (approaches.json) per map: event → spawn point resolver + tests
- [x] D23 — Guardian stationings on the board: GUARDIAN_CHALLENGE auto-posts (doc 05) with the doc-04 wake banner / time-left text; synthetic stationings respecting cooldowns and the 1-Ascendant-per-castle-per-week limit

## Wave 5 (added cycle 40)
- [x] D26 — Personal journal (doc 06 §7 watch item): every win/hold/loss as a private story line (the region feed stays curated); re-run the first week → ≥ 1 journal story per session
- [x] D27 — PR #1 refresh pack: regenerate the world-elements overlay + designer icon notes against the current seeds (post D6f/D14b/D24 threats) as a ready-to-apply patch file for the cf-overworld PR branch (no push there without the owner's go)
- [x] D28 — Mercenary market: MERCENARY_POST hire flow (MERCENARY_DEFEND contract, MERC_BIDDING when two sides want the same company) as pure functions + escrow tests, using defences.json MERCENARIES prices
- [x] D29 — Season beat calendar: the weekly beats of doc 06 §3 (Ascension week per castle, storm season, region threat cycle) on one 28-day calendar; check no region has two "big beats" on the same day
- [x] D30 — Underworld / Sky terrain rows: propose HexTerrain analogues for SKY (open platforms, gale) and UNDER (caverns, vents) to the canon terrain table, with harness numbers

## Wave 6 (added cycle 45)
- [x] D31 — Guardian damage-share cap (doc 04 §4, guardians.json caps.guardianDamageShareMax 0.20): measure the Guardian's share of defender damage in the F2/F3 harness runs; clamp its bombard if it exceeds 20 %; test the invariant
- [x] D32 — A month at scale: agent-based run (hundreds of players, all regions) over the real board/rewards/influence/stationings → banner churn, feed volume, holdings concentration (Gini); North Star check: nobody holds every region
- [x] D34 — Living-world README: one page mapping docs ↔ data ↔ tools ↔ tests ↔ reports, plus "how to re-seed / re-run / hand off"
- [x] D35 — Performance budget: seedSingle latency per parcel, full 284 K re-seed time, matrix + test-suite wall time; record budgets and a test that fails on 2× regressions

## Wave 7 (added cycle 49)
- [x] D36 — Result resolver (the other half of D21): the v1 result callback → world updates as pure functions: POI ownership, defence/Guardian/mercenary escrows settled through the ledger, attacker unit-loss cost, feed + journal items, with the HERO_IMPACT_MAX clamp on officer contributions; idempotent on battleId
- [x] D40 — **Re-scale living-world CT to canon balance.json v2 (÷100 economy)**: defences.json (anchor on build.baseCostCtUnitsByKey: WALL 0.4 CT …), Guardian fees, mercenary prices, bounty/dare minimums, CT-flow genesis (≈ 5 / 50 / 500 CT start balances); re-run the balance sheet with balance.json train costs (not the stale docs/03 table); keep every ratio/split; update docs 03/04/05 + owner sheet
- [x] D39 — Abuse sim: colluding alts/alliances trying to farm Guardian bounties, SIEGE_ME dares, bounties and mercenary auctions → show the relation checks + held bids + escrow rules leave them net-negative
- [x] D38 — Live-ops watch list: the post-launch metrics (band drift, burn ratio, banner churn, whale share, idle sessions, feed volume) each mapped to the test/invariant that defines "healthy", with alert thresholds

## Wave 8 (added cycle 53)
- [x] D42 — Canon PR #2 refresh pack: fold the new proposals (FeedItem, allocate/callback `livingWorld@1`, region-rights ladder, storm season, SKY/UNDER terrain mapping, Guardian damage cap) into a ready-to-apply patch for the canon branch (handoff/, like PR #1)
- [ ] D41 — "Say go" packs for each owner call: a ready data patch per option (Warden fee 1 → 3, SKY/UNDER terrain applied + re-seed script, Guardian ≤ 20-min cap assertion), each pre-tested on a scratch copy
- [ ] D44 — Event-deck engine contract: a schema per event (fields the engine needs: units, arrivesAt, holdToClaimSec, hp…) + a validator over poi-archetypes events{} and the allocate decks
- [ ] D45 — i18n-ready copy: feed + journal + banner templates keyed by stable ids (en baseline), with a test that every key renders
