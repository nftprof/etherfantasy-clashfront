/**
 * HERO-vs-HERO card-duel server integration (docs/briefs/HERO-DUEL-SPEC.md, decision 14).
 *
 * Drives game.ts's duel surface directly (deterministic; the real-time WS round
 * loop + pick-window timers live in server.ts and are exercised by hand here via
 * the shared resolver):
 *   - buildDuelChallenge validates (self-duel rejected, unknown target rejected)
 *     and returns two element-free DuelSides + a deterministic seed;
 *   - a resolved duel is recorded: the LOSER Master gets a koUntil, a
 *     duel_resolved event is queued for BOTH governors, and the review ring
 *     (recentDuelsFor) carries it fog-gated with a per-viewer `mine`;
 *   - the ring survives a snapshot round-trip.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONSTANTS } from '@clashfront/shared';
import { type DemoWorldFile, resolveDuel } from '@clashfront/sim-engine';
import { ApiError, Game, type GameConfig, parseMasterNames } from '../src/index';

const CT = CONSTANTS.CT_UNITS_PER_CT;

function repoDataPath(file: string): string {
  const candidates = [
    join(__dirname, '..', '..', '..', '..', 'data', file),
    join(__dirname, '..', '..', '..', 'data', file),
  ];
  const found = candidates.find((p) => existsSync(p));
  assert.ok(found, `${file} missing from data/`);
  return found;
}

const WORLD_FILE = JSON.parse(readFileSync(repoDataPath('demo-world.json'), 'utf8')) as DemoWorldFile;
const MASTER_NAMES = parseMasterNames(readFileSync(repoDataPath('CHARACTER_ROSTER.csv'), 'utf8'));

function gameConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    worldFile: WORLD_FILE,
    seed: 'duel-test',
    tickOptions: { travelTicksPerStep: 1, choiceTimeoutTicks: 50 },
    npcEveryTicks: 0,
    startCtUnits: 50_000 * CT,
    npcCtUnits: 20_000 * CT,
    masterNames: MASTER_NAMES,
    ...overrides,
  };
}

/** Resolve a full duel from a built challenge (auto/NPC picks) and record it. */
function fight(game: Game, challenger: string, targetGov: string): { winner: 'A' | 'D'; built: ReturnType<Game['buildDuelChallenge']> } {
  const built = game.buildDuelChallenge(challenger, { targetGovernorId: targetGov });
  const res = resolveDuel(built.A, built.D, built.seed, {}, {}, game.duelConfig());
  game.recordDuelResult({
    duelId: built.duelId,
    seed: built.seed,
    challengerGovernorId: challenger,
    targetGovernorId: built.targetGovernorId,
    A: built.A,
    D: built.D,
    winner: res.winner,
    rounds: res.rounds,
    parcelId: built.parcelId,
    wasLive: false,
    nowMs: 1_700_000_000_000,
  });
  return { winner: res.winner, built };
}

test('buildDuelChallenge — rejects self-duel and an unknown target', () => {
  const game = new Game(gameConfig());
  const p1 = game.join('Alpha').governorId;
  assert.throws(() => game.buildDuelChallenge(p1, { targetGovernorId: p1 }), (e) => e instanceof ApiError && e.code === 'SELF_DUEL');
  assert.throws(() => game.buildDuelChallenge(p1, {}), (e) => e instanceof ApiError && e.code === 'NO_TARGET');
});

test('a resolved duel: KOs the loser, queues duel_resolved for both, and enters the review ring', () => {
  const game = new Game(gameConfig());
  const p1 = game.join('Challenger').governorId;
  const p2 = game.join('Defender').governorId;

  const { winner, built } = fight(game, p1, p2);

  // Loser Master carries a koUntil (enforcement is post-MVP, but it's recorded).
  const loserRef = winner === 'A' ? built.D.ref : built.A.ref;
  const loserGov = winner === 'A' ? p2 : p1;
  const loserOfficer = game.state.officers?.get(loserGov)?.find((o) => o.id === loserRef);
  assert.ok(loserOfficer !== undefined, 'loser is a real officer');
  assert.ok(typeof loserOfficer.koUntil === 'string' && loserOfficer.koUntil.length > 0, 'loser KO recorded');

  // The winner Master is NOT KO'd.
  const winnerRef = winner === 'A' ? built.A.ref : built.D.ref;
  const winnerGov = winner === 'A' ? p1 : p2;
  const winnerOfficer = game.state.officers?.get(winnerGov)?.find((o) => o.id === winnerRef);
  assert.ok(winnerOfficer !== undefined && (winnerOfficer.koUntil === undefined || winnerOfficer.koUntil === null), 'winner not KO');

  // Both governors see the duel_resolved event; a bystander does not.
  const bystander = game.join('Nosy').governorId;
  const tick = game.tick();
  const evP1 = game.eventsFor(p1, tick.events).find((e) => e.type === 'duel_resolved');
  const evP2 = game.eventsFor(p2, tick.events).find((e) => e.type === 'duel_resolved');
  const evBy = game.eventsFor(bystander, tick.events).find((e) => e.type === 'duel_resolved');
  assert.ok(evP1 !== undefined && evP2 !== undefined, 'both duellists get the event');
  assert.equal(evBy, undefined, 'a bystander with no intel does not');

  // Review ring: visible to participants with mine flags, absent for the bystander.
  const mineP1 = game.recentDuelsFor(p1);
  assert.equal(mineP1.length, 1);
  assert.equal(mineP1[0]!.mine, true);
  assert.equal(mineP1[0]!.duelId, built.duelId);
  assert.equal(mineP1[0]!.rounds.length >= 2, true);
  assert.equal(game.recentDuelsFor(bystander).length, 0, 'fog-gated from a bystander');
});

test('deterministic — a rebuilt+resolved duel with the same nonce reproduces the rounds', () => {
  const g1 = new Game(gameConfig());
  const a1 = g1.join('A').governorId;
  const b1 = g1.join('B').governorId;
  const built1 = g1.buildDuelChallenge(a1, { targetGovernorId: b1 });
  const r1 = resolveDuel(built1.A, built1.D, built1.seed, {}, {}, g1.duelConfig());

  const g2 = new Game(gameConfig());
  const a2 = g2.join('A').governorId;
  const b2 = g2.join('B').governorId;
  const built2 = g2.buildDuelChallenge(a2, { targetGovernorId: b2 });
  const r2 = resolveDuel(built2.A, built2.D, built2.seed, {}, {}, g2.duelConfig());

  assert.equal(built1.seed, built2.seed, 'same governors + tick + nonce ⇒ same seed');
  assert.deepEqual(r1.rounds, r2.rounds);
  assert.equal(r1.winner, r2.winner);
});

test('the review ring survives a snapshot round-trip', () => {
  const savePath = join(mkdtempSync(join(tmpdir(), 'cf-duel-save-')), 'save.json');
  const cfg = gameConfig({ seed: 'duel-save', savePath });
  const game = new Game(cfg);
  const p1 = game.join('Keep').governorId;
  const p2 = game.join('Foe').governorId;
  const { built } = fight(game, p1, p2);
  assert.equal(game.recentDuelsFor(p1).length, 1);
  game.saveToDisk();

  const game2 = new Game(cfg);
  const ring2 = game2.recentDuelsFor(p1);
  assert.ok(ring2.some((d) => d.duelId === built.duelId), 'recent duel restored from the snapshot');
});
