/**
 * Per-parcel generated-map loader (last-mile of the maps loop): when the map
 * service has produced a parcel's OWN A1 Battlefield and it's on the box at
 * <CF_PARCEL_MAPS_DIR>/<parcelId>.json, CF prefers it over the standard stand-in;
 * a missing/invalid file falls back cleanly. (docs/briefs/BATTLEFIELD-SCHEMA.md)
 *
 * tickMs: null — no world ticking here.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { type Battlefield, loadParcelBattlefield, validateBattlefield } from '../src/index';

// a minimal but VALID A1 map (passes all five playability invariants)
function validMap(parcelId: string): Battlefield {
  return {
    v: 1,
    meta: { parcelId, seed: `seed-${parcelId}`, biome: 'TEMPERATE_GRASS', sizeM: 322, laneCount: 1 },
    arena: { shape: 'polygon', sizeM: 322, bounds: [[-161, -161], [161, -161], [161, 161], [-161, 161]] },
    obstacles: [{ id: 'tree_1', kind: 'TREE', x: 60, z: 0, r: 8, passable: false }],
    resources: [],
    buildSpots: [],
    spawnZones: [
      { id: 'atk', side: 'ATTACKER', edge: 'S', x: 0, z: -131.6 },
      { id: 'def', side: 'DEFENDER', edge: 'N', x: 0, z: 131.6 },
    ],
    lanes: [{ id: 'lane_mid', side: 'ATTACKER', waypoints: [[0, -131.6], [0, 0], [0, 131.6]] }],
    structures: [
      { anchorId: 'core_atk', kind: 'CORE', side: 'ATTACKER', x: 0, z: -114.8 },
      { anchorId: 'core_def', kind: 'CORE', side: 'DEFENDER', x: 0, z: 114.8 },
    ],
  };
}

function withDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'cf-parcel-maps-'));
  const prev = process.env['CF_PARCEL_MAPS_DIR'];
  process.env['CF_PARCEL_MAPS_DIR'] = dir;
  try { fn(dir); } finally {
    if (prev === undefined) delete process.env['CF_PARCEL_MAPS_DIR']; else process.env['CF_PARCEL_MAPS_DIR'] = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

test('loadParcelBattlefield returns undefined for missing parcel / empty id', () => {
  withDir(() => {
    assert.equal(loadParcelBattlefield('99999999999'), undefined);
    assert.equal(loadParcelBattlefield(undefined), undefined);
    assert.equal(loadParcelBattlefield(''), undefined);
  });
});

test('loadParcelBattlefield returns a valid on-disk parcel map', () => {
  withDir((dir) => {
    const id = '60203370020';
    const map = validMap(id);
    assert.equal(validateBattlefield(map).ok, true); // sanity: our fixture is valid
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(map));
    const got = loadParcelBattlefield(id);
    assert.ok(got, 'expected the parcel map to load');
    assert.equal(got?.meta?.parcelId, id);
    assert.equal(got?.lanes?.[0]?.id, 'lane_mid');
  });
});

test('an INVALID on-disk map is rejected (falls back, never ships unplayable)', () => {
  withDir((dir) => {
    const id = '70000000001';
    // core walled off: a blocking obstacle sitting on the CORE → invariant 4 fails
    const bad = validMap(id);
    bad.obstacles = [{ id: 'wall', kind: 'ROCK', x: 0, z: 114.8, r: 20, passable: false }];
    assert.equal(validateBattlefield(bad).ok, false); // sanity: fixture is unplayable
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(bad));
    assert.equal(loadParcelBattlefield(id), undefined);
  });
});
