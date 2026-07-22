/**
 * Weather Phase 1 (WEATHER-CONTINENT-PLAN §Phase 1 + COORD-007): the battle
 * weather field in the allocate context + /api/world meta. Deterministic per
 * (world.seed, zone, day) — the renderer's deterministic-floor cutover input.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
    seed: 'weather-test',
    tickOptions: { travelTicksPerStep: 1, choiceTimeoutTicks: 50 },
    npcEveryTicks: 0,
    startCtUnits: 2000 * CT,
    npcCtUnits: 20_000 * CT,
    masterNames: [],
    ...overrides,
  };
}

test('battleWeather is deterministic per (seed, day) and carries the contract fields', () => {
  const g1 = new Game(gameConfig());
  const g2 = new Game(gameConfig());
  const w1 = g1.battleWeather();
  const w2 = g2.battleWeather();
  assert.deepEqual(w1, w2, 'same seed + tick ⇒ same weather');
  assert.ok(typeof w1.state === 'string' && w1.state.length > 0);
  assert.ok(w1.visibility > 0 && w1.visibility <= 1);
  assert.equal(typeof w1.continentId, 'string');
  assert.equal(w1.overrideActive, false);
});

test('engineAllocateContext includes the locked weather field (COORD-007)', () => {
  const game = new Game(gameConfig());
  const { governorId } = game.join('WxTester');
  const hexId = [...game.state.hexes.keys()][0]!;
  const atkArmy = {
    id: 'army_TEST00000000000000000002',
    ownerGovernorId: governorId,
    state: 'MARCHING',
    hexId,
    units: [{ unitClass: 'INFANTRY', count: 50 }],
    provisions: { food: 10, gold: 0, wood: 0 },
  } as unknown as Army;
  game.state.armies.set(atkArmy.id, atkArmy);
  const battleId = 'battle_TEST0000000000000000002';
  const battle: EngineBattleState = {
    id: battleId,
    seed: 'fedcba9876543210',
    hexId,
    attackerArmyIds: [atkArmy.id],
    defenderArmyIds: [],
    attackerGovernorId: governorId,
    defenderGovernorId: 'sys_wild',
    startedTick: 0,
    status: 'ALLOCATING',
  };
  game.state.engineBattles ??= new Map();
  game.state.engineBattles.set(battleId, battle);

  const ctx = game.engineAllocateContext(battleId, 'http://cb/internal/battle-result') as {
    weather?: { state: string; visibility: number; continentId: string; overrideActive: boolean };
  };
  assert.ok(ctx.weather !== undefined, 'allocate context carries weather');
  assert.deepEqual(ctx.weather, game.battleWeather(), 'same deterministic value as battleWeather()');
});

test('/api/world meta carries todays weather', () => {
  const game = new Game(gameConfig());
  const world = game.worldGeometry() as unknown as { meta: { weather?: { state: string } } };
  assert.ok(world.meta.weather !== undefined, 'meta.weather present');
  assert.ok(typeof world.meta.weather.state === 'string');
});
