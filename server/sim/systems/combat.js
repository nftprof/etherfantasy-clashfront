// Authoritative combat. HP/damage/deaths computed server-side ONLY (anti-cheat §3):
// the client can never set its own hp. Minimal auto-attack: if a unit has a target
// in range, tick its attack cooldown and deal damage; otherwise walk into range.
import { alive, dist, killUnit } from "../state.js";

// a core is invulnerable while its team still has a standing tower (MOBA gating —
// makes towers + minions matter and stops a lone hero from rushing the core).
function teamHasTower(world, team) {
  for (const o of world.units.values()) if (o.kind === "tower" && o.team === team && alive(o)) return true;
  return false;
}

export function combatSystem(world, dt) {
  for (const u of world.units.values()) {
    if (!alive(u) || u.dmg <= 0) continue;
    if (u.atkCd > 0) u.atkCd -= dt;
    if (!u.target) continue;

    const tgt = world.units.get(u.target);
    if (!alive(tgt) || tgt.team === u.team) { u.target = null; u.state = "idle"; continue; }

    const d = dist(u, tgt);
    if (d > u.range) {
      // chase: move toward target (movement system skips attackers, so step here)
      const spd = u.speed * (u.slowT > 0 ? 0.5 : 1);
      const step = spd * dt, dx = tgt.x - u.x, dz = tgt.z - u.z, m = Math.max(0.0001, d);
      u.x += (dx / m) * step; u.z += (dz / m) * step; u.state = "move";
    } else {
      u.state = "attack";
      if (u.atkCd <= 0) {
        u.atkCd = 1 / Math.max(0.1, u.atkSpd * (u.hasteT > 0 ? 2 : 1)); // haste = 2× attack speed
        if (tgt.kind === "core" && teamHasTower(world, tgt.team)) {
          tgt.shielded = true;            // can't hurt the core until its towers fall
        } else {
          if (tgt.kind === "core") tgt.shielded = false;
          tgt.hp -= u.dmg;
          if (tgt.hp <= 0) killUnit(world, u, tgt); // gold/XP/respawn/win handled centrally
        }
      }
    }
  }
}
