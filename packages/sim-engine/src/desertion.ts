/**
 * Wave 4.8 — desertion in the field (docs/03 §8, docs/01 §5.4). A demoralized
 * army bleeds troops every tick; where they GO is the interesting part.
 *
 * RATE (fraction of the army/day), evaluated per tick, applied daily-prorated:
 *   morale ≥ DESERTION_MORALE_THRESHOLD (25) ⇒ 0. Else
 *   rate = base × moraleGap
 *          × (supply == 0 ? supplyCutMult : 1)
 *          × (starving ? hungerMult : 1)
 *          × (RETREATING ? retreatingMult : 1)
 *          × (1 − 0.25 × leadership/100)     // officer resistance (fame proxy)
 *   capped at hardCapPerDay.
 *
 * DESTINATION of the deserters (⚙ splits): a share slip home to the nearest
 * friendly territory's populace (⚙ desertersReturnToPopulationPct — only if
 * the army stands on its OWN land; cut off in enemy country there's no home to
 * return to), a share turn brigand — accruing on the hex until a full band
 * (⚙ banditMinBand) rises as a WILD "Deserter Bandits" army the battle phase
 * then treats as hostile — and the rest simply vanish.
 *
 * Determinism: integer-carry accrual (state.desertionCarry / banditCarry),
 * sorted iteration, no RNG except the id mint for a spawned band.
 */
import { type Balance, CONSTANTS, type Rng, TICKS_PER_DAY, newId } from '@clashfront/shared';
import type { Army, UnitStack } from '@clashfront/shared';
import { chronicleAppend } from './mythics';
import { sortedIds, type WorldState } from './state';

/** Leadership 0..100 for the desertion-resistance term — the leading officer's fame (0 if none). */
export function leadershipOf(state: WorldState, army: Army): number {
  if (army.heroId === undefined) return 0;
  const officer = state.officers?.get(army.ownerGovernorId)?.find((o) => o.id === army.heroId);
  if (officer === undefined) return 0;
  return Math.max(0, Math.min(100, officer.fame));
}

/** Desertion rate as a fraction of the army per DAY (docs/03 §8); 0 while morale is healthy. */
export function desertionRatePerDay(state: WorldState, army: Army, balance: Balance): number {
  if (army.morale >= CONSTANTS.DESERTION_MORALE_THRESHOLD) return 0;
  const d = balance.desertion;
  const moraleGap = (CONSTANTS.DESERTION_MORALE_THRESHOLD - army.morale) / CONSTANTS.DESERTION_MORALE_THRESHOLD;
  let rate = d.basePerDayAtZeroMorale * moraleGap;
  if (army.supply === 0) rate *= d.supplyCutMult;
  if (army.provisions.food === 0) rate *= d.hungerMult; // "unfed" proxy (docs/03 §8 unfedDays≥2)
  if (army.state === 'RETREATING') rate *= d.retreatingMult;
  rate *= 1 - 0.25 * (leadershipOf(state, army) / 100);
  return Math.min(rate, d.hardCapPerDay);
}

function troopCount(a: Army): number {
  return a.units.reduce((n, s) => n + s.count, 0);
}

/** Remove `n` troops from an army, largest stacks first (deterministic). Returns actual removed. */
function shedTroops(a: Army, n: number): number {
  let left = n;
  const stacks = [...a.units].sort((x, y) => y.count - x.count || (x.unitClass < y.unitClass ? -1 : 1));
  for (const stack of stacks) {
    if (left === 0) break;
    const take = Math.min(stack.count, left);
    stack.count -= take;
    left -= take;
  }
  if (left < n) a.version += 1;
  return n - left;
}

/**
 * Apply one tick of desertion across every army (called from phaseMorale AFTER
 * the morale deltas land). Integer carry: the daily deserter count accrues over
 * TICKS_PER_DAY, whole deserters leave when the carry rolls over.
 */
export function runDesertion(state: WorldState, rng: Rng, balance: Balance): void {
  const d = balance.desertion;
  const wildGov = [...(state.governorKinds?.entries() ?? [])].find(([, k]) => k === 'SYSTEM')?.[0];
  state.desertionCarry ??= new Map();
  state.banditCarry ??= new Map();

  for (const id of sortedIds(state.armies)) {
    const a = state.armies.get(id)!;
    if (a.state === 'DISBANDED' || a.kind === 'CARAVAN') continue;
    const rate = desertionRatePerDay(state, a, balance);
    if (rate <= 0) {
      state.desertionCarry.delete(id);
      continue;
    }
    const perDay = Math.floor(rate * troopCount(a));
    if (perDay <= 0) continue; // detachment too small to lose a whole soldier/day
    const carry = (state.desertionCarry.get(id) ?? 0) + perDay;
    const desert = Math.floor(carry / TICKS_PER_DAY);
    state.desertionCarry.set(id, carry % TICKS_PER_DAY);
    if (desert <= 0) continue;

    const gone = shedTroops(a, desert);
    if (gone === 0) continue;

    // Destination split. The shares accrue FRACTIONALLY (per-tick `gone` is only
    // 1–2 soldiers, so flooring gone×pct would swallow the whole wild share):
    // population takes its cut immediately (integer floor is fine at 50%); the
    // wild-bandit share accumulates on the hex until a full band can rise.
    const terr = territoryOf(state, a.hexId);
    const onOwnLand = terr !== undefined && terr.governorId === a.ownerGovernorId && terr.governorKind !== 'SYSTEM';
    if (onOwnLand && terr !== undefined) {
      const toPop = Math.floor(gone * d.desertersReturnToPopulationPct);
      if (toPop > 0) {
        terr.population += toPop;
        terr.version += 1;
      }
    } else if (wildGov !== undefined) {
      // Cut off in hostile/wild country: no home to return to — the wild share
      // turns brigand. Accrue the fractional share until a band forms.
      const acc = (state.banditCarry.get(a.hexId) ?? 0) + gone * d.desertersReturnToWildBanditPct;
      if (acc >= d.banditMinBand) {
        const band = Math.floor(acc);
        spawnDeserterBandits(state, a.hexId, band, wildGov, rng);
        state.banditCarry.set(a.hexId, acc - band);
      } else {
        state.banditCarry.set(a.hexId, acc);
      }
    }

    if (troopCount(a) === 0) {
      a.state = 'DISBANDED';
      delete a.path;
      delete a.arrivalTick;
      state.desertionCarry.delete(id);
    }
  }
}

function territoryOf(state: WorldState, hexId: string) {
  const terrId = state.hexes.get(hexId)?.territoryId;
  return terrId === undefined ? undefined : state.territories.get(terrId);
}

/** Raise a WILD "Deserter Bandits" army on a hex — battle spawning treats it as hostile. */
function spawnDeserterBandits(
  state: WorldState,
  hexId: string,
  count: number,
  wildGov: string,
  rng: Rng,
): void {
  const units: UnitStack[] = [{ unitClass: 'INFANTRY', count, veterancy: 0, hp: 100 }];
  const army: Army = {
    id: newId('army', { time: state.world.tick, random: () => rng.next() }),
    worldId: state.world.id,
    ownerGovernorId: wildGov,
    state: 'GARRISON',
    hexId,
    units,
    provisions: { food: 0, gold: 0, wood: 0 },
    supply: CONSTANTS.SUPPLY_MAX_DEFAULT,
    supplyMax: CONSTANTS.SUPPLY_MAX_DEFAULT,
    morale: 50,
    supplyTrainIds: [],
    version: 1,
  };
  state.armies.set(army.id, army);
  state.monsterNames ??= new Map();
  state.monsterNames.set(army.id, 'Deserter Bandits');
  const terr = territoryOf(state, hexId);
  chronicleAppend(state, {
    tick: state.world.tick,
    kind: 'BANDITS_RISE',
    text: `Deserters turn to banditry${terr !== undefined ? ` near ${terr.name}` : ''} — ${count} strong.`,
  });
}
