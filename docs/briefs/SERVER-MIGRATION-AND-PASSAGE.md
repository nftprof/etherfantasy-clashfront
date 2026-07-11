# Server Migration & Passage — the brief

> One-pager for all sessions. Distills the owner-locked travel rules (2026-07-08 → 2026-07-10).
> Full design: `docs/maps/WORLD-MAP-AND-SERVER-TRAVEL.md` §2/§4/§4a. Dials: `balance.json → travel`.

## 1. The model in one line

**Moving continent = moving SERVER, entirely.** Continents are shards (decision 12); you cross between
them only at a **port**, for a fee, with **your whole force** — and getting *to* the port crosses other
players' land, which is where **pass / trespass fees** come in.

## 2. Boarding — the two travel fees (at the port)

| Step | Fee (⚙) | What it is |
|---|---|---|
| **① Reserve a dock** | `dockReserveFeeCt` = **1 CT** | books your embarkation slot at the port |
| **② Cross (server move)** | `continentTravelFeeCt` = **3 CT** | the actual continent/server migration |

- **Port types by tier:** Sea Port (surface) · Airship Port (sky) · Underworld Tunnel (underworld).
- **A port only does business when NO battle is active on its land.** Contested dock = closed.
- **Fee split** (`travelFeeSplit`): **land owner 35% · occupying warlord 35% · platform sink 30%**
  (the sink follows decision 17: ≥10% burns, rest to the vault). Modest, not criminal.
- On a dock land the march menu gains a third option:
  **March · March & Command · ⚓ Sea Port** (gather units for travel).

## 3. The migration rule — everyone goes, stragglers' soldiers desert

- **All your units must be on the map, and ALL move together.** Migration is total — no leaving a
  garrison behind, no partial move.
- **Masters ALWAYS come along** — every Master makes the crossing with you, no exceptions. But a Master
  **abandons every soldier it commands**: **all soldiers are left behind (DESERTED)**. A Master that
  can't physically make it to the port in time still crosses with you — it just **loses all its
  soldiers** in the process.
- Net: **you arrive on the new server with all your Masters and none of their armies.** Migration is a
  real strategic reset, not a free army relocation.
- **Where the deserted soldiers go — DISPERSED (owner 2026-07-10):** a deserted soldier is either
  **burned** (removed from the world — the sink share, ⚙ `migrateDesertBurnPct`) **or returns to the
  POPULACE of the land where it disperses** (it rejoins that parcel's local population pool as ordinary
  populace — mons are population, never destroyed as pets). Nobody inherits them as fighting units; they
  are drafted like any other populace from then on. Never a faucet.
- **Your starting server stays your home**; travel is round-trippable via ports.

## 4. Getting to the port — PASS fees (safe conduct) vs marching

Land in the way belongs to someone. Every landowner sets a **passage policy + fee** on their land:

| Policy | Meaning |
|---|---|
| **OPEN** | anyone may pass — **paying that land's pass fee** (⚙ `passFeeDefaultCt` = 1 CT, owner-tunable) |
| **ALLIES_ONLY** | only allies pass (allies = **PG-account friends**; until the friends system lands, behaves as CLOSED) |
| **CLOSED** | no passage — the only way through is to **march on it** (fight) |

- **Route cost = the SUM of every pass fee along the way.** Your own / empty unguarded land is free.
- **Fees go to the land owner** (a real toll income), minus the standard decision-17 rake.

### The anti-abuse rule: PASS is destination-locked
Pass is granted **only for direct travel to a PORT**. You commit to arriving there.
- **No diverting, halting, or attacking mid-route.** Break it → safe-conduct **VOID**: you're a
  **TRESPASSER** — the land you're on may engage you, and your paid fees are forfeit.
- So Pass is **a way OUT, never a stealth lane IN** — you can't "just pass through" to park an army deep
  in enemy territory.

## 5. GATEs — the same mechanic inside a continent

Where terrain (mountains/rivers) splits a continent into regions with no natural crossing, a designated
**GATE parcel** (mountain pass / bridge) is the only land route — and **its landlord controls passage
exactly like a port dock**: OPEN (toll, ⚙ `gateFeeDefaultCt` = 2 CT) / ALLIES_ONLY / CLOSED. A CLOSED
gate must be **captured by force**. The generator guarantees **≥1 gate per region boundary** (no region
unreachable) — a base-terrain bake item (`MAP-MAKER-HANDOFF-RECAP.md` §1.9).

## 6. Who starts where (the 4 servers, 2026-07-10)

| Server | IP | Starting zone |
|---|---|---|
| Singapore | 13.250.39.41 | Porthaven (BUS) |
| Tokyo | 18.178.54.54 | Arcadia (EDU) — the current map |
| US West | 54.151.57.111 | Mythoria NORTH (ENT·north) |
| Montréal | 3.98.68.96 | Mythoria SOUTH (ENT·south) |

**Tianxia (HUB) is NOT a starting zone** — it's the destination players migrate to; it may open as the
direct start for a future **Europe/MENA** server (timing monitored on user base). Prestige isles
(Olympus/Fortuna) are **teleport-only** — no port leads there.

## 7. Build status

- **BUILT:** the 🌐 world map (real landmass shapes, fog-of-war toggle, ports + routes, travel panel with
  fees/rules), the registry (`data/zone-registry.json`: servers+IPs, slices, start flags), all ⚙ dials.
- **PENDING:** the movement/toll sim (pass routing, per-land fee/policy, trespass flip, gate capture,
  desertion-on-migrate) and the actual **cross-server handoff** (lands with the multi-server rollout).
