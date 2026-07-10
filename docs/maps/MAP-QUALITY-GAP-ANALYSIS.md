# Map Quality Gap Analysis — LLM → ship-quality command + playable map, for ALL maps

> **Map-maker session, 2026-07-08.** The owner's verdict on the generated maps: *"none of them seem
> playable"* — correct. This doc is the honest ledger: the **benchmark** (the MOBA single-player map, our
> only playable map, now delivered as a complete per-map set), the **pipeline stages** from LLM params to a
> final command map + playable map at that detail, and the **gap + owner per stage**. Companion:
> `MAP-PIPELINE-GLOSSARY.md` (terms), `MAP-MODES.md` (battle scenarios every map must support).

## 0. The benchmark — MOBA-SINGLEPLAYER, the complete deliverable set (DONE)

The one playable map, reverse-engineered from the real client, now exists in **all five deliverable
forms** in `data/moba-maps/` — the template every future map must ship as:

| # | Deliverable | File | Status |
|---|---|---|---|
| A | **raster artifact** (source: terrain grid + entities) | `MOBA-SINGLEPLAYER.artifact.json` | ✅ (161×161 grid, 3 lanes, 12 towers+2 cores, 14 nodes, 4 camps) |
| B | **command map** (A1 vector) | `MOBA-SINGLEPLAYER.command.json` (derived A→B by the converter) + `moba-singleplayer.json` (hand-built from the client, authoritative) | ✅ **both PASS all 5 CF invariants** |
| C | **render manifest** (heightfield/scatter) | — | ⚠ engine team's `battlefield_converter.cjs` (not in CF scope) |
| D | **CF thumbnail** | `MOBA-SINGLEPLAYER.thumb.png` | ✅ (shows the real lane-ring + mid structure) |
| E | **playable map** | the live canon arena in the game client/engine | ✅ (it IS the game) |

Deriving B from A surfaced a real converter bug, now fixed: jungle resource/mob nodes were swallowed by
obstacle outlines → the converter now **carves a connect-channel + clearing** around every node (they must
be reachable to be harvested/fought). All map-service suites green after the fix.

## 1. The target, stated plainly

**Every parcel map must reach MOBA-single-player detail:** a real lane network, jungle fill with
deliberate corridors/chokes, tower chains along lanes, symmetric bases with cores, camps + resource pockets
— **plus** the CF superset the MOBA map never needed: per-edge entries, the center objective, build spots,
biome character, and the invest-tier budget. And every map must support **all battle scenarios**
(`MAP-MODES.md`): Versus · Siege · Dominion · Guard · Duel · Clash — which is a *data* requirement (the
anchor superset: `atk_S`, `def_base`, `entry_e*` per edge, `center`) already emitted by the generator and
**preserved as an invariant** through the quality upgrade.

## 2. The pipeline, stage by stage — status + gap + owner

```
 LLM params → generator → artifact A → converter → command B → engine ingest → PLAYABLE
     ①            ②           ③            ④            ⑤             ⑥             ⑦
```

| # | Stage | What exists | **The gap** | Owner |
|---|---|---|---|---|
| ① | **LLM design params** (archetype/palette/features DSL) | schema + clamp + curriculum brief (`MAP-GENERATOR-LLM-CURRICULUM.md`); 48-template library | LLM loop not run in production; params today come from the seed roll | Map-maker |
| ② | **Generator** (params → artifact) | deterministic, budget-capped, anchors/modes/biome-palette correct | **THE QUALITY GAP**: archetype painters scatter sparse blobs — output is an empty field with a thin lane, not a battlefield. **Fix in progress (parallel agent): dense-fill-then-carve rewrite benchmarked against the MOBA artifact** — real 3-lane network, 35–55% jungle, tower chains, mirrored bases | Map-maker |
| ③ | **Artifact A** (raster, source of truth) | schema FROZEN (`ARTIFACT-SCHEMA.md`), real samples committed, sim-ingestible (`terrain.walk`) | none structurally — content quality comes from ② | Map-maker |
| ④ | **Converter A→B** | §3 converter + node-connectivity fix; validated | none — proven on the real MOBA artifact today | Map-maker |
| ⑤ | **Command map B** (2D command view) | data-driven renderer ships; B passes 5 invariants | labels + mode-toggle legend (spec'd in `MAP-MODES.md` §4, not built) | CF overworld (in-game) / Map-maker (designer) |
| ⑥ | **Engine ingest** (sim builds world from A) | engine change LANDED: accepts full artifact or `{ref:{parcelId}}`; rejects partial shapes safely | **CF's allocate still sends the minimal battlefield** (bounds+spawns, no grid) → engine falls back to canon arena. Fix: send the raster A or `{ref:parcelId}` (`ARTIFACT-SCHEMA.md` §4) | CF overworld + network/engine |
| ⑦ | **Playable** (3D client renders A) | canon arena playable today; client loader specced (`CLIENT-BATTLEFIELD-LOADER-INPUTS.md`) | client not yet data-driven from the artifact (`CLIENT_BATTLEFIELD_LOADER`); render.json schema unpublished (engine team) | OP 48 + engine team |

## 3. What "done" looks like per map (the definition of ship-quality)

A parcel map is **ship-quality** when:
1. **Visual parity**: its thumbnail is structurally comparable to `MOBA-SINGLEPLAYER.thumb.png` — visible
   lane network, jungle mass with corridors, tower chains, two bases (not an empty field).
2. **Scenario superset**: all MAP-MODES anchors present + each edge entry has a guaranteed route to center.
3. **Validity**: passes the CF 5-invariant validator AND the artifact's `walk` grid agrees with the B
   vector (converter parity test).
4. **Biome truth**: palette + fill flavour match the declared biome (desert never green).
5. **Budget honesty**: content counts within the invest-tier budget.
6. **End-to-end**: the engine ingests its A (⑥) and the client renders it (⑦) — the same ground in
   command view and 3D. Until ⑥/⑦ land, battles run on the canon arena (correct interim per the MVP path).

## 4. Sequencing (what unblocks what)

- **Now (this session):** ② quality rewrite (agent, running) → regenerate all committed samples → visual
  proof vs the benchmark. ①'s LLM loop rides on ② (params only matter once the painter is good).
- **Next (other sessions):** ⑥ CF allocate sends A/`{ref}` (small change, spec ready) → authored maps
  actually play; ⑦ OP 48 builds the client loader (inputs answered); C render.json (engine team).
- **Ongoing:** per-continent authored macro terrain feeds ② with real envelopes (roads→lanes etc.).
