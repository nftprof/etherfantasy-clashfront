# Map deliverables roadmap — from "all zone fields" to CF-complete

> **Agent D (CF ParcelMap Design), 2026-07-11.** The owner's question: once all zone fields are done,
> what remains to complete the CF main game's map assets — while keeping an interoperable layer so the
> 3D battle scenes and EF Hunt's hand-built ICONIC DESTINATIONS are the same places, sharing assets.

## A. Where we are (field status)

**8 of 12 zone fields built** (EDU, HUB, BUS, ENT, CGI, KOL + UW2, UW3 — all byte-stable, castled,
hero-parceled, singular-pinned). **Remaining fields:** UW1 Ironhold (the army descent's first level +
the Midas-veins singular) and the three sky isles HS1–3 (Aeropolis / Emberfall / Empyrea — city/era
references locked in CONTINUOUS-WORLD-TERRAIN §3b; the sky half of the Hunt pet-travel late game).

## B. The build order to CF-complete (map-side)

1. **UW1 + HS1–3 fields** — closes the 12/12 atlas; places the deferred singulars (midas_veins,
   sky_sanctum, gateway_dock); completes the descent chain (Shaft → UW1 → UW2 → UW3) and the airship
   tier. ~1 build each, same pattern as the last eight.
2. **THE 20K BASE-TERRAIN BAKE** — the single biggest CF deliverable: bulk-generate every playable
   parcel's base map into the map-service registry so no player ever hits a stand-in. **Blocked on
   the §1 sign-offs from Agents A + B** (frame/grid/obstacle authority — `MAP-MAKER-HANDOFF-RECAP.md`);
   the generator, fields, invariants, and determinism are all ready. After the bake, lazy per-visit
   generation only covers cache misses + designVersion bumps.
3. **The aerial-mosaic thumbnail manifest** — world-registered parcel thumbs tiling into the overworld
   texture (canon decision 10: parcel thumbnails texture the CF overworld; the estate command-view
   board of decision 18 is the same mosaic zoomed). Deliverable: a manifest + tile pipeline the CF
   client and the map lobby both read.
4. **Stage ⑥ closure (with the integration session):** CF's allocate sends the raster A (or
   `{ref: parcelId}`) so live engine battles fight on the REAL parcel map instead of the canon arena
   fallback — the last gap in the LLM→playable ledger (`MAP-QUALITY-GAP-ANALYSIS.md` ⑥/⑦).
5. **Seed-content queue (owner/event-gated):** famous dev-towns (`data/famous-towns.json` when the
   owner picks), World-Remembers monuments/graveyards (when C's events flow), remaining singular pins
   (with #1), BRIDGE designer vocabulary + per-landmass water validator exception (river canon),
   residual axis-aligned archetype-band orientation polish.
6. **Landowner design loop (post-bake):** invest tiers already vary content; the WC2-editor freeze +
   economy Hooks 2/3 are CF-session scope — map-side owes only the designVersion pipeline, which
   exists.

## C. The INTEROP LAYER — one scene, three consumers (PROPOSED contract, owner to lock)

The principle that already holds: **the artifact is gameplay truth; art is a skin.** Every 3D consumer
(the MOBA battle client, EF Hunt, a future anime previz) renders the SAME artifact — terrain grid,
entities, structures, overlay décor — so the *place* is identical everywhere. Two additions make
hand-built iconic destinations first-class:

1. **`data/asset-bindings.json` (shared mesh vocabulary):** kind+biome → model ref (glTF/asset id) —
   TREE/ROCK per biome family, `castle_*` structure pieces, RUIN types, overlay kinds (QUEST_SITE,
   CAMP, MOORING…), vessels (boat/ship/airship per §5c of the Hunt handoff). Hunt's existing rendered
   3D elements become the FIRST bindings — the MOBA client adopts the same table, so both games pull
   one asset library. Owned jointly by the two client teams; the map layer just guarantees the kinds.
2. **`sceneRef` (the iconic-destination hook):** a parcel (or estate map) may carry
   `sceneRef: "<asset-package-id>"` — a HAND-BUILT 3D scene package that *replaces or dresses* the
   procedural render of that parcel in any 3D client. Rules that keep it interoperable:
   - The **artifact stays authoritative for collision/walkability** — the hand-built scene must
     conform to the walk grid (author the scene OVER the exported artifact; a validator can diff
     scene floor vs `walk`). CF battles then fight *inside* the iconic scene with zero sim changes.
   - `sceneRef` lives where maps live: on the map-service design record (+ mirrored in the committed
     A/B forms for flagships), set via the overlay/PR flow. The owner's hand-built destinations
     (Carnavale midway, the Stair, the Bastion, the Vault stage…) each become one `sceneRef` package.
   - No `sceneRef` ⇒ procedural render from asset-bindings, as today. Iconic where it matters,
     generated everywhere else — the Cyberpunk model.

**Where the owner's time goes furthest:** the hero-parcel/POI list is the natural iconic-destination
shortlist — castle parcels, the palace estate maps, the Stair mouths, the Vault stage, the midway.
Every one is already a fixed, named, validated place with a committed map; `sceneRef` turns each into
an art destination without touching gameplay data.

## D. Suggested sequence

UW1+HS fields (1) and the bake sign-offs (2) can run in parallel this week; the mosaic manifest (3)
follows the bake naturally (thumbs are a bake by-product); stage ⑥ (4) is a small integration-session
task unblockable today; the interop contract (C) needs only the owner's LOCK + the two client teams'
nod on asset-bindings ownership before Hunt starts building iconic scenes.
