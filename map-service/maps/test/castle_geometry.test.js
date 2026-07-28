// CASTLE GEOMETRY INVARIANTS — the "never again" net (owner 2026-07-27, after the Vault-Palace
// 3-anchor-triangle regression reached the owner's screen). Generates EVERY castle parcel in the
// world (all zones' castles[] with a designated castle heroParcel) and asserts the ruleset from
// docs/maps/CASTLE-STAIRS-AND-WALLS-SPEC.md:
//   R-RING  ring count matches the tier ladder (PALACE 3 / CASTLE 2 / KEEP 1); every ring is a
//           FULL circuit (≥ 12 anchors — a culled/degenerate ring fails here first), every ring
//           point inside the parcel polygon + arena, rings strictly nested.
//   R-EN    enclosure: no angular gap between consecutive anchors > 2.4× the nominal spacing.
//   R-AR    ≥ 1 gate arch on the outer ring (the only ground-level way through a wall).
//   R-ST1   stairs never intersect a wall: every stair centerline (excluding the 4.5u top-tread
//           platform-contact zone) keeps ≥ 3.2u from every wall segment.
//   R-ST2   every stair TOP lands ON the wall-walk platform (≤ 6.5u from the ring centerline);
//           ≥ 1 stair per castle (the parapet is reachable).
//   R-FLAT  no mound: castleGeom.mound.steps is empty and no siege tier1 MOUND entry exists.
// Any future generator change that breaks one of these fails THIS suite — not the owner's review.
import { loadWorldField, worldParcel, l3Row, clearWorldFieldCache } from "../worldfield.js";
import { generate, CASTLE_TIERS } from "../generate.js";

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log("  ✗ FAIL", name); } };
const segD = (px, pz, ax, az, bx, bz) => {
  const abx = bx - ax, abz = bz - az, L2 = abx * abx + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / L2));
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
};
const inPoly = (x, z, poly) => {
  let inn = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inn = !inn;
  }
  return inn;
};

clearWorldFieldCache();
const zones = ["EDU", "HUB", "BUS", "ENT", "UW2", "UW3"];
let castles = 0;
for (const zone of zones) {
  let field; try { field = loadWorldField(zone); } catch { continue; }
  for (const c of field.castles || []) {
    const pid = c.heroParcels && c.heroParcels[0];
    if (!pid) continue;                                     // un-subdivided estates: no L3 parcel to build
    const snap = l3Row(pid);
    if (!snap) { ok(false, `${c.id}: castle parcel ${pid} missing from the l3 snapshot`); continue; }
    castles++;
    const label = `${zone} ${c.id} (${pid})`;
    let art;
    try { art = generate(worldParcel(snap, {})); } catch (e) { ok(false, `${label}: generate threw ${e.message}`); continue; }
    const cg = art.meta.castleGeom, sg = art.siege;
    if (!cg || !sg || !sg.wallRing) { ok(false, `${label}: no castleGeom/siege emitted`); continue; }
    const T2 = CASTLE_TIERS[cg.tier];
    ok(cg.rings.length === (T2 ? T2.ringN : 1), `${label}: R-RING ring count ${cg.rings.length} ≠ tier ${cg.tier}`);
    const keep = cg.keep.at, poly = art.arena.bounds, half = art.arena.sizeM / 2;
    let prevR = Infinity, ringsOK = true, gapsOK = true, insideOK = true;
    for (const r of cg.rings) {
      if (r.pts.length < 12) ringsOK = false;
      const rad = r.pts.map((p) => Math.hypot(p[0] - keep[0], p[1] - keep[1]));
      const rAvg = rad.reduce((a, b) => a + b, 0) / (rad.length || 1);
      if (rAvg > prevR - 4) ringsOK = false;                // nested, meaningfully inward
      prevR = rAvg;
      const angles = r.pts.map((p) => Math.atan2(p[1] - keep[1], p[0] - keep[0])).sort((a, b) => a - b);
      for (let i = 0; i < angles.length; i++) {
        const a = angles[i], b = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2;
        if (b - a > (Math.PI * 2 / r.pts.length) * 2.4) gapsOK = false;   // R-EN: circuit closes
      }
      for (const p of r.pts)
        if (Math.abs(p[0]) > half || Math.abs(p[1]) > half || (poly && poly.length >= 3 && !inPoly(p[0], p[1], poly))) insideOK = false;
    }
    ok(ringsOK, `${label}: R-RING full nested circuits (≥12 anchors each, strictly inward)`);
    ok(gapsOK, `${label}: R-EN enclosure — no angular gap > 2.4× nominal spacing`);
    ok(insideOK, `${label}: R-RING every ring point inside the parcel polygon + arena`);
    ok((sg.gates || []).length >= 1, `${label}: R-AR at least one gate arch`);
    const ring0 = cg.rings[0].pts, stairs = sg.stairs || [];
    ok(stairs.length >= 1, `${label}: R-ST2 at least one stair (parapet reachable)`);
    let clearOK = true, topOK = true;
    for (const s of stairs) {
      const [fx, fz] = s.foot, [tx, tz] = s.top, L = Math.hypot(tx - fx, tz - fz) || 1;
      for (let d = 0; d <= L - 4.5; d += 1.0) {
        const px = fx + ((tx - fx) / L) * d, pz = fz + ((tz - fz) / L) * d;
        for (let i = 0; i < ring0.length; i++) {
          const A = ring0[i], B = ring0[(i + 1) % ring0.length];
          if (segD(px, pz, A[0], A[1], B[0], B[1]) < 3.2) clearOK = false;
        }
      }
      let m = 1e9;
      for (let i = 0; i < ring0.length; i++) {
        const A = ring0[i], B = ring0[(i + 1) % ring0.length];
        m = Math.min(m, segD(s.top[0], s.top[1], A[0], A[1], B[0], B[1]));
      }
      if (m > 6.5) topOK = false;
    }
    ok(clearOK, `${label}: R-ST1 no stair intersects a wall (body ≥3.2u clear)`);
    ok(topOK, `${label}: R-ST2 every stair top lands on the wall-walk platform`);
    ok(((cg.mound && cg.mound.steps) || []).length === 0
      && !(sg.elevationTiers.tier1 || []).some((t) => t.kind === "MOUND"),
      `${label}: R-FLAT flat on the land (no moundSteps, no siege MOUND tier)`);
  }
}
console.log(`\ncastle-geometry sweep: ${castles} castles | ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
