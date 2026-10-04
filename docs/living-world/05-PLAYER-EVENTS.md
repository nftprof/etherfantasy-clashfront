# 05 — Player-created events

Owner brief: players should **create events other players fight**. In S2 the server scripted every
event. In Clash Front, players **post** them: a defence they dare you to break, a bounty, a caravan to
raid or escort, a sponsored airdrop. Numbers live in `data/living-world/player-events.json`.

## 1. The six event types

| Event `pevKind` (new) | Posted by | Canon hook | What others do | Stake / pot | Window |
|---|---|---|---|---|---|
| **GUARDIAN_CHALLENGE** | Automatic when a Guardian is stationed (doc 04) | `GUARDIAN_PERCH` Node | Attack the castle: kill or unbind the Guardian | The Guardian's bounty escrow | The stationing (≤ 24 h F2 / ≤ 6 h F3) |
| **SIEGE_ME** | A castle holder confident in their defences | Defence stakes (doc 03) | Register and attack inside the window | The live spoils escrow, plus an optional *dare* top-up | 2–24 h |
| **BOUNTY** | Anyone | `Contract` `BOUNTY_HERO` / doc-05 proposal `HUNT_BOUNTY` | Defeat the named target (army, POI garrison, hero) | Escrowed CT pot | ≤ 72 h |
| **CARAVAN_RUN** | A trader sending an `Army.kind:'CARAVAN'` | `Contract` `ESCORT_SUPPLY` | **Escort** (paid by the owner) or **raid** (take the cargo) | Escort pay + the cargo | The trip |
| **SPONSORED_AIRDROP** | Anyone (brands, guilds) | `AIRDROP_ZONE` Node | Everyone races to hold the crate (`SUPPLY_AIRDROP`) | The crate the sponsor paid for | 60 s warning, then a 3 min contest |
| **WARBAND_CALL** | A commander | `WAR_CAMP` Node (`MUSTER`) | Allies muster for a timed assault | None; shared spoils of whatever they break | 15–60 min muster |

## 2. Shared rules (the S2 recipe at world scale)

1. **Notice before the fight.** Every event posts at least **15 minutes** before it opens (airdrops: a
   60 s telegraph). This is the S2 telegraph rule made social: people need time to come.
2. **The event board.** One list per region. Players can filter by distance, start time, pot and
   type. Pings for events near your holdings.
3. **Escrow first.** No event goes live until its pot or stake is escrowed through `LedgerEntry`. No
   IOUs.
4. **Payout by contribution.** Spoils and bounties split by damage or objective share. There's a 5 %
   minimum share, so drive-bys don't dilute real attackers.
5. **Burn on every pot.** A rake of ≥ 10 % is burned (Decision 17). Sponsored airdrops burn 10 % of the
   crate value.
6. **Battles are allocated like any other.** Joining an event creates or joins a `BattleInstance` via
   the doc-09 §5 allocate/callback contract. Events add *stakes*, never new combat rules.

## 3. Abuse we design out

| Abuse | Rule |
|---|---|
| **Self-farming** (an alt "breaks" your own Guardian or defence to cash the escrow) | Payouts skip accounts that are the poster, the poster's alliance (`DiplomacyRelation` ALLY), or that shared a `LedgerEntry` with the poster in the last **14 d**. Their share is **burned** |
| **Bounty laundering** (post a bounty on your own alt) | Same relation check. A bounty on an account you're related to can't be posted |
| **Event spam** | At most **3 live events per player**; the posting fee rises 1.5× for each live event |
| **Airdrop sniping by one guild** | The crate needs a **20 s uncontested hold**. Any enemy unit in the circle pauses the timer (S2 Tide-style contest) |
| **Fake SIEGE_ME** (post, then pull defences) | Stakes are locked for the window; withdrawing forfeits the dare top-up to the pool |

## 4. Why it feels like an experience

- **There's always something on the board**, and it's player stories, not chores: "Raiders, the
  Ascendant of Emberthrone tires in 2 h — 240 CT bounty."
- **Small groups can win.** Bounties and caravans are fights for 1–3 players. Sieges are for guilds.
- **Every outcome is news.** The region feed records it, and the World Remembers monuments (doc
  `WORLD-REMEMBERS-AND-TOWNS`) can mark famous breaks.
- **Nothing is mandatory.** Ignoring the board costs you nothing; your holdings don't decay faster.

## 5. The region feed (D10)

Every outcome is a *candidate* story. The feed keeps the ones that make a player say "something happened".
Rules and templates are in `data/living-world/feed-templates.json`; the functions are in
`tools/living-world/region_feed.mjs`.

- **Newsworthy:**
  - **Never news:** a repeat clear of the same POI (the doc 06 §4 anti-farm curve), or a routine clear below the middle
    of its ring's threat band.
  - **Always news:** Guardian breaks and holds, SIEGE_ME results, bounties, caravans, airdrops, camp clears, the
    Kraken.
- **Ranked:** kind weight (Guardian unbound 10 … storm 2) + 2 × log10(pot CT). The top **8 per region per day** are
  shown.
- **Written:** each kind has 1–2 headline variants, picked by `fnv1a(itemId)`, so the same outcome always reads the
  same on every client.
- **Sample:** `data/living-world/region-feed.sample.json` is a synthetic day 0 over the 67 castles: 64 outcomes →
  51 newsworthy → 49 headlines across 10 regions. Outcomes are drawn by PRNG, not the sim, and the warband names are
  placeholders. Some of BUS's headlines:
  - 🛡 *Ninefold Company broke on the Ascendant of Middlequay Citadel*
  - 💰 *A caravan to Capemeet Citadel never arrived: Order of the Last Lantern took it on the road*
  - 🔥 *The Ember Oath burned the barbarian camp near Capemeet Citadel: 48 h of quiet for the region*
- **Canon note:** there is no feed entity in `docs/08-data-models.md` yet. This sample proposes `FeedItem`
  `{ id, tick, zone, kind, facts }` for a later canon PR. A real item is written by the battle result callback
  (doc 09 §5) and carries player or alliance names.

## 6. The world's own calendar (D17): the board is never empty

Player-posted events come on top of the world's own. `tools/living-world/world_calendar.mjs` gives
`calendar(world.seed, zone, day)`, a pure function. Rates are in `data/living-world/world-calendar.json`.

| World event | Source in the region | Rate |
|---|---|---|
| `SUPPLY_AIRDROP` | Airdrop zones | 1 per 100 zones, 1–6 a day, spread through the day |
| `CARAVAN_RUN` (NPC caravans to escort or raid) | Caravan waypoints | 1 per 12 waypoints, 1–6 a day |
| `ERUPTION` (vent surge: a rush to hold vents) | Vents | 1 per 150 vents, 1–4 a day |
| `BARBARIAN_RAID` | Barbarian camps | Every 3 h (± 1 h); paused by the 48 h lull |
| `SKY_RAIDERS` | Airship docks, in regions with no camps (the sky) | Every 3 h (± 1 h) |
| `KRAKEN_SIGHTING` | The region's sea lanes | Each lane rolls its `krakenRisk` once a day (× 1.5 in storm season) |
| `STORM` | The region's sea lanes | Storm-season closures (doc 07 §4c) |

- **Measured over a full 28-day cycle**, every region that has POIs gets **≥ 8 world events a day, and no 3-hour window
  is empty**. Busy regions such as BUS get ~29 a day (34 on a storm day); the smallest, KOL, gets 9. A test enforces
  this.
- **The sky regions failed at first:** they have no barbarian camps, so they had dead 3-hour windows. `SKY_RAIDERS` is
  the sky's own roaming threat and fixes that.
- **CGI (Olympus, the founders' isle) has no POIs and is exempt.** Its only world events are Kraken sightings and storms
  on its lanes.

## 7. The event board (D16)

`tools/living-world/event_board.mjs` gives `boardAt(world.seed, zone, tick, view)`, a pure function returning the
region's **LIVE** and **UPCOMING** events.

- **World calendar events (§6):** shown as a **6-hour forecast**. The calendar is seeded, so the board can show it
  early.
- **Player posts:** they appear when posted and open after the 15-min notice (airdrops 60 s).
- **Filters (doc 05 §2.2):** event type, minimum pot, and sort by START / DISTANCE / POT / TYPE. Events within 30 u
  of one of the viewer's holdings **ping** and sort first.
- **Sample** (`data/living-world/event-board.sample.json`): BUS at noon, viewed from Capemeet Citadel, shows 1 live
  bounty (150 CT) and 9 upcoming (a barbarian raid in 7 min, an airdrop in 88 min, a caravan, Kraken sightings…).
- **Guarantee:** with one world event per 3-hour window, every POI region's board always shows **≥ 2** events, and busy
  regions show about 10. The smallest, KOL (3 POIs), sits at the floor: a quiet corner, but never empty. A test checks
  it at four hours of the day across all 11 regions.

