/**
 * The world tick loop — docs/01-world-simulation.md §6.
 *
 * Every TICK_SECONDS the engine advances World.tick by exactly 1 through a FIXED
 * order of phases. The order below is canon (01 §6) and must never be reshuffled:
 *
 *   1. PRODUCTION      2. CONSUMPTION   3. MOVEMENT      4. SUPPLY
 *   5. MORALE          6. REBELLION     7. BATTLE SPAWN  8. AI
 *
 * Determinism (AGENTS.md prime directive 6, 01 §6): no Date.now()/Math.random()
 * anywhere in here — the tick number and a seeded Rng are injected. Every phase
 * draws randomness from a fork keyed by (tick, phase[, entityId]) so replays are
 * bit-for-bit identical given (state, seed, inputs).
 *
 * The phase bodies are SKELETON stubs: signatures and ordering are final, full
 * rules land per the owning doc sections referenced in each TODO. The minimal
 * placeholder logic present (food produce/consume, supply regen/drain, morale
 * drift) exists only so invariants are exercisable; it is clamped and integer.
 */
import {
  type Balance,
  CONSTANTS,
  type Rng,
  TICKS_PER_DAY,
  loadBalance,
} from '@clashfront/shared';
import { sortedIds, type WorldState } from './state';

type Phase = (state: WorldState, tick: number, rng: Rng, balance: Balance) => void;

/**
 * Advance the world by exactly one tick. Mutates `state` in place and returns it.
 *
 * @param state      post-previous-tick world state (the only writer is this loop)
 * @param tickNumber must be exactly state.world.tick + 1 (tick monotonicity, 01 §11)
 * @param rng        world-level seeded RNG; phases fork per (tick, phase)
 */
export function runTick(state: WorldState, tickNumber: number, rng: Rng, balance: Balance = loadBalance()): WorldState {
  if (tickNumber !== state.world.tick + 1) {
    throw new Error(`tick monotonicity violated: world at ${state.world.tick}, asked to run ${tickNumber}`);
  }

  // Fixed canonical phase order — docs/01 §6. Do not reorder.
  const phases: readonly [name: string, phase: Phase][] = [
    ['production', phaseProduction],
    ['consumption', phaseConsumption],
    ['movement', phaseMovement],
    ['supply', phaseSupply],
    ['morale', phaseMorale],
    ['rebellion', phaseRebellion],
    ['battleSpawning', phaseBattleSpawning],
    ['ai', phaseAiHook],
  ];

  for (const [name, phase] of phases) {
    // PRNG(world.seed, tick, phase) — order-insensitive fork per 01 §6.
    phase(state, tickNumber, rng.fork(`t${tickNumber}`).fork(name), balance);
  }

  state.world.tick = tickNumber;
  // TODO(07 §4): persist(worldState, tick) — Redis write-through → Postgres, emit tick events.
  return state;
}

/**
 * Phase 1 — PRODUCTION (docs/01 §6.1, formulas in docs/02 §6/§3/§5).
 * Territories yield food/CT/prosperity; structures & nodes produce.
 *
 * TODO(02 §6): full food production — FOOD_BASE_PER_LEVEL × dev_AGRICULTURE ×
 *   (1 + structure bonuses) × (0.5 + 0.5·prosperity/100), granary cap, fractional
 *   accumulation across ticks instead of per-tick floor.
 * TODO(02 §3): prosperity target computation & per-tick movement (growth/decay).
 * TODO(02 §5): tax cycle every TAX_CYCLE_TICKS via double-entry LedgerEntry
 *   (economy package owns the ledger; this phase only requests draws).
 */
function phaseProduction(state: WorldState, _tick: number, _rng: Rng, balance: Balance): void {
  for (const id of sortedIds(state.territories)) {
    const t = state.territories.get(id)!;
    const perDay =
      balance.food.productionBasePerAgriLevelPerDay *
      t.development.AGRICULTURE *
      (0.5 + 0.5 * (t.prosperity / 100));
    t.foodStock += Math.floor(perDay / TICKS_PER_DAY); // placeholder rounding; see TODO
  }
}

/**
 * Phase 2 — CONSUMPTION (docs/01 §6.2, formulas in docs/02 §4/§6, docs/03 §6).
 * Population eats; army food upkeep; lease/tribute payments.
 *
 * TODO(02 §6): population eats FOOD_PER_POP_PER_DAY with starvation cascade
 *   (pop decline, prosperity drag) — never below 0 (invariant 5).
 * TODO(03 §6): army food + CT upkeep with distanceFactor and empireFactor;
 *   unfed/unpaid morale penalties.
 * TODO(02 §5/§8): lease rent & tribute LedgerEntry draws.
 */
function phaseConsumption(state: WorldState, _tick: number, _rng: Rng, balance: Balance): void {
  for (const id of sortedIds(state.territories)) {
    const t = state.territories.get(id)!;
    const perDay = t.population * balance.food.foodPerPopPerDay;
    t.foodStock = Math.max(0, t.foodStock - Math.floor(perDay / TICKS_PER_DAY)); // placeholder rounding
  }
}

/**
 * Phase 3 — MOVEMENT (docs/01 §3, §6.3).
 * For each MARCHING army with arrivalTick <= tick: advance hex, pop path,
 * contest ZoC, set next arrivalTick.
 *
 * TODO(01 §3): march step timing = TRAVEL_ADJACENT_MIN × hex.moveCost, ZoC
 *   contest & ambush checks, embark/disembark at HARBOR/COAST, halt orders.
 * TODO(01 §4): route (ROAD/sea-lane) cost discounts.
 */
function phaseMovement(_state: WorldState, _tick: number, _rng: Rng, _balance: Balance): void {
  // Stub — no armies move until 01 §3 movement rules land.
}

/**
 * Phase 4 — SUPPLY (docs/01 §5, §6.4).
 * isSupplied() for every army; regen/drain; supply-train raids.
 *
 * TODO(01 §5.2): real isSupplied — Dijkstra over the friendly-controlled route
 *   graph to the nearest supplySource territory, range = SUPPLY_RANGE_HEXES +
 *   train bonus. Placeholder below: GARRISON in a friendly supplySource territory
 *   counts as supplied, everything else drains.
 * TODO(01 §5.4): SupplyTrain raiding (state:'RAIDED').
 */
function phaseSupply(state: WorldState, _tick: number, _rng: Rng, balance: Balance): void {
  for (const id of sortedIds(state.armies)) {
    const a = state.armies.get(id)!;
    if (a.state === 'DISBANDED') continue;
    const supplied = isSuppliedPlaceholder(state, a.hexId, a.ownerGovernorId);
    if (supplied) {
      a.supply = Math.min(a.supplyMax, a.supply + balance.supply.regenPerTick);
    } else {
      const troops = a.units.reduce((n, s) => n + s.count, 0);
      const drain =
        balance.supply.drainBase +
        (balance.supply.drainPer1000Troops * troops) / 1000 *
          (a.state === 'MARCHING' ? balance.supply.marchDrainMult : 1);
      a.supply = Math.max(0, a.supply - Math.ceil(drain));
    }
  }
}

/** Placeholder for 01 §5.2's graph check — friendly supplySource territory on the army's hex. */
function isSuppliedPlaceholder(state: WorldState, hexId: string, governorId: string): boolean {
  const hex = state.hexes.get(hexId);
  if (hex?.territoryId === undefined) return false;
  const terr = state.territories.get(hex.territoryId);
  return terr !== undefined && terr.supplySource && terr.governorId === governorId;
}

/**
 * Phase 5 — MORALE (docs/01 §7, §5.4; docs/03 §8).
 * Army + civil morale deltas; desertion.
 *
 * TODO(01 §7 / 03 §8): full morale event model (victory/defeat, deep enemy
 *   territory, resting, officer effects) and desertion below
 *   DESERTION_MORALE_THRESHOLD with the 03 §8 rate formula.
 * Placeholder below: unsupplied ticks bleed morale, supplied garrisons regen —
 *   clamped to [MORALE_MIN, MORALE_MAX] (invariant 6).
 */
function phaseMorale(state: WorldState, _tick: number, _rng: Rng, balance: Balance): void {
  for (const id of sortedIds(state.armies)) {
    const a = state.armies.get(id)!;
    if (a.state === 'DISBANDED') continue;
    if (a.supply === 0) {
      a.morale = Math.max(CONSTANTS.MORALE_MIN, a.morale - balance.morale.lossUnsuppliedPerTick);
    } else if (a.state === 'GARRISON') {
      a.morale = Math.min(CONSTANTS.MORALE_MAX, a.morale + balance.morale.regenGarrisonPerTick);
    }
    // TODO(01 §5.4): desertion — each stack loses ceil(count × DESERTION_RATE)
    // while morale < DESERTION_MORALE_THRESHOLD; deserters may spawn WILD bandits (05).
  }
}

/**
 * Phase 6 — REBELLION (docs/01 §7, §6.6).
 * Rebellion-risk checks per territory; spawn rebel armies.
 *
 * TODO(01 §7): risk = f(civil morale, food ≤ REBELLION_FOOD_THRESHOLD, occupation,
 *   tax pressure); rng-gated rebel army spawn (rng.fork(territoryId) per entity).
 */
function phaseRebellion(_state: WorldState, _tick: number, _rng: Rng, _balance: Balance): void {
  // Stub — no rebellions until 01 §7 risk model lands.
}

/**
 * Phase 7 — BATTLE SPAWNING (docs/01 §6.7, docs/04).
 * Co-located hostiles / sieges → create BattleInstance with scheduledStartTick;
 * apply resolved battle outcomes back to the map.
 *
 * TODO(04 §scheduling): hostile co-location detection (DiplomacyStance), SIEGE
 *   creation referencing exactly one defenderTerritoryId (invariant 9),
 *   ResolutionMode selection, BattleResult writeback (pillage/occupy per 02 §9,
 *   PILLAGE_INFRA_LOSS / PILLAGE_POP_LOSS), hero cap clamp ≤ HERO_IMPACT_MAX
 *   (invariant 4) in every resolution path.
 */
function phaseBattleSpawning(_state: WorldState, _tick: number, _rng: Rng, _balance: Balance): void {
  // Stub — battle-orchestration package will own resolution; the tick only spawns/applies.
}

/**
 * Phase 8 — AI hook (docs/01 §6.8, docs/06).
 * NPC Kingdom governors + army AI issue next-tick orders. AI acts LAST, on a
 * settled world; its orders take effect next tick, submitted like a player's.
 *
 * TODO(06): governor/military/diplomacy/economy AI. This hook only collects
 *   orders into the command queue — it must never mutate sim state directly.
 */
function phaseAiHook(_state: WorldState, _tick: number, _rng: Rng, _balance: Balance): void {
  // Stub — ai package plugs in here.
}
