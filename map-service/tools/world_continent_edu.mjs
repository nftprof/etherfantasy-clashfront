#!/usr/bin/env node
// world_continent_edu.mjs — CONTINENT 1 (EDU / Arcadia) designation pass → data/world-terrain/EDU.continent.json
//
// Brief: docs/briefs/CONTINENT-1-EDU.md (CF Overworld eco → CF ParcelMap Design Agent, 2026-10-27), §1.3–1.5:
// the per-parcel BIOME designation CF loads in place of its procedural terrain, the REGION/GATE partition
// (docs/maps/REGION-GATE-SPEC.md §2), the lore-town sites, and the RUIN / MONUMENT POIs — all DERIVED from the
// authored EDU world field (data/world-terrain/EDU.json: 2 rivers · 54 roads · 3 rimwall ridges · 5 castles ·
// 3 POIs) and the real parcel geometry (data/hexagon-city-source/l3/EDU.json, 13,663 L3 parcels).
//
// WHY A SIBLING FILE (EDU.continent.json, not a key inside EDU.json): the map-service fingerprints EDU.json
// (fieldSha) and self-heals every baked EDU row when it changes. The designation does not alter battle maps,
// so it lives beside the field (like EDU.height.json) and never triggers a 13,663-row re-seed. CF loads this
// file; the field stays the frozen generator canon.
//
// ID SCHEME (the finding that matters for CF): CF's live world (data/demo-world.json, data/towns.json, the
// golden-9 brief) addresses EDU parcels by the OLD token id `602…` (`tokenIdOld`); the designer registry and
// the world fields use the CURRENT id (`502…` SINGLE child of a SMALL, `202…` of a GIANT, …). Both share the
// same 10-digit tail. `biomes` / `regions` / `gates` / `towns` / `pois` here are keyed by CF's id (tokenIdOld);
// every record also carries `parcelId` = the current id, and `idMap` gives old → current for the whole zone.
// The map-service API additionally accepts old ids (worldfield.l3Row alias, 2026-10-27).
//
// BIOME RULE (canon HexTerrain names only — PLAINS FOREST HILLS MOUNTAIN RIVER COAST OCEAN ROAD; EDU is an
// inland plateau: no COAST/OCEAN). Precedence per parcel, first match wins:
//   ROAD      a world road (any tier) crosses the parcel bbox — marches read as roads (0.5× move cost); a road
//             over a river/ridge is the bridge/pass = also ROAD (it is the gate parcel)
//   RIVER     a river (band = its width) crosses the parcel
//   MOUNTAIN  a rimwall ridge (band = its width) crosses the parcel
//   HILLS     within 4.5 u of a rimwall (the terraces under the rim), or a castle parcel (forts on high ground)
//   PLAINS    town parcels (markets), and the open basin (noise < threshold — more plains near the rivers)
//   FOREST    the rest (temperate forest highlands; noise ≥ threshold — denser toward the rim)
// Noise = 2-octave seeded value noise over zone coords (fnv1a lattice) → spatially coherent patches.
//
// REGIONS: parcel adjacency (bbox touch) CUT where the centre-to-centre segment crosses a river or a ridge
// band; connected components = regions `EDU-R<nn>` numbered by their smallest CF id (order-insensitive).
// GATES: a ROAD parcel that a barrier crosses = pass/bridge (`isGate`, `connects` = the regions on both sides);
// every pair of touching regions keeps ≥1 gate (narrowest cut edge becomes a `ford` if no road crosses).
//
// Deterministic (fnv1a lattice, no Math.random/Date.now); built twice + sha256-compared before the write.
// Usage: node map-service/tools/world_continent_edu.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fnv1a = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const lattice = (ix, iy, k) => fnv1a(`EDU|noise|${k}|${ix}|${iy}`) / 4294967296;
const smooth = (t) => t * t * (3 - 2 * t);
function valueNoise(x, y, cell, k) {
  const gx = x / cell, gy = y / cell, ix = Math.floor(gx), iy = Math.floor(gy), fx = smooth(gx - ix), fy = smooth(gy - iy);
  const a = lattice(ix, iy, k), b = lattice(ix + 1, iy, k), c = lattice(ix, iy + 1, k), d = lattice(ix + 1, iy + 1, k);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
const noise2 = (x, y) => 0.65 * valueNoise(x, y, 14, "a") + 0.35 * valueNoise(x, y, 5.5, "b");

// ---- geometry ----------------------------------------------------------------------------------------------
function segX(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, qx = dx - cx, qy = dy - cy, den = rx * qy - ry * qx;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((cx - ax) * qy - (cy - ay) * qx) / den, u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
const inRect = (x, y, r) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
function segRect(ax, ay, bx, by, r) {
  if (inRect(ax, ay, r) || inRect(bx, by, r)) return true;
  return segX(ax, ay, bx, by, r[0], r[1], r[2], r[1]) || segX(ax, ay, bx, by, r[2], r[1], r[2], r[3]) ||
         segX(ax, ay, bx, by, r[2], r[3], r[0], r[3]) || segX(ax, ay, bx, by, r[0], r[3], r[0], r[1]);
}
function segPointDist(ax, ay, bx, by, px, py) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
const CELL = 4;
function segIndex() {
  const cells = new Map(); const segs = [];
  const key = (cx, cy) => cx + "," + cy;
  return {
    add(feature, kind, halfBand) {
      const pts = feature.pts;
      for (let i = 1; i < pts.length; i++) {
        const s = { fid: feature.id, kind, tier: feature.tier || null, half: halfBand, a: pts[i - 1], b: pts[i] };
        const id = segs.push(s) - 1;
        const x0 = Math.floor((Math.min(s.a[0], s.b[0]) - halfBand) / CELL), x1 = Math.floor((Math.max(s.a[0], s.b[0]) + halfBand) / CELL);
        const y0 = Math.floor((Math.min(s.a[1], s.b[1]) - halfBand) / CELL), y1 = Math.floor((Math.max(s.a[1], s.b[1]) + halfBand) / CELL);
        for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const k = key(cx, cy); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(id); }
      }
    },
    near(rect) {
      const out = new Set();
      for (let cx = Math.floor(rect[0] / CELL); cx <= Math.floor(rect[2] / CELL); cx++)
        for (let cy = Math.floor(rect[1] / CELL); cy <= Math.floor(rect[3] / CELL); cy++)
          for (const id of cells.get(key(cx, cy)) || []) out.add(id);
      return [...out].map((i) => segs[i]);
    },
  };
}
// does the feature band (segment ± half) touch the rect? (rect grown by half ≈ band test)
const bandHitsRect = (s, rect) => segRect(s.a[0], s.a[1], s.b[0], s.b[1], [rect[0] - s.half, rect[1] - s.half, rect[2] + s.half, rect[3] + s.half]);

// ==================================================================================================
function build() {
  const field = JSON.parse(readFileSync(path.join(ROOT, "data/world-terrain/EDU.json"), "utf8"));
  const l3 = JSON.parse(readFileSync(path.join(ROOT, "data/hexagon-city-source/l3/EDU.json"), "utf8"));
  const l2 = JSON.parse(readFileSync(path.join(ROOT, "data/hexagon-city-source/parcels-l2.json"), "utf8")).parcels.filter((p) => p.zone === "EDU");
  const parcels = l3.singles.map((s) => ({ id: String(s.parcelId), cf: String(s.tokenIdOld ?? s.parcelId), c: s.center, bb: s.bbox, parent: s.parentIndex, parentSize: s.parentSizeClass }))
    .sort((a, b) => (a.cf < b.cf ? -1 : 1));
  const byCf = new Map(parcels.map((p) => [p.cf, p]));
  const byId = new Map(parcels.map((p) => [p.id, p]));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // ---- feature index -------------------------------------------------------------------------------------
  const idx = segIndex();
  for (const r of field.roads) idx.add(r, "road", Math.max(0.15, (r.width || 0.3) / 2));
  for (const r of field.rivers) idx.add(r, "river", (r.width || 0.8) / 2);
  for (const r of field.ridges) idx.add(r, "ridge", (r.width || 2) / 2);
  const ridgeSegs = [], riverSegs = [];
  for (const r of field.ridges) for (let i = 1; i < r.pts.length; i++) ridgeSegs.push([r.pts[i - 1], r.pts[i], r.id]);
  for (const r of field.rivers) for (let i = 1; i < r.pts.length; i++) riverSegs.push([r.pts[i - 1], r.pts[i], r.id]);
  const ridgeDist = (p) => { let d = Infinity; for (const [a, b] of ridgeSegs) d = Math.min(d, segPointDist(a[0], a[1], b[0], b[1], p[0], p[1])); return d; };
  const riverDist = (p) => { let d = Infinity; for (const [a, b] of riverSegs) d = Math.min(d, segPointDist(a[0], a[1], b[0], b[1], p[0], p[1])); return d; };

  // ---- special parcels: castles (current ids → hero parcel 0), the Academy estate, famous towns (CF ids) -------
  const castleParcels = new Map();                                   // current id → castle
  for (const c of field.castles) if (c.heroParcels && c.heroParcels.length) castleParcels.set(String(c.heroParcels[0]), c);
  const FAMOUS = [                                                   // data/towns.json (CF branch) — CF ids
    { key: "saltmarket", name: "Saltmarket", cf: "60202580008" }, { key: "ironhollow", name: "Ironhollow", cf: "60203490046" },
    { key: "goldenloaf", name: "Goldenloaf", cf: "60203600050" }, { key: "wayfarers-rest", name: "Wayfarer's Rest", cf: "60202790103" },
    { key: "vellmoor-bazaar", name: "Vellmoor Relic Bazaar", cf: "60203370064" },
  ];
  const famousSet = new Set(FAMOUS.map((t) => t.cf));
  const GOLDEN = ["60200030000", "60200060000", "60202790016", "60203370001", "60203370004", "60203370006", "60203370158", "60203670103", "60203680173"];

  // ---- per-parcel feature hits + biome -------------------------------------------------------------------
  const hits = new Map();                                            // cf → { road:Set(fid), river:Set, ridge:Set, roadTiers:Set }
  const biomes = {};
  const tally = {};
  for (const p of parcels) {
    const h = { road: new Set(), river: new Set(), ridge: new Set(), roadTiers: new Set() };
    for (const s of idx.near(p.bb)) if (bandHitsRect(s, p.bb)) { h[s.kind].add(s.fid); if (s.kind === "road") h.roadTiers.add(s.tier || "local"); }
    hits.set(p.cf, h);
    let t;
    if (h.road.size) t = "ROAD";
    else if (h.river.size) t = "RIVER";
    else if (h.ridge.size) t = "MOUNTAIN";
    else if (castleParcels.has(p.id)) t = "HILLS";
    else if (famousSet.has(p.cf)) t = "PLAINS";
    else if (ridgeDist(p.c) < 4.5) t = "HILLS";
    else {
      // forest/plains: basin near the rivers reads as farmland; slopes toward the rim read as forest
      const n = noise2(p.c[0], p.c[1]) + Math.max(0, 0.18 - riverDist(p.c) * 0.03) * -1 + Math.max(0, (14 - ridgeDist(p.c)) * 0.012);
      t = n < 0.5 ? "PLAINS" : "FOREST";
    }
    biomes[p.cf] = t; tally[t] = (tally[t] || 0) + 1;
  }

  // ---- the travel graph: L3 parcels + UN-SUBDIVIDED L2 estates as nodes -----------------------------------
  // FINDING (2026-10-27): EDU's 13,663 L3 singles live only inside the 161 subdivided estates; between those
  // clusters the land is the 211 un-subdivided estates (whole-estate maps). The L3-only graph is therefore
  // ~100 disconnected islands at any sane touch threshold (measured: 104 components at 0.04 u, 65 at 1.0 u).
  // A traversable continent needs the estates as nodes too — so regions/gates are computed over BOTH, and CF's
  // world graph must carry the un-subdivided estates as hexes (see CONTINENT-1-EDU-STATUS.md).
  const estates = l2.filter((e) => !e.l3Enabled).map((e) => ({ id: String(e.parcelId), cf: String(e.parcelId), c: e.center, bb: e.bbox, estate: true, size: e.sizeClass })).sort((a, b) => (a.cf < b.cf ? -1 : 1));
  const nodes = [...parcels, ...estates];
  const grid = new Map(); const gk = (x, y) => x + "," + y; const GC = 2;
  const cellsOf = (n) => { const out = []; for (let cx = Math.floor(n.bb[0] / GC); cx <= Math.floor(n.bb[2] / GC); cx++) for (let cy = Math.floor(n.bb[1] / GC); cy <= Math.floor(n.bb[3] / GC); cy++) out.push(gk(cx, cy)); return out; };
  for (const n of nodes) for (const k of cellsOf(n)) { if (!grid.has(k)) grid.set(k, []); grid.get(k).push(n); }
  const EPS = 0.3;                                                   // estate-boundary gaps in the source svg
  const touches = (a, b) => a.bb[0] <= b.bb[2] + EPS && b.bb[0] <= a.bb[2] + EPS && a.bb[1] <= b.bb[3] + EPS && b.bb[1] <= a.bb[3] + EPS;
  const crossesBarrier = (a, b) => {
    for (const [s0, s1] of riverSegs) if (segX(a.c[0], a.c[1], b.c[0], b.c[1], s0[0], s0[1], s1[0], s1[1])) return "river";
    for (const [s0, s1] of ridgeSegs) if (segX(a.c[0], a.c[1], b.c[0], b.c[1], s0[0], s0[1], s1[0], s1[1])) return "ridge";
    return null;
  };
  const adj = new Map(nodes.map((n) => [n.cf, []]));
  const cutEdges = [];                                               // [a, b, kind]
  const seenPair = new Set();
  for (const p of nodes) {
    const cand = new Set();
    for (const k of cellsOf(p)) for (const q of grid.get(k) || []) if (q !== p) cand.add(q);
    for (const q of cand) {
      const pk = p.cf < q.cf ? p.cf + "~" + q.cf : q.cf + "~" + p.cf;
      if (seenPair.has(pk) || !touches(p, q)) continue;
      seenPair.add(pk);
      const cut = crossesBarrier(p, q);
      if (cut) cutEdges.push([p, q, cut]); else { adj.get(p.cf).push(q.cf); adj.get(q.cf).push(p.cf); }
    }
  }
  // components → regions, numbered by smallest CF id
  const comp = new Map(); const comps = [];
  for (const n of nodes) {
    if (comp.has(n.cf)) continue;
    const stack = [n.cf], members = []; comp.set(n.cf, -1);
    while (stack.length) { const x = stack.pop(); members.push(x); for (const y of adj.get(x)) if (!comp.has(y)) { comp.set(y, -1); stack.push(y); } }
    comps.push(members.sort());
  }
  comps.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  // GRAPH-GAP ISLANDS: a component with NO barrier cut to any other component is not a region — it is a
  // cluster the source svg leaves a wider-than-EPS gap around (an estate boundary). Such islands are joined
  // to the component holding their nearest node (centre distance, ties by id) until every component is
  // barrier-bounded or one remains. The joins are recorded as `landBridges` (CF adds those adjacencies).
  const compOf = new Map(); comps.forEach((m, i) => { for (const cf of m) compOf.set(cf, i); });
  const uf = comps.map((_, i) => i); const find = (x) => { while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
  const cutNeighbours = comps.map(() => new Set());
  for (const [a, b] of cutEdges) { const ia = compOf.get(a.cf), ib = compOf.get(b.cf); if (ia !== ib) { cutNeighbours[ia].add(ib); cutNeighbours[ib].add(ia); } }
  const nodeByCf = new Map(nodes.map((n) => [n.cf, n]));
  const landBridges = [];
  for (let i = 0; i < comps.length; i++) {
    if (cutNeighbours[i].size) continue;
    let best = null;
    for (const cf of comps[i]) { const n = nodeByCf.get(cf); for (const m of nodes) { if (compOf.get(m.cf) === i) continue; const d = dist(n.c, m.c); if (!best || d < best.d || (d === best.d && (n.cf + m.cf) < (best.a + best.b))) best = { d, a: n.cf, b: m.cf, j: compOf.get(m.cf) }; } }
    if (!best) continue;
    landBridges.push({ from: best.a, to: best.b, gap: +best.d.toFixed(2) });
    adj.get(best.a).push(best.b); adj.get(best.b).push(best.a);
    uf[find(i)] = find(best.j);
  }
  // re-derive components after the joins (union of joined comps)
  const merged = new Map();
  comps.forEach((m, i) => { const r = find(i); if (!merged.has(r)) merged.set(r, []); merged.get(r).push(...m); });
  const comps2 = [...merged.values()].map((m) => m.sort()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  // tiny components (an island of a few parcels pinched between a river bend and the rim) fold into the
  // neighbouring region they touch most, so regions stay meaningful (≥ MIN_REGION nodes)
  const MIN_REGION = 40;
  const regionOf = new Map();
  const big = comps2.filter((m) => m.length >= MIN_REGION), small = comps2.filter((m) => m.length < MIN_REGION);
  big.forEach((m, i) => { for (const cf of m) regionOf.set(cf, `EDU-R${String(i + 1).padStart(2, "0")}`); });
  for (const m of small) {
    const votes = {};
    for (const cf of m) for (const [a, b] of cutEdges) { const o = a.cf === cf ? b.cf : b.cf === cf ? a.cf : null; if (o && regionOf.has(o)) votes[regionOf.get(o)] = (votes[regionOf.get(o)] || 0) + 1; }
    const best = Object.entries(votes).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0];
    for (const cf of m) regionOf.set(cf, best ? best[0] : "EDU-R00");
  }
  const regions = {}; for (const p of parcels) regions[p.cf] = regionOf.get(p.cf);
  const estateRegions = {}; for (const e of estates) estateRegions[e.cf] = regionOf.get(e.cf);
  const regionSizes = {}; for (const r of [...Object.values(regions), ...Object.values(estateRegions)]) regionSizes[r] = (regionSizes[r] || 0) + 1;
  // estate biomes (whole-estate maps): classify a ±0.6 u window at the estate centre by the same rule
  const estateBiomes = {};
  for (const e of estates) {
    const w = [e.c[0] - 0.6, e.c[1] - 0.6, e.c[0] + 0.6, e.c[1] + 0.6];
    const h = { road: 0, river: 0, ridge: 0 };
    for (const s of idx.near(w)) if (bandHitsRect(s, w)) h[s.kind]++;
    estateBiomes[e.cf] = h.road ? "ROAD" : h.river ? "RIVER" : h.ridge ? "MOUNTAIN" : ridgeDist(e.c) < 4.5 ? "HILLS" : (noise2(e.c[0], e.c[1]) + Math.max(0, (14 - ridgeDist(e.c)) * 0.012) < 0.5 ? "PLAINS" : "FOREST");
  }
  const graphComponents = comps.length;

  // ---- gates: road parcels that a barrier crosses, between two regions; ≥1 per touching region pair -------------
  const pairKey = (a, b) => [a, b].sort().join("~");
  const pairs = new Map();                                           // pairKey → { regions, edges:[cutEdges] }
  for (const e of cutEdges) { const ra = regionOf.get(e[0].cf), rb = regionOf.get(e[1].cf); if (ra === rb) continue; const k = pairKey(ra, rb); if (!pairs.has(k)) pairs.set(k, { regions: [ra, rb].sort(), edges: [] }); pairs.get(k).edges.push(e); }
  // a gate = a node whose bbox holds a REAL road × barrier crossing point (the bridge / the pass), on a cut edge
  // between two regions; ≤3 per region pair, ≥6 u apart; a pair with no road crossing gets the narrowest cut
  // edge as a ford (river) / scramble (ridge). Estate nodes can be gates too (their whole-estate map is the
  // battlefield of that crossing).
  const roadSegs = []; for (const r of field.roads) for (let i = 1; i < r.pts.length; i++) roadSegs.push([r.pts[i - 1], r.pts[i], r.id]);
  const crossingsIn = (node, kind) => {
    const bars = kind === "river" ? riverSegs : ridgeSegs; const out = [];
    for (const [a0, a1, rid] of roadSegs) {
      if (!segRect(a0[0], a0[1], a1[0], a1[1], node.bb)) continue;
      for (const [b0, b1, bid] of bars) if (segRect(b0[0], b0[1], b1[0], b1[1], node.bb) && segX(a0[0], a0[1], a1[0], a1[1], b0[0], b0[1], b1[0], b1[1])) out.push({ road: rid, barrier: bid });
    }
    return out;
  };
  const gates = {};                                                  // cf → gate record
  for (const [k, pr] of [...pairs.entries()].sort()) {
    const cands = [];
    for (const [a, b, kind] of pr.edges) for (const p of [a, b]) { const x = crossingsIn(p, kind); if (x.length) cands.push({ p, kind, via: x.map((c) => c.barrier).sort()[0], road: x.map((c) => c.road).sort()[0] }); }
    const picked = [];
    for (const c of cands.sort((x, y) => (x.p.cf < y.p.cf ? -1 : 1))) {
      if (picked.length >= 3 || picked.some((g) => g.p.cf === c.p.cf || dist(g.p.c, c.p.c) < 6)) continue;
      picked.push(c);
    }
    if (!picked.length) {                                            // narrowest cut edge → a ford / scramble
      const e = pr.edges.slice().sort((x, y) => dist(x[0].c, x[1].c) - dist(y[0].c, y[1].c) || (x[0].cf < y[0].cf ? -1 : 1))[0];
      picked.push({ p: e[0], kind: e[2], via: null, road: null, ford: true });
    }
    for (const g of picked) {
      gates[g.p.cf] = { parcelId: g.p.id, cf: g.p.cf, estate: !!g.p.estate, at: [+g.p.c[0].toFixed(2), +g.p.c[1].toFixed(2)],
        kind: g.ford ? (g.kind === "river" ? "ford" : "scramble") : (g.kind === "river" ? "bridge" : "pass"),
        connects: pr.regions, barrier: g.via, road: g.road, biome: g.p.estate ? estateBiomes[g.p.cf] : biomes[g.p.cf] };
    }
  }
  const barriers = [
    ...field.rivers.map((r) => ({ barrierId: `EDU-B-${r.id}`, kind: "river", name: r.name, regionBoundary: r.pts, gates: Object.values(gates).filter((g) => g.barrier === r.id).map((g) => ({ parcelId: g.cf, at: g.at, kind: g.kind })) })),
    ...field.ridges.map((r) => ({ barrierId: `EDU-B-${r.id}`, kind: "range", name: r.name, regionBoundary: r.pts, gates: Object.values(gates).filter((g) => g.barrier === r.id).map((g) => ({ parcelId: g.cf, at: g.at, kind: g.kind })) })),
  ];

  // ---- lore towns: road junctions + bridge-heads, away from castles/famous towns -----------------------------
  const roadsMajor = field.roads.filter((r) => r.tier === "highway" || r.tier === "secondary");
  const junctions = [];
  for (let i = 0; i < roadsMajor.length; i++) for (let j = i + 1; j < roadsMajor.length; j++) {
    const A = roadsMajor[i].pts, B = roadsMajor[j].pts;
    for (let a = 1; a < A.length; a++) for (let b = 1; b < B.length; b++)
      if (segX(A[a - 1][0], A[a - 1][1], A[a][0], A[a][1], B[b - 1][0], B[b - 1][1], B[b][0], B[b][1]))
        junctions.push({ at: [(A[a - 1][0] + A[a][0] + B[b - 1][0] + B[b][0]) / 4, (A[a - 1][1] + A[a][1] + B[b - 1][1] + B[b][1]) / 4], roads: [roadsMajor[i].id, roadsMajor[j].id] });
  }
  for (const g of Object.values(gates)) if (g.kind === "bridge") junctions.push({ at: g.at, roads: ["bridge-head:" + g.barrier], bridge: true });
  const avoid = [...[...castleParcels.keys()].map((id) => byId.get(id).c), ...FAMOUS.map((t) => byCf.get(t.cf)?.c).filter(Boolean), field.castles.find((c) => c.kind === "PALACE")?.at].filter(Boolean);
  const score = (j) => (j.bridge ? 1.0 : 0.8) + Math.min(1, riverDist(j.at) / 20) * 0.2 + 0.2 * (1 - Math.min(1, Math.abs(j.at[0] - 78) / 78));
  const picks = [];
  for (const j of junctions.sort((x, y) => score(y) - score(x) || (x.at[0] + x.at[1]) - (y.at[0] + y.at[1]))) {
    if (picks.length >= 6) break;
    if (j.at[0] < 8 || j.at[1] < 8 || j.at[0] > 148 || j.at[1] > 140) continue;
    if (avoid.some((a) => dist(a, j.at) < 7) || picks.some((p) => dist(p.at, j.at) < 14)) continue;
    let best = null; for (const p of parcels) if (!castleParcels.has(p.id) && !famousSet.has(p.cf) && (!best || dist(p.c, j.at) < dist(best.c, j.at))) best = p;
    if (!best || picks.some((p) => p.parcel.cf === best.cf)) continue;
    picks.push({ at: j.at, parcel: best, roads: j.roads, bridge: !!j.bridge });
  }
  // names from the EDU culture card: towns are named for lessons (First Question, Inkstone, Bellterrace…)
  const LORE = [
    { key: "first-question", name: "First Question", goods: ["food", "wood"], blurb: "the crossroads where every scholar's road begins — ask, and the inn answers with tea" },
    { key: "inkstone", name: "Inkstone", goods: ["stone", "rareMetal"], blurb: "the quarry-town of the inkstone seams; its grey blocks face half the Academy's cloisters" },
    { key: "bellterrace", name: "Bellterrace", goods: ["food", "fur"], blurb: "terraces under the rim where the Examination bell is heard first — rice, lamps and lodging" },
    { key: "second-lesson", name: "Second Lesson", goods: ["wood", "iron"], blurb: "the bridge-head market — timber down the Flow, iron up the terrace road, tolls both ways" },
    { key: "chalkford", name: "Chalkford", goods: ["stone", "food"], blurb: "the white ford on the West Tributary; carters rest here before the climb to Westgate" },
    { key: "lamplight-row", name: "Lamplight Row", goods: ["fur", "rareMetal"], blurb: "the study-lamp makers' street — oil, brass and the telepath circles' quiet trade" },
  ];
  const towns = picks.map((p, i) => ({ ...LORE[i], parcelId: p.parcel.cf, parcelIdCurrent: p.parcel.id, famous: false, at: [+p.at[0].toFixed(2), +p.at[1].toFixed(2)],
    region: regionOf.get(p.parcel.cf), site: p.bridge ? "bridge-head" : "road junction", roads: p.roads }));
  for (const t of towns) { biomes[t.parcelId] = biomes[t.parcelId] === "ROAD" ? "ROAD" : "PLAINS"; }

  // ---- ruins + monuments ---------------------------------------------------------------------------------
  // RUINs (depth layer 1): six Second-Age sites — two under each rimwall at deterministic thirds of the ridge,
  // on the nearest FOREST/HILLS parcel not already special. MONUMENTs: the Westgate field (castle approach),
  // the North Gate approach (Arcadia ↔ Tianxia), the Scholar's Gap.
  const special = new Set([...castleParcels.keys()].map((id) => byId.get(id).cf).concat([...famousSet], towns.map((t) => t.parcelId), Object.keys(gates)));
  const nearestPlain = (pt, pref) => { let best = null; for (const p of parcels) { if (special.has(p.cf)) continue; const b = biomes[p.cf]; if (!pref.includes(b)) continue; if (!best || dist(p.c, pt) < dist(best.c, pt)) best = p; } return best; };
  const ruins = [];
  const RUIN_NAMES = ["the Broken Lectern", "the Drowned Library", "the Old Examination Hall", "the Unlit Beacon", "the Quarry Chapel", "the Fallen Torii"];
  const RUIN_INSCRIPTIONS = ["Here the Second Age argued, and lost.", "The water took the books; the lessons stayed.", "No bell rang for the last class.", "They watched the north until the north came.", "Stone remembers the hands that cut it.", "Pass under, and leave your question."];
  let rn = 0;
  for (const rg of field.ridges) for (const f of [0.33, 0.67]) {
    const i = Math.min(rg.pts.length - 1, Math.round((rg.pts.length - 1) * f)), pt = rg.pts[i];
    const p = nearestPlain(pt, ["HILLS", "FOREST"]);
    if (!p) continue;
    special.add(p.cf);
    ruins.push({ id: `EDU-RUIN-${String(rn + 1).padStart(2, "0")}`, kind: "RUIN", ruinType: rn % 2 ? "WATCHTOWER" : "SHRINE", name: RUIN_NAMES[rn], inscription: RUIN_INSCRIPTIONS[rn], under: rg.name, parcelId: p.cf, parcelIdCurrent: p.id, at: [+p.c[0].toFixed(2), +p.c[1].toFixed(2)], region: regionOf.get(p.cf) });
    rn++;
  }
  const westgate = field.castles.find((c) => c.id.includes("WESTGATE")) || field.castles[0];
  const gapPoi = (field.pois || []).find((p) => p.id === "EDU-GATE-GAP"), northPoi = (field.pois || []).find((p) => p.id === "EDU-GATE-N");
  const monuments = [];
  for (const [i, m] of [[0, { name: "The Westgate Field", at: westgate.at, note: "where the first siege of Westgate was broken — the Chronicle's first EDU battle-name" }],
                        [1, { name: "The North Stele", at: northPoi ? northPoi.at : [63, 2], note: "the boundary stone on the Tianxia road: the first deed through the North Gate is inscribed here" }],
                        [2, { name: "The Scholar's Cairn", at: gapPoi ? gapPoi.at : [10, 70], note: "cairn at the Scholar's Gap — first through the pass carves a name" }]]) {
    const p = nearestPlain(m.at, ["PLAINS", "HILLS", "FOREST"]);
    if (!p) continue;
    special.add(p.cf);
    monuments.push({ id: `EDU-MON-${i + 1}`, kind: "MONUMENT", name: m.name, note: m.note, parcelId: p.cf, parcelIdCurrent: p.id, at: [+p.c[0].toFixed(2), +p.c[1].toFixed(2)], region: regionOf.get(p.cf) });
  }

  // ---- castles + hero parcels in CF ids; golden check -----------------------------------------------------------
  const castles = field.castles.map((c) => ({ id: c.id, kind: c.kind, name: c.name, estate: c.townEstateId, at: c.at,
    heroParcels: (c.heroParcels || []).map((id) => byId.get(String(id))?.cf || null), heroParcelsCurrent: c.heroParcels || [],
    castleParcel: c.heroParcels && c.heroParcels.length ? byId.get(String(c.heroParcels[0]))?.cf : null, estateMap: !(c.heroParcels && c.heroParcels.length) }));
  const golden = GOLDEN.map((cf) => ({ cf, parcelId: byCf.get(cf)?.id || null, biome: biomes[cf] || null, region: regions[cf] || null }));
  const famous = FAMOUS.map((t) => ({ ...t, parcelId: byCf.get(t.cf)?.id || null, found: byCf.has(t.cf), biome: biomes[t.cf] || null, region: regions[t.cf] || null }));

  const idMap = {}; for (const p of parcels) if (p.cf !== p.id) idMap[p.cf] = p.id;
  const out = {
    _meta: {
      title: "Continent 1 — EDU (Arcadia) designation pass: biomes · regions/gates · lore towns · ruins · monuments",
      author: "CF ParcelMap Design Agent, 2026-10-27 — regenerate with map-service/tools/world_continent_edu.mjs (deterministic; builds twice + sha-compares)",
      brief: "docs/briefs/CONTINENT-1-EDU.md §1.3–1.5 · docs/maps/REGION-GATE-SPEC.md §2 · status: docs/maps/CONTINENT-1-EDU-STATUS.md",
      idScheme: "Keys of biomes/regions/gates and towns[].parcelId / pois[].parcelId are CF's ids = the OLD hexagon-city token id (tokenIdOld, `602…`) that data/demo-world.json + data/towns.json use. `parcelIdCurrent` / idMap give the CURRENT id (designer registry, world fields). Same 10-digit tail; only the leading size digit differs.",
      biomeRule: "canon HexTerrain only; precedence ROAD > RIVER > MOUNTAIN > HILLS (rim terraces ≤4.5u, castle parcels) > PLAINS (towns, river basin, noise<0.5) > FOREST. EDU is an inland plateau: no COAST/OCEAN. A road over a river/ridge is ROAD (the bridge/pass = the gate parcel).",
      regionRule: "bbox-touch adjacency cut by river/ridge bands → components; <40-parcel slivers fold into the neighbouring region; EDU-R<nn> numbered by smallest CF id. Gates: ROAD parcels a barrier crosses (bridge/pass); every touching region pair keeps ≥1 (narrowest cut edge → ford/scramble).",
      coords: field._meta.coords,
      counts: { parcels: parcels.length, estatesUnsubdivided: estates.length, biomes: tally, regions: regionSizes, graphComponentsBeforeFold: graphComponents, gates: Object.keys(gates).length, towns: towns.length, ruins: ruins.length, monuments: monuments.length, cutEdges: cutEdges.length },
    },
    zone: "EDU",
    biomes, estateBiomes, regions, estateRegions, gates, barriers, landBridges,
    towns, famousTowns: famous, castles, golden,
    pois: [...ruins, ...monuments],
    idMap,
  };
  return out;
}

const o1 = build(), s1 = JSON.stringify(o1) + "\n";
const s2 = JSON.stringify(build()) + "\n";
const h1 = createHash("sha256").update(s1).digest("hex"), h2 = createHash("sha256").update(s2).digest("hex");
if (h1 !== h2) { console.error("NON-DETERMINISTIC BUILD", h1, h2); process.exit(1); }
writeFileSync(path.join(ROOT, "data/world-terrain/EDU.continent.json"), s1);
console.log("wrote data/world-terrain/EDU.continent.json sha256", h1.slice(0, 16), (s1.length / 1024).toFixed(0) + " KB");
console.log("biomes", JSON.stringify(o1._meta.counts.biomes));
console.log("regions", JSON.stringify(o1._meta.counts.regions), "components before fold", o1._meta.counts.graphComponentsBeforeFold, "cut edges", o1._meta.counts.cutEdges, "land bridges", o1.landBridges.length, JSON.stringify(o1.landBridges.slice(0, 4)));
console.log("gates", o1._meta.counts.gates, Object.values(o1.gates).map((g) => `${g.kind}@${g.cf}${g.estate ? "[estate]" : ""}(${g.connects.join("↔")})`).join(" "));
console.log("towns", o1.towns.map((t) => `${t.name}@${t.parcelId}[${t.site}]`).join(" | "));
console.log("ruins", o1.pois.filter((p) => p.kind === "RUIN").map((p) => `${p.name}@${p.parcelId}`).join(" | "));
console.log("monuments", o1.pois.filter((p) => p.kind === "MONUMENT").map((p) => `${p.name}@${p.parcelId}`).join(" | "));
console.log("famous", o1.famousTowns.map((t) => `${t.name}:${t.found ? t.biome + "/" + t.region : "NOT FOUND"}`).join(" | "));
console.log("golden", o1.golden.map((g) => `${g.cf}:${g.biome}`).join(" "));
console.log("castles", o1.castles.map((c) => `${c.kind}:${c.name}:${c.castleParcel || "estate-map"}:hero=${c.heroParcels.length}`).join(" | "));
