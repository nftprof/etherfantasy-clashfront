/**
 * Wave 4.4 — mythic reinforcement, CF side (docs/briefs/MOBA-V3-BUILD-SPEC §5
 * + COORD-009). The DIVISION OF LABOR is locked: CF decides WHO spawns WHAT
 * (NFT ownership + the deterministic 10-battle cadence) and ships the decision
 * in the allocate context; the MOBA renders + runs the mythic (stats, AI,
 * banners, boss-drop). The result callback reports mythic KOs back and CF
 * inscribes them in the World Chronicle (the World-Remembers seed, decision 19).
 *
 * Cadence (owner ruling, §5a): 1 GUARANTEED spawn per ⚙ spawnEveryBattles
 * battles the owner participates in — deterministic, NOT random, planable.
 * Each owned mythic NFT carries its own independent counter. A fresh grant
 * starts READY (⚙ startReady) — the first battle after minting is the
 * memorable one. Counters tick on ENGINE battles only (the ones a mythic can
 * actually appear in); accelerated/instant resolves don't consume the slot.
 *
 * Determinism: ownership + counters are plain sim state (snapshot-safe);
 * the spawn roll is pure counter arithmetic over sorted species — no RNG.
 */
import type { Balance } from '@clashfront/shared';
import type { EngineBattleState } from './engineBattle';
import type { WorldState } from './state';

/** One mythic entering a battle — shipped verbatim in the allocate context. */
export interface MythicSpawn {
  governorId: string;
  /** Species name from the 3D-ready pool (MOBA-V3-BUILD-SPEC §5f). */
  species: string;
  side: 'ATTACKER' | 'DEFENDER';
}

/** A mythic KO reported by the result callback (EngineOutcome.mythicKos). */
export interface MythicKoReport {
  species: string;
  /** Display name of the player who landed the KO (engine-side identity). */
  killerName?: string;
  /** Which side the mythic fought FOR (its owner's side). */
  side?: 'ATTACKER' | 'DEFENDER';
}

/** One public World Chronicle line (decision 19 seed — append-only, permanent). */
export interface ChronicleEntry {
  tick: number;
  /** 'MYTHIC_KO' today; battles/deeds/monuments join in wave 5. */
  kind: string;
  text: string;
  battleId?: string;
  species?: string;
  /** First time EVER this species of mythic was slain (extra emphasis). */
  first?: boolean;
}

/** Grant a mythic-species NFT to a governor (ownership registry entry). */
export function grantMythicNft(
  state: WorldState,
  governorId: string,
  species: string,
  balance: Balance,
): void {
  state.mythicNfts ??= new Map();
  const owned = state.mythicNfts.get(governorId) ?? [];
  if (!owned.includes(species)) {
    state.mythicNfts.set(governorId, [...owned, species].sort());
  }
  state.mythicCounters ??= new Map();
  const counters = state.mythicCounters.get(governorId) ?? {};
  if (counters[species] === undefined) {
    counters[species] = balance.mythic.startReady ? balance.mythic.spawnEveryBattles : 0;
    state.mythicCounters.set(governorId, counters);
  }
}

/** Remove a mythic-species NFT (sold/transferred). Counter state goes with it. */
export function revokeMythicNft(state: WorldState, governorId: string, species: string): void {
  const owned = state.mythicNfts?.get(governorId);
  if (owned !== undefined) {
    const left = owned.filter((s) => s !== species);
    if (left.length > 0) state.mythicNfts!.set(governorId, left);
    else state.mythicNfts!.delete(governorId);
  }
  const counters = state.mythicCounters?.get(governorId);
  if (counters !== undefined) {
    delete counters[species];
    if (Object.keys(counters).length === 0) state.mythicCounters!.delete(governorId);
  }
}

/**
 * Advance every participant-owned mythic counter for this battle and attach
 * the triggered spawns to the record (battle.mythicSpawns → allocate context).
 * Called from createEngineBattle — pure counter arithmetic, sorted iteration.
 */
export function rollMythicSpawns(
  state: WorldState,
  battle: EngineBattleState,
  balance: Balance,
): void {
  if (state.mythicNfts === undefined || state.mythicNfts.size === 0) return;
  const spawns: MythicSpawn[] = [];
  const sides: [string, 'ATTACKER' | 'DEFENDER'][] = [
    [battle.attackerGovernorId, 'ATTACKER'],
    [battle.defenderGovernorId, 'DEFENDER'],
  ];
  for (const [governorId, side] of sides) {
    const owned = state.mythicNfts.get(governorId);
    if (owned === undefined) continue;
    state.mythicCounters ??= new Map();
    const counters = state.mythicCounters.get(governorId) ?? {};
    for (const species of [...owned].sort()) {
      const n = (counters[species] ?? 0) + 1;
      if (n >= balance.mythic.spawnEveryBattles) {
        counters[species] = 0; // slot consumed — next spawn 10 battles out
        spawns.push({ governorId, species, side });
      } else {
        counters[species] = n;
      }
    }
    state.mythicCounters.set(governorId, counters);
  }
  if (spawns.length > 0) battle.mythicSpawns = spawns;
}

/** Append one line to the public World Chronicle (append-only, snapshot-safe). */
export function chronicleAppend(state: WorldState, entry: ChronicleEntry): void {
  state.chronicle ??= [];
  state.chronicle.push(entry);
}

/**
 * Inscribe a mythic KO reported by the result callback (§5e): permanent
 * Chronicle line; the FIRST slayer ever of a species gets the emphasis flag.
 */
export function recordMythicKo(
  state: WorldState,
  tick: number,
  battleId: string,
  battleLabel: string,
  ko: MythicKoReport,
): void {
  state.mythicFirstSlain ??= {};
  const first = state.mythicFirstSlain[ko.species] === undefined;
  const killer = ko.killerName ?? 'An unknown warrior';
  if (first) state.mythicFirstSlain[ko.species] = killer;
  chronicleAppend(state, {
    tick,
    kind: 'MYTHIC_KO',
    text: first
      ? `${killer} felled the Mythic ${ko.species} at ${battleLabel} — the FIRST ever to slay one.`
      : `${killer} felled the Mythic ${ko.species} at ${battleLabel}.`,
    battleId,
    species: ko.species,
    ...(first ? { first: true } : {}),
  });
}
