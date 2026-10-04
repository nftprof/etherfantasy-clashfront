#!/usr/bin/env node
// D23 — Guardian stationings (doc 04) as a rules engine + their GUARDIAN_CHALLENGE board rows (doc 05 §1, auto-posted).
//   canStation(ledger, req) → { ok, reason } enforcing guardians.json: a real GUARDIAN_PERCH; one Guardian per perch at
//     a time; the NFT's cooldown (F2 24 h / F3 72 h after the stationing ends); Form 3: one per CASTLE per 7 days;
//     duration ≤ stationHours (F2 24 h / F3 6 h).
//   station(ledger, req) → appends an accepted stationing (ticks: 1 tick = 1 min).
//   stationingsFor(seed, zone, day) → a deterministic synthetic week of requests through the rules (placeholder owners).
//   challengeRow(s, tick) → the auto GUARDIAN_CHALLENGE board row with the doc-04 wake banner text.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fnv1a, mulberry32 } from "./seed_singles.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
export const GU = rd("data/living-world/guardians.json");
const CP = rd("data/living-world/castle-pois.json"), CC = rd("data/living-world/castle-context.json");
const NAME = Object.fromEntries(CC.castles.map((c) => [c.id, c.name]));
export const PERCHES = Object.fromEntries(CP.byCastle.flatMap((c) => c.pois.filter((p) => p.lwKind === "GUARDIAN_PERCH").map((p) => [p.id, { castleId: c.castleId, zone: c.zone, kind: c.kind, at: p.at }])));
const H = 60;

export function canStation(ledger, req) {
  const P = PERCHES[req.perchId]; if (!P) return { ok: false, reason: "NOT_A_PERCH" };
  const F = GU.forms[String(req.form)]; if (!F) return { ok: false, reason: "NO_SUCH_FORM" };
  if (req.hours > F.stationHours || req.hours <= 0) return { ok: false, reason: "TOO_LONG" };
  const live = (s) => s.start <= req.start && req.start < s.end;
  if (ledger.some((s) => s.perchId === req.perchId && live(s))) return { ok: false, reason: "PERCH_TAKEN" };
  const last = ledger.filter((s) => s.nftId === req.nftId).reduce((m, s) => Math.max(m, s.end), -Infinity);
  if (req.start < last + F.cooldownHours * H) return { ok: false, reason: "NFT_COOLDOWN" };
  if (F.perCastleLimit.scope === "CASTLE") {
    const since = req.start - F.perCastleLimit.perDays * 1440;
    if (ledger.some((s) => s.form === req.form && PERCHES[s.perchId].castleId === P.castleId && s.start > since)) return { ok: false, reason: "ASCENDANT_WEEKLY_LIMIT" };
  }
  return { ok: true };
}
export function station(ledger, req) { const c = canStation(ledger, req); if (c.ok) ledger.push({ ...req, end: req.start + req.hours * H }); return c; }

// A synthetic week: each day, each perch in the zone gets a seeded chance of a request from one of a few owners' NFTs.
const SF = new Map();   // D35: memoised (pure in its arguments) — the board asks for the same week on every view
export function stationingsFor(seed, zone, days = 7) {
  const key = `${seed}|${zone}|${days}`; if (!SF.has(key)) SF.set(key, stationingsForUncached(seed, zone, days)); return SF.get(key);
}
function stationingsForUncached(seed, zone, days) {
  const ledger = [], tried = [], perches = Object.keys(PERCHES).filter((id) => PERCHES[id].zone === zone).sort();
  const nfts = Array.from({ length: 6 }, (_, i) => ({ nftId: `pet_SAMPLE_${zone}_${i}`, form: i < 2 ? 3 : 2, owner: `gov_SAMPLE_${i % 3}` }));
  for (let day = 0; day < days; day++) for (const perchId of perches) {
    const r = mulberry32(fnv1a(`${seed}|station|${day}|${perchId}`)); if (r() > 0.5) continue;
    const n = nfts[Math.floor(r() * nfts.length)], F = GU.forms[String(n.form)];
    const req = { perchId, ...n, start: day * 1440 + Math.floor(r() * 1200), hours: 1 + Math.floor(r() * F.stationHours) };
    tried.push({ ...req, ...station(ledger, req) });
  }
  return { ledger, tried };
}

const hm = (min) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} m`;
export function challengeRow(s, tick) {
  const P = PERCHES[s.perchId], F = GU.forms[String(s.form)], left = s.end - tick, place = NAME[P.castleId] || P.castleId;
  const banner = s.form === 3 ? `⚠ the Ascendant of ${place} stands for ${hm(left)}: 8 min of power from first contact, 3 Ward Stones` : `⚠ the Warden of ${place} stands for ${hm(left)}`;
  return { id: `gc|${s.perchId}|${s.start}`, src: "AUTO", kind: "GUARDIAN_CHALLENGE", at: s.perchId, postedAt: s.start, opens: s.start, closes: s.end, potCT: Math.round(F.feeCT * GU.kindMultiplier[P.kind] * GU.feeSplit.bountyEscrow * 100) / 100, form: s.form, banner };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf("--out"), out = i > 0 ? process.argv[i + 1] : path.join(ROOT, "data/living-world/stationings.sample.json");
  const zones = [...new Set(Object.values(PERCHES).map((p) => p.zone))].sort(), res = {}, reasons = {};
  for (const z of zones) { const { ledger, tried } = stationingsFor("cf-world-1", z); res[z] = { accepted: ledger.length, refused: tried.filter((t) => !t.ok).length, ledger }; for (const t of tried) if (!t.ok) reasons[t.reason] = (reasons[t.reason] || 0) + 1; }
  const acc = Object.values(res).reduce((n, r) => n + r.accepted, 0), ref = Object.values(res).reduce((n, r) => n + r.refused, 0);
  const noons = Array.from({ length: 7 }, (_, d) => d * 1440 + 720), active = (t) => res.BUS.ledger.filter((s) => s.start <= t && s.end > t);
  const busiest = noons.reduce((b, t) => (active(t).length > active(b).length ? t : b), noons[0]), sampleRows = active(busiest).map((s) => challengeRow(s, busiest));
  fs.writeFileSync(out, JSON.stringify({ schema: "cf-living-world/stationings-sample@1", note: "synthetic week, placeholder NFTs/owners; rules from guardians.json", accepted: acc, refused: ref, refusedBy: Object.fromEntries(Object.entries(reasons).sort()), busBusiestNoon: { tick: busiest, rows: sampleRows }, zones: res }) + "\n");
  console.log(`stationings: ${acc} accepted, ${ref} refused ${JSON.stringify(reasons)}; BUS busiest noon (day ${Math.floor(busiest / 1440) + 1}): ${sampleRows.length} challenges`);
  for (const r of sampleRows) console.log("  " + r.banner + `  (bounty ${r.potCT} CT)`);
}
