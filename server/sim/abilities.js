// Authoritative ability engine. Mirrors the element kits + archetype numbers from
// shared/ef_core.js (EF_CORE.KITS / ARCH / buildSuper), bound to PURE-DATA combat
// primitives instead of the client's visual ones. Same numbers → a champion plays
// identically on client and server.
//   ⚠ KEEP IN SYNC with shared/ef_core.js (KITS, ARCH cd/mp/dmg, buildSuper). If you
//     change ability numbers there, mirror them here (and vice-versa).
import { killUnit } from "./state.js";
const alive = (u) => u && u.state !== "dead" && u.hp > 0;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// element -> [Q,W,E] archetypes (R/super is chosen by element group below)
const KITS = {
  Fire:["nova","ring","dash"], Water:["nova","ring","dash"], Leaf:["line","ring","dash"],
  Lightning:["line","buff","blink"], Earth:["nova","ring","dash"], Ice:["line","ring","dash"],
  Combat:["ring","buff","dash"], Toxin:["nova","ring","dash"], Telepath:["nova","ring","blink"],
  Insect:["line","buff","dash"], Rock:["nova","ring","dash"], Phantom:["nova","ring","blink"],
  Dragon:["line","ring","dash"], Iron:["nova","buff","dash"], Flyer:["line","buff","dash"],
  Mystic:["nova","ring","blink"], Neutral:["nova","buff","dash"],
};
const DMG_T = new Set(["Fire","Lightning","Dragon","Insect","Neutral","Flyer"]);
const CTRL_T = new Set(["Water","Ice","Earth","Rock","Toxin"]);
const WAR_T  = new Set(["Combat","Iron","Leaf"]);

const MAP_MIN = -120, MAP_MAX = 120;
const clampMap = (v) => Math.max(MAP_MIN, Math.min(MAP_MAX, v));

// damage one unit; honors core tower-gating; awards gold + sets winner on a core kill
function hit(world, src, tgt, dmg) {
  if (!alive(tgt) || tgt.team === src.team) return;
  if (tgt.kind === "core") {
    for (const o of world.units.values()) if (o.kind === "tower" && o.team === tgt.team && alive(o)) return; // shielded
  }
  tgt.hp -= dmg;
  if (tgt.hp <= 0) killUnit(world, src, tgt); // gold/XP/respawn/win handled centrally
}

// pure-data combat primitives (P) — same call shape the archetypes expect
function makeP(world) {
  return {
    fxRing() {}, castAt(h, pt, col, cb) { if (cb) cb(); }, // visuals are client-side; no-op here
    aoe(src, pt, r, dmg, slow) {
      for (const u of world.units.values()) {
        if (u.team === src.team || !alive(u)) continue;
        if (dist({ x: pt.x, z: pt.z }, u) <= r) { hit(world, src, u, dmg); if (slow) u.slowT = Math.max(u.slowT || 0, slow); }
      }
    },
    lineShot(src, pt, len, dmg) {
      let dx = pt.x - src.x, dz = pt.z - src.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const W = 3.2;
      for (const u of world.units.values()) {
        if (u.team === src.team || !alive(u)) continue;
        const rx = u.x - src.x, rz = u.z - src.z, proj = rx * dx + rz * dz;
        if (proj < 0 || proj > len) continue;
        if (Math.abs(rx * dz - rz * dx) <= W) hit(world, src, u, dmg);
      }
    },
    dash(h, pt, range) {
      let dx = pt.x - h.x, dz = pt.z - h.z; const d = Math.hypot(dx, dz) || 1, m = Math.min(range, d);
      h.x = clampMap(h.x + dx / d * m); h.z = clampMap(h.z + dz / d * m); h.dest = null; // dash overrides current move
    },
  };
}

// archetype factories → ability {cd, mp, self?, f(h,pt)} (numbers mirror ef_core.js ARCH)
const ARCH = {
  nova: (P) => ({ cd: 6, mp: 35, f: (h, pt) => P.aoe(h, pt, 5.5, 75 + h.level * 14) }),
  line: (P) => ({ cd: 6, mp: 30, f: (h, pt) => P.lineShot(h, pt, 26, 65 + h.level * 11) }),
  ring: (P) => ({ cd: 10, mp: 40, self: 1, f: (h) => P.aoe(h, h, 8, 38 + h.level * 8, 2.5) }),
  buff: (P) => ({ cd: 14, mp: 40, self: 1, f: (h) => { h.hasteT = 5; } }),
  dash: (P) => ({ cd: 7, mp: 22, f: (h, pt) => P.dash(h, pt, 15) }),
  blink:(P) => ({ cd: 13, mp: 50, f: (h, pt) => P.dash(h, pt, 17) }),
};
function buildSuper(type, P) {
  if (DMG_T.has(type)) return { cd: 110, mp: 100, f: (h, pt) => P.aoe(h, pt, 12, 220 + h.level * 30) };
  if (CTRL_T.has(type)) return { cd: 110, mp: 100, self: 1, f: (h) => P.aoe(h, h, 16, 140 + h.level * 18, 4) };
  if (WAR_T.has(type)) return { cd: 110, mp: 100, self: 1, f: (h) => { h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.3); h.hasteT = 8; } };
  return { cd: 110, mp: 100, f: (h, pt) => { P.dash(h, pt, 40); P.aoe(h, h, 8, 160 + h.level * 22); } };
}

// returns the hero's 4 abilities [Q,W,E,R] bound to this world's combat primitives
export function buildKit(type, world) {
  const P = makeP(world);
  const k = KITS[type] || KITS.Neutral;
  return [ARCH[k[0]](P), ARCH[k[1]](P), ARCH[k[2]](P), buildSuper(type, P)];
}
