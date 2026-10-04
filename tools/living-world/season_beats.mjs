#!/usr/bin/env node
// D29 — the weekly beats of doc 06 §3 on one 28-day cycle (the storm cycle of doc 07 §4c). Per region:
//   STORM_FRONT     day 21: storm season opens (regions with sea lanes only; the 7-day season itself is ambient)
//   THREAT_PEAK     one day per cycle: the region's threat cycle crests (a WARLORD raid on the board, doc 01 events)
//   LULL            the 2 days after THREAT_PEAK: calm (no barbarian raids, as for a cleared camp)
//   ASCENSION_NIGHT one day per week: the region's featured Form 3 challenge (doc 04; the 1-per-castle-per-week limit)
// Constraints, solved deterministically (seeded order, first fit): a region's BIG beats (STORM_FRONT, THREAT_PEAK,
// ASCENSION_NIGHT) never share a day or sit on adjacent days (escalate, then release), and nothing big lands in a LULL; at most 2 regions crest on the
// same day (the world feed always has a peak somewhere, never everywhere). beats(seed, cycle) is pure.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fnv1a, mulberry32 } from "./seed_singles.mjs";
import { REGIONS } from "./world_calendar.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CYCLE = { days: 28, stormFrontDay: 21, lullDays: 2, maxPeaksPerDay: 2, big: ["STORM_FRONT", "THREAT_PEAK", "ASCENSION_NIGHT"] };
const PERCH_ZONES = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, "data/living-world/castle-pois.json"), "utf8")).byCastle.filter((c) => c.pois.some((p) => p.lwKind === "GUARDIAN_PERCH")).map((c) => c.zone));

export function beats(seed, cycle = 0) {
  const zones = Object.keys(REGIONS).filter((z) => Object.keys(REGIONS[z].nodes).length).sort();
  const order = zones.slice().sort((a, b) => fnv1a(`${seed}|${cycle}|order|${a}`) - fnv1a(`${seed}|${cycle}|order|${b}`));
  const peaksOn = {}, out = {};
  for (const z of order) {
    const r = mulberry32(fnv1a(`${seed}|${cycle}|beats|${z}`)), B = [], busy = new Set(), big = new Set(), nearBig = (d) => big.has(d - 1) || big.has(d + 1);
    if ((REGIONS[z].lanes || []).length) { B.push({ day: CYCLE.stormFrontDay, beat: "STORM_FRONT" }); busy.add(CYCLE.stormFrontDay); big.add(CYCLE.stormFrontDay); }
    const start = Math.floor(r() * CYCLE.days);
    for (let k = 0; k < CYCLE.days; k++) {   // first fit from a seeded start: a free day, under the per-day peak cap, whose lull is clear too
      const d = (start + k) % CYCLE.days, lull = Array.from({ length: CYCLE.lullDays }, (_, i) => d + 1 + i).filter((x) => x < CYCLE.days);
      if (busy.has(d) || nearBig(d) || (peaksOn[d] || 0) >= CYCLE.maxPeaksPerDay || lull.some((x) => busy.has(x) || big.has(x + 1))) continue;
      B.push({ day: d, beat: "THREAT_PEAK" }); busy.add(d); big.add(d); peaksOn[d] = (peaksOn[d] || 0) + 1;
      for (const x of lull) { B.push({ day: x, beat: "LULL" }); busy.add(x); }
      break;
    }
    if (PERCH_ZONES.has(z)) for (let w = 0; w < CYCLE.days / 7; w++) {
      const s = Math.floor(r() * 7);
      for (let k = 0; k < 7; k++) { const d = w * 7 + ((s + k) % 7); if (!busy.has(d) && !nearBig(d)) { B.push({ day: d, beat: "ASCENSION_NIGHT" }); busy.add(d); big.add(d); break; } }
    }
    out[z] = B.sort((a, b) => a.day - b.day || (a.beat < b.beat ? -1 : 1));
  }
  return Object.fromEntries(Object.keys(out).sort().map((z) => [z, out[z]]));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf("--out"), out = i > 0 ? process.argv[i + 1] : path.join(ROOT, "data/living-world/season-beats.json");
  const cycles = { 0: beats("cf-world-1", 0), 1: beats("cf-world-1", 1) };
  fs.writeFileSync(out, JSON.stringify({ schema: "cf-living-world/season-beats@1", cycle: CYCLE, cycles }, null, 1) + "\n");
  const c0 = cycles[0], grid = Object.entries(c0).map(([z, B]) => `${z.padEnd(4)} ${Array.from({ length: 28 }, (_, d) => { const b = B.find((x) => x.day === d); return b ? { STORM_FRONT: "S", THREAT_PEAK: "P", LULL: "·", ASCENSION_NIGHT: "A" }[b.beat] : "_"; }).join("")}`);
  console.log("cycle 0 (S storm front, P threat peak, · lull, A ascension night):\n" + grid.join("\n"));
}
