# 20K bake pre-flight — Agent A (Network/match-server) SIGN-OFF

> Requested by `docs/maps/MAP-MAKER-HANDOFF-RECAP.md` §1 pre-flight ("confirm with the
> integration/network session (match server) BEFORE the bulk run"). Agent A per
> `docs/briefs/DEPTH-LAYERS-AGENT-SPLIT.md`. Verified against ENGINE CODE, 2026-07-11.

**SIGNED OFF — all §1 items that touch the match server, with code evidence:**

| §1 item | Engine truth (MOBA repo) | Verdict |
|---|---|---|
| 1. ±161 frame, center-origin, +z north, spawns ±131.6, cores ±114.8, no ×MAPK | `server/config.js` `MAP:{min:-161,max:161}` (movement hard-clamp); `sim/state.js` legacy spawns ±131.6 / cores ±114.8; battlefield-from-JSON consumes artifact coords AS-IS (no scaling anywhere in the load path) | ✅ |
| 2. 161×161 grid (`cells`+`walk`) | `maps/schema.js` `CELL_M=2` (322/2=161); `maps/loader.js` decodes `terrain.w`×`cellM` generically and the sim's walkability consumer (`movementSystem` `blockedAt`/`clampToOpen`) is resolution-agnostic — 161×161 confirmed as the standard | ✅ |
| 5. bounds = parcel's ACTUAL shape | movement truth = the artifact's walk grid (OOB cells are BLOCKED per `schema.js`), so the real polygon binds units regardless of the square engine clamp | ✅ |
| 6. lane/entry skeleton + edge-spawn anchors on every edge | engine consumes ATTACKER/DEFENDER `spawnZones` + `lanes` today; extra edge anchors are tolerated (ignored until reinforcement lanes land) — SAFE to bake now | ✅ |
| 7. seed = parcelId (deterministic artifact) | engine treats the artifact as data (registry determinism is D's); sim rng stays `context.seed` — no conflict | ✅ |
| §5 obstacle/walk AUTHORITY = the artifact | **built exactly so** (R3/R5, merged 2026-07-08): `makeBattleWorld` positions FROM `context.battlefield`; `movementSystem` enforces the artifact's walk grid as movement truth; prop circles are secondary | ✅ |

Items 3 (biome-from-world), 4 (cross-parcel continuity), 8 (size→component count), 9 (regionId/
isGate/regionBoundary fields) don't touch the match server — no objection; §1.9's fields are
consumed overworld-side (C) and pass through the engine untouched.

**One integration note (not a blocker):** for authored maps to actually PLAY in live battles, the
allocate context must carry `battlefield: {ref:{parcelId}}` (or the inline artifact) — the engine
side is DONE and falls back to the canon arena when absent. Wire that in `engineAllocateContext`
(C) whenever ready.

— EF Moba (Network + Obfuse deploy) / netcode-deploy session
