// Detail-feature executor — turns the LLM's clamped features[] DSL into terrain paint and
// placement requests, using the SAME deterministic primitives the archetypes use. Runs after
// the archetype base coat and before the polygon cut / validator, so hostile or over-ambitious
// feature spam can block nothing permanently (the validator carves) and can never paint OOB.
import { T, gIdx, inG } from "./schema.js";
import { blob, band, gaps } from "./archetypes.js";

// straight painted line (ridges/roads), width `w` cells; returns sample centers for gap-punching
function line(g, G, ax, az, bx, bz, w, type) {
  const centers = [];
  const steps = Math.max(Math.abs(bx - ax), Math.abs(bz - az)) || 1;
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(ax + ((bx - ax) * s) / steps), z = Math.round(az + ((bz - az) * s) / steps);
    for (let dz = -w; dz <= w; dz++) for (let dx = -w; dx <= w; dx++)
      if (inG(G, x + dx, z + dz) && dx * dx + dz * dz <= w * w + 1) g[gIdx(G, x + dx, z + dz)] = type;
    if (s % 10 === 0) centers.push([x, z]);
  }
  return centers;
}

// clamped features → paint on g + collected placement requests (positions in WORLD coords).
// Normalized -1..1 coords map to ±(sizeM/2 · 0.92) so features stay off the extreme rim.
export function executeFeatures(g, G, rng, feats, sizeM) {
  const half = sizeM / 2, K = half * 0.92;
  const C = (n) => Math.max(0, Math.min(G - 1, Math.round((n * K + half) / (sizeM / G)))); // norm → cell
  const W = (n) => Math.round(n * K * 10) / 10;                                            // norm → world
  const R = (r) => Math.max(2, Math.round(r * G));                                         // frac → cells
  const placed = { landmarkAt: null, resources: [], mobs: [], towers: [] };
  for (const f of feats || []) {
    switch (f.kind) {
      case "forestPatch": blob(g, G, rng, C(f.x), C(f.z), R(f.r), T.FOREST, 0.55); break;
      case "rockPatch":   blob(g, G, rng, C(f.x), C(f.z), R(f.r), T.ROCK, 0.55); break;
      case "waterPool":   blob(g, G, rng, C(f.x), C(f.z), R(f.r), T.WATER, 0.6); break;
      case "clearing":    blob(g, G, rng, C(f.x), C(f.z), R(f.r), T.OPEN, 0.3); break;
      case "riverBand": {
        const w = Math.max(2, Math.round(f.width * G * 0.5));
        const centers = band(g, G, rng, f.axis, f.at * G, w, T.WATER);
        gaps(g, G, rng, centers, f.fords, w);
        break;
      }
      case "ridge": {
        const centers = line(g, G, C(f.x1), C(f.z1), C(f.x2), C(f.z2), 2, T.ROCK);
        gaps(g, G, rng, centers, f.passes, 3);
        break;
      }
      case "road": line(g, G, C(f.x1), C(f.z1), C(f.x2), C(f.z2), 1, T.ROAD); break;
      case "landmarkAt": placed.landmarkAt = { x: W(f.x), z: W(f.z) }; break;
      case "resourceAt": placed.resources.push({ kind: f.res, x: W(f.x), z: W(f.z) }); break;
      case "mobCampAt":  placed.mobs.push({ x: W(f.x), z: W(f.z) }); break;
      case "towerAt":    placed.towers.push({ x: W(f.x), z: W(f.z) }); break;
    }
  }
  return placed;
}
