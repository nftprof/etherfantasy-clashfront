// CASTLE GEOMETRY INVARIANTS — the "never again" net (owner 2026-07-27/29, after castle-tour
// regressions reached the owner's screen). Sweeps BOTH castle populations:
//   • all 37 L3 castle parcels (every zone's castles[] with a designated hero parcel) — generated live
//   • all committed ESTATE maps (data/cf-maps/artifacts/<7-digit>.artifact.json — the pre-designed
//     palace/citadel maps; asserting the COMMITTED files also catches a forgotten re-bake)
// Ruleset (docs/maps/CASTLE-STAIRS-AND-WALLS-SPEC.md):
//   R-RING  ring count = tier ladder; full circuits (≥12 anchors), points inside parcel + arena,
//           rings strictly nested.
//   R-EN    enclosure: no angular gap > 2.4× nominal spacing.
//   R-GAP   wards never merge: ≥8u anchor↔anchor AND ≥7.5u SEGMENT-level clearance between
//           consecutive rings (deep keep-foot dents exempt).
//   R-AR    ≥1 gate arch.
//   R-ST1   no stair intersects a wall (body ≥3.2u clear outside the 4.5u top-contact zone).
//   R-ST2   every stair top lands on the wall-walk platform; ≥1 stair exists.
//   R-ST3   every stair foot stands INSIDE its ward.
//   R-STD   (v18) stairs are PER-RING DATA: every ring carries its own stairs[] and each flight
//           passes R-ST1/2/3 against ITS OWN ring; siege.stairs === ring0's stairs.
//   R-GATE  (v18) gate-count ladder: outer wall min(4, ringN+1) doors, each ward inward one
//           fewer, floored at 2.
//   R-TREE  (v18) no TREE/ROCK prop deep inside the walled interior, none within 10u of a gate.
//   R-ROAD  (v19) a road passing through the wall line has a door there (≤23u).
//   R-KEEP  (v19) outer wall circumference ≥2× keep (PALACE) / 1.5× (CASTLE); cramped keeps shrink.
//   R-RING  (v19, adaptive) tier ringN is a CEILING — the achieved radius affords
//           floor((R0−14)/12)+1 full-width wards; cramped castles build fewer rings, never a nest.
//   R-FLAT  flat on the land: no moundSteps, no siege MOUND tier.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorldField, worldParcel, l3Row, clearWorldFieldCache } from "../worldfield.js";
import { generate, CASTLE_TIERS } from "../generate.js";
import { runAudit, runNavalAudit } from "../traverse.js";
import { T } from "../schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log("  ✗ FAIL", name); } };
const segD = (px, pz, ax, az, bx, bz) => {
  const abx = bx - ax, abz = bz - az, L2 = abx * abx + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / L2));
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
};
const polyD = (px, pz, ring) => {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const A = ring[i], B = ring[(i + 1) % ring.length];
    best = Math.min(best, segD(px, pz, A[0], A[1], B[0], B[1]));
  }
  return best;
};
const inPoly = (x, z, poly) => {
  let inn = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inn = !inn;
  }
  return inn;
};

function checkArtifact(label, art) {
  const cg = art.meta && art.meta.castleGeom, sg = art.siege;
  if (!cg || !sg || !sg.wallRing) { ok(false, `${label}: no castleGeom/siege emitted`); return; }
  // R-GATE-TOWER (v27, owner 2026-08-29 "you can't have an arch between a wall and a tower"): EVERY
  // tower structure — mural castle_tower_* AND lane tw* — keeps ≥16u (−0.5 rounding slack) from every
  // gate anchor. The audit found lane towers skipped the clearance (siege-test gate_2↔tw0 = 15.7u).
  {
    const gatesS = (art.structures || []).filter((s) => s.kind === "GATE");
    const towersS = (art.structures || []).filter((s) => s.kind === "TOWER");
    let minGT = Infinity, worst = "";
    for (const g of gatesS) for (const t of towersS) {
      const d = Math.hypot(g.x - t.x, g.z - t.z);
      if (d < minGT) { minGT = d; worst = `${g.anchorId}↔${t.anchorId}`; }
    }
    ok(!gatesS.length || !towersS.length || minGT >= 15.5,
      `${label}: R-GATE-TOWER min gate↔tower ${minGT.toFixed(1)}u (${worst}) < 16u`);
  }
  // R-REACH-ALL (v28, owner 2026-08-31 "units running non-stop into rocks/walls"): the FULL
  // traverse audit on the artifact — walkable ⇔ reachable, walls-stamped. One connected field,
  // zero isolated cells, every dedicated walk + every stair foot passes. This is the guard that
  // makes stuck-unit pockets a CI failure instead of an owner sighting.
  {
    const s = runAudit(art).stats;
    ok(s.components === 1, `${label}: R-REACH-ALL ${s.components} walk components (must be 1)`);
    ok(s.isolatedCells === 0, `${label}: R-REACH-ALL ${s.isolatedCells} isolated walkable cells`);
    ok(s.reached === s.walks, `${label}: R-REACH-ALL ${s.walks - s.reached}/${s.walks} walks failed`);
    ok(s.stairsOk === s.stairs, `${label}: R-REACH-ALL ${s.stairs - s.stairsOk}/${s.stairs} stair feet unreachable`);
  }
  // R-LAYERS (v30, three-layer doctrine — NAVAL-AIRSHIP-THREE-LAYER-MAPS.md): the water depth
  // channel is sane (depth only on WATER cells; DEEP/OCEAN never abuts land — a SHALLOW wade rim
  // always intervenes) and LANDING_PADs obey the estate law (singles carry none; estates carry
  // 1..ladder, each pad centered on clear, walkable OPEN ground).
  {
    const G2 = art.terrain.w, cellM2 = art.terrain.cellM || 2, half2 = (G2 * cellM2) / 2;
    const cells2 = new Uint8Array(Buffer.from(art.terrain.cells, "base64"));
    const walk2 = new Uint8Array(Buffer.from(art.terrain.walk, "base64"));
    ok(!!art.terrain.water, `${label}: R-LAYERS terrain.water channel present`);
    if (art.terrain.water) {
      const w2 = new Uint8Array(Buffer.from(art.terrain.water, "base64"));
      let stray = 0, deepTouch = 0;
      for (let i = 0; i < G2 * G2; i++) {
        if (w2[i] && cells2[i] !== T.WATER) stray++;
        if (w2[i] >= 2) {
          const x = i % G2, z = (i / G2) | 0;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (nx < 0 || nz < 0 || nx >= G2 || nz >= G2) continue;
            const j = nz * G2 + nx;
            if (cells2[j] !== T.WATER && cells2[j] !== T.OOB) deepTouch++;
          }
        }
      }
      ok(stray === 0, `${label}: R-LAYERS water depth only on WATER cells (${stray} stray)`);
      ok(deepTouch === 0, `${label}: R-LAYERS deep water never abuts land — shallow rim required (${deepTouch} contacts)`);
    }
    const pads = (art.structures || []).filter((s) => s.kind === "LANDING_PAD");
    const cls = String((art.meta && art.meta.sizeClass) || "").toUpperCase();
    const LAD = { SMALL: 1, MEDIUM: 1, LARGE: 2, GIANT: 3, EPIC: 4 };
    if (!LAD[cls]) {
      ok(pads.length === 0, `${label}: R-PADS single parcels carry NO landing pads (${pads.length} found)`);
    } else {
      ok(pads.length >= 1 && pads.length <= LAD[cls],
        `${label}: R-PADS estate pad count ${pads.length} (class ${cls} wants 1..${LAD[cls]})`);
      const cellAt = (wx, wz) => {
        const cx = Math.max(0, Math.min(G2 - 1, Math.round((wx + half2) / cellM2 - 0.5)));
        const cz = Math.max(0, Math.min(G2 - 1, Math.round((wz + half2) / cellM2 - 0.5)));
        return cz * G2 + cx;
      };
      for (const p of pads) {
        let openN = 0, tot = 0;
        for (let a = 0; a < 8; a++) {
          const i = cellAt(p.x + Math.cos(a * Math.PI / 4) * (p.r - 2), p.z + Math.sin(a * Math.PI / 4) * (p.r - 2));
          tot++; if ((cells2[i] === T.OPEN || cells2[i] === T.ROAD) && walk2[i]) openN++;   // forgiving pads may rim a road
        }
        const ci = cellAt(p.x, p.z);
        const coreOk = cells2[ci] === T.OPEN || (p.plaza && cells2[ci] === T.ROAD);   // plaza pads sit on paving
        ok(coreOk && walk2[ci] === 1 && openN === tot,
          `${label}: R-PADS ${p.anchorId} (r${p.r}) sits on clear walkable ground (${openN}/${tot} rim)`);
        // owner 2026-08-31: airborne airships are shootable, but NEVER let a tower-buildable spot
        // overlook a pad — no landing into a prepared kill-box (PAD_BUILD_STANDOFF 30u).
        let minB = Infinity;
        for (const b of art.buildSpots || []) minB = Math.min(minB, Math.hypot(b.x - p.x, b.z - p.z));
        ok(minB >= 29.5, `${label}: R-PADS ${p.anchorId} kill-box rule — nearest build spot ${minB.toFixed(1)}u < 30u`);
        // naval-sim iter-12: no landing in the inner wards — a pad ≥45u from the keep, always.
        const kd = Math.hypot(p.x - cg.keep.at[0], p.z - cg.keep.at[1]);
        ok(kd >= 44.5, `${label}: R-PADS ${p.anchorId} inner-ward rule — ${kd.toFixed(1)}u from the keep < 45u`);
        // wingtip law (5-min loop iter-E/F): a NORMAL+ hull's wings overhang the disc — no tower
        // may stand inside r+9 of a full-size pad (LIGHT scout pads are exempt, compact hulls).
        if (p.r >= 16) {
          let minT = Infinity;
          for (const t of (art.structures || []).filter((s2) => s2.kind === "TOWER"))
            minT = Math.min(minT, Math.hypot(t.x - p.x, t.z - p.z));
          ok(minT >= p.r + 9, `${label}: R-PADS ${p.anchorId} wingtip clearance — tower at ${minT.toFixed(1)}u < r+9`);
        }
      }
    }
  }
  // R-NAVAL (v31, three-layer doctrine): the headless naval/air sim must be clean — every
  // ARRIVABLE sail region lands somewhere (beachhead + pier), every pad AND pier marches to the
  // defended heart. Dead sea content (a fleet that can arrive but never land) fails CI.
  {
    const s = runNavalAudit(art).stats;
    ok(s.arrivable === s.landable, `${label}: R-NAVAL ${s.arrivable - s.landable} arrivable sail regions with NO beachhead`);
    ok(s.padsOk === s.pads, `${label}: R-NAVAL ${s.pads - s.padsOk}/${s.pads} pads can't march to the heart`);
    ok(s.piersOk === s.piers, `${label}: R-NAVAL ${s.piers - s.piersOk}/${s.piers} piers can't march to the heart`);
    ok(s.beachOk === s.beachWalks, `${label}: R-NAVAL ${s.beachWalks - s.beachOk}/${s.beachWalks} beach landings can't march`);
    ok(s.arrivable === 0 || s.piers >= 1, `${label}: R-NAVAL arrivable water but no PIER emitted`);
    // pier GEOMETRY (5-min loop iter-B): root stands on walkable shore, head reaches over water —
    // a plank pointing inland (or floating unanchored) is a broken unload point.
    const Gp = art.terrain.w, cMp = art.terrain.cellM || 2, hp2 = (Gp * cMp) / 2;
    const cellsP = new Uint8Array(Buffer.from(art.terrain.cells, "base64"));
    const walkP = new Uint8Array(Buffer.from(art.terrain.walk, "base64"));
    const waterP = art.terrain.water ? new Uint8Array(Buffer.from(art.terrain.water, "base64")) : null;
    const idxAt = (wx, wz) => {
      const cx = Math.max(0, Math.min(Gp - 1, Math.round((wx + hp2) / cMp - 0.5)));
      const cz = Math.max(0, Math.min(Gp - 1, Math.round((wz + hp2) / cMp - 0.5)));
      return cz * Gp + cx;
    };
    for (const pr of (art.structures || []).filter((s2) => s2.kind === "PIER")) {
      let rootOk = false;   // root or its immediate ring is walkable shore
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
        if (walkP[idxAt(pr.x + dx * cMp, pr.z + dz * cMp)]) rootOk = true;
      ok(rootOk, `${label}: R-NAVAL ${pr.anchorId} root not on walkable shore`);
      const hx = pr.x + pr.dir[0] * pr.len, hz = pr.z + pr.dir[1] * pr.len;
      let headWet = false;   // head or its ring over water (any grade)
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const i2 = idxAt(hx + dx * cMp, hz + dz * cMp);
        if ((waterP && waterP[i2] >= 1) || cellsP[i2] === T.WATER) headWet = true;
      }
      ok(headWet, `${label}: R-NAVAL ${pr.anchorId} head does not reach the water (dir/len broken)`);
    }
  }
  const T2 = CASTLE_TIERS[cg.tier];
  const keep = cg.keep.at, poly = art.arena.bounds, half = art.arena.sizeM / 2;
  // R-RING (v19 adaptive): the tier's ringN is a CEILING; the achieved outer radius affords
  // floor((R0−keepFoot)/12)+1 full-width wards — a cramped footprint builds fewer, never a nest.
  const R0 = cg.rings[0].pts.reduce((s, p) => s + Math.hypot(p[0] - keep[0], p[1] - keep[1]), 0) / (cg.rings[0].pts.length || 1);
  const expectN = Math.max(1, Math.min(T2 ? T2.ringN : 1, Math.floor((R0 - 14) / 12) + 1));
  ok(cg.rings.length === expectN, `${label}: R-RING ring count ${cg.rings.length} ≠ affordable ${expectN} (tier ${cg.tier}, R0 ${R0.toFixed(1)})`);
  // R-KEEP (v19 owner sizing law): outer wall circumference ≥ 2× keep (PALACE) / 1.5× (CASTLE) —
  // on cramped land the KEEP shrinks (keep.w) to hold the ratio; keep visual radius ≈ 0.72 × w.
  const keepRatioMin = cg.tier === "PALACE" ? 2 : cg.tier === "CASTLE" ? 1.5 : 1.2;
  ok(R0 >= keepRatioMin * 0.72 * (cg.keep.w || 16) - 0.5,
    `${label}: R-KEEP wall ≥${keepRatioMin}× keep circumference (R0 ${R0.toFixed(1)}, keep.w ${cg.keep.w || 16})`);
  let prevR = Infinity, ringsOK = true, gapsOK = true, insideOK = true;
  for (const r of cg.rings) {
    if (r.pts.length < 12) ringsOK = false;
    const rad = r.pts.map((p) => Math.hypot(p[0] - keep[0], p[1] - keep[1]));
    const rAvg = rad.reduce((a, b) => a + b, 0) / (rad.length || 1);
    if (rAvg > prevR - 4) ringsOK = false;
    prevR = rAvg;
    const angles = r.pts.map((p) => Math.atan2(p[1] - keep[1], p[0] - keep[0])).sort((a, b) => a - b);
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i], b = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2;
      if (b - a > (Math.PI * 2 / r.pts.length) * 2.4) gapsOK = false;
    }
    for (const p of r.pts)
      if (Math.abs(p[0]) > half || Math.abs(p[1]) > half || (poly && poly.length >= 3 && !inPoly(p[0], p[1], poly))) insideOK = false;
  }
  ok(ringsOK, `${label}: R-RING full nested circuits (≥12 anchors each, strictly inward)`);
  ok(gapsOK, `${label}: R-EN enclosure — no angular gap > 2.4× nominal spacing`);
  ok(insideOK, `${label}: R-RING every ring point inside the parcel polygon + arena`);
  // R-GAP: consecutive rings never merge — per-anchor (≥8u) AND segment-level (≥9u anywhere on
  // the outer polyline; raised from 7.5 per the 2026-08-31 rulebook review — measured world min is
  // 9.5u, so 9 is the evidence-backed floor under the 12u generation target). Deep keep-foot dents
  // exempt (outer local radius ≤23 / inner ≤16).
  let wardOK = true, segOK = true;
  for (let ri = 0; ri + 1 < cg.rings.length; ri++) {
    const a = cg.rings[ri].pts, b = cg.rings[ri + 1].pts;
    if (a.length !== b.length) { wardOK = false; break; }
    for (let j = 0; j < a.length; j++) {
      const rLoc = Math.hypot(a[j][0] - keep[0], a[j][1] - keep[1]);
      if (Math.hypot(a[j][0] - b[j][0], a[j][1] - b[j][1]) < 8 && rLoc > 23) wardOK = false;
      const rIn = Math.hypot(b[j][0] - keep[0], b[j][1] - keep[1]);
      // sample the inner anchor AND its midpoint to the next inner anchor vs the outer polyline
      const k = (j + 1) % b.length;
      const mx = (b[j][0] + b[k][0]) / 2, mz = (b[j][1] + b[k][1]) / 2;
      if (rIn > 16 && (polyD(b[j][0], b[j][1], a) < 9 || polyD(mx, mz, a) < 9)) segOK = false;
    }
  }
  ok(wardOK, `${label}: R-GAP per-anchor ward spacing ≥8u (no merged walls)`);
  ok(segOK, `${label}: R-GAP segment-level ward clearance ≥9u (no wall grazes another at ANY angle)`);
  ok((sg.gates || []).length >= 1, `${label}: R-AR at least one gate arch`);
  // R-GATE (v18 owner ladder + v19 road doors): outer wall ≥ min(4, N+1) doors (road crossings
  // may add more, capped 5); each ward inward one fewer, ≥2.
  const N = cg.rings.length;
  const outerG = (cg.rings[0].gates || []).length;
  ok(outerG >= Math.min(4, N + 1) && outerG <= 5,
    `${label}: R-GATE outer wall carries ${Math.min(4, N + 1)}..5 doors (got ${outerG})`);
  for (let ri = 1; ri < N; ri++)
    ok((cg.rings[ri].gates || []).length === Math.max(2, Math.min(4, N + 1 - ri)),
      `${label}: R-GATE ward ${ri} carries ${Math.max(2, Math.min(4, N + 1 - ri))} doors (got ${(cg.rings[ri].gates || []).length})`);
  // R-ST1/2/3 + R-STD (v18): EVERY ring's own stairs[] verified against ITS OWN wall polyline.
  let clearOK = true, topOK = true, footOK = true, stairsOK = true;
  for (const r of cg.rings) {
    const stairs = r.stairs || [];
    if (!stairs.length) stairsOK = false;
    for (const s of stairs) {
      const [fx, fz] = s.foot, [tx, tz] = s.top, L = Math.hypot(tx - fx, tz - fz) || 1;
      for (let d = 0; d <= L - 4.5; d += 1.0) {
        const px = fx + ((tx - fx) / L) * d, pz = fz + ((tz - fz) / L) * d;
        if (polyD(px, pz, r.pts) < 3.2) clearOK = false;
      }
      if (polyD(s.top[0], s.top[1], r.pts) > 6.5) topOK = false;
      if (!inPoly(s.foot[0], s.foot[1], r.pts)) footOK = false;
    }
  }
  ok(stairsOK, `${label}: R-STD every ring carries its own stairs[] (parapet reachable per ward)`);
  ok(clearOK, `${label}: R-ST1 no stair intersects a wall (body ≥3.2u clear, per ring)`);
  ok(topOK, `${label}: R-ST2 every stair top lands on its own wall-walk platform`);
  ok(footOK, `${label}: R-ST3 every stair foot stands INSIDE its ward (never outside the wall)`);
  ok(JSON.stringify(sg.stairs || []) === JSON.stringify(cg.rings[0].stairs || []),
    `${label}: R-STD siege.stairs IS the outer ring's data flights (one source)`);
  // R-TREE (v18, owner 2026-08-01 "clear all trees inside the castle / one barges a door"):
  // no TREE/ROCK prop deep inside the walled interior (>2.5u in — cell-jitter overhang at the
  // wall line is fine) and none within 10u of any door arch.
  const ring0 = cg.rings[0].pts;
  const treeBad = (art.obstacles || []).filter((o) =>
    (o.kind === "TREE" || o.kind === "ROCK")
    && ((inPoly(o.x, o.z, ring0) && polyD(o.x, o.z, ring0) > 2.5)
        || (sg.gates || []).some((g2) => Math.hypot(g2.at[0] - o.x, g2.at[1] - o.z) < 10)));
  ok(treeBad.length === 0, `${label}: R-TREE walled interior + door aprons clear of trees/rocks (${treeBad.length} inside)`);
  // ENGINE RULE 10 (v23): every ring's wall ≥14u tall.
  ok(cg.rings.every((r) => (r.h || 0) >= 14), `${label}: R-H14 every wall ≥14u (engine floor)`);
  // ENGINE RULE 9 (v23): no 1-cell blocker slivers survive bake (open ground on both opposite sides).
  {
    const G2 = art.terrain.w, cells2 = new Uint8Array(Buffer.from(art.terrain.cells, "base64"));
    const BLK = new Set([1, 2, 3, 4]);
    let sliver = 0;
    for (let z2 = 1; z2 < G2 - 1; z2++) for (let x2 = 1; x2 < G2 - 1; x2++) {
      const i = z2 * G2 + x2;
      if (!BLK.has(cells2[i])) continue;
      const opN = !BLK.has(cells2[i - G2]) && cells2[i - G2] !== 6, opS = !BLK.has(cells2[i + G2]) && cells2[i + G2] !== 6;
      const opW = !BLK.has(cells2[i - 1]) && cells2[i - 1] !== 6, opE = !BLK.has(cells2[i + 1]) && cells2[i + 1] !== 6;
      if ((opN && opS) || (opW && opE)) sliver++;
    }
    ok(sliver === 0, `${label}: R-SLIVER no 1-cell blockers (${sliver} found)`);
    // ENGINE RULE 10 (v23): breach ward — mostly-open pocket just inside the MAIN gate.
    const g0 = (cg.rings[0].gates[0] || {}).at || cg.rings[0].gates[0];
    if (g0) {
      const m0 = Math.hypot(g0[0] - keep[0], g0[1] - keep[1]) || 1;
      const px = g0[0] - ((g0[0] - keep[0]) / m0) * 13, pz = g0[1] - ((g0[1] - keep[1]) / m0) * 13;
      let openN = 0, tot = 0;
      const cellM2 = art.terrain.cellM || 2, halfM2 = (G2 * cellM2) / 2;
      for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) {
        if (dx * dx + dz * dz > 25) continue;
        const cx3 = Math.max(0, Math.min(G2 - 1, Math.floor((px + dx * cellM2 + halfM2) / cellM2)));
        const cz3 = Math.max(0, Math.min(G2 - 1, Math.floor((pz + dz * cellM2 + halfM2) / cellM2)));
        tot++;
        if (!BLK.has(cells2[cz3 * G2 + cx3]) && cells2[cz3 * G2 + cx3] !== 6) openN++;
      }
      ok(openN / (tot || 1) >= 0.75, `${label}: R-BREACH open ward inside the main gate (${openN}/${tot} open)`);
    }
  }
  // R-ROAD (v19 owner 2026-08-01): a road that passes THROUGH the wall line has a door there.
  // Sample the outer polyline for ROAD ground; count only real crossings (ROAD continues ≥4u on
  // BOTH sides of the wall — ford/band artifacts along the wall don't) and require a gate ≤23u.
  {
    const G = art.terrain.w, cellM = art.terrain.cellM || 2, halfM = (G * cellM) / 2;
    const cells = new Uint8Array(Buffer.from(art.terrain.cells, "base64"));
    const cellAt = (x, z) => {
      const cx2 = Math.max(0, Math.min(G - 1, Math.floor((x + halfM) / cellM)));
      const cz2 = Math.max(0, Math.min(G - 1, Math.floor((z + halfM) / cellM)));
      return cells[cz2 * G + cx2];
    };
    const gatePts = (sg.gates || []).map((g2) => g2.at);
    // walk the closed polyline; group road-hit samples into RUNS (same rule as the generator); a
    // run is a REAL crossing if any sample has ROAD ≥4u out on BOTH sides of the wall (ford/band
    // artifacts along a water-standing wall don't). Door within 16u of the run midpoint. Runs
    // beyond the generator's 5-door cap are exempt.
    const samples = [], through = [];
    for (let i = 0; i < ring0.length; i++) {
      const A = ring0[i], B = ring0[(i + 1) % ring0.length];
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
      const dx = (B[0] - A[0]) / L, dz = (B[1] - A[1]) / L, nx = -dz, nz = dx;
      for (let d = 0; d < L; d += 1) {
        const x = A[0] + dx * d, z = A[1] + dz * d;
        samples.push([x, z]);
        through.push(cellAt(x, z) === T.ROAD
          && cellAt(x + nx * 4, z + nz * 4) === T.ROAD && cellAt(x - nx * 4, z - nz * 4) === T.ROAD);
      }
    }
    const isRoad = samples.map(([x, z]) => cellAt(x, z) === T.ROAD);
    const runs = [];
    let cur = null, gapRun = 0;
    for (let i = 0; i < samples.length; i++) {
      if (isRoad[i]) { if (!cur) cur = [i, i, through[i]]; else { cur[1] = i; cur[2] = cur[2] || through[i]; } gapRun = 0; }
      else if (cur && ++gapRun > 6) { runs.push(cur); cur = null; }
    }
    if (cur) runs.push(cur);
    if (runs.length >= 2 && runs[0][0] === 0 && runs[runs.length - 1][1] === samples.length - 1) {
      const last = runs.pop();
      runs[0] = [last[0] - samples.length, runs[0][1], runs[0][2] || last[2]];
    }
    const missed = [];
    for (const [s0, s1, real] of runs) {
      if (!real) continue;
      const mi = ((Math.round((s0 + s1) / 2) % samples.length) + samples.length) % samples.length;
      const [mx2, mz2] = samples[mi];
      if (!gatePts.some((g2) => Math.hypot(g2[0] - mx2, g2[1] - mz2) <= 16)) missed.push([Math.round(mx2), Math.round(mz2)]);
    }
    ok(missed.length === 0 || gatePts.length >= 5,
      `${label}: R-ROAD every road through the wall has a door (${missed.length} missing: ${JSON.stringify(missed)})`);
    // R-PATH (v21, owner "path walks into a tower"): road only ever crosses the wall at an arch —
    // no ROAD cell hugs the wall line (≤2.4u) farther than 8u from every door.
    let hugging = 0;
    for (let si = 0; si < samples.length; si += 2) {
      const [x, z] = samples[si];
      if (!isRoad[si]) continue;
      if (gatePts.some((g2) => Math.hypot(g2[0] - x, g2[1] - z) <= 8)) continue;
      hugging++;
    }
    ok(hugging === 0, `${label}: R-PATH no road hugs the wall away from a door (${hugging} cells)`);
  }
  ok(((cg.mound && cg.mound.steps) || []).length === 0
    && !(sg.elevationTiers.tier1 || []).some((t) => t.kind === "MOUND"),
    `${label}: R-FLAT flat on the land (no moundSteps, no siege MOUND tier)`);
}

// ---- population 1: every L3 castle parcel, generated live ----
clearWorldFieldCache();
let castles = 0;
for (const zone of ["EDU", "HUB", "BUS", "ENT", "UW2", "UW3"]) {
  let field; try { field = loadWorldField(zone); } catch { continue; }
  for (const c of field.castles || []) {
    const pid = c.heroParcels && c.heroParcels[0];
    if (!pid) continue;
    const snap = l3Row(pid);
    if (!snap) { ok(false, `${c.id}: castle parcel ${pid} missing from the l3 snapshot`); continue; }
    castles++;
    try { checkArtifact(`${zone} ${c.id} (${pid})`, generate(worldParcel(snap, {}))); }
    catch (e) { ok(false, `${zone} ${c.id}: generate threw ${e.message}`); }
  }
}

// ---- population 2: the committed pre-designed ESTATE maps (7-digit ids) ----
let estates = 0;
const artDir = path.join(ROOT, "data/cf-maps/artifacts");
for (const f of fs.readdirSync(artDir).filter((x) => /^\d{7}\.artifact\.json$/.test(x))) {
  estates++;
  try { checkArtifact(`ESTATE ${f.replace(".artifact.json", "")}`, JSON.parse(fs.readFileSync(path.join(artDir, f), "utf8"))); }
  catch (e) { ok(false, `ESTATE ${f}: unreadable — ${e.message}`); }
}

// ---- population 3: siege-test (the MOBA contract testbed) + naval-sim determinism guard ----
{
  const stPath = path.join(ROOT, "data/moba-maps/siege-test.artifact.json");
  if (fs.existsSync(stPath)) {
    const st = JSON.parse(fs.readFileSync(stPath, "utf8"));
    checkArtifact("SIEGE-TEST", st);
    ok(JSON.stringify(runNavalAudit(st)) === JSON.stringify(runNavalAudit(st)),
      "SIEGE-TEST: runNavalAudit is deterministic (same artifact ⇒ byte-identical audit)");
  }
}
console.log(`\ncastle-geometry sweep: ${castles} castle parcels + ${estates} estate maps | ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
