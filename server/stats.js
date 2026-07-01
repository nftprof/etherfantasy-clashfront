// Leaderboard stats — per PG-username aggregates for the single "Champion Score" board.
// Money columns (spent/earned) mirror real on-chain flows: the lobby only records a paid
// entry after verifying it, and only records earnings it actually credits — so these equal
// EntryPaid/Loot on-chain. Game counts come from ticket-issue (played) and win-claim (won).
//
//   Champion Score = CT_earned + SPEND_WEIGHT * CT_spent      (default 0.5, "Balanced")
//
// Cheaters need no special handling: the audit caps their loot at 1 CT/game, so their
// `earned` stays tiny and they sink on their own — silently (matches the silent-denial design).
import fs from "fs";

const HOME = process.env.HOME || "";
const FILE = process.env.STATS_FILE || `${HOME}/.ef_moba_stats.json`;
const SPEND_WEIGHT = parseFloat(process.env.LB_SPEND_WEIGHT || "0.5");

let _s = null;
const load = () => { if (_s) return _s; try { _s = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { _s = {}; } return _s; };

// debounced write so high-frequency updates don't thrash the disk
let _dirty = false, _timer = null;
function persist() {
  _dirty = true;
  if (_timer) return;
  _timer = setTimeout(() => { _timer = null; if (_dirty) { _dirty = false; try { fs.writeFileSync(FILE, JSON.stringify(_s)); } catch (e) { console.error("stats save:", e.message); } } }, 1000);
}

function row(username) {
  const s = load(), k = String(username).toLowerCase();
  if (!s[k]) s[k] = { username: String(username), gp: 0, gw: 0, spent: 0, earned: 0, wallet: null, ts: 0 };
  return s[k];
}

// A game started (ticket issued). Paid grind adds the verified entry to CT spent.
export function recordPlay(username, wallet, { paid = false, entryCT = 10 } = {}) {
  if (!username) return;
  const r = row(username);
  r.gp += 1;
  if (wallet) r.wallet = wallet;
  if (paid) r.spent += Number(entryCT) || 0;
  r.ts = Date.now();
  persist();
}

// A win was claimed (the audit decided `amountCT`). One claim == one win.
export function recordWin(username, amountCT) {
  if (!username) return;
  const r = row(username);
  r.gw += 1;
  r.earned += Number(amountCT) || 0;
  r.ts = Date.now();
  persist();
}

// PvP settle (game server, later): credit both sides' spent/earned + win/loss.
export function recordPvp(username, wallet, { staked = 0, payout = 0, won = false } = {}) {
  if (!username) return;
  const r = row(username);
  r.gp += 1; if (won) r.gw += 1;
  if (wallet) r.wallet = wallet;
  r.spent += Number(staked) || 0;
  r.earned += Number(payout) || 0;
  r.ts = Date.now();
  persist();
}

export const spendWeight = () => SPEND_WEIGHT;

export function leaderboard(limit = 100) {
  const s = load();
  const rows = Object.values(s).map((r) => ({
    username: r.username,
    gp: r.gp, gw: r.gw, gl: Math.max(0, r.gp - r.gw),
    spent: r.spent, earned: r.earned,
    score: r.earned + SPEND_WEIGHT * r.spent,
  }));
  rows.sort((a, b) => b.score - a.score || b.earned - a.earned || b.gw - a.gw);
  return rows.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r, score: Math.round(r.score * 100) / 100 }));
}
