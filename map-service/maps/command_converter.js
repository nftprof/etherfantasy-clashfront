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
const LANE_CLEAR = 5;  // half-width of the walkable corridor swept clear along each lane centerline
const NODE_CLEAR = 4;  // pocket around each resource node / mob camp — a node must be reachable to be
                       // harvested/fought (real MOBA maps put them IN the jungle with a small clearing)
const GATE_INSET = 14; // GATE sits this far toward centre from the CORE (destructible outer door)

// terrain code → A1 obstacle kind (for footprints derived from the grid = the real blockers)
const TERRAIN_KIND = { [T.FOREST]: "FOREST", [T.ROCK]: "ROCK", [T.WATER]: "WATER", [T.CLIFF]: "CLIFF" };
// which terrain codes we vectorize into passable:false footprints (OOB = outside the parcel, handled
// by the bounds polygon, never an obstacle; ROAD/OPEN are walkable)
const FOOTPRINT_CODES = [T.FOREST, T.ROCK, T.WATER, T.CLIFF];

const MIN_FOOTPRINT_CELLS = 4;   // smaller specks become a single round obstacle, not a polygon
const MAX_FOOTPRINT_VERTS = 48;  // decimate huge outlines so the command view stays light

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

// grid → passable:false obstacle list (footprints for real regions, circles for specks).
// `clearPts` = world points (bases/spawns) whose surrounding pocket is force-opened so the command
// view + validator see a clean staging area (the generator stages units there; terrain must not seal
// it). Returns a COPY of the grid with those cells set OPEN — never mutates the caller's buffer.
function terrainObstacles(terrain, clearPts = []) {
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
      const loop = traceOutline(comp, w, h);
      if (!loop) { const { x, z, r } = compCircle(comp, w, h); out.push({ id, kind, x, z, r, passable: false }); continue; }
      const footprint = outlineToFootprint(loop, w, h);
      if (footprint.length >= 3) out.push({ id, kind, footprint, passable: false });
      else { const { x, z, r } = compCircle(comp, w, h); out.push({ id, kind, x, z, r, passable: false }); }
    }
  }
  return out;
}

// décor props (artifact.obstacles) → passable:true visual layer (the grid already owns walkability).
function decorObstacles(list) {
  return (list ?? []).map((o, i) => ({
    id: o.id ?? `prop_${i}`,
    kind: String(o.kind ?? "TREE").toUpperCase(),
    x: o.x ?? 0, z: o.z ?? 0, r: o.r ?? 3,
    passable: true,
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

// synthesize CORE + GATE + TOWER anchors from the base spawn zones + primary lane (empty in raster).
function synthStructures(spawnZones, lanes) {
  const out = [];
  const { atk, def } = baseAnchors(spawnZones);
  const aGate = towardCenter(atk, GATE_INSET), dGate = towardCenter(def, GATE_INSET);
  out.push({ anchorId: "core_atk", kind: "CORE", side: "ATTACKER", x: +atk.x.toFixed(1), z: +atk.z.toFixed(1) });
  out.push({ anchorId: "core_def", kind: "CORE", side: "DEFENDER", x: +def.x.toFixed(1), z: +def.z.toFixed(1) });
  out.push({ anchorId: "gate_atk", kind: "GATE", side: "ATTACKER", x: aGate.x, z: aGate.z });
  out.push({ anchorId: "gate_def", kind: "GATE", side: "DEFENDER", x: dGate.x, z: dGate.z });
  // towers along the primary lane at fractional positions (defender holds forward + rear).
  const wp = lanes?.[0]?.waypoints ?? [];
  if (wp.length >= 2) {
    const at = (t) => wp[Math.max(0, Math.min(wp.length - 1, Math.round(t * (wp.length - 1))))];
    const [ax, az] = at(0.35), [dx1, dz1] = at(0.6), [dx2, dz2] = at(0.82);
    out.push({ anchorId: "t_atk", kind: "TOWER", side: "ATTACKER", x: +ax.toFixed(1), z: +az.toFixed(1) });
    out.push({ anchorId: "t_def1", kind: "TOWER", side: "DEFENDER", x: +dx1.toFixed(1), z: +dz1.toFixed(1) });
    out.push({ anchorId: "t_def2", kind: "TOWER", side: "DEFENDER", x: +dx2.toFixed(1), z: +dz2.toFixed(1) });
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
  const resources = (a.resources ?? []).map((r, i) => ({
    id: r.id ?? `res_${i}`, kind: String(r.kind ?? "GOLD_MINE").toUpperCase(),
    x: r.x ?? 0, z: r.z ?? 0, richness: r.richness ?? 1,
  }));
  const mobs = (a.mobs ?? []).map((m, i) => ({
    id: m.id ?? `camp_${i}`, kind: String(m.kind ?? "WOLF").toUpperCase(),
    x: m.x ?? 0, z: m.z ?? 0, count: m.count ?? 4,
  }));

  return {
    v: 1,
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
    structures: synthStructures(spawnZones, lanes),
    ...(mobs.length ? { mobs } : {}),
  };
}

export default toBattlefieldA1;
