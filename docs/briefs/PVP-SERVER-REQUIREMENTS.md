# Clash Front × PVP Match Server — the one-page brief + requirements

> **Audience:** the EF browser-MOBA / PVP server team (game-engine + headless sessions).
> **Read this cold — it is self-contained.** Deep dives: `M1-HEADLESS-BATTLES.md` (implementation
> milestone), `TELEMETRY-RELAY.md` (smoke-test wire contract), canon repo `docs/04-battle-system.md`.
>
> **Prime directive: ONE ENGINE, TWO PRODUCTS.** The PVP server keeps serving the normal MOBA
> game mode unchanged. Every Clash Front capability below is ADDITIVE and activates only when a
> match is allocated with a Clash Front battle context. A match started the normal way must play
> exactly as today.

## 1. What Clash Front is (60 seconds)

Clash Front is a persistent grand-strategy war game (Romance of the Three Kingdoms × EVE ×
Clash of Clans) running on the hexagon-city NFT land map — ~293k parcels, one shared world.
Players raise armies of PentaPet soldiers led by Masters (owned/rented character NFTs), march
them across the overworld, and fight over parcels, estates, and a circular CT economy.

**Every battle is a FULL MOBA match on your engine** (20–40 min at live pacing) — never a stat
formula. The overworld tick engine decides *that* a battle happens and with *what* forces; the
PVP server decides *who wins*. Two ways a human touches a battle:

- **COMMAND MODE** — a lightweight top-down 2D viewer (already built, in the overworld web
  client): watch live + issue high-level orders (move Master / focus target / rally point).
- **HERO MODE** — your full 3D MOBA client on the same match: the player embodies ONE Master
  or Hero (Kai/Irene/Leah) and fights at hero level.

AI-vs-AI battles (the overwhelming majority) run the SAME simulation headless and accelerated
(PVE especially — headless is our tamper-proof arbiter).

## 2. The battle shape (what a Clash Front match looks like)

- **The ATTACKER is the wave side**: their army stock feeds the minion-wave system from a
  minimal command-center camp (spawn anchor, no towers). Attacker loses when waves + Master
  revives are exhausted, or the CC camp dies.
- **Structures belong to the land holder**: WILD parcel = towers + mob camps, no CC (attacker
  wins by clearing mobs or killing towers); player parcel = defender CC + towers + limited
  build spots + hired troops; estate = walls, defense rings, 3 lanes, city buildings.
- Default 1 lane; lane count is battlefield data.
- The battlefield is the parcel's own designed map: bounds polygon (square is fine for the
  smoke test) + obstacles + spawn zones + structure anchors, delivered as JSON at allocation.
- Non-decisive end (food clock / timeout) = **TIE** — report it; the overworld handles
  re-assault/reinforce/retreat.

## 3. Requirements — what the PVP server must RETURN or SUPPORT

Legend for the last column — impact on the normal MOBA mode:
**NONE** = pure addition, dormant in normal matches · **PARAM** = existing system gains a
per-match parameter (normal matches use today's defaults) · **BOTH WIN** = also improves the
regular MOBA (anticheat/replay).

| # | Capability | What it must do | Regular MOBA impact |
|---|-----------|-----------------|---------------------|
| R1 | **Allocate API** | `POST /internal/v1/matches/allocate` — battle context in (seed, battlefield JSON, armies as unit stacks, officers + revive budgets, provisions, mode live/accelerated, tick+snapshot rates, callbackUrl), `{matchId, joinDeadline}` out. Idempotency-Key = battleId. | NONE |
| R2 | **Deterministic sim, external seed** | We supply the seed; kill all `Date.now()`/`Math.random()` seeding in sim. Same seed + same input journal ⇒ bit-identical outcome. | BOTH WIN |
| R3 | **Battlefield from data** | Map = the allocate payload's battlefield JSON (bounds polygon, obstacles, spawn zones, lanes, structure anchors with incoming HP). Normal-MOBA maps become just built-in battlefield assets. | PARAM |
| R4 | **Finite wave stock** | Minion waves draw from the attacker's army stock (per UnitClass) and EXHAUST; wave quality/durability scales with the CC camp's gold+wood tier. Normal matches keep infinite minions. | PARAM |
| R5 | **Land-holder structures** | Towers/CC/walls/mob camps instantiated from battlefield data with persistent HP; limited build spots; wild maps have mobs+towers and no defender CC. | PARAM |
| R6 | **Master KO/revive budget** | Officers ride the hero-slot model with a per-match revive budget (from the overworld); KO state reported at end. Normal respawn rules untouched. | PARAM |
| R7 | **Hero seats, one per USER** | Many users per match (2v2/3v3+, allies on either side); each embodies exactly ONE Master/Hero. Keep the existing wild-Master walk-up take-command mechanic as the possession flow. The client may forever assume one-player-one-hero. | NONE |
| R8 | **Mid-match reinforcement** | `POST /internal/v1/matches/{id}/reinforce` `{side, officer, unitStacks, provisions, entryEdge}`: the Master spawns at the arena edge matching the overworld approach direction and immediately auto-attacks (existing wild-Master AI); the army becomes a **new spawning point acting as a NEW LANE pathing directly to the enemy main base** — never an instant unit dump. Symmetric for both sides. | NONE |
| R9 | **Command channel** | Spectator-grade snapshot stream at 2–4 Hz (`{id, kind, team, x, z, hp, maxHp}` entities + structures + spawn points/lanes + clock/score/wave counter/revives left) + command inputs (move officer / focus / rally), validated server-side. **409-reject a user's commands while that user holds a hero seat** (mutual exclusivity). | NONE |
| R10 | **Result callback** | On match end, `POST callbackUrl` (HMAC-signed, retry-until-ack, idempotent by battleId): winner ATTACKER/DEFENDER/**TIE** + reason enum; **casualties AND survivors** per side per UnitClass; structure damage per anchor (remaining HP/destroyed); per-Master outcome (alive/KO, revives used) + **RAW uncapped contribution stats** (we apply the 20% hero-impact cap, never you); provisions consumed/looted; duration, tickCount, actual tick rate. | NONE |
| R11 | **Tamper-proof report fields** | Include the input-journal hash + final-state checksum in the callback (and expose the journal on request), so any match — especially a client-hosted one — can be re-run on the headless runner and verified by hash comparison. Client-hosted results are proposals until headless-verified. | BOTH WIN |
| R12 | **Headless runner** | `runBattle(context) → report`: synchronous fast-forward of the SAME `step()` sim (no timers/sockets/rendering — the goldenmaster pattern), bot brains for all heroes, checkpoint emission. Used for AI-vs-AI resolution AND for R11 verification replays. | BOTH WIN |
| R13 | **Rates as params** | Tick rate (30 Hz live / unclamped headless) and snapshot rates are per-match parameters; report actuals in the callback. | PARAM |
| R14 | **Battle clock** | Carried food = the battle clock; expiry without a decisive kill ⇒ TIE. Normal matches simply don't set it. | PARAM |

## 4. What the PVP server does NOT need to do

The match server is a **pure function: context in → report out.** All of this stays on the
overworld side — do not build it:

- Economy math (CT splits, burn, loot settlement, pillage).
- The `HERO_IMPACT_MAX` 20% cap on hero contribution (report raw numbers).
- Retreat / re-assault / reinforce-decision logic after a TIE.
- World persistence, land ownership, army movement, fog of war.

## 5. Delivery order

1. **M1 — headless battles** (`M1-HEADLESS-BATTLES.md`): R1–R6, R8, R10–R13 as a script-proven
   loop (allocate → headless run → callback), zero client work.
2. **M1.5 — smoke test** (`TELEMETRY-RELAY.md`): square 240×240 arena inside a hexagon parcel,
   live telemetry relayed to Command Mode (R9 subset). A client-mode match is acceptable here;
   the overworld ships a mock emitter + bridge you can push snapshots to and poll commands from.
3. **M2+** — per `docs/reports/REPURPOSING-PLAN.md` (hero-client drop-in on real battlefields,
   estates, multi-lane).

**Canon constants:** 1 engine unit = 1 m; single parcel arena ≈ 240×240 m; live tick 30 Hz;
command snapshots 2–4 Hz; TIE is a first-class outcome.
