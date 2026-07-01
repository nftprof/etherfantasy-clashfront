// Single-player VIP gating + lifetime free-play quota + loot rolls.
// VIP tier comes from the PG VIP API (public read, keyed by wallet). Free-play quota by tier
// (lifetime) is tracked in a local JSON store. Loot is a server-side weighted roll, paid out of
// the contract's spPool via creditLoot.
//   ⚠ v1 quota is PER-BOX (JSON file). A player could get the free quota once per region; the
//     small extra loot drain is acceptable for v1 — centralize (shared DB / on-chain) later.
import fs from "fs";

const PG_BASE = process.env.PG_API_BASE || "https://api.account.pentagon.games";
const QUOTA = { 0: 0, 1: 1, 2: 5, 3: 25 };        // lifetime free loot-plays by VIP tier
const QFILE = process.env.MOBA_QUOTA_FILE || `${process.env.HOME || ""}/.ef_moba_quota.json`;

let _q = null;
function loadQ() { if (_q) return _q; try { _q = JSON.parse(fs.readFileSync(QFILE, "utf8")); } catch { _q = {}; } return _q; }
function saveQ() { try { fs.writeFileSync(QFILE, JSON.stringify(_q)); } catch (e) { console.error("quota save failed:", e.message); } }

// VIP tier + lifetime free-play quota are keyed by the PG USERNAME (the account), because the
// VIP tier (effective_tier = on-chain ⊕ Discord roles) belongs to the account, not one wallet.
// The wallet is only the CT payout destination (handled elsewhere).
const _cache = new Map(); // username -> { tier, t }
// Returns { tier, ok }. ok=false means the PG VIP API didn't answer (timeout/blip) — the caller
// must NOT treat that as "genuinely tier 0 / out of free plays" (would mislead a real VIP).
export async function vipTierEx(username, fresh) {
  const u = String(username || "").toLowerCase();
  const c = _cache.get(u);
  if (!fresh && c && Date.now() - c.t < 120000) return { tier: c.tier, ok: true }; // `fresh` bypasses cache (just upgraded VIP)
  let tier = 0, ok = false;
  try {
    const r = await fetch(`${PG_BASE}/user/vip_status?username=${encodeURIComponent(username)}`, { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    if (j && j.result && Number.isInteger(j.result.effective_tier)) tier = Math.max(0, Math.min(3, j.result.effective_tier));
    ok = true; // got a real response (even tier 0) → safe to cache
  } catch (e) { ok = false; } // timeout/network blip → DON'T cache 0; signal failure so the UI says "try again" not "you're out"
  if (ok) _cache.set(u, { tier, t: Date.now() });
  return { tier, ok };
}
export async function vipTier(username, fresh) { return (await vipTierEx(username, fresh)).tier; } // back-compat (match.js)

export const quotaFor = (tier) => QUOTA[tier] || 0;
export function freeRemaining(username, tier) {
  const used = loadQ()[String(username).toLowerCase()] || 0;
  return Math.max(0, quotaFor(tier) - used);
}
export function consumeFree(username) {
  const q = loadQ(), u = String(username).toLowerCase();
  q[u] = (q[u] || 0) + 1; saveQ(); return q[u];
}

// ---- tiered loot boxes (the gacha reveal) ----
// PAID play → full table, 1–100 CT (EV ≈ 5.7). FREE VIP play → capped table, 1–25 CT (EV ≈ 3.2).
// Probabilities sum to 1; amounts in whole CT. Cheats/flagged are forced to the Common box upstream.
export const PAID_BOXES = [
  { amount: 1,   p: 0.50, key: "common",    name: "Common Cache" },
  { amount: 5,   p: 0.30, key: "uncommon",  name: "Lucky Pouch" },
  { amount: 12,  p: 0.14, key: "rare",      name: "Rare Chest" },
  { amount: 20,  p: 0.05, key: "epic",      name: "Epic Vault" },
  { amount: 100, p: 0.01, key: "legendary", name: "Legendary Hoard" },
];
export const FREE_BOXES = [
  { amount: 1,  p: 0.55, key: "common",   name: "Common Cache" },
  { amount: 3,  p: 0.30, key: "uncommon", name: "Lucky Pouch" },
  { amount: 8,  p: 0.12, key: "rare",     name: "Rare Chest" },
  { amount: 25, p: 0.03, key: "epic",     name: "Epic Vault" },
];
function rollFrom(boxes) {
  let r = Math.random(), acc = 0;
  for (const b of boxes) { acc += b.p; if (r < acc) return { amount: b.amount, tier: b.key, name: b.name }; }
  const last = boxes[boxes.length - 1];
  return { amount: last.amount, tier: last.key, name: last.name };
}
export const rollPaidLoot = () => rollFrom(PAID_BOXES);
export const rollFreeLoot = () => rollFrom(FREE_BOXES);
// legacy 1/5 roll (kept for any old caller)
export function rollLoot() { return Math.random() < parseFloat(process.env.LOOT_HIGH_PCT || "0.30") ? 5 : 1; }
