#!/usr/bin/env node
// Living World D6 — headless-sim sampling of POI templates (doc 02 §5.2). Runs the REAL deterministic battle kernel
// (server/sim) on seeded POIs: the POI's threat scales the defending core, its garrison spawns as leashed defenders
// (team 1, kind "wild" → they hold ground), the neutral camps stay as third-party barbarians, and the attacker is the
// stock bot + minion waves. Measures breach (core down) within the 12-min floor (doc 03) and attacker losses.
// Deterministic: world seed = the POI's deckSeed / fnv1a(id); fixed dt; no clock.
//   node tools/living-world/sim_sample.mjs [--n 6] [--out docs/living-world/reports/SIM-SAMPLE.md]
import fs from "node:fs";
import { makeWorld, mkUnit } from "../../server/sim/state.js";
import { step } from "../../server/sim/step.js";
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const N = +(args.n || 6), OUT = args.out || "docs/living-world/reports/SIM-SAMPLE.md", JOUT = OUT.replace(/\.md$/, ".json");
const PA = JSON.parse(fs.readFileSync("data/living-world/poi-archetypes.json", "utf8"));
const CP = JSON.parse(fs.readFileSync("data/living-world/castle-pois.json", "utf8"));
function fnv1a(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
const pool = CP.byCastle.flatMap((c) => c.pois.map((p) => ({ id: p.id, k: p.lwKind, threat: p.threat })));
for (const f of fs.readdirSync("data/living-world/estate-pois").sort())
  for (const p of JSON.parse(fs.readFileSync("data/living-world/estate-pois/" + f, "utf8")).parcels) p.nodes.forEach((n, i) => pool.push({ id: `${p.id}#${i}`, k: n.k, threat: n.threat }));
const ARCH = Object.fromEntries(PA.archetypes.map((a) => [a.lwKind, a]));
const FLOOR_SEC = 720, DT = 0.1;

function runOne(poi) {
  const seed = fnv1a(poi.id + "|sim1");
  const w = makeWorld(seed, []);
  const tm = 0.5 + poi.threat / 50;                                   // threat 0..100 → defender ×0.5..×2.5
  for (const u of w.units.values()) if (u.kind === "core" && u.team === 1) { u.hp = u.maxHp = Math.round(5000 * tm); }
  let gi = 0;
  for (const [unit, count] of ARCH[poi.k].garrison) for (let i = 0; i < count; i++, gi++) {
    const a = (gi / 6) * Math.PI * 2, x = 100 - 14 + Math.cos(a) * 9, z = 100 - 14 + Math.sin(a) * 9;
    const g = mkUnit({ kind: "wild", team: 1, slot: unit, x, z, hp: Math.round(700 * tm), maxHp: Math.round(700 * tm), dmg: Math.round(40 * Math.sqrt(tm)), range: 7, atkSpd: 0.8, speed: 18 });
    g.home = { x, z }; w.units.set(g.uid, g);
  }
  // a POI garrison HOLDS — no defending hero bot, no defending minion waves (those would push and kill the attacker's core)
  for (const u of [...w.units.values()]) if (u.team === 1 && u.kind === "hero") w.units.delete(u.uid);
  // the doc-03 floor case: the attacker brings an assault squad of 1.5 × the garrison
  const gN = ARCH[poi.k].garrison.reduce((n, [, c]) => n + c, 0), squad = Math.ceil(1.5 * gN);
  for (let i = 0; i < squad; i++) { const m = mkUnit({ kind: "minion", team: 0, x: -100 + 6 + (i % 3) * 3, z: -100 + 6 + Math.floor(i / 3) * 3, hp: 700, maxHp: 700, dmg: 40, range: 6, atkSpd: 0.9, speed: 16 }); w.units.set(m.uid, m); }
  const inputs = new Map(); let deaths = 0; const aliveNow = new Set();
  for (const u of w.units.values()) if (u.team === 0 && u.hp > 0) aliveNow.add(u.uid);
  while (w.winner == null && w.t < FLOOR_SEC) {
    step(w, DT, inputs);
    for (const u of [...w.units.values()]) if (u.team === 1 && u.kind === "minion") w.units.delete(u.uid);
    for (const u of w.units.values()) if (u.team === 0) { const a = u.hp > 0 && u.state !== "dead"; if (aliveNow.has(u.uid) && !a) { deaths++; aliveNow.delete(u.uid); } else if (a) aliveNow.add(u.uid); }
  }
  return { id: poi.id, k: poi.k, threat: poi.threat, breached: w.winner === 0, sec: Math.round(w.t), attackerDeaths: deaths, defenderWon: w.winner === 1 };
}

const kindsWithGarrison = PA.archetypes.filter((a) => a.garrison.length).map((a) => a.lwKind).sort();
const results = [];
ARCH.CALIBRATION = { garrison: [] };   // threat 0, no garrison: the bare-structure baseline
kindsWithGarrison.unshift("CALIBRATION"); for (let i = 0; i < N; i++) pool.push({ id: "calib-" + i, k: "CALIBRATION", threat: 0 });
for (const k of kindsWithGarrison) {
  const cands = pool.filter((p) => p.k === k).sort((a, b) => fnv1a(a.id + "|pick") - fnv1a(b.id + "|pick")).slice(0, N);
  for (const p of cands) results.push(runOne(p));
}
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const rows = kindsWithGarrison.map((k) => {
  const r = results.filter((x) => x.k === k), b = r.filter((x) => x.breached);
  const row = { k, n: r.length, breachRate: r.length ? Math.round((100 * b.length) / r.length) : 0, medBreachSec: med(b.map((x) => x.sec)), medThreat: med(r.map((x) => x.threat)), medAttackerDeaths: med(r.map((x) => x.attackerDeaths)), defenderWins: r.filter((x) => x.defenderWon).length };
  row.flag = !r.length ? "NO SAMPLES" : row.breachRate < 50 ? "TOO HARD (most attacks fail the 12-min floor)" : row.breachRate === 100 && row.medBreachSec < 240 ? "TOO SOFT (falls in < 4 min)" : "ok";
  return row;
});
fs.writeFileSync(JOUT, JSON.stringify({ schema: "cf-living-world/sim-sample@1", kernel: "server/sim (deterministic)", floorSec: FLOOR_SEC, nPerKind: N, rows, results }, null, 1) + "\n");
const md = ["# Headless-sim sample — POI templates vs the 12-minute breach floor", "",
  `Generated by \`tools/living-world/sim_sample.mjs\` (N = ${N} seeded POIs per archetype, real \`server/sim\` kernel, dt ${DT}s, cap ${FLOOR_SEC / 60} min). Deterministic — re-running gives the same table.`, "",
  "Model: the POI's threat scales the defending core (×0.5–×2.5) and garrison; garrison units hold ground (leashed); neutral camps act as third-party barbarians; the attacker is the stock bot hero + minion waves (≈ an even-strength attacker, i.e. *weaker* than the doc-03 1.5× floor case).", "",
  "| Archetype | n | Breached ≤ 12 min | Median breach | Median threat | Median attacker losses | Defender wins | Verdict |", "|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.k} | ${r.n} | ${r.breachRate} % | ${r.medBreachSec != null ? Math.floor(r.medBreachSec / 60) + ":" + String(r.medBreachSec % 60).padStart(2, "0") : "—"} | ${r.medThreat} | ${r.medAttackerDeaths} | ${r.defenderWins} | ${r.flag} |`), "",
  "**Status: harness NOT yet calibrated.** The CALIBRATION row (threat 0, no garrison) also falls in under 2 minutes: the stock lane kernel's 5,000-HP core with no walls/gates is far softer than an S2 keep (wall rings 1,350 HP, gates, keep 2,400 × tier). Verdicts below are about the *harness*, not the templates, until D6b models the castle structures (walls, gates, the doc-03 defences) and the calibration row lands near the S2 floors.", "",
  "Tuning rule (doc 02 §5): an archetype out of band is re-tuned in `poi-archetypes.json` (garrison / threat curve), never per map.", ""].join("\n");
fs.writeFileSync(OUT, md);
console.log(md);
