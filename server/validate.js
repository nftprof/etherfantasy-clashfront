// Anti-cheat input validation (SERVER_PLAN §3). The client is a renderer that can
// only lie about its INPUTS — so we schema-check + rate-limit every message here,
// before it ever reaches the sim. Illegal/malformed inputs are dropped.
const ACTIONS = new Set(["move", "amove", "stop", "atk", "flash", "potion", "recall", "cast", "pet", "buy"]);
const num = (v) => typeof v === "number" && Number.isFinite(v);

export function validateInput(msg) {
  if (!msg || typeof msg !== "object") return null;
  if (!ACTIONS.has(msg.a)) return null;
  const out = { a: msg.a };
  if (["move", "amove", "flash", "cast"].includes(msg.a)) {
    if (!num(msg.x) || !num(msg.z)) return msg.a === "cast" ? { a: "cast", i: msg.i } : null;
    out.x = msg.x; out.z = msg.z;
  }
  if (msg.a === "atk") { if (!Number.isInteger(msg.uid)) return null; out.uid = msg.uid; }
  if (msg.a === "cast") { if (!Number.isInteger(msg.i)) return null; out.i = msg.i; }
  if (msg.a === "buy") { if (!Number.isInteger(msg.i)) return null; out.i = msg.i; }
  if (Number.isInteger(msg.seq)) out.seq = msg.seq; // client input sequence → echoed for reconciliation
  return out;
}

// Simple per-connection token-bucket rate limiter.
export function makeRateLimiter(perSec) {
  let tokens = perSec, last = 0;
  return function allow(nowMs) {
    if (!last) last = nowMs;
    tokens = Math.min(perSec, tokens + ((nowMs - last) / 1000) * perSec);
    last = nowMs;
    if (tokens < 1) return false;
    tokens -= 1; return true;
  };
}
