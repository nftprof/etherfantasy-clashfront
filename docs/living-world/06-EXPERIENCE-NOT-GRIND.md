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
| **Raid** | Break a defended POI or a Warden castle | 10–15 min | "Broke Tidegate's walls, split 34 CT" |
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

## 5. Dominating an area (the PvE progression)

Holding POIs gives **influence** in a region. Influence unlocks things that change *how you play*:

| POIs held in a region | Unlocks | Canon hook |
|---|---|---|
| 3 | Post **SIEGE_ME** / **BOUNTY** events from that region | doc 05 |
| 5 | **NORMAL ship**: sea lanes from that region's harbours | `NAVAL-AIRSHIP…` §7 (5 parcels) |
| 10 | **NORMAL airship**: air reinforcement to held landing spots | §7 (10 parcels) |
| 25 | **LARGE ship / airship**; station a **Form 3 Ascendant** | §7 (25), doc 04 |
| Region majority | Your banner on the region map; region feed headlines; a World Remembers monument when you finally lose it | `WORLD-REMEMBERS-AND-TOWNS` |

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
