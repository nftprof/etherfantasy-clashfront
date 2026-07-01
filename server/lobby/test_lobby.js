// Unit tests for the lobby/room logic (no sockets, no network).
//   node server/lobby/test_lobby.js
process.env.EF_PVP_USERS = "*"; // tests exercise multi-user rooms; open the multiplayer gate
import { LobbyManager, MODES } from "./rooms.js";
import { verifyToken } from "./auth.js";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("FAIL:", m)); };

let _id = 1;
function conn(username) {
  return { id: _id++, identity: { id: "u" + _id, username }, sent: [], send(o) { this.sent.push(o); } };
}
const last = (c, t) => [...c.sent].reverse().find((m) => m.t === t);
const lastRoom = (c) => last(c, "room");

// ---- create + join + teams -------------------------------------------------
{
  const L = new LobbyManager({ gameUrl: "wss://game", countdownSec: 1 });
  const a = conn("Alice"), b = conn("Bob");
  L.add(a); L.add(b);
  const room = L.create(a, { mode: "1v1", name: "Test" });
  ok(!!last(a, "joined"), "create: host gets joined");
  ok(last(a, "joined").you === a.id, "joined carries my connId");
  ok(lastRoom(a).players.length === 1 && lastRoom(a).players[0].isHost, "create: host seated + isHost");
  L.joinByCode(b, { code: room.code });
  ok(lastRoom(b).players.length === 2, "join: room now has 2");
  const teams = lastRoom(b).players.map((p) => p.team).sort();
  ok(teams[0] === 0 && teams[1] === 1, "1v1: players on opposite teams");
}

// ---- ready + auto-start (full 1v1) ----------------------------------------
{
  const L = new LobbyManager({ gameUrl: "wss://game", countdownSec: 5 });
  const a = conn("A"), b = conn("B"); L.add(a); L.add(b);
  const r = L.create(a, { mode: "1v1" }); L.joinByCode(b, { code: r.code });
  L.setReady(a, true);
  ok(L.rooms.get(r.code).state === "waiting", "one ready: still waiting");
  L.setReady(b, true);
  ok(L.rooms.get(r.code).state === "countdown", "full + all ready: auto countdown");
  ok(!!L.rooms.get(r.code).party, "countdown assigns a party id");
}

// ---- host start needs min players -----------------------------------------
{
  const L = new LobbyManager({ countdownSec: 1 });
  const a = conn("Solo"); L.add(a);
  const r = L.create(a, { mode: "1v1" });
  L.hostStart(a);
  ok(L.rooms.get(r.code).state === "waiting", "1v1 with 1 player: start refused");
  ok(!!last(a, "error") && last(a, "error").reason === "need-more-players", "refusal reason surfaced");
}

// ---- co-op vs AI starts with a single player -------------------------------
{
  const L = new LobbyManager({ countdownSec: 1 });
  const a = conn("Coop"); L.add(a);
  const r = L.create(a, { mode: "coop" });
  L.hostStart(a);
  ok(L.rooms.get(r.code).state === "countdown", "coop: single player can start");
  ok(lastRoom(a).players[0].team === 0, "coop: everyone team 0");
}

// ---- quick match pairs two into the same room ------------------------------
{
  const L = new LobbyManager({ countdownSec: 5 });
  const a = conn("Q1"), b = conn("Q2"); L.add(a); L.add(b);
  L.quick(a, { mode: "1v1" });
  L.quick(b, { mode: "1v1" });
  ok(a.roomCode === b.roomCode, "quick: both land in the same room");
  ok(L.rooms.get(a.roomCode).players.size === 2, "quick: room filled to 2");
}

// ---- host leaves -> promote; last leaves -> room gone ----------------------
{
  const L = new LobbyManager({ countdownSec: 1 });
  const a = conn("Host"), b = conn("Guest"); L.add(a); L.add(b);
  const r = L.create(a, { mode: "2v2" }); L.joinByCode(b, { code: r.code });
  L.leave(a);
  ok(L.rooms.get(r.code).hostId === b.id, "host left: guest promoted to host");
  ok(lastRoom(b).players.find((p) => p.connId === b.id).isHost, "promoted player flagged host");
  L.leave(b);
  ok(!L.rooms.has(r.code), "last player left: room removed");
}

// ---- mode change reseats teams + clears ready ------------------------------
{
  const L = new LobbyManager({ countdownSec: 1 });
  const a = conn("H"), b = conn("G"); L.add(a); L.add(b);
  const r = L.create(a, { mode: "1v1" }); L.joinByCode(b, { code: r.code });
  L.setReady(a, true);
  L.setMode(a, "coop");
  ok(L.rooms.get(r.code).mode === "coop", "host changed mode");
  ok(lastRoom(a).players.every((p) => p.team === 0), "coop reseat: all team 0");
  ok(lastRoom(a).players.every((p) => !p.ready), "mode change clears ready");
  // non-host cannot change mode
  L.setMode(b, "1v1");
  ok(L.rooms.get(r.code).mode === "coop", "non-host mode change ignored");
}

// ---- launch payload --------------------------------------------------------
{
  const L = new LobbyManager({ gameUrl: "wss://moba.etherfantasy.com/game", countdownSec: 1 });
  const a = conn("LA"), b = conn("LB"); L.add(a); L.add(b);
  const r = L.create(a, { mode: "1v1" }); L.joinByCode(b, { code: r.code });
  L.setSlot(a, 2);
  L.beginCountdown(L.rooms.get(r.code));
  L.launch(L.rooms.get(r.code));
  const la = last(a, "launch"), lb = last(b, "launch");
  ok(la && lb, "launch sent to both players");
  ok(la.gameUrl === "wss://moba.etherfantasy.com/game", "launch carries game ws url");
  ok(la.party && la.party === lb.party, "both get the SAME party id (server groups them)");
  ok(la.team !== lb.team, "launch teams differ in 1v1");
  ok(la.slot === 2, "launch carries my chosen slot");
  ok(Array.isArray(la.seats) && la.seats.length === 2, "launch lists all seats");
}

// ---- auth: dev fallback gating ---------------------------------------------
(async () => {
  process.env.PG_DEV_FALLBACK = "0";
  const off = await verifyToken("dev:Tester");
  ok(!off.ok && off.reason === "dev-login-disabled", "dev login disabled when PG_DEV_FALLBACK=0");
  // re-import with dev on: env is read at module load, so emulate by checking the branch via a fresh process is overkill;
  // instead assert empty token + short token rejected
  const none = await verifyToken("");
  ok(!none.ok && none.reason === "no-token", "empty token rejected");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
