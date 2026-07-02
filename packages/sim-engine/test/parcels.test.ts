/**
 * Parcel importer tests — deterministic, fixed seeds (AGENTS.md §2 Tests).
 * Covers: snapshot validation, canonical conversion, invariant 2 (1 Territory ↔ 1 LandNFT),
 * estate classification (ESTATE_MIN_HEXES), zone→Region grouping, and bit-for-bit
 * import determinism (same snapshot + seed ⇒ identical world).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { CONSTANTS, createRng } from '@clashfront/shared';
import {
  SYSTEM_GENESIS_GOVERNOR,
  UNZONED_REGION,
  importParcels,
  isEstate,
  loadParcelsFile,
  parseParcelsFile,
  type ParcelsFile,
} from '../src/parcels';
import type { WorldState } from '../src/state';

// data/parcels.sample.json from compiled test location dist/test/ → repo root.
const SAMPLE_PATH = join(__dirname, '..', '..', '..', '..', 'data', 'parcels.sample.json');

function sampleFile(): ParcelsFile {
  return loadParcelsFile(SAMPLE_PATH);
}

function importSample(seed = 'parcels-test'): WorldState {
  return importParcels(sampleFile(), { name: 'Hexagone', seed }, createRng(seed), {
    zoneTypeBySourceZone: { 'Harbor District': 'HARBOR' },
  });
}

/** Stable JSON projection of a WorldState for golden comparison (Maps → sorted entries). */
function project(state: WorldState): string {
  const mapToObj = (m: ReadonlyMap<string, unknown>) =>
    Object.fromEntries([...m.entries()].sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({
    world: state.world,
    regions: mapToObj(state.regions),
    hexes: mapToObj(state.hexes),
    territories: mapToObj(state.territories),
    landNfts: mapToObj(state.landNfts),
  });
}

test('sample snapshot parses and matches the documented format', () => {
  const file = sampleFile();
  assert.equal(file.coordinateSystem, 'axial');
  assert.equal(file.parcels.length, 4);
});

test('import converts every parcel to Territory + LandNFT + hexes (invariant 2)', () => {
  const state = importSample();
  assert.equal(state.territories.size, 4);
  assert.equal(state.landNfts.size, 4);
  assert.equal(state.hexes.size, 1 + 1 + 3 + 8);
  // 1 Territory ↔ 1 LandNFT, never orphaned, and hexes back-reference their territory.
  for (const terr of state.territories.values()) {
    const nft = state.landNfts.get(terr.landNftId);
    assert.ok(nft, `territory ${terr.name} has its LandNFT`);
    assert.equal(nft.territoryId, terr.id);
    for (const hexId of terr.hexIds) {
      assert.equal(state.hexes.get(hexId)?.territoryId, terr.id);
    }
    assert.equal(terr.governorId, SYSTEM_GENESIS_GOVERNOR);
    assert.equal(terr.governorKind, 'SYSTEM');
  }
});

test('source zones become Regions; zoneTypeBySourceZone maps ZoneType with VILLAGE fallback', () => {
  const state = importSample();
  const regionNames = [...state.regions.values()].map((r) => r.name).sort();
  assert.deepEqual(regionNames, ['Harbor District', 'Meadow District']);
  const byName = (name: string) =>
    [...state.territories.values()].find((t) => t.name === name)!;
  assert.equal(byName("Fisher's Rest").zoneType, 'HARBOR'); // mapped
  assert.equal(byName('Meadow Rise').zoneType, 'VILLAGE'); // unmapped zone → fallback
  // Region.hexIds covers exactly its territories' hexes.
  for (const region of state.regions.values()) {
    const terrHexes = [...state.territories.values()]
      .filter((t) => t.regionId === region.id)
      .flatMap((t) => t.hexIds)
      .sort();
    assert.deepEqual([...region.hexIds].sort(), terrHexes);
  }
});

test('estate classification: footprint ≥ ESTATE_MIN_HEXES (locked decision 4)', () => {
  const state = importSample();
  const estates = [...state.territories.values()].filter(isEstate);
  assert.equal(estates.length, 1);
  assert.equal(estates[0]!.name, 'Highkeep Estate');
  assert.equal(estates[0]!.hexIds.length, 8);
  assert.ok(estates[0]!.hexIds.length >= CONSTANTS.ESTATE_MIN_HEXES);
});

test('terrain: explicit source terrain honored, omitted falls back to PLAINS (locked decision 2)', () => {
  const state = importSample();
  const terrains = [...state.hexes.values()].map((h) => h.terrain);
  assert.equal(terrains.filter((t) => t === 'COAST').length, 2);
  assert.equal(terrains.filter((t) => t === 'MOUNTAIN').length, 1);
  assert.equal(terrains.filter((t) => t === 'HILLS').length, 1);
  assert.equal(terrains.filter((t) => t === 'PLAINS').length, 9);
});

test('LandNFT carries provenance and on-chain refs from the snapshot', () => {
  const state = importSample();
  const nfts = [...state.landNfts.values()];
  assert.deepEqual(
    nfts.map((n) => n.sourceParcelId).sort(),
    ['hc-0001', 'hc-0002', 'hc-0003', 'hc-0004'],
  );
  const chained = nfts.find((n) => n.sourceParcelId === 'hc-0003')!;
  assert.equal(chained.chainId, 1);
  assert.equal(chained.tokenId, '3');
  for (const nft of nfts) {
    assert.equal(nft.taxSplitLandlord, CONSTANTS.TAX_SPLIT_LANDLORD_DEFAULT);
    assert.equal(nft.ownerPlayerId, undefined); // SYSTEM-owned at genesis
  }
});

test('import is deterministic: same snapshot + seed ⇒ bit-identical world', () => {
  assert.equal(project(importSample('seed-A')), project(importSample('seed-A')));
  assert.notEqual(project(importSample('seed-A')), project(importSample('seed-B')));
});

test('import is order-insensitive: shuffled snapshot parcels/hexes ⇒ identical world', () => {
  const file = sampleFile();
  const shuffled: ParcelsFile = {
    ...file,
    parcels: [...file.parcels].reverse().map((p) => ({ ...p, hexes: [...p.hexes].reverse() })),
  };
  const a = importParcels(file, { name: 'W', seed: 's' }, createRng('s'));
  const b = importParcels(shuffled, { name: 'W', seed: 's' }, createRng('s'));
  assert.equal(project(a), project(b));
});

test('validation rejects malformed snapshots with precise errors', () => {
  const base = sampleFile();
  assert.throws(() => parseParcelsFile(null), /not an object/);
  assert.throws(
    () => parseParcelsFile({ ...base, coordinateSystem: 'offset' }),
    /coordinateSystem must be "axial"/,
  );
  assert.throws(() => parseParcelsFile({ ...base, parcels: [] }), /non-empty array/);
  assert.throws(
    () =>
      parseParcelsFile({
        ...base,
        parcels: [...base.parcels, { ...base.parcels[0]! }],
      }),
    /duplicate parcelId/,
  );
  assert.throws(
    () =>
      parseParcelsFile({
        ...base,
        parcels: [
          ...base.parcels,
          { parcelId: 'hc-9999', hexes: [{ q: 0, r: 0 }] }, // (0,0) already owned by hc-0001
        ],
      }),
    /appears in more than one parcel/,
  );
  assert.throws(
    () => parseParcelsFile({ ...base, parcels: [{ parcelId: 'x', hexes: [] }] }),
    /non-empty hexes/,
  );
  assert.throws(
    () => parseParcelsFile({ ...base, parcels: [{ parcelId: 'x', hexes: [{ q: 0.5, r: 0 }] }] }),
    /must be integers/,
  );
});
