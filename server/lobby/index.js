// EF Moba — Lobby & matchmaking service (separate from the authoritative game
// server so it can run on its own port and not touch that codebase).
//
//   landing/login (static)  ─┐
//   PG auth (auth.js)        ├─►  LobbyManager (rooms.js)  ──launch──►  game WS (8080)
//   rooms / quick-match  ────┘
//
// Run:   LOBBY_PORT=8090 EF_GAME_WS=wss://moba.etherfantasy.com/game node index.js
// Health: GET /health
import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { LobbyManager } from "./rooms.js";
import { verifyToken, fetchFriends, loginPassword } from "./auth.js";
import { vipTier, vipTierEx, freeRemaining, consumeFree } from "../vip.js";
import { signTicket, verifyTicket, consumeNonce, auditWin } from "../loot.js";
import { rollPaidLoot, rollFreeLoot } from "../vip.js";
import * as escrow from "../chain/playEscrow.js";
import * as stats from "../stats.js";
import * as geo from "../geo.js";

// ---- VIP demo handshake: signed, short-lived play tokens ------------------
// A ripped/offline client can't obtain or refresh a token, so it won't start.
// Set DEMO_SECRET (stable across restarts) + DEMO_VIP_CODES (comma list) in env.
const DEMO_SECRET = process.env.DEMO_SECRET || crypto.randomBytes(32).toString("hex");
const DEMO_VIP_CODES = new Set((process.env.DEMO_VIP_CODES || "").split(",").map((s) => s.trim()).filter(Boolean));
const DEMO_TTL = parseInt(process.env.DEMO_TTL_MS || "600000", 10); // 10 min
function demoSign(sub) {
  const body = Buffer.from(JSON.stringify({ sub, exp: Date.now() + DEMO_TTL })).toString("base64url");
  const sig = crypto.createHmac("sha256", DEMO_SECRET).update(body).digest("base64url");
  return body + "." + sig;
}
function demoVerify(tok) {
  if (typeof tok !== "string" || !tok.includes(".")) return null;
  const [body, sig] = tok.split(".");
  const good = crypto.createHmac("sha256", DEMO_SECRET).update(body).digest("base64url");
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  let p; try { p = JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return null; }
  return (p && p.exp > Date.now()) ? p : null;
}
function readJson(req, cb) {
  let b = ""; req.on("data", (d) => { b += d; if (b.length > 4096) req.destroy(); });
  req.on("end", () => { try { cb(JSON.parse(b || "{}")); } catch { cb(null); } });
  req.on("error", () => cb(null));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.LOBBY_PORT || "8090", 10);
const GAME_WS = process.env.EF_GAME_WS || "";   // authoritative game server ws/wss url ("" => client AI fallback)
const PUBLIC = path.join(__dirname, "public");
const MAX_MSG_PER_SEC = 30;

const lobby = new LobbyManager({ gameUrl: GAME_WS });

// ---- identity matching ----
// auth.js resolves each login to the EXACT canonical username PG returns from /user/info
// (the PNS-resolved primary; see the identity docs). We match that name EXACTLY (case-
// insensitive) — never fuzzy digit-stripping, which would wrongly merge distinct accounts
// like nftprof1 / nftprof2. List every admin handle the account can resolve to.
const norm = (u) => String(u || "").trim().toLowerCase();

// Admins: full access to everything (all game modes), regardless of the other lists.
const ADMINS = new Set((process.env.EF_ADMINS || "nftprof,nftprof1")
  .split(",").map(s => norm(s)).filter(Boolean));
const isAdmin = (u) => ADMINS.has(norm(u));

// Access control (testing phase): only these PG usernames may log in at all (STAFF).
// Multiplayer (1v1/2v2/coop) is further restricted to EF_PVP_USERS (see rooms.js); everyone
// else is single-player (Grind) only. Override via env when opening up to VIP tiers later.
const STAFF = new Set((process.env.EF_STAFF ||
  "nakary1,phoenix2,nftprof1,onuwilliamson1,em1,levi21231")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
const isStaff = (u) => isAdmin(u) || STAFF.has("*") || STAFF.has(String(u || "").toLowerCase());

// Multiplayer (1v1/2v2/coop) is limited to these users during testing; everyone else is
// Player-vs-AI only. Mirrors rooms.js EF_PVP_USERS. Set EF_PVP_USERS="*" to open to all staff.
const PVP_USERS = new Set((process.env.EF_PVP_USERS || "nftprof1")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
const isPvp = (u) => isAdmin(u) || PVP_USERS.has("*") || PVP_USERS.has(String(u || "").toLowerCase());

// ---- static file serving (landing + lobby client) --------------------------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
function serveStatic(req, res) {
  let p = decodeURIComponent((req.url.split("?")[0]) || "/");
  if (p === "/") p = "/index.html";
  else if (p.endsWith("/")) p += "index.html";          // /admin/ → /admin/index.html
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }     // path-traversal guard
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    const ext = path.extname(file);
    const h = { "content-type": MIME[ext] || "application/octet-stream" };
    if (ext === ".html") h["cache-control"] = "no-cache"; // lobby UI iterates fast — always revalidate so no stale tab
    res.writeHead(200, h);
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === "/ping" || req.url.startsWith("/ping?")) {
    // tiny latency probe — the landing pings each region's /ping to measure RTT
    res.writeHead(200, { "content-type": "text/plain", "access-control-allow-origin": "*", "cache-control": "no-store" });
    return res.end("ok");
  }
  if (req.url === "/health" || req.url.startsWith("/health?")) {
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    return res.end(JSON.stringify({ ok: true, service: "ef-moba-lobby", uptime: process.uptime(), gameWs: !!GAME_WS, ...lobby.stats() }));
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" });
    return res.end();
  }
  if (req.method === "GET" && req.url.startsWith("/grind/credits")) {
    // pre-game free-play check (VIP quota) by PG username — shown on the lobby before launch
    res.setHeader("access-control-allow-origin", "*");
    const q = new URL(req.url, "http://x").searchParams;
    const username = q.get("username") || "";
    const fresh = q.get("fresh") === "1"; // re-check after a VIP upgrade → bypass the 2-min tier cache
    if (username.length < 2 || username.length > 32) { res.writeHead(400, { "content-type": "application/json" }); return res.end('{"ok":false,"reason":"bad-username"}'); }
    return vipTierEx(username, fresh).then((v) => {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      // checked=false → the VIP API didn't answer; UI shows "try again", NOT "you're out of free plays"
      res.end(JSON.stringify({ ok: true, checked: v.ok, tier: v.tier, free: v.ok ? freeRemaining(username, v.tier) : 0, entry: "10" }));
    }).catch(() => { res.writeHead(200, { "content-type": "application/json" }); res.end('{"ok":true,"checked":false,"tier":0,"free":0,"entry":"10"}'); });
  }
  if (req.method === "GET" && req.url.startsWith("/leaderboard")) {
    // single "Champion Score" board: earned + weight*spent, PG username, played/won/lost/spent/earned
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" });
    return res.end(JSON.stringify({ ok: true, spendWeight: stats.spendWeight(), rows: stats.leaderboard(100) }));
  }
  if (req.method === "GET" && req.url.startsWith("/geo/summary")) {
    // where players (esp. payers) connect from — aggregate only, NO raw IPs. Gated by ?key=GEO_KEY.
    res.setHeader("access-control-allow-origin", "*");
    const key = (new URL(req.url, "http://x")).searchParams.get("key") || "";
    if (!process.env.GEO_KEY || key !== process.env.GEO_KEY) { res.writeHead(403, { "content-type": "application/json" }); return res.end('{"ok":false,"reason":"forbidden"}'); }
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify({ ok: true, ...geo.summary() }));
  }
  if (req.method === "POST" && req.url === "/grind/claim") {
    // local grind win → verify the lobby-issued ticket, audit the result, pay loot (silent).
    return readJson(req, (body) => {
      res.setHeader("access-control-allow-origin", "*");
      const tk = body && verifyTicket(body.ticket);
      if (!tk) { res.writeHead(403, { "content-type": "application/json" }); return res.end('{"ok":false,"reason":"bad-ticket"}'); }
      if (!consumeNonce(tk.nonce)) { res.writeHead(409, { "content-type": "application/json" }); return res.end('{"ok":false,"reason":"already-claimed"}'); }
      const J = (code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      // category 1 — lost: close with 0, no payout (gp already counted at ticket issue)
      if (!(body.result && body.result.win === true)) return J(200, { ok: true, amount: 0, lost: true });
      const { cheat } = auditWin(tk.username, body.result);       // category 2 — caught: floor only (silent)
      const free = tk.mode !== "paid";
      // category 3 — clean win: the CONTRACT rolls. wallet-less free play can't bank → 0 + prompt.
      if (!tk.wallet) { stats.recordWin(tk.username, 0); return J(200, { ok: true, amount: 0, banked: false, needWallet: true }); }
      const fb = cheat ? 1 : (free ? rollFreeLoot().amount : rollPaidLoot().amount);  // v2 fallback only (pre-upgrade)
      escrow.award(tk.wallet, free, cheat, fb, "loot-" + tk.nonce)
        .then((r) => { stats.recordWin(tk.username, r.amount || 0); J(200, { ok: true, amount: r.amount, tier: r.tier, banked: true, tx: r.tx }); })
        .catch((e) => { console.error("[loot] award:", e.message); J(200, { ok: true, amount: 0, banked: false }); });
    });
  }
  if (req.method === "POST" && (req.url === "/demo/auth" || req.url === "/demo/heartbeat")) {
    return readJson(req, (body) => {
      res.setHeader("access-control-allow-origin", "*");
      if (!body) { res.writeHead(400); return res.end('{"ok":false}'); }
      if (req.url === "/demo/auth") {                       // VIP code → issue play token
        const ok = DEMO_VIP_CODES.size > 0 && DEMO_VIP_CODES.has(String(body.code || ""));
        res.writeHead(ok ? 200 : 403, { "content-type": "application/json" });
        return res.end(JSON.stringify(ok ? { ok: true, token: demoSign("vip") } : { ok: false, reason: "bad-code" }));
      }
      const p = demoVerify(String(body.token || ""));        // heartbeat → validate + refresh (sliding)
      res.writeHead(p ? 200 : 401, { "content-type": "application/json" });
      return res.end(JSON.stringify(p ? { ok: true, token: demoSign(p.sub) } : { ok: false }));
    });
  }
  serveStatic(req, res);
});

// ---- websocket lobby -------------------------------------------------------
const wss = new WebSocketServer({ server });
let _cid = 1;

function rateLimiter(perSec) {
  let tokens = perSec, last = 0;
  return (now) => { if (!last) last = now; tokens = Math.min(perSec, tokens + ((now - last) / 1000) * perSec); last = now; if (tokens < 1) return false; tokens -= 1; return true; };
}

wss.on("connection", (ws, req) => {
  const id = _cid++;
  const allow = rateLimiter(MAX_MSG_PER_SEC);
  // real client IP via nginx (X-Forwarded-For/X-Real-IP); falls back to the socket
  const ip = ((req && req.headers && (req.headers["x-forwarded-for"] || "").split(",")[0].trim())
    || (req && req.headers && req.headers["x-real-ip"]) || (req && req.socket && req.socket.remoteAddress) || "").replace(/^::ffff:/, "");
  const conn = { id, ip, identity: null, token: null, send: (o) => { try { if (ws.readyState === 1) ws.send(JSON.stringify(o)); } catch {} } };
  conn.send({ t: "hello", needAuth: true });

  ws.on("message", async (data) => {
    if (!allow(Date.now())) return;
    let m; try { m = JSON.parse(data); } catch { return; }

    // first message must authenticate — via PG email/password (preferred) or a token (dev/SSO)
    if (!conn.identity) {
      let v, tok;
      if (m.t === "pglogin") { v = await loginPassword(String(m.email || ""), String(m.password || "")); tok = v && v.token; }
      else if (m.t === "auth") { v = await verifyToken(m.token); tok = m.token; }
      else return conn.send({ t: "error", reason: "auth-required" });
      if (!v.ok) return conn.send({ t: "auth-failed", reason: v.reason });
      if (!isStaff(v.username))
        return conn.send({ t: "auth-failed", reason: "Access is limited to EtherFantasy staff during testing." });
      conn.identity = { id: v.id, username: v.username };
      conn.token = tok;
      lobby.add(conn);
      console.log(`[auth] login user="${v.username}" pvp=${isPvp(v.username)} src=${v.source}`);
      conn.send({ t: "auth-ok", username: v.username, id: v.id, source: v.source, token: tok, pvp: isPvp(v.username) });
      return;
    }

    if (m.t === "friends") {                       // party invites (later); best-effort
      const friends = await fetchFriends(conn.token);
      return conn.send({ t: "friends", friends });
    }
    if (m.t === "ping") return conn.send({ t: "pong", at: m.at });

    // Grind-for-loot: resolve eligibility for the AUTHENTICATED user, then mint a signed ticket
    // the game server will honor. Free play consumes lifetime quota; paid verifies the on-chain entry.
    if (m.t === "grindTicket") {
      const username = conn.identity.username;
      const wallet = (typeof m.wallet === "string" && /^0x[0-9a-fA-F]{40}$/.test(m.wallet)) ? m.wallet : null;
      if (m.mode === "free") {
        // VIP free play needs NO wallet — eligibility is by PG username. Wallet is only used to bank winnings.
        const tier = await vipTier(username);
        if (freeRemaining(username, tier) <= 0) return conn.send({ t: "grindDenied", reason: "No free plays left — pay 10 CT." });
        consumeFree(username);
      } else if (m.mode === "paid") {
        if (!wallet) return conn.send({ t: "grindDenied", reason: "Connect a wallet to pay." });
        const okPaid = await escrow.verifyEntryPaid(m.tx, wallet).catch(() => false);
        if (!okPaid) return conn.send({ t: "grindDenied", reason: "Payment not verified." });
      } else return conn.send({ t: "grindDenied", reason: "bad-mode" });
      const ticket = signTicket(username, wallet || "", m.mode);  // wallet may be empty for a wallet-less free play; mode picks the box table + pool
      if (ticket) {
        stats.recordPlay(username, wallet, { paid: m.mode === "paid", entryCT: 10 }); // leaderboard: game started
        // connection-origin analytics → where (esp. paying) players are, for future server zones
        geo.record({ username, wallet, mode: m.mode, paid: m.mode === "paid", ip: conn.ip, tz: m.tz, region: m.region, pings: m.pings });
      }
      return conn.send({ t: ticket ? "grindTicket" : "grindDenied", ticket, reason: ticket ? undefined : "loot-not-configured" });
    }

    lobby.handle(conn, m);
  });

  ws.on("close", () => lobby.remove(id));
  ws.on("error", () => lobby.remove(id));
});

server.listen(PORT, () => {
  console.log(`EF Moba lobby on :${PORT}  (game WS: ${GAME_WS || "— none, client AI fallback —"})`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("uncaughtException", (e) => console.error("uncaught", e));

export { lobby };
