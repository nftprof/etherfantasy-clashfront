// Connection-origin analytics — so we can see WHERE players (especially CT payers) connect from
// and decide where to add future server zones. One JSONL line per grind ticket issued.
//   { ts, username, wallet, mode, paid, ip, tz, region, pings }
// `tz` (browser IANA timezone, e.g. "America/Toronto") + `pings` (RTT to each existing zone) are the
// strongest "where to add a zone" signals; `ip` is kept for precise offline geo. summary() never
// returns raw IPs. NOTE: IP is PII — disclose collection in the privacy policy.
import fs from "fs";

const HOME = process.env.HOME || "";
const FILE = process.env.GEO_FILE || `${HOME}/.ef_moba_geo.jsonl`;

export function record(e) {
  try { fs.appendFileSync(FILE, JSON.stringify({ ts: Date.now(), ...e }) + "\n"); }
  catch (err) { console.error("geo record:", err.message); }
}

// Aggregate demand by timezone and selected region, split paid vs free. No raw IPs in the output.
// `underserved` = plays whose BEST ping to any existing zone is high → the strongest "add a zone" signal.
const BAD_PING = parseInt(process.env.GEO_BAD_PING_MS || "160", 10);
const pingMin = (p) => { if (!p || typeof p !== "object") return null; const v = Object.values(p).filter((x) => typeof x === "number" && x >= 0); return v.length ? Math.min(...v) : null; };
export function summary(limit = 50) {
  let lines = [];
  try { lines = fs.readFileSync(FILE, "utf8").trim().split("\n").filter(Boolean); } catch { return { total: 0, paid: 0, byTz: [], byRegion: [], underserved: { plays: 0, paid: 0 }, badPingMs: BAD_PING }; }
  const tz = {}, region = {}; let total = 0, paid = 0; const under = { plays: 0, paid: 0 };
  const bump = (o, k, isPaid) => { const v = o[k] || (o[k] = { n: 0, paid: 0 }); v.n++; if (isPaid) v.paid++; };
  for (const ln of lines) {
    let r; try { r = JSON.parse(ln); } catch { continue; }
    total++; if (r.paid) paid++;
    bump(tz, r.tz || "unknown", r.paid);
    bump(region, r.region || "unknown", r.paid);
    const best = pingMin(r.pings);
    if (typeof best === "number" && best > BAD_PING) { under.plays++; if (r.paid) under.paid++; }
  }
  const top = (o) => Object.entries(o).map(([k, v]) => ({ k, ...v })).sort((a, b) => b.paid - a.paid || b.n - a.n).slice(0, limit);
  return { total, paid, byTz: top(tz), byRegion: top(region), underserved: under, badPingMs: BAD_PING };
}
