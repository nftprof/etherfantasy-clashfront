# 00 — What made Siege & Field fun (Season 2 lessons → Clash Front's living world)

Source: the shipped EF MOBA Season 2 modes (`etherfantasy-browser-moba-game/index.html`, `s2Init`/`s2Tick`,
`siegeTick`, `fieldTick`; `server/s2board.js`). Survey 2026-10-04. Numbers are the live tunables.

Season 2 runs are **un-winnable by design**: the score is how long you hold and what you take down.
Plain "waves get bigger" was boring. What made it fun was a set of **events on a clock** layered on a
steady pressure curve. Each event below fixed a specific complaint, and every one of them generalises
into a persistent-world mechanic.

## 1. The ten mechanics that carried the fun

| # | Mechanic (S2 name) | What it does | Problem it solved | Living-world generalisation |
|---|---|---|---|---|
| 1 | **Tiers** (`S2_TIER_EVERY` 150 s, +12 % HP / +8 % dmg per tier) | Steady escalation, plus a jump on milestones | Flat difficulty → no story arc | A **threat level per hex/region** that rises while a POI is contested and falls when it's cleared |
| 2 | **Fewer, stronger enemies** (veterans ×1.6 HP / ×1.4 dmg, caps 80/36) | Each enemy matters | Swarm mush and frame drops on phones | POI garrisons are **few named units**, never crowds; the cap is part of the template |
| 3 | **Barbarians** (neutral, every 95 s, live 110 s, chieftain every 3rd band) | Wild bands hit **both** sides, then leave | Two-sided fights felt scripted; a third party creates openings | **Wild-area roamers** that raid whoever is nearest, attackers *and* defenders, then despawn |
| 4 | **Wizard recall** (every 45 s from 3:30, telegraphed 5.5 s) | Pulls stragglers into a fresh host and marches it | Idle or stuck units → dead air | A **muster event**: scattered enemy units regroup at a rally POI with a public warning |
| 5 | **Airship drops** (siege: every 75 s from 0:45; field: tier 2+, every 55 s; shoot down +150) | Reinforcements arrive from the sky at a landing pad | Edge spawns only → predictable lanes | **Airship docks + landing spots** as POIs. Whoever holds the pad gets the drop; shooting one down is a mini-objective |
| 6 | **Naval landings** (every 3rd field wave arrives by ship) | Beach assaults on water maps | Water was scenery only | **Harbours + sea ships**: coastal hexes get landing beaches; ships ferry raiders and caravans |
| 7 | **The Tide** (10:00; intake × (1 + 0.25·enemy Masters − 0.2·your Masters)) | Masters decide the late game | Owning Masters mattered too little | **Mercenary/Master garrisons** shift a POI's hold-rate. Hiring defenders is the defender's lever |
| 8 | **Hired Blades** (rented Masters fight for you; *unrented ones fight against you*) | "Own few → the enemy swells" | No reason to rent or own | Rent **mercenary guards** for a POI. Unclaimed Masters in the region are hostile to everyone |
| 9 | **Dracobra guardian / endgame** (72 s + 15 s·tier stay; endgame 25:00 hunts bases; respawns 40 s) | A boss you can shoot down but not out-last | "Nobody buys infinite time" | **NFT Guardians**: Form 2 beatable, Form 3 near-invincible but **time-limited** (see the Guardians doc) |
| 10 | **Field event pool** (fire, stampede, earthquake, storm, flank ambush, dawn riders, warlord rout) | Randomised per run from a pool on a timeline | Every run felt the same | A **per-POI event deck** drawn by seeded RNG. The same POI plays differently each visit |

Supporting systems that made those land:

- **Telegraphs.** Enemy wind-ups (0.55 s / 0.9 s), banners and minimap pings. Every event announces
  itself; fair surprise, never unfair surprise.
- **Floors and caps.** The idle player lasts ≈ 10 min ("the 10-min floor is sacred") and the swarm
  multiplier is capped at ×4. Events add drama but never one-shot the player.
- **Rout = reset.** Killing the warlord made raiders flee for 40 s, then a fresh event set queued.
  Victories buy breathing room, then the story continues.
- **Aggro + pack pull.** Fights stay local and readable.
- **One life (Field) vs re-runs (Castle).** Two risk profiles from one engine.

## 2. Rules we carry forward

1. **Events on a clock, drawn from a deck.** Never one scripted sequence; a seeded draw over a pool,
   per POI, per visit.
2. **Every event is telegraphed** (banner, map ping, ground decal) before it bites.
3. **Third parties** (barbarians, wild Masters, monsters) attack whoever is closest. This creates
   openings for the weaker side.
4. **Few, meaningful units.** Garrisons are small and named; caps are part of the data.
5. **Escalate, then release.** A threat level rises while contested; a decisive win (rout, guardian
   down) drops it and buys a lull.
6. **Time is bounded.** Every buff, guardian and defence has a duration. Nothing can be bought
   forever ("nobody buys infinite time").
7. **The server owns outcomes.** In S2 the sim ran client-side with server score clamps; in Clash
   Front the battle kernel is headless and server-authoritative (`server/sim/`), so events must be
   deterministic given `(state, seed, inputs)`.

## 3. What did *not* carry well (don't repeat)

- **Client-side simulation** needed shadow anomaly checks (`anomalies` in `s2board.js`). Clash Front
  events run in the server sim.
- **Docs drifting from code.** The Dracobra respawn is 40 s in code and 45 s in the ops doc. Event
  parameters for Clash Front live in **one data file** that both the sim and the docs read.
- **No authored POI data.** S2 had no airdrop, caravan or supply points on the map (airship pads and
  beaches were computed at runtime). Clash Front seeds POIs as **data**, per map, so designers and
  the sim agree.
