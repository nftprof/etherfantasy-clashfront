// Live smoke test: connect two clients, join, and confirm a match starts and
// snapshots arrive. Usage: node test/smoke.js [ws://host:port]
import { WebSocket } from "ws";
const URL = process.argv[2] || "ws://localhost:8080";
let snaps = 0, started = false;

function client(name, slot, drive) {
  const ws = new WebSocket(URL);
  ws.on("open", () => ws.send(JSON.stringify({ t: "join", name, slot })));
  ws.on("message", (d) => {
    const m = JSON.parse(d);
    if (m.t === "start") { started = true; console.log(`[${name}] match ${m.matchId} started (seats ${m.seats.length})`); if (drive) ws.send(JSON.stringify({ t: "in", a: "move", x: 100, z: 100 })); }
    if (m.t === "snap") { snaps++; if (drive && snaps === 1) console.log(`[${name}] first snapshot: ${m.units.length} units, tick ${m.tick}`); }
  });
  ws.on("error", (e) => console.error(`[${name}] err`, e.message));
  return ws;
}

client("Alice", 1, true);
client("Bob", 2, false);

setTimeout(() => {
  console.log(started ? `✅ match started; received ${snaps} snapshots` : "❌ no match started");
  process.exit(started && snaps > 0 ? 0 : 1);
}, 3000);
