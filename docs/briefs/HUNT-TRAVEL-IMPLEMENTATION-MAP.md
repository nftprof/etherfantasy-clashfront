# EF Hunt — where to implement the travel/Kraken canon (the data → gameplay map)

> **For the CF Hunt team.** Agent D (map) + Agent C (CF overworld) have made the whole travel system
> **data-driven** — the canon lives in `data/`, CF's overworld map RENDERS it, and Hunt IMPLEMENTS the
> gameplay of it. This doc says exactly which data each Hunt mechanic reads and where it goes in the
> Hunt game. **Nobody hardcodes routes — read the data, so the three surfaces never drift.**

## The pipeline (already built by Agent C — Hunt plugs into the same data)

```
data/zone-registry.json  zoneLinks.locked[]     (Agent D writes the canon)
data/world-elements/*.hunt.json  elements[]     (Hunt writes its own scene anchors)
data/world-terrain/<ZONE>.json                  (the continent fields)
        │  server projects zoneLinks → /api/world meta.zoneLinks (cached; restart to refresh)
        ▼
CF overworld world.js  → renders routes on the WORLD MAP  (Agent C — DONE)
EF Hunt              → implements TRAVEL GAMEPLAY in the maps (YOU — this doc)
```

Hunt reads the **same** three data sources; it does NOT re-invent routes. A new `KRAKEN_DRAG` or a
moved anchor appears in Hunt automatically on the next data pull — zero Hunt code change.

## Where each travel mechanic lives in the Hunt game

| Canon element | Data source (read this) | Hunt implements it in… |
|---|---|---|
| **Surface routes** (river-gates, sea lanes, airship ways HS1→HS2/HS3, the Stair, the Shaft) | `zoneLinks.locked[]` (+ `/api/world meta.zoneLinks`); full spec `docs/maps/OVERWORLD-CONNECTIONS.md` | Hunt's **world-travel / fast-travel graph** — the legal legs you can book |
| **The sea contracts (the BAIT)** — over-rewarded port-to-port quests, Act IV | `SEA_PORT` POIs in `data/world-terrain/*.json` (the dock anchors) | Hunt's **quest/contract system** + economy (the faucet); `HUNT-TRAVEL-SYSTEM §5b·1` |
| **🐙 The KRAKEN DRAG (the TAKING)** — ~3rd sea crossing, involuntary | `zoneLinks.locked[]` `kind:"KRAKEN_DRAG"` (`SEA→UW2`; `SKY→UW2 overSea`) | Hunt's **travel-event trigger**: on the seeded Nth crossing, fire the scripted drag → teleport the player to the Undertow anchor. `involuntary:true` = not a choice. `HUNT-TRAVEL §5b·2` |
| **The UNDERTOW landing episode** — loop-5 enemies, RUN | `data/world-elements/UW2.hunt.json` → `UW2-HUNT-UNDERTOW` @[158,27.5] (Blackmere far east) | Hunt's **UW2 far-east encounter zone** + its per-parcel map (map-service `/internal/v1/designs/<id>`). Tune enemies "loop-5 on loop-1"; correct move = flee. `§5b·2b` |
| **The SLUICE (one-way chute out)** | `UW2-HUNT-SLUICE` @[149,37] | Hunt's **one-way transition** → deposits near the Stair-foot exits. "It's dark, it's windy, it slides down — go down?" `§5b·2b` |
| **The TOLL HOME (the SINK)** — cost > sea profit (calibration law) | the two exits: `zoneLinks` Stair (`ENT↔UW2` foot) + the double-gate (`UW2-GATE-UW1` → the Shaft `HUB-SHAFT`) | Hunt's **economy/toll gate**: charge CT/items to leave, calibrated ABOVE the accumulated sea-contract profit (the Golden Rule as a lived event). `§5b·3 + the CALIBRATION LAW` |
| **🌋 Lava Kraken (Vault-Gate hazard)** — NOT a drag route | `zoneLinks` `UW2-GATE-UW3` carries `hazard:"lava_kraken"` (Agent C corrected: a gate hazard, not an edge) | Hunt's **UW2→UW3 crossing** — the molten-kraken encounter ON the Vault-Gate voyage; `HUNT-MAP-INTEGRATION-ANSWERS Q6` |
| **THE DIMINUTION** (you shrink in the deep) | `data/zone-registry.json _meta.charScale` (UW2 visual 1/1.5, UW3 1/6; kinematic dial) | Hunt's **character + camera scale per zone** — read charScale, scale model+camera, leave geometry/stats alone. `DIMINUTION-SCALE-SPEC.md` |
| **Fall variants** (SKY-over-land = death; cart tumble; rescue) | `HUNT-TRAVEL-SYSTEM §4/§5b·4` | Hunt's **travel-fail table** (death ladder vs drag vs damage) |

## The two ownership rules (so it never drifts)

1. **Routes/links are CANON — Agent D owns `zoneLinks`.** Hunt READS them (via `/api/world` or the
   registry file); Hunt never hardcodes a route. Want a new drag or a changed landing? Ask Agent D to
   edit `zoneLinks` — it flows to both CF's map and Hunt on the next pull.
2. **Scene anchors are Hunt's to author** — `data/world-elements/<ZONE>.hunt.json` (point elements:
   quest sites, camps, the Undertow/Sluice, dungeon doors). They materialize on CF's battle maps too
   (shared world). Commit them to the repo; they need no code change. Contract:
   `docs/briefs/WORLD-ELEMENTS-OVERLAY.md`.

## Start-here for Hunt

Read `EF-HUNT-MAP-HANDOFF.md` (the map entry point) → `HUNT-TRAVEL-SYSTEM.md` (your travel canon) →
this doc (the data wiring) → `HUNT-MAP-INTEGRATION-ANSWERS.md` (the 6 confirmed Q&A incl. the two
Krakens). The Undertow/Sluice anchors are already seeded in `UW2.hunt.json` for you to build against.
