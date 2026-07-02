# 02 — Battle Hosting & Persistent Map Content

> Directive (product owner, 2026-07-02): host persistent content for **all** maps; run **10–20
> battles at any time**. Battles **no player will ever arrive at** run **ACCELERATED** (faster
> than real time, headless). Any battle **a player could join** must run **REAL-TIME**, because
> players can join mid-game and take command — the MOBA already allows joining as an NPC
> mid-match, and that possession model is the join path (battle-engine plan E1).

This refines `docs/04` §3 (ResolutionMode) and `docs/07` — it does not replace them.

## 1. The one classification that matters: CAN a human arrive?

At `LOBBY` open (and re-checked while RUNNING), classify each `BattleInstance`:

```
joinable(b) ⇔ ∃ player p: eligible(p, b)            // docs/04 §4 eligibility (owner, governor,
              ∧ reachable(p, b)                     //   mercenary, landlord-defender)
              ∧ online-or-notifiable(p)             // connected, or push-notified within lobby window
```

- `joinable = false` → **ACCELERATED pool**: headless, no sockets, deterministic seeded
  fast-forward (`World.seed + battle.id`), finishes within one world tick, emits a replay.
  NPC-vs-NPC and monster battles — the vast majority at 95% NPC launch — live here. This is how
  "the world fights 24/7" stays nearly free.
- `joinable = true` → **REAL-TIME pool**: a live 30 Hz authoritative instance with sockets open,
  all heroes AI-driven until someone drops in (possession; disconnect reverts to AI). It runs in
  real time even with ZERO humans connected, because a human may arrive at any moment.
- Transitions: a REAL-TIME battle whose last eligible player disqualifies (retreated, offline past
  the reinforce window) may be **demoted**: checkpoint → finish ACCELERATED. Promotion
  (ACCELERATED → REAL-TIME) does not exist — never start a battle accelerated if a join is
  possible. Reinforce-window close (docs/04 §2) is the natural demotion point.

## 2. Capacity & pools

| Pool | Target | Cost profile |
|---|---|---|
| REAL-TIME | **10–20 concurrent** (config `REALTIME_BATTLE_SLOTS`, per battle host node) | one 30 Hz sim + sockets each; the scarce resource |
| ACCELERATED | effectively unbounded (CPU-bound batch) | a 25-min battle ≈ 45,000 steps ≈ sub-second at MOBA scale; queue on N worker processes |

- Allocator (docs/04 §3) reserves a REAL-TIME slot speculatively at LOBBY; **if the pool is full,
  the battle falls back to ACCELERATED** (canon: never block the world). High-stakes battles
  (CAPITAL/FORTRESS sieges) get slot priority.
- Scaling = add battle host nodes (each brings `REALTIME_BATTLE_SLOTS` more). Region-pin hosts
  near their overworld shard.
- Army-scale perf is the open bet (battle-engine plan C1 benchmark). 10–20 real-time slots per
  node is conservative-safe at MOBA entity counts; revisit after the C1 spike.

## 3. Persistent content for all maps

Everything a battlefield needs is either **derivable** (cheap, cache) or **player-made** (small,
authoritative):

| Content | Source of truth | Persistence |
|---|---|---|
| Battlefield terrain per parcel | pure function `generate(seed = f(parcelId, terrain, zoneType, development, structures), generatorVersion)` | **Lazy cache** (canon `docs/04` §7b): object store / PG keyed `(parcelId, generatorVersion)`; materialized on first player visit; safe to evict — regeneration is deterministic |
| Player base layout (CoC layer) | `StructureState[]` with `anchor` on the Territory (`docs/08`) | Postgres (authoritative overworld state) — tiny per parcel |
| Pets assigned / garrison / development | Territory + Pet records | Postgres + hot Redis (docs/07 §4) |
| Estate set pieces (castles/walls) | hand-authored battlefield JSON | versioned files in repo/CDN |
| Battle replays & results | ACCELERATED/LIVE emit | object store (replays), PG (results/ledger) |
| Live battle state | the battle host instance | checkpoint every N s → resume/finish-accelerated on crash (docs/04 §6) |

Key consequence: "persistent content for all maps" costs ~KBs per **touched** parcel and zero for
untouched ones (lazy battlefield + rewilding are both computed-on-observation, `docs/01` §11.2).

## 4. Where this runs (deployment shape)

```
[Overworld sim shard]  --allocate-->  [Battle Allocator]
   (tick engine,                          |
    Redis+PG, docs/07)     +--------------+---------------+
                           v                              v
                 [REAL-TIME battle hosts]        [ACCELERATED workers]
                 10–20 slots/node, 30 Hz,        headless queue, seeded
                 WS join via battle ticket        fast-forward, replays
                           \                              /
                            +---- result callback (HMAC, docs/09 §5) ----> overworld applies
                                                                            BattleResult
```

- MVP (July 7): ALL battles resolve in-process in the overworld tick via WarScore math — no pools.
  The pool architecture arrives with battle-engine milestone M1 (headless runner = the
  ACCELERATED worker) and M3 (real-time hosts with drop-in).
- The MOBA repo's repurposing plan items map 1:1: D1 allocate, D3 headless runner (ACCELERATED
  worker), D2 result callback, E1/E2 possession & reinforce (REAL-TIME pool).
