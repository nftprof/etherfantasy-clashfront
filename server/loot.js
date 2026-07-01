// Audit-gated single-player loot. The local game submits a result; we decide the reward:
//   • clean      → normal roll (1 or 5 CT)
//   • impossible → SILENTLY give the minimum (1 CT), log it, and flag the account
//   • flagged    → permanently 1 CT (silent) until a manual review clears the flag
// Detection is deliberately CONSERVATIVE — only values that CANNOT occur in legit play — so
// honest players are never accidentally flagged. House edge + the 5-CT cap bound any miss.
import fs from "fs";
import crypto from "crypto";
import { rollPaidLoot, rollFreeLoot } from "./vip.js";

const HOME = process.env.HOME || "";
const SECRET = process.env.LOOT_SECRET || (() => { try { return fs.readFileSync(`${HOME}/.ef_loot_secret`, "utf8").trim(); } catch { return ""; } })();
const FLAGS_FILE = process.env.LOOT_FLAGS_FILE || `${HOME}/.ef_moba_flags.json`;
const AUDIT_FILE = process.env.LOOT_AUDIT_FILE || `${HOME}/.ef_moba_audit.log`;
const MIN_LOOT = 1;
const TICKET_TTL = parseInt(process.env.LOOT_TICKET_TTL_MS || "1800000", 10); // 30 min

// ---- signed single-use loot ticket (lobby issues, game server verifies) ----
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const hmac = (s) => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
export function signTicket(username, wallet, mode) {
  if (!SECRET) return null;
  const body = b64({ u: username, w: wallet, m: mode === "paid" ? "paid" : "free", exp: Date.now() + TICKET_TTL, n: crypto.randomBytes(8).toString("hex") });
  return body + "." + hmac(body);
}
export function verifyTicket(tok) {
  if (!SECRET || typeof tok !== "string" || !tok.includes(".")) return null;
  const [body, sig] = tok.split(".");
  const good = hmac(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  let p; try { p = JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return null; }
  return (p && p.exp > Date.now()) ? { username: p.u, wallet: p.w, mode: p.m === "paid" ? "paid" : "free", nonce: p.n } : null;
}

// ---- single-use ticket nonces (replay guard; in-memory — tickets expire in 30min anyway) ----
const _usedNonces = new Set();
export function consumeNonce(n) { if (!n || _usedNonces.has(n)) return false; _usedNonces.add(n); return true; }

// ---- flag store (per account/username) ----
let _flags = null;
const loadFlags = () => { if (_flags) return _flags; try { _flags = JSON.parse(fs.readFileSync(FLAGS_FILE, "utf8")); } catch { _flags = {}; } return _flags; };
const saveFlags = () => { try { fs.writeFileSync(FLAGS_FILE, JSON.stringify(_flags)); } catch (e) { console.error("flags save:", e.message); } };
export const isFlagged = (u) => !!loadFlags()[String(u).toLowerCase()];
export function flagUser(u, reason) {
  const f = loadFlags(), k = String(u).toLowerCase();
  if (!f[k]) { f[k] = { reason, ts: Date.now() }; saveFlags(); }
}
function logAudit(entry) { try { fs.appendFileSync(AUDIT_FILE, JSON.stringify({ ...entry, ts: Date.now() }) + "\n"); } catch (e) { console.error("audit log:", e.message); } }

// ---- conservative "impossible result" detector (no false positives) ----
const MAX_DPS = 4000;     // generous ceiling; real hero+items can't sustain this
const WIN_FLOOR_SEC = 20; // a vs-AI win genuinely can't happen faster than this
export function suspicious(r) {
  if (!r || typeof r !== "object") return { bad: true, reason: "no-result" };
  const n = (x) => typeof x === "number" && Number.isFinite(x);
  if (!r.win) return { bad: true, reason: "claim-without-win" };
  if (!n(r.durationSec) || r.durationSec < WIN_FLOOR_SEC) return { bad: true, reason: "win-too-fast" };
  // HP ratio only when maxHp is a real positive number — a missing/zero maxHp is not a cheat signal.
  if (n(r.finalHp) && r.finalHp < 0) return { bad: true, reason: "impossible-hp" };
  if (n(r.finalHp) && n(r.maxHp) && r.maxHp > 0 && r.finalHp > r.maxHp * 1.05) return { bad: true, reason: "impossible-hp" };
  if (n(r.dmgDealt) && (r.dmgDealt < 0 || r.dmgDealt > r.durationSec * MAX_DPS)) return { bad: true, reason: "impossible-dmg" };
  if (n(r.kills) && (r.kills < 0 || r.kills > 100)) return { bad: true, reason: "impossible-kills" };
  if (n(r.cs) && (r.cs < 0 || r.cs > 2000)) return { bad: true, reason: "impossible-cs" };
  return { bad: false };
}

// ---- the reward decision (silent: caller credits `amount`; `mode` picks the box table) ----
export function decideReward(username, result, mode) {
  const flagged = isFlagged(username);
  const s = suspicious(result);
  if (s.bad && !flagged) flagUser(username, s.reason);          // first offense → flag forever (until manual review)
  if (s.bad || flagged) {
    logAudit({ username, flagged, reason: s.reason || "flagged-account", result });
    return { amount: MIN_LOOT, tier: "common", name: "Common Cache", suspicious: s.bad, flagged };  // silently minimal box
  }
  const roll = mode === "paid" ? rollPaidLoot() : rollFreeLoot();
  return { amount: roll.amount, tier: roll.tier, name: roll.name, suspicious: false, flagged: false };
}

// v3: the CONTRACT rolls the amount; the keeper only needs the cheat verdict.
// Returns { cheat } — flags + audit-logs first offenders, stays silent (caller pays the floor box).
export function auditWin(username, result) {
  const flagged = isFlagged(username);
  const s = suspicious(result);
  if (s.bad && !flagged) flagUser(username, s.reason);
  if (s.bad || flagged) logAudit({ username, flagged, reason: s.reason || "flagged-account", result });
  return { cheat: s.bad || flagged };
}
