# Battle end-state resolution ladder — no more stalemates (owner-locked 2026-07-11)

> Locks how a full-army battle ENDS when no base falls. Supersedes the old "hit the clock → TIE"
> dead-end (`docs/04` §7 non-decisive end). Canon addendum to `docs/04` §7d/§9 — pending the CF
> Overworld session folding these numbers into `docs/04` + `balance.json`. **Engine side is BUILT
> + deployed** (MOBA repo, Agent A).

## Why

Two ways a live battle used to never resolve: (a) one side gets wiped but the other never bothers to
kill the base; (b) both commanders rally their armies to opposite corners and simply **refuse to
engage** to grief the clock. Both used to end in a bare TIE. The ladder makes every battle decisive.

## The ladder — checked when NO core/base has been destroyed

**1. CAPTURE — the 100:1 rout (fires the MOMENT it's true, any time in the battle).**
One side's living FIELD army ≥ ⚙ `captureThreshold` **and** the other side has ≤ ⚙ `captureLoserMax`
left (field **+** reserve): the overwhelming force takes the ground; the losing Master is KO'd
(overwhelm, live Masters KO API). No base-kill, no waiting for the clock.
- ⚙ `captureThreshold = 100` (owner). ⚙ `captureLoserMax = 10` (owner default — so 100-vs-8 also
  captures rather than dragging on; 100-vs-20 does not).

**2. COMMANDER'S DUEL — the anti-stall tie-breaker (hard clock at ⚙ `duelTimeoutMin`).**
If the battle reaches the hard clock still undecided (the "both rally away and never fight" case),
the two Masters settle it 1v1 — **rating × bounded seeded swing**, always decisive when both sides
field a Master. Reuses the `docs/04` §7d duel core; v1 presentation = the Uncharted-Waters auto-duel
animation in the command view (CF-side, pending).
- ⚙ `duelTimeoutMin = 30` (owner 2026-07-11 — was 20; sits inside canon's existing 25–35 LIVE
  timeout band, `docs/04` §3a). The ~20→30 window is the 10-min stalemate grace before the forced
  duel. **Revisit if 30 min feels long in playtest — it's a one-dial change.**
- ⚙ `duelSwingPct = 0.25` (±25% luck around the rating share).
- Engine rating (v1, self-contained): Master level·10 + kills·5 + hp% + a capped army-remnant term,
  so the duel isn't blind to who was winning the field. **NFT fame/rating is NOT in the engine
  context yet** — when CF passes it in the allocate context, it replaces the level proxy.

**3. TRUE DRAW — near-never.** Only if a duel is impossible (a side has no living/revivable Master
at the clock). One-sided → the side with a Master wins; neither → TIE (attacker's §7 re-assault
choice). With commanders present this is unreachable.

## Wire (engine → overworld, FROZEN)

The match `end` event and the R10 callback `outcome` now carry a `resolution` object on a laddered
ending (absent on a plain core-kill win):

```
resolution: { winner: 0|1, reason: 'CAPTURE'|'DUEL'|'DRAW',
              detail: { field?, loser? } | { ratingA?, ratingB?, roll? } }
```
CF reads `outcome.resolution` to present it: a **CAPTURE** banner ("the line is overrun") or the
**DUEL** auto-animation (rating bars + the seeded exchange) before showing the winner.

## Status

- **BUILT + TESTED (MOBA repo, Agent A):** `server/cf/resolve.js` (capture/duel/ladder, seeded,
  deterministic — no `Math.random`/`world.rng`), wired into BOTH the accelerated path
  (`headless.js runBattle`) and the LIVE path (`net/match.js` — capture each ~1s, duel at the hard
  clock), surfaced on the `end` event + R10 callback. +19 tests (`cfresolve.test.js`); full suite
  green incl. golden-master (non-CF battles untouched → still 45-min TIE ceiling).
- **PENDING (CF Overworld session):** fold `captureThreshold`/`captureLoserMax`/`duelTimeoutMin`/
  `duelSwingPct` into `balance.json` + `docs/04` §7d/§9; render the CAPTURE banner + DUEL auto-duel
  animation in the command view from `outcome.resolution`; optionally pass real Master NFT rating in
  the allocate context to replace the level proxy.
