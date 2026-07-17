# Weather system — continent weather → battle effects (owner directive 2026-07-17)

> Owner: "confirm how the weather system will work. For now it can be random, but incorporate a
> weather system that can be TRIGGERED — clouds over an entire continent, raining days (fire
> strategy won't set), wind, snow. Critical: these affect what people can SEE."
>
> Anchor fact (Network's floor-determinism fix): the SERVER decides biome+weather and ships them in
> the match START PAYLOAD — all players see the same world. That seam is exactly where this system
> plugs in. Map artifacts stay weather-AGNOSTIC (deterministic floor, never re-baked); weather is a
> RUNTIME input layered on top.

## 1. The architecture — three layers, one truth

```
OVERWORLD WEATHER FIELD  (CF sim owns; deterministic, seeded per world-tick)
   continent-scale systems: cloud banks, rain fronts, wind vectors, snow — drift across a zone
        │  weatherAt(zone, hexId, tick) → { sky, precip, wind, visibility }
        ▼
BATTLE START PAYLOAD  (exists — Network's fix: server-decided biome+weather)
   allocate context gains `weather` = the overworld cell's weather at the collision tick
        ▼
CONSUMERS  render (shared module) · sim/engine (gameplay effects) · overworld map UI (cloud layer)
```

- **Deterministic, not random** (random is the interim): `weatherAt` = seeded value-noise over
  (zone, world-xy, tick) — same inputs ⇒ same weather for every player and every replay. "Triggered"
  comes free: owner/event overrides write a `weatherOverride` row (zone- or region-scoped, expiry
  tick) that beats the field — storms on demand for events, sieges, story beats.
- The map service/artifacts are untouched: no re-bake, no cache churn. Weather modulates the
  RENDER and the RULES at battle time.

## 2. Weather states (v1 vocabulary — ⚙ extensible)

| state | visibility | render | gameplay hooks (sim/engine) |
|---|---|---|---|
| CLEAR | 1.0 | baseline | — |
| OVERCAST | 0.9 | cloud-shadow patches drift over the floor, dimmer sun | −intel range on overworld |
| RAIN | 0.75 | rain streaks, wet floor tint (the biome `wet` tint exists!), puddle sheen | **fire abilities/strategies won't ignite** (fire-based skills damped ⚙), mud: +move cost on OPEN, morale bleed on long marches |
| STORM | 0.55 | heavy rain + wind-lashed trees + lightning flashes | rain effects + wind effects + no airship departures |
| FOG/CLOUDS | 0.45 | ground fog volume, fog distance pulled WAY in | **vision radius cut** — units/towers see less; ambush interception odds up; scouting intel blank |
| WIND | 1.0 | tree/banner/grass sway amplitude up, dust streaks | projectile drift, fire SPREADS downwind (when dry), airship speed ± by heading |
| SNOW | 0.8 | snowfall, floor whitening overlay (near-white tint mix), breath puffs | +move cost, water freezes (ice mode!), fire damped |

`visibility` is THE cross-cutting number: it scales unit/tower sight radius (engine), fog-of-war
intel (CF sim), and the render fog distance (module) from ONE value — "clouds: people can't see."

## 3. Who builds what

- **CF ParcelMap (me):** the ZONE WEATHER FIELD data + `weatherAt` reference implementation —
  seeded noise drifting with per-zone prevailing wind (UW zones: no weather except HS/UW-specific
  sets — UW2 mists, UW3 ashfall as FOG/SNOW reskins; sky zones: wind-dominant). Plus the overworld
  cloud LAYER for the world map UI (clouds visibly cover regions — players SEE the front coming).
- **CF Overworld eco:** tick the field, apply overworld effects (march cost, intel, interception),
  put `weather` into the allocate context + start payload (the seam exists), `weatherOverride`
  admin/event API ("triggered").
- **EF Moba (netcode):** carry `start.weather` (already does post-fix); no per-client rolls.
- **MOBA BattleEngine RAW (shared renderer):** the effect layers (§2 render column) as module
  vocabulary keyed off `opts.weather` — and **carry Network's determinism line through the
  extraction: the client reads `start.biome`/`start.weather`, never `Math.random()`
  (index.html:5743-5744 replacement) — one line, do not lose it.**
- Battles LOCK their weather at start (a 20-min match doesn't flicker); the overworld front moves
  between battles.

## 4. v1 → v2

- **v1 (now):** random-per-battle is acceptable — the start-payload seam already makes it
  consistent per match. Renderer gets CLEAR/RAIN/FOG first (visibility + fire-damp are the two
  effects with teeth).
- **v2:** the deterministic drifting field + overworld cloud layer + overrides ("triggered"),
  WIND/SNOW/STORM, fire-spread-downwind interplay.

## 5. Map-side guarantees (why nothing re-bakes)

Artifacts/manifests carry biome + geometry only. Weather never changes walkability, spawns, or
invariants — it modulates costs, sight, and skills (all runtime ⚙). The one crossover: SNOW's
frozen water uses the water layer's existing `ice` mode as a RUNTIME style switch, not a map edit.
