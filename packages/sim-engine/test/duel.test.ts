/**
 * HERO-vs-HERO card duel resolver tests (docs/briefs/HERO-DUEL-SPEC.md, decision 14).
 *
 * Covers: determinism/replay-safety, best-of-3 stopping, RATING dominates odds
 * (strong Master wins ~70-85% over many seeds), an even match is ~coin-flip,
 * artifacts lift the underdog, human picks override the NPC, and element-free
 * (no type wheel anywhere in the inputs).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadBalance } from '@clashfront/shared';
import { resolveDuel, resolveFlee, type DuelSide } from '../src/index';

const cfg = loadBalance().duel;

const strong = (over: Partial<DuelSide> = {}): DuelSide => ({ ref: 'm_strong', name: 'Veteran', rating: 900, ...over });
const weak = (over: Partial<DuelSide> = {}): DuelSide => ({ ref: 'm_weak', name: 'Rookie', rating: 300, ...over });
const even = (ref: string): DuelSide => ({ ref, name: ref, rating: 500 });

/** Win-rate for side A over a spread of deterministic seeds. */
function winRate(A: DuelSide, D: DuelSide, n = 400, pa = {}, pd = {}): number {
  let a = 0;
  for (let i = 0; i < n; i++) {
    if (resolveDuel(A, D, `s${i}`, pa, pd, cfg).winner === 'A') a++;
  }
  return a / n;
}

test('deterministic — same inputs+seed ⇒ identical result (replay-safe)', () => {
  const r1 = resolveDuel(strong(), weak(), 'battle_42', {}, {}, cfg);
  const r2 = resolveDuel(strong(), weak(), 'battle_42', {}, {}, cfg);
  assert.deepEqual(r1, r2);
});

test('best-of-3 — stops at 2 wins, 2..3 rounds, a clear winner', () => {
  for (let i = 0; i < 50; i++) {
    const res = resolveDuel(strong(), weak(), `bo3_${i}`, {}, {}, cfg);
    assert.ok(res.rounds.length >= 2 && res.rounds.length <= 3, `rounds ${res.rounds.length}`);
    const winsA = res.rounds.filter((r) => r.by === 'A').length;
    const winsD = res.rounds.filter((r) => r.by === 'D').length;
    assert.equal(Math.max(winsA, winsD), 2);
    assert.equal(res.winner, winsA > winsD ? 'A' : 'D');
  }
});

test('rating dominates — a clear favourite wins ~70-85%', () => {
  const wr = winRate(strong(), weak());
  assert.ok(wr >= 0.68 && wr <= 0.9, `strong win-rate ${wr}`);
});

test('even match is ~coin-flip (rating-symmetric)', () => {
  const wr = winRate(even('a'), even('b'));
  assert.ok(wr >= 0.4 && wr <= 0.6, `even win-rate ${wr}`);
});

test('artifact lifts the underdog toward a coin-flip', () => {
  const bare = winRate(weak(), strong());
  const armed = winRate(weak({ artifactId: 'art_dawnbreaker', artifactName: 'Dawnbreaker' }), strong());
  assert.ok(armed > bare, `armed ${armed} should beat bare ${bare}`);
});

test('artifact can proc — surfaced with a label in the war report', () => {
  // Over many seeds an equipped artifact should flare at least once (reason PROC).
  let procs = 0;
  for (let i = 0; i < 300; i++) {
    const res = resolveDuel(strong({ artifactId: 'art_aegis', artifactName: 'Aegis of Empyrea' }), weak(), `p${i}`, {}, {}, cfg);
    for (const rd of res.rounds) if (rd.reason === 'PROC') { procs++; assert.equal(rd.proc?.label, 'Aegis of Empyrea'); }
  }
  assert.ok(procs > 0, 'expected at least one artifact proc across seeds');
});

test('human picks override the NPC card for that round', () => {
  const res = resolveDuel(even('a'), even('b'), 'pick_seed', { 1: 'AGGRESSIVE', 2: 'DEFENSIVE' }, {}, cfg);
  assert.equal(res.rounds[0].cA, 'AGGRESSIVE');
  if (res.rounds.length >= 2) assert.equal(res.rounds[1].cA, 'DEFENSIVE');
});

test('a skilled human pick can beat the auto path (agency matters)', () => {
  // If auto loses a given seed, picking the counter to the opponent's known NPC
  // card should be able to flip at least some seeds — agency is real.
  let flippedByPlay = 0;
  for (let i = 0; i < 60; i++) {
    const seed = `agency_${i}`;
    const auto = resolveDuel(even('a'), even('b'), seed, {}, {}, cfg);
    if (auto.winner === 'A') continue;
    // Counter each round: play the card that beats D's actual card.
    const counter: Record<string, 'AGGRESSIVE' | 'TRICK' | 'DEFENSIVE'> = {
      AGGRESSIVE: 'DEFENSIVE', TRICK: 'AGGRESSIVE', DEFENSIVE: 'TRICK',
    };
    const picks: Record<number, 'AGGRESSIVE' | 'TRICK' | 'DEFENSIVE'> = {};
    for (const rd of auto.rounds) picks[rd.round] = counter[rd.cD];
    const played = resolveDuel(even('a'), even('b'), seed, picks, {}, cfg);
    if (played.winner === 'A') flippedByPlay++;
  }
  assert.ok(flippedByPlay > 0, 'skilled play should flip at least one otherwise-lost seed');
});

test('flee — a faster/stronger Master escapes more often than a weaker one', () => {
  let strongEsc = 0;
  let weakEsc = 0;
  for (let i = 0; i < 300; i++) {
    if (resolveFlee(900, 400, `f${i}`, cfg)) strongEsc++;
    if (resolveFlee(300, 900, `f${i}`, cfg)) weakEsc++;
  }
  assert.ok(strongEsc > weakEsc, `strong escapes ${strongEsc} > weak ${weakEsc}`);
});

test('element-free — DuelSide has no element field influencing odds', () => {
  // Same ratings, different (ignored) refs/names ⇒ identical share, symmetric odds.
  const wr = winRate({ ref: 'fire', name: 'Fire', rating: 500 }, { ref: 'water', name: 'Water', rating: 500 });
  assert.ok(wr >= 0.4 && wr <= 0.6, `no type advantage: ${wr}`);
});
