/**
 * Weather — CF Overworld owns the STATE (per-continent, per-day rolls,
 * deterministic from world.seed). Renderer owns visuals; match-server + CF sim
 * both READ this. Cross-team split ratified in
 * `docs/coord/MOBA-CF-COORD.md` #COORD-003. Full spec:
 * `docs/briefs/WEATHER-CONTINENT-PLAN.md`.
 *
 * Prime directive 6 (determinism): no Date.now / Math.random anywhere.
 * `weatherAt` is a pure function of `(seed, continentId, day)` — a save reloads
 * to identical weather, replay is bit-for-bit stable.
 *
 * Phase 0 (this cycle): the function + the type. No gameplay effect yet.
 * Phase 1: allocate-context field plumbing (unlocks the deterministic map-floor
 * cutover on the renderer). Phase 2+: WarScore modifier, moveCost, intel scalar.
 */
import { TICKS_PER_DAY } from '@clashfront/shared';

/** Weather vocabulary — locked with the renderer's WEATHER-SYSTEM-SPEC.md. */
export type WeatherKind =
  | 'clear'
  | 'overcast'
  | 'rain'
  | 'storm'
  | 'fog'
  | 'wind'
  | 'snow'
  | 'heatwave';

export const WEATHER_KINDS: readonly WeatherKind[] = [
  'clear',
  'overcast',
  'rain',
  'storm',
  'fog',
  'wind',
  'snow',
  'heatwave',
];

/**
 * Per-state visibility scalar — 0..1. `1.0` = pristine sight, `0.45` = fog
 * (renderer default). CF intel + match-server line-of-sight scale sight-radius
 * by this scalar (same number, three consumers — the "one truth" the renderer
 * agent called out).
 */
export const WEATHER_VISIBILITY: Record<WeatherKind, number> = {
  clear: 1.0,
  overcast: 0.85,
  rain: 0.7,
  storm: 0.55,
  fog: 0.45,
  wind: 0.9,
  snow: 0.6,
  heatwave: 0.9,
};

/** One continent's probability card. Chances sum ≤ 1.0; residual = baseline. */
export interface WeatherProfile {
  name: string;
  baseline: WeatherKind;
  chances: Partial<Record<WeatherKind, number>>;
}

/**
 * The resolved weather for one battle — what CF sends into the allocate
 * context. `overrideActive` is true iff a `weatherOverride` short-circuited the
 * seeded roll (Phase 3 — owner event storms).
 */
export interface WeatherState {
  state: WeatherKind;
  visibility: number;
  continentId: string;
  overrideActive: boolean;
}

/**
 * Deterministic 32-bit hash (FNV-1a variant) — same string ⇒ same u32 forever.
 * Local to this module because tick.ts's `rng.fork(key)` doesn't return a raw
 * number and we need a stable float in [0,1) that depends on ONLY the inputs
 * (not on any RNG side-state).
 */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Pick a weather kind from a profile using a seeded roll in [0,1).
 * Priorities: iterate `chances` in insertion order (JS object keys are ordered);
 * if the running sum crosses `roll`, that key wins. Nothing wins ⇒ baseline.
 * (Insertion order matters — data/continent-weather.json controls the order.)
 */
export function rollWeather(profile: WeatherProfile, roll: number): WeatherKind {
  let acc = 0;
  for (const [kind, p] of Object.entries(profile.chances)) {
    acc += p ?? 0;
    if (roll < acc) return kind as WeatherKind;
  }
  return profile.baseline;
}

/**
 * The one function CF/renderer/match-server all trust. Same
 * `(seed, continentId, day)` ⇒ same WeatherState, forever.
 *
 * @param profiles the loaded continent-weather.json map
 * @param seed     world.seed (deterministic; usually `state.world.seed`)
 * @param continentId one of the 12 zone keys from data/zone-cultures.json
 * @param tick     world tick — rounded to the day for the roll
 * @param override optional short-circuit for owner event weather (Phase 3);
 *                 when active for THIS `(continentId, tick)`, its `state` wins
 *                 and `overrideActive` = true on the returned state
 */
export function weatherAt(
  profiles: Record<string, WeatherProfile>,
  seed: string,
  continentId: string,
  tick: number,
  override?: { state: WeatherKind; untilTick: number } | undefined,
): WeatherState {
  if (override !== undefined && tick < override.untilTick) {
    return {
      state: override.state,
      visibility: WEATHER_VISIBILITY[override.state],
      continentId,
      overrideActive: true,
    };
  }
  const profile = profiles[continentId];
  if (profile === undefined) {
    // No profile for this continent (e.g. isolated stand-in map, dev fixture).
    // Return clear — the renderer's safest default; never crash a battle over
    // a missing continent tag.
    return { state: 'clear', visibility: 1.0, continentId, overrideActive: false };
  }
  const day = Math.floor(tick / TICKS_PER_DAY);
  const roll = hash32(`${seed}:${continentId}:${day}`) / 0x1_0000_0000;
  const state = rollWeather(profile, roll);
  return {
    state,
    visibility: WEATHER_VISIBILITY[state],
    continentId,
    overrideActive: false,
  };
}
