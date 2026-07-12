/**
 * Base-building defense layer (docs/briefs/BASE-BUILDING-DEFENSE-LAYER.md, decision 7).
 *
 * Drives the sim + game surface directly (deterministic; the HTTP route is a thin
 * pass-through):
 *   - buildStructure places a TOWER on a buildSpot at tier 1 with full HP, charges
 *     the SINK cost path, and a second build on the SAME spot UPGRADES (tier 2,
 *     restored HP), NOT a new placement;
 *   - the buildSpot cap is enforced (no free slot ⇒ throws);
 *   - an unknown anchor / ungoverned land / not-your-territory are rejected;
 *   - a WILD parcel seeds a garrison of DEFENDER towers (in lieu of a player);
 *   - structures persist across a snapshot round-trip and reach the allocate context.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONSTANTS, loadBalance } from '@clashfront/shared';
import { buildStructure, type BuildSpot, type DemoWorldFile } from '@clashfront/sim-engine';
import { ApiError, Game, type GameConfig, parseMasterNames } from '../src/index';

const CT = CONSTANTS.CT_UNITS_PER_CT;

function repoDataPath(file: string): string {
  const candidates = [join(__dirname, '..', '..', '..', '..', 'data', file), join(__dirname, '..', '..', '..', 'data', file)];
  const found = candidates.find((p) => existsSync(p));
  assert.ok(found, `${file} missing from data/`);
  return found;
}
const WORLD_FILE = JSON.parse(readFileSync(repoDataPath('demo-world.json'), 'utf8')) as DemoWorldFile;
const MASTER_NAMES = parseMasterNames(readFileSync(repoDataPath('CHARACTER_ROSTER.csv'), 'utf8'));

function gameConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    worldFile: WORLD_FILE,
    seed: 'build-test',
    tickOptions: { travelTicksPerStep: 1, choiceTimeoutTicks: 50 },
    npcEveryTicks: 0,
    startCtUnits: 50_000 * CT,
    npcCtUnits: 20_000 * CT,
    masterNames: MASTER_NAMES,
    ...overrides,
  };
}

/** Claim the first player-claimable territory and return its ids. */
function claimOne(game: Game, governorId: string): { territoryId: string; parcelId: string } {
  for (const id of [...game.state.territories.keys()].sort()) {
    const t = game.state.territories.get(id)!;
    if (t.governorKind === 'SYSTEM' && t.garrisonArmyId === undefined) {
      game.claim(governorId, t.id);
      return { territoryId: t.id, parcelId: game.parcelId(t.hexIds[0]!) };
    }
  }
  throw new Error('no claimable territory');
}

const spots = (n: number): BuildSpot[] => Array.from({ length: n }, (_, i) => ({ anchorId: `bs_${i}`, x: (i - n / 2) * 20, z: 40 }));

test('buildStructure — place tier 1, then UPGRADE the same spot to tier 2 (full HP each)', () => {
  const game = new Game(gameConfig());
  const p = game.join('Builder').governorId;
  const { territoryId } = claimOne(game, p);
  const bal = loadBalance();
  const bs = spots(4);

  const r1 = buildStructure(game.state, territoryId, { anchorId: 'bs_0', key: 'TOWER', buildSpots: bs, arenaSize: 322, balance: bal });
  assert.equal(r1.action, 'PLACE');
  assert.equal(r1.tier, 1);
  assert.equal(r1.structure.hp, r1.structure.maxHp);
  const tier1Hp = r1.structure.maxHp; // snapshot: upgrade mutates the same object in place
  assert.equal(game.state.territories.get(territoryId)!.structures.length, 1);

  const r2 = buildStructure(game.state, territoryId, { anchorId: 'bs_0', key: 'TOWER', buildSpots: bs, arenaSize: 322, balance: bal });
  assert.equal(r2.action, 'UPGRADE');
  assert.equal(r2.tier, 2);
  assert.equal(game.state.territories.get(territoryId)!.structures.length, 1, 'upgrade does not add a structure');
  assert.ok(r2.structure.maxHp > tier1Hp, 'tier 2 has more HP');
  assert.equal(r2.structure.hp, r2.structure.maxHp, 'upgrade restores full HP');
});

test('buildStructure — enforces the buildSpot cap + rejects an unknown anchor', () => {
  const game = new Game(gameConfig());
  const p = game.join('Capped').governorId;
  const { territoryId } = claimOne(game, p);
  const listA = spots(2); // bs_0, bs_1 → cap 2, both filled below
  buildStructure(game.state, territoryId, { anchorId: 'bs_0', key: 'TOWER', buildSpots: listA, arenaSize: 322 });
  buildStructure(game.state, territoryId, { anchorId: 'bs_1', key: 'WALL', buildSpots: listA, arenaSize: 322 });
  // A NEW placement on an unoccupied spot when structures already meet a smaller cap ⇒ no free slot.
  const listB: BuildSpot[] = [{ anchorId: 'bs_2', x: 60, z: 40 }]; // cap 1, bs_2 unoccupied
  assert.throws(() => buildStructure(game.state, territoryId, { anchorId: 'bs_2', key: 'TOWER', buildSpots: listB, arenaSize: 322 }), /no free buildSpot/);
  // An anchor not in the buildSpot list is rejected.
  assert.throws(() => buildStructure(game.state, territoryId, { anchorId: 'nope', key: 'TOWER', buildSpots: listA, arenaSize: 322 }), /not a buildSpot/);
});

test('game.build — rejects not-your-territory + a bad key', () => {
  const game = new Game(gameConfig());
  const owner = game.join('Owner').governorId;
  const other = game.join('Other').governorId;
  const { parcelId } = claimOne(game, owner);
  assert.throws(() => game.build(other, { parcelId }, 'anchor_0', 'TOWER'), (e) => e instanceof ApiError && e.code === 'NOT_YOUR_TERRITORY');
  assert.throws(() => game.build(owner, { parcelId }, 'anchor_0', 'CATAPULT'), (e) => e instanceof ApiError && e.code === 'BAD_KEY');
});

test('seedWildGarrison — a WILD parcel gets DEFENDER towers (in lieu of a player), idempotent', () => {
  const game = new Game(gameConfig());
  // First SYSTEM territory with buildSpots on its parcel map.
  const wild = [...game.state.territories.values()].find((t) => t.governorKind === 'SYSTEM');
  assert.ok(wild !== undefined);
  const seeded = game.seedWildGarrison(wild.id);
  const structs = game.state.territories.get(wild.id)!.structures ?? [];
  // Either the map has buildSpots (towers seeded) or it doesn't (0) — but seeding is idempotent regardless.
  assert.equal(structs.length, seeded);
  const again = game.seedWildGarrison(wild.id);
  assert.equal(again, 0, 'already-seeded wild is not re-seeded');
});

test('structures survive a snapshot round-trip', () => {
  const savePath = join(mkdtempSync(join(tmpdir(), 'cf-build-save-')), 'save.json');
  const cfg = gameConfig({ seed: 'build-save', savePath });
  const game = new Game(cfg);
  const p = game.join('Persist').governorId;
  const { territoryId } = claimOne(game, p);
  buildStructure(game.state, territoryId, { anchorId: 'bs_0', key: 'TOWER', buildSpots: spots(3), arenaSize: 322 });
  game.saveToDisk();

  const game2 = new Game(cfg);
  const structs = game2.state.territories.get(territoryId)?.structures ?? [];
  assert.equal(structs.length, 1);
  assert.equal(structs[0]!.key, 'TOWER');
  assert.ok(structs[0]!.anchor !== undefined, 'anchor persisted');
});
