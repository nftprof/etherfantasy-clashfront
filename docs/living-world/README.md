# Living World: start here

Clash Front's persistent PvE layer:
- POIs on every castle, estate and single parcel;
- defences, mercenaries and NFT Guardians that defenders pay for;
- player-posted events;
- ships and airships;
- the board, the feed and the journal that make it feel like an experience, not a grind.

Everything is **seeded and deterministic**: the same inputs give the same bytes, with no clock and no `Math.random`.
It's validated by the real headless battle kernel (`server/sim`).

**Run everything:** `node tools/living-world/test_living_world.mjs`. It rebuilds every generated file twice,
byte-compares the results, re-runs the sims and checks every invariant (≈ 1 min).

## Read in this order

| Doc | What it decides |
|---|---|
| `00-S2-LESSONS.md` | What Season 2's Field and Siege taught us, turned into rules |
| `01-POI-CATALOGUE.md` | The 12 POI archetypes: where they go, garrison, event deck, reward |
| `02-SEEDING-20K-MAPS.md` | How every map is seeded (archetypes × params) and validated by sim sampling; §7 covers the threat bands, terrain and tuning history |
| `03-DEFEND-ATTACK-ECONOMY.md` | Defenders pay CT (upgrades, mercenaries); attackers pay in units. Also the balance sheet, CT flow and mercenary market |
| `04-GUARDIANS.md` | Form 2 Warden / Form 3 Ascendant: rules, numbers, the 20 % damage cap, stationing rules |
| `05-PLAYER-EVENTS.md` | Player-posted events, the region feed, the world calendar, the event board |
| `06-EXPERIENCE-NOT-GRIND.md` | Session shapes, anti-farm, the two progression ladders, beats, the first week, a month at scale |
| `07-NAVAL-AND-AIR.md` | Sea and sky lanes, ambient traffic, approaches, arrival events |
| `08-ALLOCATION.md` | How a POI battle becomes the v1 allocate request (+ the `livingWorld@1` block) |
| `09-LIVE-OPS.md` | What to watch after launch: 13 metrics, bands, alerts, levers |
| `OWNER-DECISIONS.md` | **The open calls, each with options and a recommendation** |
| `BACKLOG.md` / `CYCLE-LOG.md` | What was built, in order, one line per cycle |
| `handoff/` | Ready-to-apply patches for other branches (PR #1 overlay refresh) |

## Data (`data/living-world/`)

| File | Kind | Made by |
|---|---|---|
| `poi-archetypes.json` | Hand-tuned: archetypes, events, limits, `threatBands` (+ ground/kind shifts) | (source) |
| `guardians.json`, `defences.json`, `player-events.json`, `experience.json` | Hand-tuned rules and numbers for docs 03–06 | (source) |
| `feed-templates.json`, `world-calendar.json`, `terrain-mods.json` | Hand-tuned feed copy, world-event rates, canon terrain mirror (+ SKY/UNDER proposal) | (source) |
| `castle-context.json` | All 67 castles with coast, river, road and port context | `castle_context.mjs` |
| `castle-pois.json` | 325 POIs on every castle | `seed_castle_pois.mjs` |
| `estate-pois/<ZONE>.json`, `estate-pois.summary.json` | 8,482 estates → 8,233 Nodes | `seed_estates.mjs` |
| `singles.summary.json`, `singles.sample.json` | 284,314 single parcels, seeded lazily (`seedSingle`); 1 % sample | `seed_singles.mjs` |
| `world-elements/*.cf.json` | The designer overlay (249 Nodes) for cf-overworld | `export_cf_overlay.mjs` |
| `sea-air-lanes.json` | 55 sea + 6 air lanes | `sea_air_lanes.mjs` |
| `approaches.json` | NAVAL_APPROACH / AIR_APPROACH + pier/pad anchors per baked map | `derive_approaches.mjs` |
| `region-influence.json` | Holdable POIs per region (23,489) | `influence.mjs` |
| `season-beats.json` | Storm front, threat peak + lull, Ascension nights per region per 28 days | `season_beats.mjs` |
| `liveops-watch.json` | The 13 post-launch metrics with baselines, bands, alerts, levers | (source; `liveops_baseline.mjs` checks it) |
| `i18n/en.json` | Every player-facing string (feed headlines, journal lines, Guardian banners, places, directions), keyed; other languages copy and translate it | (source; `i18n.mjs` renders it) |
| `event-contract.json` | Engine semantics per event: shape, scope, required fields | (source; `validate_events.mjs` checks it) |
| `perf-budget.json` | Hot-path baselines + 2× budgets (seedSingle 18 µs, board view 0.09 ms, traffic frame 0.1 ms; full singles seed 4.4 s, matrix 18 s) | `perf_budget.mjs --record` |
| `*.sample.json`, `allocate.samples.json` | Worked samples: traffic, feed, calendar, board, stationings, mercenary market, allocate payloads | The matching tool |

## Tools (`tools/living-world/`)

- **Seeding:**
  - `castle_context.mjs`, `seed_castle_pois.mjs`, `seed_estates.mjs`, `seed_singles.mjs`;
  - `threat.mjs` (the banded threat curve);
  - `export_cf_overlay.mjs`, `sea_air_lanes.mjs`, `derive_approaches.mjs`.
- **Battle validation:**
  - `sim_harness.mjs` (one POI battle in the real kernel);
  - `sim_sample.mjs` (per archetype + defences/Guardian scenarios);
  - `sim_matrix.mjs` (archetype × ring × ground; `--terrain off|proposed`).
- **Game systems (pure functions):**
  - `rewards.mjs` (anti-farm, lulls);
  - `influence.mjs` (vessel + region ladders, banners);
  - `stationings.mjs` (Guardian rules);
  - `merc_market.mjs` (hire + MERC_BIDDING);
  - `arrivals.mjs` (naval/air arrivals);
  - `ambient_traffic.mjs` (`shipsAt(seed, tick)`);
  - `world_calendar.mjs`, `season_beats.mjs`, `event_board.mjs`, `region_feed.mjs`, `journal.mjs`;
  - `i18n.mjs` (`t(key, vars, lang)`: all copy comes from the string table);
  - `allocate_payload.mjs` (the battle wire out) and `resolve_result.mjs` (the result callback back into the world).
- **Reports** (→ `docs/living-world/reports/`):
  - `balance_sheet.mjs` (CT paid vs units lost);
  - `ct_flow_sim.mjs` (ledger invariants);
  - `first_week.mjs` (explorer vs grinder);
  - `month_sim.mjs` (North Star at scale);
  - `abuse_sim.mjs` (coalition self-farming: every scheme net-negative);
  - `e2e_slice.mjs` (one fight end to end: board → allocate → real kernel → callback → resolver → influence).
- **Contracts:** `validate_events.mjs` (every event vs its engine shape and scope).
- **Live ops:** `liveops_baseline.mjs` (every baseline in its healthy band).
- **Performance:** `perf_budget.mjs` (`--record` sets baselines; plain run gates at 2×).
- **Handoff:** `pr1_refresh.sh`; `apply_decision.mjs` (one command per owner decision, pre-tested on scratch copies).

## Common jobs

- **Retune a template** (doc 02 §5: never per map):
  1. Edit `poi-archetypes.json`.
  2. Re-seed: `seed_castle_pois`, `seed_estates`, `seed_singles`, `export_cf_overlay`.
  3. Re-run `sim_matrix` and `sim_sample`.
  4. Run the tests. They fail if any cell leaves its band.
- **After any re-seed:**
  - re-run `influence.mjs`, `region_feed.mjs`, `world_calendar.mjs`, `event_board.mjs` and `allocate_payload.mjs`
    (their samples are committed);
  - rebuild the PR #1 patch with `pr1_refresh.sh`.
- **Kernel changes** (`server/sim`) must stay **opt-in** (`structMul`, `dmgTakenMul`, `shieldsCore`, `dmgDealt`), so
  `node server/test/goldenmaster.js` stays deterministic and stock battles stay byte-identical.

## Branches

All of this lives on `claude/browser-moba-clashfont-gmiy7p`. Two PRs are open on the overworld repo (nftprof):
- **#1:** overlay + designer POI icons. A refresh is waiting in `handoff/`.
- **#2:** canon terms.

Nothing is pushed elsewhere without the owner's go.
