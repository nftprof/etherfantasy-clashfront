# L2↔L3 same-map correlation — verification (task #21)

> **Owner:** Clash Front × EF Moba **integration** session (CF ↔ bridge ↔ MOBA client end-to-end).
> **Goal (passdown §4.2, the #1 open item):** prove the L2 command map and the L3 hero map render the
> **same battle in the same ±161 world frame**, so a click at `(x,z)` in command view is the identical
> world spot the 3D client fights on.
> **Method:** static field-by-field comparison of the three geometry sources that must agree, against the
> engine's authoritative constants (the server sim is the source of truth for where units actually are).
> Date: 2026-07-07.

## Sources compared

| # | Artifact | Layer role | Provenance |
|---|---|---|---|
| A | `etherfantasy-browser-moba-game` `server/sim/state.js` | **L3 ground truth** — the authoritative sim the match server runs | `spawn` L57, `CORES` L115, `towers` L124–127, `LANES` L168 |
| B | `server/cf/layout.js` `battlefieldOf(world)` | **L2 runtime export** — the `battlefield` JSON the bridge puts in `bridgeStart`, which CF's `drawBattlefieldMap` renders | derived live from the running world (A) |
| C | CF `data/moba-maps/*.json` stand-ins + `moba-singleplayer.json` | **L2 fallback maps** — what CF renders when no live export is present | `legacy-3lane` / `legacy-1lane` (wired today) · `moba-singleplayer` (reverse-engineered candidate) |

## Result — CORRELATED (runtime path clean; one candidate-file defect found & fixed)

**B correlates with A by construction.** `battlefieldOf(world)` reads the live units and `LANES` straight
out of the running sim, in the same ±161 frame, with **no ×MAPK** — so whatever L3 fights on is exactly
what L2 receives. This is the load-bearing guarantee and it holds.

**C (the fallback maps) checked field-by-field** against A (`scratchpad/verify_l2l3.mjs`, reproducible):

| Field | Engine (A) | `legacy-3lane` / `legacy-1lane` | `moba-singleplayer` (candidate) |
|---|---|---|---|
| arena half-edge / `sizeM` | ±161 / 322 | ✅ ±161 / 322 | ✅ ±161 / 322 |
| cores | ±114.8 (ATK SW / DEF NE) | ✅ | ✅ |
| towers | 12 (6/side, base×±1) | ✅ (3-lane) | ✅ exact, 12 |
| lanes | mid/top/bot (state.js:168) | ✅ (3-lane) | ✅ exact |
| **spawns** | **±131.6** | ✅ ±131.6 | ❌ **±118 → FIXED to ±131.6** |

- **Live L2 path today is correlation-clean.** The loader (`apps/server/src/battlefield.ts`) prefers a real
  `data/moba-maps/legacy.json`, then falls back to `legacy-{3,1}lane.json` — all of which use ±131.6
  spawns / ±114.8 cores / ±161 bounds, matching the engine to the decimal.
- **One defect in the candidate default map.** `moba-singleplayer.json` (commit `9ace7af`, proposed to
  "become the default/legacy example everyone gets") placed spawn zones at **±118** — ~13.6 units short of
  the engine's ±131.6 fountains. Its cores/towers/lanes were all exact, so this was the *only* thing that
  would have desynced L2 spawn markers from L3's real spawn points once it was adopted. **Fixed in this
  change** (`spawn_atk`/`spawn_def` → ±131.6); the check now passes **10/10**.

## What remains (cannot be done from this sandbox)

The **live visual** side of task #21 — opening one battle, viewing L2 on `cf.etherfantasy.com` and L3 on
`/play` simultaneously and eyeballing that lanes/towers/cores/obstacles overlay 1:1 — still needs the two
EC2 boxes and a running match. The static contract above is the precondition for that check and now passes;
the visual pass should be run once a live battle is up (and once OP48's client honors the ticket / auto-seats).

## Reproduce

```
node scratchpad/verify_l2l3.mjs   # loads moba-singleplayer.json, asserts vs engine constants → 10/10
```
Engine constants are transcribed with `file:line` provenance in the script; re-derive from
`server/sim/state.js` if the sim geometry ever changes (spawn L57 · cores L115 · towers L124 · lanes L168).

## Integration takeaway (for "CF works with ANY map")

The correlation guarantee is **the shared ±161 Battlefield frame, consumed with no rescale on either side**
(passdown §5). Any map — the map-maker's per-parcel JSON, the reverse-engineered legacy map, or the live
`battlefieldOf` export — correlates L2↔L3 **iff** it declares `sizeM 322` / bounds ±161 and emits cores,
towers, lanes and **spawns** in that frame. The one recurring failure mode is a field authored at a
different scale or offset (here: spawns). The 5-invariant validator in `battlefield.ts` should grow a
**frame check** (bounds ±161, spawns/cores within frame) so any future map — human- or LLM-authored — is
rejected at load if it breaks the shared frame, instead of silently rendering a desynced command map.
