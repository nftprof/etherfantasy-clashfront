# HERO-vs-HERO DUEL — implementation spec (Uncharted-Waters-style 1v1)

> **For: CF (builds v1 now) + EF Moba / MOBA BattleEngine RAW (the LATER live version only).**
> Consolidates the design that was scattered across canon: `docs/04` §7d (lone occupations),
> decision 14 (CLAUDE.md), the element-free ruling (`docs/maps/MASTERS-ELEMENT-FREE-RULING.md`), and the
> MVP hero-duel hook.
>
> **v1 (ships now) = a CARD DUEL owned entirely by CF** (owner-locked 2026-07-10): rating + Named
> artifacts set the odds, it **auto-resolves** so offline Masters are handled, and an online player gets
> to **pick their card each round** (timeout → NPC auto-picks). No engine work, no 3D. **Genuine
> skill-based live 1v1 on the battle engine is a DEFERRED, separate version** (§3) with its own future
> ruling — do not build the old "choreograph a live match to a pre-rolled winner" model; it's retired.

## 1. When a duel happens

A **lone Master holds land without an army** and a hostile Master walks on. Either side may call a
**1v1 DUEL** (vs the alternatives OVERWHELM / FLEE, `docs/04` §7d). Because defenders are usually
**offline**, every deployed Master carries an owner-set **standing order**: `DUEL | FLEE | STAND`. A
duel resolves **immediately** against the standing order — no one need be online. **Duels spare troops**
(that's the point: champions settle it, armies don't die).

## 2. THE RESOLUTION CORE — a CARD DUEL (owner-locked v1, 2026-07-10)

**v1 is a CARD game, NOT a skill fight.** Genuine skill-based live PVP is a **later version** (§3).
For now every duel **auto-resolves** through this deterministic core — so offline defenders are handled
and battles resolve instantly — but **a player who's online gets to pick their card each round**; if
they don't click in time, an **NPC auto-picks** for them. Either way the *odds* are set here.

Two things move the odds, nothing else: **the Master's rating** (a strong Master still matters) and
**equipped Named artifacts** (the wildcard — see §2c).

### 2a. Inputs
- `ratingA`, `ratingD` — each Master's **rating** = f(level, fame). **ELEMENT-FREE** — no element/type
  wheel (decision 14, LoL/AoV). Rating is the base power input.
- `artifactA`, `artifactD` — equipped **Named artifacts** (`data/singulars.json`); they add an
  **effective-rating bonus + a signature swing** (§2c). This is the *only* thing beyond rating that can
  flip a duel — "special equipment that boosts stats unexpectedly."
- `seed` — deterministic duel seed (from the battle context, never `Date.now()`). Same inputs ⇒ same
  result forever (replay-safe). **When a human picks cards live, their picks replace the NPC picks for
  those rounds; the tie-break RNG stays seeded.**

### 2b. Best-of-3 CARDS (the Uncharted-Waters exchange)
Three rounds (first to 2). Each round both sides play a **card** — a rock-paper-scissors:

```
  AGGRESSIVE  beats  TRICK        (the all-out attack blows through the feint)
  TRICK       beats  DEFENSIVE    (the feint bypasses the guard)
  DEFENSIVE   beats  AGGRESSIVE   (the guard turns the all-out attack)
```

- **Card clash decides the round** (RPS winner takes it).
- **Tie (same card) → higher effective rating** wins, with a seeded ±25% swing so the underdog can steal
  it (⚙ `duel.ratingSwing`).
- **Who plays each card:**
  - **Online human** → the card THEY pick within a ⚙ `duel.pickWindowSec` (≈8–12 s) timer.
  - **Timeout or offline** → **NPC auto-pick**, biased by effective rating: a stronger Master reads the
    RPS-winning card more often (⚙ `duel.npcReadWeight`, e.g. 0.5 + effRatingShare·0.4). A weaker one is
    more random. So even the auto path makes **rating matter**, and a whale rarely loses to a rookie.
- Tune so a clear favourite wins ~70–85%, an even match ~50%; an artifact can lift an underdog into
  coin-flip or better.

**Reference resolver (CF ships it in the sim; the engine imports the SAME code/numbers or calls CF, so
online and auto never disagree):**
```
function resolveDuel(A, D, seed, humanPicks /* {round: card} | {} */):
  rng = mulberry32(seed)                 // server/sim/rng.js — shared primitive
  effA = A.rating * artifactMult(A);  effD = D.rating * artifactMult(D)   // §2c
  share = effA / (effA + effD)
  winsA = winsD = 0
  for round in 1..3:
    cA = humanPicks[round] ?? npcPick(rng, share)          // human overrides NPC
    cD = humanPicks_D[round] ?? npcPick(rng, 1-share)
    r = clash(cA, cD, rng, share)                          // RPS; tie→rating±swing; +artifact procs §2c
    if r=='A' winsA++ else winsD++
    if winsA==2 or winsD==2: break
  return { winner, rounds:[{cA,cD,by}], artifactProcs:[…] }   // rounds[] drives the card animation
```
`rounds[]` is the replay script: the card UI reveals it beat-by-beat (played cards + who won + any
artifact proc), so the whole duel is watchable in the war report even when both sides were offline.

### 2c. Named artifacts — the wildcard (owner: "boosts stats unexpectedly")
An equipped Named artifact (`data/singulars.json artifacts[]`) is the one thing beyond rating that
sways a duel — and it should feel like a **surprise**, not a stat bar:
- **Effective-rating bonus:** `artifactMult` = 1 + ⚙ `duel.artifactRatingBonus` per equipped artifact
  (≈ +15–25%). Enough to lift an even match or an underdog — a rookie with *Dawnbreaker* can upset a
  veteran, which is exactly the "unexpected" the owner wants (and the reason the vault-granted artifacts
  are coveted).
- **Signature proc (optional, per artifact ⚙):** a seeded chance each round for the artifact's own
  effect — e.g. *the Aegis of Empyrea* forces a DEFENSIVE win, *Dawnbreaker* auto-wins one AGGRESSIVE
  clash, *the Blood Scimitar* wins the deciding round on a tie. Flavor now, a hook for later; keep it
  bounded so rating still dominates over many duels.
- Surfaced in the war report ("**⚔ Dawnbreaker flared — round taken**") so the loser *sees* what beat
  them and covets the artifact. Provenance (decision 19) means everyone knows who holds it.

## 3. TWO VERSIONS (v1 ships now; skill-PVP is later)

The owner's ruling (2026-07-10): **"for first version it's not skill based. just card basis… we can add
real live PVP duel out later this way we can auto resolve battle for now."** So the two rows below are
**different versions, not two skins of the same fight** — v1 is the card duel; the live skill match is a
genuinely different, later product.

| | **v1 — THE CARD DUEL (ships now, CF)** | **LATER — LIVE SKILL PVP (battle engine, separate ruling)** |
|---|---|---|
| What | the §2 card best-of-3; **rating + artifacts** set the odds | a real tiny-arena 1v1 on the 3D engine, `TEAM_SIZE=1` (`net/matchmaker.js`) |
| Skill | **none** — it's a card game; outcome is `resolveDuel()` | **genuine** — the players actually fight; the arena decides |
| Player involvement | if online, **you pick your card each round** (§2b) within `duel.pickWindowSec`; timeout → NPC auto-picks. So an online player is *involved*, but it's a choice-of-card, not mechanical skill | both **⚡ doorways light**; embody your Master and win by playing |
| Offline | YES — resolves offline-vs-offline against standing orders; NPC picks both sides | AI stand-in for an absent side (its own future ruling on odds) |
| Presentation | the `rounds[]` script drives a **card-reveal UI** — played cards + who won + any artifact proc, beat by beat; fully **replayable in the war report** | live 3D match, watchable/joinable |
| Auto-resolve | **YES — this is the point.** Every duel settles instantly with no one online | no — someone must actually play (or an AI stands in) |

**v1 is auto-resolvable and offline-safe by design** — that's why it's card-based: the async overworld
needs every duel to settle the instant a Master walks on, whether or not a human is watching. The online
player's card-pick is a *bonus involvement layer* on top of an outcome the math already governs (rating +
artifacts), **not** a skill test.

**The live skill-PVP version is explicitly deferred and NOT specced here.** When the owner greenlights it,
it gets its own ruling — including whether it keeps card-parity odds or becomes truly skill-decided. Do
**not** build a "choreographed-to-a-pre-rolled-winner" live match: that idea is retired. v1 = the card UI;
real fighting = later, on its own terms.

## 4. INTEGRATION (what wires where)

1. **Trigger** — CF detects a lone-Master walk-on, reads the defender's standing order. `DUEL` (or an
   attacker calling it) → CF calls `resolveDuel()` with both ratings + artifacts + the battle seed.
2. **Card path (v1, ships now)** — CF resolves entirely in-sim: `resolveDuel()` returns the winner +
   `rounds[]`. If a participant is **online**, CF surfaces the card-pick UI (a `duel.pickWindowSec` timer
   per round); their picks feed back into the resolve; on timeout the NPC pick stands. The `rounds[]`
   script drives the card-reveal animation in the war report — **no engine allocate call, no arena, no
   3D**. Fully offline-safe.
3. **Live skill match (later, separate ruling)** — deferred; when greenlit it would request an engine
   micro-match via **allocate** (`ALLOCATE-CALLBACK-SCHEMA.md`, `mode:"duel"`, `teamSize:1`, DUEL-template
   arena) and both ⚡ doorways — but its odds model is an **open owner ruling**, not "choreograph to the
   card result." Not built in v1.
5. **Settlement** — winner holds/takes the ground; **loser KO'd via the LIVE Masters KO API**
   (`POST api.etherfantasy.com/api/gameplay/masters/result` → `koUntil`/`revivesRemaining`, `docs/09`
   §7). Same KO path as any Master death.
6. **FLEE** (if that's the standing order) — a rating-based escape roll (⚙ ~70–90%); a **failed flee =
   caught ⇒ forced duel at a penalty** (so lone Masters aren't unkillable scouts). No engine work.
7. **Seed discipline** — the duel seed comes from the battle context (deterministic); never `Date.now()`.
   `resolveDuel()` runs in the CF sim (`server/sim/rng.js` mulberry32); if the later live version is
   built, its engine seeding must be overridden the same way (`BATTLE-ENGINE-DISCOVERY` §3.1).

## 5. Engine capabilities already present (relevant to the LATER live version)
*(v1 the card duel needs none of this — it's pure CF sim. Listed for when the live skill match is built.)*
- **`TEAM_SIZE=1` is the default** — 1v1 matches already run (`net/matchmaker.js:24-50`).
- **DRAFT/champion-select exists** (`net/match.js`) — the duel seats each Master as its champion.
- **mulberry32 seeded RNG** in `server/sim/rng.js` — the SAME primitive CF uses for `resolveDuel()`.
- **DUEL map mode** is defined in the template library (2 opposed bases, tiny bounds) — the arena.

## 6. ⚙ dials (CF `balance.json`, add a `duel` block)
**v1 (card duel):** `ratingSwing` (±25% tie swing) · `npcReadWeight` (how hard rating biases the NPC's
card pick, e.g. `0.5 + effRatingShare·0.4`) · `pickWindowSec` (8–12 s per-round human pick timer) ·
`artifactRatingBonus` (+0.15–0.25 effective-rating per equipped Named artifact, §2c) · `flee.baseOdds`
(70–90%) · `flee.caughtPenalty`.
**Later (live version):** `micromatch.durationSec` (120–180) · `micromatch.arenaTemplate` — reserved,
not wired in v1.

## 7. Open (owner)
- ✅ **RESOLVED 2026-07-10 — v1 is card-based, not skill-based** (owner: *"for first version it's not
  skill based. just card basis, but strong master still matter… auto resolve battle for now. if player
  is playing they can select their card… if they don't click in time, auto select by NPC. only thing
  that can influence winning is if one master is equipped with special equipment i.e. Named artifacts."*).
  So: rating dominates, online players pick a card (timeout → NPC), Named artifacts are the wildcard, and
  everything auto-resolves. **Genuinely skill-decided live PVP is a deferred, separate version** (§3).
- Later-version odds model (card-parity vs truly skill-decided) — decide when the live version is greenlit.
- Exact `npcReadWeight` / `artifactRatingBonus` / flee numbers; whether a lone Master also passively holds
  yield like a homestead pet.
