// Server-authoritative AI + NPC behaviour. Like the other systems this only sets
// each unit's `target` / `dest`; the combat + movement systems do the actual moving
// and damage. Deterministic (no Math.random — uses positions only), so it stays
// golden-master friendly.
import { alive, dist, coreOf, nearest, mkUnit } from "../state.js";

const isEnemy = (u, o) => o.team !== u.team && o.team !== 2;          // ignore neutrals
const VISION_BOT = 46;   // a bot hero notices enemies within this range
const AGGRO_MINION = 16; // a minion peels onto enemies this close
const LEASH_WILD = 26;   // jungle camp chases this far from home, then resets

// spawn a minion wave for each team, marching toward the enemy core
function spawnWaves(world, dt) {
  world.waveT -= dt;
  if (world.waveT > 0) return;
  world.waveT += 30;            // a wave every 30s
  world.waveN++;
  for (const team of [0, 1]) {
    const sp = world.spawn[team];
    for (let i = 0; i < 3; i++) {
      const ox = team === 0 ? 6 * i : -6 * i;
      const m = mkUnit({
        kind: "minion", team, slot: "minion",
        x: sp.x + ox, z: sp.z + ox,
        hp: 220, maxHp: 220, dmg: 22, range: 6, atkSpd: 1, speed: 22,
      });
      world.units.set(m.uid, m);
    }
  }
}

export function aiSystem(world, dt) {
  spawnWaves(world, dt);

  for (const u of world.units.values()) {
    if (!alive(u)) continue;

    // keep a valid target; drop dead / friendly / neutral-mismatch ones
    if (u.target) {
      const t = world.units.get(u.target);
      if (!alive(t) || t.team === u.team) u.target = null;
    }

    if (u.kind === "tower") {
      // stationary: only ever shoots an enemy standing in range; re-pick each tick
      const t = nearest(world, u, u.range, (o) => isEnemy(u, o));
      u.target = t ? t.uid : null;
      continue;
    }

    if (u.kind === "minion") {
      const t = nearest(world, u, AGGRO_MINION, (o) => isEnemy(u, o));
      if (t) { u.target = t.uid; }
      else { u.target = null; const core = coreOf(world, u.team === 0 ? 1 : 0); if (core) u.dest = { x: core.x, z: core.z }; }
      continue;
    }

    if (u.kind === "wild") {
      const home = u.home || { x: u.x, z: u.z };
      if (u.target) {
        const t = world.units.get(u.target);
        if (!t || !alive(t) || dist(u, home) > LEASH_WILD) { u.target = null; u.dest = { x: home.x, z: home.z }; }
      } else {
        const t = nearest(world, u, u.range + 9, (o) => o.team !== 2); // anyone (player or minion) wandering in
        if (t && dist(u, home) <= LEASH_WILD) { u.target = t.uid; u.dest = null; }
        else if (dist(u, home) > 1) { u.dest = { x: home.x, z: home.z }; } // wander back to camp
      }
      continue;
    }

    if (u.kind === "hero" && u.bot) {
      // bot hero: fight the nearest enemy it can see, otherwise push the enemy core
      if (!u.target) {
        const t = nearest(world, u, VISION_BOT, (o) => isEnemy(u, o) && (o.kind === "hero" || o.kind === "minion" || o.kind === "tower" || o.kind === "core"));
        if (t) { u.target = t.uid; u.dest = null; }
        else { const core = coreOf(world, u.team === 0 ? 1 : 0); if (core) u.dest = { x: core.x, z: core.z }; }
      }
      continue;
    }
  }
}
