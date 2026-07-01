/**
 * Seeded deterministic RNG — AGENTS.md prime directive 6: NO Math.random()/Date.now()
 * inside simulation code. The world tick draws all randomness from an injected Rng.
 *
 * Implementation: xmur3 string hash → mulberry32 stream. `fork(streamName)` derives an
 * independent stream keyed by `(baseSeed, streamName)` — forks depend only on the seed
 * path, never on how many draws the parent has made. This matches docs/01 §6:
 * "RNG draws from PRNG(world.seed, tick, entityId)" — e.g.
 * `worldRng.fork(`t${tick}`).fork(entityId)`.
 */
export interface Rng {
  /** The seed path identifying this stream (stable across runs). */
  readonly seed: string;
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max) — max exclusive. */
  int(min: number, max: number): number;
  /** Pick a uniformly random element (throws on empty array). */
  pick<T>(items: readonly T[]): T;
  /** Derive an independent, order-insensitive child stream. */
  fork(streamName: string): Rng;
}

/** xmur3: string → 32-bit seed generator. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32: 32-bit state → uniform [0,1) stream. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Create a deterministic RNG from a string seed. Same seed ⇒ same stream, always. */
export function createRng(seed: string): Rng {
  const seedGen = xmur3(seed);
  const next32 = mulberry32(seedGen());
  return {
    seed,
    next(): number {
      return next32();
    },
    int(min: number, max: number): number {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max <= min) {
        throw new RangeError(`invalid int range [${min}, ${max})`);
      }
      return min + Math.floor(next32() * (max - min));
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError('pick() on empty array');
      return items[Math.floor(next32() * items.length)] as T;
    },
    fork(streamName: string): Rng {
      return createRng(`${seed}/${streamName}`);
    },
  };
}
