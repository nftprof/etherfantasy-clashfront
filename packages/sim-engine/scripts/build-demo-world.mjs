#!/usr/bin/env node
/**
 * build-demo-world.mjs — MVP item 1 (docs/briefs/MVP-JULY7.md): zone slice pipeline.
 *
 * Reads ONE zone's L3 single-parcels from data/hexagon-city-source/l3/<ZONE>.json,
 * takes a contiguous bbox-window slice around the zone's center of mass, computes
 * parcel ADJACENCY from polygon geometry, and emits data/demo-world.json.
 *
 * Zone choice: EDU — 13,663 L3 singles (healthy count), smallest healthy source file,
 * pure polyline svgPaths (m/M l/L h/H v/V z only — no béziers anywhere in the zone),
 * compact viewBox (155.77 × 148.06). Documented calibration (this script's authorship
 * session, measured on the real data):
 *   - parcels inside a city block share borders exactly (poly-distance ≈ 0, max 0.003),
 *   - blocks are separated by streets (cross-block min gaps ~0.3–3+ units).
 * Therefore adjacency is built in three deterministic rules:
 *   A. TOUCH  — polygon distance ≤ TOUCH_EPS (shared/near-touching borders),
 *   B. STREET — for pairs of touch-components whose minimal gap ≤ STREET_EPS, connect
 *               facing parcels across the street (distance ≤ STREET_EPS),
 *   C. BRIDGE — Kruskal MST over the remaining component graph (gap ≤ BRIDGE_MAX_GAP)
 *               so wide avenues get a few shortest crossings (choke points), with up to
 *               BRIDGE_MAX_PARALLEL parallel edges within BRIDGE_SLACK of the min gap.
 * Islands smaller than MIN_ISLAND parcels are dropped. Output ordering is stable
 * (parcels + neighbor lists sorted by parcelId) — the script is fully deterministic:
 * no RNG, no wall clock in the output.
 *
 * Usage: node packages/sim-engine/scripts/build-demo-world.mjs [--zone EDU] [--target 650]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// ── Parameters (all recorded in meta.params) ─────────────────────────────────
const args = process.argv.slice(2);
function argOf(flag, dflt) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
}
const ZONE = argOf('--zone', 'EDU');
const TARGET_PARCELS = Number(argOf('--target', '650')); // slice size before island drop (brief: ~400–800)
const TOUCH_EPS = 0.05;        // rule A: shared/near-touching borders
const STREET_EPS = 1.0;        // rule B: facing parcels across a normal street
const BRIDGE_MAX_GAP = 8.0;    // rule C: max avenue/plaza width the MST may bridge
const BRIDGE_SLACK = 0.2;      // rule C: parallel edges within min gap + slack
const BRIDGE_MAX_PARALLEL = 4; // rule C: cap on parallel bridge edges per component pair
const MIN_ISLAND = 10;         // drop connected components smaller than this
const MAX_POLY_POINTS = 40;    // display polygon simplification cap
const CANDIDATE_RANGE = BRIDGE_MAX_GAP; // bbox prefilter distance for distance computation

// ── SVG path parsing (polyline subset: m/M l/L h/H v/V z/Z, implicit repeats) ─
const TOKEN_RE = /[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

/** Parse one svgPath into an array of rings (each ring = [[x,y], …]). */
function parseSvgPath(path) {
  const toks = path.match(TOKEN_RE) ?? [];
  const rings = [];
  let ring = [];
  let cur = [0, 0];
  let cmd = null;
  let k = 0;
  const num = () => {
    const v = Number(toks[k++]);
    if (Number.isNaN(v)) throw new Error(`bad number in path: ${path}`);
    return v;
  };
  while (k < toks.length) {
    const t = toks[k];
    if (/[a-zA-Z]/.test(t)) {
      cmd = t;
      k++;
      if (cmd === 'z' || cmd === 'Z') {
        if (ring.length >= 3) rings.push(ring);
        ring = [];
        continue;
      }
    }
    switch (cmd) {
      case 'm': case 'M': {
        const x = num(), y = num();
        cur = cmd === 'm' ? [cur[0] + x, cur[1] + y] : [x, y];
        if (ring.length >= 3) rings.push(ring); // implicit new subpath
        else ring = [];
        ring = [cur];
        cmd = cmd === 'm' ? 'l' : 'L'; // implicit lineto after moveto
        break;
      }
      case 'l': case 'L': {
        const x = num(), y = num();
        cur = cmd === 'l' ? [cur[0] + x, cur[1] + y] : [x, y];
        ring.push(cur);
        break;
      }
      case 'h': case 'H': {
        const x = num();
        cur = cmd === 'h' ? [cur[0] + x, cur[1]] : [x, cur[1]];
        ring.push(cur);
        break;
      }
      case 'v': case 'V': {
        const y = num();
        cur = cmd === 'v' ? [cur[0], cur[1] + y] : [cur[0], y];
        ring.push(cur);
        break;
      }
      default:
        throw new Error(`unsupported svgPath command '${cmd}' in: ${path}`);
    }
  }
  if (ring.length >= 3) rings.push(ring);
  return rings; // [] ⇒ degenerate path (point/segment only) — caller skips & counts
}

// ── Geometry helpers ─────────────────────────────────────────────────────────
function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function segSegDist(a1, a2, b1, b2) {
  return Math.min(
    pointSegDist(a1[0], a1[1], b1[0], b1[1], b2[0], b2[1]),
    pointSegDist(a2[0], a2[1], b1[0], b1[1], b2[0], b2[1]),
    pointSegDist(b1[0], b1[1], a1[0], a1[1], a2[0], a2[1]),
    pointSegDist(b2[0], b2[1], a1[0], a1[1], a2[0], a2[1]),
  );
}

/** Minimum distance between two parcels' ring boundaries (0 = touching/overlapping edges). */
function parcelDist(ringsA, ringsB, cutoff) {
  let best = Infinity;
  for (const ra of ringsA) {
    for (const rb of ringsB) {
      for (let i = 0; i < ra.length; i++) {
        const a1 = ra[i], a2 = ra[(i + 1) % ra.length];
        for (let j = 0; j < rb.length; j++) {
          const d = segSegDist(a1, a2, rb[j], rb[(j + 1) % rb.length]);
          if (d < best) {
            best = d;
            if (best === 0) return 0;
          }
        }
      }
    }
  }
  return best <= cutoff ? best : Infinity;
}

/** Remove collinear points, then decimate uniformly to ≤ maxPts. */
function simplifyRing(ring, maxPts) {
  const out = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[(i - 1 + n) % n], q = ring[i], r = ring[(i + 1) % n];
    const cross = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    if (Math.abs(cross) > 1e-9) out.push(q);
  }
  const kept = out.length >= 3 ? out : ring;
  if (kept.length <= maxPts) return kept;
  const step = kept.length / maxPts;
  const dec = [];
  for (let i = 0; i < maxPts; i++) dec.push(kept[Math.floor(i * step)]);
  return dec;
}

const r3 = (v) => Math.round(v * 1000) / 1000;

// ── Load & dedupe (multi-sub-path parcels share a parcelId — merge rings) ────
const sourceRel = `data/hexagon-city-source/l3/${ZONE}.json`;
const source = JSON.parse(readFileSync(join(ROOT, sourceRel), 'utf8'));
if (!Array.isArray(source.singles)) throw new Error(`${sourceRel}: no "singles" array`);

const byId = new Map();
let degeneratePaths = 0;
for (const s of source.singles) {
  const rings = parseSvgPath(s.svgPath);
  if (rings.length === 0) { degeneratePaths++; continue; } // point/segment-only path
  const prev = byId.get(s.parcelId);
  if (prev) {
    prev.rings.push(...rings); // duplicate parcelId ⇒ multi-polygon parcel (report §8)
  } else {
    byId.set(s.parcelId, { parcelId: s.parcelId, tokenId: s.tokenId, rings });
  }
}
for (const p of byId.values()) {
  // Vertex-mean center + bbox recomputed from parsed rings (matches source anchor-mean).
  let sx = 0, sy = 0, n = 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ring of p.rings) {
    for (const [x, y] of ring) {
      sx += x; sy += y; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  p.center = [sx / n, sy / n];
  p.bbox = [x0, y0, x1, y1];
}
const all = [...byId.values()];
console.log(`${ZONE}: ${source.singles.length} L3 paths → ${all.length} unique parcels` +
  (degeneratePaths > 0 ? ` (${degeneratePaths} degenerate point-only paths skipped)` : ''));

// ── Contiguous slice: Chebyshev window around the zone's center of mass ──────
let cx = 0, cy = 0;
for (const p of all) { cx += p.center[0]; cy += p.center[1]; }
cx /= all.length; cy /= all.length;

const sliced = all
  .map((p) => ({ p, d: Math.max(Math.abs(p.center[0] - cx), Math.abs(p.center[1] - cy)) }))
  .sort((a, b) => a.d - b.d || (a.p.parcelId < b.p.parcelId ? -1 : 1))
  .slice(0, TARGET_PARCELS)
  .map((e) => e.p)
  .sort((a, b) => (a.parcelId < b.parcelId ? -1 : 1));
console.log(`slice: ${sliced.length} parcels in Chebyshev window around (${r3(cx)}, ${r3(cy)})`);

// ── Pairwise boundary distances (bbox-prefiltered) ───────────────────────────
const idx = new Map(sliced.map((p, i) => [p.parcelId, i]));
/** pair distances: key "i:j" (i<j) → boundary distance ≤ CANDIDATE_RANGE */
const pairDist = new Map();
// uniform grid over bbox centers for candidate generation
const CELL = 4;
const grid = new Map();
sliced.forEach((p, i) => {
  const gx = Math.floor(p.center[0] / CELL), gy = Math.floor(p.center[1] / CELL);
  const key = `${gx},${gy}`;
  (grid.get(key) ?? grid.set(key, []).get(key)).push(i);
});
for (let i = 0; i < sliced.length; i++) {
  const a = sliced[i];
  const gx = Math.floor(a.center[0] / CELL), gy = Math.floor(a.center[1] / CELL);
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      for (const j of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
        if (j <= i) continue;
        const b = sliced[j];
        if (
          b.bbox[0] > a.bbox[2] + CANDIDATE_RANGE || b.bbox[2] < a.bbox[0] - CANDIDATE_RANGE ||
          b.bbox[1] > a.bbox[3] + CANDIDATE_RANGE || b.bbox[3] < a.bbox[1] - CANDIDATE_RANGE
        ) continue;
        const d = parcelDist(a.rings, b.rings, CANDIDATE_RANGE);
        if (d !== Infinity) pairDist.set(`${i}:${j}`, d);
      }
    }
  }
}

// ── Union-find over touch edges (rule A) ─────────────────────────────────────
const parent = sliced.map((_, i) => i);
const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };

const edges = new Set(); // "i:j" i<j
const addEdge = (i, j) => edges.add(i < j ? `${i}:${j}` : `${j}:${i}`);

for (const [key, d] of pairDist) {
  if (d <= TOUCH_EPS) {
    const [i, j] = key.split(':').map(Number);
    addEdge(i, j);
    union(i, j);
  }
}
const touchComp = sliced.map((_, i) => find(i)); // frozen touch-component ids
const touchEdgeCount = edges.size;

// ── Street + bridge edges between touch-components (rules B & C) ─────────────
// Group cross-component pairs by (compA, compB), tracked with per-group min gap.
const groups = new Map(); // "ca:cb" → { pairs: [key, d][], minGap }
for (const [key, d] of pairDist) {
  const [i, j] = key.split(':').map(Number);
  const ca = touchComp[i], cb = touchComp[j];
  if (ca === cb) continue;
  const gkey = ca < cb ? `${ca}:${cb}` : `${cb}:${ca}`;
  const g = groups.get(gkey) ?? groups.set(gkey, { pairs: [], minGap: Infinity }).get(gkey);
  g.pairs.push([key, d]);
  if (d < g.minGap) g.minGap = d;
}
const sortedGroups = [...groups.entries()].sort(
  (a, b) => a[1].minGap - b[1].minGap || (a[0] < b[0] ? -1 : 1),
);

let streetEdgeCount = 0;
let bridgeEdgeCount = 0;
for (const [, g] of sortedGroups) {
  if (g.minGap > STREET_EPS) continue;
  // Rule B: normal street — connect all facing pairs across it.
  for (const [key, d] of g.pairs.sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))) {
    if (d > STREET_EPS) break;
    const [i, j] = key.split(':').map(Number);
    if (!edges.has(key)) { addEdge(i, j); streetEdgeCount++; }
    union(i, j);
  }
}
for (const [, g] of sortedGroups) {
  if (g.minGap <= STREET_EPS || g.minGap > BRIDGE_MAX_GAP) continue;
  // Rule C: wide avenue — Kruskal over the component graph (groups pre-sorted by gap):
  // bridge only if the two sides are still disconnected, with a few parallel crossings.
  const sample = g.pairs[0][0].split(':').map(Number);
  if (find(sample[0]) === find(sample[1])) continue;
  let added = 0;
  for (const [key, d] of g.pairs.sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))) {
    if (d > g.minGap + BRIDGE_SLACK || added >= BRIDGE_MAX_PARALLEL) break;
    const [i, j] = key.split(':').map(Number);
    if (!edges.has(key)) { addEdge(i, j); bridgeEdgeCount++; added++; }
    union(i, j);
  }
}

// ── Components on the final graph; drop islands < MIN_ISLAND ─────────────────
const adj = new Map(sliced.map((_, i) => [i, new Set()]));
for (const key of edges) {
  const [i, j] = key.split(':').map(Number);
  adj.get(i).add(j);
  adj.get(j).add(i);
}
const compOf = new Array(sliced.length).fill(-1);
const compSizes = [];
for (let i = 0; i < sliced.length; i++) {
  if (compOf[i] !== -1) continue;
  const c = compSizes.length;
  const stack = [i];
  compOf[i] = c;
  let size = 0;
  while (stack.length > 0) {
    const n = stack.pop();
    size++;
    for (const m of adj.get(n)) if (compOf[m] === -1) { compOf[m] = c; stack.push(m); }
  }
  compSizes.push(size);
}
let keptComps = new Set(compSizes.map((s, c) => [s, c]).filter(([s]) => s >= MIN_ISLAND).map(([, c]) => c));
const largestComponent = Math.max(...compSizes);
if (keptComps.size > 1) {
  // Components ≥ MIN_ISLAND still disconnected after bridging (avenue wider than
  // BRIDGE_MAX_GAP at the slice boundary): keep only the largest — a playable world
  // must be one connected graph. Deterministic tie-break: lowest component id.
  const largestId = compSizes.findIndex((s) => s === largestComponent);
  console.log(`⚠ ${keptComps.size} components ≥ ${MIN_ISLAND} remain after bridging — keeping largest only`);
  keptComps = new Set([largestId]);
}
const droppedIslands = compSizes.length - keptComps.size;
const droppedParcels = compSizes.reduce((n, s, c) => n + (keptComps.has(c) ? 0 : s), 0);

const keep = sliced.map((_, i) => keptComps.has(compOf[i]));
const kept = sliced.filter((_, i) => keep[i]);

// ── Emit (stable ordering: parcels & neighbors sorted by parcelId) ───────────
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (const p of kept) {
  if (p.bbox[0] < x0) x0 = p.bbox[0];
  if (p.bbox[1] < y0) y0 = p.bbox[1];
  if (p.bbox[2] > x1) x1 = p.bbox[2];
  if (p.bbox[3] > y1) y1 = p.bbox[3];
}

const parcelsOut = kept.map((p) => {
  const i = idx.get(p.parcelId);
  const neighbors = [...adj.get(i)]
    .filter((j) => keep[j])
    .map((j) => sliced[j].parcelId)
    .sort();
  const display = [...p.rings].sort((a, b) => ringArea(b) - ringArea(a))[0];
  return {
    parcelId: p.parcelId,
    tokenId: p.tokenId,
    center: [r3(p.center[0]), r3(p.center[1])],
    polygon: simplifyRing(display, MAX_POLY_POINTS).map(([x, y]) => [r3(x), r3(y)]),
    neighbors,
  };
});

const degrees = parcelsOut.map((p) => p.neighbors.length);
const edgeCount = degrees.reduce((a, b) => a + b, 0) / 2;
const avgDeg = degrees.reduce((a, b) => a + b, 0) / degrees.length;

const out = {
  meta: {
    zone: ZONE,
    sliceBBox: [r3(x0), r3(y0), r3(x1), r3(y1)],
    sliceCenter: [r3(cx), r3(cy)],
    generatedFrom: sourceRel,
    generatedBy: 'packages/sim-engine/scripts/build-demo-world.mjs',
    coordinateSystem: 'zone-local svg viewBox space (see data/hexagon-city-source/zone-layout.json)',
    params: {
      targetParcels: TARGET_PARCELS,
      touchEps: TOUCH_EPS,
      streetEps: STREET_EPS,
      bridgeMaxGap: BRIDGE_MAX_GAP,
      bridgeSlack: BRIDGE_SLACK,
      bridgeMaxParallel: BRIDGE_MAX_PARALLEL,
      minIslandSize: MIN_ISLAND,
      maxPolygonPoints: MAX_POLY_POINTS,
    },
    stats: {
      parcels: parcelsOut.length,
      edges: edgeCount,
      touchEdges: touchEdgeCount,
      streetEdges: streetEdgeCount,
      bridgeEdges: bridgeEdgeCount,
      avgNeighbors: r3(avgDeg),
      minNeighbors: Math.min(...degrees),
      maxNeighbors: Math.max(...degrees),
      componentsBeforeDrop: compSizes.length,
      largestComponent,
      droppedIslands,
      droppedParcels,
    },
  },
  parcels: parcelsOut,
};

// ── Validation (fail loudly rather than emit a broken world) ─────────────────
if (parcelsOut.length < 400 || parcelsOut.length > 800) {
  throw new Error(`slice size ${parcelsOut.length} outside 400–800 target range`);
}
if (avgDeg < 2 || avgDeg > 8) throw new Error(`avg neighbor count ${avgDeg.toFixed(2)} outside sane 2–8`);
for (const p of parcelsOut) {
  if (p.neighbors.includes(p.parcelId)) throw new Error(`self-loop on ${p.parcelId}`);
  if (p.polygon.length > MAX_POLY_POINTS) throw new Error(`polygon > ${MAX_POLY_POINTS} pts on ${p.parcelId}`);
}
// connectivity of the emitted graph
{
  const byPid = new Map(parcelsOut.map((p) => [p.parcelId, p]));
  const seen = new Set();
  const stack = [parcelsOut[0].parcelId];
  seen.add(parcelsOut[0].parcelId);
  while (stack.length > 0) {
    for (const n of byPid.get(stack.pop()).neighbors) {
      if (!byPid.has(n)) throw new Error(`neighbor ${n} not in output`);
      if (!seen.has(n)) { seen.add(n); stack.push(n); }
    }
  }
  const finalLargest = seen.size;
  console.log(`final graph: ${parcelsOut.length} parcels, ${edgeCount} edges ` +
    `(touch ${touchEdgeCount}, street ${streetEdgeCount}, bridge ${bridgeEdgeCount})`);
  console.log(`neighbors: avg ${avgDeg.toFixed(2)}, min ${Math.min(...degrees)}, max ${Math.max(...degrees)}`);
  console.log(`components before drop: ${compSizes.length} (largest ${largestComponent}); ` +
    `dropped ${droppedIslands} islands / ${droppedParcels} parcels`);
  console.log(`largest component in output: ${finalLargest}/${parcelsOut.length}` +
    (finalLargest === parcelsOut.length ? ' (fully connected)' : ' ⚠ NOT fully connected'));
}

const outPath = join(ROOT, 'data', 'demo-world.json');
writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${outPath}`);
