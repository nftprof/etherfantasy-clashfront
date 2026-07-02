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
import type { Army, BattleInstance, Territory } from '@clashfront/shared';
import { sortedIds, type WorldState } from './state';

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
 * Phase 3 — MOVEMENT (docs/01 §3, §6.3) — LIVE (MVP subset).
 * Each MARCHING army whose arrivalTick has come steps onto the next hex of its
 * path (parcel-graph adjacency — WorldState.adjacency). On arrival at the path
 * end, or on stepping onto a hex with hostile presence (interception), the army
 * halts as GARRISON; the BATTLE SPAWNING phase later this same tick resolves any
 * hostile co-location. Step time = travelTicksPerStep × entered hex's moveCost.
 *
 * TODO(01 §3): ZoC contest & ambush checks, embark/disembark at HARBOR/COAST,
 *   halt orders. TODO(01 §4): route (ROAD/sea-lane) cost discounts.
 */
function phaseMovement(
  state: WorldState,
  tick: number,
  _rng: Rng,
  _balance: Balance,
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
    // Trodden bookkeeping (docs/01 §11.2): marching armies trample overgrowth.
    const terr = territoryAt(state, next);
    if (terr !== undefined) terr.lastTroddenTick = tick;

    const hostile = hostileArmiesAt(state, next, a.ownerGovernorId).length > 0;
    if (a.path.length === 0 || hostile) {
      haltArmy(a);
      // Attach as garrison when halting on a friendly, garrison-less territory.
      if (!hostile && terr !== undefined && terr.governorId === a.ownerGovernorId && terr.garrisonArmyId === undefined) {
        terr.garrisonArmyId = a.id;
      }
    } else {
      a.arrivalTick = tick + stepTicks(state, a.path[0]!, options);
    }
  }
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
 * Phase 7 — BATTLE SPAWNING (docs/01 §6.7, docs/04) — LIVE (MVP subset).
 *
 * 1. Expired PILLAGE/OCCUPY choices are defaulted (NPC → OCCUPY, everyone else →
 *    PILLAGE; monsters/SYSTEM never get a choice — they don't capture land).
 * 2. Hostile co-location → BattleInstance (FIELD) resolved SAME TICK, AUTO mode,
 *    via the docs/04 §5 WarScore math simplified for the demo:
 *      strength = Σ classBase[unitClass] × count × (morale/100), terrain stub 1.0,
 *      + officer term capped at HERO_IMPACT_MAX (invariant 4).
 *    Winner = higher score; DEFENDER wins ties. Casualties proportional to the
 *    score gap; losing armies are wiped out (DISBANDED) — MVP simplification.
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
  // 1 — expire pending post-victory choices.
  if (state.pendingChoices !== undefined) {
    for (const battleId of sortedIds(state.pendingChoices)) {
      const choice = state.pendingChoices.get(battleId)!;
      if (tick < choice.expiresTick) continue;
      const kind = state.governorKinds?.get(choice.governorId);
      applyPostVictory(state, battleId, kind === 'NPC_KINGDOM' ? 'OCCUPY' : 'PILLAGE', tick, balance);
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
  const atk = sideScore(state, attackers, balance);
  const def = sideScore(state, defenders, balance);
  const terrainMod = 1.0; // stub — biome designations land later (locked decision 2)
  const attackerScore = (atk.army + atk.hero) * terrainMod;
  const defenderScore = (def.army + def.hero) * terrainMod;
  if (attackerScore === 0 && defenderScore === 0) return; // nothing to fight with

  const warScore: WarScore = {
    attacker: attackerScore,
    defender: defenderScore,
    breakdown: {
      attackerArmy: atk.army,
      attackerHero: atk.hero,
      defenderArmy: def.army,
      defenderHero: def.hero,
      terrain: terrainMod,
    },
  };
  const winner: 'ATTACKER' | 'DEFENDER' = attackerScore > defenderScore ? 'ATTACKER' : 'DEFENDER';
  const [winSide, loseSide, winScore, loseScore] =
    winner === 'ATTACKER'
      ? [attackers, defenders, attackerScore, defenderScore]
      : [defenders, attackers, defenderScore, attackerScore];

  // Casualties proportional to the score gap (demo curve, deterministic).
  const gap = (winScore - loseScore) / winScore; // (0..1]
  const loserFrac = Math.min(0.9, 0.35 + 0.55 * gap);
  const winnerFrac = Math.max(0.05, 0.25 * (1 - gap));
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
  applyCasualties(winSide, winnerFrac);
  applyCasualties(loseSide, loserFrac);

  const territory = territoryAt(state, hexId);
  // Losing armies leave the map: casualties fell per the gap curve above, the
  // remainder scatters (DISBANDED) — retreat pathing is post-MVP (docs/03).
  for (const a of loseSide) {
    a.state = 'DISBANDED';
    if (territory?.garrisonArmyId === a.id) delete territory.garrisonArmyId;
    if (state.monsterNames?.has(a.id) === true) state.monsterNames.delete(a.id);
  }
  for (const a of winSide) {
    a.morale = Math.min(CONSTANTS.MORALE_MAX, a.morale + balance.morale.victoryDelta);
    // Winners that wiped a stack down to zero men disband too (mutual destruction).
    if (a.units.every((s) => s.count === 0)) {
      a.state = 'DISBANDED';
      if (territory?.garrisonArmyId === a.id) delete territory.garrisonArmyId;
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

  // Post-victory (docs/02 §9): only a surviving ATTACKER on someone else's
  // territory triggers PILLAGE|OCCUPY. Monsters/SYSTEM never capture land.
  if (winner === 'DEFENDER' || territory === undefined) {
    if (battle.result !== undefined && territory !== undefined) battle.result.territoryOutcome = 'HELD';
    return;
  }
  const winnerGov = winSide[0]!.ownerGovernorId; // single-owner side by construction… except mixed attackers:
  // with multiple foreign owners the strongest contributor claims the victory (deterministic).
  const attackerOwners = [...new Set(winSide.map((a) => a.ownerGovernorId))];
  const claimingGov = attackerOwners.length === 1
    ? winnerGov
    : attackerOwners
        .map((g) => ({
          g,
          s: winSide.filter((a) => a.ownerGovernorId === g).reduce((n, a) => n + armyStrength(a, balance), 0),
        }))
        .sort((x, y) => y.s - x.s || (x.g < y.g ? -1 : 1))[0]!.g;
  if (claimingGov === territory.governorId) {
    battle.result!.territoryOutcome = 'HELD';
    return;
  }
  const kind = state.governorKinds?.get(claimingGov);
  if (kind === 'SYSTEM' || kind === undefined) {
    // Wild monsters (or unregistered governors) hold the field but never capture.
    battle.result!.territoryOutcome = 'HELD';
    return;
  }
  if (kind === 'NPC_KINGDOM') {
    // NPCs decide instantly: default OCCUPY (brief item 2).
    queueChoice(state, battle, claimingGov, territory.id, tick, 0);
    applyPostVictory(state, battle.id, 'OCCUPY', tick, balance);
    return;
  }
  // Player: expose the pending choice; defaults to PILLAGE on timeout.
  queueChoice(state, battle, claimingGov, territory.id, tick, options.choiceTimeoutTicks);
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
    battleId: battle.id,
    governorId,
    territoryId,
    createdTick: tick,
    expiresTick: tick + timeoutTicks,
  });
}

/**
 * Resolve a pending post-victory choice (server order API calls this on the
 * winner's behalf; the BATTLE SPAWNING phase calls it on timeout with the default).
 *
 * PILLAGE — winner's CT balance gains loot (treasury share + per-pop scavenge);
 *   territory takes the canon PILLAGE_INFRA_LOSS / PILLAGE_POP_LOSS hits.
 * OCCUPY — governor switches; PLAYER governors must assign a free officer as
 *   overseer within MAX_OVERSEEN_TERRITORIES (docs/01 §11.3) or the occupation
 *   CONVERTS TO PILLAGE.
 */
export function resolvePostVictory(
  state: WorldState,
  battleId: string,
  action: PostVictoryAction,
  balance: Balance = loadBalance(),
): void {
  if (state.pendingChoices?.has(battleId) !== true) {
    throw new Error(`no pending post-victory choice for battle ${battleId}`);
  }
  applyPostVictory(state, battleId, action, state.world.tick, balance);
}

function applyPostVictory(
  state: WorldState,
  battleId: string,
  action: PostVictoryAction,
  tick: number,
  balance: Balance,
): void {
  const choice = state.pendingChoices?.get(battleId);
  const battle = state.battles.get(battleId);
  if (choice === undefined || battle?.result === undefined) {
    throw new Error(`applyPostVictory: no pending choice/battle ${battleId}`);
  }
  const territory = state.territories.get(choice.territoryId);
  if (territory === undefined) throw new Error(`applyPostVictory: territory ${choice.territoryId} gone`);
  state.pendingChoices!.delete(battleId);

  const gov = choice.governorId;
  const kind = state.governorKinds?.get(gov) ?? 'PLAYER';
  state.ctBalances ??= new Map();

  if (action === 'OCCUPY' && kind === 'PLAYER') {
    // Officer oversight gate (docs/01 §11.3, CONSTANTS.MAX_OVERSEEN_TERRITORIES).
    const overseen = countOverseen(state, gov);
    const free = freeOfficer(state, gov);
    if (overseen >= CONSTANTS.MAX_OVERSEEN_TERRITORIES || free === undefined) {
      action = 'PILLAGE'; // occupation converts to pillage — no overseer available
    }
  }

  if (action === 'PILLAGE') {
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
    battle.result.postVictoryAction = 'PILLAGE';
    battle.result.territoryOutcome = 'PILLAGED';
    battle.result.lootCt = lootTreasury + lootScavenge;
  } else {
    // OCCUPY
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
    if (kind === 'PLAYER') {
      const officer = freeOfficer(state, gov)!; // gated above
      officer.assignedTerritoryId = territory.id;
      territory.overseerId = officer.id;
    }
    territory.morale = Math.max(
      CONSTANTS.MORALE_MIN,
      territory.morale - balance.morale.occupiedCivilMoraleLoss,
    );
    territory.lastTroddenTick = tick;
    // Winner's first surviving army on the hex garrisons the new holding.
    delete territory.garrisonArmyId;
    for (const id of sortedIds(state.armies)) {
      const a = state.armies.get(id)!;
      if (a.state !== 'DISBANDED' && a.ownerGovernorId === gov && territory.hexIds.includes(a.hexId)) {
        territory.garrisonArmyId = a.id;
        break;
      }
    }
    battle.result.postVictoryAction = 'OCCUPY';
    battle.result.territoryOutcome = 'OCCUPIED';
    battle.result.lootCt = seized;
  }
  territory.version += 1;
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
 * TODO(06): governor/military/diplomacy/economy AI. This hook only collects
 *   orders into the command queue — it must never mutate sim state directly.
 */
function phaseAiHook(_state: WorldState, _tick: number, _rng: Rng, _balance: Balance): void {
  // Stub — ai package plugs in here.
}
