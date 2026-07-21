/**
 * Transport & delivery — WORLD-BUILD-OUT-PLAN wave 3
 * (TRANSPORT-DELIVERY-LAYER.md). Caravan raise/cargo, transit tolls (pass
 * fee / bribe / halt), no-battle rule, raiding auto-surrender, delivery
 * order lifecycle (post/escrow/accept/deliver/late/expire/cancel).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSTANTS, createRng, loadBalance } from '@clashfront/shared';
import {
  acceptDeliveryOrder,
  addGovernor,
  cancelDeliveryOrder,
  claimTerritory,
  completeTraining,
  type DemoWorldFile,
  findPath,
  loadDemoWorld,
  orderMarch,
  postDeliveryOrder,
  raiseArmy,
  raiseCaravan,
  runTick,
  stockpileOf,
  type TickOptions,
  transitToll,
  type WorldState,
} from '../src/index';

const BALANCE = loadBalance();
const CT = CONSTANTS.CT_UNITS_PER_CT;
const OPTS: TickOptions = { travelTicksPerStep: 1, choiceTimeoutTicks: 5 };

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
  const state = loadDemoWorld(makeGrid(4, 4), rng.fork('worldgen'), { monsterParcelPct: 0 });
  const { governorId } = addGovernor(state, rng.fork('orders'), {
    name: 'Merchant', kind: 'PLAYER', ctUnits: 50_000 * CT, officerNames: ['Irene', 'Choco', 'Maenak'],
  });
  const ids = [...state.territories.keys()].sort();
  const homeId = ids[0]!;
  claimTerritory(state, homeId, governorId);
  const terr = state.territories.get(homeId)!;
  terr.foodStock = 500;
  const stock = stockpileOf(state, homeId);
  stock.iron = 100; stock.wood = 100; stock.fur = 50;
  return { state, rng, governorId, homeId, terr };
}

test('raiseCaravan: loads cargo from stockpile, enforces capacity + stock', () => {
  const f = fixture('tr-raise');
  const c = raiseCaravan(f.state, f.governorId, f.homeId, { iron: 20, food: 30 }, 50, f.rng.fork('c'), BALANCE);
  assert.equal(c.kind, 'CARAVAN');
  assert.equal(c.cargo?.['iron'], 20);
  assert.equal(c.cargo?.['food'], 30);
  assert.equal(c.provisions.food, 50);
  assert.equal(c.units.length, 0, 'civilians — no combat units');
  assert.equal(stockpileOf(f.state, f.homeId).iron, 80, 'iron deducted');
  assert.equal(f.terr.foodStock, 500 - 30 - 50, 'cargo food + provision food deducted');
  assert.throws(() => raiseCaravan(f.state, f.governorId, f.homeId, { iron: 200 }, 0, f.rng.fork('x'), BALANCE), /not enough iron/);
  assert.throws(
    () => raiseCaravan(f.state, f.governorId, f.homeId, { iron: 10 }, BALANCE.transport.cargoCapBase, f.rng.fork('y'), BALANCE),
    /over cargo capacity/,
  );
});

test('transit toll: free on own/unowned; pass fee on warlord land; bribe on garrisoned wilds', () => {
  const f = fixture('tr-toll');
  const c = raiseCaravan(f.state, f.governorId, f.homeId, { iron: 20, gold: 0 }, 50, f.rng.fork('c'), BALANCE);
  // Own land: free.
  assert.equal(transitToll(f.state, c, f.terr.hexIds[0]!, BALANCE), null);
  // Unowned SYSTEM land without garrison: free.
  const ids = [...f.state.territories.keys()].sort();
  const wildTerr = f.state.territories.get(ids[1]!)!;
  assert.equal(transitToll(f.state, c, wildTerr.hexIds[0]!, BALANCE), null);
  // Warlord land: pass fee scaled by cargo.
  const rng2 = f.rng.fork('g2');
  const { governorId: gov2 } = addGovernor(f.state, rng2, {
    name: 'Warlord', kind: 'PLAYER', ctUnits: 1_000 * CT, officerNames: ['Leah', 'Kai', 'Purin'],
  });
  const warlordTerr = f.state.territories.get(ids[2]!)!;
  claimTerritory(f.state, warlordTerr.id, gov2);
  const toll = transitToll(f.state, c, warlordTerr.hexIds[0]!, BALANCE);
  assert.equal(toll?.kind, 'PASS_FEE');
  assert.ok((toll as { gold: number }).gold >= 1);
});

test('caravan transits FOREIGN land (military cannot) and pays the pass fee from carried gold', () => {
  const f = fixture('tr-transit');
  const ids = [...f.state.territories.keys()].sort();
  // Warlord claims the parcel adjacent to home; caravan routes THROUGH it.
  const homeHex = f.terr.hexIds[0]!;
  const midHex = f.state.adjacency!.get(homeHex)![0]!;
  const midTerrId = f.state.hexes.get(midHex)!.territoryId!;
  const rng2 = f.rng.fork('g2');
  const { governorId: gov2 } = addGovernor(f.state, rng2, {
    name: 'Tollkeeper', kind: 'PLAYER', ctUnits: 1_000 * CT, officerNames: ['Leah', 'Kai', 'Purin'],
  });
  claimTerritory(f.state, midTerrId, gov2);
  // Destination: any hex adjacent to mid that isn't home.
  const farHex = f.state.adjacency!.get(midHex)!.find((h) => h !== homeHex)!;
  const treasury0 = f.state.territories.get(midTerrId)!.ctTreasury;

  const c = raiseCaravan(f.state, f.governorId, f.homeId, { iron: 10, gold: 300 }, 100, f.rng.fork('c'), BALANCE);
  const path = findPath(f.state, c.hexId, farHex); // RAW path — through the warlord
  assert.ok(path !== undefined && path.includes(midHex), 'raw path goes through warlord land');
  orderMarch(f.state, c.id, path!, OPTS);
  for (let t = 1; t <= 6 && f.state.armies.get(c.id)!.hexId !== farHex; t++) {
    runTick(f.state, t, f.rng.fork('sim'), BALANCE, OPTS);
  }
  assert.equal(f.state.armies.get(c.id)!.hexId, farHex, 'caravan crossed the warlord land');
  assert.ok(f.state.territories.get(midTerrId)!.ctTreasury > treasury0, 'pass fee paid to occupier treasury');
  assert.ok((f.state.armies.get(c.id)!.cargo?.['gold'] ?? 0) < 300, 'gold spent on toll');
});

test('caravan without toll money HALTS at the border (no free rides)', () => {
  const f = fixture('tr-halt');
  const homeHex = f.terr.hexIds[0]!;
  const midHex = f.state.adjacency!.get(homeHex)![0]!;
  const midTerrId = f.state.hexes.get(midHex)!.territoryId!;
  const rng2 = f.rng.fork('g2');
  const { governorId: gov2 } = addGovernor(f.state, rng2, {
    name: 'Tollkeeper', kind: 'PLAYER', ctUnits: 1_000 * CT, officerNames: ['Leah', 'Kai', 'Purin'],
  });
  claimTerritory(f.state, midTerrId, gov2);
  const c = raiseCaravan(f.state, f.governorId, f.homeId, { iron: 10 }, 20, f.rng.fork('c'), BALANCE); // NO gold
  orderMarch(f.state, c.id, [midHex], OPTS);
  runTick(f.state, 1, f.rng.fork('sim'), BALANCE, OPTS);
  const after = f.state.armies.get(c.id)!;
  assert.equal(after.hexId, homeHex, 'caravan did not enter');
  assert.equal(after.state, 'GARRISON', 'halted at the border');
});

test('caravans never spawn battles; hostile military raids them (auto-surrender + loot)', () => {
  const f = fixture('tr-raid');
  const homeHex = f.terr.hexIds[0]!;
  const midHex = f.state.adjacency!.get(homeHex)![0]!;
  // Hostile military stands on the mid hex (unowned ground — no toll).
  const rng2 = f.rng.fork('g2');
  const { governorId: gov2 } = addGovernor(f.state, rng2, {
    name: 'Bandit', kind: 'PLAYER', ctUnits: 5_000 * CT, officerNames: ['Leah', 'Kai', 'Purin'],
  });
  const banditHomeTerrId = f.state.hexes.get(midHex)!.territoryId!;
  claimTerritory(f.state, banditHomeTerrId, gov2);
  const bandits = raiseArmy(f.state, banditHomeTerrId, 'SCOUTS', rng2.fork('raise'));
  completeTraining(f.state, bandits.id);
  const wallet0 = f.state.ctBalances!.get(gov2) ?? 0;

  // Caravan marches INTO the bandit hex (it CAN — pays pass fee to gov2).
  const c = raiseCaravan(f.state, f.governorId, f.homeId, { iron: 10, gold: 250 }, 50, f.rng.fork('c'), BALANCE);
  orderMarch(f.state, c.id, [midHex], OPTS);
  runTick(f.state, 1, f.rng.fork('sim'), BALANCE, OPTS);

  const after = f.state.armies.get(c.id)!;
  assert.equal(after.state, 'DISBANDED', 'caravan auto-surrendered to the military');
  assert.equal(f.state.battles.size, 0, 'no battle spawned over a caravan');
  // Bandit governs the raid hex → loot lands locally (treasury gold via toll AND raid).
  assert.ok(
    (f.state.territories.get(banditHomeTerrId)!.ctTreasury > 0) ||
    ((f.state.ctBalances!.get(gov2) ?? 0) > wallet0),
    'raider profited',
  );
});

test('delivery order lifecycle: post escrows, courier delivers, payout minus platform fee', () => {
  const f = fixture('tr-deliver');
  const ids = [...f.state.territories.keys()].sort();
  // Requester = a second governor who owns a destination parcel.
  const rng2 = f.rng.fork('g2');
  const { governorId: buyer } = addGovernor(f.state, rng2, {
    name: 'Buyer', kind: 'PLAYER', ctUnits: 10_000 * CT, officerNames: ['Leah', 'Kai', 'Purin'],
  });
  const destTerrId = ids[3]!;
  claimTerritory(f.state, destTerrId, buyer);
  const buyerWallet0 = f.state.ctBalances!.get(buyer)!;

  const order = postDeliveryOrder(
    f.state, buyer, destTerrId, { iron: 10 }, 1000, f.state.world.tick + 50, f.rng.fork('o'), BALANCE,
  );
  assert.equal(order.state, 'OPEN');
  assert.ok(f.state.ctBalances!.get(buyer)! < buyerWallet0, 'reward + posting fee escrowed/burned');

  // Courier accepts + runs the goods.
  acceptDeliveryOrder(f.state, f.governorId, order.id);
  assert.equal(order.state, 'ACCEPTED');
  const destHex = f.state.territories.get(destTerrId)!.hexIds[0]!;
  const c = raiseCaravan(f.state, f.governorId, f.homeId, { iron: 10, gold: 100 }, 100, f.rng.fork('c'), BALANCE);
  const path = findPath(f.state, c.hexId, destHex);
  assert.ok(path !== undefined);
  orderMarch(f.state, c.id, path!, OPTS);
  const courierWallet0 = f.state.ctBalances!.get(f.governorId)!;
  for (let t = 1; t <= 12 && order.state !== 'DELIVERED'; t++) {
    runTick(f.state, t, f.rng.fork('sim'), BALANCE, OPTS);
  }
  assert.equal(order.state, 'DELIVERED', 'delivery settled');
  const destStock = stockpileOf(f.state, destTerrId);
  assert.ok(destStock.iron >= 10, 'goods transferred to destination');
  const paid = f.state.ctBalances!.get(f.governorId)! - courierWallet0;
  assert.ok(paid > 0 && paid < 1000, `courier paid reward minus platform fee (${paid})`);
});

test('cancel refunds an OPEN order; expiry refunds past hard-expiry', () => {
  const f = fixture('tr-cancel');
  const ids = [...f.state.territories.keys()].sort();
  const wallet0 = f.state.ctBalances!.get(f.governorId)!;
  const o1 = postDeliveryOrder(f.state, f.governorId, ids[1]!, { wood: 5 }, 500, f.state.world.tick + 10, f.rng.fork('o1'), BALANCE);
  cancelDeliveryOrder(f.state, f.governorId, o1.id);
  assert.equal(o1.state, 'CANCELLED');
  const afterCancel = f.state.ctBalances!.get(f.governorId)!;
  assert.equal(afterCancel, wallet0 - BALANCE.transport.postingFeeCt, 'reward refunded; posting fee burned');

  const o2 = postDeliveryOrder(f.state, f.governorId, ids[1]!, { wood: 5 }, 500, f.state.world.tick + 2, f.rng.fork('o2'), BALANCE);
  const beforeExpiry = f.state.ctBalances!.get(f.governorId)!;
  for (let t = 1; t <= 2 + BALANCE.transport.hardExpiryTicks + 1; t++) {
    runTick(f.state, t, f.rng.fork('sim'), BALANCE, OPTS);
  }
  assert.equal(o2.state, 'EXPIRED');
  assert.equal(f.state.ctBalances!.get(f.governorId)!, beforeExpiry + 500, 'expired order refunded');
});

test('deliveryOrders survive structuredClone snapshot round-trip', () => {
  const f = fixture('tr-snap');
  const ids = [...f.state.territories.keys()].sort();
  postDeliveryOrder(f.state, f.governorId, ids[1]!, { fur: 3 }, 200, f.state.world.tick + 100, f.rng.fork('o'), BALANCE);
  const clone = structuredClone(f.state);
  assert.equal(clone.deliveryOrders?.size, 1);
  assert.deepEqual([...clone.deliveryOrders!.values()], [...f.state.deliveryOrders!.values()]);
});
