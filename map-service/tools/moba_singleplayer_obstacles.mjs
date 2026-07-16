#!/usr/bin/env node
// moba_singleplayer_obstacles.mjs — inject the single-player OBSTACLE/COLLISION layer into
// data/moba-maps/MOBA-SINGLEPLAYER.artifact.json (MOBA HANDOFF/ARTIFACT-OBSTACLE-GAP.md).
//
// The built-in arena forces its 3 lanes with a solid obstacle set the reverse-engineered artifact
// lacked: the WALLS ridge array (12 rock ridge segments, rocks every ~5 u, r:3 — gaps between
// paired segments are the jungle paths; corridor seals start clear of the lanes) + 32 solid field
// trees (r:2) placed off the lane corridors. Encoded BOTH ways the gap doc accepts:
//   (A) terrain: ridge cells painted ROCK, tree cells FOREST, walk mask 0 under both
//   (B) obstacles[]: explicit {kind, x, z, r} circles (the game's m.obst seam is [[x,z,r]])
//
// index.html places the 32 trees with Math.random() (unreproducible) — here they are DETERMINISTIC
// from the artifact seed, same rejection constraints (± the west-arm guard the original missed).
// Idempotent: strips previously-injected entries (anchorId tags) before re-adding.
//
//   node map-service/tools/moba_singleplayer_obstacles.mjs [--dry]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const FILE = path.join(ROOT, "data/moba-maps/MOBA-SINGLEPLAYER.artifact.json");
const DRY = process.argv.includes("--dry");

const MAPK = 1.4;
const T = { OPEN: 0, FOREST: 1, ROCK: 2, WATER: 3, CLIFF: 4, ROAD: 5, OOB: 6 };
// index.html ~1749, verbatim (UNSCALED — ×MAPK below lands in the ratified ±161 frame)
const WALLS = [
  [[-52, -6], [-26, 20]], [[-10, 36], [16, 62]],   // upper-left jungle ridge (gap = jungle path)
  [[-6, -52], [20, -26]], [[36, -10], [62, 16]],   // lower-right jungle ridge (gap = jungle path)
  [[-86, -40], [-86, 56]], [[86, -56], [86, 40]],  // west / east border ridges
  [[-40, -86], [56, -86]], [[-56, 86], [40, 86]],  // south / north border ridges
  [[-100, 0], [-84, 0]], [[84, 0], [100, 0]],      // corridor seals (start clear of the lane)
  [[0, -100], [0, -84]], [[0, 84], [0, 100]],
].map((seg) => seg.map(([x, z]) => [x * MAPK, z * MAPK]));

const art = JSON.parse(readFileSync(FILE, "utf8"));
const G = art.terrain.w, CELL = art.terrain.cellM, half = art.arena.sizeM / 2;
const cells = Uint8Array.from(Buffer.from(art.terrain.cells, "base64"));
const walk = Uint8Array.from(Buffer.from(art.terrain.walk, "base64"));
const cellOf = (w) => Math.max(0, Math.min(G - 1, Math.floor((w + half) / CELL)));

let s = ((art.meta?.seed ?? 1) >>> 0) ^ 0x0b57ac1e;
const rng = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// idempotency: drop anything this tool added before
art.obstacles = (art.obstacles || []).filter((o) => !String(o.anchorId || "").startsWith("sp_"));

const blockCells = (wx, wz, r, code) => {
  const c0x = cellOf(wx - r), c1x = cellOf(wx + r), c0z = cellOf(wz - r), c1z = cellOf(wz + r);
  for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
    const ccx = -half + (cx + 0.5) * CELL, ccz = -half + (cz + 0.5) * CELL;
    if ((ccx - wx) ** 2 + (ccz - wz) ** 2 > r * r) continue;
    const i = cz * G + cx;
    if (cells[i] === T.ROAD) continue;                 // never paint over a lane (seals sit clear anyway)
    cells[i] = code; walk[i] = 0;
  }
};

// 1) WALLS → rock nodes every ~5 u (±0.75 jitter), r:3, ROCK cells + walk 0
let ridgeRocks = 0;
for (let w = 0; w < WALLS.length; w++) {
  const [[ax, az], [bx, bz]] = WALLS[w];
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = +(ax + (bx - ax) * t + (rng() * 1.5 - 0.75)).toFixed(1);
    const z = +(az + (bz - az) * t + (rng() * 1.5 - 0.75)).toFixed(1);
    art.obstacles.push({ kind: "ROCK", x, z, r: 3, anchorId: `sp_wall${w}_${i}` });
    blockCells(x, z, 3, T.ROCK);
    ridgeRocks++;
  }
}

// 2) 32 solid field trees r:2 — deterministic, same rejection zones as index.html (mid-lane
//    diagonal ±18, the three lane arms ±16; + the west arm the original's constraint set missed)
let trees = 0, guard = 0;
while (trees < 32 && guard++ < 4000) {
  const x = (rng() * 180 - 90) * MAPK, z = (rng() * 180 - 90) * MAPK;
  const M = MAPK;
  if (Math.abs(x - z) < 18 * M || Math.abs(z + 72 * M) < 16 * M || Math.abs(x - 72 * M) < 16 * M
    || Math.abs(z - 72 * M) < 16 * M || Math.abs(x + 72 * M) < 16 * M) continue;
  if (cells[cellOf(z) * G + cellOf(x)] === T.ROCK) continue;   // not inside a ridge
  const fx = +x.toFixed(1), fz = +z.toFixed(1);
  art.obstacles.push({ kind: "TREE", x: fx, z: fz, r: 2, anchorId: `sp_tree${trees}` });
  blockCells(fx, fz, 2, T.FOREST);
  trees++;
}

art.terrain.cells = Buffer.from(cells).toString("base64");
art.terrain.walk = Buffer.from(walk).toString("base64");

// report
let hist = {}; for (const c of cells) hist[c] = (hist[c] || 0) + 1;
let blocked = 0; for (const v of walk) if (!v) blocked++;
console.log(`ridge rocks: ${ridgeRocks} · field trees: ${trees} · obstacles total: ${art.obstacles.length}`);
console.log(`terrain: OPEN ${hist[0] || 0} ROAD ${hist[5] || 0} FOREST ${hist[1] || 0} ROCK ${hist[2] || 0}`);
console.log(`walk blocked: ${blocked} (${(100 * blocked / walk.length).toFixed(1)}%)`);
if (!DRY) { writeFileSync(FILE, JSON.stringify(art)); console.log(`wrote ${FILE}`); }
