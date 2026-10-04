#!/usr/bin/env node
// D16 — the region event board (doc 05 §2.2: one list per region; filter by distance, start time, pot, type; pings near
// your holdings). boardAt(seed, zone, tick, view) is a pure function over:
//   · the world calendar (D17): it is seeded, so the board shows it as a forecast boardLeadMin (6 h) ahead, and
//   · player-posted events (doc 05 §1): a deterministic synthetic set here (postsFor); live posts come from the server, and
//   · GUARDIAN_CHALLENGE auto-posts for every standing Guardian (D23, stationings.mjs; synthetic week here).
// It returns { live, upcoming } with each row's distance from the viewer, a ping flag (≤ pingU from a viewer holding),
// and doc-05 notice compliance (a player post opens ≥ minNoticeSec after it was posted; airdrops 60 s).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fnv1a, mulberry32 } from "./seed_singles.mjs";
import { calendar } from "./world_calendar.mjs";
import { stationingsFor, challengeRow } from "./stationings.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const PA = rd("data/living-world/poi-archetypes.json"), PE = rd("data/living-world/player-events.json");
export const BOARD = { boardLeadMin: 360, horizonMin: 360, pingU: 30, worldDurMin: { STORM: 1440 } };

// Node id → { zone, at } for castle POIs and estate Nodes (calendar and posts reference these ids)
export const NODES = (() => {
  const N = {};
  for (const c of rd("data/living-world/castle-pois.json").byCastle) for (const p of c.pois) N[p.id] = { zone: c.zone, at: p.at, k: p.lwKind };
  for (const f of fs.readdirSync(path.join(ROOT, "data/living-world/estate-pois")).sort()) { const E = rd("data/living-world/estate-pois/" + f); for (const p of E.parcels) p.nodes.forEach((n, i) => (N[`${p.id}#${i}`] = { zone: E.zone, at: n.at, k: n.k })); }
  return N;
})();
const KZ = new Map();   // D35: memoised (pure) — the full Node scan ran 5× per board view
const byKindInZone = (zone, k) => { const key = zone + "|" + k; if (!KZ.has(key)) KZ.set(key, Object.entries(NODES).filter(([, n]) => n.zone === zone && n.k === k).map(([id]) => id).sort()); return KZ.get(key); };

// Synthetic player posts for one region-day (placeholder posters; the shapes and notice rules are doc 05's).
export function postsFor(seed, zone, day) {
  const r = mulberry32(fnv1a(`${seed}|posts|${day}|${zone}`)), out = [];
  const anchor = { SIEGE_ME: "GUARDIAN_PERCH", BOUNTY: "WILD_LAIR", CARAVAN_RUN: "CARAVAN_WAYPOINT", SPONSORED_AIRDROP: "AIRDROP_ZONE", WARBAND_CALL: "WAR_CAMP" };
  const n = 5 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) {
    const K = PE.kinds.filter((k) => !k.auto)[Math.floor(r() * 5)], ids = byKindInZone(zone, anchor[K.pevKind]); if (!ids.length) continue;
    const notice = K.noticeOverride != null ? K.noticeOverride / 60 : PE.rules.minNoticeSec / 60 + Math.floor(r() * 120);   // minutes
    const postedAt = day * 1440 + Math.floor(r() * 1300), opens = postedAt + Math.ceil(notice);
    const durMin = K.pevKind === "SPONSORED_AIRDROP" ? K.contestSec / 60 : K.pevKind === "WARBAND_CALL" ? K.musterMin[0] + Math.floor(r() * (K.musterMin[1] - K.musterMin[0])) : 60 * Math.max(1, K.windowH[0] + Math.floor(r() * (K.windowH[1] - K.windowH[0])));
    out.push({ id: `${zone}|${day}|post${i}`, src: "PLAYER", kind: K.pevKind, at: ids[Math.floor(r() * ids.length)], postedAt, opens, closes: opens + durMin, potCT: K.pevKind === "WARBAND_CALL" ? 0 : 5 + Math.floor(r() * 150) });
  }
  return out;
}
const worldRows = (seed, zone, day) => calendar(seed, zone, day).map((e, i) => {
  const dur = BOARD.worldDurMin[e.kind] ?? Math.max(1, Math.ceil(((PA.events[e.kind] || {}).durSec || 60) / 60));
  return { id: `${zone}|${day}|w${i}`, src: "WORLD", kind: e.kind, at: e.at, postedAt: e.tick - BOARD.boardLeadMin, opens: e.tick, closes: e.tick + dur, potCT: 0 };
});

export function boardAt(seed, zone, tick, view = {}) {
  const day = Math.floor(tick / 1440), rows = [];
  for (const st of stationingsFor(seed, zone, day + 2).ledger) if (st.start <= tick && st.end > tick) rows.push(challengeRow(st, tick));
  for (const d of [day - 1, day, day + 1]) if (d >= 0) rows.push(...worldRows(seed, zone, d), ...postsFor(seed, zone, d));
  const me = view.at || null, holds = view.holdings || [];
  const dist = (id) => { const n = NODES[id]; return n && me ? Math.round(Math.hypot(n.at[0] - me[0], n.at[1] - me[1]) * 10) / 10 : null; };
  const ping = (id) => { const n = NODES[id]; return !!n && holds.some((h) => Math.hypot(n.at[0] - h[0], n.at[1] - h[1]) <= BOARD.pingU); };
  const vis = rows.filter((e) => e.postedAt <= tick && e.closes > tick && e.opens <= tick + BOARD.horizonMin)
    .filter((e) => !view.kinds || view.kinds.includes(e.kind)).filter((e) => (e.potCT || 0) >= (view.minPot || 0))
    .map((e) => ({ ...e, state: e.opens <= tick ? "LIVE" : "UPCOMING", inMin: Math.max(0, e.opens - tick), distU: dist(e.at), ping: ping(e.at) }));
  const key = { START: (a, b) => a.opens - b.opens, DISTANCE: (a, b) => (a.distU ?? 1e9) - (b.distU ?? 1e9), POT: (a, b) => b.potCT - a.potCT, TYPE: (a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) }[view.sort || "START"];
  const sorted = vis.sort((a, b) => b.ping - a.ping || key(a, b) || (a.id < b.id ? -1 : 1));   // pings first, then the chosen sort
  return { zone, tick, live: sorted.filter((e) => e.state === "LIVE"), upcoming: sorted.filter((e) => e.state === "UPCOMING") };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf("--out"), out = i > 0 ? process.argv[i + 1] : path.join(ROOT, "data/living-world/event-board.sample.json");
  const CC = rd("data/living-world/castle-context.json"), home = CC.castles.find((c) => c.id === "BUS-CASTLE-CAPEMEET");
  const view = { at: home.at, holdings: [home.at] }, tick = 12 * 60;   // noon of day 0, viewed from Capemeet Citadel
  const boards = { BY_START: boardAt("cf-world-1", "BUS", tick, view), BY_DISTANCE: boardAt("cf-world-1", "BUS", tick, { ...view, sort: "DISTANCE" }), POT_10_PLUS: boardAt("cf-world-1", "BUS", tick, { ...view, sort: "POT", minPot: 10 }) };
  fs.writeFileSync(out, JSON.stringify({ schema: "cf-living-world/event-board-sample@1", note: "BUS at noon of day 0, viewer at Capemeet Citadel; world calendar + synthetic player posts", params: BOARD, boards }, null, 1) + "\n");
  const b = boards.BY_START; console.log(`event-board BUS@noon: ${b.live.length} live, ${b.upcoming.length} upcoming (next 6 h), ${[...b.live, ...b.upcoming].filter((e) => e.ping).length} pinged near Capemeet`);
  for (const e of [...b.live, ...b.upcoming].slice(0, 12)) console.log(`  ${e.ping ? "🔔" : "  "} ${e.state.padEnd(8)} ${e.kind.padEnd(18)} ${e.src.padEnd(6)} in ${String(e.inMin).padStart(3)} min  ${e.distU ?? "—"} u  pot ${e.potCT}`);
}
