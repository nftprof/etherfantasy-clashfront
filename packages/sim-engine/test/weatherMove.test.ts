/**
 * Wave 4.9 — weather Phase 2 (environmental): today's weather scales march
 * step-time (WEATHER-CONTINENT-PLAN §Phase 2). stepTicks × weatherMoveCostMult;
 * the default (1.0) leaves movement byte-identical (headless/golden-master).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng, loadBalance } from '@clashfront/shared';
import { type DemoWorldFile, loadDemoWorld, stepTicks } from '../src/index';

const BALANCE = loadBalance();

function makeGrid(cols: number, rows: number): DemoWorldFile {
  const pid = (i: number) => `P${String(i).padStart(4, '0')}`;
  const parcels = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = c * 2; const y = r * 2;
      const neighbors: string[] = [];
      if (c > 0) neighbors.push(pid(i - 1));
      if (c < cols - 1) neighbors.push(pid(i + 1));
      if (r > 0) neighbors.push(pid(i - cols));
      if (r < rows - 1) neighbors.push(pid(i + cols));
      parcels.push({
        parcelId: pid(i), tokenId: pid(i),
        center: [x, y] as [number, number],
        polygon: [[x-1,y-1],[x+1,y-1],[x+1,y+1],[x-1,y+1]] as [number, number][],
        neighbors: neighbors.sort(),
      });
    }
  }
  return { meta: { zone: 'TEST', sliceBBox: [-1,-1,cols*2-1,rows*2-1], generatedFrom: 'test' }, parcels };
}

test('weatherMoveCostMult scales step time; default 1.0 is a no-op', () => {
  const state = loadDemoWorld(makeGrid(3, 1), createRng('wx-move').fork('w'), { monsterParcelPct: 0 });
  const hex = [...state.hexes.keys()][0]!;
  const base = 100;
  const clear = stepTicks(state, hex, { travelTicksPerStep: base }); // default mult 1.0
  const clearExplicit = stepTicks(state, hex, { travelTicksPerStep: base, weatherMoveCostMult: 1.0 });
  assert.equal(clear, clearExplicit, 'omitting the mult == passing 1.0');

  const snow = stepTicks(state, hex, { travelTicksPerStep: base, weatherMoveCostMult: BALANCE.weather.moveCostByState['snow']! });
  const storm = stepTicks(state, hex, { travelTicksPerStep: base, weatherMoveCostMult: BALANCE.weather.moveCostByState['storm']! });
  assert.ok(snow > clear, 'snow slows the march');
  assert.ok(storm > clear && storm < snow, 'storm slows less than snow');
  // moveCost 1.0 hex, base 100 ⇒ snow ×1.25 = 125.
  assert.equal(snow, Math.round(base * 1.25));
  assert.equal(storm, Math.round(base * 1.15));
});

test('the weather penalty stacks on terrain moveCost (never below 1 tick)', () => {
  const state = loadDemoWorld(makeGrid(3, 1), createRng('wx-terrain').fork('w'), { monsterParcelPct: 0 });
  const hex = [...state.hexes.keys()][0]!;
  state.hexes.get(hex)!.moveCost = 2.0; // hills-like
  const stormy = stepTicks(state, hex, { travelTicksPerStep: 10, weatherMoveCostMult: 1.15 });
  assert.equal(stormy, Math.round(10 * 2.0 * 1.15)); // 23
  // A tiny base still floors at 1 tick.
  state.hexes.get(hex)!.moveCost = 0.01;
  assert.equal(stepTicks(state, hex, { travelTicksPerStep: 1, weatherMoveCostMult: 1.0 }), 1);
});

test('every weather state in the continent data has a moveCost multiplier', () => {
  // The environmental multiplier must be defined for every state the renderer
  // + battleWeather can emit (WEATHER-CONTINENT-PLAN vocabulary).
  for (const s of ['clear', 'overcast', 'rain', 'storm', 'fog', 'wind', 'snow', 'heatwave']) {
    assert.equal(typeof BALANCE.weather.moveCostByState[s], 'number', `${s} has a mult`);
    assert.ok(BALANCE.weather.moveCostByState[s]! >= 1.0, `${s} never speeds a march up`);
  }
});
