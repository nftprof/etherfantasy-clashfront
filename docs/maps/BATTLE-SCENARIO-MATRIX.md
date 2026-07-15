# Battle scenario matrix — overworld triggers → mode → map seeding → aftermath (2026-07-14)

> Owner ask: "any scenario missing? correlated with CF logic." Every overworld situation that can
> put two forces on one parcel, what mode it selects, what the seeded map provides, and where the
> survivors go. Grounded in the ACTUAL sim (`packages/sim-engine/tick.ts` movement/battleSpawning,
> `wildBattle.ts`, decisions 9/11/14/15/22) + the mode audit (`GAME-MODES-SEEDING-REVIEW.md`).
> §4 lists the gaps found — sim changes are **CF Overworld eco's** lane; the map side is ready.

## 1. The scenario matrix

| # | Overworld trigger | Sim today | Mode | Map provides | Aftermath (loser) |
|---|---|---|---|---|---|
| A | **March onto an OCCUPIED, defended parcel** ("someone attacks you") | hostile co-location → battle same tick; defender = territory holder | **SIEGE** | defender CC (`def_base`, castle courtyard if present) + `bs_ring` build spots (occupant's modules) + pets on GUARD; attacker enters at the approach-edge `entry_e*` | attacker loses → retreat (see G); defender loses → territory changes hands |
| B | March onto occupied but **garrison-free** town/settlement | **bloodless walk-in** (F2) — pendingChoice OCCUPY/PILLAGE, no battle | — | n/a (no battle map spun up) | n/a |
| C | **Attack WILD land** (monsters/no owner) | `wildBattle` (waves, strategies, retreat cmd) | **GUARD** | no CC; seeded mobs/towers = the guards (`contentReady.siegeGuards`); kill-all-to-complete; every edge is a valid assault start | attacker loses/TIMEOUT → retreats; wild side never "moves" |
| D | **Attack another user's PET-ONLY homestead** (no army, pets assigned) | decision 9/14: pets fight, are KO'd, auto-return home — never lost | **GUARD** | same as C — the occupant's pets+towers are the runtime guard content | walk-on take-over returns pets home; land occupiable after clear |
| E | **Lone Master holds land, army walks on** | decision 14: OVERWHELM / DUEL(hero) / FLEE by standing order | **hero DUEL** (tiny-arena M2+; v1 auto-duel animation) | any map (`DUEL` universal) | KO via live Masters API; land taken on OVERWHELM/lost duel |
| F | **PvP field collision — army marches into a hex where a hostile army stands** (interception mid-path or at destination) | halt + battle same tick; defender = territory holder if present, else lexicographic-first (MVP truce quirk) | **DUEL** (2 armies) / **CLASH** (3+) | both CC anchors (`atk_S`/`def_base`) for DUEL; per-edge `canBase` starts (+`sim.fairEdges`) for CLASH | loser retreats/routs (see G) |
| G | **Aftermath — where survivors go** | TIE → attacker retreats. Decisive: losing ATTACKER retreats **adjacent friendly → adjacent neutral w/o hostiles → scatter** (extra casualties, possible disband). Losing DEFENDER **routs = DISBANDED (MVP)** | — | **the map's edge entries are also the EXITS** — the flee edge chosen on the battle map maps 1:1 to which adjacent parcel the survivors land on | see gap 2 — owner rule not fully implemented |
| H | **Latecomer arrives at a parcel with a RUNNING battle** | hex LOCKED; a same-side arrival is now **QUEUED at the arrival edge** (`reinforcement_offered` event) — DONE 2026-07-15, `docs/briefs/REINFORCEMENT-LANE-QUEUE.md`. Sim-side bookkeeping only; live soldier drain into the match = the match-server's job | — | decision 11 says Masters arriving mid-battle enter at the matching edge as reinforcements + new lane — join-window/soldier-drain hookup still pending on the netcode side | — |
| I | **Two players arrive/commute across an UNOCCUPIED parcel at the same tick** | forced battle — one side arbitrarily becomes "defender" (lexicographic!), everyone else attacks | see gap 3 — should be **intent-driven** | per-edge entries + center objective already support both outcomes | — |

**"Can two armies sit on the same land?"** — Confirmed, exactly as the owner states: co-location
exists only between arrival and the SAME-TICK battle-spawning phase (plus latecomers waiting at a
locked hex's edge). There is no persistent stacking of hostile armies.

## 2. When is DOMINION selected vs DUEL? (the selection rule, proposed canon)

Mode selection = **what is at stake + who has a base**:

- **DUEL** — 2 hostile armies, at least one with a REAL stake to raze (a defender CC/garrisoned
  territory, or two field armies that both fortify camps). The MOBA-equivalent two-CC fight.
- **SIEGE** — the defender is an OCCUPATION (CC + placed modules + pets); attacker has no base on
  this land. Asymmetric by construction.
- **GUARD** — no CC on either side: wild monsters or pets-only homestead. Kill-all-to-complete.
- **CLASH** — 3+ armies, or 2 armies with NO territorial stake (meeting engagement in the field);
  last standing; starts on `sim.fairEdges`.
- **DOMINION** — the stake is CONTROL of a parcel NOBODY holds: simultaneous arrival with occupy
  intent (scenario I), contested neutral objectives, event battles. Hold the center = take the
  claim. DOMINION is the natural resolution of scenario I — it turns "we both got here at the
  same time" into a fight FOR the parcel instead of an arbitrary defender assignment.

## 3. Correlation with map seeding — nothing missing on the MAP side

Every scenario above needs only what every seeded map already guarantees (GEN_VERSION 4):
per-edge entries (arrival + retreat direction), both CC anchors, the center objective, the
build-spot ring, edge↔center↔edge clear paths, optional destructible gates that never seal the
main path. The 40-parcel sample: DUEL/SIEGE/GUARD 40/40, CLASH/DOMINION 39/40.

## 4. Gaps found (sim-side; for CF Overworld eco — the map side is ready)

1. **Defender rout = DISBANDED (MVP).** Owner rule: *either* side should be able to flee — losing
   defenders should retreat like losing attackers do (adjacent friendly → came-from → scatter),
   not evaporate. (Attacker retreat already exists.)
2. **Flee DIRECTION choice.** Owner rule: default = the direction the army came from (safest,
   known ground) or a player-specified side. Sim picks adjacent-friendly-then-neutral with no
   path memory and no player input. Proposed: retreat preference = (a) explicit standing order
   edge if set → (b) the hex it entered from (armies keep `path` history) → (c) adjacent friendly
   → (d) adjacent neutral w/o hostiles → (e) scatter. On a LIVE battle the chosen flee EDGE on the
   ±161 map should determine the retreat parcel (edge entries ↔ adjacency 1:1).
3. **Scenario I is wrong today**: simultaneous arrival on unowned land forces a battle with a
   LEXICOGRAPHIC defender. Proposed: no occupier ⇒ no defender ⇒ intent check — both declared
   OCCUPY ⇒ **DOMINION** (hold center = claim); only one wants the land ⇒ it plays DOMINION
   attacker-vs-claimant or the transiting side simply passes (see 4); neither wants it ⇒ pass-through
   truce, no battle (armies were commuting).
4. **No transit intent.** Marching THROUGH a parcel is indistinguishable from attacking it —
   `phaseMovement` halts on any hostile presence (interception is right for hostile stances, but
   two commuters currently must fight). Proposed: `stance: HOSTILE | EVASIVE` on the march; two
   EVASIVE armies co-crossing don't spawn a battle (ZoC/ambush checks are already a listed TODO in
   tick.ts — this folds into that work).
5. ~~**Mid-battle reinforcement** (H) is canon (decision 11) but post-MVP — latecomers wait today.~~
   **DONE 2026-07-15 (CF sim side)** — arrivals at a locked hex are appended to a per-battle
   reinforcement queue and surfaced as `reinforcement_offered` events (private to the reinforcing
   governor); `POST /api/reinforcement/withdraw` cancels. Queue drops on battle resolution.
   Match-server live soldier drain into the running match still pending (netcode side).
   ⚙ `wildBattle.lane.soldierCapLive` (16) and `armySupplyMin` (25) — `docs/briefs/REINFORCEMENT-LANE-QUEUE.md`.

## 5. Map TYPES × modes — the comprehensive plan (owner ask 2026-07-14)

Not every map hosts every mode: the map TYPE (what stands on it + estate scale) narrows the menu.
The geometry base (per-edge entries, clear paths) is universal; TYPE adds/removes modes:

| Map type | What it is | DUEL | SIEGE | GUARD | CLASH | DOMINION | Notes |
|---|---|---|---|---|---|---|---|
| **Open single** (countryside, laneCount 1) | plain generated parcel, no fortification | ✅ | ✅¹ | ✅¹ | ✅ (fairEdges) | ✅ | the universal fighting ground; ¹content = occupant overlay or seeded wilds |
| **Castle single — KEEP** (LARGE estate anchor) | world-castle parcel: def_base IN the courtyard, WALL/GATE/TOWER ring baked | ✅ | ✅★ | ✅ | ⚠ | ⚠ | ★ the flagship: fortified SIEGE. CLASH/DOMINION allowed but the castle side has a built-in advantage — treat as attack-the-holder, not fair-melee |
| **Town parcel** (decision 20) | player-ownable port-like special; markets/inns | ✅ | ✅ | ✅ | ❌ | ❌ | **no-war windows override everything**: war-locked ⚙ 7–30 days after occupation change; permanent no-war dev towns NEVER battle. Garrison-free town = bloodless walk-in (B), not a fight |
| **POI hero parcel** (gates/bridge/harbour/keeps; LARGE 3 / GIANT 5 / EPIC 8) | the only parcels that can open a LIVE ±161 3D match inside an estate board | ✅ | ✅ | ✅ | ⚠ | ✅ | DOMINION is natural here (hold the gate/bridge); the live-window economics (decisions 15/16) gate WHEN it goes 3D, not which mode |
| **Estate board — SMALL/MEDIUM** | fights as a SINGLE-parcel battle (decision 22) | ✅ | ✅ | ✅ | ✅ | ✅ | = whatever its one parcel's type says (MEDIUM manor iff town anchor → town rules) |
| **Estate board — LARGE/GIANT/EPIC** | ONE command-view battle across the WHOLE estate map (~200 parcels EPIC), attacks from all edges | — | ✅ (board-SIEGE) | ✅ (wild estates: BOSS+monsters) | ✅ (multi-army convergence IS the board battle) | ✅ (hold the castle = hold the estate) | board level has NO DUEL — 1v1s happen INSIDE it at POI parcels as live ±161 matches whose results feed back (decision 22). Fortification ladder: EPIC=PALACE / GIANT=CASTLE / LARGE=KEEP |
| **Wild estate (BOSS)** | monsters + a BOSS occupy WILD estates (decision 8) | ❌ | ❌ | ✅★ | ❌ | ❌ | GUARD-only by definition: clear the guards, BOSS = the final guard |
| **UW/depth parcels** (UW1–3, HS2/3) | same geometry; Diminution charScale, biome volcanic/swamp/snow | ✅ | ✅ | ✅ | ✅ | ✅ | mode support unchanged — the deep changes PERCEPTION (decision 21), never the rules |

Cross with OCCUPANCY (who holds it) — the second axis that picks the mode at battle time:

| Occupancy state of the parcel | Attacked by an army → | Simultaneous neutral arrival → | Passing through → |
|---|---|---|---|
| **Unowned, empty** | no battle — walk-in/claim | **DOMINION** (both want it) or pass (gap 3) | no battle (gap 4: EVASIVE stance) |
| **Unowned, wild mobs/BOSS** | **GUARD** (kill all) | GUARD race — first to clear claims; survivors → scenario F | wilds may intercept (ambush TODO) |
| **Occupied, army garrison** | **SIEGE** (fortified type ⇒ castle SIEGE) | n/a (owner exists) | interception → DUEL |
| **Occupied, pets/towers only** | **GUARD** (pets KO + return, never lost) | n/a | pets don't pursue — pass unless HOSTILE |
| **Occupied, lone Master** | **OVERWHELM / hero-DUEL / FLEE** (decision 14) | n/a | Master's standing order decides |
| **Occupied town in no-war window** | ❌ battle refused | n/a | free passage |
| **Estate (any holder)** | **board battle** (LARGE+) or single (S/M) | board CLASH from any edges | estates are big — transit uses roads; interception per parcel crossed |

Reading the two tables together answers "which mode do I get": **map type sets the menu, occupancy
picks the dish, movement intent (gap 4) decides whether there's a meal at all.**
