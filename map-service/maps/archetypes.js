// Terrain archetypes — each paints the u8 terrain grid with a DENSE, MOBA-style base coat
// (jungle fill) from seeded value-noise, plus a hand-tuned structural overlay (river / canyon /
// ridge / terraces). The generator then CARVES the lane network + corridors + clearings out of
// this mass (generate.js carveMobaNetwork), the way the real MOBA map is mostly jungle with
// deliberate lanes. All randomness comes from the passed rng — NEVER Math.random (determinism
// canon). Target: ~35–55% of in-bounds cells blocked AFTER carving (the golden reference's
// jungle density), vs the old sparse scattered-blob look the owner rejected as unplayable.
import { T, gIdx, inG } from "./schema.js";

// blobby disk of `type` centered (cx,cz), radius r cells, edge irregularity `rough` 0..1
// (exported: the detail-feature executor composes maps from these same primitives)
export function blob(g, G, rng, cx, cz, r, type, rough = 0.5) {
  for (let z = cz - r; z <= cz + r; z++) for (let x = cx - r; x <= cx + r; x++) {
    if (!inG(G, x, z)) continue;
    const d = Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz));
    if (d <= r * (1 - rough * 0.4 + rng() * rough * 0.8)) g[gIdx(G, x, z)] = type;
  }
}

// meandering band of `type` across the grid; axis 'x' = spans west→east. Returns center samples.
export function band(g, G, rng, axis, at, width, type, wobble = 8) {
  const pts = [];
  let c = at;
  for (let t = 0; t < G; t++) {
    c += (rng() - 0.5) * 2 * (wobble / G) * 3;
    c = Math.max(width + 2, Math.min(G - width - 3, c));
    for (let w = -width; w <= width; w++) {
      const [x, z] = axis === "x" ? [t, Math.round(c) + w] : [Math.round(c) + w, t];
      if (inG(G, x, z)) g[gIdx(G, x, z)] = type;
    }
    if (t % 10 === 0) pts.push(axis === "x" ? [t, Math.round(c)] : [Math.round(c), t]);
  }
  return pts;
}

// punch `n` gaps through a painted band — fords / passes / causeway gates. `code` is what the
// gap is paved with: T.ROAD for water fords + designed-arena passes, T.OPEN for countryside
// passes (owner 2026-07-10: T.ROAD comes ONLY from the world layer + water fords — a rock/cliff
// pass on a wild single is bare ground, not pavement).
export function gaps(g, G, rng, centers, n, halfW, code = T.ROAD) {
  const picked = [];
  for (let k = 0; k < n && centers.length; k++) {
    const i = Math.floor(rng() * centers.length);
    const [cx, cz] = centers.splice(i, 1)[0];
    picked.push([cx, cz]);
    for (let z = cz - halfW * 2; z <= cz + halfW * 2; z++) for (let x = cx - halfW * 2; x <= cx + halfW * 2; x++)
      if (inG(G, x, z) && Math.abs(x - cx) <= halfW + 1 && Math.abs(z - cz) <= halfW + 1) g[gIdx(G, x, z)] = code;
  }
  return picked;
}

// ---- seeded value-noise (the dense jungle base coat) ------------------------------------------
// coarse rng lattice + smoothstep bilinear interpolation → organic blobs, fully deterministic
function lattice(rng, W) { const a = new Float64Array(W * W); for (let i = 0; i < W * W; i++) a[i] = rng(); return a; }
function latAt(lat, W, u, v) {
  const x0 = Math.max(0, Math.min(W - 2, Math.floor(u))), z0 = Math.max(0, Math.min(W - 2, Math.floor(v)));
  const fx = Math.max(0, Math.min(1, u - x0)), fz = Math.max(0, Math.min(1, v - z0));
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = lat[z0 * W + x0], b = lat[z0 * W + x0 + 1], c = lat[(z0 + 1) * W + x0], d = lat[(z0 + 1) * W + x0 + 1];
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

// BIOME flavour of the fill: what the jungle mass is MADE of (palette = the biome-derived skin).
// waterLevel biases the wet share (SWAMP drowns, DESERT parches). "forest" in DESERT = scrub.
const MIX = {
  verdant:  { forest: 0.80, rock: 0.14, water: 0.06, cliff: 0.00 },
  autumn:   { forest: 0.76, rock: 0.17, water: 0.07, cliff: 0.00 },
  sakura:   { forest: 0.80, rock: 0.12, water: 0.08, cliff: 0.00 },
  swamp:    { forest: 0.46, rock: 0.06, water: 0.48, cliff: 0.00 },
  volcanic: { forest: 0.06, rock: 0.56, water: 0.22, cliff: 0.16 },   // "water" renders as lava
  ember:    { forest: 0.10, rock: 0.52, water: 0.14, cliff: 0.24 },   // HS2: rock = ember-red crystal outcrops, dark scarps — no lava in the sky
  ashen:    { forest: 0.14, rock: 0.50, water: 0.06, cliff: 0.30 },
  tundra:   { forest: 0.30, rock: 0.40, water: 0.08, cliff: 0.22 },
  desert:   { forest: 0.34, rock: 0.58, water: 0.08, cliff: 0.00 },   // brush + rock, rare oasis
};
function biomeMix(p) {
  const m = { ...(MIX[p.palette] || MIX.verdant) };
  const shift = ((p.waterLevel ?? 0.4) - 0.4) * 0.25;
  m.water = Math.max(0.02, m.water + shift);
  return m;
}

// Paint `coverage` of the currently-OPEN cells as blocked biome terrain. freq = feature size
// (higher = smaller clumps). mirror ⇒ the field is 180°-rotation symmetric (PVP fairness — the
// carved lane network + spawns are symmetric too, so both armies read the same jungle).
export function denseFill(g, G, rng, { coverage, freq = 0.075, mix, mirror = true, rough = 0.5 }) {
  const W1 = Math.max(4, Math.round(G * freq) + 2);
  const W2 = Math.max(6, W1 * 2 - 1);
  const WT = Math.max(4, Math.round(G * 0.045) + 2);
  const L1 = lattice(rng, W1), L2 = lattice(rng, W2), LT = lattice(rng, WT);
  const wD = 0.22 + rough * 0.28;                       // detail-octave weight = crag factor
  const smp = (lat, W, x, z) => latAt(lat, W, (x / (G - 1)) * (W - 1), (z / (G - 1)) * (W - 1));
  const shape = (x, z) => smp(L1, W1, x, z) * (1 - wD) + smp(L2, W2, x, z) * wD;
  const val = new Float64Array(G * G);
  for (let z = 0; z < G; z++) for (let x = 0; x < G; x++) {
    let v = shape(x, z);
    if (mirror) v = (v + shape(G - 1 - x, G - 1 - z)) / 2;
    val[gIdx(G, x, z)] = v;
  }
  // threshold at the coverage quantile over paintable cells → the blocked fraction is exact
  const sorted = [];
  for (let i = 0; i < G * G; i++) if (g[i] === T.OPEN) sorted.push(val[i]);
  if (!sorted.length) return;
  sorted.sort((a, b) => a - b);
  const thr = sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * (1 - Math.max(0, Math.min(0.9, coverage))))))];
  const tot = mix.forest + mix.rock + mix.water + (mix.cliff || 0);
  const cW = mix.water / tot, cR = cW + mix.rock / tot, cC = cR + (mix.cliff || 0) / tot;
  for (let z = 0; z < G; z++) for (let x = 0; x < G; x++) {
    const i = gIdx(G, x, z);
    if (g[i] !== T.OPEN || val[i] < thr) continue;
    let t = smp(LT, WT, x, z);
    if (mirror) t = (t + smp(LT, WT, G - 1 - x, G - 1 - z)) / 2;
    g[i] = t < cW ? T.WATER : t < cR ? T.ROCK : t < cC ? T.CLIFF : T.FOREST;
  }
}

// each archetype: (g, G, rng, p) → { features:[{kind,cx,cz}] } — feature spots seed landmarks.
// Every archetype = dense base coat (biome-flavoured) + its signature structural overlay; the
// generator carves the MOBA lane network afterwards. `p.density` biases the jungle coverage.
export const archetypes = {
  openSteppe(g, G, rng, p) {
    // rolling steppe: patchier, smaller copses/outcrops — the OPEN archetype, still real jungle
    denseFill(g, G, rng, { coverage: 0.38 + p.density * 0.14, freq: 0.105, mix: biomeMix(p), mirror: p.mirrorFair !== false, rough: p.roughness });
    return { features: [] };
  },
  forestMaze(g, G, rng, p) {
    // deep contiguous woods with winding gaps — the densest fill, low-frequency masses
    denseFill(g, G, rng, { coverage: 0.52 + p.density * 0.10, freq: 0.078, mix: biomeMix(p), mirror: p.mirrorFair !== false, rough: Math.max(0.5, p.roughness) });
    return { features: [{ kind: "clearing", cx: G >> 1, cz: G >> 1 }] };
  },
  riverCrossing(g, G, rng, p) {
    denseFill(g, G, rng, { coverage: 0.40 + p.density * 0.10, freq: 0.08, mix: biomeMix(p), mirror: p.mirrorFair !== false, rough: p.roughness });
    const w = 3 + Math.round(p.waterLevel * 3);
    const centers = band(g, G, rng, "x", G / 2 + (rng() - 0.5) * G * 0.2, w, T.WATER);
    const fords = gaps(g, G, rng, centers, 2 + Math.round(rng()), w);
    return { features: fords.map(([cx, cz]) => ({ kind: "ford", cx, cz })) };
  },
  boxCanyon(g, G, rng, p) {
    const mix = biomeMix(p);
    denseFill(g, G, rng, { coverage: 0.38 + p.density * 0.12, freq: 0.09, mix: { ...mix, rock: mix.rock + 0.2 }, mirror: p.mirrorFair !== false, rough: p.roughness });
    const m = Math.round(G * 0.22);   // thick canyon walls framing the heart; gates punched below
    for (let z = m; z < G - m; z++) for (const x of [m, m + 1, m + 2, G - m - 3, G - m - 2, G - m - 1]) g[gIdx(G, x, z)] = T.CLIFF;
    for (let x = m; x < G - m; x++) for (const z of [m, m + 1, m + 2, G - m - 3, G - m - 2, G - m - 1]) g[gIdx(G, x, z)] = T.CLIFF;
    gaps(g, G, rng, [[m + 1, G >> 1], [G - m - 2, G >> 1], [G >> 1, m + 1], [G >> 1, G - m - 2]], 4, 3, p.laneCount === 1 ? T.OPEN : T.ROAD);
    return { features: [{ kind: "canyonHeart", cx: G >> 1, cz: G >> 1 }] };
  },
  cliffTerraces(g, G, rng, p) {
    denseFill(g, G, rng, { coverage: 0.36 + p.density * 0.12, freq: 0.085, mix: biomeMix(p), mirror: p.mirrorFair !== false, rough: p.roughness });
    const rows = [Math.round(G * 0.33), Math.round(G * 0.62)];
    let feats = [];
    for (const at of rows) {
      const centers = band(g, G, rng, "x", at, 2, T.CLIFF, 5);
      feats = feats.concat(gaps(g, G, rng, centers, 2, 3, p.laneCount === 1 ? T.OPEN : T.ROAD).map(([cx, cz]) => ({ kind: "pass", cx, cz })));
    }
    return { features: feats };
  },
  marshCauseways(g, G, rng, p) {
    const mix = biomeMix(p);
    denseFill(g, G, rng, { coverage: 0.42 + p.waterLevel * 0.10, freq: 0.07, mix: { ...mix, water: Math.min(0.7, mix.water + 0.25) }, mirror: p.mirrorFair !== false, rough: Math.max(0.5, p.roughness) });
    // causeway cross (DESIGNED arenas only): guaranteed dry roads N-S and W-E through the marsh.
    // Countryside singles (laneCount 1) get NO cross — that was a per-parcel road template
    // (owner 2026-07-10: roads live on the world layer); the carve stage fords the marsh where
    // its organic corridors actually cross water, which is the honest causeway.
    if (p.laneCount !== 1)
      for (let t = 0; t < G; t++) for (const [x, z] of [[G >> 1, t], [t, G >> 1]])
        for (let w = -1; w <= 1; w++) { if (inG(G, x + (z === t ? w : 0), z + (x === t ? w : 0))) g[gIdx(G, x + (z === t ? w : 0), z + (x === t ? w : 0))] = T.ROAD; }
    return { features: [{ kind: "crossroads", cx: G >> 1, cz: G >> 1 }] };
  },
  ridgePasses(g, G, rng, p) {
    denseFill(g, G, rng, { coverage: 0.38 + p.density * 0.12, freq: 0.08, mix: biomeMix(p), mirror: p.mirrorFair !== false, rough: p.roughness });
    // NW–SE rock ridge (perpendicular to the SW→NE attack diagonal) with punched passes
    const centers = [];
    for (let t = 4; t < G - 4; t++) {
      const c = Math.round(G - 1 - t + (rng() - 0.5) * 8);
      for (let w = -3; w <= 3; w++) if (inG(G, t, c + w)) g[gIdx(G, t, c + w)] = T.ROCK;
      if (t % 10 === 0) centers.push([t, Math.max(0, Math.min(G - 1, c))]);
    }
    const passes = gaps(g, G, rng, centers, 2 + Math.round(rng()), 3, p.laneCount === 1 ? T.OPEN : T.ROAD);
    return { features: passes.map(([cx, cz]) => ({ kind: "pass", cx, cz })) };
  },
};
