// Fixed-timestep tick. Deterministic given (seed, input log) — the property the
// P0 golden-master test relies on. Apply queued inputs, then run systems in order.
import { heroFor, alive } from "./state.js";
import { buyItem } from "./items.js";
import { config } from "../config.js";
import { movementSystem } from "./systems/movement.js";
import { combatSystem } from "./systems/combat.js";
import { aiSystem } from "./systems/ai.js";

const { min, max } = config.MAP;
const clampPt = (p) => ({ x: Math.max(min, Math.min(max, p.x)), z: Math.max(min, Math.min(max, p.z)) });

// Apply one validated input to its owner's hero. Returns silently on anything illegal.
export function applyInput(world, seatId, input) {
  const h = heroFor(world, seatId);
  if (!alive(h)) return;
  if (Number.isInteger(input.seq) && input.seq > (h.ackSeq || 0)) h.ackSeq = input.seq; // for client reconciliation
  switch (input.a) {
    case "move":
    case "amove":
      if (typeof input.x === "number" && typeof input.z === "number") { h.dest = clampPt(input); h.target = null; }
      break;
    case "stop": h.dest = null; h.target = null; h.state = "idle"; break;
    case "atk": {
      const t = world.units.get(input.uid);
      if (t && t.team !== h.team && alive(t)) h.target = t.uid;
      break;
    }
    case "flash": // server-executed blink: capped displacement toward point
      if (h.cd.flash <= 0 && typeof input.x === "number") {
        const dx = input.x - h.x, dz = input.z - h.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
        const cap = Math.min(d, 30);
        h.x = Math.max(min, Math.min(max, h.x + (dx / d) * cap));
        h.z = Math.max(min, Math.min(max, h.z + (dz / d) * cap));
        h.cd.flash = 90;
      }
      break;
    case "potion": if (h.cd.potion <= 0) { h.hp = Math.min(h.maxHp, h.hp + 300); h.cd.potion = 60; } break;
    case "recall": h.dest = null; h.state = "recall"; break; // 4s channel handled later
    case "cast": {
      const i = input.i;
      if (!Number.isInteger(i) || i < 0 || i > 3 || !h.abs) break;
      const ab = h.abs[i]; if (!ab) break;
      const key = ["q", "w", "e", "r"][i];
      if ((h.cd[key] || 0) > 0 || h.mp < ab.mp) break;       // on cooldown or out of mana
      h.mp -= ab.mp; h.cd[key] = ab.cd * config.TICK_HZ;     // cds are frame-based (see step())
      const pt = ab.self ? { x: h.x, z: h.z } : clampPt({ x: input.x ?? h.x, z: input.z ?? h.z });
      try { ab.f(h, pt); } catch (e) {}
      break;
    }
    case "buy": if (Number.isInteger(input.i)) buyItem(world, h, input.i); break;
    case "pet": break; // pets ported in a later phase
  }
}

export function step(world, dt, inputsBySeat) {
  // 1) inputs
  for (const [seatId, queue] of inputsBySeat) {
    for (const inp of queue) applyInput(world, seatId, inp);
    queue.length = 0;
  }
  // 2) cooldowns (frame-based) + effect timers, mana regen, passive gold, respawn (dt-based)
  for (const u of world.units.values()) {
    for (const k in u.cd) if (u.cd[k] > 0) u.cd[k] -= 1;
    if (u.slowT > 0) u.slowT = Math.max(0, u.slowT - dt);
    if (u.hasteT > 0) u.hasteT = Math.max(0, u.hasteT - dt);
    if (u.kind === "hero") {
      if (u.maxMp > 0 && u.mp < u.maxMp) u.mp = Math.min(u.maxMp, u.mp + 12 * dt);
      if (u.state === "dead") {
        u.respT -= dt;
        if (u.respT <= 0) { // respawn at base, full hp/mp
          const sp = world.spawn[u.team]; u.x = sp.x; u.z = sp.z;
          u.hp = u.maxHp; u.mp = u.maxMp; u.state = "idle"; u.target = null; u.dest = null; u.respT = 0;
        }
      } else {
        u.gold += dt; // passive +1 gold/s income floor
      }
    }
  }
  // 3) systems (order matters): AI sets targets/dests → combat → movement
  aiSystem(world, dt);
  combatSystem(world, dt);
  movementSystem(world, dt);
  // 4) advance clock
  world.tick++; world.t += dt;
  return world;
}
