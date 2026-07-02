/**
 * Territory development — Feature Set 2 F4 (docs/briefs/FEATURESET-2.md, docs/02 §7).
 *
 * The Develop order: CT cost = ⚙ development.baseCostCtUnits[track] ×
 * costGrowthPerLevel^currentLevel, capped at ⚙ development.maxLevel. Effects
 * are wired into the sim (all ⚙ balance.developmentEffects):
 *   AGRI → food production per tick (PRODUCTION phase, integer carry);
 *   DEF  → defender WarScore ×(1 + x×level) in battles on the parcel;
 *   ECON → CT trickle to the governor per tick (integer carry);
 *   MIL  → training-cost discount when raising armies on the parcel.
 *
 * Pure integer money; no randomness — fully deterministic.
 */
import { type Balance, type DevelopmentTrack, loadBalance } from '@clashfront/shared';
import type { WorldState } from './state';

/** CT cost (ct_units) to raise `track` from `currentLevel` to the next level — docs/02 §7 geometric growth. */
export function developCostCtUnits(
  track: DevelopmentTrack,
  currentLevel: number,
  balance: Balance = loadBalance(),
): number {
  return Math.round(
    balance.development.baseCostCtUnits[track] * Math.pow(balance.development.costGrowthPerLevel, currentLevel),
  );
}

/**
 * Raise one development track by one level on a governed territory, paid from
 * the governor's CT wallet. Throws (without mutating) on ungoverned land, the
 * ⚙ maxLevel cap, or insufficient CT. Ownership/authorization is the caller's
 * (server's) job — the sim only enforces world rules.
 */
export function developTerritory(
  state: WorldState,
  territoryId: string,
  track: DevelopmentTrack,
  balance: Balance = loadBalance(),
): { level: number; costCtUnits: number } {
  const t = state.territories.get(territoryId);
  if (t === undefined) throw new Error(`developTerritory: unknown territory ${territoryId}`);
  if (t.governorKind === 'SYSTEM') throw new Error(`developTerritory: ${t.name} is ungoverned wilds`);
  const cur = t.development[track];
  if (cur >= balance.development.maxLevel) {
    throw new Error(`developTerritory: ${track} already at max level (${balance.development.maxLevel})`);
  }
  const costCtUnits = developCostCtUnits(track, cur, balance);
  const wallet = state.ctBalances?.get(t.governorId);
  if (wallet === undefined) throw new Error(`developTerritory: governor ${t.governorId} has no CT wallet`);
  if (wallet < costCtUnits) {
    throw new Error(`developTerritory: insufficient CT (${wallet} < ${costCtUnits} ct_units)`);
  }
  state.ctBalances!.set(t.governorId, wallet - costCtUnits);
  t.development[track] = cur + 1;
  t.lastTroddenTick = state.world.tick;
  t.version += 1;
  return { level: cur + 1, costCtUnits };
}
