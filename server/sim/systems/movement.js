// Authoritative movement. Ported from the browser host loop, operating on plain
// data (x/z) instead of u.grp.position. The server is the ONLY mover — clients
// just send a destination; we clamp speed and map bounds here (anti-cheat §3).
import { alive } from "../state.js";
import { config } from "../../config.js";

export function movementSystem(world, dt) {
  const { min, max } = config.MAP;
  for (const u of world.units.values()) {
    if (!alive(u) || u.speed <= 0) continue;
    if (u.state === "attack" && u.target) continue; // combat system drives this
    if (!u.dest) { if (u.state === "move") u.state = "idle"; continue; }

    const dx = u.dest.x - u.x, dz = u.dest.z - u.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const step = u.speed * (u.slowT > 0 ? 0.5 : 1) * dt; // movement slow from CC abilities
    if (d <= step) { u.x = u.dest.x; u.z = u.dest.z; u.dest = null; u.state = "idle"; }
    else { u.x += (dx / d) * step; u.z += (dz / d) * step; u.state = "move"; }

    // hard map clamp — no out-of-bounds, ever
    u.x = Math.max(min, Math.min(max, u.x));
    u.z = Math.max(min, Math.min(max, u.z));
  }
}
