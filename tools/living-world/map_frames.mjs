// D50 — anchor living-world battle layouts on the REAL baked map (map-frames.json): the parcel's own bounds polygon,
// its attacker spawn, and a keep anchor = the map's defender base, slid toward the polygon centroid (25 % steps) until
// the whole keep layout (ring r 16, gates, two towers) and the attacker spawn sit inside the bounds. Measured: the old
// fixed lane layout (keep at z 114.8) fit only 191 of 373 baked maps; anchored, all 373 fit at full scale.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const FRAMES = JSON.parse(fs.readFileSync(path.join(ROOT, "data/living-world/map-frames.json"), "utf8")).maps;
export const inPoly = ([x, z], P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
export const keepLayout = (K, sc = 1) => { const pts = [K]; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI * 1.25; pts.push([K[0] + Math.cos(a) * 16 * sc, K[1] + Math.sin(a) * 16 * sc]); } pts.push([K[0] - 15 * sc, K[1] - 5 * sc], [K[0] - 5 * sc, K[1] - 15 * sc]); return pts; };
export function frameFor(mapId) {
  const m = FRAMES[mapId]; if (!m) return null;
  const C = [m.bounds.reduce((n, p) => n + p[0], 0) / m.bounds.length, m.bounds.reduce((n, p) => n + p[1], 0) / m.bounds.length];
  for (const sc of [1, 0.75, 0.6]) for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const K = [Math.round((m.defBase[0] + (C[0] - m.defBase[0]) * t) * 10) / 10, Math.round((m.defBase[1] + (C[1] - m.defBase[1]) * t) * 10) / 10];
    if (keepLayout(K, sc).every((p) => inPoly(p, m.bounds)) && inPoly(m.atkSpawn, m.bounds)) return { bounds: m.bounds, K, scale: sc, slide: t, atkSpawn: m.atkSpawn };
  }
  return { bounds: m.bounds, K: m.defBase, scale: 1, slide: 0, atkSpawn: m.atkSpawn, unfit: true };
}
