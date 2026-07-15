# Reinforcement lanes — the QUEUE model (owner direction 2026-07-14)

> **To: CF Overworld eco (sim), EF Moba (netcode/allocate), MOBA BattleEngine RAW (client UX).**
> Owner decision-in-progress: how reinforcements join a running battle. Three options were weighed;
> the QUEUE model is recommended and spec'd here. Composes with canon decision 11 (arriving Master
> = new edge spawn + NEW LANE, never a unit dump) and decision 15/16 (live capacity is scarce).

## The three options considered

| Option | Rule | Verdict |
|---|---|---|
| A. Lane lock | one army per lane; same-direction latecomer gets "lane occupied" prompt, must pick another edge | ✅ folded in as the PROMPT (see UX below) — but alone it wastes the same-direction arrival |
| B. Unlimited masters per lane | 5 heroes × 16 soldiers each = 100s of concurrent soldiers | ❌ overload: breaks the engine's per-lane balance ceiling AND the 30Hz live-capacity economics (decision 15) |
| C. **Soldier QUEUE** | lane soldier cap NEVER exceeds 16 live; extra armies EXTEND the supply; heroes join immediately | ✅ **RECOMMENDED** — reinforcement becomes DURATION, not DENSITY |

## The rules (spec)

1. **One lane per edge.** The map's per-edge entries (`entry_e*`, guaranteed on EVERY real edge of
   every parcel — hard rule, GEN_VERSION 4) are the lane mounts. The first army arriving from an
   edge OPENS that lane.
2. **Same-edge reinforcement ⇒ queue.** A second army from an already-occupied edge appends its
   soldiers to that lane's spawn queue: concurrent lane soldiers never exceed **16**; the queue
   drains as the lane's wave cadence consumes it. One army ≈ **25 min** of soldier supply ⇒ 5
   armies on one lane ≈ **125 min** of sustained push (owner's approximation — the numbers are ⚙,
   the shape is the spec).
3. **Heroes/Masters join immediately** — a hero never waits in the soldier queue and doesn't count
   against the 16 (one-hero-per-USER rule and champion-draft entry unchanged, decision 11). Multiple
   Masters may stack on one lane; their soldiers queue.
4. **New-edge reinforcement ⇒ new lane** (decision 11 verbatim): spawn point at the matching edge,
   pathing directly to the enemy main base.
5. **The prompt (Option A's contribution):** when a player reinforces toward a battle whose
   approach edge already has an active lane, the client shows *"⚔ another army holds this lane —
   QUEUE here (extends the push ~+25 min) or approach from another edge (opens a new lane)"*.
   Arrival direction becomes a real strategic choice — the interesting dynamic the owner wants.
6. **Concurrency bound (why this is safe):** concurrent soldiers ≤ 16 × #edges (4 on squares,
   up to ~8 on polygon parcels) ≈ 64–128 — engine-scale, vs Option B's unbounded 100s. Live 30Hz
   capacity stays governed by decisions 15/16 (command slots/pool), untouched.

## What each side owns

- **Map side (CF ParcelMap, DONE):** per-edge entries on every parcel + clear edge→center paths —
  nothing new needed; `spawnZones[]` in the A1/manifest already name every mount.
- **CF Overworld eco (sim) — DONE 2026-07-15.** March arrival at a locked hex now offers
  reinforcement instead of silent wait (scenario H upgraded, `docs/maps/BATTLE-SCENARIO-MATRIX.md`):
  same-side arrivals are appended to `state.reinforcementQueue.get(battleId)` (per-battle, per-edge
  bookkeeping), a `reinforcement_offered` event is emitted (PRIVATE to the reinforcing governor —
  matches `battle_joinable` visibility), and `POST /api/reinforcement/withdraw {battleId, armyId}`
  cancels the entry. Queue survives snapshot round-trip; battle settlement drops the whole queue;
  `orderMarch` on a queued army auto-withdraws it. Sim-side bookkeeping ONLY — the actual soldier
  drain into a live match is the match-server's job (below). ⚙ knobs added:
  `wildBattle.lane.soldierCapLive` (16), `wildBattle.lane.armySupplyMin` (25).
- **EF Moba (netcode):** allocate/reinforce API — decision 11's D1b reinforce call gains
  `{edge, queue:true|newLane}`; addSeat for the hero unchanged.
- **MOBA BattleEngine RAW (client):** the lane-occupied prompt + queue meter on the lane HUD
  (supply minutes remaining), spawn pacing already exists (wave cadence).

## Open ⚙ for the owner

- Exact `soldierCapLive` per lane (16 = current MOBA standard) and whether EPIC estate boards raise
  it per component.
- Does queue order = arrival order strictly, or can the lane owner reorder/merge?
- Can a queued army WITHDRAW (leave the queue, retreat off the edge it queued on) before its
  soldiers commit? (Recommended yes — mirrors command-queue cancellability, decision 16c.)
