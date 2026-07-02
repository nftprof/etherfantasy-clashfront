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
import { updateIntelMemory } from './intel';
import { battleFoodNeed, enduranceMultiplier, marchFoodPerStep, troopCount } from './logistics';
import { type ArmyRetreatRecord, type BattleLogisticsRecord, sortedIds, type WorldState } from './state';

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
}

export const DEFAULT_TICK_OPTIONS: Required<TickOptions> = {
  travelTicksPerStep: (CONSTANTS.TRAVEL_ADJACENT_MIN * 60) / CONSTANTS.TICK_SECONDS,
  choiceTimeoutTicks: 10,
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
 * LIVE (Feature Set 2 F4):
 *   - AGRI food production accrues per tick with an INTEGER carry (docs/02 §6
 *     fractional accumulation): carry += floor(perDay); foodStock += carry div
 *     TICKS_PER_DAY — low levels produce correctly instead of flooring to 0.
 *   - ECON trickles ⚙ econCtUnitsPerLevelPerDay × level to the governor's CT
 *     wallet per tick, same integer-carry scheme per governor.
 *
 * TODO(02 §6): structure bonuses, granary cap.
 * TODO(02 §3): prosperity target computation & per-tick movement (growth/decay).
 * TODO(02 §5): tax cycle every TAX_CYCLE_TICKS via double-entry LedgerEntry
 *   (economy package owns the ledger; this phase only requests draws).
 */
function phaseProduction(state: WorldState, _tick: number, _rng: Rng, balance: Balance): void {
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
    // CT trickle (ECON, F4): governed territories pay their governor's wallet.
    const econ = t.development.ECONOMY;
    if (econ > 0 && t.governorKind !== 'SYSTEM' && state.ctBalances?.has(t.governorId) === true) {
      state.econCarry ??= new Map();
      const carry = (state.econCarry.get(t.governorId) ?? 0) + econ * balance.developmentEffects.econCtUnitsPerLevelPerDay;
      const pay = Math.floor(carry / TICKS_PER_DAY);
      if (pay > 0) state.ctBalances.set(t.governorId, state.ctBalances.get(t.governorId)! + pay);
      state.econCarry.set(t.governorId, carry % TICKS_PER_DAY);
    }
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
    a.hexId = next;
    a.path = path.slice(1);
    // March rations (docs/04 §7c.1): each adjacency step burns carried food.
    a.provisions.food = Math.max(0, a.provisions.food - marchFoodPerStep(a, balance));
    // Trodden bookkeeping (docs/01 §11.2): marching armies trample overgrowth.
    const terr = territoryAt(state, next);
    if (terr !== undefined) terr.lastTroddenTick = tick;

    const hostile = hostileArmiesAt(state, next, a.ownerGovernorId).length > 0;
    if (a.path.length === 0 || hostile) {
      const atDestination = a.path.length === 0;
      haltArmy(a);
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

  // 2 — detect hostile co-location, hex by hex (deterministic order).
  const byHex = new Map<string, Army[]>();
  for (const id of sortedIds(state.armies)) {
    const a = state.armies.get(id)!;
    if (a.state === 'DISBANDED') continue;
    (byHex.get(a.hexId) ?? byHex.set(a.hexId, []).get(a.hexId)!).push(a);
  }
  for (const hexId of [...byHex.keys()].sort()) {
    const armies = byHex.get(hexId)!;
    const owners = [...new Set(armies.map((a) => a.ownerGovernorId))].sort();
    if (owners.length < 2) continue;
    // Defender = the hex's territory holder if present in the fight, else the
    // lexicographically-first owner. Everyone else attacks (temporary MVP truce
    // between multiple foreign owners — no diplomacy yet).
    const terr = territoryAt(state, hexId);
    const defenderGov = terr !== undefined && owners.includes(terr.governorId)
      ? terr.governorId
      : owners[0]!;
    const defenders = armies.filter((a) => a.ownerGovernorId === defenderGov);
    const attackers = armies.filter((a) => a.ownerGovernorId !== defenderGov);
    resolveFieldBattle(state, hexId, attackers, defenders, tick, rng.fork(hexId), balance, options);
  }
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
    const s = armyStrength(a, balance);
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
      // Winners that wiped a stack down to zero men disband too (mutual destruction).
      if (troopCount(a) === 0) disbandArmy(state, a);
    }
    if (winner === 'ATTACKER') {
      // Losing DEFENDERS rout off the map — MVP simplification (defender
      // retreat pathing is post-MVP, docs/03).
      for (const a of loseSide) disbandArmy(state, a);
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
    result: { winner, casualties, resolvedTick: tick },
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

  // Post-victory (docs/02 §9): only a DECISIVE surviving ATTACKER on someone
  // else's territory triggers PILLAGE|OCCUPY (ties never change territory —
  // §7c.4). Monsters/SYSTEM never capture land.
  if (winner !== 'ATTACKER' || territory === undefined) {
    if (battle.result !== undefined && territory !== undefined) battle.result.territoryOutcome = 'HELD';
    return;
  }
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
  if (claimingGov === territory.governorId) {
    battle.result!.territoryOutcome = 'HELD';
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
    battle.result!.territoryOutcome = 'HELD';
    return;
  }
  if (kind === 'NPC_KINGDOM') {
    // NPCs decide instantly: default OCCUPY (brief item 2).
    queueChoice(state, battle, claimingGov, territory.id, tick, 0);
    applyChoice(state, battle.id, 'OCCUPY', tick, balance);
    return;
  }
  // Player: expose the pending choice; defaults to PILLAGE on timeout.
  queueChoice(state, battle, claimingGov, territory.id, tick, options.choiceTimeoutTicks);
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

/** Remove an army from play, releasing garrison slot + monster display name. */
function disbandArmy(state: WorldState, a: Army): void {
  a.state = 'DISBANDED';
  delete a.path;
  delete a.arrivalTick;
  const terr = territoryAt(state, a.hexId);
  if (terr?.garrisonArmyId === a.id) delete terr.garrisonArmyId;
  if (state.monsterNames?.has(a.id) === true) state.monsterNames.delete(a.id);
}

/**
 * Retreat resolution for a failed/tied attacker (docs/04 §7c.5), deterministic
 * (neighbors are stored sorted):
 *   1. adjacent friendly parcel without hostile presence → RETREATED there;
 *   2. else adjacent SYSTEM/unassigned parcel without hostile garrison → RETREATED;
 *   3. else SCATTERED: SCATTER_CASUALTY_PCT extra losses (recorded in the battle
 *      casualties), morale collapses to ⚙ scatterMoraleFloor, the crippled army
 *      stays on the field — or DISBANDED when fewer than ⚙ scatterDisbandRemainingPct
 *      of its pre-battle troops remain.
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
  const neighbors = state.adjacency?.get(a.hexId) ?? [];
  let target: string | undefined;
  for (const n of neighbors) {
    const t = territoryAt(state, n);
    if (t !== undefined && t.governorId === a.ownerGovernorId && hostileArmiesAt(state, n, a.ownerGovernorId).length === 0) {
      target = n;
      break;
    }
  }
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
 * PILLAGE a territory for `gov` (docs/02 §9): loot = treasury share + per-pop
 * scavenge into the governor's CT wallet; canon PILLAGE_INFRA_LOSS /
 * PILLAGE_POP_LOSS hits. Returns the loot (ct_units). Never changes the governor.
 */
function pillageTerritory(state: WorldState, territory: Territory, gov: string, balance: Balance): number {
  state.ctBalances ??= new Map();
  const lootTreasury = Math.floor(territory.ctTreasury * balance.pillageOccupy.pillageLootTreasuryPct);
  const lootScavenge = territory.population * balance.pillageOccupy.pillageLootCtUnitsPerPop;
  territory.ctTreasury -= lootTreasury;
  state.ctBalances.set(gov, (state.ctBalances.get(gov) ?? 0) + lootTreasury + lootScavenge);
  for (const track of Object.keys(territory.development) as (keyof Territory['development'])[]) {
    territory.development[track] = Math.floor(territory.development[track] * (1 - CONSTANTS.PILLAGE_INFRA_LOSS));
  }
  territory.population = Math.floor(territory.population * (1 - CONSTANTS.PILLAGE_POP_LOSS));
  territory.prosperity = Math.max(
    CONSTANTS.PROSPERITY_MIN,
    Math.floor(territory.prosperity * (1 - CONSTANTS.PILLAGE_INFRA_LOSS)),
  );
  territory.version += 1;
  return lootTreasury + lootScavenge;
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
  state.ctBalances.set(gov, (state.ctBalances.get(gov) ?? 0) + seized);
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
