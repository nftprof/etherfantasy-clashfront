// Living World — the shared headless battle harness (extracted from sim_sample.mjs, D6e). One POI battle in the REAL
// deterministic kernel (server/sim): S2 castle structures around a keep scaled by the POI's threat, the archetype's
// garrison, the doc-03 floor-case attacker (1.5× squad, ⅓ SIEGE), and optional doc-03/doc-04 scenarios.
// Read by sim_sample.mjs (per-archetype report) and sim_matrix.mjs (archetype × ground matrix).
import fs from "node:fs";
import { makeWorld, mkUnit } from "../../server/sim/state.js";
import { step } from "../../server/sim/step.js";
export const opts = { SQUAD_MUL: 1.5, DEF_MUL: 3, G_HP: null };   // DEF_MUL: structure-HP calibration (D6b sweep: ×3 → a bare threat-50 castle breaches at ~9 min, mid 6–12 band)
export const PA = JSON.parse(fs.readFileSync("data/living-world/poi-archetypes.json", "utf8"));
export const CP = JSON.parse(fs.readFileSync("data/living-world/castle-pois.json", "utf8"));
export function fnv1a(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
export const pool = CP.byCastle.flatMap((c) => c.pois.map((p) => ({ id: p.id, k: p.lwKind, threat: p.threat, ring: "CASTLE", ground: c.layer })));
for (const f of fs.readdirSync("data/living-world/estate-pois").sort())
  for (const p of JSON.parse(fs.readFileSync("data/living-world/estate-pois/" + f, "utf8")).parcels) p.nodes.forEach((n, i) => pool.push({ id: `${p.id}#${i}`, k: n.k, threat: n.threat, ring: p.ring, ground: p.ground }));
export const ARCH = Object.fromEntries(PA.archetypes.map((a) => [a.lwKind, a]));
export const GU = JSON.parse(fs.readFileSync("data/living-world/guardians.json", "utf8")), DF = JSON.parse(fs.readFileSync("data/living-world/defences.json", "utf8"));
export const FLOOR_SEC = 720, GUARDIAN_CAP_SEC = 1500, DT = 0.1;

export function runOne(poi, scen = "BASE") {
  const { SQUAD_MUL, DEF_MUL, G_HP } = opts;
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
  // Ward Stones (Form 3 counterplay): each one destroyed cuts the Ascension window; all of them end it (guardians.json)
  const wards = [];
  if (F && F.ascended) for (let i = 0; i < F.ascended.wardStones.count; i++) {
    const a = Math.PI * 1.25 + (i - 1) * 0.5, hp = Math.round(F.ascended.wardStones.hp * DEF_MUL);
    const ws = mkUnit({ kind: "wall", team: 1, x: K.x + Math.cos(a) * 11, z: K.z + Math.sin(a) * 11, hp, maxHp: hp, dmg: 0, range: 0, speed: 0 }); ws.slot = "WARD_STONE"; w.units.set(ws.uid, ws); wards.push(ws);
  }
  let gKoSec = null, tired = false, wakeT = null, cut = 0, wardsDownAt = [];   // doc 04 (revised by this sample): the Ascension clock starts at FIRST CONTACT, not battle start
  const inputs = new Map(); let deaths = 0; const aliveNow = new Set();
  for (const u of w.units.values()) if (u.team === 0 && u.hp > 0) aliveNow.add(u.uid);
  const cap = F ? GUARDIAN_CAP_SEC : FLOOR_SEC;   // guardian scenarios run to 20 min so the tired / KO phase is visible
  while (w.winner == null && w.t < cap) {
    step(w, DT, inputs);
    for (const u of [...w.units.values()]) if (u.team === 1 && u.kind === "minion") w.units.delete(u.uid);
    if (G && wakeT == null && G.hp < G.maxHp) wakeT = w.t;
    if (G && F.ascended && !tired) { const down = wards.filter((x) => !(x.hp > 0)).length; while (wardsDownAt.length < down) wardsDownAt.push(Math.round(w.t)); cut = down * F.ascended.wardStones.cutSecEach; }
    // the Guardian's aura: attackers near it deal reduced structure damage (rides the opt-in structMul; siege keeps its ×6 base)
    if (G && G.hp > 0) for (const u of w.units.values()) if (u.team === 0 && u.kind === "minion") { const base = u.slot === "SIEGE" ? 6 : 1; u.structMul = Math.hypot(u.x - G.x, u.z - G.z) <= F.aura.radiusU ? base * F.aura.structureDmgMul : (u.slot === "SIEGE" ? 6 : undefined); }
    if (G && F.ascended && !tired && wakeT != null && (w.t - wakeT >= F.ascended.windowSec - cut || wardsDownAt.length >= F.ascended.wardStones.count)) { tired = true; G.dmgTakenMul = 1; G.hp = Math.min(G.hp, Math.round(G.maxHp * F.ascended.tiredHpPct / 100)); }   // "the Ascendant tires"
    if (G && gKoSec == null && !(G.hp > 0)) gKoSec = Math.round(w.t);
    for (const u of w.units.values()) if (u.team === 0) { const a = u.hp > 0 && u.state !== "dead"; if (aliveNow.has(u.uid) && !a) { deaths++; aliveNow.delete(u.uid); } else if (a) aliveNow.add(u.uid); }
  }
  const left = (slot) => [...w.units.values()].filter((u) => u.team === 1 && u.slot === slot && u.hp > 0).length;
  return { id: poi.id, k: poi.k, threat: poi.threat, breached: w.winner === 0, sec: Math.round(w.t), attackerDeaths: deaths, defenderWon: w.winner === 1,
    left: { walls: left("WALL"), gates: left("GATE"), towers: left("CASTLE_TOWER"), keepPct: Math.round(100 * Math.max(0, keep.hp) / keep.maxHp) },
    wardsDownAt, scen, guardianWakeSec: wakeT != null ? Math.round(wakeT) : null, guardianKoSec: gKoSec, guardianHpPct: G ? Math.round(100 * Math.max(0, G.hp) / G.maxHp) : null };
}
