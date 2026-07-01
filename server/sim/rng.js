// Deterministic seeded PRNG (mulberry32). Per-match seed => reproducible sims,
// which is what makes the P0 golden-master test meaningful.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function rngInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }
