/**
 * Battle logistics — provisions (docs/04 §7c.1) — MVP slice.
 *
 * CT buys Food (the battle clock + march rations), Gold and Wood (the attacker's
 * temporary command-center budget). Armies are provisioned only while in
 * GARRISON at a friendly territory; raiseArmy buys a standard pack by default
 * (see demoWorld.raiseCost). All prices ⚙ in balance.json `provisions`.
 *
 * Pure integer money (ct_units); no randomness — fully deterministic.
 */
import { type Army, type Balance, loadBalance } from '@clashfront/shared';
import { spendCT } from './economy';
import type { WorldState } from './state';

/** A provision purchase / carried-stock triple. Integers ≥ 0. */
export interface ProvisionOrder {
  food: number;
  gold: number;
  wood: number;
}

/** Live soldiers in an army (sum of stack counts). */
export function troopCount(army: Pick<Army, 'units'>): number {
  return army.units.reduce((n, s) => n + s.count, 0);
}

/** CT cost (ct_units) of a provision order at balance prices. */
export function provisionCostCtUnits(order: ProvisionOrder, balance: Balance = loadBalance()): number {
  const p = balance.provisions;
  return order.food * p.ctUnitsPerFood + order.gold * p.ctUnitsPerGold + order.wood * p.ctUnitsPerWood;
}

/** The standard provision pack for `troops` soldiers (bought at raiseArmy). */
export function defaultProvisionsFor(troops: number, balance: Balance = loadBalance()): ProvisionOrder {
  const p = balance.provisions;
  return {
    food: troops * p.defaultFoodPerSoldier,
    gold: troops * p.defaultGoldPerSoldier,
    wood: troops * p.defaultWoodPerSoldier,
  };
}

/** Food consumed per adjacency step while MARCHING (⚙ marchFoodPerStepPer100). */
export function marchFoodPerStep(army: Pick<Army, 'units'>, balance: Balance = loadBalance()): number {
  const troops = troopCount(army);
  if (troops === 0) return 0;
  return Math.max(1, Math.ceil((troops * balance.provisions.marchFoodPerStepPer100) / 100));
}

/** Food one battle needs for a side of `troops` soldiers (⚙ battleFoodNeedPer100). */
export function battleFoodNeed(troops: number, balance: Balance = loadBalance()): number {
  return Math.ceil((troops * balance.provisions.battleFoodNeedPer100) / 100);
}

/**
 * Endurance multiplier from food adequacy (docs/04 §7c.6): 1.0 fully fed,
 * linearly down to ⚙ enduranceFloor at zero food. `need` = battleFoodNeed(side).
 */
export function enduranceMultiplier(foodAvailable: number, need: number, balance: Balance = loadBalance()): number {
  const floor = balance.provisions.enduranceFloor;
  const adequacy = need <= 0 ? 1 : Math.min(1, foodAvailable / need);
  return floor + (1 - floor) * adequacy;
}

function assertOrder(order: ProvisionOrder): void {
  for (const key of ['food', 'gold', 'wood'] as const) {
    const v = order[key];
    if (!Number.isInteger(v) || v < 0) {
      throw new Error(`provisionArmy: ${key} must be a non-negative integer (got ${String(v)})`);
    }
  }
}

/**
 * Provision an army with CT-bought food/gold/wood (docs/04 §7c.1).
 * Only allowed while the army is in GARRISON at a friendly territory
 * (its own governor's parcel). Cost is deducted from the owner's CT wallet;
 * throws (without mutating) on any violation. Returns the ct_units charged.
 */
export function provisionArmy(
  state: WorldState,
  armyId: string,
  order: ProvisionOrder,
  balance: Balance = loadBalance(),
): { costCtUnits: number } {
  const a = state.armies.get(armyId);
  if (a === undefined || a.state === 'DISBANDED') throw new Error(`provisionArmy: no such army ${armyId}`);
  assertOrder(order);
  if (a.state !== 'GARRISON') {
    throw new Error(`provisionArmy: army must be in GARRISON to provision (state=${a.state})`);
  }
  const terrId = state.hexes.get(a.hexId)?.territoryId;
  const terr = terrId === undefined ? undefined : state.territories.get(terrId);
  if (terr === undefined || terr.governorId !== a.ownerGovernorId) {
    throw new Error('provisionArmy: army is not at a friendly territory');
  }
  const costCtUnits = provisionCostCtUnits(order, balance);
  const wallet = state.ctBalances?.get(a.ownerGovernorId);
  if (wallet === undefined) throw new Error(`provisionArmy: governor ${a.ownerGovernorId} has no CT wallet`);
  if (wallet < costCtUnits) throw new Error(`provisionArmy: insufficient CT (${wallet} < ${costCtUnits} ct_units)`);

  state.ctBalances!.set(a.ownerGovernorId, wallet - costCtUnits);
  // E1: the provisioning spend flows back into the world around the army's parcel.
  spendCT(state, a.ownerGovernorId, costCtUnits, a.hexId, 'provision', balance);
  a.provisions.food += order.food;
  a.provisions.gold += order.gold;
  a.provisions.wood += order.wood;
  a.version += 1;
  return { costCtUnits };
}
