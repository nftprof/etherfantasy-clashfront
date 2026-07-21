# Default-Design Bake — making a continent a COMPLETE game map

> **STATUS 2026-07-21: EDU BAKED ON THE BOX ✅** — run 29807148123 (map-bake.yml, ref deploy/map @
> c2971a2): 13,661/13,661 parcels, 0 fails, 29 min, 13,606 approved (99.6%), 6 forts (incl. the
> off-parcel-fixed Grand Academy PALACE), service restarted health-gated. Registry lives ONLY on the
> box (`~/ef-battlefields`) per the owner's "maps are server-state, never git" ruling; map-bake.yml
> is just the remote-control. **BUS (Porthaven) is next** — dispatch map-bake with zones=BUS after
> the owner's EDU playthrough (expect ~5× EDU: ~2.5 h at the observed O(n) index-write curve; the
> per-save whole-index rewrite is the known hot spot if we ever need it faster).

**Owner ask (2026-07-21):** "plan out the default for every single map on EDU so we have a complete
game map" + "also do it for porthaven (singapore)". Target continents: **EDU (Arcadia)** and
**BUS (Porthaven)**. NB: in the zone registry **EDU _is_ Arcadia** — I read "Acadian (japan)" as the
same EDU continent (its Montreal/Japan server side), not a third zone. Correct me if that's wrong.

## What "default" means

Today every parcel is designed **lazily** — the seed v0 battlefield is generated only on first visit
(`registry.ensureDesign`). "A complete game map" = run that exact same seed generation for **every**
parcel up front and persist it, so the whole continent is designed, thumbnailed, and battle-ready
with nothing left to first-hit latency.

The default is NOT a blank tile. It is the full deterministic pipeline:
`worldParcel(snap)` → biome from the zone's `biomeFamily` + a **window into the authored world-terrain
field** (rivers / roads / ridges / castles clipped to the parcel, continuous across borders) →
`generate()` (DENSE archetype base coat, lane/entry/choke carve, world-feature paint, ruins, and a
**tiered castle** on castle parcels) → `simulate()` sim-gate (which of the 5 modes it can host) →
artifact + thumbnail + index row in `MAPS_DIR`.

## The tool

`map-service/scripts/bake-zone.mjs` — deterministic, **idempotent**, resumable.

```
MAPS_DIR=/path/to/ef-battlefields node scripts/bake-zone.mjs EDU BUS [--limit=N] [--every=500] [--dry]
```

It calls the identical lazy path (`worldParcel` → `ensureDesign`) for every l3 parcel in each zone.
An already-seeded parcel at the current `GEN_VERSION` is skipped, so re-runs only fill gaps → safe to
run repeatedly and safe to resume after an interruption.

## Measured cost (200-parcel EDU sample, one core)

- **48.5 ms/parcel**, **98.5% sim-approved**, ~**90 KB/parcel** (artifact JSON + thumb PNG; render
  manifests stay lazy). All 5 modes present on nearly every parcel (DUEL/SIEGE/GUARD ~100%, CLASH/
  DOMINION ~92%).

| Zone | Parcels | Time (1 core) | Disk |
|---|---:|---:|---:|
| EDU | 13,663 | ~11 min | ~1.2 GB |
| BUS | 70,467 | ~57 min | ~6.3 GB |
| **Total** | **84,130** | **~68 min** | **~7.5 GB** |

## Where it runs (KEY decision)

The bake output is the runtime registry `MAPS_DIR` (`~/ef-battlefields` on the box). At ~7.5 GB it is
**not** a git artifact and **not** part of the deploy rsync — so the bake must run **on the box**, into
the live registry, not in the sandbox (a local bake never reaches production). Two ways:

1. **One-shot on the box** — SSH/console: `cd ~/ef-map-service && MAPS_DIR=$HOME/ef-battlefields node
   scripts/bake-zone.mjs EDU BUS`. ~68 min, resumable.
2. **A `workflow_dispatch` bake job** on the CF runner (the same box `map-deploy.yml` uses) so it's a
   one-click button. May want sharding (below) to fit a runner step.

**Parallelism caveat:** `save()` rewrites a single `index.json`, so N concurrent bake processes would
clobber it. To go faster than one core, shard by parcel range into **separate `MAPS_DIR`s** and merge
the `index.json`s + parcel dirs after (per-parcel dirs never collide). For a one-shot ~1 h run,
single-core is simplest.

## Open decisions

1. **Where does the full bake run** — one-shot on the box (fastest to green), or a dispatchable
   runner job? (recommend #1 now, #2 if we'll re-bake often.)
2. **The ~1.5% that fail the sim gate** (~1,250 parcels across both zones): they're stored but not
   deploy-approved (`freeze()` refuses them). For a "complete" map, either (a) accept — they still
   render + resolve, just aren't publish-frozen; or (b) add a default fallback so every parcel is
   guaranteed approved. Recommend (a) now, revisit if any are estate/castle parcels.
3. **Pre-bake render manifests too?** (instant battle load vs +disk/time). Recommend lazy for now.

## Castle status (LARGE / GIANT / EPIC) — see the same-day update

The default bake already emits the **tiered fortress** `meta.castleGeom` on castle parcels (rings +
crowned keep + elevation mound + per-zone PALACE style), per `CASTLE-ARCHITECTURE-SPEC.md`. EDU has 5
authored forts (CASTLE/PALACE/KEEP), BUS has 9. The *data* re-plan is done; the *3D visual* upgrade
beyond "stones in a circle" lands when the MOBA castle kit renders `castleGeom`.
