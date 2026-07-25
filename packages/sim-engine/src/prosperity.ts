/**
 * Wave 4.3 — the prosperity/tax heartbeat (docs/02 §3–§5, WORLD-BUILD-OUT-PLAN
 * wave 4 items 14–15).
 *
 * PROSPERITY (per tick): each governed territory computes a target
 *   25·foodScore + 25·devScore + 20·moraleScore + 15·popScore + 15·peaceScore
 * and moves toward it with an integer carry — growth ⚙ growthPerDay points/day,
 * decay ⚙ decayPerDay (collapse is twice as fast as recovery, per canon).
 * WILD/SEA parcels are SKIPPED: their `prosperity` field is the frozen Taming
 * Score proxy (docs/05 §3) and must not drift.
 *
 * PILLAGE SCARS: `state.pillageScars` 0..100, set to 100 by pillageTerritory,
 * healing ⚙ pillageScarDecayPerHour (≈2 days). peaceScore = 1 − scar/100.
 *
 * POPULATION (daily): food-gated logistic growth (docs/02 §4) capped by
 * min(popCapacity, foodPopCap); starvation kills ⚙1%/day and bleeds civil
 * morale; fed days recover morale. Migration: TODO (docs/02 §4).
 *
 * TAX (every ⚙ tax.cycleTicks): grossTax = population × baseTaxCtUnitsPerPop
 * × prosperity/100 × (1 + 0.10·dev_ECONOMY), drawn system:treasury → territory
 * via economy.taxFromSystemTreasury (redistribution capped at what the house
 * holds — never a mint; see the function's doc for the net-sink argument).
 *
 * Determinism: integer carries, sorted iteration, no RNG, no wall clock.
 */
import { type Balance, CONSTANTS, TICKS_PER_DAY, type Territory } from '@clashfront/shared';
import { taxFromSystemTreasury } from './economy';
import { sortedIds, type WorldState } from './state';

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Food production per day for a territory (docs/02 §6 — same formula as the PRODUCTION phase). */
export function foodProdPerDay(t: Territory, balance: Balance): number {
  return Math.floor(
    balance.food.productionBasePerAgriLevelPerDay *
      t.development.AGRICULTURE *
      (0.5 + 0.5 * (t.prosperity / 100)),
  );
}

/** Highest level of a structure key on a territory (0 = not built). */
export function structureLevel(t: Territory, key: string): number {
  let lvl = 0;
  for (const s of t.structures) if (s.key === key && s.level > lvl) lvl = s.level;
  return lvl;
}

/**
 * The larder ceiling (docs/02 §6): `granaryBaseCap × (1 + granaryPerLevelBonus ×
 * granary level)`. Production beyond this is wasted — the granary structure is
 * the only lever that lifts it, so stockpiling for a winter/siege is a build
 * decision, not a free accrual.
 */
export function granaryCap(t: Territory, balance: Balance): number {
  const lvl = structureLevel(t, 'GRANARY');
  return Math.floor(balance.food.granaryBaseCap * (1 + balance.food.granaryPerLevelBonus * lvl));
}

/**
 * The heartbeat runs only where civilization does: SEA never; WILD parcels
 * only once GOVERNED (an ungoverned wild's `prosperity` is the frozen Taming
 * Score proxy, docs/05 §3 — it must not drift). Demo-world note: claimed
 * parcels keep `zoneType: 'WILD'` (the MVP never rezones), so governorKind is
 * the live/frozen discriminator, not the zone label.
 */
function economyFrozen(t: Territory): boolean {
  return t.zoneType === 'SEA' || (t.zoneType === 'WILD' && t.governorKind === 'SYSTEM');
}

/** Population capacity (docs/02 §4): zone base × (1 + 0.25·dev_AGRICULTURE). */
export function popCapacity(t: Territory, balance: Balance): number {
  // A GOVERNED wilderness homestead caps like a VILLAGE (the demo world keeps
  // zoneType 'WILD' after a claim; basePopCap.WILD is 0 by design for the
  // ungoverned case).
  const zone = t.zoneType === 'WILD' && t.governorKind !== 'SYSTEM' ? 'VILLAGE' : t.zoneType;
  const base = balance.population.basePopCap[zone] ?? 0;
  return Math.floor(base * (1 + balance.population.popCapBonusPerAgriLevel * t.development.AGRICULTURE));
}

/** Mark a territory freshly pillaged (peaceScore crashes to 0, heals over ~2 days ⚙). */
export function setPillageScar(state: WorldState, territoryId: string): void {
  state.pillageScars ??= new Map();
  state.pillageScars.set(territoryId, 100);
}

/** The docs/02 §3 prosperity target, 0..100 integer. Exported for tests + UI. */
export function prosperityTarget(state: WorldState, t: Territory, balance: Balance): number {
  const dailyCons = t.population * balance.food.foodPerPopPerDay;
  const foodScore =
    dailyCons > 0 ? clamp01(t.foodStock / (balance.prosperity.foodScoreFullAtDaysOfStock * dailyCons)) : 1;
  const tracks = Object.values(t.development);
  const devScore = clamp01(
    tracks.reduce((a, b) => a + b, 0) / (tracks.length * balance.development.maxLevel),
  );
  const moraleScore = clamp01(t.morale / 100);
  const cap = popCapacity(t, balance);
  const popScore = cap > 0 ? clamp01(t.population / cap) : 0;
  const scar = state.pillageScars?.get(t.id) ?? 0;
  const peaceScore = clamp01(1 - scar / 100);
  const target =
    25 * foodScore + 25 * devScore + 20 * moraleScore + 15 * popScore + 15 * peaceScore;
  return Math.max(
    CONSTANTS.PROSPERITY_MIN,
    Math.min(CONSTANTS.PROSPERITY_MAX, Math.round(target)),
  );
}

/**
 * Per-tick prosperity movement + pillage-scar healing. Carry semantics: the
 * signed carry accumulates points·ticks/day; a whole point moves prosperity
 * one step toward target; changing direction resets the carry (no banked
 * momentum across a reversal).
 */
export function runProsperity(state: WorldState, tick: number, balance: Balance): void {
  // Scar healing: ⚙ pillageScarDecayPerHour of the full scar (0..1 scale) per
  // hour ⇒ 1 point (0..100 scale) every 1/(rate·100) hours, integer cadence.
  if (state.pillageScars !== undefined && state.pillageScars.size > 0) {
    const ticksPerHour = TICKS_PER_DAY / 24;
    const ticksPerPoint = Math.max(
      1,
      Math.round(ticksPerHour / (balance.prosperity.pillageScarDecayPerHour * 100)),
    );
    if (tick % ticksPerPoint === 0) {
      for (const id of sortedIds(state.pillageScars)) {
        const s = state.pillageScars.get(id)! - 1;
        if (s <= 0) state.pillageScars.delete(id);
        else state.pillageScars.set(id, s);
      }
    }
  }

  for (const id of sortedIds(state.territories)) {
    const t = state.territories.get(id)!;
    if (economyFrozen(t)) continue; // ungoverned wilds: Taming Score proxy — frozen
    const target = prosperityTarget(state, t, balance);
    if (t.prosperity === target) {
      state.prosperityCarry?.delete(id);
      continue;
    }
    state.prosperityCarry ??= new Map();
    let carry = state.prosperityCarry.get(id) ?? 0;
    if (t.prosperity < target) {
      if (carry < 0) carry = 0;
      carry += balance.prosperity.growthPerDay;
      const step = Math.floor(carry / TICKS_PER_DAY);
      carry -= step * TICKS_PER_DAY;
      if (step > 0) t.prosperity = Math.min(target, t.prosperity + step);
    } else {
      if (carry > 0) carry = 0;
      carry -= balance.prosperity.decayPerDay;
      const step = Math.floor(-carry / TICKS_PER_DAY);
      carry += step * TICKS_PER_DAY;
      if (step > 0) t.prosperity = Math.max(target, t.prosperity - step);
    }
    state.prosperityCarry.set(id, carry);
  }
}

/**
 * Daily population step (docs/02 §4): fed ⇒ logistic growth toward
 * min(popCapacity, foodPopCap) + civil morale recovery; starving ⇒ deaths +
 * morale bleed. Migration between territories: TODO (post-4.3).
 */
export function runPopulation(state: WorldState, balance: Balance): void {
  for (const id of sortedIds(state.territories)) {
    const t = state.territories.get(id)!;
    if (economyFrozen(t)) continue;
    if (t.population <= 0) continue;
    if (t.foodStock > 0) {
      const foodPopCap = Math.floor(foodProdPerDay(t, balance) / balance.food.foodPerPopPerDay);
      const effectiveCap = Math.min(popCapacity(t, balance), foodPopCap);
      if (effectiveCap > 0 && t.population < effectiveCap) {
        const growth = Math.floor(
          balance.population.growthRatePerDay * t.population * (1 - t.population / effectiveCap),
        );
        if (growth > 0) {
          t.population += growth;
          t.version += 1;
        }
      }
      t.morale = Math.min(
        CONSTANTS.MORALE_MAX,
        t.morale + balance.population.moraleRecoveryPerDay,
      );
    } else {
      const deaths = Math.min(
        t.population,
        Math.max(1, Math.floor(t.population * balance.population.starvationDeathPctPerDay)),
      );
      t.population -= deaths;
      t.morale = Math.max(
        CONSTANTS.MORALE_MIN,
        t.morale - balance.population.starvationMoraleLossPerDay,
      );
      t.version += 1;
    }
  }
}

/**
 * The tax cycle (docs/02 §5), every ⚙ tax.cycleTicks. Only governed (non-
 * SYSTEM) territories tax — the wilds have no taxman. Each draw is capped by
 * the system treasury inside taxFromSystemTreasury (deterministic sorted
 * order: earlier territory ids drain the treasury first when it runs dry).
 */
export function runTaxCycle(state: WorldState, balance: Balance): void {
  for (const id of sortedIds(state.territories)) {
    const t = state.territories.get(id)!;
    if (t.governorKind === 'SYSTEM') continue;
    if (economyFrozen(t)) continue;
    const gross = Math.floor(
      t.population *
        balance.tax.baseTaxCtUnitsPerPop *
        (t.prosperity / 100) *
        (1 + balance.tax.economyTrackBonusPerLevel * t.development.ECONOMY),
    );
    if (gross <= 0) continue;
    const nft = state.landNfts.get(t.landNftId);
    taxFromSystemTreasury(
      state,
      t,
      gross,
      nft?.taxSplitLandlord ?? CONSTANTS.TAX_SPLIT_LANDLORD_DEFAULT,
      nft?.ownerPlayerId,
    );
  }
}
