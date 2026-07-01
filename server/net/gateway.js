// WSS gateway: handshake, route socket → matchmaker, validate + rate-limit inputs.
import { WebSocketServer } from "ws";
import { Matchmaker } from "./matchmaker.js";
import { validateInput, makeRateLimiter } from "../validate.js";
import { config } from "../config.js";

let _seat = 1;

export function attachGateway(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });
  const mm = new Matchmaker();

  wss.on("connection", (ws) => {
    // Disable Nagle: without this, the OS batches our small 30Hz snapshot frames, so they
    // arrive in bursts → remote units stutter then "fast-forward". Send each frame immediately.
    try { ws._socket.setNoDelay(true); } catch {}
    const seatId = _seat++;
    const limit = makeRateLimiter(config.MAX_MSG_PER_SEC);
    let joined = false;
    ws._seatId = seatId;

    ws.send(JSON.stringify({ t: "hello", seatId, server: "ef-moba", tickHz: config.TICK_HZ }));

    ws.on("message", (data) => {
      if (!limit(Date.now())) return; // rate-limited: drop
      let msg; try { msg = JSON.parse(data); } catch { return; }

      if (msg.t === "join") {
        if (joined) return;
        joined = true;
        const seat = {
          seatId,
          name: (typeof msg.name === "string" ? msg.name.slice(0, 24) : "Player"),
          slot: Number.isInteger(msg.slot) ? msg.slot : 0, // chosen hero/champion id
          team: (msg.team === 0 || msg.team === 1) ? msg.team : 0, // lobby-assigned side (honored when grouped by party)
          party: (typeof msg.party === "string" ? msg.party.slice(0, 48) : ""), // lobby room id → group these seats into ONE match
          ps: (Number.isInteger(msg.ps) && msg.ps > 0) ? msg.ps : 0, // expected party size (lobby-known) → form as soon as all arrive; solo-vs-AI = 1
          paid: msg.paid === 1 || msg.paid === true, // paid PvP (10 CT escrow) match
          loot: msg.loot === 1 || msg.loot === true, // single-player loot/grind match
          wallet: (typeof msg.wallet === "string" && /^0x[0-9a-fA-F]{40}$/.test(msg.wallet)) ? msg.wallet : null, // lobby-resolved (grind loot)
          grindPaidTx: (typeof msg.paidtx === "string" && /^0x[0-9a-fA-F]{64}$/.test(msg.paidtx)) ? msg.paidtx : null,
          ws,
        };
        mm.enqueue(seat);
        ws.send(JSON.stringify({ t: "queued" }));
        return;
      }

      if (msg.t === "in") {
        const v = validateInput(msg);
        if (v) mm.input(seatId, v);
        return;
      }

      if (msg.t === "pick" || msg.t === "ready" || msg.t === "wallet" || msg.t === "paid") { mm.control(seatId, msg); return; }

      if (msg.t === "ping") { ws.send(JSON.stringify({ t: "pong", at: msg.at })); }
    });

    ws.on("close", () => mm.remove(seatId));
    ws.on("error", () => mm.remove(seatId));
  });

  return mm;
}
