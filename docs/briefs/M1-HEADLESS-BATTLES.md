# M1 — Headless Battles (battle-engine milestone 1)

> For a session scoped to **`nftprof/etherfantasy-clashfront`**, branch
> **`claude/browser-moba-clashfont-gmiy7p`** (verbatim browser-moba snapshot + battle-engine
> context). Read that repo's CLAUDE.md + docs/reports/{BATTLE-ENGINE-DISCOVERY,REPURPOSING-PLAN}.md
> first — M1 = plan items **B1 + A1 + D1 + D3 + D2 (+F)**. This brief adds the canon locked
> AFTER those reports were written.

## Canon updates the plan must absorb (2026-07-02, v0.2 answers)

1. **Every battle is a FULL MOBA match** — real server-run game, target 20–40 min at live
   pacing, armies on BOTH sides. AI-vs-AI battles run the SAME simulation with **accelerated
   ticks** (fast-forward loop — this is exactly the D3 headless runner; there is no separate
   "statistical resolver" in the end-state).
2. **Armies = PentaPet units + officers.** Rank-and-file soldiers are PentaPet unit types by
   species affinity (Earth→heavy infantry, Wind→cavalry/scout, Fire→siege, Water→marine,
   Grass→supply/medic, Electric→arcane support). For M1: map the overworld's UnitClass enum
   (INFANTRY/ARCHER/CAVALRY/SPEAR/SIEGE) onto species-flavored unit archetypes in the battle
   context — stats/data-driven, visuals later. Units are EXPENDABLE (no identity persistence).
   Officers (Masters/Hero) ride the existing hero-slot model (bot-driven in headless).
3. **Battlefield = the parcel's designed map.** Bounds polygon = the parcel's actual shape
   normalized to the 240×240 m arena (1 unit = 1 m, locked). Terrain content will eventually be
   a SAVED design artifact (AI-designed/landowner-designed, delivered as data); for M1 accept a
   `battlefield` JSON in the allocate request (bounds polygon + obstacle/terrain list + spawn
   zones) and also ship a seeded placeholder generator behind the same schema (A1).
4. **Battle logistics** (docs/04 §7c in the canon repo): the battle context includes each side's
   carried food (battle clock), gold+wood (attacker command-center tier), and structures with
   incoming HP. Timer expiry without a decisive core kill = TIE → report it; the overworld
   handles retreats.
5. `BATTLE_TICK_MS` canon conflict: resolved in favor of the engine — 30 Hz live; headless may
   run unclamped. Report actual tick rate in the result payload.

## M1 deliverables (from the repurposing plan, unchanged in shape)

- **B1**: strip MOBA furniture behind a mode flag (lanes/waves/towers/cores/shop/draft) with
  pluggable win conditions (FIELD: rout/annihilation/timeout; core-structure kill).
- **A1**: `Battlefield` JSON schema (bounds polygon, obstacles, terrain costs, spawn zones,
  structure anchors) consumed by sim + (later) renderer; placeholder seeded generator.
- **D1**: `POST /internal/v1/matches/allocate` — battle context in (armies as unit stacks +
  provisions + structures + battlefield + seed + callbackUrl), `{efMobaMatchId, joinDeadline}` out.
  Idempotency-Key = battleId. Seed from context (kill Date.now() seeding).
- **D3**: headless runner — `runBattle(context) → report`, synchronous fast-forward of the same
  `step()` sim (golden-master pattern), bot brains for all heroes, checkpoint emission.
- **D2**: result callback POST to callbackUrl — winner/TIE, casualties per army, structure
  damage, hero contributions (raw, uncapped — the overworld applies HERO_IMPACT_MAX), duration,
  HMAC-signed (grow the loot-ticket pattern), retry until ack.
- **F**: tick/snapshot rates as per-match params.

## Definition of done

A script in that repo: build context (two armies from the canon UnitClass mapping, a parcel
polygon battlefield, provisions) → allocate → headless run → callback received by a local stub →
deterministic across runs with same seed → unit tests green. Zero client work. Then the
overworld's tick engine (this repo) swaps its WarScore placeholder for the allocate+callback
loop behind a feature flag (`BATTLE_ENGINE_URL` env) — integration ticket for the core session.
