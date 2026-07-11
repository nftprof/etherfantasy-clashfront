// worldfield.js — CONTINUOUS WORLD TERRAIN parcel windows (docs/maps/CONTINUOUS-WORLD-TERRAIN.md).
//
// data/world-terrain/<ZONE>.json is the authored macro feature network: rivers/roads/ridges as
// dense polylines in ZONE SVG coords (viewBox space, y DOWN, y=0 edge = north; same space as the
// parcel centers/bboxes in data/hexagon-city-source/l3/<ZONE>.json). A parcel's battlefield is a
// WINDOW into that field: clip each polyline to the parcel bbox (+margin), smooth it with a
// Catmull-Rom pass over the GLOBAL control points, and transform it into the ±161 battle frame
// with EXACTLY the same fit (scale + center + y-flip) the generator applies to the parcel's
// polygon. Because two adjacent parcels clip and smooth the SAME zone polyline and both use the
// per-parcel affine of the SAME world geometry, a river leaving parcel A through the shared
// boundary enters parcel B at the identical world point — continuity is by construction, with
// zero cross-parcel messaging (the CONTINUOUS-WORLD-TERRAIN.md §2 rule).
//
// Battle frame: +z NORTH (zone -y), center origin, world-units; widths in world-units.
// Pure + deterministic: no Math.random / Date.now anywhere.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r1 = (n) => Math.round(n * 10) / 10;

// ---- field loading (cached; null when a zone has no authored field yet — stamp floor) ---------
const fieldDir = () => process.env.WORLD_TERRAIN_DIR || path.resolve(__dirname, "../../data/world-terrain");
const _fields = new Map();
export function loadWorldField(zone) {
  const key = String(zone || "").toUpperCase();
  if (!key) return null;
  if (_fields.has(key)) return _fields.get(key);
  let field = null;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(fieldDir(), `${key}.json`), "utf8"));
    if (raw && (raw.rivers || raw.roads || raw.ridges)) field = raw;
  } catch { field = null; }
  _fields.set(key, field);
  return field;
}
export function clearWorldFieldCache() { _fields.clear(); }   // tests / WORLD_TERRAIN_DIR swaps

// ---- the shared parcel→arena fit (THE continuity keystone) ------------------------------------
// Identical math to the generator's normPoly: bbox-center origin, uniform scale fitting the max
// dimension into 96% of the arena. Features and the polygon MUST go through the same numbers.
export function fitToArena(pts, sizeM) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { s: (sizeM * 0.96) / Math.max(x1 - x0, z1 - z0, 1e-9), cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}

// ---- tiny SVG path → polygon (zone coords, y down) --------------------------------------------
// Handles m/M l/L h/H v/V z and approximates c/s/q/t/a curves by their endpoints (parcel paths
// are tiny; curve sag is far below one terrain cell). First subpath only.
export function svgPathToPolygon(d) {
  const tokens = String(d || "").match(/[a-zA-Z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) || [];
  const pts = [];
  let cmd = "", x = 0, y = 0, sx = 0, sy = 0, i = 0, subpaths = 0;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) {
      cmd = tokens[i++];
      if (cmd === "z" || cmd === "Z") { x = sx; y = sy; continue; }
      if ((cmd === "m" || cmd === "M") && ++subpaths > 1) break;      // first subpath only
    }
    if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toLowerCase()) {
      case "m": x = rel ? x + num() : num(); y = rel ? y + num() : num(); sx = x; sy = y; pts.push([x, y]); cmd = rel ? "l" : "L"; break;
      case "l": x = rel ? x + num() : num(); y = rel ? y + num() : num(); pts.push([x, y]); break;
      case "h": x = rel ? x + num() : num(); pts.push([x, y]); break;
      case "v": y = rel ? y + num() : num(); pts.push([x, y]); break;
      case "c": num(); num(); num(); num(); x = rel ? x + num() : num(); y = rel ? y + num() : num(); pts.push([x, y]); break;
      case "s": case "q": num(); num(); x = rel ? x + num() : num(); y = rel ? y + num() : num(); pts.push([x, y]); break;
      case "t": x = rel ? x + num() : num(); y = rel ? y + num() : num(); pts.push([x, y]); break;
      case "a": num(); num(); num(); num(); num(); x = rel ? x + num() : num(); y = rel ? y + num() : num(); pts.push([x, y]); break;
      default: i++; break;
    }
  }
  // drop consecutive dupes + a closing point equal to the first
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > 1e-9 || Math.abs(q[1] - p[1]) > 1e-9) out.push(p);
  }
  if (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) < 1e-9 && Math.abs(out[0][1] - out[out.length - 1][1]) < 1e-9) out.pop();
  return out;
}

// ---- geometry helpers --------------------------------------------------------------------------
// Liang–Barsky: does segment a→b touch the axis box?
function segIntersectsBox(ax, ay, bx, by, x0, y0, x1, y1) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, ax - x0) && clip(dx, x1 - ax) && clip(-dy, ay - y0) && clip(dy, y1 - ay);
}
// segment a→b × segment c→d intersection point (or null)
function segX(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, qx = dx - cx, qy = dy - cy;
  const den = rx * qy - ry * qx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((cx - ax) * qy - (cy - ay) * qx) / den;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [ax + rx * t, ay + ry * t];
}
// Catmull-Rom samples between p1 and p2 (appended to out, p1 excluded)
function crSample(p0, p1, p2, p3, steps, out) {
  for (let k = 1; k <= steps; k++) {
    const t = k / steps, t2 = t * t, t3 = t2 * t;
    out.push([
      0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
      0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
    ]);
  }
}
// clip a global polyline to a zone box → smoothed dense runs (zone coords). The Catmull-Rom pass
// uses the GLOBAL control points and a step count that depends only on each global segment's own
// length, so every parcel that windows the same stretch samples the IDENTICAL curve points —
// that is what makes the curve continuous across parcel boundaries.
const CR_STEP = 0.07;                        // zone-units between curve samples (≈ 32 world-units/u ≈ sub-cell)
function windowPolyline(pts, box) {
  const runs = [];
  let start = -1;
  for (let i = 0; i < pts.length - 1; i++) {
    const hit = segIntersectsBox(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], box[0], box[1], box[2], box[3]);
    if (hit && start < 0) start = i;
    if (!hit && start >= 0) { runs.push([start, i - 1]); start = -1; }
  }
  if (start >= 0) runs.push([start, pts.length - 2]);
  return runs.map(([i0, i1]) => {
    const out = [pts[i0].slice()];
    for (let i = i0; i <= i1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const steps = Math.max(1, Math.min(64, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / CR_STEP)));
      crSample(p0, p1, p2, p3, steps, out);
    }
    return out;
  });
}

// ---- widths ------------------------------------------------------------------------------------
// Authored widths are ZONE-render widths (the main river is honestly ~2 parcels wide; the grand
// road's 0.5 u would be a 170-world-unit strip). At battle scale we clamp in ZONE units FIRST
// (the same cap for every parcel ⇒ neighbours still paint the same zone-space band = width stays
// continuous in the mosaic), then scale by the parcel fit, then apply a small world-unit floor so
// slivers still read (the floor is the only per-parcel term and only binds on tiny parcels).
//
// FILL water (2026-07-11, owner fix-it): a rivers[] entry may carry `fill: true` — a LAKE /
// CALDERA / flooded-hall DISC, not a linear flow. A fill entry BYPASSES the zoneCap clamp: its
// full authored width windows into the parcel honestly (UW2's Mere of Dominus ring reads as a
// real black lake, UW3's Magma Throne as a lava lake — not narrow stripes). The clamp exists to
// keep battle maps playable; for fill water playability is guaranteed downstream instead by the
// generator's carve + validateAndRepair machinery (water under a corridor/carve becomes a ROAD
// causeway/ford — on a water-dominant parcel the repair carve IS the causeway). The flag passes
// through on the output entry so generate.js paints the true footprint (paintFill). Same cap-free
// width for every parcel ⇒ the lake stays continuous across the mosaic, like any band.
const KIND_SPECS = {
  river: { list: "rivers", zoneCap: 0.26, minW: 4 },
  road:  { list: "roads",  zoneCap: 0.055, minW: 5 },
  ridge: { list: "ridges", zoneCap: 0.22, minW: 4 },
};
// Road HIERARCHY (CONTINUOUS-WORLD-TERRAIN + owner 2026-07-10): the world field carries tiered
// roads (highway / secondary / local). Tiers paint progressively thinner at battle scale — the
// same zone-unit cap for every parcel keeps the band continuous across neighbours, and the small
// world-unit floor (~4–5 u) keeps slivers legible. Un-tiered roads read as highways (back-compat).
const ROAD_TIERS = {
  highway:   { zoneCap: 0.055, minW: 5 },
  secondary: { zoneCap: 0.036, minW: 4.5 },
  local:     { zoneCap: 0.026, minW: 4 },
};

/**
 * Window the zone's macro feature network through one parcel.
 * @param field   loadWorldField(zone) result
 * @param parcel  { bbox:[x0,y0,x1,y1] (zone svg coords, y down),
 *                  polygonZone?: [[x,y],…] zone svg coords  — OR —
 *                  polygon?: [[x,z],…] generator frame (zone coords with y already negated),
 *                  sizeM?: 322 }
 * @returns { rivers, roads, ridges: [{ id, kind, width (world-units), tier? (roads: highway|
 *            secondary|local), fill? (rivers: true = lake/caldera, honest uncapped width —
 *            generate.js paints its true footprint), pts [[x,z]…] battle frame }],
 *            castles: [{ id, kind (CASTLE|PALACE|KEEP), name, at:[x,z] battle frame,
 *            townEstateId?, heroParcels?: string[], heroParcelsNote? }] — the world fortification
 *            POIs on THIS parcel (v1: the parcel containing the POI point; generate.js grows the
 *            WALL/GATE/TOWER ring from it). heroParcels = the estate's HERO-MODE (3D) POI L3
 *            parcelIds, castle parcel first (canon decision 18 / CONTINUOUS-WORLD-TERRAIN §3d),
 *            passed through verbatim from the world field for the CF sim,
 *            edgeCrossings: [{ featureId, kind, at:[x,z], edge:"N|E|S|W", edgeIndex }] }
 */
export function featuresForParcel(field, parcel) {
  const sizeM = parcel.sizeM || 322;
  const [bx0, by0, bx1, by1] = parcel.bbox;
  const zonePoly = (Array.isArray(parcel.polygonZone) && parcel.polygonZone.length >= 3 && parcel.polygonZone)
    || (Array.isArray(parcel.polygon) && parcel.polygon.length >= 3 && parcel.polygon.map(([x, z]) => [x, -z]))
    || [[bx0, by1], [bx1, by1], [bx1, by0], [bx0, by0]];   // rect in the generator square's vertex order (SW,SE,NE,NW)
  const genPoly = zonePoly.map(([x, y]) => [x, -y]);
  const fit = fitToArena(genPoly, sizeM);
  const toArena = (x, y) => [r1((x - fit.cx) * fit.s), r1((-y - fit.cz) * fit.s)];
  let ccx = 0, ccz = 0;                                     // boundary centroid (battle frame) for edge labels
  for (const [x, y] of zonePoly) { const [X, Z] = toArena(x, y); ccx += X; ccz += Z; }
  ccx /= zonePoly.length; ccz /= zonePoly.length;
  const label = (X, Z) => { const bx = X - ccx, bz = Z - ccz; return Math.abs(bz) >= Math.abs(bx) ? (bz >= 0 ? "N" : "S") : (bx >= 0 ? "E" : "W"); };

  const out = { rivers: [], roads: [], ridges: [], castles: [], edgeCrossings: [] };
  // castles: a fortification POI lands on the ONE parcel whose footprint contains its point
  // (v1 — neighbours don't render the spill-over; the wall ring lives on the castle's parcel).
  for (const c of field?.castles || []) {
    if (!Array.isArray(c.at) || c.at.length < 2) continue;
    const [cx, cy] = c.at;
    if (cx < bx0 || cx > bx1 || cy < by0 || cy > by1) continue;
    out.castles.push({ id: c.id, kind: c.kind || "CASTLE", name: c.name || c.id, at: toArena(cx, cy),
      ...(c.townEstateId ? { townEstateId: c.townEstateId } : {}),
      ...(Array.isArray(c.heroParcels) ? { heroParcels: c.heroParcels } : {}),
      ...(c.heroParcelsNote ? { heroParcelsNote: c.heroParcelsNote } : {}),
      ...(c.estateMapId ? { estateMapId: c.estateMapId } : {}) });   // PALACE: the pre-designed estate map's key
  }
  const baseMar = 0.25 * Math.max(bx1 - bx0, by1 - by0, 0.05);
  for (const [kind, spec] of Object.entries(KIND_SPECS)) {
    for (const f of field?.[spec.list] || []) {
      if (!Array.isArray(f.pts) || f.pts.length < 2) continue;
      const tier = kind === "road" ? (ROAD_TIERS[f.tier] ? f.tier : "highway") : null;
      const tierSpec = tier ? ROAD_TIERS[tier] : spec;
      const isFill = kind === "river" && f.fill === true;    // lake/caldera disc — honest full width
      const wZone = isFill
        ? (typeof f.width === "number" ? f.width : 0.1)      // fill bypasses the zoneCap clamp
        : Math.min(typeof f.width === "number" ? f.width : 0.1, tierSpec.zoneCap);
      const mar = baseMar + wZone / 2;                       // wide bands near the edge still paint
      const runs = windowPolyline(f.pts, [bx0 - mar, by0 - mar, bx1 + mar, by1 + mar]);
      for (let r = 0; r < runs.length; r++) {
        const zonePts = runs[r];
        const width = r1(Math.max(tierSpec.minW, wZone * fit.s));
        out[spec.list].push({ id: runs.length > 1 ? `${f.id}#${r}` : f.id, kind, width,
          ...(tier ? { tier } : {}),
          ...(isFill ? { fill: true } : {}),
          pts: zonePts.map(([x, y]) => toArena(x, y)) });
        // edge crossings: where the dense curve pierces the parcel BOUNDARY polygon — the
        // continuity contract points (frozen under terraform; entries snap to them).
        for (let i = 1; i < zonePts.length; i++) {
          for (let e = 0; e < zonePoly.length; e++) {
            const a = zonePoly[e], b = zonePoly[(e + 1) % zonePoly.length];
            const hit = segX(zonePts[i - 1][0], zonePts[i - 1][1], zonePts[i][0], zonePts[i][1], a[0], a[1], b[0], b[1]);
            if (!hit) continue;
            const at = toArena(hit[0], hit[1]);
            out.edgeCrossings.push({ featureId: f.id, kind, at, edge: label(at[0], at[1]), edgeIndex: e });
          }
        }
      }
    }
  }
  return out;
}

// convenience: hexagon-city l3 snapshot row ({parcelId, zone, bbox, svgPath, …}) → a generate()-
// ready parcel: real polygon (generator frame, +z north) + the windowed world features.
export function worldParcel(snap, opts = {}) {
  const zonePoly = snap.svgPath ? svgPathToPolygon(snap.svgPath) : null;
  const parcel = {
    parcelId: String(snap.parcelId), zone: snap.zone || "", bbox: snap.bbox,
    ...(zonePoly && zonePoly.length >= 3 ? { polygon: zonePoly.map(([x, y]) => [x, -y]) } : {}),
    ...opts,
  };
  const field = loadWorldField(parcel.zone);
  if (field && Array.isArray(snap.bbox))
    parcel.worldField = featuresForParcel(field, { bbox: snap.bbox, polygonZone: zonePoly, sizeM: opts.sizeM || 322 });
  return parcel;
}
