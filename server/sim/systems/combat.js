// Authoritative combat. HP/damage/deaths computed server-side ONLY (anti-cheat §3):
// the client can never set its own hp. Minimal auto-attack: if a unit has a target
// in range, tick its attack cooldown and deal damage; otherwise walk into range.
import { alive, dist, killUnit } from "../state.js";

// a core is invulnerable while its team still has a standing tower (MOBA gating —
// makes towers + minions matter and stops a lone hero from rushing the core).
function teamHasTower(world, team) {
  // towers shield the core; so does any unit flagged shieldsCore (opt-in: a living-world Guardian standing on its perch, doc 04)
  for (const o of world.units.values()) if ((o.kind === "tower" || o.shieldsCore) && o.team === team && alive(o)) return true;
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
          // canon UnitClass SIEGE (docs/03 §3: ×6 ⚙ vs structures): opt-in per unit (u.structMul), so units without it — every
          // existing battle — resolve byte-identically. Structures = towers, walls/gates, cores.
          const sm = (u.structMul && (tgt.kind === "tower" || tgt.kind === "wall" || tgt.kind === "core")) ? u.structMul : 1;
          tgt.hp -= u.dmg * sm * (tgt.dmgTakenMul != null ? tgt.dmgTakenMul : 1);   // dmgTakenMul: opt-in (Form 3 Ascension), absent → unchanged
          if (tgt.hp <= 0) killUnit(world, u, tgt); // gold/XP/respawn/win handled centrally
        }
      }
    }
  }
}
