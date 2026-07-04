# Maps session deliverables (mirrors + quick reference)

> From the **EF v2 CF Moba (map maker) (F5)** session. Canonical repo:
> `github.com/blockchainsuperheroes/etherfantasy-browser-moba-game` (main, `server/maps/*`) —
> not reachable from CF sessions, hence these mirrors + the live box copies at
> `/home/ubuntu/ef-moba-server/maps/` on 13.250.39.41 (the box CF runs on).

## Docs here
- **ECONOMY-SEAM.md** — the three CF↔maps hooks: ownership feed, invest flow, payout note.

## Live API quick-reference (moba.etherfantasy.com, lobby :8090 on the shared box)
- `GET  /internal/v1/designs[?status=]` · `GET /internal/v1/designs/:parcelId` (lazy v0; returns
  `{row, artifact, budget}`) · `GET …/thumb.png[?v=N]` — all public.
- `POST /internal/v1/designs/:parcelId/prompt|regenerate|freeze` — signed-in PG user
  (owner-enforced the moment the ownership feed exists) or `x-maps-key`.
- `POST /internal/v1/designs/:parcelId/invest {level:0..5}` — `x-maps-key` only (key file:
  `~/.ef_maps_key` on the box). CF charges the CT, then calls this.
- `GET /internal/v1/parcels` — world parcels ⊕ design status (feeds the /designer land map).
- Designer UI: https://moba.etherfantasy.com/designer

## Canon honoured
- Battlefield frame: fixed **±161 world-units (sizeM 322)**, center-origin, +z north; ~0.74 m/unit
  is a label, never a runtime transform. Estates = multiple ±161 components.
- Artifacts are Battlefield JSON (A1) verbatim: arena/lanes/obstacles/resources/buildSpots/
  spawnZones/structures/mobs + additive terrain grid & walkmask + meta(seed/budget).
- LLM emits parameters + a bounded features[] placement DSL — never geometry; budget-clamped,
  validator-gated, byte-identical per seed.
