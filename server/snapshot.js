// Encode the authoritative world into a compact snapshot the client renders.
// Mirrors the existing guest-frame idea: a list of unit states the renderer maps
// onto THREE groups (apply position/hp; spawn/despawn by uid).
export function encodeSnapshot(world) {
  const units = [];
  const hr = []; // hero-rich state for the client HUD (mana/level/gold) + death/respawn
  for (const u of world.units.values()) {
    units.push({
      uid: u.uid, k: u.kind, tm: u.team, slot: u.slot,
      x: round(u.x), z: round(u.z),
      hp: Math.round(u.hp), mhp: u.maxHp, st: u.state,
      o: u.owner, // seatId of the controlling player (heroes); null otherwise → client maps its own hero
    });
    if (u.kind === "hero") {
      hr.push({
        uid: u.uid, hp: Math.round(u.hp), mhp: u.maxHp,
        mp: Math.round(u.mp), mmp: u.maxMp, lvl: u.level, gold: Math.floor(u.gold),
        dead: u.state === "dead" ? 1 : 0, rt: Math.ceil(u.respT || 0), k: 0, dth: 0, cs: 0,
        ack: u.ackSeq || 0, // last input seq processed → client reconciliation
      });
    }
  }
  return {
    t: "snap",
    tick: world.tick,
    winner: world.winner,
    bank: world.bank,
    units, hr,
  };
}
const round = (n) => Math.round(n * 100) / 100;
