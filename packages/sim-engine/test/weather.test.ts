/**
 * Weather — deterministic per-continent rolls (docs/briefs/WEATHER-CONTINENT-PLAN.md,
 * coord doc COORD-003). Same (seed, continentId, day) ⇒ same WeatherState, forever.
 * Renderer + match-server + CF sim all trust `weatherAt()` — a save reloads to
 * identical weather.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TICKS_PER_DAY } from '@clashfront/shared';
import {
  intersectMode,
  rollWeather,
  universalBattleModes,
  WEATHER_KINDS,
  WEATHER_VISIBILITY,
  weatherAt,
  type WeatherProfile,
} from '../src/index';

const PROFILES: Record<string, WeatherProfile> = {
  ENT: {
    name: 'Mythoria',
    baseline: 'clear',
    chances: { rain: 0.30, storm: 0.10, fog: 0.15, wind: 0.10, heatwave: 0.05 },
  },
  UW1: {
    name: 'Underworld — Mist Sea',
    baseline: 'fog',
    chances: { rain: 0.15, storm: 0.05, fog: 0.55, wind: 0.05 },
  },
  UW2: {
    name: 'Underworld — Ash Desert',
    baseline: 'overcast',
    chances: { storm: 0.15, fog: 0.25, wind: 0.20, heatwave: 0.25 },
  },
};

test('weatherAt is deterministic: same (seed, continent, day) ⇒ same state, forever', () => {
  const a = weatherAt(PROFILES, 'seed-x', 'ENT', 0);
  const b = weatherAt(PROFILES, 'seed-x', 'ENT', 0);
  assert.deepEqual(a, b);
  // Same day = any tick in [0, TICKS_PER_DAY) produces the same result.
  const same = weatherAt(PROFILES, 'seed-x', 'ENT', TICKS_PER_DAY - 1);
  assert.deepEqual(a, same);
  // Next day may (probably will) differ — but if same, still deterministic.
  const nextDay = weatherAt(PROFILES, 'seed-x', 'ENT', TICKS_PER_DAY);
  const nextDayAgain = weatherAt(PROFILES, 'seed-x', 'ENT', TICKS_PER_DAY);
  assert.deepEqual(nextDay, nextDayAgain);
});

test('weatherAt varies by seed and by continent', () => {
  const enMon1 = weatherAt(PROFILES, 'seed-a', 'ENT', 0);
  const enMon2 = weatherAt(PROFILES, 'seed-b', 'ENT', 0);
  // Two seeds likely produce different states (probabilistic — but the RNG
  // over 8 slots means most seed pairs disagree).
  // Assert only via the property "not always equal across N seeds".
  let anyDiff = false;
  for (let i = 0; i < 32; i++) {
    if (weatherAt(PROFILES, `seed-${i}`, 'ENT', 0).state !== enMon1.state) { anyDiff = true; break; }
  }
  assert.ok(anyDiff, 'seed varies weather');
  const uw = weatherAt(PROFILES, 'seed-a', 'UW1', 0);
  // ENT + UW1 have different profiles — at least some seed produces different
  // states between them.
  let contDiff = false;
  for (let i = 0; i < 32; i++) {
    if (weatherAt(PROFILES, `s-${i}`, 'ENT', 0).state !== weatherAt(PROFILES, `s-${i}`, 'UW1', 0).state) {
      contDiff = true; break;
    }
  }
  assert.ok(contDiff, 'continent varies weather');
  // Trivial anti-typo: enMon2 and uw should have real (defined) values.
  assert.ok(WEATHER_KINDS.includes(enMon2.state));
  assert.ok(WEATHER_KINDS.includes(uw.state));
});

test('visibility matches the vocabulary — never returns unknown state', () => {
  for (let i = 0; i < 200; i++) {
    const w = weatherAt(PROFILES, `s-${i}`, 'UW2', i * TICKS_PER_DAY);
    assert.ok(WEATHER_KINDS.includes(w.state), `unknown state ${w.state}`);
    assert.equal(w.visibility, WEATHER_VISIBILITY[w.state], 'visibility scalar matches state');
    assert.equal(w.overrideActive, false);
  }
});

test('missing continent falls back to CLEAR (never crashes a battle)', () => {
  const w = weatherAt(PROFILES, 'seed-x', 'NO_SUCH_ZONE', 0);
  assert.equal(w.state, 'clear');
  assert.equal(w.visibility, 1.0);
  assert.equal(w.continentId, 'NO_SUCH_ZONE');
  assert.equal(w.overrideActive, false);
});

test('owner override short-circuits the seeded roll while active', () => {
  const override = { state: 'storm' as const, untilTick: 100 };
  const during = weatherAt(PROFILES, 'seed-x', 'ENT', 50, override);
  assert.equal(during.state, 'storm');
  assert.equal(during.overrideActive, true);
  assert.equal(during.visibility, WEATHER_VISIBILITY.storm);
  // Past the untilTick — override lapses; seeded roll resumes.
  const after = weatherAt(PROFILES, 'seed-x', 'ENT', 200, override);
  assert.equal(after.overrideActive, false);
});

test('rollWeather picks by probability order (residual = baseline)', () => {
  const profile: WeatherProfile = {
    name: 'test',
    baseline: 'clear',
    chances: { rain: 0.3, storm: 0.2 }, // 0.5 residual → clear
  };
  assert.equal(rollWeather(profile, 0.0), 'rain');
  assert.equal(rollWeather(profile, 0.29), 'rain');
  assert.equal(rollWeather(profile, 0.30), 'storm');
  assert.equal(rollWeather(profile, 0.49), 'storm');
  assert.equal(rollWeather(profile, 0.50), 'clear'); // residual
  assert.equal(rollWeather(profile, 0.99), 'clear');
});

// ── COORD-001 fallback: intersectMode + universalBattleModes ────────────────

test('intersectMode: no supported list ⇒ ideal passes through (back-compat)', () => {
  for (const m of ['DUEL', 'SIEGE', 'GUARD', 'CLASH', 'DOMINION'] as const) {
    assert.equal(intersectMode(m), m);
  }
});

test('intersectMode: CLASH not supported ⇒ falls back to DUEL', () => {
  assert.equal(intersectMode('CLASH', ['DUEL', 'SIEGE', 'GUARD']), 'DUEL');
  assert.equal(intersectMode('CLASH', ['DUEL', 'SIEGE', 'GUARD', 'CLASH']), 'CLASH');
});

test('intersectMode: DOMINION not supported ⇒ falls back to DUEL', () => {
  assert.equal(intersectMode('DOMINION', ['DUEL', 'SIEGE', 'GUARD']), 'DUEL');
  assert.equal(intersectMode('DOMINION', ['DUEL', 'SIEGE', 'GUARD', 'DOMINION']), 'DOMINION');
});

test('intersectMode: universal modes (DUEL/SIEGE/GUARD) never fall back', () => {
  // Even if the supported list is empty (pathological), universals stay as identity —
  // the playability gate guarantees they exist on every map (BATTLEFIELD-SCHEMA invariant 6).
  assert.equal(intersectMode('DUEL', []), 'DUEL');
  assert.equal(intersectMode('SIEGE', []), 'SIEGE');
  assert.equal(intersectMode('GUARD', []), 'GUARD');
});

test('universalBattleModes lists exactly the three geometry-agnostic modes', () => {
  assert.deepEqual([...universalBattleModes()], ['DUEL', 'SIEGE', 'GUARD']);
});
