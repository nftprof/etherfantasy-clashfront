/**
 * Boot entry — `pnpm --filter @clashfront/server start` (or root `pnpm dev:server`).
 *
 * Env (all optional):
 *   PORT                   HTTP+WS port                       (default 8080)
 *   WORLD_SEED             deterministic world seed           (default 'mvp-july7')
 *   TICK_MS                wall-clock ms per world tick       (default 5000 — demo pacing)
 *   TRAVEL_TICKS_PER_STEP  ticks per parcel step              (default 12 ≈ 1 min/step at 5 s ticks)
 *   CHOICE_TIMEOUT_TICKS   ticks before PILLAGE default       (default 24 ≈ 2 min at 5 s ticks)
 *   NPC_EVERY_TICKS        NPC kingdom acts every N ticks     (default 60 ≈ 5 min; 0 disables)
 *   LIVE_WILD              1 = live wild battles (docs/04 §7b), 0 = instant resolve (default 1)
 *   SAVE_MS                snapshot interval ms               (default 30000)
 *   START_CT               player starting wallet in CT       (default 2000 ≈ 3 STANDARD armies)
 *   NPC_CT                 NPC war chest in CT                (default 20000)
 *   WORLD_FILE             demo world json                    (default <repo>/data/demo-world.json)
 *   SAVE_PATH              snapshot path                      (default <repo>/data/save.json)
 *   ROSTER_FILE            character roster csv               (default <repo>/data/CHARACTER_ROSTER.csv)
 *   BRIDGE_SECRET          shared secret for /bridge/* telemetry relay (unset = bridge disabled)
 *
 * External M1 battle engine (docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md; all unset = feature OFF,
 * battles resolve exactly as today):
 *   BATTLE_ENGINE_URL      allocate endpoint, e.g. http://127.0.0.1:8140/internal/v1/matches/allocate
 *   CF_BATTLE_API_TOKEN    bearer for the allocate direction
 *   CF_BATTLE_HMAC_SECRET  HMAC secret verifying X-CF-Signature result callbacks
 *   PUBLIC_BASE_URL        optional callback base (default http://127.0.0.1:<PORT>)
 *   CF_LIVE_BATTLES        mode:"live" (hero-joinable) allocation for player battles —
 *                          default ON when the engine is wired; 0 forces accelerated-only
 *
 * Pentagon Games identity (docs/briefs/PG-IDENTITY.md; unset = dev name-only login):
 *   PG_APP_KEY             PUBLISHABLE app key (pk_…) sent as X-PG-App-Key — setting it
 *                          turns the client join overlay into the Pentagon sign-in form
 *   PG_API_URL             PG identity API base (default https://login.pentagon.games)
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { CONSTANTS } from '@clashfront/shared';
import type { DemoWorldFile } from '@clashfront/sim-engine';
import { Game } from './game';
import { FALLBACK_MASTER_NAMES, parseMasterNames } from './roster';
import { ClashServer } from './server';

function findRepoRoot(from: string): string {
  let dir = from;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return from;
}

function envInt(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`env ${name} must be a number, got '${raw}'`);
  return Math.trunc(n);
}

async function main(): Promise<void> {
  const repoRoot = findRepoRoot(__dirname);
  const worldPath = process.env['WORLD_FILE'] ?? join(repoRoot, 'data', 'demo-world.json');
  const savePath = process.env['SAVE_PATH'] ?? join(repoRoot, 'data', 'save.json');
  const rosterPath = process.env['ROSTER_FILE'] ?? join(repoRoot, 'data', 'CHARACTER_ROSTER.csv');
  const seed = process.env['WORLD_SEED'] ?? 'mvp-july7';
  const tickMs = envInt('TICK_MS', 5000);
  const port = envInt('PORT', 8080);
  const CT = CONSTANTS.CT_UNITS_PER_CT;

  const worldFile = JSON.parse(readFileSync(worldPath, 'utf8')) as DemoWorldFile;
  const masterNames = existsSync(rosterPath)
    ? parseMasterNames(readFileSync(rosterPath, 'utf8'))
    : [...FALLBACK_MASTER_NAMES];

  // External M1 battle engine — feature ON only when BATTLE_ENGINE_URL is set.
  const battleEngineUrl = process.env['BATTLE_ENGINE_URL'];
  const engineOn = battleEngineUrl !== undefined && battleEngineUrl !== '';
  const publicBaseUrl = process.env['PUBLIC_BASE_URL'];

  const game = new Game({
    worldFile,
    seed,
    tickOptions: {
      travelTicksPerStep: envInt('TRAVEL_TICKS_PER_STEP', 12),
      choiceTimeoutTicks: envInt('CHOICE_TIMEOUT_TICKS', 24),
      liveWildBattles: envInt('LIVE_WILD', 1) !== 0,
      engineBattles: engineOn,
    },
    npcEveryTicks: envInt('NPC_EVERY_TICKS', 60),
    startCtUnits: envInt('START_CT', 2000) * CT,
    npcCtUnits: envInt('NPC_CT', 20_000) * CT,
    masterNames,
    savePath: resolve(savePath),
  });

  const bridgeSecret = process.env['BRIDGE_SECRET'];
  // Pentagon Games identity — PG login is ON only when the (publishable) app key is set.
  const pgAppKey = process.env['PG_APP_KEY'];
  const pgApiUrl = process.env['PG_API_URL'];
  const server = new ClashServer({
    game,
    port,
    tickMs,
    saveMs: envInt('SAVE_MS', 30_000),
    ...(bridgeSecret !== undefined && bridgeSecret !== '' ? { bridgeSecret } : {}),
    ...(pgAppKey !== undefined && pgAppKey !== '' ? { pgAppKey } : {}),
    ...(pgApiUrl !== undefined && pgApiUrl !== '' ? { pgApiUrl } : {}),
    ...(engineOn
      ? {
          battleEngine: {
            url: battleEngineUrl,
            token: process.env['CF_BATTLE_API_TOKEN'] ?? '',
            hmacSecret: process.env['CF_BATTLE_HMAC_SECRET'] ?? '',
            // Live is the norm once the engine is wired; CF_LIVE_BATTLES=0 forces accelerated-only.
            liveBattles: !['0', 'false'].includes((process.env['CF_LIVE_BATTLES'] ?? '').toLowerCase()),
            ...(publicBaseUrl !== undefined && publicBaseUrl !== ''
              ? { callbackUrl: `${publicBaseUrl.replace(/\/+$/, '')}/internal/battle-result` }
              : {}),
          },
        }
      : {}),
  });
  const boundPort = await server.start();

  console.log(
    `[server] Clash Front MVP up on http://localhost:${boundPort} — world '${seed}' at tick ${game.state.world.tick}, ` +
      `${game.state.territories.size} parcels, ${game.sessions.size} sessions, tick every ${tickMs} ms`,
  );
  if (engineOn) {
    console.log(`[server] battle engine ON — allocating field battles at ${battleEngineUrl}`);
  }
  if (pgAppKey !== undefined && pgAppKey !== '') {
    console.log(`[server] Pentagon Games identity ON — verifying tokens at ${pgApiUrl ?? 'https://login.pentagon.games'}`);
  }

  let stopping = false;
  const shutdown = (sig: string): void => {
    if (stopping) return;
    stopping = true;
    console.log(`[server] ${sig} — snapshotting and shutting down`);
    server
      .stop()
      .then(() => process.exit(0))
      .catch((e: unknown) => {
        console.error('[server] shutdown error:', e);
        process.exit(1);
      });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((e: unknown) => {
  console.error('[server] fatal:', e);
  process.exit(1);
});
