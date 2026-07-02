/**
 * Canonical constants — verbatim from docs/08-data-models.md §2.
 * Do NOT edit values here without editing the doc in the same change (AGENTS.md prime directive 2).
 */
export const CONSTANTS = {
  HERO_IMPACT_MAX: 0.20,        // max fraction of combat power a hero can contribute
  TICK_SECONDS: 60,             // world sim tick
  BATTLE_TICK_MS: 100,          // live battle server tick (EF MOBA owns this)
  TRAVEL_ADJACENT_MIN: 15,
  TRAVEL_REGION_HOURS: 3,
  TRAVEL_OCEAN_HOURS: 12,
  PROSPERITY_MIN: 0, PROSPERITY_MAX: 100,
  MORALE_MIN: 0, MORALE_MAX: 100,
  SUPPLY_MAX_DEFAULT: 100,
  SUPPLY_BREAK_PENALTY: 0.35,   // combat power lost when supply cut
  LAUNCH_NPC_TERRITORY_PCT: 0.95,
  ESTATE_MIN_HEXES: 7,          // ❓ OPEN proposal — Territory.hexIds.length ≥ this ⇒ estate battle mode (04 §7b)
  // Officer oversight cap (canon 2026-07, docs/01 §11.3): occupation requires an assigned officer.
  MAX_MASTERS_PER_PLAYER: 52,
  MAX_HEROES_PER_PLAYER: 3,
  MAX_OVERSEEN_TERRITORIES: 55, // = MAX_MASTERS + MAX_HEROES; hard cap on simultaneous occupation
  // Rewilding (canon 2026-07, docs/01 §11.2) — ⚙ proposals, tune in balance.json:
  REWILD_GRACE_DAYS: 14,        // untrodden days before overgrowth starts
  REWILD_RATE_PER_DAY: 3,       // overgrowth points/day after grace
  // World scale (LOCKED 2026-07-02): 1 engine unit = 1 meter; one SINGLE (L3) parcel = one
  // 240x240m MOBA arena ~= 14.2 acres. Ladder (median polygon area, x SINGLE): SMALL 27.7,
  // MEDIUM 116.7, LARGE 201.5, GIANT 302.5, EPIC 480.3 (~6,800 acres). Whole world ~= 29,900 km2.
  METERS_PER_ENGINE_UNIT: 1,
  ARENA_UNITS: 240,             // battlefield side length in engine units (existing MOBA arena)
  PARCEL_SINGLE_ACRES: 14.2,    // 240m x 240m = 57,600 m2
  // Pets & base-building (canon 2026-07, docs/04 §7b rule 2b + docs/05 §9) — ⚙ proposals:
  MAX_PETS_PER_TERRITORY: 3,    // base cap; +1 per PET_DEN level
  PET_RECOVERY_HOURS: 8,        // KO'd pet recovery cooldown
  TAX_SPLIT_LANDLORD_DEFAULT: 0.30, // landlord share of tax before leases
  PILLAGE_INFRA_LOSS: 0.50,     // fraction of development destroyed on pillage
  PILLAGE_POP_LOSS: 0.25,
  REBELLION_FOOD_THRESHOLD: 0,  // food stock at/below → rebellion risk rises
  DESERTION_MORALE_THRESHOLD: 25,
  // Battle logistics (canon 2026-07-02, docs/04 §7c) — ⚙ proposals:
  TIE_THRESHOLD: 0.15,          // WarScore gap (fraction) below which an expired clock ⇒ TIE
  SCATTER_CASUALTY_PCT: 0.30,   // extra losses when a retreating army has nowhere to go
  CT_UNITS_PER_CT: 10_000,
} as const;

/** Derived helper: world ticks per 24h day (86_400 / TICK_SECONDS). */
export const TICKS_PER_DAY = 86_400 / CONSTANTS.TICK_SECONDS;
