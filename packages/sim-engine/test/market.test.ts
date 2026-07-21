/**
 * AMM local markets — WORLD-BUILD-OUT-PLAN wave 2. Constant-product pricing,
 * fee burn by enrichment tier, spread round-trip (buy-then-sell loses the
 * spread), balancer arbitrage only on egregious gaps, determinism.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSTANTS, createRng, loadBalance } from '@clashfront/shared';
import {
  addGovernor,
  baselinePrice,
  claimTerritory,
  type DemoWorldFile,
  enrichmentTier,
  loadDemoWorld,
  marketBuy,
  marketSell,
  poolOf,
  runMarketBalancer,
  spotPrice,
  stockpileOf,
  type WorldState,
} from '../src/index';

const BALANCE = loadBalance();
const CT = CONSTANTS.CT_UNITS_PER_CT;

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

function fixture(seed: string) {
  const rng = createRng(seed);
  const state = loadDemoWorld(makeGrid(3, 3), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const { governorId } = addGovernor(state, rng.fork('orders'), {
    name: 'Trader', kind: 'PLAYER', ctUnits: 50_000 * CT, officerNames: ['Irene', 'Choco', 'Maenak'],
  });
  const ids = [...state.territories.keys()].sort();
  const homeId = ids[0]!;
  claimTerritory(state, homeId, governorId);
  return { state, rng, governorId, homeId };
}

test('pool seeds at baseline price; buying raises the spot, selling lowers it', () => {
  const f = fixture('mkt-seed');
  const pool = poolOf(f.state, f.homeId, 'iron', BALANCE);
  assert.equal(Math.round(spotPrice(pool)), baselinePrice('iron', BALANCE), 'fresh pool at baseline');
  const r1 = marketBuy(f.state, f.governorId, f.homeId, 'iron', 10, BALANCE);
  assert.ok(r1.price > baselinePrice('iron', BALANCE), 'buy raises price');
  // Sell needs stock — the buy deposited 10 iron into the parcel stockpile.
  const r2 = marketSell(f.state, f.governorId, f.homeId, 'iron', 10, BALANCE);
  assert.ok(r2.price < r1.price, 'sell lowers price back down');
});

test('round-trip loses the spread (fees burn — house always wins)', () => {
  const f = fixture('mkt-spread');
  const wallet0 = f.state.ctBalances!.get(f.governorId)!;
  const buy = marketBuy(f.state, f.governorId, f.homeId, 'wood', 20, BALANCE);
  const sell = marketSell(f.state, f.governorId, f.homeId, 'wood', 20, BALANCE);
  const wallet1 = f.state.ctBalances!.get(f.governorId)!;
  assert.ok(wallet1 < wallet0, `round-trip loses money (${wallet0} → ${wallet1})`);
  assert.ok(buy.feeBurned > 0 && sell.feeBurned > 0, 'both sides burned fees');
});

test('insufficient CT / stock / liquidity all throw', () => {
  const f = fixture('mkt-guards');
  const rmPool = poolOf(f.state, f.homeId, 'rareMetal', BALANCE);
  assert.throws(() => marketBuy(f.state, f.governorId, f.homeId, 'rareMetal', rmPool.resource, BALANCE), /liquidity/);
  assert.throws(() => marketSell(f.state, f.governorId, f.homeId, 'iron', 5, BALANCE), /not enough stock/);
  f.state.ctBalances!.set(f.governorId, 1);
  assert.throws(() => marketBuy(f.state, f.governorId, f.homeId, 'iron', 10, BALANCE), /insufficient CT/);
});

test('enrichment tier tightens the fee', () => {
  const f = fixture('mkt-tier');
  assert.equal(enrichmentTier(f.state, f.homeId, BALANCE), 0);
  f.state.enrichmentPools ??= new Map();
  f.state.enrichmentPools.set(f.homeId, BALANCE.market.tierThresholdsCt[4]!);
  assert.equal(enrichmentTier(f.state, f.homeId, BALANCE), 5, 'max tier at top threshold');
});

test('balancer: fixes an egregious gap, ignores a normal one, respects caps', () => {
  const f = fixture('mkt-balancer');
  const ids = [...f.state.territories.keys()].sort();
  const a = ids[0]!; const b = ids[1]!;
  // Seed both pools, then distort A to an egregious surplus (cheap) vs B.
  const poolA = poolOf(f.state, a, 'iron', BALANCE);
  const poolB = poolOf(f.state, b, 'iron', BALANCE);
  poolA.resource = 500; poolA.gold = 500;      // spot 1.0 (cheap)
  poolB.resource = 100; poolB.gold = 1000;     // spot 10.0 (dear) — 10× gap
  const gapBefore = spotPrice(poolB) / spotPrice(poolA);
  runMarketBalancer(f.state, BALANCE);
  const gapAfter = spotPrice(poolB) / spotPrice(poolA);
  assert.ok(gapAfter < gapBefore, `balancer narrowed the gap (${gapBefore.toFixed(1)}× → ${gapAfter.toFixed(1)}×)`);

  // Normal gap (≈15%) is untouched.
  const g = fixture('mkt-balancer2');
  const ids2 = [...g.state.territories.keys()].sort();
  const pA = poolOf(g.state, ids2[0]!, 'wood', BALANCE);
  const pB = poolOf(g.state, ids2[1]!, 'wood', BALANCE);
  pA.resource = 100; pA.gold = 200;   // spot 2.0
  pB.resource = 100; pB.gold = 230;   // spot 2.3 — 15% gap < 30% floor
  const beforeA = { ...pA }; const beforeB = { ...pB };
  runMarketBalancer(g.state, BALANCE);
  assert.deepEqual({ ...pA }, beforeA, 'sub-threshold pool A untouched');
  assert.deepEqual({ ...pB }, beforeB, 'sub-threshold pool B untouched');
});

test('trades + balancer are deterministic (same ops ⇒ same pools)', () => {
  const run = (seed: string) => {
    const f = fixture(seed);
    marketBuy(f.state, f.governorId, f.homeId, 'iron', 7, BALANCE);
    marketSell(f.state, f.governorId, f.homeId, 'iron', 3, BALANCE);
    runMarketBalancer(f.state, BALANCE);
    return JSON.stringify([...f.state.markets!.entries()]);
  };
  assert.equal(run('mkt-det'), run('mkt-det'), 'byte-identical market state');
});

test('markets survive structuredClone snapshot round-trip', () => {
  const f = fixture('mkt-snap');
  marketBuy(f.state, f.governorId, f.homeId, 'fur', 5, BALANCE);
  const clone = structuredClone(f.state);
  assert.deepEqual(clone.markets?.get(f.homeId), f.state.markets?.get(f.homeId));
});

test('food trades route to territory foodStock (not the stockpile)', () => {
  const f = fixture('mkt-food');
  const terr = f.state.territories.get(f.homeId)!;
  const food0 = terr.foodStock;
  marketBuy(f.state, f.governorId, f.homeId, 'food', 10, BALANCE);
  assert.equal(terr.foodStock, food0 + 10, 'food lands in foodStock');
  assert.equal(stockpileOf(f.state, f.homeId).wood, 0, 'stockpile untouched');
  marketSell(f.state, f.governorId, f.homeId, 'food', 10, BALANCE);
  assert.equal(terr.foodStock, food0, 'food sold back out of foodStock');
});
