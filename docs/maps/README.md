# Maps session deliverables (mirrors + quick reference)

> From the **EF v2 CF Moba (map maker) (F5)** session. Canonical repo:
> `github.com/blockchainsuperheroes/etherfantasy-browser-moba-game` (main, `server/maps/*`) —
> not reachable from CF sessions, hence these mirrors + the live box copies at
> `/home/ubuntu/ef-moba-server/maps/` on 13.250.39.41 (the box CF runs on).

## Docs here
- **ECONOMY-SEAM.md** — the three CF↔maps hooks: ownership feed, invest flow, payout note.
- **LAND-VALUE-AND-IMPROVEMENT.md** — PROPOSAL (for owner review): the land-layer economic model —
  how a landowner spends/burns CT to raise a parcel/estate's investment tier and unlock more resource
  tiles, strategic ground, defenses, and (estates only) castle grades; the improvement menu, value
  realization, guardrails, and open questions. Grounded in `INVEST_TIERS` + ECONOMY-SEAM + net-sink canon.
- **BATTLE-MAP-TEMPLATE-LIBRARY.md** — 24 open-field battlefield templates (real game maps +
  historical battlefields), the archetype taxonomy, A1-schema methodology, and the NEW
  battlefield-archetype appendix. Design input to expand the generator from 7 → ~48 archetypes.
- **CASTLE-TEMPLATE-LIBRARY.md** — 24 castle/fortification siege templates (real forts worldwide),
  each mapped to the estate "series of ±161 components, keep = final component" model, plus the NEW
  castle-archetype appendix (prioritizes a shared `wall()` primitive).
- **CONTINENT-TERRAIN-ATLAS.md** — the macro-terrain constitution of all 10 zones (BUS/EDU/ENT/HUB
  surface · HS1–3 sky · UW1–3 underworld), grounded in the real extracted geometry (worldOffset,
  bboxes, parcel counts): per-continent biomes/palettes, ranges/coasts/rivers, frontier edges, and
  seaport/airship/shaft/boss hotspots. The authored-override seed for `world-terrain.json`.
- **../briefs/MAP-MACRO-TERRAIN-AND-POSITION-CONSTRAINTS.md** — the world envelope (biome field +
  position-role + edge-type system) each parcel map is designed inside.
- **../briefs/MAP-GENERATOR-LLM-CURRICULUM.md** — the fitness function + repair loop + difficulty
  ladder that challenges the LLM to design playable, novel maps within that envelope.
- **MAP-LAYER-MODEL.md** — PROPOSAL: a map = a stack of toggleable OVERLAYS (pathing, entry points,
  build spots, resources, wild masters, walkability, ground texture…), each = an A1 array, each
  LLM-designable per-layer, each tier-limited; plus the ≥1-entry-per-edge invariant. The designer-UI
  + per-layer-LLM spec.
- **BIOME-RECRUITMENT-AND-ARMY.md** — PROPOSAL: biome-gated recruitment (element↔biome → which
  soldier/worker classes recruit on a map) feeding the persistent army.

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
