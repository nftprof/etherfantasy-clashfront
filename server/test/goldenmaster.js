// P0 golden-master (determinism) test: the same seed + same input log must produce
// an identical end state every run. This is the property that lets us later diff the
// Node sim against the browser sim for full parity. Run: npm run goldenmaster
import { makeWorld } from "../sim/state.js";
import { step } from "../sim/step.js";
import { config } from "../config.js";

function runSim() {
  const seats = [
    { seatId: 1, team: 0, slot: 1, name: "A" },
    { seatId: 2, team: 1, slot: 2, name: "B" },
  ];
  const world = makeWorld(12345, seats);
  const dt = 1 / config.TICK_HZ;
  // scripted input log: A marches at B's core, B holds
  const h0 = world.units.get(world.bySeat.get(1));
  const enemyCore = [...world.units.values()].find(u => u.kind === "core" && u.team === 1);
  for (let t = 0; t < 1200; t++) { // ~40s @30Hz
    const inputs = new Map([[1, []], [2, []]]);
    if (t === 0) inputs.get(1).push({ a: "move", x: enemyCore.x, z: enemyCore.z });
    if (t === 600) inputs.get(1).push({ a: "atk", uid: enemyCore.uid });
    step(world, dt, inputs);
    if (world.winner != null) break;
  }
  return { tick: world.tick, winner: world.winner, hpA: h0.hp, hp: [...world.units.values()].map(u => Math.round(u.hp)) };
}

const a = runSim();
const b = runSim();
const same = JSON.stringify(a.hp) === JSON.stringify(b.hp) && a.tick === b.tick && a.winner === b.winner;
console.log("run1:", { tick: a.tick, winner: a.winner });
console.log("run2:", { tick: b.tick, winner: b.winner });
console.log(same ? "✅ DETERMINISTIC — identical end state across runs" : "❌ NON-DETERMINISTIC — states diverged");
process.exit(same ? 0 : 1);
