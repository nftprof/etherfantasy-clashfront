# 01 — POI catalogue (living-world Nodes)

Canon hook: a POI is a **`Node`** ("a point of interest on a hex", `docs/README.md` glossary). It is
seeded into the **reserved `<ZONE>.cf.json` world-elements layer** (`docs/briefs/WORLD-ELEMENTS-OVERLAY.md`:
points only, open `kind`, ≤ 6 per parcel). PvE behaviour uses the doc-05 proposal
**`WildSpawn` / `WildSpawnKind`** (`MONSTER_NODE | ROAMER | DUNGEON | EXPEDITION | WORLD_BOSS`). Paid
defenders use the canon **`Contract`** type **`MERCENARY_DEFEND`**. Caravans are the coded
**`Army.kind:'CARAVAN'`**. New terms below are marked **(new)** and go into `docs/README.md` + `docs/08`
in one canon PR (backlog item 08).

The numbers here are the starting point; the source of truth is `data/living-world/poi-archetypes.json`
(backlog D2), which the seeder and the sim both read.

## 1. The twelve POI archetypes

| Archetype `lwKind` (new) | Lives on | Seeds where (affinity) | Garrison (few, named) | Event deck (drawn per visit) | Holding it gives |
|---|---|---|---|---|---|
| **HARBOUR** | SURFACE (coast) | Existing `SEA_PORT` POI; else coast ≤ 20 u from a castle | Harbour master + 2 marines (`UnitClass` MARINE) + 1 SHIP | NAVAL_LANDING, KRAKEN_SIGHTING (UW2-bound lanes), SMUGGLER_RUN, STORM | Sea-lane toll; the right to ferry armies to the paired port |
| **AIRSHIP_DOCK** | SKY always; SURFACE near `AIRSHIP_PORT` | Existing `AIRSHIP_PORT`; every SKY castle | Dockwarden + 2 skirmishers + 1 airship | AIRSHIP_DROP, SKY_RAIDERS, GALE | Airship reinforcements in battles within range; the lane to Aeropolis |
| **LANDING_SPOT** | Coast beach (SURFACE) / pad (SKY) | 1–2 per HARBOUR or AIRSHIP_DOCK, offset toward open ground | None until an event lands | NAVAL_LANDING or AIRSHIP_DROP *arrive here* | Whoever stands on it when a drop lands **takes the drop** |
| **AIRDROP_ZONE** | SURFACE, SKY | Open ground ≤ 8 u from a road, away from castles | None; the crate *is* the event | SUPPLY_AIRDROP (telegraphed 60 s, contested 3 min) | One crate: supplies, CT shard, or a rare item |
| **BARBARIAN_CAMP** | SURFACE (ridge, forest), UNDER | Near a ridge, ≥ 25 u from any castle | Chieftain + band of 4–6 (`WildSpawnKind` ROAMER source) | BARBARIAN_RAID (hits the **nearest** army, either side), CHIEFTAIN_DUEL | Clearing it: loot + a 48 h lull in raids for the region |
| **MERCENARY_POST** | Any layer, on a road junction | Road ≤ 2 u, between a castle and its nearest port | Captain + hireable roster | MERC_BIDDING (two sides bid for the same company) | Hire guards: `MERCENARY_DEFEND` contracts for your POI or castle |
| **CARAVAN_WAYPOINT** | SURFACE, SKY | On the road between a castle and its port | None; caravans pass through | CARAVAN_RUN (escort or raid an `Army.kind:'CARAVAN'`), BANDIT_TOLL | Escort pay; raiding steals the cargo |
| **WILD_LAIR** | All layers; the monster fits the ground | Forest → WOLF, ridge → WYRM, sky → HARPY, under → TROLL, water → KRAKEN-spawn | Pack of 3–5 + alpha (`WildSpawnKind` MONSTER_NODE) | PACK_HUNT, ALPHA_ENRAGE, STAMPEDE | Taming progress (doc 05 §taming); pet-lineage drops |
| **WAR_CAMP** | Existing `WAR_CAMP`/`WAR_FRONT`; else a castle's far flank | 1 per contested region | Field officer + 4 | MUSTER (S2 wizard recall: stragglers regroup and march), WARLORD (rout = 40 s flee + lull) | Rally point: your armies muster here faster |
| **GUARDIAN_PERCH** | Every castle (1); palaces (2) | Inside the castle's battle map, on the keep | Empty until a player stations an NFT Guardian | GUARDIAN_WAKE (see doc 04) | Stations a Form 2 / Form 3 Guardian for a bounded time |
| **SALVAGE_SITE** | Coast (shipwreck), ruins | `SHIPWRECK`/`RUIN` obstacles in the parcel battlefields; coast ≤ 10 u | Scavenger band of 3 | SALVAGE_RACE (first to hold 90 s wins), STORM | One-off loot; becomes a quiet node after |
| **VENT** | UNDER (UW2 lakes, UW3 magma) | Near UW rivers/flows | Elemental pair | ERUPTION (hazard zone, both sides), CAVE_IN | Rare materials; under-layer access |

## 2. How an event plays (the S2 recipe, per POI)

1. **Clock + deck.** Each POI has an event deck. When an army engages it, the server draws events with
   `PRNG(world.seed, tick, nodeId)` (doc 01 RNG rule), so the same POI plays differently on each visit
   and the draw is replayable.
2. **Telegraph first.** Every event gets a banner, a map ping and a ground decal before it lands. The
   S2 timings are the default: 5.5 s for big events, 0.55 s for unit wind-ups.
3. **Third parties hit the nearest army** (barbarians, wild packs). This creates openings for the weaker
   side, so a big army camping a POI still bleeds.
4. **Threat level** (doc 05, 0–100) rises while a POI is contested and drops on a decisive result:
   chieftain down, warlord routed, or guardian beaten.
5. **Floors and caps.** No event kills an idle defender in under the S2 floor. Garrisons are never more
   than 6 units. Hero impact stays ≤ `HERO_IMPACT_MAX`.

## 3. Placement budget per castle (seed rule)

| Castle `kind` | POIs seeded around it | Always | Then by context |
|---|---|---|---|
| PALACE | 6 | GUARDIAN_PERCH ×2, WAR_CAMP | HARBOUR / AIRSHIP_DOCK if the context allows, MERCENARY_POST, AIRDROP_ZONE |
| CASTLE | 4 | GUARDIAN_PERCH, MERCENARY_POST | HARBOUR or AIRSHIP_DOCK or WILD_LAIR, CARAVAN_WAYPOINT |
| KEEP | 3 | GUARDIAN_PERCH | One terrain POI (lair, camp, salvage, vent), one event POI (airdrop or caravan) |

The context comes from `castle-context.json` (backlog D1):

- coast distance → HARBOUR + LANDING_SPOT;
- `airshipPort` or SKY layer → AIRSHIP_DOCK + LANDING_SPOT;
- ridge → BARBARIAN_CAMP or WYRM lair;
- UNDER → VENT / TROLL lair.

> ❓ OPEN: **Points vs CT.** Canon (doc 02) has CT only. The MOBA uses Pentagon **Points** for practice
> and revives. Proposal: Points buy *experience* (event entries, revives, cosmetic banners) and never
> touch the CT ledger; anything with lasting world effect (defences, guardians, mercenaries) is priced
> in CT via `LedgerEntry`. Needs an owner decision.
