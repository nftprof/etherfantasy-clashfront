#!/usr/bin/env node
// D17 — the world events calendar (doc 05 §4 "there's always something on the board"). calendar(seed, zone, day) is a
// pure function: the region's own events for one world day, from its POI counts and lanes, seeded per (day, zone, kind).
// Player-posted events (doc 05 §1) come on top. CLI: a calm day (0) and a storm-season day (21) for every region, with
// coverage stats (events per day, longest gap, empty 3-hour windows) → data/living-world/world-calendar.sample.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fnv1a, mulberry32 } from "./seed_singles.mjs";
import { LANES, laneClosed, inStormSeason } from "./ambient_traffic.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
export const WC = rd("data/living-world/world-calendar.json");

// Region POI counts + concrete Node locations (castle POIs and estate Nodes; singles add to the counts only).
export const REGIONS = (() => {
  const R = {}, reg = (z) => (R[z] ||= { counts: {}, nodes: {} }), add = (z, k, ref, n = 1) => { const r = reg(z); r.counts[k] = (r.counts[k] || 0) + n; if (ref) (r.nodes[k] ||= []).push(ref); };
  for (const c of rd("data/living-world/castle-pois.json").byCastle) for (const p of c.pois) add(c.zone, p.lwKind, p.id);
  for (const f of fs.readdirSync(path.join(ROOT, "data/living-world/estate-pois")).sort()) { const E = rd("data/living-world/estate-pois/" + f); for (const p of E.parcels) p.nodes.forEach((n, i) => add(E.zone, n.k, `${p.id}#${i}`)); }
  for (const [z, s] of Object.entries(rd("data/living-world/singles.summary.json").byZone)) for (const [k, n] of Object.entries(s.byKind)) add(z, k, null, n);
  const portZone = Object.fromEntries(LANES.ports.map((p) => [p.id, p.zone]));
  for (const l of LANES.lanes) if (l.mode === "SEA") { const r = reg(portZone[l.from]); (r.lanes ||= []).push(l); }
  return R;
})();

export function calendar(seed, zone, day) {
  const R = REGIONS[zone]; if (!R) return [];
  const ev = [], D = day * 1440, rng = (kind) => mulberry32(fnv1a(`${seed}|cal|${day}|${zone}|${kind}`));
  const at = (r, refs) => (refs && refs.length ? refs[Math.floor(r() * refs.length)] : `${zone}:single`);
  for (const [kind, K] of Object.entries(WC.kinds)) {
    const r = rng(kind);
    if (K.perDay && typeof K.perDay === "object") {
      const n = R.counts[K.from] || 0; if (!n) continue;
      const per = Math.min(K.perDay.max, Math.max(K.perDay.min, Math.ceil(n / K.perDay.per)));
      for (let i = 0; i < per; i++) ev.push({ kind, tick: D + Math.floor(((i + r()) / per) * 1440), at: at(r, R.nodes[K.from]) });   // stratified: one per slice of the day
    } else if (K.everyMin) {
      if (!(R.counts[K.from] || 0) || (K.onlyIfNo && R.counts[K.onlyIfNo])) continue;
      for (let m = 0; m < 1440; m += K.everyMin) ev.push({ kind, tick: D + Math.min(1439, m + Math.floor(r() * K.jitterMin)), at: at(r, R.nodes[K.from]) });
    } else if (kind === "KRAKEN_SIGHTING") {
      for (const l of R.lanes || []) if (l.krakenRisk && r() < l.krakenRisk * (inStormSeason(D + 720) ? K.stormSeasonMul : 1)) ev.push({ kind, tick: D + Math.floor(r() * 1440), at: l.id });
    } else if (kind === "STORM") {
      const shut = (R.lanes || []).filter((l) => laneClosed(seed, D + 720, l));
      if (shut.length) ev.push({ kind, tick: D, at: zone, lanes: shut.length });
    }
  }
  return ev.sort((a, b) => a.tick - b.tick || (a.kind < b.kind ? -1 : 1));
}
export function coverage(ev, day) {
  const W = WC.windowMin, t = ev.map((e) => e.tick - day * 1440).sort((a, b) => a - b);
  const empty = Array.from({ length: 1440 / W }, (_, i) => i).filter((i) => !t.some((m) => m >= i * W && m < (i + 1) * W)).length;
  const gaps = t.length ? [t[0], ...t.slice(1).map((m, i) => m - t[i]), 1440 - t[t.length - 1]] : [1440];
  return { events: ev.length, longestGapMin: Math.max(...gaps), emptyWindows: empty };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf("--out"), out = i > 0 ? process.argv[i + 1] : path.join(ROOT, "data/living-world/world-calendar.sample.json"), seed = "cf-world-1";
  const days = {};
  for (const day of [0, 21]) days[day] = Object.fromEntries(Object.keys(REGIONS).sort().map((z) => { const ev = calendar(seed, z, day); return [z, { ...coverage(ev, day), events: ev }]; }));
  const stats = Object.fromEntries(Object.entries(days).map(([d, R]) => [d, Object.fromEntries(Object.entries(R).map(([z, r]) => [z, { events: r.events.length, longestGapMin: r.longestGapMin, emptyWindows: r.emptyWindows }]))]));
  fs.writeFileSync(out, JSON.stringify({ schema: "cf-living-world/world-calendar-sample@1", seed, stats, days }) + "\n");
  for (const [d, R] of Object.entries(stats)) console.log(`day ${d}: ` + Object.entries(R).map(([z, r]) => `${z} ${r.events}ev/gap${r.longestGapMin}/empty${r.emptyWindows}`).join("  "));
}
