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
//   R-FLAT  flat on the land: no moundSteps, no siege MOUND tier.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorldField, worldParcel, l3Row, clearWorldFieldCache } from "../worldfield.js";
import { generate, CASTLE_TIERS } from "../generate.js";

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
  ok(cg.rings.length === (T2 ? T2.ringN : 1), `${label}: R-RING ring count ${cg.rings.length} ≠ tier ${cg.tier}`);
  const keep = cg.keep.at, poly = art.arena.bounds, half = art.arena.sizeM / 2;
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
  const ring0 = cg.rings[0].pts, stairs = sg.stairs || [];
  ok(stairs.length >= 1, `${label}: R-ST2 at least one stair (parapet reachable)`);
  let clearOK = true, topOK = true;
  for (const s of stairs) {
    const [fx, fz] = s.foot, [tx, tz] = s.top, L = Math.hypot(tx - fx, tz - fz) || 1;
    for (let d = 0; d <= L - 4.5; d += 1.0) {
      const px = fx + ((tx - fx) / L) * d, pz = fz + ((tz - fz) / L) * d;
      if (polyD(px, pz, ring0) < 3.2) clearOK = false;
    }
    if (polyD(s.top[0], s.top[1], ring0) > 6.5) topOK = false;
  }
  ok(clearOK, `${label}: R-ST1 no stair intersects a wall (body ≥3.2u clear)`);
  ok(topOK, `${label}: R-ST2 every stair top lands on the wall-walk platform`);
  ok(stairs.every((s) => inPoly(s.foot[0], s.foot[1], ring0)),
    `${label}: R-ST3 every stair foot stands INSIDE its ward (never outside the wall)`);
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
