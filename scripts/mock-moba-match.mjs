#!/usr/bin/env node
/**
 * mock-moba-match — reference implementation of the telemetry-relay contract
 * (docs/briefs/TELEMETRY-RELAY.md). Simulates what the REAL MOBA match server
 * will do: register a battle with the overworld bridge, stream square-arena
 * telemetry snapshots at 2–4 Hz, poll the command queue and make the AI
 * officer OBEY (move/focus/rally), then report a winner.
 *
 * Zero dependencies (node >= 18, global fetch).
 *
 * Usage:
 *   node scripts/mock-moba-match.mjs --server http://localhost:8080 --secret dev \
 *        [--parcel <parcelId>] [--duration 90] [--hz 3] [--governor <name>]
 *
 * Picks a random parcel from GET /api/world when --parcel is omitted.
 * --governor names an existing player as the commander (steering restricted
 * to them); omitted = exhibition with OPEN commands (any viewer steers).
 *
 * Scenario: attacker squads spawn in waves at the SOUTH edge and push north
 * against two defender towers + a core + garrison squads; the attacker Master
 * fights alongside and responds to polled commands within ~1.5 s.
 */

// ── args ─────────────────────────────────────────────────────────────────────
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1]?.startsWith('--') ? '1' : process.argv[++i];
}
const SERVER = (args.server ?? 'http://localhost:8080').replace(/\/$/, '');
const SECRET = args.secret ?? 'dev';
const DURATION_S = Number(args.duration ?? 90);
const HZ = Math.min(4, Math.max(1, Number(args.hz ?? 3)));
const SIZE = 240; // legacy square arena: MOBA coords ±120 (x east, z north)
const HALF = SIZE / 2;

const log = (...m) => console.log(`[mock-moba ${new Date().toISOString().slice(11, 19)}]`, ...m);

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(SERVER + path, {
    method,
    headers: {
      authorization: `Bearer ${SECRET}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => undefined);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json?.error ?? json)}`);
  return json;
}

// ── match state (all MOBA coordinates) ───────────────────────────────────────
let nextId = 1;
const unit = (kind, team, x, z, hp, extra = {}) => ({
  id: `${team}${kind[0]}${nextId++}`, kind, team, x, z, hp, maxHp: hp, ...extra,
});

const clamp = (v) => Math.max(-HALF + 2, Math.min(HALF - 2, v));
const units = [];
// Defender (B): two towers, a core, garrison squads — the "legacy map" side.
units.push(unit('tower', 'B', -45, 40, 900));
units.push(unit('tower', 'B', 45, 40, 900));
const core = unit('core', 'B', 0, 100, 1600);
units.push(core);
for (let i = 0; i < 8; i++) {
  units.push(unit('squad', 'B', -60 + (i % 4) * 40, 25 + Math.floor(i / 4) * 55, 120, { anchorX: -60 + (i % 4) * 40, anchorZ: 25 + Math.floor(i / 4) * 55, cls: i % 2 ? 'ARCHER' : 'INFANTRY' }));
}
// Attacker (A): the Master + waves from the south edge.
const master = unit('master', 'A', 0, -110, 520, { name: 'Cid the Relayed', cls: 'MASTER' });
units.push(master);
let runs = 2;               // Master revives left
let respawnAtMs = 0;
let waveStock = 24;         // squads still to spawn
const WAVE_STOCK_START = waveStock;
let score = { a: 0, b: 0 };
let moveTo = null;          // {x,z} from 'move' commands
let rally = null;           // {x,z} from 'rally' commands
let focusTgt = null;        // unit id from 'focus' commands
let lastSeq = 0;

function spawnWave(n) {
  for (let i = 0; i < n && waveStock > 0; i++) {
    waveStock--;
    units.push(unit('squad', 'A', clamp(-30 + Math.random() * 60), -112 + Math.random() * 4, 180, { cls: i % 3 === 1 ? 'ARCHER' : 'INFANTRY' }));
  }
}

const alive = () => units.filter((u) => u.hp > 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function nearestEnemy(u, range = Infinity) {
  let best = null, bd = range;
  for (const o of alive()) {
    if (o.team === u.team) continue;
    const d = dist(u, o);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

/** One 100 ms sim step: movement, combat, respawns. Toy physics — telemetry realism only. */
function step(dtMs) {
  const dt = dtMs / 1000;
  const focused = focusTgt ? alive().find((u) => u.id === focusTgt) : null;
  if (focusTgt && !focused) focusTgt = null;
  for (const u of alive()) {
    if (u.kind === 'tower' || u.kind === 'core') {
      const tgt = nearestEnemy(u, 34);
      if (tgt) tgt.hp -= (u.kind === 'core' ? 16 : 11) * dt;
      continue;
    }
    const speed = u.kind === 'master' ? 16 : 10; // m/s
    const range = u.cls === 'ARCHER' ? 16 : 5;
    // steering priority: focus (if reachable) > explicit move (master) > nearest enemy > rally > push north
    let tgt = focused && u.team === 'A' && dist(u, focused) < 70 ? focused : nearestEnemy(u, u.team === 'A' ? 45 : 28);
    let goal = tgt;
    if (u.kind === 'master' && moveTo) {
      goal = { x: moveTo.x, z: moveTo.z };
      if (dist(u, goal) < 4) moveTo = null;
      tgt = focused ?? nearestEnemy(u, range + 3); // still swings while repositioning
    } else if (u.team === 'A' && !tgt) {
      goal = rally ?? { x: 0, z: 100 }; // push toward the enemy core
    } else if (u.team === 'B' && !tgt) {
      goal = u.anchorX !== undefined ? { x: u.anchorX, z: u.anchorZ } : null;
    }
    if (goal && goal !== tgt) {
      const d = dist(u, goal);
      if (d > 2) { u.x = clamp(u.x + ((goal.x - u.x) / d) * speed * dt); u.z = clamp(u.z + ((goal.z - u.z) / d) * speed * dt); }
    } else if (tgt) {
      const d = dist(u, tgt);
      if (d > range) { u.x = clamp(u.x + ((tgt.x - u.x) / d) * speed * dt); u.z = clamp(u.z + ((tgt.z - u.z) / d) * speed * dt); }
    }
    if (tgt && dist(u, tgt) <= range + 1.5) {
      const dps = u.kind === 'master' ? 55 : 14;
      tgt.hp -= dps * dt;
      if (tgt.hp <= 0) (u.team === 'A' ? score.a += tgt.kind === 'tower' ? 25 : tgt.kind === 'core' ? 100 : 10 : score.b += 10);
    }
  }
  // deaths
  for (let i = units.length - 1; i >= 0; i--) {
    const u = units[i];
    if (u.hp > 0) continue;
    if (u.kind === 'master') {
      if (respawnAtMs === 0) { respawnAtMs = Date.now() + 5000; log(`Master down (${runs} runs left)`); }
      if (runs > 0 && Date.now() >= respawnAtMs) {
        runs--; respawnAtMs = 0; u.hp = u.maxHp; u.x = 0; u.z = -110;
        log('Master respawned at the south edge');
      }
      continue; // masters linger (dead) instead of being removed
    }
    if (u.kind === 'tower' || u.kind === 'core') { u.hp = 0; continue; } // rubble stays visible
    units.splice(i, 1);
  }
}

function snapshotBody(remainingMs, tick) {
  return {
    tick,
    clockMs: Math.max(0, Math.round(remainingMs)),
    units: alive().concat(units.filter((u) => (u.kind === 'tower' || u.kind === 'core') && u.hp <= 0)).map((u) => ({
      id: u.id, kind: u.kind, team: u.team,
      x: Math.round(u.x * 10) / 10, z: Math.round(u.z * 10) / 10,
      hp: Math.max(0, Math.round(u.hp)), maxHp: u.maxHp,
      ...(u.cls ? { cls: u.cls } : {}), ...(u.name ? { name: u.name } : {}),
    })),
    score: { a: Math.round(score.a), b: Math.round(score.b) },
    waves: { stock: waveStock, stockStart: WAVE_STOCK_START },
    runs,
    // the active arrival lane (south edge). Reinforcements would add more of these.
    spawns: [{ id: 'lane-south', team: 'A', x: 0, z: -116, label: 'south muster' }],
  };
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  let parcelId = args.parcel;
  if (!parcelId) {
    const world = await api('/api/world');
    const pick = world.parcels[Math.floor(Math.random() * world.parcels.length)];
    parcelId = pick.id;
    log(`no --parcel given — picked ${parcelId} at random`);
  }
  const start = await api('/bridge/battles/start', {
    method: 'POST',
    body: {
      matchId: `mock-${Date.now().toString(36)}`,
      parcelId,
      attacker: {
        armyLabel: '1st Relay Expedition',
        troops: 480,
        ...(args.governor ? { governorName: args.governor } : {}),
      },
      defender: { label: 'Garrison of the Square', troops: 350 },
      arena: { shape: 'square', size: SIZE },
      exhibition: true,
      // HERO MODE doorway demo: --join-url lights the viewer's ⚡ Take the field
      // button (the real MOBA server sends its client's match deep-link here).
      ...(args['join-url'] ? { joinUrl: args['join-url'] } : {}),
    },
  });
  const id = start.battleId;
  log(`battle registered: ${id} on parcel ${parcelId} (exhibition=${start.exhibition})`);

  const t0 = Date.now();
  const endAt = t0 + DURATION_S * 1000;
  let tick = 0;
  let lastSnapAt = 0;
  let lastPollAt = 0;
  let lastStep = Date.now();

  while (Date.now() < endAt && core.hp > 0) {
    const now = Date.now();
    tick++;
    step(now - lastStep);
    lastStep = now;

    if (now - lastSnapAt >= 1000 / HZ) {
      lastSnapAt = now;
      await api(`/bridge/battles/${id}/snapshot`, { method: 'POST', body: snapshotBody(endAt - now, tick) });
    }
    if (now - lastPollAt >= 1500) {
      lastPollAt = now;
      const res = await api(`/bridge/battles/${id}/commands?afterSeq=${lastSeq}`);
      for (const c of res.commands) {
        lastSeq = Math.max(lastSeq, c.seq);
        if (c.kind === 'move') { moveTo = { x: c.x, z: c.z }; log(`⇒ command #${c.seq} MOVE master to (${c.x}, ${c.z})`); }
        if (c.kind === 'rally') { rally = { x: c.x, z: c.z }; log(`⇒ command #${c.seq} RALLY waves to (${c.x}, ${c.z})`); }
        if (c.kind === 'focus') { focusTgt = c.targetId; log(`⇒ command #${c.seq} FOCUS ${c.targetId}`); }
      }
    }
    if (tick % 50 === 1) spawnWave(4); // a wave every ~5 s
    await new Promise((r) => setTimeout(r, 100));
  }

  // final frame + verdict
  await api(`/bridge/battles/${id}/snapshot`, { method: 'POST', body: snapshotBody(Math.max(0, endAt - Date.now()), ++tick) });
  const winner = core.hp <= 0 ? 'A' : score.a > score.b ? 'A' : score.b > score.a ? 'B' : 'DRAW';
  const summary = core.hp <= 0
    ? 'core destroyed — the expedition takes the field'
    : `clock expired ${Math.round(score.a)}–${Math.round(score.b)}`;
  await api(`/bridge/battles/${id}/end`, { method: 'POST', body: { winner, summary } });
  log(`battle ended: winner=${winner} (${summary})`);
}

main().catch((e) => { console.error('[mock-moba] fatal:', e.message ?? e); process.exit(1); });
