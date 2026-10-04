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
const SQUAD_MUL = +(args.squadMul || 1.5), ONLY = args.only || null, DEF_MUL = +(args.defMul || 3);   // DEF_MUL: structure-HP calibration (D6b sweep: ×3 → a bare threat-50 castle breaches at ~9 min, mid 6–12 band)
const N = +(args.n || 6), OUT = args.out || "docs/living-world/reports/SIM-SAMPLE.md", JOUT = OUT.replace(/\.md$/, ".json");
const PA = JSON.parse(fs.readFileSync("data/living-world/poi-archetypes.json", "utf8"));
const CP = JSON.parse(fs.readFileSync("data/living-world/castle-pois.json", "utf8"));
function fnv1a(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
const pool = CP.byCastle.flatMap((c) => c.pois.map((p) => ({ id: p.id, k: p.lwKind, threat: p.threat })));
for (const f of fs.readdirSync("data/living-world/estate-pois").sort())
  for (const p of JSON.parse(fs.readFileSync("data/living-world/estate-pois/" + f, "utf8")).parcels) p.nodes.forEach((n, i) => pool.push({ id: `${p.id}#${i}`, k: n.k, threat: n.threat }));
const ARCH = Object.fromEntries(PA.archetypes.map((a) => [a.lwKind, a]));
const GU = JSON.parse(fs.readFileSync("data/living-world/guardians.json", "utf8")), DF = JSON.parse(fs.readFileSync("data/living-world/defences.json", "utf8"));
const FLOOR_SEC = 720, GUARDIAN_CAP_SEC = 1500, DT = 0.1, G_HP = args.gHp ? +args.gHp : null;

function runOne(poi, scen = "BASE") {
  const seed = fnv1a(poi.id + "|sim1");
  const w = makeWorld(seed, []);
  const tm = 0.5 + poi.threat / 50;                                   // threat 0..100 → defender ×0.5..×2.5
  // S2 CASTLE STRUCTURES (D6b calibration): the stock lane core is replaced by an S2 keep — 2,400 × tier HP — inside a
  // ring of 8 walls (1,350 HP) with 2 gates (1,150 HP) and 2 castle towers (2,350 HP, shooting). Attackers fight the
  // NEAREST enemy, so the ring takes the first hits (a gate-less approximation of the wall-walk).
  const tier = poi.tier || 1, K = { x: 86, z: 86 }, rating = scen === "DEFENDED" ? DF.rating.max : 1, sm = tm * DEF_MUL * rating;   // DEFENDED = fully upgraded (doc 03 cap ×1.6)
  for (const u of [...w.units.values()]) if (u.team === 1 && (u.kind === "core" || u.kind === "tower")) w.units.delete(u.uid);
  const keep = mkUnit({ kind: "core", team: 1, x: K.x, z: K.z, hp: Math.round(2400 * tier * sm), maxHp: Math.round(2400 * tier * sm), dmg: 0, range: 0, speed: 0 }); w.units.set(keep.uid, keep);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI * 1.25, gate = i === 0 || i === 5, x = K.x + Math.cos(a) * 16, z = K.z + Math.sin(a) * 16;
    const hp = Math.round((gate ? 1150 : 1350) * sm);
    const st = mkUnit({ kind: "wall", team: 1, x, z, hp, maxHp: hp, dmg: 0, range: 0, atkSpd: 1, speed: 0 });   // walls block, they don't shield the keep (only towers do) st.slot = gate ? "GATE" : "WALL"; w.units.set(st.uid, st);
  }
  for (const [dx, dz] of [[-15, -5], [-5, -15]]) { const hp = Math.round(2350 * sm); const t = mkUnit({ kind: "tower", team: 1, x: K.x + dx, z: K.z + dz, hp, maxHp: hp, dmg: 95, range: 24, atkSpd: 0.8, speed: 0 }); t.slot = "CASTLE_TOWER"; w.units.set(t.uid, t); }
  let gi = 0;
  for (const [unit, count] of ARCH[poi.k].garrison) for (let i = 0; i < count; i++, gi++) {
    const a = (gi / 6) * Math.PI * 2, x = K.x + Math.cos(a) * 9, z = K.z + Math.sin(a) * 9;   // garrison inside the walls
    const g = mkUnit({ kind: "wild", team: 1, slot: unit, x, z, hp: Math.round(700 * tm), maxHp: Math.round(700 * tm), dmg: Math.round(40 * Math.sqrt(tm)), range: 7, atkSpd: 0.8, speed: 18 });
    g.home = { x, z }; w.units.set(g.uid, g);
  }
  // a POI garrison HOLDS — no defending hero bot, no defending minion waves (those would push and kill the attacker's core)
  for (const u of [...w.units.values()]) if (u.team === 1 && u.kind === "hero") w.units.delete(u.uid);
  // the doc-03 floor case: the attacker brings an assault squad of 1.5 × the garrison
  const gN = ARCH[poi.k].garrison.reduce((n, [, c]) => n + c, 0), squad = Math.ceil(SQUAD_MUL * Math.max(gN, 4) * rating);   // floor case: 1.5 × the DEFENCE-WEIGHTED garrison   // ≥ 4 so a bare castle still faces the floor-case squad
  for (let i = 0; i < squad; i++) {
    const siege = i % 3 === 2;   // a third of the floor-case squad is canon SIEGE (×6 vs structures, fragile)
    const m = mkUnit({ kind: "minion", team: 0, x: -100 + 6 + (i % 3) * 3, z: -100 + 6 + Math.floor(i / 3) * 3, hp: siege ? 400 : 700, maxHp: siege ? 400 : 700, dmg: siege ? 30 : 40, range: siege ? 9 : 6, atkSpd: siege ? 0.5 : 0.9, speed: siege ? 11 : 16 });
    if (siege) { m.structMul = 6; m.slot = "SIEGE"; } w.units.set(m.uid, m); }
  // doc 04 Guardians on the perch (the keep): Form 2 Warden / Form 3 Ascendant, numbers from guardians.json (HP on the harness scale)
  let G = null; const F = scen === "F2" ? GU.forms["2"] : scen === "F3" ? GU.forms["3"] : null;
  if (F) { const hp = Math.round((G_HP || F.battleHp) * DEF_MUL); G = mkUnit({ kind: "wild", team: 1, slot: "GUARDIAN_F" + scen[1], x: K.x - 7, z: K.z - 7, hp, maxHp: hp, dmg: 300, range: 20, atkSpd: 1 / F.bombard.everySec, speed: 10 });
    G.home = { x: K.x - 7, z: K.z - 7 }; G.shieldsCore = true; if (F.ascended) G.dmgTakenMul = F.ascended.damageTakenMul; w.units.set(G.uid, G); }   // doc 04 rule: the keep is shielded while the Guardian stands; it stands in front of the keep
  let gKoSec = null, tired = false, wakeT = null;   // doc 04 (revised by this sample): the Ascension clock starts at FIRST CONTACT, not battle start
  const inputs = new Map(); let deaths = 0; const aliveNow = new Set();
  for (const u of w.units.values()) if (u.team === 0 && u.hp > 0) aliveNow.add(u.uid);
  const cap = F ? GUARDIAN_CAP_SEC : FLOOR_SEC;   // guardian scenarios run to 20 min so the tired / KO phase is visible
  while (w.winner == null && w.t < cap) {
    step(w, DT, inputs);
    for (const u of [...w.units.values()]) if (u.team === 1 && u.kind === "minion") w.units.delete(u.uid);
    if (G && wakeT == null && G.hp < G.maxHp) wakeT = w.t;
    if (G && F.ascended && !tired && wakeT != null && w.t - wakeT >= F.ascended.windowSec) { tired = true; G.dmgTakenMul = 1; G.hp = Math.min(G.hp, Math.round(G.maxHp * F.ascended.tiredHpPct / 100)); }   // "the Ascendant tires"
    if (G && gKoSec == null && !(G.hp > 0)) gKoSec = Math.round(w.t);
    for (const u of w.units.values()) if (u.team === 0) { const a = u.hp > 0 && u.state !== "dead"; if (aliveNow.has(u.uid) && !a) { deaths++; aliveNow.delete(u.uid); } else if (a) aliveNow.add(u.uid); }
  }
  const left = (slot) => [...w.units.values()].filter((u) => u.team === 1 && u.slot === slot && u.hp > 0).length;
  return { id: poi.id, k: poi.k, threat: poi.threat, breached: w.winner === 0, sec: Math.round(w.t), attackerDeaths: deaths, defenderWon: w.winner === 1,
    left: { walls: left("WALL"), gates: left("GATE"), towers: left("CASTLE_TOWER"), keepPct: Math.round(100 * Math.max(0, keep.hp) / keep.maxHp) },
    scen, guardianWakeSec: wakeT != null ? Math.round(wakeT) : null, guardianKoSec: gKoSec, guardianHpPct: G ? Math.round(100 * Math.max(0, G.hp) / G.maxHp) : null };
}

const kindsWithGarrison = PA.archetypes.filter((a) => a.garrison.length).map((a) => a.lwKind).sort();
const results = [];
ARCH.CALIBRATION = { garrison: [] };   // threat 0, no garrison: the bare-structure baseline
kindsWithGarrison.unshift("CALIBRATION"); for (let i = 0; i < N; i++) pool.push({ id: "calib-" + i, k: "CALIBRATION", threat: 50 });   // a typical castle-band threat
for (const k of kindsWithGarrison.filter((k) => !ONLY || k === ONLY)) {
  const cands = pool.filter((p) => p.k === k).sort((a, b) => fnv1a(a.id + "|pick") - fnv1a(b.id + "|pick")).slice(0, N);
  for (const p of cands) results.push(runOne(p));
}
// doc 03 / doc 04 scenarios on the calibration castle (threat 50)
const SCEN = [];
for (const sc of ["BASE", "DEFENDED", "F2", "F3"]) for (let i = 0; i < N; i++) SCEN.push(runOne({ id: `scen-${sc}-${i}`, k: "CALIBRATION", threat: 50 }, sc));
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const rows = kindsWithGarrison.map((k) => {
  const r = results.filter((x) => x.k === k), b = r.filter((x) => x.breached);
  const row = { k, n: r.length, breachRate: r.length ? Math.round((100 * b.length) / r.length) : 0, medBreachSec: med(b.map((x) => x.sec)), medThreat: med(r.map((x) => x.threat)), medAttackerDeaths: med(r.map((x) => x.attackerDeaths)), defenderWins: r.filter((x) => x.defenderWon).length };
  row.flag = !r.length ? "NO SAMPLES" : row.breachRate < 50 ? "TOO HARD (most attacks fail the 12-min floor)" : row.breachRate === 100 && row.medBreachSec < 240 ? "TOO SOFT (falls in < 4 min)" : "ok";
  return row;
});
fs.writeFileSync(JOUT, JSON.stringify({ schema: "cf-living-world/sim-sample@1", kernel: "server/sim (deterministic)", floorSec: FLOOR_SEC, nPerKind: N, rows, results, scenarios: SCEN }, null, 1) + "\n");
const md = ["# Headless-sim sample — POI templates vs the 12-minute breach floor", "",
  `Generated by \`tools/living-world/sim_sample.mjs\` (N = ${N} seeded POIs per archetype, real \`server/sim\` kernel, dt ${DT}s, cap ${FLOOR_SEC / 60} min). Deterministic — re-running gives the same table.`, "",
  "Model: the POI's threat scales the defending core (×0.5–×2.5) and garrison; garrison units hold ground (leashed); neutral camps act as third-party barbarians; the attacker is the stock bot hero + minion waves (≈ an even-strength attacker, i.e. *weaker* than the doc-03 1.5× floor case).", "",
  "| Archetype | n | Breached ≤ 12 min | Median breach | Median threat | Median attacker losses | Defender wins | Verdict |", "|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.k} | ${r.n} | ${r.breachRate} % | ${r.medBreachSec != null ? Math.floor(r.medBreachSec / 60) + ":" + String(r.medBreachSec % 60).padStart(2, "0") : "—"} | ${r.medThreat} | ${r.medAttackerDeaths} | ${r.defenderWins} | ${r.flag} |`), "",
  (() => { const c = rows.find((r) => r.k === "CALIBRATION"); const ok = c && c.breachRate === 100 && c.medBreachSec >= 360 && c.medBreachSec <= 720;
    return `**Calibration:** a bare castle (threat 50, S2 structures: 8 walls 1,350 HP, 2 gates 1,150 HP, 2 castle towers 2,350 HP, keep 2,400 × tier; structure HP ×${DEF_MUL}) vs the floor-case attacker (1.5× squad, ⅓ canon SIEGE ×6 vs structures, + waves) breaches at **${c && c.medBreachSec != null ? Math.floor(c.medBreachSec / 60) + ":" + String(c.medBreachSec % 60).padStart(2, "0") : "—"}** — ${ok ? "inside the 6–12 min target band ✅" : "OUTSIDE the 6–12 min target band ❌"}.`; })(), "",
  "## Defences (doc 03) and Guardians (doc 04) on the calibration castle", "",
  "| Scenario | Breached (≤ 12 min; Guardian rows ≤ 25 min) | Median breach | Median attacker losses | Guardian KO'd | Median Guardian KO time | Guardian HP left at the end |", "|---|---|---|---|---|---|---|",
  ...["BASE", "DEFENDED", "F2", "F3"].map((sc) => { const r = SCEN.filter((x) => x.scen === sc), b = r.filter((x) => x.breached), ko = r.filter((x) => x.guardianKoSec != null), mb = med(b.map((x) => x.sec)), mk = med(ko.map((x) => x.guardianKoSec));
    const f = (v) => v != null ? Math.floor(v / 60) + ":" + String(v % 60).padStart(2, "0") : "—";
    return `| ${{ BASE: "Bare castle", DEFENDED: "Fully upgraded (×1.6 cap; attacker 1.5× the defence-weighted garrison)", F2: "+ Form 2 Warden", F3: "+ Form 3 Ascendant (5 % dmg for 8 min, then tires to 40 %)" }[sc]} | ${Math.round(100 * b.length / r.length)} % | ${f(mb)} | ${med(r.map((x) => x.attackerDeaths))} | ${sc === "F2" || sc === "F3" ? ko.length + "/" + r.length : "—"} | ${sc === "F2" || sc === "F3" ? f(mk) : "—"} | ${sc === "F2" || sc === "F3" ? med(r.map((x) => x.guardianHpPct)) + " %" : "—"} |`; }), "",
  "Tuning rule (doc 02 §5): an archetype out of band is re-tuned in `poi-archetypes.json` (garrison / threat curve), never per map.", ""].join("\n");
fs.writeFileSync(OUT, md);
console.log(md);
