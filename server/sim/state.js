// Pure-data world model — ZERO Three.js / DOM. This is the heart of the
// sim/render decouple from SERVER_PLAN §2. Units are plain objects; the client
// renderer maps these to THREE.Groups on its side.
import { makeRng } from "./rng.js";
import { buildKit } from "./abilities.js";

let _uid = 1;
// deterministic element for AI bots (no champion pick) — varies by team/index
const BOT_ELEMENTS = ["Fire", "Water", "Combat", "Lightning", "Ice", "Earth"];
export const nextUid = () => _uid++;

export function mkUnit(o) {
  return {
    uid: o.uid ?? nextUid(),
    kind: o.kind || "minion",     // hero | minion | tower | core | pet
    team: o.team ?? 0,            // 0 blue, 1 red, 2 wild
    slot: o.slot ?? 0,            // model id (client picks the .glb)
    x: o.x ?? 0, z: o.z ?? 0,
    hp: o.hp ?? 100, maxHp: o.maxHp ?? 100,
    dmg: o.dmg ?? 10, range: o.range ?? 6, atkSpd: o.atkSpd ?? 1,
    speed: o.speed ?? 26,         // units/sec
    state: "idle",                // idle | move | attack | dead
    dest: null,                   // {x,z} move target
    target: null,                 // uid of attack target
    atkCd: 0,                     // seconds until next attack
    owner: o.owner ?? null,       // connection/seat id for heroes
    cd: { flash: 0, potion: 0, recall: 0, q: 0, w: 0, e: 0, r: 0 },
    gold: o.gold ?? 0,
    level: o.level ?? 1,          // ability damage scales with level
    mp: 0, maxMp: 0,              // mana (heroes only; set in makeWorld)
    element: o.element ?? null,   // hero element → ability kit
    abs: null,                    // [Q,W,E,R] ability defs (heroes only)
    hasteT: 0,                    // attack-speed buff timer (s)
    slowT: 0,                     // movement slow timer (s)
    xp: 0,                        // experience toward next level
    respT: 0,                     // respawn countdown when dead (s)
    ackSeq: 0,                    // highest client input seq processed (reconciliation)
  };
}

export function makeWorld(seed, seats) {
  // seats: [{seatId, team, slot, name}]
  const world = {
    seed, tick: 0, t: 0,
    rng: makeRng(seed),
    units: new Map(),            // uid -> unit
    bySeat: new Map(),           // seatId -> heroUid
    bank: { 0: { gold: 0 }, 1: { gold: 0 } },
    winner: null,
    spawn: { 0: { x: -100, z: -100 }, 1: { x: 100, z: 100 } },
    waveT: 12,                   // seconds until the first minion wave
    waveN: 0,                    // waves spawned so far
  };
  // human heroes (one per seat)
  const teamCount = { 0: 0, 1: 0 };
  for (const s of seats) {
    const sp = world.spawn[s.team];
    const hero = mkUnit({
      kind: "hero", team: s.team, slot: s.slot, owner: s.seatId,
      x: sp.x, z: sp.z, hp: 1200, maxHp: 1200, dmg: 60, range: 8, speed: 30,
    });
    hero.name = s.name || "Player";
    hero.element = s.el || "Neutral";
    hero.maxMp = 260; hero.mp = 260;
    hero.abs = buildKit(hero.element, world);
    world.units.set(hero.uid, hero);
    world.bySeat.set(s.seatId, hero.uid);
    teamCount[s.team]++;
  }
  // AI BOT fill — balance the teams so co-op-vs-AI works and uneven matches get bots
  const target = Math.max(1, teamCount[0], teamCount[1]);
  for (const team of [0, 1]) {
    for (let i = teamCount[team]; i < target; i++) {
      const sp = world.spawn[team];
      const bot = mkUnit({
        kind: "hero", team, slot: 0, owner: null,
        x: sp.x, z: sp.z, hp: 1200, maxHp: 1200, dmg: 60, range: 8, speed: 30,
      });
      bot.bot = true; bot.name = "AI Bot " + (i + 1);
      bot.element = BOT_ELEMENTS[(team * 3 + i) % BOT_ELEMENTS.length];
      bot.maxMp = 260; bot.mp = 260;
      bot.abs = buildKit(bot.element, world);
      world.units.set(bot.uid, bot);
    }
  }
  // a destructible core per team — destroying the enemy core wins
  for (const team of [0, 1]) {
    const sp = world.spawn[team];
    const core = mkUnit({ kind: "core", team, x: sp.x, z: sp.z, hp: 5000, maxHp: 5000, dmg: 0, range: 0, speed: 0 });
    world.units.set(core.uid, core);
  }
  // defensive towers down the diagonal lane (2 per team)
  const towers = { 0: [[-62, -62], [-28, -28]], 1: [[62, 62], [28, 28]] };
  for (const team of [0, 1]) for (const [x, z] of towers[team]) {
    const tw = mkUnit({ kind: "tower", team, x, z, hp: 1600, maxHp: 1600, dmg: 95, range: 24, atkSpd: 0.8, speed: 0 });
    world.units.set(tw.uid, tw);
  }
  // neutral jungle camps (team 2) — NPC monsters that aggro intruders, then leash home
  const camps = [[0, -55], [0, 55], [-55, 0], [55, 0], [0, 0]];
  for (const [x, z] of camps) {
    const w = mkUnit({ kind: "wild", team: 2, slot: "wild", x, z, hp: 650, maxHp: 650, dmg: 42, range: 7, atkSpd: 0.8, speed: 18 });
    w.home = { x, z };
    world.units.set(w.uid, w);
  }
  return world;
}

export const heroFor = (world, seatId) => world.units.get(world.bySeat.get(seatId));
export const alive = (u) => u && u.state !== "dead" && u.hp > 0;
export function dist(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
export function coreOf(world, team) { for (const u of world.units.values()) if (u.kind === "core" && u.team === team) return u; return null; }
// nearest live unit matching `ok(u)` within maxDist of `from`
export function nearest(world, from, maxDist, ok) {
  let best = null, bd = maxDist;
  for (const o of world.units.values()) {
    if (o.uid === from.uid || !alive(o) || !ok(o)) continue;
    const d = dist(from, o); if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// grant XP to a hero; level up at level*100 XP (mirrors client giveXP), with modest stat growth
export function giveXp(h, n) {
  if (!h || h.kind !== "hero") return;
  h.xp += n;
  while (h.xp >= h.level * 100) {
    h.xp -= h.level * 100; h.level++;
    h.maxHp += 60; h.hp += 60; h.dmg += 3; // progression (ability damage also scales via level)
  }
}

// single place that resolves a kill: marks dead, awards gold+XP to a hero killer, sets respawn
// (heroes) or win (core). Called by both combat auto-attacks and ability damage.
export function killUnit(world, src, tgt) {
  tgt.hp = 0; tgt.state = "dead"; tgt.target = null; tgt.dest = null;
  if (tgt.kind === "core") { world.winner = src ? src.team : (tgt.team === 0 ? 1 : 0); return; }
  if (src && src.kind === "hero") {
    const xp = tgt.kind === "hero" ? 120 : tgt.kind === "tower" ? 90 : tgt.kind === "wild" ? 40 : 20;
    src.gold += tgt.kind === "hero" ? 150 : tgt.kind === "tower" ? 100 : 50;
    giveXp(src, xp);
  }
  if (tgt.kind === "hero") tgt.respT = 6 + tgt.level * 2 + Math.min(10, world.t / 90); // lengthens as game ages
}
