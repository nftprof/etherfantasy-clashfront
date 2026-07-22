// command_converter.js — raster generator artifact → A1 Battlefield JSON (the command-view contract).
//
// WHY: the map generator bakes a RASTER artifact (a 161×161 terrain grid + décor props + bare lane
// point-arrays + EMPTY structures). CF's command view (`apps/server/public/js/battle.js
// drawBattlefieldMap`) and the MOBA loader consume the VECTOR A1 schema
// (`docs/briefs/BATTLEFIELD-SCHEMA.md`): `bounds` + obstacle footprint polygons + `lanes[]{id,side,
// waypoints}` + `structures[]` incl. CORE. Fed the raw artifact, the command view renders nearly
// empty (no terrain, no bases). This converter closes that gap deterministically:
//   • clusters BLOCKED terrain cells (FOREST/WATER/ROCK/CLIFF) into obstacle footprint polygons
//     (passable:false — the walkability TRUTH), keeping décor props as passable:true visual layer;
//   • wraps bare lane arrays as {id, side, waypoints};
//   • synthesizes CORE/GATE/TOWER structures from the base spawn zones (matching legacy-*.json);
//   • stamps ids everywhere; normalizes buildSpots.size numeric → "S"/"M"/"L" enum + side;
//   • carries meta.biome/sizeClass/sizeM/laneCount so the renderer palettes + projects correctly.
//
// Pure + deterministic (no Date.now / Math.random): same artifact ⇒ byte-identical A1 object.

import { T, CELL_M, worldOf, cellOf } from "./schema.js";

// Base-clear pocket (world-units) force-opened around each CORE / spawn so the command view keeps a
// clean staging area and CF's validator invariants 1 (spawn→base corridor) + 4 (base clear radius)
// hold by construction. Slightly wider than CF's ⚙ BASE_CLEAR_M (14) to cover footprint-vertex slop.
const CORE_CLEAR = 18;
const SPAWN_CLEAR = 8;
const LANE_CLEAR = 4;  // half-width of the insurance corridor swept clear along each lane centerline —
                       // must stay ≤ the generator's carved lane half-width (~5 u) so the vector A1
                       // never opens ground the raster grid kept blocked (walkability parity)
const NODE_CLEAR = 4;  // pocket around each resource node / mob camp — a node must be reachable to be
                       // harvested/fought (real MOBA maps put them IN the jungle with a small clearing)
const GATE_INSET = 14; // GATE sits this far toward centre from the CORE (destructible outer door)

// terrain code → A1 obstacle kind (for footprints derived from the grid = the real blockers)
const TERRAIN_KIND = { [T.FOREST]: "FOREST", [T.ROCK]: "ROCK", [T.WATER]: "WATER", [T.CLIFF]: "CLIFF" };
// which terrain codes we vectorize into passable:false footprints (OOB = outside the parcel, handled
// by the bounds polygon, never an obstacle; ROAD/OPEN are walkable)
const FOOTPRINT_CODES = [T.FOREST, T.ROCK, T.WATER, T.CLIFF];

const MIN_FOOTPRINT_CELLS = 4;   // smaller specks become a single round obstacle, not a polygon
const MAX_FOOTPRINT_VERTS = 256; // decimate only truly huge outlines — MOBA-density jungle masses
                                 // need the headroom or decimation cuts across carved corridors

function b64ToU8(b64) {
  if (!b64) return new Uint8Array(0);
  // Buffer in Node; portable enough for the map-service (always run under Node/ESM).
  return new Uint8Array(Buffer.from(b64, "base64"));
}

// corner (grid-line) coordinate → world coord. A corner sits on a cell boundary; worldOf() maps cell
// CENTERS, so a corner at grid-line `c` is worldOf(G,c) - CELL_M/2 (half a cell back from center c).
const cornerWorld = (G, c) => worldOf(G, c) - CELL_M / 2;

// 4-connected components of a predicate over the grid (iterative flood fill; deterministic order).
function components(cells, w, h, wanted) {
  const seen = new Uint8Array(w * h);
  const out = [];
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      if (seen[i] || cells[i] !== wanted) continue;
      const stack = [i];
      seen[i] = 1;
      const comp = [];
      while (stack.length) {
        const j = stack.pop();
        comp.push(j);
        const cx = j % w, cz = (j / w) | 0;
        const nb = [[cx - 1, cz], [cx + 1, cz], [cx, cz - 1], [cx, cz + 1]];
        for (const [nx, nz] of nb) {
          if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
          const nj = nz * w + nx;
          if (!seen[nj] && cells[nj] === wanted) { seen[nj] = 1; stack.push(nj); }
        }
      }
      out.push(comp);
    }
  }
  return out;
}

// Trace the outer outline of a connected cell component as an ordered corner-loop. Collect every
// boundary edge (a cell side with no same-component neighbour), stitch edges into loops, return the
// largest-area loop (the outer ring; interior holes are dropped — footprints are simple polygons).
function traceOutline(comp, w, h) {
  const inComp = new Set(comp);
  const has = (x, z) => x >= 0 && z >= 0 && x < w && z < h && inComp.has(z * w + x);
  // edge key: "ax,az>bx,bz" wound so the component is on the LEFT (consistent CCW-ish stitching).
  const edges = new Map(); // startCornerKey -> endCornerKey
  const ck = (x, z) => x + "," + z;
  for (const j of comp) {
    const cx = j % w, cz = (j / w) | 0;
    // top side (−z neighbour empty): edge (cx+1,cz)->(cx,cz)
    if (!has(cx, cz - 1)) edges.set(ck(cx + 1, cz), ck(cx, cz));
    // bottom side (+z empty): edge (cx,cz+1)->(cx+1,cz+1)
    if (!has(cx, cz + 1)) edges.set(ck(cx, cz + 1), ck(cx + 1, cz + 1));
    // left side (−x empty): edge (cx,cz)->(cx,cz+1)
    if (!has(cx - 1, cz)) edges.set(ck(cx, cz), ck(cx, cz + 1));
    // right side (+x empty): edge (cx+1,cz+1)->(cx+1,cz)
    if (!has(cx + 1, cz)) edges.set(ck(cx + 1, cz + 1), ck(cx + 1, cz));
  }
  // stitch into loops
  const loops = [];
  const used = new Set();
  for (const start of edges.keys()) {
    if (used.has(start)) continue;
    const loop = [];
    let cur = start;
    let guard = 0;
    while (cur !== undefined && !used.has(cur) && guard++ < edges.size + 4) {
      used.add(cur);
      const [x, z] = cur.split(",").map(Number);
      loop.push([x, z]);
      cur = edges.get(cur);
      if (cur === start) break;
    }
    if (loop.length >= 4) loops.push(loop);
  }
  if (!loops.length) return null;
  // pick the largest by |signed area|
  const area = (loop) => {
    let a = 0;
    for (let i = 0, k = loop.length - 1; i < loop.length; k = i++)
      a += (loop[k][0] * loop[i][1] - loop[i][0] * loop[k][1]);
    return Math.abs(a) / 2;
  };
  return loops.reduce((best, l) => (area(l) > area(best) ? l : best), loops[0]);
}

// remove collinear corner runs, then decimate to a vertex cap; convert to world coords.
function outlineToFootprint(loop, w, h) {
  const pts = loop;
  const keep = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (cross !== 0) keep.push(b); // corner (direction change) — drop straight-run midpoints
  }
  let simplified = keep.length >= 3 ? keep : pts;
  if (simplified.length > MAX_FOOTPRINT_VERTS) {
    const step = Math.ceil(simplified.length / MAX_FOOTPRINT_VERTS);
    simplified = simplified.filter((_, i) => i % step === 0);
  }
  return simplified.map(([cx, cz]) => [
    +cornerWorld(w, cx).toFixed(2),
    +cornerWorld(h, cz).toFixed(2),
  ]);
}

// component centroid + radius (world) for the small-speck round-obstacle fallback.
function compCircle(comp, w, h) {
  let sx = 0, sz = 0;
  for (const j of comp) { sx += j % w; sz += (j / w) | 0; }
  const cx = sx / comp.length, cz = sz / comp.length;
  const x = +worldOf(w, cx).toFixed(2), z = +worldOf(h, cz).toFixed(2);
  // r ≈ radius of a disc covering `n` cells: sqrt(n/π)·CELL_M, min one cell.
  const r = +Math.max(CELL_M, Math.sqrt(comp.length / Math.PI) * CELL_M).toFixed(2);
  return { x, z, r };
}

// Exact outline tracer — the REPAIR-ONLY variant of traceOutline. The default tracer keys its
// boundary-edge map by start corner, so at a diagonal-pinch SADDLE (two blocked cells of the same
// component touching corner-to-corner) two edges share a start corner and one is silently
// overwritten: the stitched walk merges the two contours, truncates at the first revisited corner,
// and the implicit closing edge of the resulting OPEN polyline can cut across genuinely open
// ground (the "swallowed pocket" failure — e.g. EDU 60203580005's forest_38 covering two snapped
// build spots). This variant keeps a MULTIMAP of edges + a per-EDGE used set and resolves each
// saddle with the standard marching-squares rule — take the LEFT turn (hug the cell just traced),
// so every contour closes on itself and the polygon covers exactly the component's cells.
// NOT used on the default path: passing maps' committed footprints must stay byte-identical
// (harmless saddle artifacts exist there too); the repair pass swaps this in only for maps that
// fail the CF validator (see repairA1 below).
function traceOutlineExact(comp, w, h) {
  const inComp = new Set(comp);
  const has = (x, z) => x >= 0 && z >= 0 && x < w && z < h && inComp.has(z * w + x);
  const edges = [];            // [ax, az, bx, bz] wound with the component on the LEFT
  const bySrc = new Map();     // "ax,az" -> [edge indices]
  const add = (ax, az, bx, bz) => {
    const k = ax + "," + az;
    (bySrc.get(k) ?? bySrc.set(k, []).get(k)).push(edges.length);
    edges.push([ax, az, bx, bz]);
  };
  for (const j of comp) {
    const cx = j % w, cz = (j / w) | 0;
    if (!has(cx, cz - 1)) add(cx + 1, cz, cx, cz);
    if (!has(cx, cz + 1)) add(cx, cz + 1, cx + 1, cz + 1);
    if (!has(cx - 1, cz)) add(cx, cz, cx, cz + 1);
    if (!has(cx + 1, cz)) add(cx + 1, cz + 1, cx + 1, cz);
  }
  const used = new Uint8Array(edges.length);
  const loops = [];
  for (let e0 = 0; e0 < edges.length; e0++) {
    if (used[e0]) continue;
    const loop = [];
    const [sx, sz] = edges[e0];
    let e = e0, guard = 0;
    while (guard++ <= edges.length) {
      used[e] = 1;
      const [ax, az, bx, bz] = edges[e];
      loop.push([ax, az]);
      if (bx === sx && bz === sz) break;                 // contour closed at the loop start
      const cand = (bySrc.get(bx + "," + bz) ?? []).filter((i) => !used[i]);
      if (!cand.length) break;                           // balanced corners ⇒ shouldn't happen
      let pick = cand[0];
      if (cand.length > 1) {                             // saddle: LEFT turn = min cross product
        const dx = bx - ax, dz = bz - az;
        let best = Infinity;
        for (const i of cand) {
          const cross = dx * (edges[i][3] - bz) - dz * (edges[i][2] - bx);
          if (cross < best) { best = cross; pick = i; }
        }
      }
      e = pick;
    }
    if (loop.length >= 4) loops.push(loop);
  }
  if (!loops.length) return null;
  const area = (loop) => {
    let a = 0;
    for (let i = 0, k = loop.length - 1; i < loop.length; k = i++)
      a += (loop[k][0] * loop[i][1] - loop[i][0] * loop[k][1]);
    return Math.abs(a) / 2;
  };
  return loops.reduce((best, l) => (area(l) > area(best) ? l : best), loops[0]);
}

// grid → passable:false obstacle list (footprints for real regions, circles for specks).
// `clearPts` = world points (bases/spawns) whose surrounding pocket is force-opened so the command
// view + validator see a clean staging area (the generator stages units there; terrain must not seal
// it). Returns a COPY of the grid with those cells set OPEN — never mutates the caller's buffer.
// `trace` = the outline tracer (default naive traceOutline; the repair pass injects traceOutlineExact).
function terrainObstacles(terrain, clearPts = [], trace = traceOutline) {
  const src = b64ToU8(terrain.cells);
  const w = terrain.w, h = terrain.h;
  if (!src.length || !w || !h) return [];
  const cells = new Uint8Array(src); // copy — determinism + no aliasing
  // 1) CONNECTIVITY CARVE, on the ORIGINAL grid state: a clear point buried inside a blocked blob
  //    gets a channel to the nearest open ground (BFS, deterministic). Done BEFORE pocket-punching
  //    (a punched pocket is locally open, which would mask enclosure) — the blob indents/splits so
  //    the outer-ring outline can't swallow the node: a real jungle-camp clearing, not a sealed hole.
  const open = (i) => cells[i] === T.OPEN || cells[i] === T.ROAD;
  for (const { x, z } of clearPts) {
    const cx0 = cellOf(w, x), cz0 = cellOf(h, z);
    if (cx0 < 0 || cz0 < 0 || cx0 >= w || cz0 >= h) continue;
    const start = cz0 * w + cx0;
    if (open(start)) continue;                    // already on the field (original grid) — nothing to carve
    const prev = new Int32Array(w * h).fill(-1);
    const seen = new Uint8Array(w * h);
    const q = [start]; seen[start] = 1;
    let hit = -1;
    while (q.length && hit < 0) {
      const cur = q.shift();
      const ccx = cur % w, ccz = (cur / w) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = ccx + dx, nz = ccz + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const ni = nz * w + nx;
        if (seen[ni] || cells[ni] === T.OOB) continue;
        seen[ni] = 1; prev[ni] = cur;
        if (open(ni)) { hit = ni; break; }
        q.push(ni);
      }
    }
    for (let cur = hit; cur >= 0; cur = prev[cur]) {  // open the path INCLUDING start (2-wide, survives outlining)
      cells[cur] = T.OPEN;
      if ((cur % w) + 1 < w && cells[cur + 1] !== T.OOB) cells[cur + 1] = T.OPEN;
      if (cur === start) break;
    }
  }
  // 2) pocket-punch the staging areas
  for (const { x, z, r } of clearPts) {
    const cx0 = cellOf(w, x), cz0 = cellOf(h, z);
    const rad = Math.ceil(r / CELL_M);
    for (let dz = -rad; dz <= rad; dz++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const nx = cx0 + dx, nz = cz0 + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        if (dx * dx + dz * dz > rad * rad) continue;
        const i = nz * w + nx;
        if (cells[i] !== T.OOB) cells[i] = T.OPEN; // never open the void rim (that's outside bounds)
      }
    }
  }
  const out = [];
  for (const code of FOOTPRINT_CODES) {
    const kind = TERRAIN_KIND[code];
    let n = 0;
    for (const comp of components(cells, w, h, code)) {
      const id = `${kind.toLowerCase()}_${n++}`;
      if (comp.length < MIN_FOOTPRINT_CELLS) {
        const { x, z, r } = compCircle(comp, w, h);
        out.push({ id, kind, x, z, r, passable: false });
        continue;
      }
      const loop = trace(comp, w, h);
      if (!loop) { const { x, z, r } = compCircle(comp, w, h); out.push({ id, kind, x, z, r, passable: false }); continue; }
      const footprint = outlineToFootprint(loop, w, h);
      if (footprint.length >= 3) out.push({ id, kind, footprint, passable: false });
      else { const { x, z, r } = compCircle(comp, w, h); out.push({ id, kind, x, z, r, passable: false }); }
    }
  }
  return out;
}

// décor props (artifact.obstacles) → passable:true visual layer (the grid already owns walkability).
// RUINs (the seeded Chronicle layer) carry their lore through — like resource nodes they are
// non-blocking decorative anchors in the A1 (kind "RUIN", passable:true, + ruinType/name/inscription).
// WORLD-ELEMENTS OVERLAY décor (docs/briefs/WORLD-ELEMENTS-OVERLAY.md) rides the same channel:
// a prop carrying `layer` is an overlay element (kind = the element's open kind, e.g. QUEST_SITE)
// and keeps its layer/name/note/singularId/loreRef so any consumer (Hunt, the CF command view)
// can pick its own layer's elements back off the battlefield JSON.
function decorObstacles(list) {
  let auto = 0;   // fallback ids count only id-less props, so prepended overlay décor (which
                  // always carries its element id) never shifts the prop_N numbering
  return (list ?? []).map((o) => ({
    id: o.id ?? `prop_${auto++}`,
    kind: String(o.kind ?? "TREE").toUpperCase(),
    x: o.x ?? 0, z: o.z ?? 0, r: o.r ?? 3,
    passable: true,
    ...(o.kind === "RUIN" ? { ruinType: o.ruinType, name: o.name, inscription: o.inscription } : {}),
    ...(o.layer ? {
      layer: o.layer,
      ...(o.name ? { name: o.name } : {}),
      ...(o.note ? { note: o.note } : {}),
      ...(o.singularId ? { singularId: o.singularId } : {}),
      ...(o.loreRef ? { loreRef: o.loreRef } : {}),
    } : {}),
  }));
}

// bare lane point-arrays → A1 {id, side, waypoints}. Lane 0 is the attacker push; extras keep side.
function convertLanes(lanes) {
  return (lanes ?? []).map((wp, i) => ({
    id: i === 0 ? "lane_mid" : `lane_${i}`,
    side: "ATTACKER",
    waypoints: (wp ?? []).map(([x, z]) => [x, z]),
  }));
}

// the ATTACKER / DEFENDER base spawn anchors the generator guarantees are walkable + lane-connected.
// We anchor CORE on THESE (not a fixed ±114.8) so bases sit exactly where the generator staged them
// (its raster is asymmetric: atk ≈ z−150, def ≈ z+132). ±114.8 is the stand-in convention; a
// generated map's real cleared base is authoritative. GATE is inset toward centre along the axis.
function baseAnchors(spawnZones) {
  const atk = spawnZones.find((s) => s.side === "ATTACKER") ?? { x: 0, z: -150 };
  const def = spawnZones.find((s) => s.side === "DEFENDER") ?? { x: 0, z: 132 };
  return { atk: { x: atk.x, z: atk.z }, def: { x: def.x, z: def.z } };
}
const towardCenter = (p, d) => {
  const m = Math.hypot(p.x, p.z) || 1;
  return { x: +(p.x - (p.x / m) * d).toFixed(1), z: +(p.z - (p.z / m) * d).toFixed(1) };
};

// point at arc-length fraction t along a waypoint polyline (lanes carry corner waypoints only,
// so index-rounding would snap every tower to a corner — arc-length walks the actual road).
function arcAt(wp, t) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < wp.length; i++) { const d = Math.hypot(wp[i][0] - wp[i - 1][0], wp[i][1] - wp[i - 1][1]); segs.push(d); total += d; }
  let want = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? want / segs[i] : 0;
      return [wp[i][0] + (wp[i + 1][0] - wp[i][0]) * f, wp[i][1] + (wp[i + 1][1] - wp[i][1]) * f];
    }
    want -= segs[i];
  }
  return wp[0];
}

// synthesize CORE + GATE + TOWER anchors from the base spawn zones + lanes (empty in raster).
// Tower chains mirror the golden reference (examples/moba-singleplayer.artifact.json): per lane,
// two ATTACKER towers on the attacker half + two DEFENDER towers on the defender half — 12 towers
// on a 3-lane map, 4 on a single-lane map, sitting ON the carved lane corridor (walkable ground).
const TOWER_TS = { ATTACKER: [0.17, 0.34], DEFENDER: [0.66, 0.83] };
function synthStructures(spawnZones, lanes) {
  const out = [];
  const { atk, def } = baseAnchors(spawnZones);
  const aGate = towardCenter(atk, GATE_INSET), dGate = towardCenter(def, GATE_INSET);
  out.push({ anchorId: "core_atk", kind: "CORE", side: "ATTACKER", x: +atk.x.toFixed(1), z: +atk.z.toFixed(1) });
  out.push({ anchorId: "core_def", kind: "CORE", side: "DEFENDER", x: +def.x.toFixed(1), z: +def.z.toFixed(1) });
  out.push({ anchorId: "gate_atk", kind: "GATE", side: "ATTACKER", x: aGate.x, z: aGate.z });
  out.push({ anchorId: "gate_def", kind: "GATE", side: "DEFENDER", x: dGate.x, z: dGate.z });
  for (let li = 0; li < (lanes ?? []).length; li++) {
    const wp = lanes[li]?.waypoints ?? [];
    if (wp.length < 2) continue;
    for (const side of ["ATTACKER", "DEFENDER"]) {
      TOWER_TS[side].forEach((t, k) => {
        const [x, z] = arcAt(wp, t);
        out.push({ anchorId: `t_${side === "ATTACKER" ? "atk" : "def"}_l${li}_${k}`, kind: "TOWER", side,
          x: +x.toFixed(1), z: +z.toFixed(1) });
      });
    }
  }
  return out;
}

// sample clear-pocket circles along every lane centerline (the generator's guaranteed corridor) so
// vectorized terrain never seals a lane. Points are placed ≤ CELL_M apart, matching the validator's
// segmentWalkable step so each probed point falls inside a cleared circle.
function laneClearPts(lanes) {
  const pts = [];
  for (const lane of lanes ?? []) {
    const wp = lane.waypoints ?? [];
    for (let i = 1; i < wp.length; i++) {
      const [ax, az] = wp[i - 1], [bx, bz] = wp[i];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(len / CELL_M));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        pts.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, r: LANE_CLEAR });
      }
    }
  }
  return pts;
}

// ═══ A1 REPAIR PASS ═══════════════════════════════════════════════════════════════════════════
// Exact replicas of CF's playability validator geometry (apps/server/src/battlefield.ts —
// pointInPoly ε-guard, ≤r circle rule, 2-unit segment sampling, the 4 geometric invariants).
// The repair gate must agree with that validator EXACTLY: a map it passes is returned UNTOUCHED
// (the byte-identity guarantee for every committed passing map); only a map it would REJECT is
// repaired. Never weakens the validator — it makes the geometry actually satisfy it.
const vPoly = (poly, x, z) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};
const vImp = (o) => o.passable !== true &&
  ((typeof o.r === "number" && o.r > 0) || (Array.isArray(o.footprint) && o.footprint.length >= 3));
const vIn = (o, x, z) =>
  typeof o.r === "number" && typeof o.x === "number" && typeof o.z === "number"
    ? Math.hypot(x - o.x, z - o.z) <= o.r
    : Array.isArray(o.footprint) && o.footprint.length >= 3 && vPoly(o.footprint, x, z);
const vWalk = (bf, x, z) => {
  if (!vPoly(bf.arena.bounds, x, z)) return false;
  for (const o of bf.obstacles ?? []) if (vImp(o) && vIn(o, x, z)) return false;
  return true;
};
const vSeg = (bf, a, b, stepM = 2) => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(len / stepM));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!vWalk(bf, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
  }
  return true;
};
const V_BASE_CLEAR = 14; // must track BASE_CLEAR_M in apps/server/src/battlefield.ts

// would CF's validateBattlefield reject this A1? (invariant 5 = meta.seed is stamped upstream)
function vFails(bf) {
  for (const sp of bf.spawnZones ?? []) {                       // invariant 1
    if (!vWalk(bf, sp.x, sp.z)) return true;
    const core = (bf.structures ?? []).find((s) => s.kind === "CORE" && s.side === sp.side);
    if (core && !vSeg(bf, [sp.x, sp.z], [core.x, core.z])) return true;
  }
  for (const lane of bf.lanes ?? []) {                          // invariant 2
    const wp = lane.waypoints ?? [];
    for (let i = 1; i < wp.length; i++) if (!vSeg(bf, wp[i - 1], wp[i])) return true;
  }
  for (const b of bf.buildSpots ?? []) if (!vWalk(bf, b.x, b.z)) return true;   // invariant 3
  for (const r of bf.resources ?? []) if (!vWalk(bf, r.x, r.z)) return true;
  for (const s of bf.structures ?? []) if (!vWalk(bf, s.x, s.z)) return true;
  for (const m of bf.mobs ?? []) if (!vWalk(bf, m.x, m.z)) return true;
  for (const core of (bf.structures ?? []).filter((s) => s.kind === "CORE")) { // invariant 4
    for (const o of bf.obstacles ?? []) {
      if (!vImp(o)) continue;
      let near = false;
      if (typeof o.r === "number" && typeof o.x === "number" && typeof o.z === "number")
        near = Math.hypot(core.x - o.x, core.z - o.z) - o.r < V_BASE_CLEAR;
      else if (Array.isArray(o.footprint))
        near = o.footprint.some((p) => Math.hypot(core.x - p[0], core.z - p[1]) < V_BASE_CLEAR);
      if (near) return true;
    }
  }
  return false;
}

/**
 * Repair an A1 that CF's validator would reject (extreme SLIVER parcels etc.) — the default
 * conversion is kept byte-identical for every passing map; this runs ONLY on failures.
 *   1. re-vectorize the terrain with traceOutlineExact (fixes swallowed-pocket footprints —
 *      the naive tracer's saddle truncation is the root cause of most failures);
 *   2. snap mandatory anchors (resources/spawns/structures/mobs) onto A1-walkable ground;
 *   3. DROP optional buildSpots still on unwalkable ground (they are optional anchors —
 *      spawns/cores are never droppable);
 *   4. re-route lane waypoints that are unwalkable/out-of-bounds (a sliver's DECLARED carved
 *      polyline can exit the parcel polygon — carve never opens OOB) by snapping them onto the
 *      walkable field and BFS-ing blocked segments across the A1 walk grid (deterministic;
 *      axis-aligned cell-center chains are exactly what the validator's 2-unit sampler probes).
 * Anything still unrepairable stays visibly broken so the bake census reports it — repairs
 * never mask a failure. Deterministic throughout (no rng).
 */
function repairA1(bf, terrain, clearPts) {
  const G = terrain?.w ?? 161;
  // 1) exact re-trace (same component enumeration ⇒ same obstacle ids; decor untouched)
  const decor = (bf.obstacles ?? []).filter((o) => o.passable === true);
  bf.obstacles = [...terrainObstacles(terrain ?? {}, clearPts, traceOutlineExact), ...decor];

  // A1 walk grid at cell centers (lazy — only failing maps pay for it)
  let walk = null;
  const walkable = (cx, cz) => {
    if (cx < 0 || cz < 0 || cx >= G || cz >= G) return false;
    if (!walk) walk = new Int8Array(G * G).fill(-1);
    const i = cz * G + cx;
    if (walk[i] < 0) walk[i] = vWalk(bf, worldOf(G, cx), worldOf(G, cz)) ? 1 : 0;
    return walk[i] === 1;
  };
  // nearest A1-walkable cell CENTER (deterministic ring scan, same shape as validate.js
  // nearestOpen); `also` = extra acceptance predicate on the candidate world point (CORE clearance)
  const nearestCenter = (x, z, rMax = 30, also = null) => {
    const ok = (cx, cz) => walkable(cx, cz) && (!also || also(worldOf(G, cx), worldOf(G, cz)));
    const cx0 = cellOf(G, x), cz0 = cellOf(G, z);
    if (ok(cx0, cz0)) return [worldOf(G, cx0), worldOf(G, cz0)];
    for (let r = 1; r <= rMax; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (ok(cx0 + dx, cz0 + dz)) return [worldOf(G, cx0 + dx), worldOf(G, cz0 + dz)];
    }
    return null;
  };

  // CORE clearance (invariant 4, validator-exact): every impassable circle ≥ BASE_CLEAR beyond
  // its radius, every footprint VERTEX ≥ BASE_CLEAR away.
  const coreClear = (x, z) => {
    for (const o of bf.obstacles ?? []) {
      if (!vImp(o)) continue;
      if (typeof o.r === "number" && typeof o.x === "number" && typeof o.z === "number") {
        if (Math.hypot(x - o.x, z - o.z) - o.r < V_BASE_CLEAR) return false;
      } else if (Array.isArray(o.footprint)) {
        if (o.footprint.some((p) => Math.hypot(x - p[0], z - p[1]) < V_BASE_CLEAR)) return false;
      }
    }
    return true;
  };

  // 2) mandatory anchors onto walkable ground (usually already fixed by the exact re-trace).
  //    CORES first, clearance-aware (a walkability-only snap could park a core against a rock
  //    face and trip invariant 4); the same-side base spawn then CO-LOCATES with a moved core —
  //    the generator's own convention (core == base spawn) — so invariant 1's straight corridor
  //    stays zero-length and trivially walkable.
  const extraClear = [];                             // punched-on-demand base pockets (see below)
  for (const s of bf.structures ?? []) {
    if (s.kind !== "CORE") continue;
    if (vWalk(bf, s.x, s.z) && coreClear(s.x, s.z)) continue;
    let p = nearestCenter(s.x, s.z, 30, (x, z) => coreClear(x, z));
    if (!p) {
      // no walkable+clear spot in reach (rock-lined sliver): take the nearest WALKABLE one and
      // punch a fresh base pocket around it — the converter's established clear-pocket pattern
      // (BFS carve + punch on the grid copy), so clearance holds by construction (18 > 14+slop)
      p = nearestCenter(s.x, s.z);
      if (!p) continue;                              // leave visible for the census
      extraClear.push({ x: p[0], z: p[1], r: CORE_CLEAR });
    }
    s.x = p[0]; s.z = p[1];
    for (const sp of bf.spawnZones ?? []) if (sp.side === s.side) { sp.x = p[0]; sp.z = p[1]; }
  }
  if (extraClear.length) {                           // re-vectorize with the new base pockets
    const decor2 = (bf.obstacles ?? []).filter((o) => o.passable === true);
    bf.obstacles = [...terrainObstacles(terrain ?? {}, [...clearPts, ...extraClear], traceOutlineExact), ...decor2];
    walk = null;                                     // walkability changed — drop the cache
  }
  for (const list of [bf.resources, bf.spawnZones, bf.structures, bf.mobs]) {
    for (const it of list ?? []) {
      if (it.kind === "CORE" || vWalk(bf, it.x, it.z)) continue;
      const p = nearestCenter(it.x, it.z);
      if (p) { it.x = p[0]; it.z = p[1]; }
    }
  }
  // spawn→core straight corridor (invariant 1): colocate a spawn whose corridor is blocked
  // (only onto a core that actually stands on walkable ground — never inherit a broken spot)
  for (const sp of bf.spawnZones ?? []) {
    const core = (bf.structures ?? []).find((s) => s.kind === "CORE" && s.side === sp.side);
    if (core && vWalk(bf, core.x, core.z) && !vSeg(bf, [sp.x, sp.z], [core.x, core.z])) { sp.x = core.x; sp.z = core.z; }
  }
  // 3) optional buildSpots: drop what still sits on unwalkable ground
  bf.buildSpots = (bf.buildSpots ?? []).filter((b) => vWalk(bf, b.x, b.z));

  // 4) lanes: snap unwalkable waypoints, then BFS-reroute blocked segments across a walkable
  //    LATTICE of the arena. Multi-resolution: 2-unit first (matches the raster cell pitch),
  //    then 1 and 0.5 — a snaking sliver polygon can be so thin that only a finer lattice stays
  //    4-connected through it. Deterministic BFS (fixed neighbour order, first-found path).
  const lattices = new Map(); // step -> Int8Array walkability cache (-1 unknown)
  const latDim = (step) => Math.round(322 / step) + 1;
  const latWalk = (step, ix, iz) => {
    const M = latDim(step);
    if (ix < 0 || iz < 0 || ix >= M || iz >= M) return false;
    let c = lattices.get(step);
    if (!c) { c = new Int8Array(M * M).fill(-1); lattices.set(step, c); }
    const i = iz * M + ix;
    if (c[i] < 0) c[i] = vWalk(bf, -161 + ix * step, -161 + iz * step) ? 1 : 0;
    return c[i] === 1;
  };
  const latNode = (step, w) => Math.max(0, Math.min(latDim(step) - 1, Math.round((w + 161) / step)));
  // nearest walkable lattice node whose BRIDGE segment from the exact endpoint also passes the
  // validator's sampler — so the hop on/off the lattice is verified by construction (ring scan)
  const nearestLat = (step, x, z, rMax) => {
    const ix0 = latNode(step, x), iz0 = latNode(step, z);
    const good = (ix, iz) => latWalk(step, ix, iz) &&
      vSeg(bf, [x, z], [-161 + ix * step, -161 + iz * step]);
    if (good(ix0, iz0)) return [ix0, iz0];
    for (let r = 1; r <= rMax; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (good(ix0 + dx, iz0 + dz)) return [ix0 + dx, iz0 + dz];
    }
    return null;
  };
  const bfsLat = (step, a, b) => {           // world-point path a→b on the step lattice, or null
    const M = latDim(step);
    const sa = nearestLat(step, a[0], a[1], Math.ceil(4 / step));
    const sb = nearestLat(step, b[0], b[1], Math.ceil(4 / step));
    if (!sa || !sb) return null;
    const start = sa[1] * M + sa[0], goal = sb[1] * M + sb[0];
    const prev = new Int32Array(M * M).fill(-2);
    prev[start] = -1;
    if (start !== goal) {
      const q = [start];
      let found = false;
      for (let h = 0; h < q.length && !found; h++) {
        const cur = q[h], cx = cur % M, cz = (cur / M) | 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, nz = cz + dz;
          if (!latWalk(step, nx, nz)) continue;
          const ni = nz * M + nx;
          if (prev[ni] !== -2) continue;
          prev[ni] = cur;
          if (ni === goal) { found = true; break; }
          q.push(ni);
        }
      }
      if (!found) return null;
    }
    const cells = [];
    for (let i = goal; i >= 0; i = prev[i]) cells.push(i);
    cells.reverse();
    return cells.map((i) => [-161 + (i % M) * step, -161 + ((i / M) | 0) * step]);
  };
  // compress a node path to its direction-change nodes, but re-expand any compressed run the
  // validator's 2-unit sampler would still reject (a probe BETWEEN lattice nodes can exit an
  // ultra-thin bounds polygon; the raw ≤step-long hops are probed at their endpoints only)
  const compressVerified = (pts) => {
    const turnIdx = [0];
    for (let k = 1; k < pts.length - 1; k++) {
      if ((pts[k][0] - pts[k - 1][0]) !== (pts[k + 1][0] - pts[k][0]) ||
          (pts[k][1] - pts[k - 1][1]) !== (pts[k + 1][1] - pts[k][1])) turnIdx.push(k);
    }
    if (pts.length > 1) turnIdx.push(pts.length - 1);
    const emit = [pts[0]];
    for (let t = 1; t < turnIdx.length; t++) {
      const i0 = turnIdx[t - 1], i1 = turnIdx[t];
      if (vSeg(bf, pts[i0], pts[i1])) emit.push(pts[i1]);
      else for (let k = i0 + 1; k <= i1; k++) emit.push(pts[k]);
    }
    return emit;
  };
  for (const lane of bf.lanes ?? []) {
    const snapped = [];
    for (const [x, z] of lane.waypoints ?? []) {
      if (vWalk(bf, x, z)) { snapped.push([x, z]); continue; }
      const p = nearestCenter(x, z);
      if (p) snapped.push(p);                       // unsnappable waypoint (deep OOB) drops out
    }
    const out = snapped.slice(0, 1);
    for (let i = 1; i < snapped.length; i++) {
      const a = out[out.length - 1], b = snapped[i];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      if (vSeg(bf, a, b)) { out.push(b); continue; }
      let pts = null;
      for (const step of [2, 1, 0.5]) {
        pts = bfsLat(step, a, b);
        if (pts) break;
      }
      if (!pts) { out.push(b); continue; }          // no path — leave the failure VISIBLE
      for (const p of compressVerified(pts)) {      // bridges a→pts[0] / pts[end]→b verified by nearestLat
        const last = out[out.length - 1];
        if (p[0] !== last[0] || p[1] !== last[1]) out.push([p[0], p[1]]);
      }
      if (b[0] !== out[out.length - 1][0] || b[1] !== out[out.length - 1][1]) out.push(b);
    }
    lane.waypoints = out;
  }
  return bf;
}

const sizeEnum = (n) => (typeof n !== "number" ? "M" : n <= 4 ? "S" : n <= 8 ? "M" : "L");
// build spots: side hint from position (attacker south −z, defender north +z, else neutral).
function convertBuildSpots(list) {
  return (list ?? []).map((b, i) => {
    const out = { anchorId: b.anchorId ?? `spot_${i}`, x: b.x ?? 0, z: b.z ?? 0, size: sizeEnum(b.size) };
    if (typeof b.z === "number" && Math.abs(b.z) > 60) out.side = b.z < 0 ? "ATTACKER" : "DEFENDER";
    return out;
  });
}

/**
 * Convert a raster generator artifact into a conformant A1 Battlefield JSON object.
 * @param {object} artifact  the output of maps/generate.js `generate()`
 * @returns {object} A1 Battlefield JSON (docs/briefs/BATTLEFIELD-SCHEMA.md)
 */
export function toBattlefieldA1(artifact) {
  const a = artifact ?? {};
  const sizeM = a.arena?.sizeM ?? a.terrain?.cellM * (a.terrain?.w ?? 161) ?? 322;
  const lanes = convertLanes(a.lanes);
  const spawnZones = (a.spawnZones ?? []).map((s, i) => ({
    id: s.id ?? `spawn_${i}`,
    side: s.side ?? "ANY",
    edge: s.edge ?? "C",
    x: s.x ?? 0, z: s.z ?? 0,
    ...(s.canBase ? { canBase: true } : {}),
  }));
  // force-open a pocket around each base (CORE clearance) + every spawn so terrain never seals a
  // staging area — keeps CF validator invariants 1 (corridor) + 4 (base clear) true by construction.
  const { atk, def } = baseAnchors(spawnZones);
  const clearPts = [
    { x: atk.x, z: atk.z, r: CORE_CLEAR },
    { x: def.x, z: def.z, r: CORE_CLEAR },
    ...spawnZones.map((s) => ({ x: s.x, z: s.z, r: SPAWN_CLEAR })),
    ...laneClearPts(lanes),
    // jungle nodes get a small clearing so they sit ON walkable ground (CF invariant: resources
    // must be harvestable) — matches the real map, where camps/mines are pockets inside the jungle.
    ...(a.resources ?? []).map((r) => ({ x: r.x ?? 0, z: r.z ?? 0, r: NODE_CLEAR })),
    ...(a.mobs ?? []).map((m) => ({ x: m.x ?? 0, z: m.z ?? 0, r: NODE_CLEAR })),
  ];
  const obstacles = [...terrainObstacles(a.terrain ?? {}, clearPts), ...decorObstacles(a.obstacles)];
  // castle fortification anchors (castle-v1, generate.js castleLayout): authored castle_* WALL/
  // GATE/TOWER structures pass through to the A1 VERBATIM — walls are structures, not obstacles,
  // in v1 (they don't block the walk grid; the generator cleared the ground under the ring, so
  // CF invariant 3 "structures on walkable ground" holds). Non-castle artifact structures stay
  // game-time anchors (the synthesized reference chains below own the A1 towers).
  const castleStructures = (a.structures ?? [])
    .filter((s) => String(s.anchorId ?? "").startsWith("castle_"))
    .map((s) => ({ anchorId: s.anchorId, kind: String(s.kind ?? "WALL").toUpperCase(), side: s.side ?? "DEFENDER", x: s.x ?? 0, z: s.z ?? 0 }));
  const resources = (a.resources ?? []).map((r, i) => ({
    id: r.id ?? `res_${i}`, kind: String(r.kind ?? "GOLD_MINE").toUpperCase(),
    x: r.x ?? 0, z: r.z ?? 0, richness: r.richness ?? 1,
  }));
  const mobs = (a.mobs ?? []).map((m, i) => ({
    id: m.id ?? `camp_${i}`, kind: String(m.kind ?? "WOLF").toUpperCase(),
    x: m.x ?? 0, z: m.z ?? 0, count: m.count ?? 4,
  }));

  const bf = {
    v: 1,
    // standard siege block passthrough (MOBA contract fix 1, 2026-07-21): elevation tiers /
    // wallRing / gates / stairs / drawbridge ride the A1 verbatim on every parcel that has them.
    ...(a.siege ? { siege: a.siege } : {}),
    meta: {
      parcelId: a.meta?.parcelId ?? "UNKNOWN",
      seed: String(a.meta?.seed ?? ""),
      designVersion: a.meta?.designVersion ?? 0,
      biome: a.meta?.biome ?? "TEMPERATE_GRASS",
      palette: a.meta?.params?.palette ?? null,   // biome-derived ground palette (matches thumb/3D colour)
      sizeClass: a.meta?.sizeClass ?? a.meta?.params?.sizeClass ?? "SINGLE",
      sizeM,
      laneCount: a.laneCount ?? lanes.length ?? 1,
    },
    arena: { shape: "polygon", sizeM, bounds: a.arena?.bounds ?? [[-161, -161], [161, -161], [161, 161], [-161, 161]] },
    obstacles,
    resources,
    buildSpots: convertBuildSpots(a.buildSpots),
    spawnZones,
    lanes,
    structures: [...synthStructures(spawnZones, lanes), ...castleStructures],
    ...(mobs.length ? { mobs } : {}),
  };
  // Repair gate: a map CF's validator accepts is returned EXACTLY as built above (byte-identical
  // for every committed passing map); a map it would reject (extreme slivers) gets the repair pass.
  return vFails(bf) ? repairA1(bf, a.terrain, clearPts) : bf;
}

export default toBattlefieldA1;
