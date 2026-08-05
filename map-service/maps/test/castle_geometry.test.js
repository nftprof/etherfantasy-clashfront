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
  // R-GAP: consecutive rings never merge — per-anchor (≥8u) AND segment-level (≥7.5u anywhere on
  // the outer polyline). Deep keep-foot dents exempt (outer local radius ≤23 / inner ≤16).
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
      if (rIn > 16 && (polyD(b[j][0], b[j][1], a) < 7.5 || polyD(mx, mz, a) < 7.5)) segOK = false;
    }
  }
  ok(wardOK, `${label}: R-GAP per-anchor ward spacing ≥8u (no merged walls)`);
  ok(segOK, `${label}: R-GAP segment-level ward clearance ≥7.5u (no wall grazes another at ANY angle)`);
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

console.log(`\ncastle-geometry sweep: ${castles} castle parcels + ${estates} estate maps | ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
