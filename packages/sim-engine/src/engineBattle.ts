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
import { newId, type Balance, type Rng } from '@clashfront/shared';
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
 *   QUEUED      COMMAND battle waiting for a free live-pool slot (docs/04 §3a);
 *               the hex stays locked; promoted to ALLOCATING(live) when the pool
 *               frees, or downgraded to ALLOCATING(accelerated) on queue timeout.
 *   ALLOCATING  ready for the server's allocate POST (mode already decided)
 *   ALLOCATED   match live on the engine, awaiting the HMAC result callback
 *   FALLBACK    allocate failed (network/5xx) — next tick resolves internally
 */
export type EngineBattleStatus = 'QUEUED' | 'ALLOCATING' | 'ALLOCATED' | 'FALLBACK';

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
  /**
   * COMMAND-mode gating (docs/04 §3a): governors who spent a command slot on this
   * battle (elected `MARCH & COMMAND` and held a free slot at the collision tick).
   * These IDs are what the per-player slot count and the QUEUE promotion key on.
   * Empty ⇒ a plain accelerated battle (nobody commands it).
   */
  commandGovernorIds?: string[];
  /** World tick this battle entered QUEUED (queue-timeout clock — docs/04 §3a). */
  queuedTick?: number;
  /** Live-mode join grants (server-boundary; PRIVATE per governor — see EngineBattleJoin). */
  joins?: EngineBattleJoin[];
  /** Set by the verified result callback; the next tick settles it. */
  outcome?: EngineOutcome;
}

/**
 * Concurrent LIVE engine matches globally (docs/04 §3a live-match POOL). Counts
 * battles the server is actively running at 30 Hz (mode 'live', allocate in
 * flight or awaiting the callback). QUEUED battles are NOT live yet — excluded.
 */
export function engineLivePoolCount(state: WorldState): number {
  let n = 0;
  for (const b of state.engineBattles?.values() ?? []) {
    if (b.mode === 'live' && (b.status === 'ALLOCATING' || b.status === 'ALLOCATED')) n++;
  }
  return n;
}

/**
 * COMMAND slots a governor is currently holding (docs/04 §3a per-player cap):
 * engine battles it spent a command slot on that are still live OR queued for a
 * live slot. A settled battle is deleted, so it stops counting automatically.
 */
export function engineCommandSlotCount(state: WorldState, governorId: string): number {
  let n = 0;
  for (const b of state.engineBattles?.values() ?? []) {
    if (b.commandGovernorIds?.includes(governorId) !== true) continue;
    if (b.status === 'QUEUED' || (b.mode === 'live' && (b.status === 'ALLOCATING' || b.status === 'ALLOCATED'))) n++;
  }
  return n;
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
 *
 * MODE SELECTION (docs/04 §3a, supersedes "≥1 player ⇒ live"): the battle goes
 * LIVE only when a participant carried COMMAND intent (`army.commandIntent`)
 * AND that governor holds a free command slot AND the global live pool has room.
 * If a command-opting governor has a slot but the pool is full ⇒ QUEUED (live
 * deferred). Otherwise (no command intent anywhere, or every opting governor is
 * at its slot cap, or live disabled) ⇒ ACCELERATED. The elected command intent
 * is CONSUMED here (cleared off the armies).
 */
export function createEngineBattle(
  state: WorldState,
  hexId: string,
  attackers: Army[],
  defenders: Army[],
  defenderGovernorId: string,
  tick: number,
  rng: Rng,
  balance: Balance,
  liveBattles: boolean,
): EngineBattleState {
  // Which participating governors elected COMMAND for this collision?
  const commandGovs = new Set<string>();
  for (const a of [...attackers, ...defenders]) {
    if (a.commandIntent === true) commandGovs.add(a.ownerGovernorId);
  }
  // Consume the intent (best-effort — a later march must opt in again).
  for (const a of [...attackers, ...defenders]) {
    if (a.commandIntent === true) {
      a.commandIntent = false;
      a.version += 1;
    }
  }

  let status: EngineBattleStatus = 'ALLOCATING';
  let mode: 'live' | 'accelerated' = 'accelerated';
  let holders: string[] = [];
  if (liveBattles && commandGovs.size > 0) {
    const slotCap = balance.battle.commandSlotsPerPlayer;
    // Only governors still under their slot cap can hold a command slot here.
    const eligible = [...commandGovs].filter((g) => engineCommandSlotCount(state, g) < slotCap).sort();
    if (eligible.length > 0) {
      holders = eligible;
      if (engineLivePoolCount(state) >= balance.battle.liveMatchPoolMax) {
        status = 'QUEUED'; // slot reserved, live start deferred until the pool frees
      } else {
        mode = 'live';
      }
    }
    // else: every opting governor is at its slot cap ⇒ downgrade to accelerated.
  }

  const battle: EngineBattleState = {
    id: newId('battle', { time: tick, random: () => rng.next() }),
    seed: engineSeed(rng),
    hexId,
    attackerArmyIds: attackers.map((a) => a.id),
    defenderArmyIds: defenders.map((d) => d.id),
    attackerGovernorId: attackers[0]!.ownerGovernorId,
    defenderGovernorId,
    startedTick: tick,
    status,
    ...(status === 'QUEUED' ? { queuedTick: tick } : { mode }),
    ...(holders.length > 0 ? { commandGovernorIds: holders } : {}),
  };
  state.engineBattles ??= new Map();
  state.engineBattles.set(battle.id, battle);
  return battle;
}

/**
 * Promote QUEUED command battles (docs/04 §3a) — run once per world tick from the
 * BATTLE SPAWNING phase AFTER settlements free live-pool slots. Deterministic:
 * queued battles are processed in sorted id order.
 *   - Timed out (waited ≥ commandQueueTimeoutTicks) or live disabled ⇒ downgrade
 *     to ALLOCATING(accelerated); the command slot is released.
 *   - Live pool has room ⇒ promote to ALLOCATING(live); the local pool tally
 *     rises so one tick never over-promotes past the cap.
 *   - Otherwise it keeps waiting.
 */
export function promoteQueuedEngineBattles(
  state: WorldState,
  tick: number,
  balance: Balance,
  liveBattles: boolean,
): void {
  if (state.engineBattles === undefined || state.engineBattles.size === 0) return;
  let livePool = engineLivePoolCount(state);
  const poolMax = balance.battle.liveMatchPoolMax;
  const timeout = balance.battle.commandQueueTimeoutTicks;
  for (const id of [...state.engineBattles.keys()].sort()) {
    const b = state.engineBattles.get(id)!;
    if (b.status !== 'QUEUED') continue;
    const waited = tick - (b.queuedTick ?? tick);
    if (!liveBattles || waited >= timeout) {
      // Fall back to accelerated resolution (still an engine match, headless).
      b.status = 'ALLOCATING';
      b.mode = 'accelerated';
      delete b.queuedTick;
      delete b.commandGovernorIds; // slot released — it auto-resolves now
    } else if (livePool < poolMax) {
      b.status = 'ALLOCATING';
      b.mode = 'live';
      delete b.queuedTick;
      livePool++;
    }
  }
}

/** True when `armyId` is committed to a pending engine battle (it cannot march/split). */
export function armyInEngineBattle(state: WorldState, armyId: string): EngineBattleState | undefined {
  for (const b of state.engineBattles?.values() ?? []) {
    if (b.attackerArmyIds.includes(armyId) || b.defenderArmyIds.includes(armyId)) return b;
  }
  return undefined;
}
