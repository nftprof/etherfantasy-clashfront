/**
 * Engine battles — the M1 external-battle-engine path
 * (docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md, docs/briefs/PVP-SERVER-REQUIREMENTS.md).
 *
 * When TickOptions.engineBattles is ON, battles that the sim would resolve via
 * the INSTANT WarScore path instead become PENDING ENGINE BATTLES: the tick
 * engine creates a deterministic battle record (id + engine seed from the
 * seeded RNG), LOCKS the hex exactly like a running wild battle, and the
 * SERVER layer allocates the match on the external MOBA engine
 * (POST /internal/v1/matches/allocate) between ticks.
 *
 * Determinism boundary (AGENTS.md prime directive 6): the engine's result
 * callback — like player orders and bridge-bound outcomes — is a SERVER
 * BOUNDARY INPUT, not sim randomness. The server writes `status`/`outcome`
 * onto the record between ticks; the next tick's BATTLE SPAWNING phase applies
 * it through the normal deterministic settlement paths. Same (state, seed,
 * inputs) ⇒ same world, where the callback payload is part of `inputs`.
 *
 * On allocate failure the server marks the record FALLBACK: the next tick
 * removes the lock and the standing armies resolve through the internal
 * instant path — an engine outage never bricks a battle.
 */
import { newId, type Rng } from '@clashfront/shared';
import type { Army } from '@clashfront/shared';
import type { WorldState } from './state';

/** Callback outcome winner — the schema's enum ('TIE' maps to the sim's 'DRAW'). */
export type EngineWinner = 'ATTACKER' | 'DEFENDER' | 'TIE';

/** Per-side callback report slice the overworld settles from. */
export interface EngineSideResult {
  /** Dead per UnitClass (schema `casualties` — the field the economy hard-depends on). */
  casualties: Record<string, number>;
  /** Provisions burned during the match (applied to the side's carried stock, capped). */
  provisionsConsumed?: { food?: number; gold?: number; wood?: number };
}

/**
 * The engine's result callback, validated + normalized by the server
 * (apps/server: POST /internal/battle-result) and applied next tick.
 */
export interface EngineOutcome {
  winner: EngineWinner;
  /** Schema reason enum (CORE_DESTROYED | WAVES_EXHAUSTED | MOBS_CLEARED | TOWERS_DESTROYED | FOOD_CLOCK | TIMEOUT). */
  reason: string;
  sides: { ATTACKER: EngineSideResult; DEFENDER: EngineSideResult };
  /** Structure damage per anchor (`anchor_<i>` = index into the territory's structures array). */
  structures?: { anchorId: string; hp: number; destroyed: boolean }[];
  matchId?: string;
}

/**
 * Allocation lifecycle — server-boundary field (like WildBattleState.paced):
 *   ALLOCATING  created by the tick engine, awaiting the server's allocate POST
 *   ALLOCATED   match live on the engine, awaiting the HMAC result callback
 *   FALLBACK    allocate failed (network/5xx) — next tick resolves internally
 */
export type EngineBattleStatus = 'ALLOCATING' | 'ALLOCATED' | 'FALLBACK';

/**
 * Per-governor hero-mode join grant returned by a `mode:"live"` allocate
 * (ALLOCATE-CALLBACK-SCHEMA §1b). PRIVATE to its governor: views expose
 * `joinUrl` ONLY to the owning governor's session — never to other viewers,
 * never in public/exhibition broadcasts.
 */
export interface EngineBattleJoin {
  governorId: string;
  /** HMAC join ticket (already baked into joinUrl; kept for reissue/debug). */
  ticket?: string;
  /** Hero-mode deep link (…/play?net=server&ws=…&match=…&ticket=…). */
  joinUrl: string;
}

/** A battle pending on the external engine. Plain JSON — snapshot-safe. */
export interface EngineBattleState {
  id: string; // battle_<ULID> — the allocate Idempotency-Key
  /** Engine sim seed (16 hex chars) — derived from the seeded RNG, never wall clock. */
  seed: string;
  hexId: string;
  attackerArmyIds: string[];
  defenderArmyIds: string[];
  attackerGovernorId: string;
  defenderGovernorId: string;
  startedTick: number;
  status: EngineBattleStatus;
  matchId?: string;
  /**
   * Allocate mode actually requested — server-boundary field (like `status`):
   * 'live' (30 Hz joinable match, player battles) | 'accelerated' (headless).
   * A live match runs in real time (up to ~40 min); the record simply stays
   * ALLOCATED until the result callback lands — there is NO tick-based
   * timeout, the engine's own TIMEOUT reason is the clock authority.
   */
  mode?: 'live' | 'accelerated';
  /** Live-mode join grants (server-boundary; PRIVATE per governor — see EngineBattleJoin). */
  joins?: EngineBattleJoin[];
  /** Set by the verified result callback; the next tick settles it. */
  outcome?: EngineOutcome;
}

/** 16-hex-char engine seed from the battle's RNG fork (schema: WE supply the seed). */
export function engineSeed(rng: Rng): string {
  let s = '';
  for (let i = 0; i < 16; i++) s += Math.floor(rng.next() * 16).toString(16);
  return s;
}

/**
 * Create a pending engine battle for a hostile co-location (called from the
 * BATTLE SPAWNING phase with the phase's per-hex RNG fork — fully deterministic).
 */
export function createEngineBattle(
  state: WorldState,
  hexId: string,
  attackers: Army[],
  defenders: Army[],
  defenderGovernorId: string,
  tick: number,
  rng: Rng,
): EngineBattleState {
  const battle: EngineBattleState = {
    id: newId('battle', { time: tick, random: () => rng.next() }),
    seed: engineSeed(rng),
    hexId,
    attackerArmyIds: attackers.map((a) => a.id),
    defenderArmyIds: defenders.map((d) => d.id),
    attackerGovernorId: attackers[0]!.ownerGovernorId,
    defenderGovernorId,
    startedTick: tick,
    status: 'ALLOCATING',
  };
  state.engineBattles ??= new Map();
  state.engineBattles.set(battle.id, battle);
  return battle;
}

/** True when `armyId` is committed to a pending engine battle (it cannot march/split). */
export function armyInEngineBattle(state: WorldState, armyId: string): EngineBattleState | undefined {
  for (const b of state.engineBattles?.values() ?? []) {
    if (b.attackerArmyIds.includes(armyId) || b.defenderArmyIds.includes(armyId)) return b;
  }
  return undefined;
}
