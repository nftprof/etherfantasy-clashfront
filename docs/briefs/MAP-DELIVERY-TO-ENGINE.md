# Map delivery to the engine — the durable pipeline (owner 2026-07-25)

**Problem it solves:** the MOBA 3D client vendors a RELATIVE copy of each battlefield map inside its
own repo (`etherfantasy-browser-moba-game/data/moba-maps/*.json`) and fetches it at runtime. It does
NOT read the map-service `/internal/` endpoint (CORS + not browser-facing + egress-blocked from the
MOBA dev session). So whenever CF updates a map, the engine keeps serving its **stale vendored copy** —
exactly the drift that left the siege castle on an old `siege-test` (designVersion 2, not v13), so the
enriched wooden gate never reached the game.

## Scope — most maps are CF-only, only a curated few are vendored (owner 2026-07-25)
Three delivery lanes; the pipeline below is **only lane 3**:
1. **CF-only maps (the bulk)** — every parcel's design, generated on demand (registry `~/ef-battlefields`
   / `data/cf-maps/`), served by the map-service + rendered in the CF command view. Never sync to the
   engine.
2. **Runtime 3D maps** — a real parcel's battlefield for a LIVE 3D battle, sent per-match via the
   allocate `battlefield` field (`ALLOCATE-CALLBACK-SCHEMA.md`). Delivered at match time, not vendored.
3. **Vendored engine maps** — the small curated set in `data/moba-maps/` (test/staging/reference: what
   the owner tests with). ONLY these vendor into the engine repo. The pipeline mirrors this folder and
   nothing else, so adding CF-only parcel maps elsewhere never floods the engine repo.

## Source of truth
CF repo `data/moba-maps/` (this repo) — the lane-3 curated set. A map = up to four files per name:
`<name>.json` (Battlefield A1 — the engine loads this), `<name>.manifest.json` (render manifest — the
client loads this too), `<name>.artifact.json` (raw artifact for renderers), `<name>.command.json`.

## The pipeline (`.github/workflows/sync-moba-maps.yml`)
On every push to `deploy/map` that touches `data/moba-maps/**` (or manual dispatch), a GitHub-hosted
job checks out the engine repo and **mirrors `data/moba-maps/*.json` into it**, committing +
pushing only when something changed. No hand-copying, no size limits (runs on a runner, not through a
chat context), works for every future map automatically.

### One-time setup (owner / deploy agent)
1. **Secret `MOBA_MAPS_TOKEN`** on this repo — a fine-grained PAT (or machine-user token) with
   **Contents: write** on `blockchainsuperheroes/etherfantasy-browser-moba-game`.
2. *(Optional, for fully-automatic delivery)* repo **variable `MOBA_MAPS_BRANCH`** = the branch the
   engine STAGING builds from. Without it, the job pushes to a `clashfront-map-sync` branch you merge.

Once the secret exists, re-run the workflow (or push any `data/moba-maps/` change) and the current
**v13 siege-test** (2 wooden gates + drawbridge, `material:"WOOD"`, `states:[CLOSED,OPEN,BROKEN]`)
lands in the engine repo.

## Verifying a delivery
- Served fingerprint: `GET https://map.etherfantasy.com/internal/v1/moba-maps` → each map's
  `genVersion` + `castleGates` (siege-test = 13 / 2).
- In the engine repo, `data/moba-maps/siege-test.json` `meta.genVersion` should read **13**.

## Still on the engine renderer (NOT a data problem)
The stale engine copy already contains the 2 gate structures, yet the wall renders sealed — so the
**renderer must cut the gate opening and draw `castle_gate_*` (kind GATE, `material:"WOOD"`) as a
closed, destructible door** with the `states` (CLOSED→OPEN→BROKEN). CF's `preview3d.html` is the
reference (`/designer/3d?parcel=SIEGE-TEST-1`). Syncing v13 supplies the material/states hints; the
opening + door mesh is engine-side work.
