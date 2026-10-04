# A new player's first week (scripted through the real functions)

`tools/living-world/first_week.mjs`. Two 15-min sessions a day from Capemeet Citadel (BUS). Fights are seeded PRNG at 75 % win, not the battle sim. Rewards are abstract points (10 per clear) through the doc-06 anti-farm curve. Held POIs are lost to others at 10 % a day.

| | EXPLORER (follows the board) | GRINDER (nearest POI, again and again) |
|---|---|---|
| Fights / wins | 42 / 36 | 42 / 34 |
| Reward points | 321 | 56 |
| **Reward per win** | **8.92** | **1.65** |
| Repeat clears (same POI within 24 h) | 9 | 33 |
| Stories (newsworthy feed items) | 8 | 0 |
| Personal journal: fresh stories (min per session) | 33 (1) | 9 (0) |
| Sessions with nothing to do | 0 | 0 |
| POIs held at day 7 | 10 | 1 |
| First unlock (day) | POST_EVENTS d2, HARBOUR_RIGHTS d2, PAD_RIGHTS d7 | — |

Explorer, day by day:

| Day | Held | Unlocks | Next | Stories |
|---|---|---|---|---|
| 1 | 2 | — | POST_EVENTS in 1 | 1 |
| 2 | 5 | POST_EVENTS, HARBOUR_RIGHTS | PAD_RIGHTS in 5 | 0 |
| 3 | 7 | POST_EVENTS, HARBOUR_RIGHTS | PAD_RIGHTS in 3 | 2 |
| 4 | 8 | POST_EVENTS, HARBOUR_RIGHTS | PAD_RIGHTS in 2 | 2 |
| 5 | 6 | POST_EVENTS, HARBOUR_RIGHTS | PAD_RIGHTS in 4 | 2 |
| 6 | 8 | POST_EVENTS, HARBOUR_RIGHTS | PAD_RIGHTS in 2 | 1 |
| 7 | 10 | POST_EVENTS, HARBOUR_RIGHTS, PAD_RIGHTS | FORM3_STATION in 15 | 0 |

Explorer's journal, first sessions:

- d1 12:00 Lost to the bounty target 71 u north-east of home. Next time.
- d1 12:00 Broke a barbarian raid 56 u north of home: 48 h of quiet for the region (+10)
- d1 12:00 Cleared the mercenary post 12 u north-west of home, and planted your banner (+10)
- d1 20:00 Lost to the bounty target 71 u north-east of home. Next time.
- d1 20:00 Cleared the wild lair 12 u north-east of home, and planted your banner (+10)
- d1 20:00 Beaten back at the harbour 14 u north-west of home. They'll remember you.
- d2 12:00 Cleared the harbour 14 u north-west of home, and planted your banner (+10)
- d2 12:00 Cleared the harbour 15 u north of home, and planted your banner (+10)

Grinder's journal, first sessions:

- d1 12:00 Cleared the mercenary post 12 u north-west of home, and planted your banner (+10)
- d1 12:00 (repeat) Cleared the mercenary post 12 u north-west of home again: the 2nd time today, ×0.6 reward (+6)
- d1 12:00 (repeat) Cleared the mercenary post 12 u north-west of home again: the 3rd time today, ×0.3 reward (+3)
- d1 20:00 Beaten back at the mercenary post 12 u north-west of home. They'll remember you.
- d1 20:00 (repeat) Cleared the mercenary post 12 u north-west of home again: the 4th time today, ×0.1 reward (+1)
