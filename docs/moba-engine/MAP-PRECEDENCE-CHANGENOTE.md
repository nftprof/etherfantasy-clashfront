# Change note — legacy.json delivery + map precedence fixes (2026-07-07)

> **By:** Clash Front × EF Moba integration session. **Aligns to:** `docs/maps/MAP-PIPELINE-GLOSSARY.md`
> "Live vs static — the precedence" (owner correction 2026-07-07: the 3-lane arena is a TEST drop-in,
> **not** a production fallback; a CF parcel battle that renders the 3-lane is a bug).

The map-pipeline model defines one order of truth for what a battle renders:

```
 1. LIVE match map (bridge/engine telemetry `battlefield`)   ← wins whenever a match is running
 2. the parcel's OWN designed map (loadParcelBattlefield)    ← the production path
 3. legacy.json / legacy-{1,3}lane.json                      ← TEST crutch only, never a design fallback
```

CF respected #1 already and #2 in the sim/wild path (`game.ts battleStatic`). Two gaps closed:

### 1. Delivered the authoritative `legacy.json`
`data/moba-maps/legacy.json` — the real current-arena export from the network/engine session
(`integration/legacy.json`, moba `main` @ `48058a2`). Validated A1 Battlefield JSON: `sizeM 322`,
bounds ±161, cores ±114.8, **12 towers, 3 lanes, spawns ±131.6**, no `_placeholder` — matches the
engine sim geometry to the decimal (the authoritative version of the reverse-engineered
`moba-singleplayer.json`, which stays as a redundant cross-check). The loader auto-prefers it.

### 2. `battlefield.ts` — legacy.json is the **3-lane** crutch only, never for a single parcel
`loadStandbyBattlefield` previously preferred `legacy.json` for **every** laneCount, so a single
parcel (`laneCount 1`) would have fallen to the 3-lane arena. Per the owner's correction a single
parcel must never render the 3-lane; `legacy.json` (a 3-lane map) is now preferred only on the
`laneCount === 3` (estate/default) path — singles keep the 1-lane stand-in until their own parcel
map exists.

### 3. `bridge.ts` — inserted the parcel-map tier (the named bug)
The live-match path was `b.battlefield ?? loadStandbyBattlefield(3)` — it jumped **live → 3-lane**,
skipping tier #2. A live parcel battle whose match server didn't ship a map rendered the 3-lane
arena. Now: `b.battlefield ?? loadParcelBattlefield(b.parcelId) ?? loadStandbyBattlefield(3)`.

**Tests:** +1 regression (`battlefield: a placed parcel map is the tier preferred over the 3-lane
test crutch`); server suite 60 green, sim-engine 111, shared 4. Correlation check still 10/10.

### Still open (needs the other sessions)
- **Engine must consume the CF artifact's obstacles + walkability as-is (deterministic)** for a CF
  parcel battle — not re-roll them like the legacy arena (map-maker Q1). This is the R3/R5
  battlefield-from-JSON item: `makeBattleWorld` positions FROM `context.battlefield`. Engine-session lane.
- **Near-player seeding trigger** = the CF overworld tick (materialize this parcel + neighbours on
  approach, cache the artifact), not match allocate (map-maker Q2). Allocate just loads the seeded map.
- **Live-map validation depth:** the bridge accepts an incoming live `battlefield` on a basic shape
  gate (`arena.bounds.length ≥ 3`), not the full 5-invariant `validateBattlefield`. Left as-is
  ("live wins"); flag for discussion whether to validate-and-fallback.
