/**
 * Typed loader for packages/shared/balance.json — the designer-tunable numbers
 * (docs mark them ⚙). Versioned separately from code so designers can retune
 * without redeploying logic (AGENTS.md §2 "Config vs code").
 *
 * Canon CONSTANTS (docs/08 §2) live in ./constants — never duplicated here.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DevelopmentTrack, HexTerrain, UnitClass, ZoneType } from './enums';

export interface UpkeepRates {
  /** Food units per day per 100 soldiers. */
  food: number;
  /** ct_units per day per 100 soldiers (integer money — 08 §0). */
  ctUnits: number;
}

export interface Balance {
  _note: string;
  version: number;
  travel: {
    moveCostByTerrain: Record<HexTerrain, number>;
    openOceanNoLanePenaltyMult: number;
  };
  development: {
    maxLevel: number;
    /** Geometric cost growth: costCt(track, L) = base × growth^(L−1) — docs/02 §7. */
    costGrowthPerLevel: number;
    baseCostCtUnits: Record<DevelopmentTrack, number>;
    buildTimeHoursPerLevel: number;
    repairCostFractionOfBuild: number;
  };
  tax: {
    cycleTicks: number;
    /** ct_units of gross tax per population per cycle (0.02 CT — docs/02 §5). */
    baseTaxCtUnitsPerPop: number;
    economyTrackBonusPerLevel: number;
  };
  prosperity: {
    growthPerDay: number;
    decayPerDay: number;
    foodScoreFullAtDaysOfStock: number;
    pillageScarDecayPerHour: number;
  };
  food: {
    productionBasePerAgriLevelPerDay: number;
    foodPerPopPerDay: number;
    soldierFoodPerDay: number;
    civilianFoodPerDay: number;
    granaryBaseCap: number;
  };
  population: {
    basePopCap: Record<ZoneType, number>;
    popCapBonusPerAgriLevel: number;
    growthRatePerDay: number;
    migrationPctPerDay: number;
    migrationProsperityThreshold: number;
  };
  supply: {
    rangeHexes: number;
    trainRangeBonusHexes: number;
    maxAttachedTrains: number;
    regenPerTick: number;
    drainBase: number;
    drainPer1000Troops: number;
    marchDrainMult: number;
    refillPerDayInSupplySource: number;
  };
  morale: {
    lossUnsuppliedPerTick: number;
    regenGarrisonPerTick: number;
    victoryDelta: number;
    defeatDelta: number;
    retreatMoraleLoss: number;
    deepEnemyTerritoryPerDay: number;
    restingFriendlyGarrisonPerDay: number;
    unpaidUpkeepPerDay: number;
    occupiedCivilMoraleLoss: number;
  };
  desertion: {
    /** Flat per-tick loss below DESERTION_MORALE_THRESHOLD — docs/01 §5.4. */
    ratePerTick: number;
    basePerDayAtZeroMorale: number;
    supplyCutMult: number;
    hungerMult: number;
    retreatingMult: number;
    hardCapPerDay: number;
    desertersReturnToPopulationPct: number;
    desertersReturnToWildBanditPct: number;
  };
  upkeep: {
    perUnitClassPer100PerDay: Record<UnitClass, UpkeepRates>;
    distanceFactorPerHex: number;
    empireFactorPer50kSoldiers: number;
  };
  units: {
    classBase: Record<UnitClass, number>;
    trainCtUnitsPerSoldier: Record<UnitClass, number>;
    armyMaxStacks: number;
    shipCapacitySoldiers: number;
  };
  pillageOccupy: {
    pillageLootTreasuryPct: number;
    pillageLootCtUnitsPerPop: number;
    occupySeizeTreasuryPct: number;
  };
  draft: {
    draftBasePctOfPop: number;
    draftPerMilitaryLevel: number;
    disbandReturnPct: number;
  };
}

const REQUIRED_SECTIONS: readonly (keyof Balance)[] = [
  'travel', 'development', 'tax', 'prosperity', 'food', 'population',
  'supply', 'morale', 'desertion', 'upkeep', 'units', 'pillageOccupy', 'draft',
];

function resolveBalancePath(): string {
  // Compiled layout: dist/src/balance.js → ../../balance.json (package root).
  // Source layout: src/balance.ts → ../balance.json.
  const candidates = [
    join(__dirname, '..', '..', 'balance.json'),
    join(__dirname, '..', 'balance.json'),
  ];
  for (const p of candidates) if (existsSync(p)) return p;
  throw new Error(`balance.json not found near ${__dirname}`);
}

function validate(raw: unknown): Balance {
  if (typeof raw !== 'object' || raw === null) throw new Error('balance.json: not an object');
  const b = raw as Record<string, unknown>;
  for (const section of REQUIRED_SECTIONS) {
    if (typeof b[section] !== 'object' || b[section] === null) {
      throw new Error(`balance.json: missing/invalid section "${section}"`);
    }
  }
  if (typeof b['version'] !== 'number') throw new Error('balance.json: missing "version"');
  return raw as Balance;
}

let cached: Balance | undefined;

/** Load (and cache) the balance config. Pass a path to override (e.g. for tests/scenarios). */
export function loadBalance(path?: string): Balance {
  if (path !== undefined) {
    return validate(JSON.parse(readFileSync(path, 'utf8')));
  }
  if (cached === undefined) {
    cached = validate(JSON.parse(readFileSync(resolveBalancePath(), 'utf8')));
  }
  return cached;
}
