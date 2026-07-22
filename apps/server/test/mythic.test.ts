/**
 * Wave 4.4 — mythic reinforcement, server seams (MOBA-V3-BUILD-SPEC §5 +
 * COORD-009): the allocate context carries mythicSpawn/mythicSpawns, the
 * result callback accepts mythicKos, settlement inscribes the World
 * Chronicle, and the whole registry survives a save/load round-trip.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONSTANTS, type Army } from '@clashfront/shared';
import type { DemoWorldFile, EngineBattleState } from '@clashfront/sim-engine';
import { Game, type GameConfig } from '../src/index';

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

function gameConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    worldFile: WORLD_FILE,
    seed: 'mythic-test',
    tickOptions: { travelTicksPerStep: 1, choiceTimeoutTicks: 50 },
    npcEveryTicks: 0,
    startCtUnits: 2000 * CT,
    npcCtUnits: 20_000 * CT,
    masterNames: [],
    ...overrides,
  };
}

function pendingBattle(game: Game, governorId: string): EngineBattleState {
  const hexId = [...game.state.hexes.keys()][0]!;
  const army = {
    id: 'army_TEST00000000000000000009',
    ownerGovernorId: governorId,
    state: 'MARCHING',
    hexId,
    units: [{ unitClass: 'INFANTRY', count: 50 }],
    provisions: { food: 10, gold: 0, wood: 0 },
    morale: 70,
    supply: 100,
    version: 1,
  } as unknown as Army;
  game.state.armies.set(army.id, army);
  const battle: EngineBattleState = {
    id: 'battle_TEST0000000000000000009',
    seed: 'fedcba9876543210',
    hexId,
    attackerArmyIds: [army.id],
    defenderArmyIds: [],
    attackerGovernorId: governorId,
    defenderGovernorId: 'sys_wild',
    startedTick: 0,
    status: 'ALLOCATING',
  };
  game.state.engineBattles ??= new Map();
  game.state.engineBattles.set(battle.id, battle);
  return battle;
}

test('allocate context carries mythicSpawn (singular contract) + mythicSpawns (whale case)', () => {
  const game = new Game(gameConfig());
  const { governorId } = game.join('MythTester');
  const battle = pendingBattle(game, governorId);
  battle.mythicSpawns = [
    { governorId, species: 'Vernirox', side: 'ATTACKER' },
    { governorId, species: 'Mytier', side: 'ATTACKER' },
  ];
  const ctx = game.engineAllocateContext(battle.id, 'http://cb/internal/battle-result') as {
    mythicSpawn?: { species: string; side: string };
    mythicSpawns?: { species: string; side: string }[];
  };
  assert.deepEqual(ctx.mythicSpawn, { species: 'Vernirox', side: 'ATTACKER' });
  assert.deepEqual(ctx.mythicSpawns, [
    { species: 'Vernirox', side: 'ATTACKER' },
    { species: 'Mytier', side: 'ATTACKER' },
  ]);

  // No spawns ⇒ the fields are absent entirely (spec: flag only when triggered).
  const game2 = new Game(gameConfig({ seed: 'mythic-none' }));
  const { governorId: g2 } = game2.join('NoMyth');
  const b2 = pendingBattle(game2, g2);
  const ctx2 = game2.engineAllocateContext(b2.id, 'http://cb/internal/battle-result') as Record<string, unknown>;
  assert.ok(!('mythicSpawn' in ctx2) && !('mythicSpawns' in ctx2));
});

test('result callback mythicKos → settlement inscribes the World Chronicle (first-slayer emphasis)', () => {
  const game = new Game(gameConfig());
  const { governorId } = game.join('Chronicler');
  const battle = pendingBattle(game, governorId);
  const { applied } = game.applyEngineResult({
    battleId: battle.id,
    outcome: { winner: 'ATTACKER', reason: 'CORE_DESTROYED' },
    sides: { ATTACKER: { casualties: {} }, DEFENDER: { casualties: {} } },
    mythicKos: [{ species: 'Quadrossal', killerName: 'Irene', side: 'DEFENDER' }],
  });
  assert.equal(applied, true);
  game.tick(); // settlement applies the outcome + writes the Chronicle
  const feed = game.chronicleFeed();
  assert.equal(feed.entries.length, 1);
  assert.equal(feed.entries[0]!.kind, 'MYTHIC_KO');
  assert.equal(feed.entries[0]!.first, true);
  assert.match(feed.entries[0]!.text, /Irene felled the Mythic Quadrossal/);
  assert.equal(game.state.mythicFirstSlain!['Quadrossal'], 'Irene');
});

test('mythic registry + chronicle survive the save/load round-trip', () => {
  const savePath = join(mkdtempSync(join(tmpdir(), 'cf-mythic-')), 'save.json');
  const cfg = gameConfig({ seed: 'mythic-save', savePath });
  const game = new Game(cfg);
  const { governorId } = game.join('Saver');
  game.mythicGrant(governorId, 'Zedakazm');
  const battle = pendingBattle(game, governorId);
  game.applyEngineResult({
    battleId: battle.id,
    outcome: { winner: 'ATTACKER', reason: 'CORE_DESTROYED' },
    sides: { ATTACKER: { casualties: {} }, DEFENDER: { casualties: {} } },
    mythicKos: [{ species: 'Zedakazm', killerName: 'Saver' }],
  });
  game.tick();
  writeFileSync(savePath, JSON.stringify(game.serialize()));
  const restored = new Game(cfg);
  assert.deepEqual(
    [...restored.state.mythicNfts!.entries()],
    [...game.state.mythicNfts!.entries()],
    'NFT registry survives',
  );
  assert.deepEqual(
    [...restored.state.mythicCounters!.entries()],
    [...game.state.mythicCounters!.entries()],
    'cadence counters survive',
  );
  assert.deepEqual(restored.state.chronicle, game.state.chronicle, 'chronicle survives');
  assert.deepEqual(restored.state.mythicFirstSlain, game.state.mythicFirstSlain);
});
