# 06 — An experience, not a grind

Owner brief: *"Other than PvP, our PvE should expand so players can start dominating areas, spending CT and
Points to own areas they dominate, but it shouldn't feel like a grind. It should be an experience."*

Numbers live in `data/living-world/experience.json`; tests keep this doc in sync.

## 1. The test for every feature

A feature passes if a player can say **"something happened"** after a session, not **"I did my
dailies."** S2 proved the recipe on a single run: events on a clock, telegraphed threats, third parties,
escalation and release. The living world applies it to a *place you come back to*.

## 2. Session shapes (10–20 minutes is one complete story)

| Session | What you do | Typical length | Story you leave with |
|---|---|---|---|
| **Skirmish** | Clear one frontier POI (lair, salvage, airdrop) | 3–6 min | "Took the airdrop under a barbarian raid" |
| **Raid** | Break a defended POI or a Warden castle | 10–15 min | "Broke Tidegate's walls, split 1.7 CT" |
| **Hunt** | Answer a bounty / guardian challenge | 15–20 min | "Outlasted the Ascendant of Emberthrone" |
| **Hold** | Defend your POI when a SIEGE_ME or raid lands | Whenever it's attacked | "Held the harbour: the stake came back" |
| **Voyage** | Sail a lane; maybe meet the Kraken | 5–10 min | "Dragged to Blackmere — fought our way back" |

The sim already calibrates these lengths (`reports/SIM-SAMPLE.md`). Frontier POIs fall in about 3–6 min and castles
in 6–12 (16 with a Guardian).

## 3. Rhythm without chores

- **Nothing decays faster because you were away.**
  - Defences expire on their own clock (doc 03), not a daily tax.
  - Holdings don't rot while you're offline (overgrowth canon still applies to *abandoned* land).
- **No streaks, no daily-login quotas.** Rewards come from events, which come to *you* via the event
  board and region feed.
- **Weekly beats instead of dailies:**
  - one Form 3 Ascension per castle per week (doc 04);
  - storm season on sea lanes (doc 01 seasons);
  - region threat cycles.
- **Lulls are rewards.** Clearing a barbarian camp buys the region **48 h of quiet** (doc 01). Winning
  *earns* rest.
- **The beats on one calendar** (D29, `tools/living-world/season_beats.mjs` → `data/living-world/season-beats.json`).
  Per region, per 28-day cycle:
  - **STORM_FRONT** on day 21, for regions with sea lanes;
  - one **THREAT_PEAK** (a warlord raid), followed by a 2-day **LULL**;
  - one **ASCENSION_NIGHT** a week (the featured Form 3 challenge), for regions with perches.
  - **Constraints:** a region's big beats are never on the same or adjacent days (escalate, then release) and never
    in a lull. At most 2 regions crest on any day, so the world always has a peak somewhere but never everywhere.
    Tests hold this over 6 cycles.
  - Cycle 0 for BUS: `____A_______A____A___S_A_P··` (A = Ascension night, S = storm front, P = threat peak,
    · = lull).
  - **Every threat peak has a named boss** (D51, `threat-bosses.json`), assigned from the canon roster's bosses:
    - element bosses march on regions of their element: the Tide Centaur on BUS and ENT, the Ember Centaur on HS2,
      Sunwon on UW2;
    - the raid boss Lee Koon anchors the strongest region (UW3, ×5);
    - the generic world bosses fill the rest;
    - the static `Elemental` (0 animation clips) is excluded, and Zouwan is a spare;
    - display names are placeholder i18n keys until the lore team names them.

## 4. Anti-farm: why repeating the same fight is pointless

The same account clearing the **same POI** again within 24 h gets a shrinking share of the POI's
reward:

| Clear # in 24 h | 1st | 2nd | 3rd | 4th+ |
|---|---|---|---|---|
| Reward multiplier | ×1.0 | ×0.6 | ×0.3 | ×0.1 |

- **A different POI is always full value.** The incentive points outward (new places, new stories),
  never at a treadmill.
- The S2 lesson "fewer, meaningful enemies" applies: each POI clear is one real fight, not 30 trash
  mobs.
- Event decks are drawn per visit (doc 02 layer ③), so even a revisit plays differently.
- **As code (D12, `tools/living-world/rewards.mjs`):**
  - `resolveClear(history, clear)` applies the curve over a trailing 24 h window. The count is per account and per
    POI, and a positive base never rounds to 0.
  - `lullUntil` / `raidsAllowed` give the barbarian lull: 48 h from the **latest** camp clear in the region. Lulls
    don't stack, so clearing three camps in a row doesn't buy six days.
  - Callers pass world ticks; the functions read no clock.

## 5. Dominating an area (the PvE progression)

Two ladders, kept apart on purpose (D11, `tools/living-world/influence.mjs`):

**Ladder 1: vessel classes (canon, world-wide).** These come from **parcels you control**, per
`NAVAL-AIRSHIP-THREE-LAYER-MAPS.md` §7 (⚙ canon proposal). The living world doesn't change them:

| Parcels controlled | Vessel class |
|---|---|
| 5 | NORMAL ship |
| 10 | NORMAL airship |
| 25 | LARGE ship + LARGE airship |
| 100 | IMPERIAL carrier |

**Ladder 2: region influence (living world, per region).** Holding POIs in a region (the holdable kinds: airship
docks, harbours, landing spots, mercenary posts, vents, war camps, wild lairs) gives you the *right to use* your
power there:

| Holdable POIs held in the region | Unlocks | Canon hook |
|---|---|---|
| 3 | **POST_EVENTS**: post SIEGE_ME / BOUNTY / CARAVAN_RUN from that region | doc 05 |
| 5 | **HARBOUR_RIGHTS**: dock and ferry *your* ships at the region's harbours toll-free | needs a ship (ladder 1) |
| 10 | **PAD_RIGHTS**: air reinforcement to your held landing spots | needs an airship (ladder 1) |
| 25 | **FORM3_STATION**: station a Form 3 Ascendant on a perch you hold here | doc 04 limits still apply |
| Plurality (≥ 25, or a majority in small regions; no tie) | **Region banner**: your banner on the region map, feed headlines, and a World Remembers monument when you finally lose it | `WORLD-REMEMBERS-AND-TOWNS` |

- **Using a ship from a region's harbours needs both ladders:** the class (land) and the right (influence).
- **Small regions are not locked out.** No threshold exceeds a majority of the region's holdable POIs. KOL has 3, so
  holding 2 unlocks everything.
- **Region sizes** are in `data/living-world/region-influence.json`: 23,489 holdable POIs across 11 regions, from
  BUS 4,629 down to KOL 3.
- **Earlier draft:** doc 06 said POIs held unlocked the vessel classes. That conflated the canon parcel gate with
  influence, and is now fixed.

- **Spend is a choice, not an entry fee.**
  - CT stakes defences (doc 03) and Guardians (doc 04): durable world effects.
  - Points buy *experience* (event entries, revives, banners). That is the doc-01 proposal; the open
    question still awaits the owner.
- **Losing is a story, not a reset.** A broken castle refunds nothing, but nothing is deleted. Pets are
  KO'd, never lost (doc 05 canon). Your monument stays.

## 6. What we will NOT build

- Energy or stamina bars, daily chests, login calendars.
- Timers you have to babysit (every timer either runs out in your favour or posts an event).
- Rewards for clicking the same node every day.

## 7. Measured: a new player's first week (D22, `reports/FIRST-WEEK.md`)

`tools/living-world/first_week.mjs` plays 7 days from Capemeet Citadel through the real functions: board, reward
curve, influence ladder, feed. It runs two 15-min sessions a day. Fights are PRNG at 75 % win, not the battle sim.

| | Explorer (follows the board) | Grinder (nearest POI, again and again) |
|---|---|---|
| Reward per win | **8.9** | **1.65** (≈ 5× less) |
| Stories | 8 | 0 |
| POIs held at day 7 | 10 | 1 |
| Unlocks | POST_EVENTS + HARBOUR_RIGHTS on day 2, PAD_RIGHTS on day 7 | none |
| Idle sessions | 0 | 0 |

The claims hold. The incentive points outward, grinding makes no stories, and the board always has something to
do. Three things to watch:

1. **About one story a day, not one per session.** Most frontier clears sit below the feed's "newsworthy" threshold,
   so the explorer had two quiet days. **Fixed by the personal journal (D26, `journal.mjs`).** Every fight, won or
   lost, becomes a private line, e.g. "Cleared the mercenary post 12 u north-west of home, and planted your banner
   (+10)". The explorer now gets **33 fresh entries, at least one every session**; the grinder gets 9. Repeat clears
   are logged honestly ("…again: the 3rd time today, ×0.3 reward") but don't count as fresh. The region feed stays
   curated.
2. **FORM3_STATION (25 held) is out of solo reach in week 1.** Holdings plateau around 10 with 10 %/day attrition.
   Read this as intended: a Form 3 Ascendant is an alliance-scale goal.
3. **9 explorer repeat clears** came from world events landing on the same Nodes on different days. The curve priced
   them down as designed.

## 8. Measured: a month at scale (D32, `reports/MONTH.md`)

`tools/living-world/month_sim.mjs` runs 400 agents in 8 alliances over the **real** holdable-POI counts of all 11 regions
(23,489 POIs) for 28 days, through the real ladder and banner functions. One whale plays every day with 3× the fights.
Abandoned land (7 days unplayed) goes wild again.

| Measure | Month |
|---|---|
| Fights | 25,274: 10,956 wild POIs taken, 4,715 taken from rivals |
| Held at day 28 | 10,845 (12,644 still wild: the frontier never runs out) |
| Holdings Gini | 0.30 (moderate) |
| The whale | Top player with 170 POIs: **1.6 % of everything held** |
| Banner changes | 74 over the month (~7 per region) |
| Most regions bannered by one player / alliance | **1 / 2** of 11 |
| Unlocks reached | POST_EVENTS 373, HARBOUR_RIGHTS 355, PAD_RIGHTS 326, FORM3_STATION 169 of 400 |

**North Star holds:** playing three times as hard makes you the biggest holder, not the owner of the world. Regions
keep changing hands, and no player or alliance holds most of the map. A test enforces this across 4 seeds.

FORM3_STATION (25 POIs in one region) is a week-1 alliance goal (§7) but a month-1 goal for about 40 % of active
players. That's the pacing we want.

