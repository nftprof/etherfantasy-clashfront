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
 * MVP status (docs/briefs/MVP-JULY7.md item 2): MOVEMENT and BATTLE SPAWNING are
 * LIVE (parcel-graph movement, same-tick AUTO field battles via the docs/04 §5
 * WarScore math simplified for the demo, PILLAGE/OCCUPY post-victory). The other
 * phases keep their skeleton/placeholder logic; full rules land per the owning
 * doc sections referenced in each TODO.
 */
import {
  type Balance,
  CONSTANTS,
  type PostVictoryAction,
  type Rng,
  TICKS_PER_DAY,
  type UnitStack,
  type WarScore,
  loadBalance,
  newId,
} from '@clashfront/shared';
import type { Army, BattleInstance, GovernorKind, Territory } from '@clashfront/shared';
import { creditWallet, flushYieldJournal } from './economy';
import {
  armyInEngineBattle,
  createEngineBattle,
  type EngineBattleState,
  promoteQueuedEngineBattles,
} from './engineBattle';
import { updateIntelMemory } from './intel';
import { battleFoodNeed, enduranceMultiplier, marchFoodPerStep, troopCount } from './logistics';
import { type ArmyRetreatRecord, type BattleLogisticsRecord, sortedIds, type WorldState } from './state';
import { createWildBattle, stepWildBattle, type WildBattleState, wildBattleSurvivors } from './wildBattle';
import { runMarketBalancer } from './market';
import { payTransitToll, raidCaravans, settleDeliveries } from './transport';
import { runWorkerProduction } from './workers';

// ── Tick options (demo-tunable knobs; server config overrides these) ──────────

export interface TickOptions {
  /**
   * Base world-ticks per adjacency step at moveCost 1.0. Default derives from
   * canon: TRAVEL_ADJACENT_MIN minutes at TICK_SECONDS per tick. The MVP demo
   * server overrides this (brief: ~1–3 min/step at a 5 s demo tick).
   */
  travelTicksPerStep?: number;
  /** Ticks a battle winner has to pick PILLAGE/OCCUPY before the default applies. */
  choiceTimeoutTicks?: number;
  /**
   * LIVE wild battles (docs/04 §7b wild row): a PLAYER army attacking a
   * monster-garrisoned wild parcel becomes a RUNNING tactical fight on the
   * parcel's generated battlefield (watchable, steerable) instead of the
   * instant WarScore resolve. PvP / NPC / raid battles keep instant resolution.
   * Default false — existing worlds/tests are unaffected.
   */
  liveWildBattles?: boolean;
  /**
   * EXTERNAL ENGINE battles (docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md): battles
   * the sim would resolve via the INSTANT WarScore path instead become PENDING
   * ENGINE BATTLES — the hex locks like a running wild battle while the server
   * allocates a headless match on the MOBA engine and applies its HMAC result
   * callback next tick. Allocate failure falls back to the instant path.
   * Default false — existing worlds/tests are byte-identical.
   */
  engineBattles?: boolean;
  /**
   * LIVE (30 Hz, joinable/steerable) engine battles enabled (docs/04 §3a) —
   * the CF_LIVE_BATTLES kill switch. When false, COMMAND intent is ignored and
   * every engine battle allocates ACCELERATED (headless). Default true: live is
   * the norm once the engine is wired, gated by command intent + slots + pool.
   */
  liveBattles?: boolean;
  /**
   * Parcel polygon provider for wild-battlefield generation (the server wires
   * this to the demo-world geometry). Undefined ⇒ a seeded synthetic outline.
   */
  parcelPolygonOf?: (hexId: string) => [number, number][] | undefined;
}

export const DEFAULT_TICK_OPTIONS: Required<TickOptions> = {
  travelTicksPerStep: (CONSTANTS.TRAVEL_ADJACENT_MIN * 60) / CONSTANTS.TICK_SECONDS,
  choiceTimeoutTicks: 10,
  liveWildBattles: false,
  engineBattles: false,
  liveBattles: true,
  parcelPolygonOf: () => undefined,
};

function resolveOptions(options?: TickOptions): Required<TickOptions> {
  return { ...DEFAULT_TICK_OPTIONS, ...options };
}

/** World-ticks to traverse INTO the given hex (base step time × terrain moveCost). */
export function stepTicks(state: WorldState, hexId: string, options?: TickOptions): number {
  const hex = state.hexes.get(hexId);
  if (hex === undefined) throw new Error(`stepTicks: unknown hex ${hexId}`);
  const base = resolveOptions(options).travelTicksPerStep;
  return Math.max(1, Math.round(base * hex.moveCost));
}

type Phase = (
  state: WorldState,
  tick: number,
  rng: Rng,
  balance: Balance,
  options: Required<TickOptions>,
) => void;

/**
 * Advance the world by exactly one tick. Mutates `state` in place and returns it.
 *
 * @param state      post-previous-tick world state (the only writer is this loop)
 * @param tickNumber must be exactly state.world.tick + 1 (tick monotonicity, 01 §11)
 * @param rng        world-level seeded RNG; phases fork per (tick, phase)
 * @param options    demo-tunable knobs (travel step time, choice timeout)
 */
export function runTick(
  state: WorldState,
  tickNumber: number,
  rng: Rng,
  balance: Balance = loadBalance(),
  options?: TickOptions,
): WorldState {
  if (tickNumber !== state.world.tick + 1) {
    throw new Error(`tick monotonicity violated: world at ${state.world.tick}, asked to run ${tickNumber}`);
  }
  const opts = resolveOptions(options);

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
    phase(state, tickNumber, rng.fork(`t${tickNumber}`).fork(name), balance, opts);
  }

  state.world.tick = tickNumber;
  // TODO(07 §4): persist(worldState, tick) — Redis write-through → Postgres, emit tick events.
  return state;
}

/**
 * Phase 1 — PRODUCTION (docs/01 §6.1, formulas in docs/02 §6/§3/§5).
 * Territories yield food/CT/prosperity; structures & nodes produce.
 *
 * LIVE (Feature Set 2 F4, Feature Set 3 E2/E3/E5):
 *   - AGRI food production accrues per tick with an INTEGER carry (docs/02 §6
 *     fractional accumulation): carry += floor(perDay); foodStock += carry div
 *     TICKS_PER_DAY — low levels produce correctly instead of flooring to 0.
 *   - ECON trickles ⚙ econCtUnitsPerLevelPerDay × level per tick to the
 *     governor's wallet, DRAWN FROM the territory's own ctTreasury (E5: yield
 *     is redistribution, never a mint — an empty treasury pays nothing; loot
 *     inflows from nearby spending refill town/wild treasuries).
 *   - E3 enrichment pools pay ⚙ enrichYieldPctPerDay of themselves per tick
 *     (integer carry) to the CURRENT governor; SYSTEM-held pools accumulate.
 *   - E2 TRAINING sub-phase: mustering armies materialize queued soldiers.
 *   - E5: batched yield REWARDs flush into the settlement journal every
 *     ⚙ journalYieldBatchTicks.
 *
 * TODO(02 §6): structure bonuses, granary cap.
 * TODO(02 §3): prosperity target computation & per-tick movement (growth/decay).
 * TODO(02 §5): tax cycle every TAX_CYCLE_TICKS via double-entry LedgerEntry
 *   (economy package owns the ledger; this phase only requests draws).
 */
function phaseProduction(state: WorldState, tick: number, _rng: Rng, balance: Balance): void {
  for (const id of sortedIds(state.territories)) {
    const t = state.territories.get(id)!;
    // Food (AGRI): integer-carry accrual — deterministic, never fractional stock.
    const perDay = Math.floor(
      balance.food.productionBasePerAgriLevelPerDay *
        t.development.AGRICULTURE *
        (0.5 + 0.5 * (t.prosperity / 100)),
    );
    if (perDay > 0) {
      state.foodCarry ??= new Map();
      const carry = (state.foodCarry.get(id) ?? 0) + perDay;
      t.foodStock += Math.floor(carry / TICKS_PER_DAY);
      state.foodCarry.set(id, carry % TICKS_PER_DAY);
    }
    // CT trickle (ECON, F4 + E5): the territory's treasury pays its governor —
    // redistribution, capped at what the larder holds (no mint).
    const econ = t.development.ECONOMY;
    if (econ > 0 && t.governorKind !== 'SYSTEM' && state.ctBalances?.has(t.governorId) === true) {
      state.econCarry ??= new Map();
      const carry = (state.econCarry.get(id) ?? 0) + econ * balance.developmentEffects.econCtUnitsPerLevelPerDay;
      const pay = Math.min(Math.floor(carry / TICKS_PER_DAY), t.ctTreasury);
      if (pay > 0) {
        t.ctTreasury -= pay;
        creditWallet(state, t.governorId, pay, 'econ_yield', 'territory_treasury', { batch: true });
      }
      state.econCarry.set(id, carry % TICKS_PER_DAY);
    }
    // Enrichment payout (E3): the pool pays the CURRENT governor per tick with
    // an integer carry; wild/SYSTEM parcels accumulate (pay no one).
    const pool = state.enrichmentPools?.get(id) ?? 0;
    if (pool > 0 && t.governorKind !== 'SYSTEM' && state.ctBalances?.has(t.governorId) === true) {
      state.enrichCarry ??= new Map();
      const perDayCt = Math.floor(pool * balance.economy.enrichYieldPctPerDay);
      const carry = (state.enrichCarry.get(id) ?? 0) + perDayCt;
      const pay = Math.min(Math.floor(carry / TICKS_PER_DAY), pool);
      if (pay > 0) {
        state.enrichmentPools!.set(id, pool - pay);
        creditWallet(state, t.governorId, pay, 'enrich_yield', 'enrichment_pool', { batch: true });
      }
      state.enrichCarry.set(id, carry % TICKS_PER_DAY);
      // Prosperity nudge while the pool works (docs/briefs/FEATURESET-3 E3).
      if (tick % TICKS_PER_DAY === 0) {
        t.prosperity = Math.min(CONSTANTS.PROSPERITY_MAX, t.prosperity + 1);
      }
    }
  }
  // Wave 1 (WORLD-BUILD-OUT-PLAN): worker pets produce into stockpiles.
  runWorkerProduction(state, balance);
  // Wave 2: the market balancer arbitrages egregious cross-parcel price gaps
  // once per game-day (capped; leaves normal gaps to player traders).
  if (tick % TICKS_PER_DAY === 0) runMarketBalancer(state, balance);
  runTraining(state, balance);
  if (balance.economy.journalYieldBatchTicks > 0 && tick % balance.economy.journalYieldBatchTicks === 0) {
    flushYieldJournal(state, tick);
  }
}

/**
 * E2 TRAINING sub-phase (inside PRODUCTION — the canonical phase order is
 * untouched): each mustering army materializes ⚙ ratePerTick soldiers per
 * tick, filling its stacks in order. The queue dissolves when empty (or when
 * its army died mid-muster — the queued soldiers are lost with it; the CT was
 * spent up-front through the splitter, so nothing leaks).
 */
function runTraining(state: WorldState, _balance: Balance): void {
  if (state.trainingQueues === undefined) return;
  for (const armyId of sortedIds(state.trainingQueues)) {
    const q = state.trainingQueues.get(armyId)!;
    const a = state.armies.get(armyId);
    if (a === undefined || a.state === 'DISBANDED') {
      state.trainingQueues.delete(armyId);
      continue;
    }
    let budget = q.ratePerTick;
    for (const slot of q.remaining) {
      if (budget === 0) break;
      if (slot.count === 0) continue;
      const trained = Math.min(slot.count, budget);
      slot.count -= trained;
      budget -= trained;
      const stack = a.units.find((s) => s.unitClass === slot.unitClass);
      if (stack !== undefined) stack.count += trained;
    }
    if (q.remaining.every((s) => s.count === 0)) state.trainingQueues.delete(armyId);
    a.version += 1;
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
 * Phase 3 — MOVEMENT (docs/01 §3, §6.3) — LIVE (MVP subset).
 * Each MARCHING army whose arrivalTick has come steps onto the next hex of its
 * path (parcel-graph adjacency — WorldState.adjacency). On arrival at the path
 * end, or on stepping onto a hex with hostile presence (interception), the army
 * halts as GARRISON; the BATTLE SPAWNING phase later this same tick resolves any
 * hostile co-location. Step time = travelTicksPerStep × entered hex's moveCost.
 * Each step burns carried food (docs/04 §7c.1 march rations, ⚙ marchFoodPerStepPer100);
 * starvation effects (morale bleed + desertion) land in the MORALE phase.
 *
 * TODO(01 §3): ZoC contest & ambush checks, embark/disembark at HARBOR/COAST,
 *   halt orders. TODO(01 §4): route (ROAD/sea-lane) cost discounts.
 */
function phaseMovement(
  state: WorldState,
  tick: number,
  _rng: Rng,
  balance: Balance,
  options: Required<TickOptions>,
): void {
  for (const id of sortedIds(state.armies)) {
    const a = state.armies.get(id)!;
    if (a.state !== 'MARCHING') continue;
    if (a.arrivalTick === undefined || tick < a.arrivalTick) continue;
    const path = a.path ?? [];
    const next = path[0];
    if (next === undefined || !state.hexes.has(next)) {
      // Defensive: malformed order — halt in place rather than corrupt position.
      haltArmy(a);
      continue;
    }
    // Wave 3 (TRANSPORT-DELIVERY-LAYER): caravans pay transit tolls BEFORE
    // entering occupied ground — pass fee (warlords) or bribe (wilds). Can't
    // pay ⇒ halt at the border (owner re-routes or funds it).
    if (a.kind === 'CARAVAN' && !payTransitToll(state, a, next, balance)) {
      haltArmy(a);
      continue;
    }
    // Gap 2: record the hex we JUST left so retreatArmy can send us back the
    // way we came. Set on every step of the march (so a retreating army lands
    // its came-from correctly regardless of how many hops it made). Cleared
    // on a new orderMarch (see demoWorld.ts).
    a.cameFromHexId = a.hexId;
    a.hexId = next;
    a.path = path.slice(1);
    // March rations (docs/04 §7c.1): each adjacency step burns carried food.
    a.provisions.food = Math.max(0, a.provisions.food - marchFoodPerStep(a, balance));
    // Trodden bookkeeping (docs/01 §11.2): marching armies trample overgrowth.
    const terr = territoryAt(state, next);
    if (terr !== undefined) terr.lastTroddenTick = tick;

    // Caravans commute — hostile presence never halts them mid-path (raiding
    // is handled separately in raidCaravans); they also never walk-in/garrison.
    const hostile = a.kind !== 'CARAVAN' && hostileArmiesAt(state, next, a.ownerGovernorId).length > 0;
    if (a.path.length === 0 || hostile) {
      const atDestination = a.path.length === 0;
      haltArmy(a);
      if (a.kind === 'CARAVAN') continue;
      if (!hostile && atDestination && terr !== undefined) {
        if (terr.governorId === a.ownerGovernorId) {
          // Attach as garrison when arriving on a friendly, garrison-less territory.
          if (terr.garrisonArmyId === undefined) terr.garrisonArmyId = a.id;
        } else {
          // Bloodless arrival on someone else's/unowned ground (F2 walk-in,
          // F3 raid sacking) — never fires mid-path or on interception.
          maybeWalkIn(state, a, terr, tick, balance, options);
        }
      }
    } else {
      a.arrivalTick = tick + stepTicks(state, a.path[0]!, options);
    }
  }
}

/**
 * Bloodless arrival resolution (docs/briefs/FEATURESET-2.md F2/F3). The army
 * ENDED its march on a garrison-free territory it does not govern:
 *
 * - SYSTEM (wild raider) on OWNED land → automatic PILLAGE ("raiders never
 *   OCCUPY owned land"); on SYSTEM land → nothing.
 * - PLAYER on a foreign/SYSTEM TOWN, or a SYSTEM settlement with population ≥
 *   ⚙ towns.walkInMinPopulation → pendingChoice WITHOUT battle (walk-in);
 *   defaults to PILLAGE on timeout like a battle choice.
 * - NPC_KINGDOM ditto, resolved instantly as OCCUPY (existing default).
 */
function maybeWalkIn(
  state: WorldState,
  army: Army,
  terr: Territory,
  tick: number,
  balance: Balance,
  options: Required<TickOptions>,
): void {
  const garrison = terr.garrisonArmyId === undefined ? undefined : state.armies.get(terr.garrisonArmyId);
  if (garrison !== undefined && garrison.state !== 'DISBANDED') return; // defended — battles handle it
  const kind = state.governorKinds?.get(army.ownerGovernorId);
  if (kind === undefined) return;

  if (kind === 'SYSTEM') {
    // F3: wild raiders sack unguarded owned land on arrival — pillage-only, automatic.
    if (terr.governorKind !== 'SYSTEM') {
      const lootCt = pillageTerritory(state, terr, army.ownerGovernorId, balance);
      state.walkInOutcomes ??= [];
      state.walkInOutcomes.push({
        choiceId: `raid:${army.id}:${tick}`,
        territoryId: terr.id,
        governorId: army.ownerGovernorId,
        armyId: army.id,
        action: 'PILLAGE',
        lootCt,
        tick,
      });
    }
    return;
  }

  const isTown = terr.zoneType === 'TOWN';
  const isSettlement = terr.governorKind === 'SYSTEM' && terr.population >= balance.towns.walkInMinPopulation;
  if (!isTown && !isSettlement) return;
  // One pending decision per territory at a time.
  for (const c of state.pendingChoices?.values() ?? []) {
    if (c.territoryId === terr.id) return;
  }
  const choiceId = `walkin:${army.id}:${tick}`;
  state.pendingChoices ??= new Map();
  state.pendingChoices.set(choiceId, {
    id: choiceId,
    armyId: army.id,
    governorId: army.ownerGovernorId,
    territoryId: terr.id,
    createdTick: tick,
    expiresTick: tick + (kind === 'NPC_KINGDOM' ? 0 : options.choiceTimeoutTicks),
  });
  // NPCs decide instantly: bloodless conquest defaults to OCCUPY.
  if (kind === 'NPC_KINGDOM') applyChoice(state, choiceId, 'OCCUPY', tick, balance);
}

function haltArmy(a: Army): void {
  a.state = 'GARRISON';
  delete a.path;
  delete a.arrivalTick;
}

/** The territory whose footprint contains this hex (undefined for unassigned hexes). */
function territoryAt(state: WorldState, hexId: string): Territory | undefined {
  const terrId = state.hexes.get(hexId)?.territoryId;
  return terrId === undefined ? undefined : state.territories.get(terrId);
}

/** Live armies on a hex owned by someone other than `governorId` (MVP: no diplomacy — everyone else is hostile). */
export function hostileArmiesAt(state: WorldState, hexId: string, governorId: string): Army[] {
  const out: Army[] = [];
  for (const id of sortedIds(state.armies)) {
    const a = state.armies.get(id)!;
    if (a.state === 'DISBANDED' || a.hexId !== hexId) continue;
    if (a.ownerGovernorId !== governorId) out.push(a);
  }
  return out;
}

/**
 * Phase 4 — SUPPLY (docs/01 §5, §6.4).
 * isSupplied() for every army; regen/drain; supply-train raids.
 *
 * TODO(01 §5.2): real isSupplied — Dijkstra over the friendly-controlled route
 * graph to the nearest supplySource territory, range = SUPPLY_RANGE_HEXES +
 * train bonus. Placeholder below: GARRISON in a friendly supplySource territory
 * counts as supplied, everything else drains.
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
  const terr = territoryAt(state, hexId);
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
 * LIVE (docs/04 §7c.1 starvation): a MARCHING army with provisions.food = 0
 *   bleeds ⚙ starvationMoralePerTick; below DESERTION_MORALE_THRESHOLD its
 *   stacks desert at ⚙ starvationDesertionPctPerTick per tick.
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
    // Starving on the march (docs/04 §7c.1): morale bleeds; desperate men desert.
    if (a.state === 'MARCHING' && a.provisions.food === 0) {
      a.morale = Math.max(CONSTANTS.MORALE_MIN, a.morale - balance.provisions.starvationMoralePerTick);
      if (a.morale < CONSTANTS.DESERTION_MORALE_THRESHOLD) {
        for (const stack of a.units) {
          if (stack.count > 0) {
            stack.count -= Math.ceil(stack.count * balance.provisions.starvationDesertionPctPerTick);
          }
        }
        if (troopCount(a) === 0) {
          a.state = 'DISBANDED'; // the army starved away on the road
          delete a.path;
          delete a.arrivalTick;
        }
      }
    }
    // TODO(01 §5.4): full desertion — each stack loses ceil(count × DESERTION_RATE)
    // while morale < DESERTION_MORALE_THRESHOLD; deserters may spawn WILD bandits (05).
  }
}

/**
 * Phase 6 — REBELLION (docs/01 §7, §6.6) — the land + the people push back.
 *
 * LIVE (wave 4.2, WORLD-BUILD-OUT-PLAN + owner rulings 2026-07-17):
 *   a. OVERGROWTH drift (docs/01 §11): an owned parcel untouched (untrodden,
 *      no overseer activity) past REWILD_GRACE_DAYS gains REWILD_RATE_PER_DAY
 *      overgrowth points/day (integer carry via tick modulo). At 100 the land
 *      REVERTS TO WILD: SYSTEM takes over; buildings + development + pools
 *      STAY with the land (owner ruling: "buildings stay — the ground
 *      remembers construction"). This is the PASSIVE path to a wipe.
 *   b. GOVERNOR WIPE (owner ruling: wipe is a NATURAL CONDITION, not a timer):
 *      a PLAYER/NPC governor with ZERO territories is wiped — standing armies
 *      disband (no orphan soldiers invariant), officer assignments clear
 *      (Masters → the undeployed pool = EXILE), worker pets walk home,
 *      caravans disband. MARCHING armies get natural grace: they keep
 *      marching this tick; if they OCCUPY something on arrival the governor
 *      is back in play, else the next tick's check catches them. CT balance
 *      and NFT ownership are NEVER touched (money is money).
 *
 * TODO(01 §7): morale/tax-driven rebel army spawns (the original intent) —
 *   folds in beside these once the tax cycle lands.
 */
function phaseRebellion(state: WorldState, tick: number, _rng: Rng, _balance: Balance): void {
  // a — overgrowth drift + WILD reversion.
  const graceTicks = CONSTANTS.REWILD_GRACE_DAYS * TICKS_PER_DAY;
  const wildGov = [...(state.governorKinds?.entries() ?? [])].find(([, k]) => k === 'SYSTEM')?.[0];
  for (const id of sortedIds(state.territories)) {
    const t = state.territories.get(id)!;
    if (t.governorKind === 'SYSTEM') continue;                    // wild land doesn't rewild
    if (tick - t.lastTroddenTick <= graceTicks) continue;         // recently tended
    // Integer accrual: REWILD_RATE_PER_DAY points/day ⇒ spread over the day's ticks.
    const perDay = CONSTANTS.REWILD_RATE_PER_DAY;
    const ticksPerPoint = Math.max(1, Math.floor(TICKS_PER_DAY / perDay));
    if (tick % ticksPerPoint !== 0) continue;
    t.overgrowth = Math.min(100, t.overgrowth + 1);
    if (t.overgrowth >= 100 && wildGov !== undefined) {
      // WILD reversion: ownership drifts away; architecture stays.
      t.governorId = wildGov;
      t.governorKind = 'SYSTEM';
      delete t.overseerId;
      t.overgrowth = 100;
      t.version += 1;
    }
  }

  // b — governor wipe: zero territories ⇒ cleanup (armies/officers/workers).
  const holdings = new Map<string, number>();
  for (const t of state.territories.values()) {
    holdings.set(t.governorId, (holdings.get(t.governorId) ?? 0) + 1);
  }
  for (const [gov, kind] of state.governorKinds ?? []) {
    if (kind === 'SYSTEM') continue;
    if ((holdings.get(gov) ?? 0) > 0) continue;
    // Does this governor have anything on the map at all? (cheap early-out)
    let hasPresence = false;
    for (const a of state.armies.values()) {
      if (a.ownerGovernorId === gov && a.state !== 'DISBANDED') { hasPresence = true; break; }
    }
    if (!hasPresence && ![...(state.workerPets?.values() ?? [])].some((w) => w.ownerGovernorId === gov)) continue;
    // Wipe: standing (non-marching) armies disband; marching armies get their
    // natural grace (arrival may re-establish a territory via walk-in OCCUPY).
    for (const id of sortedIds(state.armies)) {
      const a = state.armies.get(id)!;
      if (a.ownerGovernorId !== gov || a.state === 'DISBANDED' || a.state === 'MARCHING') continue;
      if (armyEngagedIn(state, a.id) !== undefined || armyInEngineBattle(state, a.id) !== undefined) continue;
      disbandArmy(state, a); // officer auto-frees (leading = derived from army state)
    }
    // Officer assignments clear — Masters land in the undeployed pool (EXILE).
    for (const o of state.officers?.get(gov) ?? []) delete o.assignedTerritoryId;
    // Worker pets walk home (never lost).
    for (const [pid, w] of state.workerPets ?? []) {
      if (w.ownerGovernorId === gov) state.workerPets!.delete(pid);
    }
    // CT balance + NFT ownership untouched — money is money, blueprints are blueprints.
  }
}

/**
 * Phase 7 — BATTLE SPAWNING (docs/01 §6.7, docs/04) — LIVE (MVP subset).
 *
 * 1. Expired PILLAGE/OCCUPY choices are defaulted (NPC → OCCUPY, everyone else →
 *    PILLAGE; monsters/SYSTEM never get a choice — they don't capture land).
 * 2. Hostile co-location → BattleInstance (FIELD) resolved SAME TICK, AUTO mode,
 *    via the docs/04 §5 WarScore math + the §7c.6 logistics terms:
 *      strength = Σ classBase[unitClass] × count × (morale/100), terrain stub 1.0,
 *      + officer term capped at HERO_IMPACT_MAX (invariant 4),
 *      × endurance (attacker: carried food vs battle need; defender: territory
 *        foodStock — home advantage is literal), attacker × (1 + command-center
 *        bonus from carried gold+wood, tier cost SPENT win or lose).
 *    |gap|/max < TIE_THRESHOLD ⇒ TIE (winner 'DRAW'): symmetric smaller
 *    casualties, NO territory change, attacker retreats. Decisive: casualties
 *    proportional to the gap; losing DEFENDERS rout (DISBANDED — MVP), losing
 *    ATTACKERS retreat (adjacent friendly → adjacent neutral without hostiles →
 *    scatter: SCATTER_CASUALTY_PCT extra losses, morale collapse, disband under
 *    ⚙ scatterDisbandRemainingPct). Outcome + retreat resolution recorded in
 *    state.battleLogistics for the server to surface.
 *
 * TODO(04): SIEGE battles vs defenderTerritoryId walls (invariant 9), LOBBY/LIVE
 *   resolution via the EF MOBA, join windows, estate linked-component fronts (§7b).
 */
function phaseBattleSpawning(
  state: WorldState,
  tick: number,
  rng: Rng,
  balance: Balance,
  options: Required<TickOptions>,
): void {
  // 1 — expire pending choices (post-victory AND walk-ins share the default).
  if (state.pendingChoices !== undefined) {
    for (const choiceId of sortedIds(state.pendingChoices)) {
      const choice = state.pendingChoices.get(choiceId)!;
      if (tick < choice.expiresTick) continue;
      const kind = state.governorKinds?.get(choice.governorId);
      applyChoice(state, choiceId, kind === 'NPC_KINGDOM' ? 'OCCUPY' : 'PILLAGE', tick, balance);
    }
  }

  // 1b — advance RUNNING live wild battles (docs/04 §7b wild row): unwatched
  // battles fast-forward ⚙ acceleratedTicksPerWorldTick per world tick — the
  // SAME sim as LIVE viewing, just stepped faster (canon: acceleration is the
  // same simulation). Server-paced (`paced`) battles are stepped by the LIVE
  // 4 Hz driver between world ticks and only SETTLED here once decided.
  advanceWildBattles(state, tick, balance, options);

  // 1c — settle engine battles whose result callback landed (server-boundary
  // input, like bridge-bound outcomes) and resolve FALLBACK ones (allocate
  // failed) through the internal instant path — never brick a battle.
  settleEngineBattles(state, tick, rng, balance, options);

  // 1d — promote QUEUED command battles now that settlements freed live-pool
  // slots (docs/04 §3a): a queued battle that gets a slot flips to live allocate;
  // one that waited past ⚙ commandQueueTimeoutTicks falls back to accelerated.
  promoteQueuedEngineBattles(state, tick, balance, options.liveBattles);

  // 1e — Wave 3 (TRANSPORT-DELIVERY-LAYER): caravans on hostile hexes
  // auto-surrender (civilians don't fight); fulfilled deliveries settle.
  raidCaravans(state, balance);
  settleDeliveries(state, tick, balance);

  // 2 — detect hostile co-location, hex by hex (deterministic order).
  // Caravans are EXCLUDED — they never spawn battles (they surrender above).
  const byHex = new Map<string, Army[]>();
  for (const id of sortedIds(state.armies)) {
    const a = state.armies.get(id)!;
    if (a.state === 'DISBANDED' || a.kind === 'CARAVAN') continue;
    (byHex.get(a.hexId) ?? byHex.set(a.hexId, []).get(a.hexId)!).push(a);
  }
  const hexesInBattle = new Set<string>();
  for (const b of state.wildBattles?.values() ?? []) hexesInBattle.add(b.hexId);
  for (const b of state.engineBattles?.values() ?? []) hexesInBattle.add(b.hexId);
  for (const hexId of [...byHex.keys()].sort()) {
    // A parcel with a RUNNING battle is locked — but a march that ARRIVED this
    // tick is offered to reinforce it (Scenario H upgrade, owner 2026-07-14,
    // docs/briefs/REINFORCEMENT-LANE-QUEUE.md). Sim-side bookkeeping only —
    // actual soldier drain into the live match is the match-server's job.
    if (hexesInBattle.has(hexId)) {
      offerReinforcements(state, hexId, byHex.get(hexId)!, tick);
      continue;
    }
    const armies = byHex.get(hexId)!;
    const owners = [...new Set(armies.map((a) => a.ownerGovernorId))].sort();
    if (owners.length < 2) continue;
    // Defender = the hex's territory holder if present in the fight, else the
    // lexicographically-first owner. Everyone else attacks (temporary MVP truce
    // between multiple foreign owners — no diplomacy yet).
    const terr = territoryAt(state, hexId);
    // Gap 4 — EVASIVE truce (owner 2026-07-14, BATTLE-SCENARIO-MATRIX §4). Two
    // (or more) commuters passing through UNOWNED / no-garrison ground, ALL
    // with stance EVASIVE, don't spawn a battle — they walk past each other.
    // Any HOSTILE participant, or a hostile territory owner present in the
    // fight, cancels the truce and battle proceeds as normal.
    const hasOwner = terr !== undefined && terr.governorKind !== 'SYSTEM';
    const anyHostile = armies.some((a) => a.stance !== 'EVASIVE');
    if (!hasOwner && !anyHostile) continue;
    const defenderGov = terr !== undefined && owners.includes(terr.governorId)
      ? terr.governorId
      : owners[0]!;
    const defenders = armies.filter((a) => a.ownerGovernorId === defenderGov);
    const attackers = armies.filter((a) => a.ownerGovernorId !== defenderGov);
    if (options.liveWildBattles && isLiveWildEligible(state, terr, attackers, defenders)) {
      createRunningWildBattle(state, hexId, attackers, defenders, tick, rng.fork(hexId), balance, options);
      continue;
    }
    // ENGINE path (behind TickOptions.engineBattles): the instant resolve is
    // replaced by a pending engine battle — the server allocates the match on
    // the external MOBA engine and the result callback settles it next tick.
    if (options.engineBattles && isEngineEligible(attackers, defenders)) {
      createEngineBattle(state, hexId, attackers, defenders, defenderGov, tick, rng.fork(hexId), balance, options.liveBattles);
      continue;
    }
    resolveFieldBattle(state, hexId, attackers, defenders, tick, rng.fork(hexId), balance, options);
  }
}

// ── Reinforcement queue (Scenario H, REINFORCEMENT-LANE-QUEUE.md) ──────────

/**
 * Find the running battle (wild OR engine) on `hexId`, plus its sides.
 * Returns undefined if the hex isn't locked (defensive; the caller only calls
 * us for locked hexes).
 */
function runningBattleAt(
  state: WorldState,
  hexId: string,
): { battleId: string; attackerGov: string; defenderGov: string } | undefined {
  for (const b of state.wildBattles?.values() ?? []) {
    if (b.hexId === hexId) {
      return { battleId: b.id, attackerGov: b.attackerGovernorId, defenderGov: b.defenderGovernorId };
    }
  }
  for (const b of state.engineBattles?.values() ?? []) {
    if (b.hexId === hexId) {
      return { battleId: b.id, attackerGov: b.attackerGovernorId, defenderGov: b.defenderGovernorId };
    }
  }
  return undefined;
}

/**
 * True when `armyId` already sits in ANY reinforcement queue (an army may only
 * be offered to one battle at a time — its next march re-arms the offer).
 */
export function armyQueuedForReinforcement(state: WorldState, armyId: string): string | undefined {
  for (const [battleId, entries] of state.reinforcementQueue ?? []) {
    if (entries.some((e) => e.armyId === armyId)) return battleId;
  }
  return undefined;
}

/**
 * Called once per world tick, per locked hex that has ANY armies standing on
 * it. New arrivals (armies whose governor matches an existing participant AND
 * that aren't already queued) are appended to that battle's reinforcement
 * queue. Deterministic — armies are considered in lex-id order.
 *
 * A queued army stays put (its state was set to GARRISON when it halted) and
 * its units are UNTOUCHED — the queue is a promise of supply, not an
 * absorption. WITHDRAW (server API) removes the entry; battle resolution
 * (settleReinforcementQueue) drops the whole battle's queue.
 */
function offerReinforcements(state: WorldState, hexId: string, armies: Army[], tick: number): void {
  const battle = runningBattleAt(state, hexId);
  if (battle === undefined) return; // defensive; caller guarantees locked
  const queue = state.reinforcementQueue?.get(battle.battleId) ?? [];
  const alreadyQueuedArmies = new Set(queue.map((e) => e.armyId));
  const originalAttackerArmyIds = collectSideArmyIds(state, battle.battleId, 'ATTACKER');
  const originalDefenderArmyIds = collectSideArmyIds(state, battle.battleId, 'DEFENDER');
  const isOriginal = new Set([...originalAttackerArmyIds, ...originalDefenderArmyIds]);

  for (const a of [...armies].sort((x, y) => x.id.localeCompare(y.id))) {
    if (alreadyQueuedArmies.has(a.id)) continue;
    if (isOriginal.has(a.id)) continue; // one of the original combatants — already in the fight
    // Only same-side reinforcement in this MVP slice — an army whose governor
    // matches one of the two sides. A third-party hostile army arriving at a
    // locked hex would need diplomacy + a new-battle spawn (post-MVP); it just
    // parks silently for now (existing behaviour, no queue entry).
    let side: 'ATTACKER' | 'DEFENDER' | undefined;
    if (a.ownerGovernorId === battle.attackerGov) side = 'ATTACKER';
    else if (a.ownerGovernorId === battle.defenderGov) side = 'DEFENDER';
    if (side === undefined) continue;

    state.reinforcementQueue ??= new Map();
    if (!state.reinforcementQueue.has(battle.battleId)) state.reinforcementQueue.set(battle.battleId, []);
    state.reinforcementQueue.get(battle.battleId)!.push({
      armyId: a.id,
      governorId: a.ownerGovernorId,
      edgeFromHexId: a.cameFromHexId ?? a.hexId,
      side,
      hasHero: a.heroId !== undefined,
      queuedTick: tick,
    });
    alreadyQueuedArmies.add(a.id);
  }
}

/** All army ids currently on `battleId`'s side (helper for `offerReinforcements`). */
function collectSideArmyIds(state: WorldState, battleId: string, side: 'ATTACKER' | 'DEFENDER'): string[] {
  for (const b of state.wildBattles?.values() ?? []) {
    if (b.id === battleId) return side === 'ATTACKER' ? [...b.attackerArmyIds] : [...b.defenderArmyIds];
  }
  for (const b of state.engineBattles?.values() ?? []) {
    if (b.id === battleId) return side === 'ATTACKER' ? [...b.attackerArmyIds] : [...b.defenderArmyIds];
  }
  return [];
}

/**
 * Drop the reinforcement queue for `battleId` — called when the battle
 * settles. The queued armies stay put in whatever state their last movement
 * left them (GARRISON on the parcel); the server surfaces the settlement so
 * the player can retarget them. Idempotent.
 */
export function clearReinforcementQueue(state: WorldState, battleId: string): void {
  state.reinforcementQueue?.delete(battleId);
}

/**
 * WITHDRAW a single army from a reinforcement queue (server API — mirrors the
 * command-queue cancellability, decision 16c). Returns true if an entry was
 * removed. Does NOT touch the army's state (that's the server's job — usually
 * ordering a new march away from the locked hex).
 */
export function withdrawReinforcement(state: WorldState, battleId: string, armyId: string): boolean {
  const q = state.reinforcementQueue?.get(battleId);
  if (q === undefined) return false;
  const before = q.length;
  const filtered = q.filter((e) => e.armyId !== armyId);
  if (filtered.length === before) return false;
  if (filtered.length === 0) state.reinforcementQueue!.delete(battleId);
  else state.reinforcementQueue!.set(battleId, filtered);
  return true;
}

// ── LIVE wild battles (docs/04 §7b wild row — waves vs towers+mobs) ─────────

/**
 * Only the canonical wild case runs LIVE (scope control): ONE PLAYER governor
 * attacking SYSTEM (wild-monster) defenders on SYSTEM-governed ground. PvP,
 * NPC expansion, monster raids on players — all keep instant resolution.
 */
function isLiveWildEligible(
  state: WorldState,
  terr: Territory | undefined,
  attackers: Army[],
  defenders: Army[],
): boolean {
  if (terr === undefined || terr.governorKind !== 'SYSTEM') return false;
  if (!defenders.every((d) => state.governorKinds?.get(d.ownerGovernorId) === 'SYSTEM')) return false;
  const attackerOwners = [...new Set(attackers.map((a) => a.ownerGovernorId))];
  if (attackerOwners.length !== 1) return false;
  if (state.governorKinds?.get(attackerOwners[0]!) !== 'PLAYER') return false;
  const atkTroops = attackers.reduce((n, a) => n + troopCount(a), 0);
  const defTroops = defenders.reduce((n, a) => n + troopCount(a), 0);
  return atkTroops > 0 && defTroops > 0;
}

/** True when `armyId` is committed to a running wild battle (it cannot march/split). */
export function armyEngagedIn(state: WorldState, armyId: string): WildBattleState | undefined {
  for (const b of state.wildBattles?.values() ?? []) {
    if (b.attackerArmyIds.includes(armyId) || b.defenderArmyIds.includes(armyId)) return b;
  }
  return undefined;
}

function createRunningWildBattle(
  state: WorldState,
  hexId: string,
  attackers: Army[],
  defenders: Army[],
  tick: number,
  rng: Rng,
  balance: Balance,
  options: Required<TickOptions>,
): void {
  const battleId = newId('battle', { time: tick, random: () => rng.next() });
  // Battle-food is consumed up-front like the instant resolver (spent win or lose).
  const atkTroops = attackers.reduce((n, a) => n + troopCount(a), 0);
  const atkNeed = battleFoodNeed(atkTroops, balance);
  const atkCarried = attackers.reduce((n, a) => n + a.provisions.food, 0);
  drainProvisions(attackers, 'food', Math.min(atkCarried, atkNeed));

  // Master = the leading officer of the (single) attacking governor's armies.
  let masterName: string | undefined;
  let hasMaster = false;
  for (const a of attackers) {
    if (a.heroId === undefined) continue;
    const officer = state.officers?.get(a.ownerGovernorId)?.find((o) => o.id === a.heroId);
    if (officer !== undefined) {
      masterName = officer.name;
      hasMaster = true;
      break;
    }
  }

  const battle = createWildBattle(
    {
      id: battleId,
      seed: `${state.world.seed}:${battleId}`,
      hexId,
      polygon: parcelPolygon(state, hexId, options),
      attackers: attackers.map((a) => ({
        armyId: a.id,
        governorId: a.ownerGovernorId,
        units: a.units.map((u) => ({ cls: u.unitClass, count: u.count })),
      })),
      defenders: defenders.map((d) => ({
        armyId: d.id,
        governorId: d.ownerGovernorId,
        units: d.units.map((u) => ({ cls: u.unitClass, count: u.count })),
      })),
      ...(masterName !== undefined ? { masterName } : {}),
      hasMaster,
      startedTick: tick,
    },
    balance,
  );
  state.wildBattles ??= new Map();
  state.wildBattles.set(battleId, battle);
}

/** The real parcel outline when the server provides one, else a seeded synthetic outline. */
function parcelPolygon(state: WorldState, hexId: string, options: Required<TickOptions>): [number, number][] {
  const real = options.parcelPolygonOf(hexId);
  if (real !== undefined && real.length >= 3) return real;
  // Seeded synthetic outline: a lumpy octagon unique to the hex.
  const r = 100;
  const rng = state.world.seed;
  const poly: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * 2 * Math.PI;
    // Cheap per-vertex determinism from the hex id + world seed.
    let h = 0;
    const key = `${rng}:${hexId}:${i}`;
    for (let c = 0; c < key.length; c++) h = (h * 31 + key.charCodeAt(c)) | 0;
    const k = 0.75 + ((h >>> 8) % 1000) / 2000; // 0.75..1.25
    poly.push([Math.cos(ang) * r * k, Math.sin(ang) * r * k]);
  }
  return poly;
}

function advanceWildBattles(
  state: WorldState,
  tick: number,
  balance: Balance,
  options: Required<TickOptions>,
): void {
  if (state.wildBattles === undefined || state.wildBattles.size === 0) return;
  const budget = balance.wildBattle.acceleratedTicksPerWorldTick;
  for (const battleId of sortedIds(state.wildBattles)) {
    const b = state.wildBattles.get(battleId)!;
    if (b.outcome === undefined && b.paced !== true) {
      for (let i = 0; i < budget && b.outcome === undefined; i++) stepWildBattle(b, balance);
    }
    if (b.outcome !== undefined) settleWildBattle(state, battleId, tick, balance, options);
  }
}

/**
 * Apply a decided wild battle back to the overworld — the SAME post-battle
 * paths as the instant resolver: casualties from the tactical sim, winner
 * pendingChoice (PILLAGE/OCCUPY), §7c.5 retreat ladder for failed attackers,
 * TIE semantics on clock expiry. Produces a normal RESOLVED BattleInstance
 * (resolutionMode LIVE) + BattleLogisticsRecord so all existing events flow.
 */
export function settleWildBattle(
  state: WorldState,
  battleId: string,
  tick: number,
  balance: Balance = loadBalance(),
  options?: TickOptions,
): void {
  const b = state.wildBattles?.get(battleId);
  if (b === undefined || b.outcome === undefined) return;
  const opts = resolveOptions(options);
  state.wildBattles!.delete(battleId);
  clearReinforcementQueue(state, battleId);

  const attackers = b.attackerArmyIds
    .map((id) => state.armies.get(id))
    .filter((a): a is Army => a !== undefined && a.state !== 'DISBANDED');
  const defenders = b.defenderArmyIds
    .map((id) => state.armies.get(id))
    .filter((a): a is Army => a !== undefined && a.state !== 'DISBANDED');

  // Casualties: tactical deaths mapped back to stacks via the roster.
  const casualties: Record<string, number> = {};
  const preTroops = new Map<string, number>();
  for (const a of [...attackers, ...defenders]) preTroops.set(a.id, troopCount(a));
  let atkSoldiersStart = 0;
  let atkSoldiersLost = 0;
  let defSoldiersStart = 0;
  let defSoldiersLost = 0;
  for (const { entry, survivors } of wildBattleSurvivors(b)) {
    const army = state.armies.get(entry.armyId);
    const lost = Math.max(0, entry.soldiers - survivors);
    if (entry.side === 'ATTACKER') {
      atkSoldiersStart += entry.soldiers;
      atkSoldiersLost += lost;
    } else {
      defSoldiersStart += entry.soldiers;
      defSoldiersLost += lost;
    }
    if (lost === 0 || army === undefined) continue;
    const stack = army.units.find((s) => s.unitClass === entry.cls);
    if (stack !== undefined) stack.count = Math.max(0, stack.count - lost);
    casualties[entry.armyId] = (casualties[entry.armyId] ?? 0) + lost;
    army.version += 1;
  }

  const winner: 'ATTACKER' | 'DEFENDER' | 'DRAW' =
    b.outcome === 'ATTACKER' ? 'ATTACKER' : b.outcome === 'DEFENDER' ? 'DEFENDER' : 'DRAW';
  const territory = territoryAt(state, b.hexId);
  const retreats: ArmyRetreatRecord[] = [];
  const p = balance.provisions;

  if (winner === 'ATTACKER') {
    for (const a of attackers) {
      a.morale = Math.min(CONSTANTS.MORALE_MAX, a.morale + balance.morale.victoryDelta);
      // Broke through a PINCER — clear the flag (Gap 2, owner 2026-07-14).
      delete a.retreatPincered;
      if (troopCount(a) === 0) disbandArmy(state, a);
    }
    // Defender rout: WILD mobs still abandon the ground (routed monsters don't
    // withdraw to a friendly holding). PLAYER defenders now RETREAT through the
    // same §7c.5 ladder the attacker uses (adjacent friendly → adjacent neutral
    // → scatter) — owner rule 2026-07-14: "either side should be able to flee."
    // (Gap 1 of docs/maps/BATTLE-SCENARIO-MATRIX.md §4.)
    for (const d of defenders) {
      d.morale = Math.max(CONSTANTS.MORALE_MIN, d.morale + balance.morale.defeatDelta);
      if (state.governorKinds?.get(d.ownerGovernorId) === 'SYSTEM') {
        disbandArmy(state, d);
      } else {
        retreats.push(retreatArmy(state, d, casualties, preTroops.get(d.id) ?? troopCount(d), tick, balance));
      }
    }
  } else if (winner === 'DEFENDER') {
    for (const d of defenders) {
      d.morale = Math.min(CONSTANTS.MORALE_MAX, d.morale + balance.morale.victoryDelta);
      delete d.retreatPincered; // survived the fight — flag no longer relevant
      d.version += 1;
    }
    for (const a of attackers) {
      a.morale = Math.max(CONSTANTS.MORALE_MIN, a.morale + balance.morale.defeatDelta);
      retreats.push(retreatArmy(state, a, casualties, preTroops.get(a.id) ?? troopCount(a), tick, balance));
    }
  } else {
    // Clock expired, nothing decided (§7c.4 TIE): casualties stand, no ground
    // changes hands, the attacker withdraws.
    for (const a of [...attackers, ...defenders]) {
      a.morale = Math.max(CONSTANTS.MORALE_MIN, a.morale - p.tieMoraleLoss);
    }
    for (const a of attackers) {
      retreats.push(retreatArmy(state, a, casualties, preTroops.get(a.id) ?? troopCount(a), tick, balance));
    }
    for (const d of defenders) {
      if (troopCount(d) === 0) disbandArmy(state, d);
    }
  }

  // Score for surfacing: damage dealt to the other side (soldiers), tower kills weighted in.
  const towersDown = b.towersStart - b.towers.filter((t) => t.hp > 0).length;
  const attackerScore = defSoldiersLost + towersDown * Math.round(balance.wildBattle.towerHp / 10);
  const defenderScore = atkSoldiersLost;
  const warScore: WarScore = {
    attacker: attackerScore,
    defender: defenderScore,
    breakdown: {
      attackerArmy: atkSoldiersStart,
      attackerHero: 0,
      defenderArmy: defSoldiersStart,
      defenderHero: 0,
      terrain: 1,
      attackerEndurance: 1,
      defenderEndurance: 1,
      structures: 0,
      defenseDev: 1,
    },
  };

  const battle: BattleInstance = {
    id: battleId,
    worldId: state.world.id,
    type: 'FIELD',
    state: 'RESOLVED',
    hexId: b.hexId,
    attackerArmyIds: [...b.attackerArmyIds],
    defenderArmyIds: [...b.defenderArmyIds],
    resolutionMode: 'LIVE',
    scheduledStartTick: b.startedTick,
    participants: [],
    warScore,
    result: { winner, casualties, resolvedTick: tick, mode: battleModeOf(state, b.hexId, attackers, defenders) },
  };
  state.battles.set(battleId, battle);
  state.battleLogistics ??= new Map();
  state.battleLogistics.set(battleId, {
    battleId,
    outcomeKind: winner === 'ATTACKER' ? 'DECISIVE_ATTACKER' : winner === 'DEFENDER' ? 'DECISIVE_DEFENDER' : 'TIE',
    attackerEndurance: 1,
    defenderEndurance: 1,
    commandCenterTier: 0, // wild maps: NO attacker CC at all (§7b) — waves from the edge
    structureBonus: 0,
    attackerFoodConsumed: 0,
    defenderFoodConsumed: 0,
    goldSpent: 0,
    woodSpent: 0,
    retreats,
  });

  // Post-victory: the winning PLAYER picks PILLAGE|OCCUPY exactly like an
  // instant battle (monsters never capture; ties never change territory).
  if (winner !== 'ATTACKER' || territory === undefined) {
    if (battle.result !== undefined && territory !== undefined) battle.result.territoryOutcome = 'HELD';
    return;
  }
  const gov = b.attackerGovernorId;
  if (gov === territory.governorId || state.governorKinds?.get(gov) !== 'PLAYER') {
    battle.result!.territoryOutcome = 'HELD';
    return;
  }
  const survivorStanding = attackers.some((a) => a.state !== 'DISBANDED' && a.hexId === b.hexId && troopCount(a) > 0);
  if (!survivorStanding) {
    battle.result!.territoryOutcome = 'HELD'; // mutual destruction — nobody holds the field
    return;
  }
  queueChoice(state, battle, gov, territory.id, tick, opts.choiceTimeoutTicks);
}

// ── AUTO field-battle resolution (docs/04 §5 WarScore, demo-simplified) ──────

/** Raw army strength: Σ classBase × count × (morale/100). Terrain stub = 1.0. */
export function armyStrength(army: Army, balance: Balance): number {
  const base = army.units.reduce(
    (sum, s: UnitStack) => sum + balance.units.classBase[s.unitClass] * s.count,
    0,
  );
  return base * (army.morale / 100);
}

/** Officer (hero/master) WarScore term — fame-scaled, HARD-capped at HERO_IMPACT_MAX (invariant 4). */
function heroTerm(state: WorldState, army: Army, baseStrength: number): number {
  if (army.heroId === undefined) return 0;
  const officer = state.officers?.get(army.ownerGovernorId)?.find((o) => o.id === army.heroId);
  if (officer === undefined) return 0;
  const impact = Math.min(CONSTANTS.HERO_IMPACT_MAX, officer.fame / 2000); // demo fame curve
  return baseStrength * impact;
}

function sideScore(state: WorldState, side: Army[], balance: Balance): { army: number; hero: number } {
  let army = 0;
  let hero = 0;
  for (const a of side) {
    let s = armyStrength(a, balance);
    // E2: caught mid-muster — the half-trained ranks fight at ⚙ musterPenalty.
    if (state.trainingQueues?.get(a.id)?.remaining.some((r) => r.count > 0) === true) {
      s *= balance.training.musterPenalty;
    }
    army += s;
    hero += heroTerm(state, a, s);
  }
  return { army, hero };
}

function resolveFieldBattle(
  state: WorldState,
  hexId: string,
  attackers: Army[],
  defenders: Army[],
  tick: number,
  rng: Rng,
  balance: Balance,
  options: Required<TickOptions>,
): void {
  const p = balance.provisions;
  const atk = sideScore(state, attackers, balance);
  const def = sideScore(state, defenders, balance);
  const terrainMod = 1.0; // stub — biome designations land later (locked decision 2)
  const territory = territoryAt(state, hexId);

  // Pre-battle troop counts — the scatter disband threshold reads these (§7c.5).
  const preTroops = new Map<string, number>();
  for (const a of [...attackers, ...defenders]) preTroops.set(a.id, troopCount(a));

  // Endurance terms (docs/04 §7c.6): attacker fights on carried food, defender
  // eats the territory's foodStock — home advantage is literal. No territory
  // (open filler hex) ⇒ the defender lives off the land (adequacy 1).
  const atkTroops = attackers.reduce((n, a) => n + troopCount(a), 0);
  const defTroops = defenders.reduce((n, a) => n + troopCount(a), 0);
  const atkNeed = battleFoodNeed(atkTroops, balance);
  const defNeed = battleFoodNeed(defTroops, balance);
  const atkFoodCarried = attackers.reduce((n, a) => n + a.provisions.food, 0);
  const atkEndurance = enduranceMultiplier(atkFoodCarried, atkNeed, balance);
  const defEndurance = territory === undefined ? 1 : enduranceMultiplier(territory.foodStock, defNeed, balance);

  // Attacker structure term (docs/04 §7c.2): the best temporary command-center
  // tier the carried gold+wood affords (requirements scale per 100 soldiers).
  const atkGold = attackers.reduce((n, a) => n + a.provisions.gold, 0);
  const atkWood = attackers.reduce((n, a) => n + a.provisions.wood, 0);
  let ccTier = 0;
  let ccBonus = 0;
  let ccGoldCost = 0;
  let ccWoodCost = 0;
  for (let i = 0; i < p.commandCenterTiers.length; i++) {
    const t = p.commandCenterTiers[i]!;
    const g = Math.ceil((t.goldPer100 * atkTroops) / 100);
    const w = Math.ceil((t.woodPer100 * atkTroops) / 100);
    if (atkGold >= g && atkWood >= w) {
      ccTier = i + 1;
      ccBonus = t.bonus;
      ccGoldCost = g;
      ccWoodCost = w;
    }
  }

  // DEF development (F4): the holder's garrison fights behind its earthworks —
  // defender WarScore × (1 + ⚙ defenseWarScorePerLevel × DEFENSE level) when
  // the defending side actually governs the parcel.
  const defenseDev =
    territory !== undefined && defenders.some((d) => d.ownerGovernorId === territory.governorId)
      ? 1 + balance.developmentEffects.defenseWarScorePerLevel * territory.development.DEFENSE
      : 1;

  const attackerScore = (atk.army + atk.hero) * terrainMod * atkEndurance * (1 + ccBonus);
  const defenderScore = (def.army + def.hero) * terrainMod * defEndurance * defenseDev;
  if (attackerScore === 0 && defenderScore === 0) return; // nothing to fight with

  // Logistics are SPENT whether the battle is won or lost (docs/04 §7c.2–3).
  const atkFoodConsumed = Math.min(atkFoodCarried, atkNeed);
  drainProvisions(attackers, 'food', atkFoodConsumed);
  drainProvisions(attackers, 'gold', ccGoldCost);
  drainProvisions(attackers, 'wood', ccWoodCost);
  let defFoodConsumed = 0;
  if (territory !== undefined) {
    defFoodConsumed = Math.min(territory.foodStock, defNeed);
    territory.foodStock -= defFoodConsumed;
  }

  const warScore: WarScore = {
    attacker: attackerScore,
    defender: defenderScore,
    breakdown: {
      attackerArmy: atk.army,
      attackerHero: atk.hero,
      defenderArmy: def.army,
      defenderHero: def.hero,
      terrain: terrainMod,
      attackerEndurance: atkEndurance,
      defenderEndurance: defEndurance,
      structures: ccBonus,
      defenseDev,
    },
  };

  // TIE (docs/04 §7c.4): score gap below TIE_THRESHOLD ⇒ no decisive outcome.
  const isTie =
    Math.abs(attackerScore - defenderScore) / Math.max(attackerScore, defenderScore) < CONSTANTS.TIE_THRESHOLD;
  const winner: 'ATTACKER' | 'DEFENDER' | 'DRAW' = isTie
    ? 'DRAW'
    : attackerScore > defenderScore
      ? 'ATTACKER'
      : 'DEFENDER';

  const casualties: Record<string, number> = {};
  const applyCasualties = (side: Army[], frac: number): void => {
    for (const a of side) {
      let lost = 0;
      for (const stack of a.units) {
        const l = Math.floor(stack.count * frac);
        stack.count -= l;
        lost += l;
      }
      casualties[a.id] = lost;
    }
  };

  const retreats: ArmyRetreatRecord[] = [];

  if (isTie) {
    // Symmetric, smaller-than-decisive casualties; both sides shaken; the
    // attacker failed to take the field and must retreat (§7c.4–5).
    applyCasualties(attackers, p.tieCasualtyFrac);
    applyCasualties(defenders, p.tieCasualtyFrac);
    for (const a of [...attackers, ...defenders]) {
      a.morale = Math.max(CONSTANTS.MORALE_MIN, a.morale - p.tieMoraleLoss);
    }
    for (const a of attackers) retreats.push(retreatArmy(state, a, casualties, preTroops.get(a.id)!, tick, balance));
    for (const a of defenders) {
      if (troopCount(a) === 0) disbandArmy(state, a);
    }
  } else {
    const [winSide, loseSide, winScore, loseScore] =
      winner === 'ATTACKER'
        ? [attackers, defenders, attackerScore, defenderScore]
        : [defenders, attackers, defenderScore, attackerScore];

    // Casualties proportional to the score gap (demo curve, deterministic).
    const gap = (winScore - loseScore) / winScore; // (0..1]
    applyCasualties(winSide, Math.max(0.05, 0.25 * (1 - gap)));
    applyCasualties(loseSide, Math.min(0.9, 0.35 + 0.55 * gap));

    for (const a of winSide) {
      a.morale = Math.min(CONSTANTS.MORALE_MAX, a.morale + balance.morale.victoryDelta);
      delete a.retreatPincered; // survived — clear any pincer flag
      // Winners that wiped a stack down to zero men disband too (mutual destruction).
      if (troopCount(a) === 0) disbandArmy(state, a);
    }
    if (winner === 'ATTACKER') {
      // Defender rout (Gap 1, owner 2026-07-14): WILD mobs abandon the ground
      // (routed monsters don't withdraw to a friendly holding), PLAYER
      // defenders retreat via the same §7c.5 ladder attackers use — either
      // side should be able to flee.
      for (const a of loseSide) {
        a.morale = Math.max(CONSTANTS.MORALE_MIN, a.morale + balance.morale.defeatDelta);
        if (state.governorKinds?.get(a.ownerGovernorId) === 'SYSTEM') {
          disbandArmy(state, a);
        } else {
          retreats.push(retreatArmy(state, a, casualties, preTroops.get(a.id)!, tick, balance));
        }
      }
    } else {
      // Failed invaders retreat with the §7c.5 ladder (replaces the Day-1
      // "losers scatter to DISBANDED" placeholder for attackers).
      for (const a of loseSide) {
        a.morale = Math.max(CONSTANTS.MORALE_MIN, a.morale + balance.morale.defeatDelta);
        retreats.push(retreatArmy(state, a, casualties, preTroops.get(a.id)!, tick, balance));
      }
    }
  }

  const battle: BattleInstance = {
    id: newId('battle', { time: tick, random: () => rng.next() }),
    worldId: state.world.id,
    type: 'FIELD',
    state: 'RESOLVED',
    hexId,
    attackerArmyIds: attackers.map((a) => a.id),
    defenderArmyIds: defenders.map((a) => a.id),
    resolutionMode: 'AUTO',
    scheduledStartTick: tick,
    participants: [],
    warScore,
    result: { winner, casualties, resolvedTick: tick, mode: battleModeOf(state, hexId, attackers, defenders) },
  };
  state.battles.set(battle.id, battle);
  state.battleLogistics ??= new Map();
  state.battleLogistics.set(battle.id, {
    battleId: battle.id,
    outcomeKind: isTie ? 'TIE' : winner === 'ATTACKER' ? 'DECISIVE_ATTACKER' : 'DECISIVE_DEFENDER',
    attackerEndurance: atkEndurance,
    defenderEndurance: defEndurance,
    commandCenterTier: ccTier,
    structureBonus: ccBonus,
    attackerFoodConsumed: atkFoodConsumed,
    defenderFoodConsumed: defFoodConsumed,
    goldSpent: ccGoldCost,
    woodSpent: ccWoodCost,
    retreats,
  });

  const winnerGov = attackers[0]!.ownerGovernorId; // single-owner side by construction… except mixed attackers:
  // with multiple foreign owners the strongest contributor claims the victory (deterministic).
  const attackerOwners = [...new Set(attackers.map((a) => a.ownerGovernorId))];
  const claimingGov = attackerOwners.length === 1
    ? winnerGov
    : attackerOwners
        .map((g) => ({
          g,
          s: attackers.filter((a) => a.ownerGovernorId === g).reduce((n, a) => n + armyStrength(a, balance), 0),
        }))
        .sort((x, y) => y.s - x.s || (x.g < y.g ? -1 : 1))[0]!.g;
  postVictoryFlow(state, battle, territory, claimingGov, tick, balance, options.choiceTimeoutTicks);
}

/**
 * Post-victory (docs/02 §9): only a DECISIVE ATTACKER victory on someone
 * else's territory triggers PILLAGE|OCCUPY (ties never change territory —
 * §7c.4). Monsters/SYSTEM never capture land. Shared by the instant resolver
 * and the engine-callback settlement (same rules, one code path).
 */
function postVictoryFlow(
  state: WorldState,
  battle: BattleInstance,
  territory: Territory | undefined,
  claimingGov: string,
  tick: number,
  balance: Balance,
  choiceTimeoutTicks: number,
): void {
  if (battle.result?.winner !== 'ATTACKER' || territory === undefined) {
    if (battle.result !== undefined && territory !== undefined) battle.result.territoryOutcome = 'HELD';
    return;
  }
  if (claimingGov === territory.governorId) {
    battle.result.territoryOutcome = 'HELD';
    return;
  }
  const kind = state.governorKinds?.get(claimingGov);
  if (kind === 'SYSTEM' || kind === undefined) {
    if (kind === 'SYSTEM' && territory.governorKind !== 'SYSTEM') {
      // F3: victorious wild raiders sack the land they cannot hold — raiders
      // never OCCUPY owned land; pillage-only, automatic.
      queueChoice(state, battle, claimingGov, territory.id, tick, 0);
      applyChoice(state, battle.id, 'PILLAGE', tick, balance);
      return;
    }
    // Unregistered governors (or monsters on wild ground) hold the field but never capture.
    battle.result.territoryOutcome = 'HELD';
    return;
  }
  if (kind === 'NPC_KINGDOM') {
    // NPCs decide instantly: default OCCUPY (brief item 2).
    queueChoice(state, battle, claimingGov, territory.id, tick, 0);
    applyChoice(state, battle.id, 'OCCUPY', tick, balance);
    return;
  }
  // Player: expose the pending choice; defaults to PILLAGE on timeout.
  queueChoice(state, battle, claimingGov, territory.id, tick, choiceTimeoutTicks);
}

// ── ENGINE battles (docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md, behind TickOptions.engineBattles) ──

/**
 * Engine routing eligibility: one attacking governor (the allocate schema has
 * one governorId per side) and real troops on both sides. Multi-owner attacker
 * stacks (the temporary MVP truce edge) keep the instant path.
 */
function isEngineEligible(attackers: Army[], defenders: Army[]): boolean {
  if (new Set(attackers.map((a) => a.ownerGovernorId)).size !== 1) return false;
  const atk = attackers.reduce((n, a) => n + troopCount(a), 0);
  const def = defenders.reduce((n, d) => n + troopCount(d), 0);
  return atk > 0 && def > 0;
}

/**
 * Apply decided engine battles back to the overworld. Outcomes (set by the
 * verified HMAC callback) settle through the SAME post-battle paths as the
 * instant resolver; FALLBACK records (allocate failed) resolve RIGHT HERE via
 * the internal instant path (re-routing them through the co-location scan
 * would just mint another doomed engine battle).
 */
function settleEngineBattles(
  state: WorldState,
  tick: number,
  rng: Rng,
  balance: Balance,
  options: Required<TickOptions>,
): void {
  if (state.engineBattles === undefined || state.engineBattles.size === 0) return;
  for (const battleId of sortedIds(state.engineBattles)) {
    const b = state.engineBattles.get(battleId)!;
    if (b.outcome !== undefined) {
      state.engineBattles.delete(battleId);
      clearReinforcementQueue(state, battleId);
      applyEngineOutcome(state, b, tick, balance, options);
    } else if (b.status === 'FALLBACK') {
      // Never brick a battle: the instant WarScore resolver settles the
      // still-standing armies (same rng fork path as the co-location scan).
      state.engineBattles.delete(battleId);
      clearReinforcementQueue(state, battleId);
      const live = (ids: readonly string[]): Army[] =>
        ids
          .map((id) => state.armies.get(id))
          .filter((a): a is Army => a !== undefined && a.state !== 'DISBANDED' && a.hexId === b.hexId);
      const attackers = live(b.attackerArmyIds);
      const defenders = live(b.defenderArmyIds);
      if (attackers.length > 0 && defenders.length > 0) {
        resolveFieldBattle(state, b.hexId, attackers, defenders, tick, rng.fork(b.hexId), balance, options);
      }
    }
  }
}

/**
 * Settle one engine battle from its result callback: casualties per UnitClass
 * applied to the real armies (survivors march on), provisions burned, structure
 * damage per anchor, winner/TIE semantics identical to the instant resolver
 * (defender rout / §7c.5 retreat ladder / tie stand-down), then the normal
 * deterministic post-battle flow (pillage/occupy pending choice).
 */
function applyEngineOutcome(
  state: WorldState,
  b: EngineBattleState,
  tick: number,
  balance: Balance,
  options: Required<TickOptions>,
): void {
  const outcome = b.outcome!;
  const attackers = b.attackerArmyIds
    .map((id) => state.armies.get(id))
    .filter((a): a is Army => a !== undefined && a.state !== 'DISBANDED');
  const defenders = b.defenderArmyIds
    .map((id) => state.armies.get(id))
    .filter((a): a is Army => a !== undefined && a.state !== 'DISBANDED');

  const preTroops = new Map<string, number>();
  for (const a of [...attackers, ...defenders]) preTroops.set(a.id, troopCount(a));
  let atkSoldiersStart = 0;
  let defSoldiersStart = 0;
  for (const a of attackers) atkSoldiersStart += preTroops.get(a.id)!;
  for (const d of defenders) defSoldiersStart += preTroops.get(d.id)!;

  // Casualties per UnitClass (the schema field the economy hard-depends on):
  // kill N per class across the side's armies in sorted id order (deterministic).
  const casualties: Record<string, number> = {};
  const applySideCasualties = (side: Army[], dead: Record<string, number>): number => {
    let total = 0;
    const armies = [...side].sort((x, y) => (x.id < y.id ? -1 : 1));
    for (const cls of Object.keys(dead).sort()) {
      let left = Math.max(0, Math.floor(dead[cls] ?? 0));
      for (const a of armies) {
        if (left === 0) break;
        const stack = a.units.find((s) => s.unitClass === cls);
        if (stack === undefined || stack.count === 0) continue;
        const take = Math.min(stack.count, left);
        stack.count -= take;
        left -= take;
        casualties[a.id] = (casualties[a.id] ?? 0) + take;
        a.version += 1;
        total += take;
      }
    }
    return total;
  };
  const atkLost = applySideCasualties(attackers, outcome.sides.ATTACKER.casualties);
  const defLost = applySideCasualties(defenders, outcome.sides.DEFENDER.casualties);

  // Provisions the match burned (capped at what the side actually carries).
  const drainSide = (side: Army[], consumed?: { food?: number; gold?: number; wood?: number }): void => {
    if (consumed === undefined) return;
    for (const key of ['food', 'gold', 'wood'] as const) {
      const amt = Math.max(0, Math.floor(consumed[key] ?? 0));
      if (amt > 0) drainProvisions(side, key, amt);
    }
  };
  drainSide(attackers, outcome.sides.ATTACKER.provisionsConsumed);
  drainSide(defenders, outcome.sides.DEFENDER.provisionsConsumed);

  // Structure damage per anchor: `anchor_<i>` indexes the territory's
  // structures array (the same mapping the allocate context was built with).
  const territory = territoryAt(state, b.hexId);
  if (territory !== undefined && outcome.structures !== undefined) {
    for (const s of outcome.structures) {
      const ix = Number(/^anchor_(\d+)$/.exec(s.anchorId)?.[1]);
      const st = Number.isInteger(ix) ? territory.structures[ix] : undefined;
      if (st === undefined) continue;
      st.hp = s.destroyed ? 0 : Math.max(0, Math.min(st.maxHp, Math.floor(s.hp)));
      territory.version += 1;
    }
  }

  const winner: 'ATTACKER' | 'DEFENDER' | 'DRAW' = outcome.winner === 'TIE' ? 'DRAW' : outcome.winner;
  const retreats: ArmyRetreatRecord[] = [];
  const p = balance.provisions;
  if (winner === 'ATTACKER') {
    for (const a of attackers) {
      a.morale = Math.min(CONSTANTS.MORALE_MAX, a.morale + balance.morale.victoryDelta);
      delete a.retreatPincered; // broke through
      if (troopCount(a) === 0) disbandArmy(state, a);
    }
    // Defender rout: WILD mobs abandon the ground; PLAYER defenders retreat
    // via the same §7c.5 ladder attackers use (Gap 1 — owner rule 2026-07-14,
    // "either side should be able to flee"). Mirrors the instant-resolver path.
    for (const d of defenders) {
      d.morale = Math.max(CONSTANTS.MORALE_MIN, d.morale + balance.morale.defeatDelta);
      if (state.governorKinds?.get(d.ownerGovernorId) === 'SYSTEM') {
        disbandArmy(state, d);
      } else {
        retreats.push(retreatArmy(state, d, casualties, preTroops.get(d.id) ?? troopCount(d), tick, balance));
      }
    }
  } else if (winner === 'DEFENDER') {
    for (const d of defenders) {
      d.morale = Math.min(CONSTANTS.MORALE_MAX, d.morale + balance.morale.victoryDelta);
      delete d.retreatPincered;
      d.version += 1;
      if (troopCount(d) === 0) disbandArmy(state, d);
    }
    for (const a of attackers) {
      a.morale = Math.max(CONSTANTS.MORALE_MIN, a.morale + balance.morale.defeatDelta);
      retreats.push(retreatArmy(state, a, casualties, preTroops.get(a.id) ?? troopCount(a), tick, balance));
    }
  } else {
    // TIE (FOOD_CLOCK/TIMEOUT): casualties stand, no ground changes hands,
    // the attacker withdraws (docs/04 §7c.4).
    for (const a of [...attackers, ...defenders]) {
      a.morale = Math.max(CONSTANTS.MORALE_MIN, a.morale - p.tieMoraleLoss);
    }
    for (const a of attackers) {
      retreats.push(retreatArmy(state, a, casualties, preTroops.get(a.id) ?? troopCount(a), tick, balance));
    }
    for (const d of defenders) {
      if (troopCount(d) === 0) disbandArmy(state, d);
    }
  }

  const warScore: WarScore = {
    attacker: defLost,
    defender: atkLost,
    breakdown: {
      attackerArmy: atkSoldiersStart,
      attackerHero: 0, // officer contribution stats are M1-placeholder — hero-impact cap applies at M2
      defenderArmy: defSoldiersStart,
      defenderHero: 0,
      terrain: 1,
      attackerEndurance: 1,
      defenderEndurance: 1,
      structures: 0,
      defenseDev: 1,
    },
  };
  const battle: BattleInstance = {
    id: b.id,
    worldId: state.world.id,
    type: 'FIELD',
    state: 'RESOLVED',
    hexId: b.hexId,
    attackerArmyIds: [...b.attackerArmyIds],
    defenderArmyIds: [...b.defenderArmyIds],
    resolutionMode: 'ACCELERATED',
    scheduledStartTick: b.startedTick,
    ...(b.matchId !== undefined ? { efMobaMatchId: b.matchId } : {}),
    participants: [],
    warScore,
    result: { winner, casualties, resolvedTick: tick, mode: battleModeOf(state, b.hexId, attackers, defenders) },
  };
  state.battles.set(b.id, battle);
  state.battleLogistics ??= new Map();
  state.battleLogistics.set(b.id, {
    battleId: b.id,
    outcomeKind: winner === 'ATTACKER' ? 'DECISIVE_ATTACKER' : winner === 'DEFENDER' ? 'DECISIVE_DEFENDER' : 'TIE',
    attackerEndurance: 1,
    defenderEndurance: 1,
    commandCenterTier: 0,
    structureBonus: 0,
    attackerFoodConsumed: Math.max(0, Math.floor(outcome.sides.ATTACKER.provisionsConsumed?.food ?? 0)),
    defenderFoodConsumed: Math.max(0, Math.floor(outcome.sides.DEFENDER.provisionsConsumed?.food ?? 0)),
    goldSpent: Math.max(0, Math.floor(outcome.sides.ATTACKER.provisionsConsumed?.gold ?? 0)),
    woodSpent: Math.max(0, Math.floor(outcome.sides.ATTACKER.provisionsConsumed?.wood ?? 0)),
    retreats,
  });

  // Same deterministic post-battle flow as every other resolver.
  postVictoryFlow(state, battle, territory, b.attackerGovernorId, tick, balance, options.choiceTimeoutTicks);
}

/** Deduct `amount` of one provision kind across a side, greedily in army-id order (deterministic). */
function drainProvisions(side: Army[], key: 'food' | 'gold' | 'wood', amount: number): void {
  let left = amount;
  for (const a of [...side].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    if (left === 0) break;
    const take = Math.min(a.provisions[key], left);
    a.provisions[key] -= take;
    left -= take;
  }
}

/** Remove an army from play, releasing garrison slot + monster display name + training queue. */
/**
 * Determine the BattleMode hint for a collision (docs/maps/GAME-MODES-SEEDING-
 * REVIEW.md taxonomy). SEMANTIC ONLY — the sim math is symmetric enough that
 * mode doesn't change resolution; the mode tells the map view and the recent-
 * battles panel what the fight was actually about. Gap 3 fix: unowned land +
 * multiple hostile armies = DOMINION, not the old arbitrary lex-first defender.
 */
/**
 * The universal fallback taxonomy — every parcel supports these three by
 * construction (BATTLEFIELD-SCHEMA.md playability gate invariant 6).
 * CLASH/DOMINION are capability flags in `meta.modes` (COORD-001); when the
 * ideal-pick isn't supported, `intersectMode()` falls back through this list.
 */
const UNIVERSAL_MODES: readonly ('DUEL' | 'SIEGE' | 'GUARD' | 'CLASH' | 'DOMINION')[] = [
  'DUEL', 'SIEGE', 'GUARD',
];

/**
 * Reconcile the sim's ideal mode pick with the parcel's `meta.modes[]`
 * capability list (COORD-001 ratified 2026-07-15). When `supported` is
 * undefined, the parcel supports everything (back-compat: standalone/legacy
 * maps that predate meta.modes). Fallbacks:
 *   CLASH   → DUEL   (3+ armies on non-fair-edge geometry — extras route to
 *                     Scenario H reinforcement queue, already shipped)
 *   DOMINION → DUEL  (no viable center objective — resolve as 2-side fight)
 * DUEL/SIEGE/GUARD are universal per the playability gate, so their fallback
 * never triggers (kept as identity for safety).
 */
export function intersectMode(
  ideal: 'DUEL' | 'SIEGE' | 'GUARD' | 'CLASH' | 'DOMINION',
  supported?: readonly ('DUEL' | 'SIEGE' | 'GUARD' | 'CLASH' | 'DOMINION')[],
): 'DUEL' | 'SIEGE' | 'GUARD' | 'CLASH' | 'DOMINION' {
  if (supported === undefined || supported.includes(ideal)) return ideal;
  if (ideal === 'CLASH' || ideal === 'DOMINION') return 'DUEL';
  return ideal; // universal — kept as identity
}

function battleModeOf(
  state: WorldState,
  hexId: string,
  attackers: readonly Army[],
  defenders: readonly Army[],
  supportedModes?: readonly ('DUEL' | 'SIEGE' | 'GUARD' | 'CLASH' | 'DOMINION')[],
): 'DUEL' | 'SIEGE' | 'GUARD' | 'CLASH' | 'DOMINION' {
  const terr = territoryAt(state, hexId);
  const totalArmies = attackers.length + defenders.length;
  // All defenders SYSTEM (wild mobs / no defenders at all) → GUARD.
  if (defenders.length > 0 && defenders.every((d) => state.governorKinds?.get(d.ownerGovernorId) === 'SYSTEM')) {
    return intersectMode('GUARD', supportedModes);
  }
  // Player-owned territory with a defender ⇒ SIEGE.
  if (terr !== undefined && terr.governorKind !== 'SYSTEM' && defenders.some((d) => d.ownerGovernorId === terr.governorId)) {
    return intersectMode('SIEGE', supportedModes);
  }
  // Unowned/SYSTEM land + no wild defenders + 2+ hostile armies ⇒ DOMINION.
  // (Gap 3, owner 2026-07-14: "no occupier ⇒ intent-driven DOMINION.")
  const noPlayerOwner = terr === undefined || terr.governorKind === 'SYSTEM';
  const noWildDefenders = defenders.every((d) => state.governorKinds?.get(d.ownerGovernorId) !== 'SYSTEM');
  const allHostile = [...attackers, ...defenders].every((a) => a.stance !== 'EVASIVE');
  if (noPlayerOwner && noWildDefenders && totalArmies >= 2 && allHostile) return intersectMode('DOMINION', supportedModes);
  // 3+ armies (or 2 without stakes) meeting engagement ⇒ CLASH.
  if (totalArmies >= 3) return intersectMode('CLASH', supportedModes);
  // Fallback: two-army fight with at least one side having a stake ⇒ DUEL.
  return intersectMode('DUEL', supportedModes);
}

/** Universal-mode list (COORD-001) — exported for callers that need the base set. */
export function universalBattleModes(): readonly ('DUEL' | 'SIEGE' | 'GUARD' | 'CLASH' | 'DOMINION')[] {
  return UNIVERSAL_MODES;
}

function disbandArmy(state: WorldState, a: Army): void {
  a.state = 'DISBANDED';
  delete a.path;
  delete a.arrivalTick;
  const terr = territoryAt(state, a.hexId);
  if (terr?.garrisonArmyId === a.id) delete terr.garrisonArmyId;
  if (state.monsterNames?.has(a.id) === true) state.monsterNames.delete(a.id);
  // E2: an army wiped mid-muster loses its queued soldiers (CT stays spent).
  if (state.trainingQueues?.has(a.id) === true) state.trainingQueues.delete(a.id);
}

/**
 * Retreat resolution for a failed/tied army (docs/04 §7c.5 + Gap 2 pincer 2026-07-14).
 * Priority (deterministic; neighbors are stored sorted):
 *   0. PINCER already fired (a.retreatPincered) → ABANDONED (army lost, officer
 *      returns to the undeployed pool). The pincer's escape hatch.
 *   1. Came-from hex (owner rule 2026-07-14: "retreat back the way you came").
 *      Placed there regardless of hostiles — a hostile came-from is the PINCER:
 *      army retreats INTO the trap, marked retreatPincered, next battle can't
 *      cascade again. Safe came-from = clean RETREATED.
 *   2. Adjacent friendly parcel without hostile presence → RETREATED there.
 *   3. Adjacent SYSTEM/unassigned parcel without hostile garrison → RETREATED.
 *   4. SCATTERED: SCATTER_CASUALTY_PCT extra losses, morale collapse; DISBANDED
 *      when fewer than ⚙ scatterDisbandRemainingPct of pre-battle troops remain.
 */
function retreatArmy(
  state: WorldState,
  a: Army,
  casualties: Record<string, number>,
  preBattleTroops: number,
  tick: number,
  balance: Balance,
): ArmyRetreatRecord {
  if (troopCount(a) === 0) {
    disbandArmy(state, a);
    return { armyId: a.id, result: 'DISBANDED' };
  }
  // 0. PINCER lost: abandonment — all soldiers count as casualties, army fully
  // DISBANDED, but the officer/Master link auto-frees (game.ts:906 treats a
  // DISBANDED army's leader as free for redeployment). Owner rule 2026-07-14:
  // "or u can still flee. but u will abandon all ur soldiers and return as
  // undeploy state."
  if (a.retreatPincered === true) {
    let abandoned = 0;
    for (const stack of a.units) { abandoned += stack.count; stack.count = 0; }
    casualties[a.id] = (casualties[a.id] ?? 0) + abandoned;
    disbandArmy(state, a);
    return { armyId: a.id, result: 'ABANDONED' };
  }
  const neighbors = state.adjacency?.get(a.hexId) ?? [];
  let target: string | undefined;
  let cameFromHostile = false;
  // 1. Came-from first (regardless of hostiles — the pincer path).
  const cameFrom = a.cameFromHexId;
  if (cameFrom !== undefined && cameFrom !== a.hexId && neighbors.includes(cameFrom)) {
    target = cameFrom;
    cameFromHostile = hostileArmiesAt(state, cameFrom, a.ownerGovernorId).length > 0;
  }
  // 2. Adjacent friendly without hostiles.
  if (target === undefined) {
    for (const n of neighbors) {
      const t = territoryAt(state, n);
      if (t !== undefined && t.governorId === a.ownerGovernorId && hostileArmiesAt(state, n, a.ownerGovernorId).length === 0) {
        target = n;
        break;
      }
    }
  }
  // 3. Adjacent SYSTEM/unassigned without hostiles.
  if (target === undefined) {
    for (const n of neighbors) {
      const t = territoryAt(state, n);
      const neutral = t === undefined || t.governorKind === 'SYSTEM';
      if (neutral && hostileArmiesAt(state, n, a.ownerGovernorId).length === 0) {
        target = n;
        break;
      }
    }
  }
  if (target !== undefined) {
    const here = territoryAt(state, a.hexId);
    if (here?.garrisonArmyId === a.id) delete here.garrisonArmyId;
    a.hexId = target;
    a.state = 'GARRISON';
    delete a.path;
    delete a.arrivalTick;
    a.morale = Math.max(CONSTANTS.MORALE_MIN, a.morale - balance.morale.retreatMoraleLoss);
    // Mark the pincer on the way IN — the next battle on this hex can't cascade
    // again (§7c.5 already exhausted); its loss triggers the abandonment above.
    if (cameFromHostile) a.retreatPincered = true;
    else delete a.retreatPincered;
    // Update came-from bookkeeping so an army that retreats then marches again
    // uses the retreat destination as its NEW starting point.
    a.cameFromHexId = a.hexId; // will be overwritten on the next march step
    const t = territoryAt(state, target);
    if (t !== undefined) {
      t.lastTroddenTick = tick;
      if (t.governorId === a.ownerGovernorId && t.garrisonArmyId === undefined) t.garrisonArmyId = a.id;
    }
    a.version += 1;
    return { armyId: a.id, result: 'RETREATED', toHexId: target };
  }
  // Nowhere to go — scatter.
  let scattered = 0;
  for (const stack of a.units) {
    const l = Math.floor(stack.count * CONSTANTS.SCATTER_CASUALTY_PCT);
    stack.count -= l;
    scattered += l;
  }
  casualties[a.id] = (casualties[a.id] ?? 0) + scattered;
  a.morale = Math.max(CONSTANTS.MORALE_MIN, Math.min(a.morale, balance.provisions.scatterMoraleFloor));
  const remaining = troopCount(a);
  if (remaining === 0 || (preBattleTroops > 0 && remaining < preBattleTroops * balance.provisions.scatterDisbandRemainingPct)) {
    disbandArmy(state, a);
    return { armyId: a.id, result: 'DISBANDED' };
  }
  a.state = 'GARRISON'; // crippled remnant holds where it stands
  delete a.path;
  delete a.arrivalTick;
  a.version += 1;
  return { armyId: a.id, result: 'SCATTERED' };
}

function queueChoice(
  state: WorldState,
  battle: BattleInstance,
  governorId: string,
  territoryId: string,
  tick: number,
  timeoutTicks: number,
): void {
  state.pendingChoices ??= new Map();
  state.pendingChoices.set(battle.id, {
    id: battle.id,
    battleId: battle.id,
    governorId,
    territoryId,
    createdTick: tick,
    expiresTick: tick + timeoutTicks,
  });
}

/**
 * Resolve a pending choice — post-victory (choiceId = battleId) or a bloodless
 * walk-in (F2). The server order API calls this on the chooser's behalf; the
 * BATTLE SPAWNING phase calls applyChoice on timeout with the default.
 *
 * PILLAGE — winner's CT balance gains loot (treasury share + per-pop scavenge);
 *   territory takes the canon PILLAGE_INFRA_LOSS / PILLAGE_POP_LOSS hits.
 * OCCUPY — governor switches; PLAYER governors must assign a free officer as
 *   overseer within MAX_OVERSEEN_TERRITORIES (docs/01 §11.3) or the occupation
 *   CONVERTS TO PILLAGE.
 */
export function resolvePostVictory(
  state: WorldState,
  choiceId: string,
  action: PostVictoryAction,
  balance: Balance = loadBalance(),
  overseerId?: string,
): void {
  if (state.pendingChoices?.has(choiceId) !== true) {
    throw new Error(`no pending post-victory choice for battle ${choiceId}`);
  }
  applyChoice(state, choiceId, action, state.world.tick, balance, overseerId);
}

/**
 * Resolve the overseer for an occupation/claim: explicit officer if given
 * (must belong to gov and be free), else first free officer (auto-assign).
 */
export function pickOfficer(state: WorldState, gov: string, overseerId?: string) {
  if (overseerId === undefined) return freeOfficer(state, gov);
  const officer = (state.officers?.get(gov) ?? []).find((o) => o.id === overseerId);
  if (officer === undefined) throw new Error(`pickOfficer: ${overseerId} is not an officer of ${gov}`);
  if (officer.assignedTerritoryId !== undefined) {
    throw new Error(`pickOfficer: ${officer.name} already oversees a territory`);
  }
  return officer;
}

/**
 * PILLAGE a territory for `gov` (docs/02 §9 + E3/E5): loot = treasury share +
 * per-pop scavenge (CAPPED at what the treasury still holds — pillage is
 * redistribution, never a mint) + ⚙ enrichLootPct of the parcel's enrichment
 * pool; canon PILLAGE_INFRA_LOSS / PILLAGE_POP_LOSS hits. Returns the loot
 * (ct_units). Never changes the governor.
 */
function pillageTerritory(state: WorldState, territory: Territory, gov: string, balance: Balance): number {
  state.ctBalances ??= new Map();
  const lootTreasury = Math.floor(territory.ctTreasury * balance.pillageOccupy.pillageLootTreasuryPct);
  const lootScavenge = Math.min(
    territory.population * balance.pillageOccupy.pillageLootCtUnitsPerPop,
    territory.ctTreasury - lootTreasury,
  );
  territory.ctTreasury -= lootTreasury + lootScavenge;
  creditWallet(state, gov, lootTreasury + lootScavenge, 'pillage_loot', 'territory_treasury');
  // E3: raiders carry off a share of the land's enrichment pool too.
  const pool = state.enrichmentPools?.get(territory.id) ?? 0;
  const lootPool = Math.floor(pool * balance.economy.enrichLootPct);
  if (lootPool > 0) {
    state.enrichmentPools!.set(territory.id, pool - lootPool);
    creditWallet(state, gov, lootPool, 'pillage_enrichment', 'enrichment_pool');
  }
  for (const track of Object.keys(territory.development) as (keyof Territory['development'])[]) {
    territory.development[track] = Math.floor(territory.development[track] * (1 - CONSTANTS.PILLAGE_INFRA_LOSS));
  }
  territory.population = Math.floor(territory.population * (1 - CONSTANTS.PILLAGE_POP_LOSS));
  territory.prosperity = Math.max(
    CONSTANTS.PROSPERITY_MIN,
    Math.floor(territory.prosperity * (1 - CONSTANTS.PILLAGE_INFRA_LOSS)),
  );
  territory.version += 1;
  return lootTreasury + lootScavenge + lootPool;
}

/**
 * OCCUPY a territory for `gov` (docs/02 §9): seize the treasury share, switch
 * governor, free the evicted holder's overseer, assign `officer` as overseer
 * (players), garrison the first surviving own army on the hex. Returns the
 * seized ct_units. Oversight gating happens in applyChoice — not here.
 */
function occupyTerritory(
  state: WorldState,
  territory: Territory,
  gov: string,
  kind: GovernorKind,
  tick: number,
  balance: Balance,
  officer?: { id: string; assignedTerritoryId?: string },
): number {
  state.ctBalances ??= new Map();
  const seized = Math.floor(territory.ctTreasury * balance.pillageOccupy.occupySeizeTreasuryPct);
  territory.ctTreasury -= seized;
  creditWallet(state, gov, seized, 'occupy_seize', 'territory_treasury');
  // E3: the enrichment pool is attached to the LAND — the conqueror inherits
  // whatever remains in it (no transfer needed; it is keyed by territory id).
  // Free the evicted holder's overseer — otherwise that officer stays assigned
  // to a territory its governor no longer holds (officer leak against the
  // MAX_OVERSEEN_TERRITORIES cap).
  if (territory.overseerId !== undefined) {
    const prev = state.officers?.get(territory.governorId)?.find((o) => o.id === territory.overseerId);
    if (prev?.assignedTerritoryId === territory.id) delete prev.assignedTerritoryId;
  }
  territory.governorId = gov;
  territory.governorKind = kind;
  delete territory.overseerId;
  if (kind === 'PLAYER' && officer !== undefined) {
    officer.assignedTerritoryId = territory.id;
    territory.overseerId = officer.id;
  }
  territory.morale = Math.max(
    CONSTANTS.MORALE_MIN,
    territory.morale - balance.morale.occupiedCivilMoraleLoss,
  );
  territory.lastTroddenTick = tick;
  // New holder's first surviving army on the hex garrisons the holding.
  delete territory.garrisonArmyId;
  for (const id of sortedIds(state.armies)) {
    const a = state.armies.get(id)!;
    if (a.state !== 'DISBANDED' && a.ownerGovernorId === gov && territory.hexIds.includes(a.hexId)) {
      territory.garrisonArmyId = a.id;
      break;
    }
  }
  territory.version += 1;
  return seized;
}

/**
 * Apply a pending PILLAGE/OCCUPY choice — post-battle (records onto
 * battle.result) or walk-in (records into state.walkInOutcomes). A walk-in
 * whose arriving army no longer stands on the territory is CANCELLED silently
 * (no loot from afar).
 */
function applyChoice(
  state: WorldState,
  choiceId: string,
  action: PostVictoryAction,
  tick: number,
  balance: Balance,
  overseerId?: string,
): void {
  const choice = state.pendingChoices?.get(choiceId);
  if (choice === undefined) throw new Error(`applyPostVictory: no pending choice/battle ${choiceId}`);
  const battle = choice.battleId === undefined ? undefined : state.battles.get(choice.battleId);
  if (choice.battleId !== undefined && battle?.result === undefined) {
    throw new Error(`applyPostVictory: no pending choice/battle ${choiceId}`);
  }
  const territory = state.territories.get(choice.territoryId);
  if (territory === undefined) throw new Error(`applyPostVictory: territory ${choice.territoryId} gone`);
  state.pendingChoices!.delete(choiceId);

  // Walk-in guard: the arriving army must still be standing on the territory.
  if (choice.armyId !== undefined) {
    const a = state.armies.get(choice.armyId);
    if (a === undefined || a.state === 'DISBANDED' || !territory.hexIds.includes(a.hexId)) return;
  }

  const gov = choice.governorId;
  const kind = state.governorKinds?.get(gov) ?? 'PLAYER';

  let officer: ReturnType<typeof pickOfficer>;
  if (action === 'OCCUPY' && kind === 'PLAYER') {
    // Officer oversight gate (docs/01 §11.3, CONSTANTS.MAX_OVERSEEN_TERRITORIES).
    // pickOfficer THROWS on an invalid explicit choice (surfaces to the API);
    // with no explicit choice, no-free-officer converts the occupation to pillage.
    const overseen = countOverseen(state, gov);
    officer = pickOfficer(state, gov, overseerId);
    if (overseen >= CONSTANTS.MAX_OVERSEEN_TERRITORIES || officer === undefined) {
      action = 'PILLAGE'; // occupation converts to pillage — no overseer available
      officer = undefined;
    }
  }

  const lootCt =
    action === 'PILLAGE'
      ? pillageTerritory(state, territory, gov, balance)
      : occupyTerritory(state, territory, gov, kind, tick, balance, officer);

  if (battle?.result !== undefined) {
    battle.result.postVictoryAction = action;
    battle.result.territoryOutcome = action === 'PILLAGE' ? 'PILLAGED' : 'OCCUPIED';
    battle.result.lootCt = lootCt;
  } else {
    state.walkInOutcomes ??= [];
    state.walkInOutcomes.push({
      choiceId,
      territoryId: territory.id,
      governorId: gov,
      ...(choice.armyId !== undefined ? { armyId: choice.armyId } : {}),
      action,
      lootCt,
      tick,
    });
  }
}

/** Territories currently occupied by `gov` that hold an assigned overseer. */
export function countOverseen(state: WorldState, gov: string): number {
  let n = 0;
  for (const t of state.territories.values()) {
    if (t.governorId === gov && t.overseerId !== undefined) n++;
  }
  return n;
}

/** First (by id) officer of `gov` not yet overseeing a territory. */
export function freeOfficer(state: WorldState, gov: string) {
  const pool = state.officers?.get(gov) ?? [];
  return [...pool]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .find((o) => o.assignedTerritoryId === undefined);
}

/**
 * Phase 8 — AI hook (docs/01 §6.8, docs/06).
 * NPC Kingdom governors + army AI issue next-tick orders. AI acts LAST, on a
 * settled world; its orders take effect next tick, submitted like a player's.
 *
 * LIVE (Feature Set 2):
 *   1. F3 wild-raid survivors auto-march home / re-merge into their lair;
 *   2. F3 monster lairs roll seeded raids every ⚙ wildRaids.everyTicks;
 *   3. F1 intel-memory bookkeeping (scout reveal/decay) on the settled world.
 *
 * TODO(06): governor/military/diplomacy/economy AI (the NPC kingdom currently
 *   lives in the server layer and reads raw state — it may cheat on fog for now).
 */
function phaseAiHook(
  state: WorldState,
  tick: number,
  rng: Rng,
  balance: Balance,
  options: Required<TickOptions>,
): void {
  returnWildRaiders(state, tick, balance, options);
  spawnWildRaids(state, tick, rng.fork('wildRaids'), balance, options);
  updateIntelMemory(state, tick, balance);
}

// ── F3: active wild raids (docs/briefs/FEATURESET-2.md) ──────────────────────

/** Raid chance for a lair at normalized distance-from-center (⚙ wildRaids). */
export function wildRaidChance(distNorm: number, balance: Balance): number {
  const wr = balance.wildRaids;
  return wr.baseChance + wr.edgeChanceBonus * Math.max(0, Math.min(1, distNorm));
}

/** True when `armyId`'s owner is a SYSTEM (wild) governor. */
function isWildArmy(state: WorldState, army: Army): boolean {
  return state.governorKinds?.get(army.ownerGovernorId) === 'SYSTEM';
}

/**
 * Monster-passable transit: no territory, or SYSTEM-governed ground without a
 * live foreign garrison. Owned (player/NPC) land is a blockade for raiders too
 * — it may only be a raid's terminal destination.
 */
function wildTransitOk(state: WorldState, hexId: string, owner: string): boolean {
  const terr = territoryAt(state, hexId);
  if (terr === undefined) return true;
  if (terr.governorKind !== 'SYSTEM') return false;
  if (terr.garrisonArmyId === undefined) return true;
  const g = state.armies.get(terr.garrisonArmyId);
  return g === undefined || g.state === 'DISBANDED' || g.ownerGovernorId === owner;
}

/** BFS path over monster-passable ground; destination allowed regardless. Excludes the start hex. */
function wildPath(state: WorldState, fromHex: string, toHex: string, owner: string): string[] | undefined {
  if (fromHex === toHex) return [];
  const prev = new Map<string, string>();
  const seen = new Set([fromHex]);
  const queue = [fromHex];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi]!;
    for (const n of state.adjacency?.get(cur) ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      if (n !== toHex && !wildTransitOk(state, n, owner)) continue;
      prev.set(n, cur);
      if (n === toHex) {
        const path: string[] = [n];
        let p = cur;
        while (p !== fromHex) {
          path.push(p);
          p = prev.get(p)!;
        }
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return undefined;
}

/** Put an army on the march along `path` (raid logistics — mirrors orderMarch without the order-API guards). */
function marchWild(state: WorldState, a: Army, path: string[], tick: number, options: Required<TickOptions>): void {
  const here = territoryAt(state, a.hexId);
  if (here?.garrisonArmyId === a.id) delete here.garrisonArmyId;
  a.state = 'MARCHING';
  a.path = [...path];
  a.arrivalTick = tick + stepTicks(state, path[0]!, options);
  a.version += 1;
}

/**
 * F3 step 1 — survivors head home and re-merge. A raid army halted anywhere
 * but home marches back; at home it merges its stacks + provisions into the
 * lair garrison (or BECOMES the garrison when the lair fell while it was out).
 */
function returnWildRaiders(
  state: WorldState,
  tick: number,
  _balance: Balance,
  options: Required<TickOptions>,
): void {
  if (state.wildRaids === undefined) return;
  for (const armyId of [...state.wildRaids.keys()].sort()) {
    const rec = state.wildRaids.get(armyId)!;
    const a = state.armies.get(armyId);
    if (a === undefined || a.state === 'DISBANDED') {
      state.wildRaids.delete(armyId); // the raid died on the road / in battle
      continue;
    }
    if (a.state !== 'GARRISON') continue; // still marching
    if (armyEngagedIn(state, armyId) !== undefined || armyInEngineBattle(state, armyId) !== undefined) continue; // pinned in a running battle

    if (a.hexId !== rec.homeHexId) {
      // Halted away from home (raid done, retreated, or intercepted) — march back.
      const path = wildPath(state, a.hexId, rec.homeHexId, a.ownerGovernorId);
      if (path !== undefined && path.length > 0) marchWild(state, a, path, tick, options);
      else state.wildRaids.delete(armyId); // stranded — it squats where it stands
      continue;
    }

    // Home again: merge into the lair (or inherit it).
    const lair = state.armies.get(rec.lairArmyId);
    if (lair !== undefined && lair.state === 'GARRISON' && lair.hexId === rec.homeHexId) {
      for (const s of a.units) {
        if (s.count === 0) continue;
        const dst = lair.units.find((u) => u.unitClass === s.unitClass);
        if (dst !== undefined) dst.count += s.count;
        else lair.units.push({ ...s });
      }
      lair.provisions.food += a.provisions.food;
      lair.provisions.gold += a.provisions.gold;
      lair.provisions.wood += a.provisions.wood;
      lair.version += 1;
      disbandArmy(state, a);
    } else {
      // The lair fell while the raiders were out — the survivors are the new lair.
      const terr = territoryAt(state, rec.homeHexId);
      if (terr !== undefined && terr.governorId === a.ownerGovernorId && terr.garrisonArmyId === undefined) {
        terr.garrisonArmyId = a.id;
      }
    }
    state.wildRaids.delete(armyId);
  }
}

/**
 * F3 step 2 — every ⚙ wildRaids.everyTicks each monster lair rolls a seeded
 * chance (fork per (tick, territoryId), scaled by distance-from-center) to
 * split HALF its garrison into a raid army that marches — visibly,
 * interceptably, by the normal MOVEMENT rules — at the weakest player/NPC
 * territory within ⚙ raidRangeSteps. Garrisons at/above
 * ⚙ defendedStrengthThreshold are never picked; ungarrisoned land is preferred
 * (strength 0 sorts first).
 */
function spawnWildRaids(
  state: WorldState,
  tick: number,
  rng: Rng,
  balance: Balance,
  options: Required<TickOptions>,
): void {
  const wr = balance.wildRaids;
  if (wr.everyTicks <= 0 || tick % wr.everyTicks !== 0) return;
  if (state.adjacency === undefined) return;

  // Normalized distance-from-center over the hex display centers (q, r).
  let cx = 0;
  let cy = 0;
  for (const h of state.hexes.values()) {
    cx += h.q;
    cy += h.r;
  }
  cx /= Math.max(1, state.hexes.size);
  cy /= Math.max(1, state.hexes.size);
  let maxDist = 1e-9;
  for (const h of state.hexes.values()) maxDist = Math.max(maxDist, Math.hypot(h.q - cx, h.r - cy));

  // Lairs already raiding sit the round out.
  const raidingLairs = new Set([...(state.wildRaids?.values() ?? [])].map((r) => r.lairArmyId));

  for (const terrId of sortedIds(state.territories)) {
    const t = state.territories.get(terrId)!;
    if (t.governorKind !== 'SYSTEM' || t.garrisonArmyId === undefined) continue;
    const lair = state.armies.get(t.garrisonArmyId);
    if (lair === undefined || lair.state !== 'GARRISON' || !isWildArmy(state, lair)) continue;
    if (raidingLairs.has(lair.id)) continue;
    if (troopCount(lair) < wr.minRaidTroops) continue;
    if (armyEngagedIn(state, lair.id) !== undefined || armyInEngineBattle(state, lair.id) !== undefined) continue; // under live assault — every claw defends



    const r = rng.fork(terrId); // PRNG(world.seed, tick, 'ai/wildRaids', territoryId)
    const hex = state.hexes.get(lair.hexId)!;
    const distNorm = Math.hypot(hex.q - cx, hex.r - cy) / maxDist;
    if (r.next() >= wildRaidChance(distNorm, balance)) continue;

    // Target hunt: BFS ≤ raidRangeSteps over monster-passable ground; owned
    // territories are terminal candidates.
    const candidates: { terrId: string; hexId: string; steps: number; strength: number }[] = [];
    const depth = new Map<string, number>([[lair.hexId, 0]]);
    const queue = [lair.hexId];
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi]!;
      const d = depth.get(cur)!;
      if (d >= wr.raidRangeSteps) continue;
      for (const n of state.adjacency.get(cur) ?? []) {
        if (depth.has(n)) continue;
        depth.set(n, d + 1);
        const nt = territoryAt(state, n);
        if (nt !== undefined && (nt.governorKind === 'PLAYER' || nt.governorKind === 'NPC_KINGDOM')) {
          const g = nt.garrisonArmyId === undefined ? undefined : state.armies.get(nt.garrisonArmyId);
          const strength = g !== undefined && g.state !== 'DISBANDED' ? armyStrength(g, balance) : 0;
          if (strength < wr.defendedStrengthThreshold) {
            candidates.push({ terrId: nt.id, hexId: n, steps: d + 1, strength });
          }
          continue; // owned land is terminal — raiders cannot path through it
        }
        if (wildTransitOk(state, n, lair.ownerGovernorId)) queue.push(n);
      }
    }
    if (candidates.length === 0) continue;
    candidates.sort(
      (x, y) => x.strength - y.strength || x.steps - y.steps || (x.terrId < y.terrId ? -1 : 1),
    );
    const target = candidates[0]!;
    const path = wildPath(state, lair.hexId, target.hexId, lair.ownerGovernorId);
    if (path === undefined || path.length === 0) continue;

    // Split HALF the lair (floor per stack) + half its provisions into the raid.
    const raidUnits: UnitStack[] = [];
    for (const s of lair.units) {
      const half = Math.floor(s.count / 2);
      if (half === 0) continue;
      s.count -= half;
      raidUnits.push({ ...s, count: half });
    }
    if (raidUnits.length === 0) continue;
    const halfProv = {
      food: Math.floor(lair.provisions.food / 2),
      gold: Math.floor(lair.provisions.gold / 2),
      wood: Math.floor(lair.provisions.wood / 2),
    };
    lair.provisions.food -= halfProv.food;
    lair.provisions.gold -= halfProv.gold;
    lair.provisions.wood -= halfProv.wood;
    lair.version += 1;

    const raid: Army = {
      id: newId('army', { time: tick, random: () => r.next() }),
      worldId: state.world.id,
      ownerGovernorId: lair.ownerGovernorId,
      state: 'GARRISON',
      hexId: lair.hexId,
      units: raidUnits,
      provisions: halfProv,
      supply: lair.supply,
      supplyMax: lair.supplyMax,
      morale: lair.morale,
      supplyTrainIds: [],
      version: 1,
    };
    state.armies.set(raid.id, raid);
    const name = state.monsterNames?.get(lair.id);
    if (name !== undefined) {
      state.monsterNames ??= new Map();
      state.monsterNames.set(raid.id, name);
    }
    marchWild(state, raid, path, tick, options);
    state.wildRaids ??= new Map();
    state.wildRaids.set(raid.id, {
      armyId: raid.id,
      lairArmyId: lair.id,
      homeHexId: lair.hexId,
      targetHexId: target.hexId,
      spawnedTick: tick,
    });
  }
}
