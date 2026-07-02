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
  TAX_SPLIT_LANDLORD_DEFAULT: 0.30, // landlord share of tax before leases
  PILLAGE_INFRA_LOSS: 0.50,     // fraction of development destroyed on pillage
  PILLAGE_POP_LOSS: 0.25,
  REBELLION_FOOD_THRESHOLD: 0,  // food stock at/below → rebellion risk rises
  DESERTION_MORALE_THRESHOLD: 25,
  CT_UNITS_PER_CT: 10_000,
} as const;

/** Derived helper: world ticks per 24h day (86_400 / TICK_SECONDS). */
export const TICKS_PER_DAY = 86_400 / CONSTANTS.TICK_SECONDS;
