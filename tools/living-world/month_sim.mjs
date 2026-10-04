#!/usr/bin/env node
// D32 — a month at scale: N seeded agents in 8 alliances over every region's REAL holdable-POI counts
// (region-influence.json) for 28 days, through the real ladder functions (regionInfluence / regionBanner). Measures what
// the North Star cares about: does land change hands, does anyone hold everything, how concentrated are holdings.
// Agents: ~60 % play on a given day (one WHALE plays every day with 3× the fights); 2–6 fights a session, 80 % in the
// home region; target = a wild POI (win 75 %) or a rival's POI (win 45 %, the defender's edge); allies are never attacked.
// Land a player abandons for 7 days goes wild again (overgrowth canon for ABANDONED land; active holdings never rot,
// doc 06 §3). Outcomes are seeded PRNG, not the battle sim. Deterministic.
import fs from "node:fs";
import { fnv1a, mulberry32 } from "./seed_singles.mjs";
import { regionInfluence, regionBanner } from "./influence.mjs";
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SEED = arg("--seed", "cf-world-1"), N = +arg("--agents", 400), DAYS = 28, OUT = arg("--out", "docs/living-world/reports/MONTH.md"), JOUT = OUT.replace(/\.md$/, ".json");
const RI = JSON.parse(fs.readFileSync("data/living-world/region-influence.json", "utf8")).regions, ZONES = Object.keys(RI).sort();
const r = mulberry32(fnv1a(`${SEED}|month`)), pick = (a) => a[Math.floor(r() * a.length)];
const owner = Object.fromEntries(ZONES.map((z) => [z, new Array(RI[z].holdable).fill(-1)]));   // POI index → agent id (-1 wild)
const agents = Array.from({ length: N }, (_, i) => ({ id: i, alliance: i % 8, home: ZONES[Math.floor(r() * ZONES.length)], whale: i === 0, lastPlayed: 0 }));
const held = (a) => ZONES.reduce((n, z) => n + owner[z].filter((o) => o === a.id).length, 0);
const daily = [], bannerHist = Object.fromEntries(ZONES.map((z) => [z, []]));
let fights = 0, takesFromPlayers = 0, takesFromWild = 0;
for (let day = 0; day < DAYS; day++) {
  for (const a of agents) {
    if (!(a.whale || r() < 0.6)) continue;
    a.lastPlayed = day;
    const n = (2 + Math.floor(r() * 5)) * (a.whale ? 3 : 1);
    for (let f = 0; f < n; f++) {
      const z = r() < 0.8 ? a.home : pick(ZONES), O = owner[z], i = Math.floor(r() * O.length), o = O[i];
      if (o === a.id || (o >= 0 && agents[o].alliance === a.alliance)) continue;   // own or allied: not a target
      fights++;
      if (r() < (o < 0 ? 0.75 : 0.45)) { O[i] = a.id; if (o < 0) takesFromWild++; else takesFromPlayers++; }
    }
  }
  for (const a of agents) if (day - a.lastPlayed >= 7) for (const z of ZONES) owner[z] = owner[z].map((o) => (o === a.id ? -1 : o));   // abandoned → wild
  const banners = {};
  for (const z of ZONES) { const c = {}; for (const o of owner[z]) if (o >= 0) c[o] = (c[o] || 0) + 1; const b = regionBanner(c, RI[z].holdable); banners[z] = b == null ? null : +b; bannerHist[z].push(banners[z]); }
  daily.push({ day, banners });
}
const counts = agents.map(held).sort((x, y) => x - y), total = counts.reduce((a, b) => a + b, 0);
const gini = total ? +(counts.reduce((g, x, i) => g + (2 * (i + 1) - N - 1) * x, 0) / (N * total)).toFixed(3) : 0;
const bannerChanges = ZONES.reduce((n, z) => n + bannerHist[z].filter((b, i) => i && b !== bannerHist[z][i - 1]).length, 0);
const last = daily[DAYS - 1].banners, perPlayer = {}, perAlliance = {};
for (const z of ZONES) if (last[z] != null) { perPlayer[last[z]] = (perPlayer[last[z]] || 0) + 1; const al = agents[last[z]].alliance; perAlliance[al] = (perAlliance[al] || 0) + 1; }
const whale = agents[0], whaleHeld = held(whale), topHeld = counts[N - 1];
const unlocks = {}; for (const a of agents) { const best = Math.max(0, ...ZONES.map((z) => owner[z].filter((o) => o === a.id).length)); for (const u of regionInfluence(best).unlocks) unlocks[u] = (unlocks[u] || 0) + 1; }
const rep = { schema: "cf-living-world/month@1", seed: SEED, agents: N, days: DAYS, fights, takesFromWild, takesFromPlayers, heldAtEnd: total, wildAtEnd: ZONES.reduce((n, z) => n + owner[z].filter((o) => o < 0).length, 0), gini, topPlayerHeld: topHeld, whaleHeld, whaleSharePct: +((100 * whaleHeld) / Math.max(1, total)).toFixed(2), bannerChanges, regionsWithBanner: Object.values(last).filter((b) => b != null).length, maxRegionsOnePlayer: Math.max(0, ...Object.values(perPlayer)), maxRegionsOneAlliance: Math.max(0, ...Object.values(perAlliance)), playersWithUnlock: unlocks, bannersByDay: daily.map((d) => d.banners) };
fs.writeFileSync(JOUT, JSON.stringify(rep) + "\n");
const md = ["# A month at scale: who holds the world?", "",
  `\`tools/living-world/month_sim.mjs\`: ${N} agents in 8 alliances (one whale playing every day with 3× the fights) over the real holdable-POI counts of ${ZONES.length} regions (${RI && Object.values(RI).reduce((n, x) => n + x.holdable, 0).toLocaleString("en")} POIs), 28 days. Outcomes are seeded PRNG (75 % vs wild, 45 % vs a rival), not the battle sim.`, "",
  "| Measure | Value |", "|---|---|",
  `| Fights | ${fights.toLocaleString("en")} (${takesFromWild.toLocaleString("en")} wild POIs taken, ${takesFromPlayers.toLocaleString("en")} taken from rivals) |`,
  `| POIs held at day 28 | ${total.toLocaleString("en")} held, ${rep.wildAtEnd.toLocaleString("en")} still wild |`,
  `| Holdings Gini (0 = equal) | ${gini} |`,
  `| Top player / the whale | ${topHeld} / ${whaleHeld} POIs (${rep.whaleSharePct} % of all held) |`,
  `| Region banners changing hands over the month | ${bannerChanges} |`,
  `| Regions with a banner at day 28 | ${rep.regionsWithBanner} / ${ZONES.length} |`,
  `| Most regions bannered by one player / one alliance | ${rep.maxRegionsOnePlayer} / ${rep.maxRegionsOneAlliance} |`,
  `| Players reaching each region unlock | ${Object.entries(unlocks).map(([u, n]) => `${u} ${n}`).join(", ")} |`, ""].join("\n");
fs.writeFileSync(OUT, md);
console.log(md.split("\n").slice(4).join("\n"));
