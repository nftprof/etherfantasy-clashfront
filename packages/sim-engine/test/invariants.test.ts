/**
 * Invariant tests after N ticks — docs/08 §5 (the checklist AGENTS.md §5 gates merges on).
 * Covered here: no negative resources (inv. 5), prosperity/morale bounds (inv. 6),
 * 1 Territory ↔ 1 LandNFT pairing (inv. 2), valid army position/path (inv. 8),
 * SIEGE shape (inv. 9), tick monotonicity.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSTANTS, createRng } from '@clashfront/shared';
import { runTick, seedWorld, type WorldState } from '../src/index';

const TICKS = 200;

function worldAfter(ticks: number, seed = 'invariants-seed'): WorldState {
  const rng = createRng(seed);
  const state = seedWorld({ name: 'Invariantia', seed }, rng.fork('worldgen'));
  for (let t = 1; t <= ticks; t++) runTick(state, t, rng.fork('sim'));
  return state;
}

function checkInvariants(state: WorldState): void {
  // inv. 5 + 6 — territories
  for (const t of state.territories.values()) {
    assert.ok(t.population >= 0, `${t.name}: negative population`);
    assert.ok(t.foodStock >= 0, `${t.name}: negative foodStock`);
    assert.ok(t.ctTreasury >= 0, `${t.name}: negative ctTreasury`);
    assert.ok(Number.isInteger(t.ctTreasury), `${t.name}: ctTreasury must be integer ct_units`);
    assert.ok(Number.isInteger(t.foodStock), `${t.name}: foodStock must be integer`);
    assert.ok(
      t.prosperity >= CONSTANTS.PROSPERITY_MIN && t.prosperity <= CONSTANTS.PROSPERITY_MAX,
      `${t.name}: prosperity out of [0,100]`,
    );
    assert.ok(
      t.morale >= CONSTANTS.MORALE_MIN && t.morale <= CONSTANTS.MORALE_MAX,
      `${t.name}: morale out of [0,100]`,
    );
  }

  // inv. 2 — 1 Territory ↔ 1 LandNFT, never orphaned, both directions
  assert.equal(state.territories.size, state.landNfts.size, 'territory/NFT count mismatch');
  const seenNfts = new Set<string>();
  for (const t of state.territories.values()) {
    const nft = state.landNfts.get(t.landNftId);
    assert.ok(nft, `${t.name}: landNftId ${t.landNftId} orphaned`);
    assert.equal(nft.territoryId, t.id, `${t.name}: NFT back-reference broken`);
    assert.ok(!seenNfts.has(nft.id), `NFT ${nft.id} paired with two territories`);
    seenNfts.add(nft.id);
  }
  for (const nft of state.landNfts.values()) {
    assert.ok(state.territories.has(nft.territoryId), `NFT ${nft.id}: territory orphaned`);
  }

  // inv. 5, 6, 8 — armies
  for (const a of state.armies.values()) {
    assert.ok(a.supply >= 0 && a.supply <= a.supplyMax, `army ${a.id}: supply out of bounds`);
    assert.ok(
      a.morale >= CONSTANTS.MORALE_MIN && a.morale <= CONSTANTS.MORALE_MAX,
      `army ${a.id}: morale out of [0,100]`,
    );
    assert.ok(state.hexes.has(a.hexId), `army ${a.id}: position ${a.hexId} is not a real hex`);
    for (const stack of a.units) assert.ok(stack.count >= 0, `army ${a.id}: negative unit count`);
    if (a.state === 'MARCHING') {
      assert.ok(a.path !== undefined && a.path.length > 0, `marching army ${a.id}: no path`);
      assert.ok(a.arrivalTick !== undefined, `marching army ${a.id}: no arrivalTick`);
    }
  }

  // hex → territory references are real
  for (const h of state.hexes.values()) {
    if (h.territoryId !== undefined) {
      assert.ok(state.territories.has(h.territoryId), `hex ${h.id}: dangling territoryId`);
    }
  }

  // inv. 9 — every SIEGE battle references exactly one defenderTerritoryId
  for (const b of state.battles.values()) {
    if (b.type === 'SIEGE') {
      assert.ok(b.defenderTerritoryId, `SIEGE ${b.id}: missing defenderTerritoryId`);
    }
  }
}

test('freshly seeded world obeys all invariants', () => {
  checkInvariants(worldAfter(0));
});

test(`invariants hold after ${TICKS} ticks`, () => {
  const state = worldAfter(TICKS);
  assert.equal(state.world.tick, TICKS, 'tick monotonicity: world.tick must equal ticks run');
  checkInvariants(state);
});

test('invariants hold at every intermediate tick (first 50)', () => {
  const seed = 'stepwise-seed';
  const rng = createRng(seed);
  const state = seedWorld({ name: 'Stepwise', seed }, rng.fork('worldgen'));
  for (let t = 1; t <= 50; t++) {
    runTick(state, t, rng.fork('sim'));
    checkInvariants(state);
  }
});

test('seed world shape matches spec (2 regions, 12 hexes, 4 territories, 2 governors, 1 army)', () => {
  const state = worldAfter(0);
  assert.equal(state.regions.size, 2);
  assert.equal(state.hexes.size, 12);
  assert.equal(state.territories.size, 4);
  assert.equal(state.armies.size, 1);
  const governors = new Set([...state.territories.values()].map((t) => t.governorId));
  assert.equal(governors.size, 2);
  for (const t of state.territories.values()) assert.equal(t.governorKind, 'NPC_KINGDOM');
  const army = [...state.armies.values()][0]!;
  assert.equal(army.state, 'GARRISON');
  const garrisonTerr = [...state.territories.values()].find((t) => t.garrisonArmyId === army.id);
  assert.ok(garrisonTerr, 'army must be someone\'s garrison');
  assert.ok(garrisonTerr.hexIds.includes(army.hexId), 'garrison army stands on its territory');
});
