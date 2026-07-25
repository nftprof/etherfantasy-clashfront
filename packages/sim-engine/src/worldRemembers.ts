/**
 * Wave 5.1 — THE WORLD REMEMBERS (decision 19, docs/briefs/WORLD-REMEMBERS-AND-
 * TOWNS.md §1). Great battles (casualties ≥ ⚙ chronicle.greatBattleCasualties)
 * christen themselves after WHERE they happened, archive forever in the public
 * World Chronicle, and leave a monument POI on the parcel (battlefield
 * graveyards later seed Phantom pets — the ecology's ghost stories).
 *
 * ONE hook: every settlement path (instant field / wild / engine) writes a
 * BattleInstance with `result.resolvedTick`, so at the end of BATTLE SPAWNING we
 * scan battles resolved THIS tick, sum their casualties, and record the great
 * ones once (state.chronicledBattles dedupes). Deterministic: name-variant pick
 * is a hash of the battle id — no RNG, replay-stable.
 */
import { type Balance } from '@clashfront/shared';
import { chronicleAppend } from './mythics';
import { sortedIds, type WorldState } from './state';
import { hash32 } from './weather';

/** A persistent battle scar on a parcel (decision 19 monument POI). */
export interface MonumentPoi {
  /** Deterministic id: `mon:<battleId>`. */
  id: string;
  battleId: string;
  /** The christened battle name ("The Battle of Azure Bay"). */
  battleName: string;
  tick: number;
  casualties: number;
  /** CAIRN (field graveyard) or MONUMENT (siege/great). */
  kind: 'CAIRN' | 'MONUMENT';
}

const NAME_TEMPLATES: Record<string, string[]> = {
  SIEGE: ['The Siege of {site}', 'The Storming of {site}'],
  DOMINION: ['The Battle of {site}', 'The Race for {site}'],
  CLASH: ['The Clash at {site}', 'The Battle of {site}'],
  DUEL: ['The Battle of {site}', 'The {site} Ford'],
  GUARD: ['The Culling at {site}', 'The Battle of {site}'],
  DEFAULT: ['The Battle of {site}'],
};

/** The site name for a hex — its territory's name, else a wilds label. */
function siteName(state: WorldState, hexId: string): string {
  const terrId = state.hexes.get(hexId)?.territoryId;
  const terr = terrId === undefined ? undefined : state.territories.get(terrId);
  return terr?.name ?? `the Wilds (${hexId.slice(-4)})`;
}

/** Christen a battle deterministically from its site + mode (hash of the id picks the variant). */
export function battleName(state: WorldState, hexId: string, mode: string | undefined, battleId: string): string {
  const templates = NAME_TEMPLATES[mode ?? 'DEFAULT'] ?? NAME_TEMPLATES['DEFAULT']!;
  const t = templates[hash32(`${battleId}:name`) % templates.length]!;
  return t.replace('{site}', siteName(state, hexId));
}

/**
 * Scan battles resolved THIS tick; archive + monument the great ones. Called at
 * the end of BATTLE SPAWNING (all settlement paths have run). Idempotent per
 * battle via state.chronicledBattles.
 */
export function recordGreatBattles(state: WorldState, tick: number, balance: Balance): void {
  const threshold = balance.chronicle.greatBattleCasualties;
  if (threshold <= 0) return;
  state.chronicledBattles ??= new Set();
  state.monuments ??= new Map();

  for (const id of sortedIds(state.battles)) {
    const b = state.battles.get(id)!;
    if (b.result?.resolvedTick !== tick) continue; // only freshly settled
    if (state.chronicledBattles.has(id)) continue; // already remembered
    state.chronicledBattles.add(id);

    const casualties = Object.values(b.result.casualties).reduce((n, c) => n + Math.max(0, c), 0);
    if (casualties < threshold) continue;

    const name = battleName(state, b.hexId, b.result.mode, id);
    const winnerLabel =
      b.result.winner === 'DRAW' ? 'ended in bloody stalemate' : `was won by the ${b.result.winner.toLowerCase()}`;
    chronicleAppend(state, {
      tick,
      kind: 'GREAT_BATTLE',
      text: `${name} — ${casualties} fell; it ${winnerLabel}.`,
      battleId: id,
    });

    // Monument POI on the parcel (capped per parcel — oldest scars fade first).
    const terrId = state.hexes.get(b.hexId)?.territoryId;
    if (terrId !== undefined) {
      const list = state.monuments.get(terrId) ?? [];
      list.push({
        id: `mon:${id}`,
        battleId: id,
        battleName: name,
        tick,
        casualties,
        kind: b.result.mode === 'SIEGE' ? 'MONUMENT' : 'CAIRN',
      });
      const cap = balance.chronicle.monumentCapPerParcel;
      while (list.length > cap) list.shift(); // fade the oldest scar
      state.monuments.set(terrId, list);
    }
  }
}
