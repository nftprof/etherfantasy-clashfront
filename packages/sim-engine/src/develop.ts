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
import { burnCT, creditWallet, spendCT } from './economy';
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
  // E1: the construction spend flows back into the world around the parcel.
  spendCT(state, t.governorId, costCtUnits, t.hexIds[0]!, 'develop', balance);
  // E4: book the invested CT (raze salvage basis; synthesizes pre-existing levels).
  state.devInvestedCt ??= new Map();
  const invested = state.devInvestedCt.get(territoryId) ?? {};
  invested[track] = investedCtUnits(state, territoryId, track, balance) + costCtUnits;
  state.devInvestedCt.set(territoryId, invested);
  t.development[track] = cur + 1;
  t.lastTroddenTick = state.world.tick;
  t.version += 1;
  return { level: cur + 1, costCtUnits };
}

/** Synthetic invested CT for `level` seeded levels: Σ cost curve 0..level−1 (E4). */
export function syntheticInvestedCtUnits(
  track: DevelopmentTrack,
  level: number,
  balance: Balance = loadBalance(),
): number {
  let total = 0;
  for (let l = 0; l < level; l++) total += developCostCtUnits(track, l, balance);
  return total;
}

/**
 * CT invested in `track` on a territory (E4): the booked figure when develop
 * orders built it, else the synthetic cost-curve figure for levels that came
 * from world seeding (genesis AGRI 1 etc.).
 */
export function investedCtUnits(
  state: WorldState,
  territoryId: string,
  track: DevelopmentTrack,
  balance: Balance = loadBalance(),
): number {
  const booked = state.devInvestedCt?.get(territoryId)?.[track];
  if (booked !== undefined) return booked;
  const t = state.territories.get(territoryId);
  if (t === undefined) return 0;
  return syntheticInvestedCtUnits(track, t.development[track], balance);
}

/**
 * E4 — RAZE one development level (docs/briefs/FEATURESET-3-ECONOMY.md):
 * deliberate peacetime strip-mining of land you hold (typically freshly
 * conquered). Removes ONE level of `track`; the razer's wallet recovers
 * ⚙ razeSalvagePct of that level's ORIGINAL cost, the rest burns.
 *
 * Accounting (E5 conservation): the level's build cost was fully redistributed
 * by the splitter when it was built — the value "stored in the walls" is not
 * held in any CT bucket. Raze therefore re-mints the level's original cost as
 * an explicit, marked faucet and immediately splits it salvage-to-wallet /
 * rest-to-burn (REWARD source 'mint' + BURN source 'mint' in the settlement
 * journal). Every build→raze cycle still nets heavily negative for the razer
 * (100% spent, ⚙ 40% recovered), and supply-wise burns splitter-burn + 60% of
 * the re-mint. Throws (without mutating) on ungoverned land or level 0.
 * Ownership/authorization is the caller's (server's) job.
 */
export function razeTerritory(
  state: WorldState,
  territoryId: string,
  track: DevelopmentTrack,
  balance: Balance = loadBalance(),
): { level: number; salvageCtUnits: number; burnedCtUnits: number } {
  const t = state.territories.get(territoryId);
  if (t === undefined) throw new Error(`razeTerritory: unknown territory ${territoryId}`);
  if (t.governorKind === 'SYSTEM') throw new Error(`razeTerritory: ${t.name} is ungoverned wilds`);
  const cur = t.development[track];
  if (cur <= 0) throw new Error(`razeTerritory: ${track} has no level to raze`);
  const levelCost = developCostCtUnits(track, cur - 1, balance);
  const salvageCtUnits = Math.floor(levelCost * balance.economy.razeSalvagePct);
  const burnedCtUnits = levelCost - salvageCtUnits;
  creditWallet(state, t.governorId, salvageCtUnits, 'raze_salvage', 'mint');
  burnCT(state, t.governorId, burnedCtUnits, 'raze', 'mint');
  state.devInvestedCt ??= new Map();
  const invested = state.devInvestedCt.get(territoryId) ?? {};
  invested[track] = Math.max(0, investedCtUnits(state, territoryId, track, balance) - levelCost);
  state.devInvestedCt.set(territoryId, invested);
  t.development[track] = cur - 1;
  t.lastTroddenTick = state.world.tick;
  t.version += 1;
  return { level: cur - 1, salvageCtUnits, burnedCtUnits };
}
