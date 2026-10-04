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
