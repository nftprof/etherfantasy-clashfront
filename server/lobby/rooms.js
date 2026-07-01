// Lobby / room manager.
// ---------------------------------------------------------------------------
// Players land here AFTER they've authenticated (conn.identity = {id,username}).
// They either Quick-Match (auto-paired) or create / join a named room and WAIT
// in a lobby — seeing everyone, readying up — until the host starts (or the room
// fills and auto-starts). On start, every player in the room is told to connect
// to the AUTHORITATIVE game server with a shared `party` id so the game server
// groups exactly that set of players onto the right teams.
//
// This module is transport-agnostic and pure enough to unit-test: it only calls
// `conn.send(obj)`. The ws entry (index.js) wires real sockets to it.
// ---------------------------------------------------------------------------

export const MODES = {
  "1v1":  { label: "1v1",        perTeam: 1, teams: 2, vsAI: false },
  "2v2":  { label: "2v2",        perTeam: 2, teams: 2, vsAI: false },
  "coop": { label: "Co-op vs AI", perTeam: 2, teams: 1, vsAI: true },
  "grind":{ label: "Grind vs AI", perTeam: 1, teams: 1, vsAI: true }, // solo, loot-eligible
};
const DEFAULT_MODE = "1v1";
const COUNTDOWN_SEC = 5;

// Multiplayer (any mode needing 2+ humans) is restricted to EF_PVP_USERS during testing.
// Everyone else (staff) is single-player "grind" only. Set EF_PVP_USERS="*" to open to all.
const isMultiMode = (mode) => { const m = MODES[mode]; return !!m && (m.perTeam * m.teams) >= 2; };
const norm = (u) => String(u || "").trim().toLowerCase(); // exact canonical match (no fuzzy digit-strip)
const ADMINS = new Set((process.env.EF_ADMINS || "nftprof,nftprof1").split(",").map(s => norm(s)).filter(Boolean));
function canMulti(conn) {
  const u = conn.identity && conn.identity.username;
  if (ADMINS.has(norm(u))) return true; // admins: all modes
  const set = new Set((process.env.EF_PVP_USERS || "nftprof1").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
  if (set.has("*")) return true;
  return set.has(String(u || "").toLowerCase());
}
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no easily-confused chars

function makeCode(taken) {
  let c;
  do { c = Array.from({ length: 4 }, () => CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0]).join(""); }
  while (taken(c));
  return c;
}

export class LobbyManager {
  // opts: { gameUrl, countdownSec, now }
  constructor(opts = {}) {
    this.rooms = new Map();      // code -> room
    this.conns = new Map();      // connId -> conn
    this.gameUrl = opts.gameUrl || "";       // authoritative game WS url (wss://…); "" => client uses AI fallback
    this.countdownSec = opts.countdownSec ?? COUNTDOWN_SEC;
    this.now = opts.now || (() => Date.now());
    this._party = 1;
  }

  // ---- connection lifecycle --------------------------------------------------
  add(conn) { this.conns.set(conn.id, conn); conn.roomCode = null; }

  remove(connId) {
    const conn = this.conns.get(connId);
    if (!conn) return;
    if (conn.roomCode) this.leave(conn);
    this.conns.delete(connId);
  }

  // ---- message dispatch ------------------------------------------------------
  handle(conn, m) {
    switch (m && m.t) {
      case "create":     return this.create(conn, m);
      case "join":       return this.joinByCode(conn, m);
      case "quick":      return this.quick(conn, m);
      case "leave":      return this.leave(conn);
      case "ready":      return this.setReady(conn, !!m.ready);
      case "slot":       return this.setSlot(conn, m.slot);
      case "mode":       return this.setMode(conn, m.mode);
      case "start":      return this.hostStart(conn);
      case "rooms":      return this.listRooms(conn);
      case "chat":       return this.chat(conn, m.text);
      default:           return this.send(conn, { t: "error", reason: "unknown-msg" });
    }
  }

  // ---- room creation / joining ----------------------------------------------
  create(conn, m) {
    if (conn.roomCode) this.leave(conn);
    const mode = MODES[m.mode] ? m.mode : DEFAULT_MODE;
    if (isMultiMode(mode) && !canMulti(conn)) { this.send(conn, { t: "error", reason: "Multiplayer is staff-restricted to nftprof during testing — pick Grind (solo)." }); return null; }
    const code = makeCode((c) => this.rooms.has(c));
    const room = {
      code, mode,
      name: (typeof m.name === "string" && m.name.trim()) ? m.name.trim().slice(0, 30) : `${conn.identity.username}'s game`,
      hostId: conn.id,
      isPublic: m.isPublic !== false,        // default public/browsable
      paid: !!m.paid && mode !== "grind",     // paid PvP (10 CT escrow) match
      loot: mode === "grind",                 // single-player loot/grind match
      players: new Map(),
      state: "waiting",                       // waiting | countdown | launched
      countdownEndsAt: 0,
      createdAt: this.now(),
    };
    this.rooms.set(code, room);
    this._seat(room, conn);
    this.broadcast(room);
    return room;
  }

  joinByCode(conn, m) {
    const code = String(m.code || "").toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return this.send(conn, { t: "error", reason: "no-such-room" });
    if (isMultiMode(room.mode) && !canMulti(conn)) return this.send(conn, { t: "error", reason: "Multiplayer is staff-restricted to nftprof during testing." });
    if (room.state !== "waiting") return this.send(conn, { t: "error", reason: "already-started" });
    if (room.players.size >= this.capacity(room)) return this.send(conn, { t: "error", reason: "room-full" });
    if (conn.roomCode && conn.roomCode !== code) this.leave(conn);
    this._seat(room, conn);
    this.broadcast(room);
    return room;
  }

  // Quick-Match: drop the player into the best open public room of this mode,
  // creating one if none waits. Auto-starts when it fills.
  quick(conn, m) {
    const mode = MODES[m && m.mode] ? m.mode : DEFAULT_MODE;
    if (isMultiMode(mode) && !canMulti(conn)) return this.send(conn, { t: "error", reason: "Multiplayer is staff-restricted to nftprof during testing — pick Grind (solo)." });
    const paid = !!(m && m.paid);
    let best = null;
    for (const r of this.rooms.values()) {
      if (r.isPublic && r.state === "waiting" && r.mode === mode && !!r.paid === paid && r.players.size < this.capacity(r)) {
        if (!best || r.players.size > best.players.size) best = r; // fill the fullest first
      }
    }
    if (best) return this.joinByCode(conn, { code: best.code });
    const room = this.create(conn, { mode, isPublic: true, paid, name: `${paid ? "Paid" : "Quick"} ${MODES[mode].label}` });
    room.quick = true;
    return room;
  }

  _seat(room, conn) {
    // alternate teams for PvP; everyone on team 0 for co-op vs AI
    const team = MODES[room.mode].teams === 1 ? 0 : (room.players.size % 2);
    room.players.set(conn.id, {
      connId: conn.id, pgId: conn.identity.id, username: conn.identity.username,
      ready: false, team, slot: 0, isHost: conn.id === room.hostId,
    });
    conn.roomCode = room.code;
    this.send(conn, { t: "joined", code: room.code, you: conn.id, gameUrl: this.gameUrl });
  }

  leave(conn) {
    const room = conn.roomCode && this.rooms.get(conn.roomCode);
    conn.roomCode = null;
    if (!room) return;
    room.players.delete(conn.id);
    if (room.players.size === 0) { this.rooms.delete(room.code); return; }
    if (room.hostId === conn.id) {              // host left → promote the next player
      const next = room.players.keys().next().value;
      room.hostId = next;
      const p = room.players.get(next); if (p) p.isHost = true;
    }
    if (room.state === "countdown") this.cancelCountdown(room, "a player left");
    this.broadcast(room);
  }

  // ---- in-lobby actions ------------------------------------------------------
  setReady(conn, ready) {
    const room = this.roomOf(conn); if (!room) return;
    const p = room.players.get(conn.id); if (!p) return;
    p.ready = ready;
    this.broadcast(room);
    this.maybeAutoStart(room);
  }

  setSlot(conn, slot) {
    const room = this.roomOf(conn); if (!room) return;
    const p = room.players.get(conn.id); if (!p) return;
    p.slot = Number.isInteger(slot) ? slot : 0;
    this.broadcast(room);
  }

  setMode(conn, mode) {
    const room = this.roomOf(conn); if (!room || room.hostId !== conn.id) return;
    if (!MODES[mode] || room.state !== "waiting") return;
    if (room.players.size > MODES[mode].perTeam * MODES[mode].teams) return; // would overflow
    room.mode = mode;
    // re-seat teams under the new mode
    let i = 0; for (const p of room.players.values()) { p.team = MODES[mode].teams === 1 ? 0 : (i++ % 2); p.ready = false; }
    this.broadcast(room);
  }

  hostStart(conn) {
    const room = this.roomOf(conn); if (!room || room.hostId !== conn.id) return;
    if (room.state !== "waiting") return;
    if (room.players.size < this.minToStart(room)) return this.send(conn, { t: "error", reason: "need-more-players" });
    this.beginCountdown(room);
  }

  // auto-start a quick-match / full room once it's full and everyone's ready
  maybeAutoStart(room) {
    if (room.state !== "waiting") return;
    const full = room.players.size >= this.capacity(room);
    const allReady = [...room.players.values()].every((p) => p.ready);
    if (full && allReady) this.beginCountdown(room);
  }

  // ---- launch ----------------------------------------------------------------
  beginCountdown(room) {
    room.state = "countdown";
    room.countdownEndsAt = this.now() + this.countdownSec * 1000;
    room.party = "p" + (this._party++) + "-" + room.code;
    this.broadcast(room);
    room._timer = setTimeout(() => this.launch(room), this.countdownSec * 1000);
  }

  cancelCountdown(room, why) {
    if (room._timer) { clearTimeout(room._timer); room._timer = null; }
    room.state = "waiting";
    room.countdownEndsAt = 0;
    this.broadcast(room, { note: "Start cancelled — " + why });
  }

  launch(room) {
    if (room.state !== "countdown") return;
    room.state = "launched";
    if (room._timer) { clearTimeout(room._timer); room._timer = null; }
    const m = MODES[room.mode];
    for (const p of room.players.values()) {
      const conn = this.conns.get(p.connId);
      if (!conn) continue;
      this.send(conn, {
        t: "launch",
        gameUrl: this.gameUrl,           // "" => client uses local/AI fallback
        party: room.party,               // game server groups this set together
        mode: room.mode, vsAI: m.vsAI, paid: !!room.paid, loot: !!room.loot,
        team: p.team, slot: p.slot,
        seats: [...room.players.values()].map((q) => ({ name: q.username, team: q.team, slot: q.slot })),
      });
    }
    // the match now lives on the game server; free the lobby room shortly after
    setTimeout(() => { if (this.rooms.get(room.code) === room) this.rooms.delete(room.code); }, 2000);
  }

  // ---- queries / helpers -----------------------------------------------------
  capacity(room) { const m = MODES[room.mode]; return m.perTeam * m.teams; }
  minToStart(room) { const m = MODES[room.mode]; return m.vsAI ? 1 : 2; }
  roomOf(conn) { return conn.roomCode ? this.rooms.get(conn.roomCode) : null; }

  listRooms(conn) {
    const list = [];
    for (const r of this.rooms.values()) {
      if (r.isPublic && r.state === "waiting")
        list.push({ code: r.code, name: r.name, mode: r.mode, players: r.players.size, cap: this.capacity(r) });
    }
    this.send(conn, { t: "rooms", rooms: list });
  }

  chat(conn, text) {
    const room = this.roomOf(conn); if (!room) return;
    if (typeof text !== "string" || !text.trim()) return;
    this.broadcastRaw(room, { t: "chat", from: conn.identity.username, text: text.trim().slice(0, 200) });
  }

  roomView(room, extra) {
    return {
      t: "room", code: room.code, name: room.name, mode: room.mode,
      state: room.state, hostId: room.hostId, cap: this.capacity(room),
      countdownEndsAt: room.countdownEndsAt || 0,
      players: [...room.players.values()].map((p) => ({
        connId: p.connId, username: p.username, team: p.team, slot: p.slot, ready: p.ready, isHost: p.connId === room.hostId,
      })),
      ...(extra || {}),
    };
  }

  broadcast(room, extra) { this.broadcastRaw(room, this.roomView(room, extra)); }
  broadcastRaw(room, obj) {
    for (const p of room.players.values()) { const c = this.conns.get(p.connId); if (c) this.send(c, obj); }
  }
  send(conn, obj) { try { conn.send(obj); } catch {} }

  stats() {
    let waiting = 0, players = 0;
    for (const r of this.rooms.values()) { if (r.state === "waiting") waiting++; players += r.players.size; }
    return { rooms: this.rooms.size, waiting, players };
  }
}
