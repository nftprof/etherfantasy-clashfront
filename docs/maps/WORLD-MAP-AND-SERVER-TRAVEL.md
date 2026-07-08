# World map, continent↔server mapping, and cross-continent travel

> **CF Overworld design, 2026-07-08 (owner directives).** Captures three things: (1) the **continent =
> shard = regional server** model and the owner's **starting-continent-per-server** mapping; (2) **⚠ a
> conflict with the published `data/zone-registry.json` server column** that the world-planning session must
> reconcile; (3) the spec for a **single 3D fog-of-war world map** with **server-porting travel**. Evolves
> canon decision 12 (geo zone-server mapping, `docs/07` §4.4) and `CONTINUOUS-WORLD-TERRAIN.md` (the aerial
> world view).

## 1. The model — one world, continents are shards, each served by ONE regional server

- **There is ONE world map** (no realm duplication — decision 12). It is partitioned into **continents**
  (the 12 zones). **Each continent is served by exactly one regional server**; a server may host several
  continents, but a given continent lives on a single server (latency locality — a continent's battles run
  on its server).
- **A player's starting server = where they begin.** You start on the continent that fronts your regional
  server, and you physically **travel** (below) to reach continents on other servers.

## 2. Servers → starting continents (owner-authoritative, 2026-07-08)

**Three launch servers**, each with its onboarding continent:

| Server (city) | Starting continent | zoneId | Status |
|---|---|---|---|
| **Singapore** | **Porthaven** | BUS | most Singapore players start here |
| **Tokyo / Japan** | **Arcadia** | EDU | **the current map**; the Japan server is **being added soon** |
| **Montréal** | **Mythoria** | ENT | Montréal players start here |

So the surface continents are **distributed across three city servers**, each an onboarding front door.
(Which server hosts the remaining continents — HUB/Tianxia, the sky HS1–3, the underworld UW1–3, and the
prestige isles — still needs assignment; §4.)

## 3. ✅ APPLIED to `data/zone-registry.json` (owner-approved 2026-07-08)

The registry `server` column has been **updated** per the owner mapping: **BUS→`sg`**, **EDU→`jp`** (new
Tokyo/Japan server, coming soon), ENT stays `ca`; a `startContinent:true` flag was added to the three
onboarding continents, and a `_meta.servers` block now documents the three city servers. `WORLD-ZONE-
DETAIL.md`'s Svr column was synced too. Original conflict (kept for the record):

| Continent | Registry `server` (current) | Owner directive (2026-07-08) | Action |
|---|---|---|---|
| **BUS / Porthaven** | `ca` (Montréal) | **Singapore** (`sg`) | **change → `sg`** |
| **EDU / Arcadia** | `ca` (Montréal) | **Tokyo/Japan** (new `jp`) | **add `jp` server → `jp`** |
| **ENT / Mythoria** | `ca` (Montréal) | Montréal (`ca`) | ✅ already correct |
| HS1–3, UW1–3 | `sg` (Singapore) | (unstated — likely stays `sg`) | confirm |
| HUB / Tianxia | `ca` | (unstated) | assign |

**Root cause:** the registry assigned servers **by tier** (all surface → Montréal, all sky+UW → Singapore).
The owner's model instead gives **each city server its own onboarding surface continent** (Singapore→
Porthaven, Tokyo→Arcadia, Montréal→Mythoria), so surface is **split across servers**, not all-Montréal.
Also: launch is now **three servers** (adds **Tokyo/Japan**), not the two (Montréal + Singapore) in decision
12. **World-planning session:** please update the `server` field per §2 and add the `jp` server; introduce a
`startContinent` flag per server. Server assignment does **not** block the base-terrain run (it's a shard/
hosting attribute, not geometry) — but the launch/login routing needs it right.

## 4. Cross-continent travel = server porting (owner, 2026-07-08)

Moving between continents is **moving between servers** (an inter-shard handoff), gated physically + by fee:

- **Ports are the travel nodes.** To leave your continent you go to a **port** (near the coast/edge), then
  **pay a fee** to **port to another continent** — which transfers you to that continent's server.
- **Not free teleport** — you must reach the port and pay; it's a deliberate, priced action (a **CT sink**,
  decision-17-aligned; ⚙ `travelFeeCt`). Distance/tier can scale the fee.
- **You keep your starting server as home**; travel is round-trippable via ports. (Whether armies/holdings
  move with you or stay resident on the home continent = an open sub-question, §6.)
- This realizes decision 12's "cross-zone = inter-shard handoff" as a **concrete, player-driven, paid port
  action**, not an invisible seam.

## 5. The 3D fog-of-war WORLD MAP (new UX spec)

A single **rotatable 3D world view** the player opens to see the whole world at a glance:

- **3D, turntable.** The world renders in 3D and can be **rotated / orbited** ("turn-table it") so the
  player can see the **vertical tiers**: **surface continents in the middle**, **sky / floating islands
  above**, **underworld below**. (The registry already carries `worldOffset` + tier per continent — the
  geometry to place them in 3D.)
- **Fog of war — other continents are NOT fully shown.** Continents the player hasn't visited/doesn't hold
  are **obscured** (dimmed/clouded), revealed as they travel + scout. A **3D fog** (volumetric haze /
  cloud deck between tiers) reads naturally with the floating-island + underworld layering.
- **Legible labels.** The launch continents — **Mythoria, Arcadia, Porthaven** — are shown with **small
  notes** naming each + its **host city** (*"currently hosted in Montréal / Tokyo / Singapore"*). Other
  continents show as fogged silhouettes with minimal hints ("beyond the frontier", decision 12).
- **Ports marked** as the travel/porting nodes (§4) — click a port → the pay-to-port flow.
- **Relation to the flat overworld:** this is the **macro/strategic** view (choose where in the world to
  go); the existing 2D parcel overworld is the **continent-local** view. The world map is the zoomed-out
  3D shell above it. (Ties to `CONTINUOUS-WORLD-TERRAIN.md`'s "aerial mosaic" — this is its 3D, fogged,
  multi-tier form.)

**Build note:** this is a **client/UX feature**, not a base-terrain concern — it does **not** gate the 20K
run. It needs: the registry `worldOffset`/tier/`server` per continent (mostly present, pending §3), a
per-player **visited/fog** state, and port nodes. Scope it after the base maps + the launch server routing.

## 6. Open sub-questions (owner / world-planning)
- **Full continent→server table** — assign HUB + sky + underworld + prestige isles to servers (§2 covers
  only the three onboarding continents).
- **Do holdings/armies travel with the player or stay resident** on the home continent when they port?
- **Travel-fee schedule** (`travelFeeCt`) — flat, or scale by tier/distance? Round-trip discount?
- **Fog granularity** — per-continent reveal, or finer (per-region within a visited continent)?
- **Registry update owner** — world-planning session to correct the `server` column + add the `jp` server
  (§3) and a `startContinent` flag.
