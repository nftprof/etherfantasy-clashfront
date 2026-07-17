# Weather at continent level — the CF plan

> **Owners:** CF Overworld eco (STATE + owner overrides), MOBA BattleEngine RAW
> (visuals), EF Moba match-server + CF sim (gameplay). Cross-team split ratified
> in `docs/coord/MOBA-CF-COORD.md` #COORD-003 (2026-07-15).
> **Companion doc:** `docs/briefs/WEATHER-SYSTEM-SPEC.md` (owner 2026-07-17,
> renderer-agent-authored) — the architecture spec (three-layer flow, state
> vocabulary, render/gameplay hooks per state, v1→v2 rollout). **THIS doc = the
> CF-side sim implementation** (per-continent probability cards, deterministic
> `weatherAt()` scaffolding, weather × pet-element type-advantage matrix). Read
> both together; they compose without conflict.
> **Prereqs:** decision 14 (Masters are ELEMENT-FREE, elements live on pets),
> decision 22 (per-continent geography), `data/zone-cultures.json` (12 zones),
> `data/zone-registry.json` (continent metadata).

## One-line split

**CF Overworld owns weather STATE.** Renderer owns visuals. Match-server + CF
sim both READ the same state. Server-authoritative, deterministic, never
`Math.random()` (prime directive 6).

## Data model — deterministic, no persistence

```
weatherAt(continentId: ZoneId, tick: number, seed: string): WeatherState
```

Pure function of `(world.seed, continentId, day = floor(tick / TICKS_PER_DAY))`.
No state to snapshot; a save reloads to the same weather because the same
`(seed, continent, day)` hashes to the same roll. **Owner override** = a small
persisted `weatherOverride: Map<ZoneId, {state, untilTick}>` that short-circuits
the function for scripted events (siege storm, festival heatwave, etc.).

## Vocabulary (locked with renderer)

`clear · overcast · rain · storm · fog · wind · snow · heatwave`

The renderer's WEATHER-SYSTEM-SPEC.md defines `clear · overcast · rain · storm ·
fog · wind · snow` with per-state visibility scalars (CLEAR 1.0 → FOG 0.45).
**`heatwave` is new** (added for arid/volcanic type-advantage — FIRE +15%,
ICE/WATER -15%); renderer maps to `clear + amber tint` until v2 particles ship
(no schema change, just a visual mapping).

## Per-continent weather profiles (v0.1 dial)

The 12 continents from `data/zone-cultures.json`. Each gets a probability weight
card; probabilities sum ≤ 1.0 (residual = baseline). Owner-tunable in
`data/continent-weather.json`.

| Zone | Name | Baseline | rain | storm | snow | fog | wind | heatwave |
|---|---|---|---|---|---|---|---|---|
| **HUB** | Tianxia (temperate capital) | clear | 25% | 10% | 15% | 10% | 5% | 5% |
| **ENT** | Mythoria (western carnival coast) | clear | 30% | 10% | — | 15% | 10% | 5% |
| **BUS** | Athlantia (Mediterranean commerce) | clear | 20% | 5% | — | 10% | 10% | 15% |
| **EDU** | (education continent — temperate) | clear | 25% | 10% | 10% | 15% | 10% | 5% |
| **HS1** | High Sky — Sky Meadow (calm heights) | clear | 15% | 10% | 20% | 15% | 30% | — |
| **HS2** | High Sky — Storm Reach | overcast | 25% | 40% | 10% | 15% | 30% | — |
| **HS3** | High Sky — Bright Halls | clear | 10% | 5% | 15% | 5% | 25% | 5% |
| **UW1** | Underworld — Mist Sea (shallow) | fog | 15% | 5% | — | 55% | 5% | — |
| **UW2** | Underworld — Ash Desert | overcast | — | 15% | — | 25% | 20% | 25% |
| **UW3** | Underworld — Diminished Realm | overcast | 20% | 30% | — | 25% | 15% | 5% |
| **CGI** | (CGI experimental) | clear | 20% | 10% | 15% | 15% | 15% | 5% |
| **KOL** | (KOL prestige island) | clear | 15% | 5% | — | 5% | 10% | 20% |

**Nordheim (arctic) / Blackmere (swamp) / Volcanic isles** — these are
geographic REGIONS within continents (documented in `data/zone-cultures.json`
architecture notes), not top-level zones. Sub-region overrides land in v0.2
(a `subRegionProfiles: {regionId: <card>}` map per continent) — v0.1 uses the
continent card everywhere within that continent.

**Rolls are per-continent per-day**, not per-parcel — a rain day in Mythoria
means it's raining across all Mythoria battles that day. Sub-region and
per-parcel micro-climates are v0.2+.

## Type advantage matrix (weather × element)

**Canonical battle rule lives in `docs/briefs/WEATHER-COMBAT-SPEC.md`** (owner
2026-07-17, MOBA-locked): base swing ±15%, terrain overrides stack, **combined
weather+terrain clamped to ±35%** (anti-snowball guard), and the affinity
multiplies damage SEPARATELY from the existing 1.5×/0.7× type chart. This table
is the CF-side reference — the MOBA client/server sims are the enforcement,
and both must mirror the same numbers (PARITY-SCRUB flagged).

**Element vocabulary reconciled to `mon_lineage.json`** (MOBA-canon, 2026-07-17):
WATER→**Water**, ELECTRIC→**Lightning**, GROUND→**Earth**, DARK→**Phantom**,
PSYCHIC→**Telepath**, GRASS→**Leaf**, WIND→**Flyer**, LIGHT→**Mystic**. Fire /
Ice / Dragon keep their names. **Weather-NEUTRAL** (no swing either way):
Combat, Insect, Iron, Rock, Toxin, Neutral. **Masters stay element-free**
(decision 14) — never eligible for the affinity multiplier regardless.

| Weather | Boosts (+15% dmg) | Weakens (−15% dmg) | Notes |
|---|---|---|---|
| **clear** | — | — | baseline |
| **overcast** | — | Fire −5% | mild sun-block |
| **rain** | Water, Lightning | Fire, Earth | fire-based traps + structures **won't ignite** |
| **storm** | Lightning (×1.2) | Flyer, Fire | thunder strike chance ⚙ on tallest exposed unit |
| **fog** | Phantom, Telepath | Mystic, Flyer | intel sight-radius × 0.45 (line-of-sight) |
| **wind** | Flyer | siege lobs (arc weapons) | tower arrows lose accuracy ⚙ |
| **snow** | Ice | Fire, Dragon | movement +25% moveCost; fire-traps disabled |
| **heatwave** | Fire, Dragon | Ice, Water | food upkeep ×1.15 during battle |

**Terrain overrides** (always-on, per-parcel, stack with weather, capped at
combined ±35%):

| Terrain | Effect |
|---|---|
| **Lava parcel** | Fire +20% permanent, Ice/Water/Leaf −20%, ambient tick damage to Ice units |
| **Frozen parcel** | Ice +15%, Fire −15%, movement +15% moveCost baseline |
| **Forest parcel** | Leaf +10%, Fire −10% (amplifies rain's fire debuff) |
| **Water parcel** | Water +15%, Lightning ×1.15 (chain-shock chance), Fire −15% |
| **Underworld parcels** (UW1–3) | Phantom +10%, Mystic −10% ambient (the deep favors shadow) |

**Scope (owner ruling 2026-07-17, coord doc COORD-004-sub):** affinity applies
to **pets AND line-soldiers** — with the canon clarification that in CF, **pet
= soldier**. A `UnitClass` stack (INFANTRY / ARCHER / CAVALRY / SPEAR / SIEGE /
MARINE / SHIP) IS a pet species deployment, not "elementless infantry with a
pet on the side"; the stack carries the underlying species' element and the
weather swing hits the whole stack. **Heroes/Masters do NOT receive direct
weather affinity** — they benefit indirectly through their pet-squad buffs.
Preserves decision 14 verbatim: elements still live on pet selection, which
now formally = the soldier stack itself.

## Sim consumers — three cheap sites

1. **Battle allocate context** — CF sends `weather: {state, visibility,
   continentId}` per battle. Renderer + match-server + CF sim all read the same
   object. **This is the single cutover** that fixes the map-floor
   determinism bug (renderer `Math.random()` at `index.html` 5743-5744 →
   `setWeather(allocate.weather)`).
2. **WarScore modifier** — sum element bonuses per side (per-unit element ×
   weather-matrix entry), scale attacker/defender score by aggregate. Golden-
   master tests already cover deterministic WarScore — extends cleanly.
3. **Movement + intel** — `phaseMovement` adds a weather term to moveCost
   (rain +10%, snow +25%, storm +15%); `intel` scales sight-radius by
   `visibility` scalar (concept already exists in intel.ts).

## API surface (allocate + override)

**Allocate-context field (extension of ALLOCATE-CALLBACK-SCHEMA §1):**

```jsonc
"weather": {
  "state": "rain",        // one of the vocab words above
  "visibility": 0.65,     // 0..1 scalar (CLEAR 1.0 → FOG 0.45)
  "continentId": "ENT",
  "overrideActive": false // true iff a weatherOverride was in effect for this battle
}
```

**Owner override endpoint (Phase 3):**

```
POST /api/weather-override
  { "continentId": "ENT", "state": "storm", "durationTicks": 24 }
  → { "activeUntilTick": 12345 }
```

Requires admin/owner role; posts to `state.weatherOverride` map; next tick's
allocate reads it. Deleting the override before expiry: `DELETE /api/weather-override/:continentId`.

## Rollout phases

| Phase | Deliverable | Blocks? |
|---|---|---|
| **0 (this session)** | `WEATHER-CONTINENT-PLAN.md` (this doc) + `data/continent-weather.json` (12 profiles v0.1) + `packages/sim-engine/src/weather.ts` (`weatherAt()` deterministic function, unit tests) + coord-doc entry #COORD-003 | nothing |
| **1** | Allocate-context field (`weather.state/visibility/continentId`) plumbed through `apps/server/src/game.ts engineAllocateContext`; renderer + match-server can read but effect stays visual-only. **This unlocks the deterministic-floor cutover.** | nothing |
| **2** | Type-advantage math in WarScore + `phaseMovement` moveCost adjustment + `intel` visibility scalar wiring | ships with pet-element combat pass |
| **3** | Owner-override API + `weatherOverride` state map + event weather (storms for scripted sieges/festivals) | ships with event system |

## What each agent owes

- **CF Overworld eco (me):** Phases 0/1 this cycle. Phase 2 = separate pet-
  element combat brief. Phase 3 = event system PR.
- **CF ParcelMap Design Agent:** every generated map's `meta.continentId` MUST
  be set (which of 12 zones the parcel lives in). Sub-region tag (v0.2) — hold.
- **EF Moba match-server:** `setWeather(allocate.weather.state)` at match start;
  reads the same allocate object for gameplay (fire-ignition gate, etc.).
- **MOBA BattleEngine RAW (renderer):** already accepts `setWeather(state)`
  + `visibility` — no schema change; `heatwave` mapped to `clear + amber tint`
  until v2 particles ship.

## Open dials for owner (⚙ knobs, not blocking)

- Per-state visibility scalars (rendering spec numbers accepted as-is)
- Type-advantage swing (currently ±15%; may need per-element tuning)
- Weather-day length (currently 1 game-day = TICKS_PER_DAY; could be shorter
  for demo/testing via `⚙ weatherRollFrequencyTicks`)
- Sub-region overrides (deferred to v0.2)
