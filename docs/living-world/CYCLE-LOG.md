# Living World — cycle log

| UTC | Cycle | Increment |
|---|---|---|
| 2026-10-04 16:10 | 1 | Season 2 mechanics catalogued → `00-S2-LESSONS.md` (10 mechanics → living-world rules); backlog created |
| 2026-10-04 16:25 | 2 | D1: per-castle context generator (`tools/living-world/castle_context.mjs`) → `data/living-world/castle-context.json` (67 castles: water, ports, ridges, roads, estate census, layer); determinism test |
| 2026-10-04 16:12 | 3 | 01: POI catalogue — 12 archetypes (harbour, airship dock, landing spot, airdrop, barbarian camp, mercenary post, caravan waypoint, wild lair, war camp, guardian perch, salvage, vent) with affinity, garrison, event deck, reward; per-castle placement budget; Points-vs-CT open question |
| 2026-10-04 16:17 | 4 | D2: `data/living-world/poi-archetypes.json` — 12 archetypes + 22 events (telegraph, duration, who-it-hits; numbers from the S2 tunables), limits, per-castle budget; tests keep doc 01 and data in sync |
| 2026-10-04 16:28 | 5 | D3+D4: seeder `seed_castle_pois.mjs` → `castle-pois.json`: 67 castles → 298 POIs (76 guardian perches, 49 landing spots, 39 airdrop zones, 30 merc posts, 27 lairs, 22 barbarian camps, 20 airship docks, 12 vents, 9 harbours anchored on sea ports, 9 war camps, 4 caravan waypoints, 1 salvage); 10 new tests |
| 2026-10-04 16:32 | 6 | 04 + D7a: NFT Guardians — Form 2 Warden (beatable, 24 h / 24 h cd / 20 CT) vs Form 3 Ascendant (8-min Ascension per battle at 5 % damage taken, unbind via 3 Ward Stones, then tires to 40 % HP; 6 h / 72 h cd / 120 CT; 1 per castle per week); fee 50 % bounty escrow / 30 % burn / 20 % pool; damage share ≤ 0.20; `guardians.json` + 5 tests |
