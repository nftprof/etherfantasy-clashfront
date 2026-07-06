// Terrain archetypes — each is a small parametric layout fn that paints the u8 terrain grid
// with a seeded rng. Hand-tuned shapes (not noise soup); the validator carves anything that
// over-blocks. All randomness comes from the passed rng — NEVER Math.random (determinism canon).
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

// punch `n` gaps (ROAD) through a painted band — fords / passes / causeway gates
export function gaps(g, G, rng, centers, n, halfW) {
  const picked = [];
  for (let k = 0; k < n && centers.length; k++) {
    const i = Math.floor(rng() * centers.length);
    const [cx, cz] = centers.splice(i, 1)[0];
    picked.push([cx, cz]);
    for (let z = cz - halfW * 2; z <= cz + halfW * 2; z++) for (let x = cx - halfW * 2; x <= cx + halfW * 2; x++)
      if (inG(G, x, z) && Math.abs(x - cx) <= halfW + 1 && Math.abs(z - cz) <= halfW + 1) g[gIdx(G, x, z)] = T.ROAD;
  }
  return picked;
}

const scatter = (g, G, rng, n, rMin, rMax, type, rough) => {
  for (let i = 0; i < n; i++) blob(g, G, rng, 4 + Math.floor(rng() * (G - 8)), 4 + Math.floor(rng() * (G - 8)), rMin + Math.floor(rng() * (rMax - rMin + 1)), type, rough);
};

// each archetype: (g, G, rng, p) → { features:[{kind,cx,cz}] } — feature spots seed landmarks/props
export const archetypes = {
  openSteppe(g, G, rng, p) {
    scatter(g, G, rng, 6 + Math.floor(p.density * 8), 2, 5, T.ROCK, p.roughness);
    scatter(g, G, rng, 3 + Math.floor(p.density * 5), 3, 6, T.FOREST, p.roughness);
    return { features: [] };
  },
  forestMaze(g, G, rng, p) {
    scatter(g, G, rng, 16 + Math.floor(p.density * 18), 4, 9, T.FOREST, Math.max(0.5, p.roughness));
    scatter(g, G, rng, 4, 2, 3, T.ROCK, p.roughness);
    return { features: [{ kind: "clearing", cx: G >> 1, cz: G >> 1 }] };
  },
  riverCrossing(g, G, rng, p) {
    const w = 3 + Math.round(p.waterLevel * 4);
    const centers = band(g, G, rng, "x", G / 2 + (rng() - 0.5) * G * 0.2, w, T.WATER);
    const fords = gaps(g, G, rng, centers, 2 + Math.round(rng()), w);
    scatter(g, G, rng, 5 + Math.floor(p.density * 6), 3, 6, T.FOREST, p.roughness);
    return { features: fords.map(([cx, cz]) => ({ kind: "ford", cx, cz })) };
  },
  boxCanyon(g, G, rng, p) {
    const m = Math.round(G * 0.22);   // canyon walls framing an open heart; validator guarantees entries
    for (let z = m; z < G - m; z++) for (const x of [m, G - m - 1]) { g[gIdx(G, x, z)] = T.CLIFF; g[gIdx(G, x + (x === m ? 1 : -1), z)] = T.CLIFF; }
    for (let x = m; x < G - m; x++) for (const z of [m, G - m - 1]) { g[gIdx(G, x, z)] = T.CLIFF; g[gIdx(G, x, z + (z === m ? 1 : -1))] = T.CLIFF; }
    gaps(g, G, rng, [[m, G >> 1], [G - m - 1, G >> 1], [G >> 1, m], [G >> 1, G - m - 1]], 3, 3);
    scatter(g, G, rng, 4 + Math.floor(p.density * 4), 2, 4, T.ROCK, p.roughness);
    return { features: [{ kind: "canyonHeart", cx: G >> 1, cz: G >> 1 }] };
  },
  cliffTerraces(g, G, rng, p) {
    const rows = [Math.round(G * 0.33), Math.round(G * 0.62)];
    let feats = [];
    for (const at of rows) {
      const centers = band(g, G, rng, "x", at, 1, T.CLIFF, 5);
      feats = feats.concat(gaps(g, G, rng, centers, 2, 3).map(([cx, cz]) => ({ kind: "pass", cx, cz })));
    }
    scatter(g, G, rng, 4 + Math.floor(p.density * 5), 3, 5, T.FOREST, p.roughness);
    return { features: feats };
  },
  marshCauseways(g, G, rng, p) {
    scatter(g, G, rng, 14 + Math.floor(p.waterLevel * 14), 3, 8, T.WATER, Math.max(0.6, p.roughness));
    scatter(g, G, rng, 5 + Math.floor(p.density * 4), 2, 4, T.FOREST, p.roughness);  // dry hummocks with brush
    scatter(g, G, rng, 3, 1, 2, T.ROCK, p.roughness);
    // causeway cross: guaranteed dry roads N-S and W-E through the marsh
    for (let t = 0; t < G; t++) for (const [x, z] of [[G >> 1, t], [t, G >> 1]])
      for (let w = -1; w <= 1; w++) { if (inG(G, x + (z === t ? w : 0), z + (x === t ? w : 0))) g[gIdx(G, x + (z === t ? w : 0), z + (x === t ? w : 0))] = T.ROAD; }
    return { features: [{ kind: "crossroads", cx: G >> 1, cz: G >> 1 }] };
  },
  ridgePasses(g, G, rng, p) {
    // diagonal rock ridge with passes: paint along the main diagonal with wobble
    const centers = [];
    for (let t = 4; t < G - 4; t++) {
      const c = Math.round(t + (rng() - 0.5) * 8);
      for (let w = -2; w <= 2; w++) if (inG(G, t, c + w)) g[gIdx(G, t, c + w)] = T.ROCK;
      if (t % 10 === 0) centers.push([t, c]);
    }
    const passes = gaps(g, G, rng, centers, 2 + Math.round(rng()), 3);
    scatter(g, G, rng, 3 + Math.floor(p.density * 4), 3, 5, T.FOREST, p.roughness);
    return { features: passes.map(([cx, cz]) => ({ kind: "pass", cx, cz })) };
  },
};
