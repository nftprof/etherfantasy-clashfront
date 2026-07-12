/**
 * HERO-vs-HERO HP-duel resolver tests (docs/briefs/HERO-DUEL-SPEC.md, decision 14; v2).
 *
 * Covers: determinism/replay-safety, HP depletion to a KO, RATING dominates
 * (strong Master wins ~70-90% over many seeds), an even match ~coin-flip,
 * artifacts lift the underdog, stances swing exchanges, human picks override the
 * NPC, and element-free stats.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadBalance } from '@clashfront/shared';
import { resolveDuel, resolveFlee, duelStats, type DuelSide } from '../src/index';

const cfg = loadBalance().duel;

const strong = (over: Partial<DuelSide> = {}): DuelSide => ({ ref: 'm_strong', name: 'Veteran', rating: 900, ...over });
const weak = (over: Partial<DuelSide> = {}): DuelSide => ({ ref: 'm_weak', name: 'Rookie', rating: 300, ...over });
const even = (ref: string): DuelSide => ({ ref, name: ref, rating: 500 });

function winRate(A: DuelSide, D: DuelSide, n = 400, pa = {}, pd = {}): number {
  let a = 0;
  for (let i = 0; i < n; i++) if (resolveDuel(A, D, `s${i}`, pa, pd, cfg).winner === 'A') a++;
  return a / n;
}

test('deterministic — same inputs+seed ⇒ identical fight (replay-safe)', () => {
  const r1 = resolveDuel(strong(), weak(), 'battle_42', {}, {}, cfg);
  const r2 = resolveDuel(strong(), weak(), 'battle_42', {}, {}, cfg);
  assert.deepEqual(r1, r2);
});

test('HP fight — depletes HP, ends on a KO, a clear winner stands', () => {
  for (let i = 0; i < 50; i++) {
    const res = resolveDuel(strong(), weak(), `hp_${i}`, {}, {}, cfg);
    assert.ok(res.exchanges.length >= 1 && res.exchanges.length <= cfg.maxExchanges);
    const last = res.exchanges[res.exchanges.length - 1]!;
    // Winner is the one still standing (or higher HP% on the clock).
    if (res.ending === 'KO') assert.ok(last.hpA <= 0 || last.hpD <= 0, 'a KO leaves someone at 0');
    assert.ok(res.winner === 'A' || res.winner === 'D');
  }
});

test('stats — a stronger rating yields higher ATK and HP', () => {
  const s = duelStats(900, cfg);
  const w = duelStats(300, cfg);
  assert.ok(s.atk > w.atk && s.maxHp > w.maxHp);
});

test('rating dominates — a clear favourite wins ~70-90%', () => {
  const wr = winRate(strong(), weak());
  assert.ok(wr >= 0.68 && wr <= 0.95, `strong win-rate ${wr}`);
});

test('even match is ~coin-flip', () => {
  const wr = winRate(even('a'), even('b'));
  assert.ok(wr >= 0.4 && wr <= 0.6, `even win-rate ${wr}`);
});

test('artifact lifts the underdog', () => {
  const bare = winRate(weak(), strong());
  const armed = winRate(weak({ artifactId: 'art_dawnbreaker', artifactName: 'Dawnbreaker' }), strong());
  assert.ok(armed > bare, `armed ${armed} should beat bare ${bare}`);
});

test('artifact can flare as a SPELL — surfaced with a label', () => {
  let spells = 0;
  for (let i = 0; i < 200; i++) {
    const res = resolveDuel(strong({ artifactId: 'art_aegis', artifactName: 'Aegis of Empyrea' }), weak(), `p${i}`, {}, {}, cfg);
    for (const ex of res.exchanges) for (const b of ex.blows) if (b.spell) { spells++; assert.equal(b.spell.label, 'Aegis of Empyrea'); }
  }
  assert.ok(spells > 0, 'expected at least one artifact spell flare across seeds');
});

test('human stance picks override the NPC for that exchange', () => {
  const res = resolveDuel(even('a'), even('b'), 'pick_seed', { 1: 'AGGRESSIVE', 2: 'DEFENSIVE' }, {}, cfg);
  assert.equal(res.exchanges[0]!.cA, 'AGGRESSIVE');
  if (res.exchanges.length >= 2) assert.equal(res.exchanges[1]!.cA, 'DEFENSIVE');
});

test('flee — a faster/stronger Master escapes more often than a weaker one', () => {
  let s = 0;
  let w = 0;
  for (let i = 0; i < 300; i++) {
    if (resolveFlee(900, 400, `f${i}`, cfg)) s++;
    if (resolveFlee(300, 900, `f${i}`, cfg)) w++;
  }
  assert.ok(s > w, `strong escapes ${s} > weak ${w}`);
});

test('element-free — no element field influences the fight', () => {
  const wr = winRate({ ref: 'fire', name: 'Fire', rating: 500 }, { ref: 'water', name: 'Water', rating: 500 });
  assert.ok(wr >= 0.4 && wr <= 0.6, `no type advantage: ${wr}`);
});
