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
  claims: {
    /** steps from nearest own territory that stay free (1 = adjacent block) */
    freeRadiusSteps: number;
    /** ct_units charged per step beyond the free radius */
    costCtUnitsPerStep: number;
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
  /** Battle logistics ⚙ — docs/04 §7c (provisions, command center, tie/retreat tuning). */
  provisions: {
    /** CT price per carried unit, in ct_units (integer money — 08 §0). */
    ctUnitsPerFood: number;
    ctUnitsPerGold: number;
    ctUnitsPerWood: number;
    /** Standard provision pack bought at raiseArmy, per soldier. */
    defaultFoodPerSoldier: number;
    defaultGoldPerSoldier: number;
    defaultWoodPerSoldier: number;
    /** Food consumed per adjacency step per 100 soldiers while MARCHING. */
    marchFoodPerStepPer100: number;
    /** Food one battle consumes per 100 soldiers (attacker: carried; defender: territory foodStock). */
    battleFoodNeedPer100: number;
    /** WarScore endurance multiplier at zero food (1.0 at full adequacy). */
    enduranceFloor: number;
    /** Morale lost per tick while MARCHING with provisions.food = 0. */
    starvationMoralePerTick: number;
    /** Fraction of each stack deserting per starving tick below DESERTION_MORALE_THRESHOLD. */
    starvationDesertionPctPerTick: number;
    /** Symmetric casualty fraction applied to BOTH sides on a TIE (smaller than decisive). */
    tieCasualtyFrac: number;
    /** Morale lost by both sides on a TIE (docs/04 §9 draw). */
    tieMoraleLoss: number;
    /** Morale collapses to (at most) this when an army scatters. */
    scatterMoraleFloor: number;
    /** A scattered army disbands when fewer than this fraction of its pre-battle troops remain. */
    scatterDisbandRemainingPct: number;
    /** Attacker temporary command-center tiers (camp → palisade → fortified camp); requirements scale per 100 attacker soldiers; the tier cost is SPENT win or lose. */
    commandCenterTiers: { goldPer100: number; woodPer100: number; bonus: number }[];
  };
  /** Neutral towns ⚙ — Feature Set 2 F2 (docs/briefs/FEATURESET-2.md). */
  towns: {
    /** Fraction of garrison-free SYSTEM parcels seeded as TOWNs at genesis. */
    pct: number;
    /** Town population at the slice center… */
    popBase: number;
    /** …plus this much at the far frontier (× normalized distance). */
    popDistanceBonus: number;
    /** Town treasury (ct_units) at the center… */
    treasuryCtUnitsBase: number;
    /** …plus this much at the far frontier (× normalized distance). */
    treasuryCtUnitsDistanceBonus: number;
    prosperityBase: number;
    prosperityDistanceBonus: number;
    /** Town foodStock = population × this. */
    foodPerPop: number;
    /** SYSTEM parcels at/above this population trigger the bloodless walk-in choice (TOWNs always do). */
    walkInMinPopulation: number;
  };
  /** Active wild raids ⚙ — Feature Set 2 F3 (docs/briefs/FEATURESET-2.md). */
  wildRaids: {
    /** Monster lairs roll a raid every N ticks (0 disables raids). */
    everyTicks: number;
    /** Raid chance at the slice center… */
    baseChance: number;
    /** …plus this much at the far frontier (× normalized distance from center). */
    edgeChanceBonus: number;
    /** Targets with a live garrison at/above this WarScore strength are never raided. */
    defendedStrengthThreshold: number;
    /** Raids reach adjacent-or-N-step territories. */
    raidRangeSteps: number;
    /** A lair below this many soldiers never splits a raid. */
    minRaidTroops: number;
  };
  /** Fog of war ⚙ — Feature Set 2 F1 (docs/briefs/FEATURESET-2.md). */
  intel: {
    /** Ticks a scouted parcel stays ACCURATE after last sight before decaying to FUZZY memory. */
    decayTicks: number;
    /** Fuzzy display bands reroll every this many ticks ("a day" for band stability). */
    fuzzyPeriodTicks: number;
    /** Cap on the territory-cluster sight radius 1 + floor(sqrt(clusterSize)/2). */
    clusterRadiusCap: number;
    /** Sight (adjacency steps) of a regular army. */
    armySight: number;
    /** Sight of a cavalry-majority scout screen (SCOUTS preset). */
    scoutSight: number;
    /** Fuzzy band half-width as a fraction of true strength (±35% default). */
    fuzzyBandPct: number;
  };
}

const REQUIRED_SECTIONS: readonly (keyof Balance)[] = [
  'travel', 'development', 'tax', 'prosperity', 'food', 'population',
  'supply', 'morale', 'desertion', 'upkeep', 'units', 'pillageOccupy', 'draft', 'provisions', 'claims',
  'intel', 'towns', 'wildRaids',
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
