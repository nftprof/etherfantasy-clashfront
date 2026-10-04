#!/usr/bin/env node
// D54 — living-world castle POIs on the estate board battle (canon decision 22, cf-overworld
// docs/maps/CONTINUOUS-WORLD-TERRAIN.md §3c): an estate fight is ONE command-view battle; only its HERO-MODE parcels
// (castle parcel first; LARGE 3 / GIANT 5 / EPIC 8, from world-terrain castles[].heroParcels) can open a live 3D match.
// Each castle-ring Node is mapped to the nearest hero parcel when it lies within HERO_RADIUS of that parcel's center
// (→ it can be fought in 3D), else it resolves on the board (command view). Checks: the GUARDIAN_PERCH must sit on the
// castle parcel (heroParcels[0]), the castle's last stand. A Node outside the estate's bbox is not in the estate battle at
// all: it is its OWN single-parcel battle (3D-capable, like any lone parcel). Castles whose designation is DEFERRED (no L3 subdivision)
// get the perch on the castle parcel by rule once designated.
import fs from "node:fs";
const W = "/home/user/cf-overworld/data", OUT = (() => { const i = process.argv.indexOf("--out"); return i > 0 ? process.argv[i + 1] : "data/living-world/hero-parcel-map.json"; })();
export const HERO_RADIUS = 8;   // u (zone svg units): ~a single L3 parcel's half-extent ⚙
const CP = JSON.parse(fs.readFileSync("data/living-world/castle-pois.json", "utf8"));
const zoneCastles = {}, centers = {}, EST = Object.fromEntries(JSON.parse(fs.readFileSync(`${W}/hexagon-city-source/parcels-l2.json`, "utf8")).parcels.map((e) => [String(e.parcelId), e]));
const inBbox = (p, b) => b && p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
for (const z of [...new Set(CP.byCastle.map((c) => c.zone))]) {
  const f = `${W}/world-terrain/${z}.json`; if (!fs.existsSync(f)) continue;
  for (const c of JSON.parse(fs.readFileSync(f, "utf8")).castles || []) zoneCastles[c.id] = c;
  const l3 = `${W}/hexagon-city-source/l3/${z}.json`; if (fs.existsSync(l3)) for (const p of JSON.parse(fs.readFileSync(l3, "utf8")).singles) if (p.center) centers[p.parcelId] = p.center;
}
export function map() {
  const castles = {}, tally = { castles: 0, designated: 0, deferred: 0, pois: 0, heroPois: 0, boardPois: 0, ownParcelPois: 0, perchOnCastleParcel: 0, perchMisplaced: [] };
  for (const c of CP.byCastle) {
    const W0 = zoneCastles[c.castleId], hp = (W0 && W0.heroParcels) || [], est = W0 && EST[String(W0.townEstateId)];
    tally.castles++; if (hp.length) tally.designated++; else tally.deferred++;
    const rows = c.pois.map((p) => {
      tally.pois++;
      if (!hp.length) return { poi: p.id, lwKind: p.lwKind, on: p.lwKind === "GUARDIAN_PERCH" ? "CASTLE_PARCEL (deferred)" : "BOARD (deferred)" };
      let best = null; for (const id of hp) { const ce = centers[id]; if (!ce) continue; const d = Math.hypot(ce[0] - p.at[0], ce[1] - p.at[1]); if (!best || d < best.d) best = { id, d }; }
      const hero = best && best.d <= HERO_RADIUS ? best.id : null, inEstate = !est || inBbox(p.at, est.bbox);
      if (hero) tally.heroPois++; else if (inEstate) tally.boardPois++; else tally.ownParcelPois++;
      if (p.lwKind === "GUARDIAN_PERCH") { if (hero === hp[0]) tally.perchOnCastleParcel++; else tally.perchMisplaced.push(p.id); }
      return { poi: p.id, lwKind: p.lwKind, on: hero ? (hero === hp[0] ? "CASTLE_PARCEL" : "HERO_PARCEL") : inEstate ? "BOARD" : "OWN_PARCEL", heroParcel: hero, distU: best ? Math.round(best.d * 10) / 10 : null };
    });
    castles[c.castleId] = { kind: c.kind, heroParcels: hp, note: (W0 && W0.heroParcelsNote) || null, pois: rows };
  }
  return { tally, castles };
}
if (process.argv[1] && process.argv[1].endsWith("hero_parcels.mjs")) {
  const M = map();
  fs.writeFileSync(OUT, JSON.stringify({ schema: "cf-living-world/hero-parcel-map@1", rule: `Node → nearest hero parcel within ${HERO_RADIUS} u (3D window); else inside the estate bbox → BOARD (command view); else OWN_PARCEL (its own single-parcel battle); GUARDIAN_PERCH must be on heroParcels[0] (the castle parcel)`, ...M }, null, 1) + "\n");
  console.log(JSON.stringify(M.tally));
}
