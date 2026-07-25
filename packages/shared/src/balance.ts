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
    /** Cross-continent (server) travel — docs/maps/WORLD-MAP-AND-SERVER-TRAVEL.md §4. */
    dockReserveFeeCt: number;
    continentTravelFeeCt: number;
    /** Fee split (sums to 1): land owner / occupying warlord / platform sink (≥10% burns, decision 17). */
    travelFeeSplit: { landOwner: number; occupier: number; platformSink: number };
    portTypeByTier: Record<string, string>;
    /** Right-of-way tolls — §4a. PASS = cross a land toward a port; GATE = intra-continent chokepoint. */
    passFeeDefaultCt: number;
    gateFeeDefaultCt: number;
    /** OPEN | ALLIES_ONLY | CLOSED — landowner passage policy. */
    passPolicyDefault: string;
    gatePolicyDefault: string;
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
    /** ⚙ Larder ceiling per granary structure level: cap = base × (1 + this × level). docs/02 §6. */
    granaryPerLevelBonus: number;
  };
  population: {
    basePopCap: Record<ZoneType, number>;
    popCapBonusPerAgriLevel: number;
    growthRatePerDay: number;
    migrationPctPerDay: number;
    migrationProsperityThreshold: number;
    /** Starvation deaths per day while foodStock == 0 (docs/02 §4, ⚙1%). */
    starvationDeathPctPerDay: number;
    /** Civil morale bleed per starving day (docs/02 §4, ⚙5). */
    starvationMoraleLossPerDay: number;
    /** Civil morale recovery per fed day (⚙ — so famine isn't a permanent scar). */
    moraleRecoveryPerDay: number;
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
    /** ⚙ Deserter-bandit band spawns once this many wild deserters accrue on a hex (docs/03 §8). */
    banditMinBand: number;
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
  /** Development effects ⚙ — Feature Set 2 F4 (docs/briefs/FEATURESET-2.md). */
  developmentEffects: {
    /** Defender WarScore multiplier: 1 + x × DEFENSE level (battles on the parcel). */
    defenseWarScorePerLevel: number;
    /** CT trickle (ct_units/day) to the governor per ECONOMY level — paid per tick with integer carry. */
    econCtUnitsPerLevelPerDay: number;
    /** Training-cost discount per MILITARY level of the raising parcel… */
    milRaiseDiscountPerLevel: number;
    /** …capped here. */
    milRaiseDiscountMax: number;
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
  /** Circular war economy ⚙ — Feature Set 3 E1/E3/E4/E5 (docs/briefs/FEATURESET-3-ECONOMY.md). */
  economy: {
    /** spendCT bucket: share to town/wild-parcel treasuries near the spend parcel (warzone gold rush). */
    lootShare: number;
    /** spendCT bucket: share into enrichment pools of the spend parcel + ring-1 neighbors. */
    landYieldShare: number;
    /** spendCT bucket: landlord share — escrowed in unclaimedLordYield until NFT landlord settlement. */
    lordsLandlordShare: number;
    /** spendCT bucket: estate/region-seat share — MVP proxy: richest TOWN treasury in radius. */
    lordsSeatShare: number;
    /** spendCT bucket: destroyed (documentation only — burn is computed as the integer remainder). */
    burnShare: number;
    /** spendCT bucket: system:treasury (dev/protocol). */
    treasuryShare: number;
    /** Adjacency-step radius for LOOT targets and the LORDS seat town. */
    lootRadiusSteps: number;
    /** Fraction of the LANDYIELD bucket that enriches the spend parcel itself (rest → ring-1). */
    landYieldSelfPct: number;
    /** Enrichment pool pays this fraction of itself per day (integer carry) to the current governor. */
    enrichYieldPctPerDay: number;
    /** PILLAGE loots this fraction of the parcel's enrichment pool. */
    enrichLootPct: number;
    /** Raze recovers this fraction of a level's original cost to the razer; the rest burns. */
    razeSalvagePct: number;
    /** $-purchase faucet cap per account per epoch, ct_units (stub — /api/buy-ct is 501). */
    purchaseCapCtPerEpoch: number;
    /** Rolling tick window for the /api/economy loot-inflow heatmap. */
    lootWindowTicks: number;
    /** Per-governor yield REWARDs flush into the settlement journal every N ticks. */
    journalYieldBatchTicks: number;
  };
  /**
   * ⚙ Worker pets + stockpile production (WORLD-BUILD-OUT-PLAN wave 1,
   * owner 2026-07-17). Per-worker per-day outputs, biome affinity bonus,
   * fur shedding by species class, worker caps.
   */
  workers: {
    /** MINE output per worker per day: gold (ct_units), wood, plus biome-weighted extras. */
    mineGoldPerDay: number;
    mineWoodPerDay: number;
    /** Chance-weighted iron/stone/rareMetal units per MINE worker per day (biome multiplies). */
    mineIronPerDay: number;
    mineStonePerDay: number;
    mineRareMetalPerDay: number;
    /** FARM output: food per worker per day. */
    farmFoodPerDay: number;
    /** CRAFT: arms produced per worker per day at a workshop (⚙ MILITARY level ≥ workshopMinMil). */
    craftArmsPerDay: number;
    workshopMinMil: number;
    /** Species-affinity production multiplier on a matching biome. */
    affinityBonus: number;
    /** Fur shed per worker per day, by species fur class. */
    furWarmPerDay: number;
    furLeafPerDay: number;
    furPhantomPerDay: number;
    /** Max worker pets per territory (scales with enrichment later). */
    maxWorkersPerTerritory: number;
    /** GUARD role: strength contribution per guard pet when the parcel is raided. */
    guardStrength: number;
  };
  /**
   * ⚙ AMM local markets (WORLD-BUILD-OUT-PLAN wave 2, owner 2026-07-17).
   * Constant-product pools per (parcel, resource); fees tighten with
   * enrichment tier; system balancer fixes only egregious gaps.
   */
  market: {
    /** Baseline gold price per unit (the "if perfectly balanced" NPC-TRADE-RATIOS reference). */
    priceFood: number;
    priceWood: number;
    priceStone: number;
    priceIron: number;
    priceFur: number;
    priceRareMetal: number;
    /** Units of resource seeded into a fresh T0 pool (gold side = units × baseline). */
    seedUnits: number;
    /** Extra depth multiplier per enrichment tier (T5 pool = seedUnits × (1 + 5×this)). */
    depthPerTier: number;
    /** Cumulative enrichment-pool ct_units to reach T1..T5 (SINGLE-parcel ladder). */
    tierThresholdsCt: number[];
    /** Per-side fee fraction by tier (index 0 = T0). Fees burn. */
    feeByTier: number[];
    /** Balancer: min relative gap (hi/lo − 1) before it intervenes. */
    balancerMinGapPct: number;
    /** Balancer: max gold spent per game-day across all trades. */
    balancerMaxGoldPerDay: number;
    /** Balancer: max trades per game-day. */
    balancerMaxTradesPerDay: number;
    /** Balancer: units moved per trade lot. */
    balancerLotUnits: number;
  };
  /**
   * ⚙ Transport & delivery (WORLD-BUILD-OUT-PLAN wave 3,
   * docs/briefs/TRANSPORT-DELIVERY-LAYER.md). Caravans, delivery orders,
   * transit tolls, raiding.
   */
  transport: {
    /** Max cargo units (goods + provision food) per caravan. */
    cargoCapBase: number;
    /** Warlord pass fee: gold per cargo unit carried (⚙ capped). */
    passFeePerCargoUnit: number;
    passFeeCapGold: number;
    /** Wild bribe: fraction of the caravan's provision food demanded per garrisoned wild hop. */
    bribeFoodPct: number;
    /** Fraction of cargo a raider loots on caravan surrender. */
    caravanLootPct: number;
    /** Delivery board: posting fee (burns) + platform fee on payout (burns). */
    postingFeeCt: number;
    platformFeePct: number;
    /** Late decay: reward fraction returned to requester per grace window past deadline. */
    latePenaltyPctPerWindow: number;
    graceWindowTicks: number;
    /** OPEN orders refund + expire this many ticks past the deadline. */
    hardExpiryTicks: number;
  };
  /** Training queues ⚙ — Feature Set 3 E2 (docs/briefs/FEATURESET-3-ECONOMY.md). */
  training: {
    /** Soldiers materialized per tick at MIL level 0. */
    baseRatePerTick: number;
    /** Training-rate bonus per MILITARY level of the raising parcel. */
    milRateBonus: number;
    /** Strength multiplier a MUSTERING army fights at when attacked. */
    musterPenalty: number;
    /** Active training queues allowed per territory. */
    queuesPerTerritory: number;
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
  /**
   * Live wild-battle tactical sim ⚙ — docs/04 §7b wild row prototype.
   * One battle entity = squadSize overworld soldiers; stats per battle tick at
   * tickHz. Unwatched battles fast-forward acceleratedTicksPerWorldTick per
   * world tick (same sim — canon: acceleration is the same simulation).
   */
  wildBattle: {
    tickHz: number;
    /** Battle clock in battle ticks (≈ 4 min demo at 4 Hz). Expiry ⇒ attacker auto-retreat (TIE path). */
    clockTicks: number;
    acceleratedTicksPerWorldTick: number;
    /** Overworld soldiers one battle entity represents. */
    squadSize: number;
    /** Entities spawned per attacker wave (from remaining army stock). */
    waveSize: number;
    waveEveryTicks: number;
    /** Master respawns ("runs") after the first life. */
    masterRevives: number;
    masterRespawnTicks: number;
    /** Attacker units auto-acquire enemies within this range (m). */
    acquireRange: number;
    mobAggroRange: number;
    /** Camp mobs chase no farther than this from their camp anchor. */
    mobLeashRange: number;
    towerHp: number;
    towerDamage: number;
    towerCooldownTicks: number;
    towerRange: number;
    masterHp: number;
    masterDamage: number;
    masterCooldownTicks: number;
    masterRange: number;
    masterSpeed: number;
    /** Per-class entity stats (hp per squad, damage per hit, cooldown ticks, range m, speed m/tick). */
    unitStats: Record<UnitClass, { hp: number; damage: number; cooldownTicks: number; range: number; speed: number }>;
    /**
     * ⚙ Command-mode steering (real STANCE effects + RETREAT + standing STRATEGY).
     * See balance.json `wildBattle.command._note`.
     */
    command: {
      /** DEFEND: hold within this many world units of the spawn corner. */
      defendRadius: number;
      /** FOLLOW: escort the Master within this many world units. */
      followRadius: number;
      /** Move-speed multiplier for units in a RETREAT (the fear sprint back home). */
      retreatSpeedMult: number;
      /** FLEE_IF_LOSING trips when wave stock fraction < this. */
      stockPctFloor: number;
      /** FLEE_IF_LOSING trips when fielded-entity fraction < this. */
      alivePctFloor: number;
      /** Battle ticks between two FLEE_IF_LOSING evaluations. */
      fleeCheckEveryTicks: number;
    };
    /**
     * ⚙ Reinforcement lane QUEUE (docs/briefs/REINFORCEMENT-LANE-QUEUE.md,
     * owner 2026-07-14). A second (or Nth) army arriving at a locked hex is
     * offered to reinforce that battle: a Master joins immediately (never
     * counts against the cap); soldiers append to the arrival-edge's spawn
     * queue. Concurrent lane soldiers never exceed soldierCapLive; queue
     * extends DURATION not DENSITY (armySupplyMin per queued army = the
     * approximate wave-supply the lane gains).
     */
    lane: {
      /** Concurrent live soldiers per lane the engine will spawn (16 = current MOBA standard). */
      soldierCapLive: number;
      /** Approx sustained-push minutes one full queued army adds to a lane. */
      armySupplyMin: number;
    };
  };
  /**
   * ⚙ COMMAND-vs-AUTO scaling keystone (docs/04 §3a). LIVE (30 Hz joinable/
   * steerable) battles are a SCARCE OPT-IN resource chosen at MARCH time; AUTO
   * (accelerated headless resolve) is the default. See balance.json `battle._note`.
   */
  battle: {
    /** Max concurrent live/queued COMMAND battles one player may hold (per-player attention cap). */
    commandSlotsPerPlayer: number;
    /** Global cap on concurrent LIVE engine matches (server 30 Hz capacity). */
    liveMatchPoolMax: number;
    /** A COMMAND battle QUEUED past the live pool waits this many world ticks, then falls back to accelerated. */
    commandQueueTimeoutTicks: number;
    /**
     * ⚙ How long a LIVE match stays in its pre-combat STAGING window before the
     * armies engage — the joinable window the hero-mode ⚡ doorway seats into.
     * Sent to the match server in the allocate context (`joinWindowSec`); the
     * server holds the 30 Hz match open this long so a ⚡ click can late-seat.
     * Ignored for accelerated battles. (network F5 Fork's dial; default 90s, matches the match server's staging window.)
     */
    joinWindowSec: number;
  };
  /**
   * ⚙ Wave 4.9 — weather Phase 2 environmental effects (WEATHER-CONTINENT-PLAN
   * §Phase 2). moveCostByState scales march step-time by today's weather.
   */
  weather: {
    moveCostByState: Record<string, number>;
  };
  /**
   * ⚙ Wave 4.5 — civil rebellion (docs/01 §7). Risk points accumulate per
   * tick from hunger/occupation/poverty, scaled by (1 − morale/100); the
   * trigger is a deterministic hash roll at risk/riskScale. See balance.json
   * `rebellion._note` for the full model.
   */
  rebellion: {
    riskFood: number;
    riskOccupation: number;
    riskPoverty: number;
    prosperityLowBand: number;
    occupationGraceTicks: number;
    riskScale: number;
    rebelPctOfPop: number;
    rebelMin: number;
    crushedMoraleCeiling: number;
  };
  /**
   * ⚙ Wave 4.4 (MOBA-V3-BUILD-SPEC §5): CF-side mythic-reinforcement cadence.
   * CF decides who spawns what (NFT ownership + this counter); the MOBA
   * renders + runs the mythic. Stats are MOBA dials, not duplicated here.
   */
  mythic: {
    /** Deterministic guaranteed spawn per N engine battles the NFT owner fights (per species). */
    spawnEveryBattles: number;
    /** A freshly granted NFT spawns on its very first battle (memorable mint moment). */
    startReady: boolean;
  };
  /**
   * ⚙ HERO-vs-HERO card duel (docs/briefs/HERO-DUEL-SPEC.md, decision 14). v1 is a
   * CARD best-of-3 (AGGRESSIVE>TRICK>DEFENSIVE>AGGRESSIVE) where Master RATING
   * dominates via per-round INITIATIVE and Named artifacts are the wildcard. It
   * AUTO-RESOLVES; an online player may pick each round within pickWindowSec, else
   * an NPC auto-picks. ELEMENT-FREE. See balance.json `duel._note`.
   */
  duel: {
    /** ATK = atkBase + eff·atkPerRating. */
    atkBase: number;
    atkPerRating: number;
    /** maxHp = hpBase + eff·hpPerRating. */
    hpBase: number;
    hpPerRating: number;
    /** Max exchanges before the clock decides (higher HP% wins). */
    maxExchanges: number;
    /** Crit blow: chance + damage multiplier. */
    critChance: number;
    critMult: number;
    /** Equipped Named artifact SPELL flare damage multiplier (fires at signatureProcChance). */
    spellMult: number;
    /** ± per-blow damage roll. */
    damageVariance: number;
    /** Stance modifiers (RPS: aggressive>trick>defensive>aggressive). */
    stance: {
      aggressiveAtk: number;
      aggressiveDef: number;
      defensiveAtk: number;
      defensiveDef: number;
      /** Damage multiplier for the RPS clash winner / loser this exchange. */
      clashWinAtk: number;
      clashLoseAtk: number;
    };
    /** Per-exchange human stance-pick timer (seconds); on timeout the NPC auto-picks. */
    pickWindowSec: number;
    /** Effective-rating multiplier ADDED per equipped Named artifact (the wildcard). */
    artifactRatingBonus: number;
    /** Per-blow seeded chance an equipped Named artifact "flares" as a spell. */
    signatureProcChance: number;
    /** The FLEE standing-order escape roll and the penalty when a failed flee is caught into a forced duel. */
    flee: { baseOdds: number; caughtPenalty: number };
  };
  /**
   * ⚙ BASE-BUILDING defense layer (docs/briefs/BASE-BUILDING-DEFENSE-LAYER.md,
   * decision 7). Owners place/upgrade destructible defense modules onto the map's
   * buildSpots; the CF engine seeds the same onto WILD parcels. See balance.json
   * `build._note`.
   */
  build: {
    /** Tier-1 CT cost (ct_units) per module key; ×costGrowthPerTier^tier for upgrades. */
    baseCostCtUnitsByKey: Record<string, number>;
    /** Geometric upgrade-cost growth per tier. */
    costGrowthPerTier: number;
    /** Max module tier (upgrade cap). */
    maxTier: number;
    /** Per-tier HP the module persists with (index 0 = tier 1). */
    hpByTier: number[];
    /** CT (per tier's build cost) to restore a damaged module to full HP. */
    repairCostFractionOfBuild: number;
    /** WILD-parcel garrison the CF engine seeds in lieu of a player. */
    wild: { towerCount: number; mobCamps: number; baseTier: number };
  };
  /**
   * ⚙ Post-battle "Recent battles" review (docs/04 §7b). Battles resolve fast
   * (accelerated is the default), so the player reviews a fight AFTER it ends
   * from a bounded, fog-filtered ring. See balance.json `review._note`.
   */
  review: {
    /** How many recently-resolved battles the world keeps for review (newest-first; older age out). */
    ringCap: number;
    /** Seconds each battle shows during "Review all" auto-advance. */
    reviewTimerSec: number;
    /** Compact synthesized strength-progression keyframes per accelerated battle (honest reconstruction, not 30 Hz telemetry). */
    timelineKeyframes: number;
    /** World ticks an AUTO outcome stays SEALED after collision before it may be revealed (sealed-reveal follow-up). */
    revealDurationTicks: number;
  };
}

const REQUIRED_SECTIONS: readonly (keyof Balance)[] = [
  'travel', 'development', 'tax', 'prosperity', 'food', 'population',
  'supply', 'morale', 'desertion', 'upkeep', 'units', 'pillageOccupy', 'draft', 'provisions', 'claims',
  'intel', 'towns', 'wildRaids', 'developmentEffects', 'economy', 'training', 'wildBattle', 'battle', 'duel', 'build', 'review',
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
