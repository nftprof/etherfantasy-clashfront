/**
 * ULID-style, type-prefixed id helpers — docs/08-data-models.md §1.
 *
 * Format: `<prefix>_<26-char ULID>` — 10 chars Crockford-base32 timestamp (48-bit ms)
 * + 16 chars randomness (80 bits). Lexicographically sortable by creation time.
 *
 * Determinism (AGENTS.md prime directive 6): inside simulation code NEVER call
 * `newId(prefix)` bare (it falls back to wall clock + crypto randomness). Instead pass
 * `{ time, random }` derived from the injected tick and seeded RNG so world generation
 * and replays are bit-for-bit reproducible.
 */
import { randomBytes } from 'node:crypto';

/** Crockford base32 alphabet (no I, L, O, U). */
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LEN = 10; // 48-bit timestamp
const RANDOM_LEN = 16; // 80-bit randomness
const MAX_TIME = 2 ** 48 - 1;

/**
 * Known id prefixes. docs/08 §1 canonizes player/hero/terr/army/battle/nft/hex;
 * the remaining entities of 08 §4 (World, Region, Lease, LedgerEntry, SupplyTrain,
 * DiplomacyRelation, Contract) and NPC-kingdom governors get analogous prefixes here.
 */
export type IdPrefix =
  | 'player'
  | 'hero'
  | 'terr'
  | 'army'
  | 'battle'
  | 'nft'
  | 'hex'
  | 'world'
  | 'region'
  | 'lease'
  | 'ledger'
  | 'train'
  | 'rel'
  | 'contract'
  | 'npc'
  | 'guild';

export interface NewIdOptions {
  /** UTC epoch ms used for the sortable timestamp component. Sim code MUST supply this (derive from tick). */
  time?: number;
  /** Uniform random source in [0, 1). Sim code MUST supply a seeded RNG's `next`. */
  random?: () => number;
}

function defaultRandom(): number {
  // 32 bits of CSPRNG entropy mapped to [0, 1). NOT for use inside sim logic.
  return randomBytes(4).readUInt32BE(0) / 2 ** 32;
}

function encodeTime(time: number): string {
  if (!Number.isInteger(time) || time < 0 || time > MAX_TIME) {
    throw new RangeError(`ULID time out of range: ${time}`);
  }
  let out = '';
  let t = time;
  for (let i = 0; i < TIME_LEN; i++) {
    out = ENCODING[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}

function encodeRandom(random: () => number): string {
  let out = '';
  for (let i = 0; i < RANDOM_LEN; i++) {
    const r = random();
    if (!(r >= 0 && r < 1)) throw new RangeError(`random() must return [0,1), got ${r}`);
    out += ENCODING[Math.floor(r * 32)];
  }
  return out;
}

/** Generate a bare 26-char ULID string (no prefix). */
export function ulid(opts: NewIdOptions = {}): string {
  const time = opts.time ?? Date.now();
  const random = opts.random ?? defaultRandom;
  return encodeTime(time) + encodeRandom(random);
}

/** Generate a type-prefixed ULID id, e.g. `newId('terr')` → `terr_01H…`. */
export function newId(prefix: IdPrefix, opts: NewIdOptions = {}): string {
  return `${prefix}_${ulid(opts)}`;
}

const ID_RE = /^[a-z]+_[0-9A-HJKMNP-TV-Z]{26}$/;

/** True iff `id` is a well-formed prefixed ULID; optionally checks a specific prefix. */
export function isId(id: string, prefix?: IdPrefix): boolean {
  if (!ID_RE.test(id)) return false;
  return prefix === undefined || id.startsWith(`${prefix}_`);
}

/** Extract the prefix of a well-formed id (throws on malformed input). */
export function idPrefix(id: string): string {
  if (!ID_RE.test(id)) throw new Error(`malformed id: ${id}`);
  return id.slice(0, id.indexOf('_'));
}
