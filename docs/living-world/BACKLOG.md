# Living World — backlog (5-minute build cycles, 2026-10-04 → 2026-10-05)

Ordered by value. Each cycle takes the top unticked item and ships one tested increment.
Owner brief: POIs for every castle/terrain; defenders pay for defences, attackers pay in lost units;
player-created events; NFT Guardians (Form 2 beatable, Form 3 near-invincible but time-limited);
airships, landing spots, harbours + sea ships; seed all 20K maps; an experience, not a grind.

## Design (doc-first)
- [x] 00 — Season 2 lessons → living-world rules (`00-S2-LESSONS.md`)
- [ ] 01 — POI catalogue: types, terrain/biome affinity, garrison template, event deck, rewards
- [ ] 02 — Seeding 20K maps: archetype templates × procedural params; determinism; validation by headless sim samples
- [ ] 03 — Defend / attack economy: defender upgrades + mercenary guards (pay), attacker pays in units lost; CT/Points flows via LedgerEntry; caps and decay
- [ ] 04 — NFT Guardians: Form 2 / Form 3 rules, durations, cooldowns, costs, counterplay, HERO_IMPACT_MAX / North Star check
- [ ] 05 — Player-created events (bounties, sieges, guardian challenges) and how other players find and join them
- [ ] 06 — Experience, not grind: session shapes, lulls, rewards cadence, anti-farming
- [ ] 07 — Naval + air layer: harbours, sea ships, airship docks, landing spots, ferry routes
- [ ] 08 — Canon reconciliation: add new terms to the data-model canon (PR to the overworld branch)

## Data & code
- [ ] D1 — Inventory castles / parcels / terrain from the overworld data (counts, fields, biomes, coast)
- [ ] D2 — `poi-archetypes.json`: the archetype templates (data the sim and docs both read)
- [ ] D3 — Deterministic seeder: (parcel/castle, seed) → POI placements + event decks
- [ ] D4 — Seed every castle → `data/living-world/castle-pois.json` + tests (determinism, coverage, bounds)
- [ ] D5 — Scale to all maps: per-terrain seeding over the full parcel set, plus a summary report
- [ ] D6 — Headless sim samples: run N seeded POIs through `server/sim`, report win/hold-time spread
- [ ] D7 — Guardian + defence balance table (`guardians.json`, `defences.json`) + tests
- [ ] D8 — Map designer: POI types (airship dock, landing spot, harbour, sea ship lane) — PR
