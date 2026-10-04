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
- [ ] D5c — Tune: UW1 vent-heavy (655/1,233), barbarian camps rare (44) — revisit with sim sampling
- [ ] D8b — Battle-map anchors: PIER / LANDING_PAD placement + NAVAL_APPROACH / AIR_APPROACH spawn classes in generate.js (designer follow-up PR)
- [x] D6b — Calibrate the sim harness: model castle structures (wall rings, gates, keep 2,400×tier, doc-03 defences) so the CALIBRATION row lands near the S2 floors; then tune archetypes
- [x] D6c — Per-tier target bands: frontier skirmish POIs 3–6 min vs castle-tier 6–12 min; re-tune MERCENARY_POST (3:42) / HARBOUR (4:03) garrisons accordingly; add a defences (doc 03) + Guardian (doc 04) scenario to the sampler
- [ ] D6d — Model Ward Stones + Guardian aura in the sampler; per-tier target bands (frontier 3–6 min vs castle 6–12); widen the F2/F3 gap
