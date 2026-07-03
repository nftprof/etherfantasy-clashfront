# Map Generator & Design Registry — mission brief (MOBA game-engine session)

> For the MOBA **game-engine dev** session (map/terrain side) — NOT the match-server session
> (which owns allocate/callback per `ALLOCATE-CALLBACK-SCHEMA.md`). Shared contract: the
> Battlefield JSON below serializes into the allocate request's `battlefield` field.
> Canon sources: `docs/04-battle-system.md` §7b (parcel map design layer, scale laws,
> reinforcement arrivals), `docs/05` §9, `docs/08` (schemas).

MISSION: the system that gives every parcel in a 292k-parcel persistent world its own unique,
AI-designed battlefield — the claim to fame: **Persistent AI-Generated Civilization MMO**.

## Core model: two layers, never mixed

- **LAYER 1 — TERRAFORM (generated & persisted):** terrain, water, cliffs, forests, rocks,
  resource nodes (gold mines, wood groves), landmarks, and BUILD SPOTS (anchors where
  structures MAY stand) + SPAWN ZONES + LANE corridors. NO buildings/towers/CC ever baked in.
- **LAYER 2 — GAME-TIME FURNITURE (instantiated at match start from the battle context):**
  WILD → defender towers + mob camps on anchors, no CC; PVP player parcel → defender CC +
  towers on anchors, attacker minimal CC camp at spawn edge; ESTATE → walls/rings/3 lanes
  (later). The design provides ANCHORS; the battle context decides what stands on them.

## Canon constraints (locked)

1. 1 engine unit = 1 m; SINGLE parcel arena ≈ 240×240 m; bounds = parcel polygon normalized
   (square fallback acceptable during M1.5).
2. Deterministic v0: `seed = f(parcelId, biome, zoneType)`; no Math.random/Date.now — all
   randomness from the seeded RNG. Same seed ⇒ byte-identical artifact.
3. Designs are persistent versioned server-side artifacts: seed → v0, AI gardener iterates +
   SAVES; landowner can FREEZE the AI (owner = WC2-style designer). Occupiers only ADD
   structures on anchors.
4. Default 1 lane; `laneCount` is a design param (estates 3).
5. **Every hexagon edge must remain enterable**: reinforcements arrive mid-battle at the edge
   matching their overworld approach and open a NEW LANE pathing directly to the enemy main
   base — no design may wall off an edge.

## Deliverables

- **D1 Design registry** — list of all maps + status. Server-side store keyed by parcelId:
  `{parcelId, designVersion, status: UNDESIGNED|SEED_V0|AI_ITERATED|OWNER_FROZEN, seed,
  biome, sizeClass, laneCount, lastGeneratedAt, thumbnailPath}` + manifest API
  (`GET /internal/v1/designs?status=…`, `GET /internal/v1/designs/:parcelId`,
  `POST …/regenerate`). Parcel facts (id, polygon, zone, kind) come from the overworld world
  snapshot (this repo: `data/demo-world.json` shape; live: `GET /api/world`). LAZY: generate
  on first request, persist forever; never pre-generate 292k.
- **D2 Battlefield JSON** — one schema for generator/sim/renderer:
  `{arena:{shape,bounds,sizeM}, laneCount, terrain, obstacles[], resources[{kind:'GOLD_MINE'|
  'WOOD_GROVE',x,z,richness}], buildSpots[{anchorId,x,z,size}], spawnZones[], lanes[[…]],
  meta:{seed,designVersion,biome}}`.
- **D3 Terraform generator v0** — deterministic, TEMPLATE-FIRST for speed: biome palette ×
  terrain archetype (river-crossing, box canyon, forest maze, cliff terraces, open steppe,
  marsh causeways, ridge passes…) × hand-authored PREFAB CLUSTERS stamped/jittered/rotated →
  constraint pass. Target <100 ms/map server-side.
- **D4 Playability validator + auto-repair** — after ANY generation: every spawn edge has a
  min-width corridor to the base area; lanes pathable; build spots reachable; resources not
  inside obstacles; base clear radius. Violation ⇒ repair (carve/remove) ⇒ re-validate. This
  gate is what makes AI/prompt generation safe.
- **D5 Game-time assembly** — loader takes (saved design + battle context) → match map:
  stamp Layer-2 furniture per map kind. Artifacts stored PREPROCESSED (baked
  navgrid/walkability, prefab instance lists) so match start = data-load + instancing only.
- **D6 AI designer** — one entry point `designMap(parcelId, directive)`, two modes:
  (a) GARDENER: offline job mutates touched parcels a little each pass, bumps version, saves;
  (b) OWNER PROMPT: free text → LLM translates to GENERATOR PARAMETERS (JSON — never raw
  geometry) → generate → D4 validate → save + thumbnail. Determinism + playability stay
  guaranteed; make the parameter space expressive enough for wild prompts.
- **D7 Thumbnails** — each saved design renders a small top-down PNG (the overworld textures
  parcels with these); path recorded in the registry.

## Variation (make it amazing)

Seed picks archetype × biome palette × 1–3 landmark features (ancient bridge, standing
stones, crater lake, shipwreck…) × resource layout × asymmetry profile. PVP fairness =
rotational symmetry of LANES+SPAWNS+RESOURCES only; decoration stays asymmetric. Neighboring
parcels share a biome palette (regional coherence) but differ in archetype. Rarity: ~1 in 50
maps rolls a spectacular landmark.

## Definition of done

Script: 20 parcelIds+polygons → registry fills, 20 distinct valid battlefields in <2 s total,
thumbnails rendered, one owner-prompt example passes validation, same seed twice ⇒
byte-identical artifact. Unit tests: validator + determinism.
