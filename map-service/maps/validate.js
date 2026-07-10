// Playability validator + auto-repair (MAP-GENERATOR.md D4). Runs after EVERY generation path
// (seeded, gardener, owner prompt) — this gate is what makes LLM/prompt generation safe.
// Guarantees on the ERODED walk grid (min corridor width ≈ 3 cells = 6 m):
//   • every arena edge (N/S/E/W — reinforcement arrivals) reaches the defender base area
//   • every lane waypoint chain is pathable  • anchors/resources/spawns sit on open cells
// On violation: carve/repair, then re-check. Deterministic (no rng — repairs are geometric).
import { T, gIdx, inG, isBlocked, cellOf, worldOf } from "./schema.js";

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// eroded walkability: cell is open only if it and its 4-neighbours are unblocked (≈ width-3 corridor)
export function erode(g, G) {
  const e = new Uint8Array(G * G);
  for (let z = 0; z < G; z++) for (let x = 0; x < G; x++) {
    let ok = !isBlocked(g, gIdx(G, x, z));
    for (const [dx, dz] of N4) { if (!ok) break; const nx = x + dx, nz = z + dz; if (inG(G, nx, nz) && isBlocked(g, gIdx(G, nx, nz))) ok = false; }
    e[gIdx(G, x, z)] = ok ? 1 : 0;
  }
  return e;
}

// BFS over an eroded grid from seed cells; returns parent map (Int32Array, -2 unvisited)
function bfs(e, G, seeds) {
  const par = new Int32Array(G * G).fill(-2);
  const q = [];
  for (const i of seeds) if (e[i]) { par[i] = -1; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % G, z = (i / G) | 0;
    for (const [dx, dz] of N4) {
      const nx = x + dx, nz = z + dz;
      if (!inG(G, nx, nz)) continue;
      const ni = gIdx(G, nx, nz);
      if (par[ni] === -2 && e[ni]) { par[ni] = i; q.push(ni); }
    }
  }
  return par;
}

// arena-edge seeds. Square arenas: the grid border. Polygon arenas (grid contains OOB): the
// parcel RIM — inside cells adjacent to OOB/border — bucketed into N/S/E/W quadrants by their
// direction from the grid center (reinforcements arrive at any boundary bearing).
function edgeSeedsFor(g, G) {
  const hasOOB = g.includes(T.OOB);
  const out = { N: [], S: [], E: [], W: [] };
  if (!hasOOB) {
    for (let t = 0; t < G; t++) { out.N.push(gIdx(G, t, G - 1)); out.S.push(gIdx(G, t, 0)); out.E.push(gIdx(G, G - 1, t)); out.W.push(gIdx(G, 0, t)); }
    return out;
  }
  const h = G / 2;
  const rim = new Uint8Array(G * G);
  for (let z = 0; z < G; z++) for (let x = 0; x < G; x++) {
    const i = gIdx(G, x, z);
    if (g[i] === T.OOB) continue;
    let r = x === 0 || z === 0 || x === G - 1 || z === G - 1;
    if (!r) for (const [dx, dz] of N4) { if (g[gIdx(G, x + dx, z + dz)] === T.OOB) { r = true; break; } }
    if (r) rim[i] = 1;
  }
  // A rim cell BORDERS OOB, so on the eroded grid it can never open (its OOB neighbour blocks the
  // width-3 test) — seeding the quadrant bands with the rim itself made EVERY polygon parcel fail
  // all 4 passes and take the straight cross-fallback carve. Seed ONE CELL INWARD instead (rim-
  // adjacent, non-rim): the innermost cell a width-3 corridor can actually reach. Thin sliver
  // lobes with no inward cell leave their quadrant empty = vacuously ok (unchanged rule).
  for (let z = 0; z < G; z++) for (let x = 0; x < G; x++) {
    const i = gIdx(G, x, z);
    if (g[i] === T.OOB || rim[i]) continue;
    let near = false;
    for (const [dx, dz] of N4) { const nx = x + dx, nz = z + dz; if (inG(G, nx, nz) && rim[gIdx(G, nx, nz)]) { near = true; break; } }
    if (!near) continue;
    const dx = x - h, dz = z - h;
    (Math.abs(dz) >= Math.abs(dx) ? (dz >= 0 ? out.N : out.S) : (dx >= 0 ? out.E : out.W)).push(i);
  }
  return out;
}

// carve a straight width-5 corridor between two cells (water → ROAD causeway, rock/forest →
// OPEN). NEVER touches OOB — corridors cannot leave the parcel.
export function carve(g, G, ax, az, bx, bz) {
  const steps = Math.max(Math.abs(bx - ax), Math.abs(bz - az)) || 1;
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(ax + ((bx - ax) * s) / steps), z = Math.round(az + ((bz - az) * s) / steps);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (!inG(G, x + dx, z + dz)) continue;
      const i = gIdx(G, x + dx, z + dz);
      if (g[i] === T.OOB) continue;
      g[i] = g[i] === T.WATER ? T.ROAD : (isBlocked(g, i) ? T.OPEN : g[i]);
    }
  }
}

// walk a BFS parent chain into ~every-8th-cell waypoints (world coords), goal → seed reversed
function chainToLane(par, G, goal) {
  const cells = [];
  for (let i = goal; i >= 0; i = par[i]) cells.push(i);
  cells.reverse();
  const wp = [];
  for (let k = 0; k < cells.length; k += 8) wp.push([worldOf(G, cells[k] % G), worldOf(G, (cells[k] / G) | 0)]);
  const last = cells[cells.length - 1];
  wp.push([worldOf(G, last % G), worldOf(G, (last / G) | 0)]);
  return wp;
}

const nearestOpen = (e, G, cx, cz, rMax = 12) => {
  if (e[gIdx(G, cx, cz)]) return [cx, cz];
  for (let r = 1; r <= rMax; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const x = cx + dx, z = cz + dz;
    if (inG(G, x, z) && e[gIdx(G, x, z)]) return [x, z];
  }
  return null;
};

// validate + repair in place. base = {x,z} world coords of the defender base area center.
// Returns { ok, repairs:[], lanes } — lanes recomputed as guaranteed-pathable waypoint chains.
export function validateAndRepair(g, G, base, laneStarts) {
  const repairs = [];
  const bx = cellOf(G, base.x), bz = cellOf(G, base.z);
  const cx0 = G >> 1, cz0 = G >> 1;      // grid center = world (0,0) — the connectivity hub
  // base clearing: the CC + ring of build spots must sit on open ground (never opens OOB)
  for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++)
    if (inG(G, bx + dx, bz + dz) && dx * dx + dz * dz <= 49) { const i = gIdx(G, bx + dx, bz + dz); if (g[i] !== T.OOB && isBlocked(g, i)) g[i] = g[i] === T.WATER ? T.ROAD : T.OPEN; }
  // center clearing: the map center is always walkable — reinforcements from every edge route
  // through it, and central objectives sit here (FIRM RULE: edge↔center↔edge must connect)
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++)
    if (inG(G, cx0 + dx, cz0 + dz) && dx * dx + dz * dz <= 16) { const i = gIdx(G, cx0 + dx, cz0 + dz); if (g[i] !== T.OOB && isBlocked(g, i)) g[i] = g[i] === T.WATER ? T.ROAD : T.OPEN; }

  for (let pass = 0; pass < 4; pass++) {
    const e = erode(g, G);
    const par = bfs(e, G, [gIdx(G, ...nearestOpen(e, G, bx, bz) || [bx, bz])]);
    const seeds = edgeSeedsFor(g, G);
    let allOk = true;
    for (const edge of ["N", "S", "E", "W"]) {                 // every edge/rim quadrant must reach the base
      const band = seeds[edge];
      if (!band.length || band.some((i) => par[i] !== -2)) continue; // empty quadrant (odd sliver polygon) is vacuously ok
      allOk = false;
      // carve from that quadrant's outermost rim cell toward the base (OOB-guarded)
      let far = band[0], fd = -1;
      for (const i of band) { const x = i % G, z = (i / G) | 0, d = Math.abs(x - G / 2) + Math.abs(z - G / 2); if (d > fd) { fd = d; far = i; } }
      carve(g, G, far % G, (far / G) | 0, bx, bz);
      repairs.push(`carve:${edge}`);
    }
    // FIRM RULE: the center must join the base component too. With every edge → base AND
    // center → base, every edge reaches the center and (transitively) every other edge — no
    // disconnected map can be generated, so reinforcements can always enter from any side.
    const ci = gIdx(G, ...(nearestOpen(e, G, cx0, cz0) || [cx0, cz0]));
    if (par[ci] === -2) { allOk = false; carve(g, G, cx0, cz0, bx, bz); repairs.push("carve:center"); }
    if (allOk) {
      // lanes: guaranteed-pathable BFS chains from each lane start to the base
      const lanes = [];
      for (const s of laneStarts) {
        const sc = nearestOpen(e, G, cellOf(G, s[0]), cellOf(G, s[1])) || [cellOf(G, s[0]), cellOf(G, s[1])];
        const si = gIdx(G, sc[0], sc[1]);
        lanes.push(par[si] !== -2 ? chainToLane(par, G, si).reverse() : [[s[0], s[1]], [base.x, base.z]]);
      }
      return { ok: repairs.length === 0, repairs, lanes, eroded: e };
    }
  }
  // pathological fallback (shouldn't happen): cross-carve and return straight lanes
  carve(g, G, G >> 1, 0, G >> 1, G - 1); carve(g, G, 0, G >> 1, G - 1, G >> 1);
  repairs.push("carve:cross-fallback");
  return { ok: false, repairs, lanes: laneStarts.map((s) => [[s[0], s[1]], [base.x, base.z]]), eroded: erode(g, G) };
}

// per-edge NPC routes (D5): a guaranteed-pathable waypoint chain from EACH arrival entry to the
// CENTER hub. The dumb lane-follower uses these when an army arrives from an arbitrary edge
// (CLASH / GUARD / SIEGE) — entry→center, and center→(any other entry) composes a full cross-map
// path, so units never need real pathfinding to reach any objective from any side. The FIRM
// connectivity rule guarantees every entry reaches center, so every route exists.
export function routesToCenter(g, G, entries) {
  const e = erode(g, G);
  const cx0 = G >> 1, cz0 = G >> 1;
  const c = nearestOpen(e, G, cx0, cz0) || [cx0, cz0];
  const par = bfs(e, G, [gIdx(G, c[0], c[1])]);
  const out = [];
  for (const en of entries) {
    const sc = nearestOpen(e, G, cellOf(G, en.x), cellOf(G, en.z));
    if (!sc) continue;
    const si = gIdx(G, sc[0], sc[1]);
    // chainToLane yields center→entry; reverse → entry→center (the direction the NPC walks)
    const wp = par[si] !== -2 ? chainToLane(par, G, si).reverse() : [[en.x, en.z], [worldOf(G, cx0), worldOf(G, cz0)]];
    out.push({ from: en.id, edge: en.edge, wp: wp.map(([x, z]) => [Math.round(x), Math.round(z)]) });
  }
  return out;
}

// snap a point list onto open cells (anchors / resources / spawns); mutates entries, returns them
export function snapOpen(items, e, G) {
  for (const it of items) {
    const c = nearestOpen(e, G, cellOf(G, it.x), cellOf(G, it.z));
    if (c) { it.x = worldOf(G, c[0]); it.z = worldOf(G, c[1]); }
  }
  return items;
}
