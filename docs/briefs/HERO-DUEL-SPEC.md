# HERO-vs-HERO DUEL — implementation spec (Uncharted-Waters-style 1v1)

> **For: EF Moba (network/engine) + MOBA BattleEngine RAW (client) — you're building this now.**
> Consolidates the design that was scattered across canon: `docs/04` §7d (lone occupations),
> decision 14 (CLAUDE.md), the element-free ruling (`docs/maps/MASTERS-ELEMENT-FREE-RULING.md`), and the
> MVP hero-duel hook. **CF owns the deterministic resolution core + the overworld auto-duel viewer; the
> engine owns the live 1v1 micro-match presentation.** Both MUST share one odds core so the outcome is
> identical whichever way it's shown.

## 1. When a duel happens

A **lone Master holds land without an army** and a hostile Master walks on. Either side may call a
**1v1 DUEL** (vs the alternatives OVERWHELM / FLEE, `docs/04` §7d). Because defenders are usually
**offline**, every deployed Master carries an owner-set **standing order**: `DUEL | FLEE | STAND`. A
duel resolves **immediately** against the standing order — no one need be online. **Duels spare troops**
(that's the point: champions settle it, armies don't die).

## 2. THE RESOLUTION CORE (deterministic — identical for auto AND live)

**This is the single source of truth for who wins.** The animation (auto) or the micro-match (live) is
*presentation over this core* — the engine must not let live play diverge from these odds (AI stand-ins
and hit-rate weighting enforce it).

### 2a. Inputs
- `ratingA`, `ratingD` — each Master's **rating** = f(level, fame, gear). **ELEMENT-FREE**: no element,
  no type wheel — Masters are LoL/AoV champions (decision 14). Rating is the *only* power input.
- `seed` — the duel seed (deterministic; from the battle context, never `Date.now()`). Same seed +
  same ratings ⇒ same result, forever (replay-safe).

### 2b. Best-of-3 stance exchange (the Uncharted-Waters mechanic)
Three rounds (first to 2 wins). Each round both duelists throw a **stance** — a rock-paper-scissors:

```
  AGGRESSIVE  beats  TRICK        (the all-out attack blows through the feint)
  TRICK       beats  DEFENSIVE    (the feint bypasses the guard)
  DEFENSIVE   beats  AGGRESSIVE   (the guard turns the all-out attack)
```

- **Stance clash decides the round** — the RPS winner takes it.
- **On a TIE (same stance)**, the round goes to the **higher rating**, with a seeded ±25% swing so the
  underdog can still steal it (this is the ⚙ `duel.ratingSwing` bounded-chance).
- **Rating also biases stance selection for AI/offline duelists**: a stronger Master picks the
  RPS-winning stance more often (⚙ `duel.aiReadWeight`, e.g. weight = 0.5 + rating-share·0.4), so higher
  rating wins **more** duels without being deterministic. A weaker Master's stance is more random.
- **Win probability lands around** rating-share ± the swing (roughly the docs' "rating-based" intent);
  tune `ratingSwing`/`aiReadWeight` so a clear favourite wins ~70–85%, an even match ~50%.

**Reference resolver (CF ships this in the sim; the engine imports the SAME numbers or calls CF):**
```
function resolveDuel(ratingA, ratingD, seed):
  rng = mulberry32(seed)            // same primitive the engine already has (server/sim/rng.js)
  winsA = winsD = 0
  share = ratingA / (ratingA + ratingD)
  for round in 1..3:
    sA = pickStance(rng, share)     // favourite reads better
    sD = pickStance(rng, 1-share)
    if beats(sA,sD): winsA++
    elif beats(sD,sA): winsD++
    else:                            // tie → rating + bounded swing
      p = clamp(share + (rng()-0.5)*duel.ratingSwing, 0.05, 0.95)
      if rng() < p: winsA++ else winsD++
    if winsA==2 or winsD==2: break
  return { winner: winsA>winsD ? A : D, rounds:[…stances,outcomes] }   // rounds[] drives BOTH views
```
The returned **`rounds[]`** (each round's two stances + who won) is the shared script: the auto-duel
animates it beat-by-beat; the live micro-match seeds its AI stand-ins / round pacing from it.

## 3. TWO PRESENTATIONS (same core, different skins)

| | **v1 — AUTO-DUEL (CF, overworld viewer)** | **M2+ — LIVE 1v1 (battle engine)** |
|---|---|---|
| Where | the `#battle` overlay / a small duel panel in the CF client | the real 3D engine, `TEAM_SIZE=1` (already supported — `net/matchmaker.js`) |
| Length | a short animated exchange (~10–20 s), the 3 stance beats | a tiny-arena micro-match, **2–3 min** |
| Control | none — plays the `rounds[]` script; replayable | both players' **⚡ doorways light**; they can embody and fight |
| Offline | YES — resolves offline-vs-offline against standing orders | AI stand-in plays for an absent side, **held to the same odds** |
| Odds | the §2 core | **the §2 core is authoritative** — the live fight is choreographed toward the pre-rolled winner (AI stand-ins + damage weighting), so a duel can never pay out different odds than the auto version |

**Critical engine rule:** the live micro-match is a *presentation* of a pre-decided outcome, not a free
sandbox — otherwise offline duels (auto) and online duels (live) would have different odds for the same
matchup, and the async game breaks. The winner is `resolveDuel()`; the engine makes it *look* earned.
*(If the owner ever wants live duels to be genuinely skill-decided, that's a separate ruling — flag it;
today the spec is "same odds, whichever presentation.")*

## 4. INTEGRATION (what wires where)

1. **Trigger** — CF detects a lone-Master walk-on, reads the defender's standing order. `DUEL` (or an
   attacker calling it) → CF calls `resolveDuel()` with both ratings + the battle seed.
2. **Live path (M2+)** — CF requests an engine micro-match via the existing **allocate** flow
   (`ALLOCATE-CALLBACK-SCHEMA.md`) with `mode:"duel"`, `teamSize:1`, the two `masterId`s, the arena =
   a **tiny DUEL-template battlefield** (`BATTLE-MAP-TEMPLATE-LIBRARY.md` DUEL mode, small bounds), and
   the **pre-rolled `rounds[]`/winner** so the engine choreographs to it. Both ⚡ doorways issued.
3. **Settlement** — winner holds/takes the ground; **loser KO'd via the LIVE Masters KO API**
   (`POST api.etherfantasy.com/api/gameplay/masters/result` → `koUntil`/`revivesRemaining`, `docs/09`
   §7). Same KO path as any Master death.
4. **FLEE** (if that's the standing order) — a rating-based escape roll (⚙ ~70–90%); a **failed flee =
   caught ⇒ forced duel at a penalty** (so lone Masters aren't unkillable scouts). No engine work.
5. **Seed discipline** — the duel seed comes from the battle context (deterministic); the engine's
   `Date.now()^id` seeding must be overridden for duels (same injectable-seed need as accelerated
   battles, `BATTLE-ENGINE-DISCOVERY` §3.1).

## 5. Engine capabilities already present (good news)
- **`TEAM_SIZE=1` is the default** — 1v1 matches already run (`net/matchmaker.js:24-50`).
- **DRAFT/champion-select exists** (`net/match.js`) — the duel seats each Master as its champion.
- **mulberry32 seeded RNG** in `server/sim/rng.js` — use it for `resolveDuel()` so CF + engine match.
- **DUEL map mode** is defined in the template library (2 opposed bases, tiny bounds) — the arena.

## 6. ⚙ dials (CF `balance.json`, add a `duel` block)
`ratingSwing` (±25% tie swing) · `aiReadWeight` (how hard rating biases stance) · `flee.baseOdds`
(70–90%) · `flee.caughtPenalty` · `micromatch.durationSec` (120–180) · `micromatch.arenaTemplate`.

## 7. Open (owner)
- Duel-stance UI depth: **pickable stances** in the live match (player throws aggressive/defensive/trick
  each round) vs **pure auto** even when live. (Current spec: live is choreographed to the core; pickable
  stances would be the "genuinely skill-decided" variant — owner's call.)
- Exact flee odds/penalty numbers; whether a lone Master also passively holds yield like a homestead pet.
