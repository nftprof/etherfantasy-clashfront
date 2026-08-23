// world_mosaic.mjs — the AERIAL THUMBNAIL MOSAIC (owner 2026-08-23: "each map thumb all composed
// should look like the entire continent, with continuous roads based on the overall map — an aerial
// view, not a square-linkage grid").
//
// Composites every parcel's TOP-DOWN battle-map thumbnail at its TRUE overworld position into ONE
// image. Because each parcel's ROADS are seeded from the shared overworld road network, tiling the
// thumbnails at their real bboxes makes roads run CONTINUOUS across parcel seams for free, and the
// OOB (out-of-polygon) cells stay transparent so the composite takes the continent's real silhouette.
//
// Only the finished mosaic PNG + a click-through manifest are written (NOT the ~76KB/parcel
// artifacts) — so a 363-parcel patch costs ~1 MB in git, not ~27 MB. Deterministic (seeded rng only).
//
// Usage: node map-service/tools/world_mosaic.mjs HUB --center 50708570006 --radius 10 [--ppu 80]
//        [--invest 1] [--out data/cf-maps/world-mosaic]
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { worldParcel, svgPathToPolygon } from "../maps/worldfield.js";
import { generate } from "../maps/generate.js";
import { encodePNG } from "../maps/png.js";
import { T } from "../maps/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const args = process.argv.slice(2);
const zone = (args[0] && !args[0].startsWith("--")) ? args[0] : "HUB";
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const CENTER = opt("center", null);
const RADIUS = Number(opt("radius", 10));
const INVEST = Number(opt("invest", 1));
let PPU = Number(opt("ppu", 80));                 // pixels per zone-unit (auto-capped below)
const MAXDIM = Number(opt("maxdim", 1800));       // hard cap on the long side
const OUT = path.resolve(ROOT, opt("out", "data/cf-maps/world-mosaic"));

// per-palette cell colors [OPEN, FOREST, ROCK, WATER, CLIFF, ROAD] — mirrors thumb.js so a parcel
// reads identically here and in its own thumbnail.
const PALETTE_RGB = {
  verdant:  [[86,118,72],[38,72,40],[110,106,98],[52,86,120],[90,82,74],[150,132,96]],
  autumn:   [[122,102,58],[122,74,34],[110,100,92],[60,84,110],[96,84,70],[152,128,92]],
  volcanic: [[60,52,50],[70,44,36],[88,80,78],[190,74,30],[50,44,44],[110,96,84]],
  tundra:   [[168,178,182],[96,116,110],[140,146,150],[110,140,160],[120,126,132],[180,172,158]],
  desert:   [[188,162,110],[120,124,62],[150,128,96],[70,120,140],[140,116,84],[204,182,136]],
  swamp:    [[74,88,58],[44,60,38],[96,98,86],[46,78,92],[80,84,66],[128,116,84]],
  ashen:    [[96,94,92],[64,66,62],[118,114,110],[70,80,92],[84,80,78],[140,132,120]],
  sakura:   [[120,140,96],[172,120,140],[130,124,128],[96,130,160],[110,102,106],[168,150,130]],
};
const BG = [14, 18, 26];                          // dark ground behind the continent

// ⚠ RENDER ALL *LEAF* PARCELS — the recurring gap bug (owner 2026-08-23, "not the first time"):
// the world is a HIERARCHY (L2 estate/parcel → optionally subdivided into L3 singles). A leaf is
// an L3 single OR an L2 parcel that was NEVER subdivided (`l3Enabled === false`). Rendering L3
// singles ONLY omits the un-subdivided L2/estate parcels, which then read as wide black CHANNELS —
// the "gaps" are missing L2 leaves, NOT real voids and NOT wrong shapes. Leaves TESSELLATE.
const l3Path = path.join(ROOT, `data/hexagon-city-source/l3/${zone}.json`);
if (!existsSync(l3Path)) { console.error(`no L3 data for zone ${zone}`); process.exit(1); }
let leaves = JSON.parse(readFileSync(l3Path, "utf8")).singles.slice();       // L3 singles = always leaves
const l2Path = path.join(ROOT, "data/hexagon-city-source/parcels-l2.json");
if (existsSync(l2Path)) {
  const l2raw = JSON.parse(readFileSync(l2Path, "utf8"));
  const l2 = Array.isArray(l2raw) ? l2raw : (l2raw.parcels || l2raw.estates || Object.values(l2raw)[0] || []);
  const l2leaves = l2.filter((s) => s.zone === zone && s.l3Enabled === false && s.svgPath); // un-subdivided L2
  leaves = leaves.concat(l2leaves);
  console.log(`${zone}: ${leaves.length} leaf parcels (L3 singles + ${l2leaves.length} un-subdivided L2)`);
}
let singles = leaves;
if (CENTER) {
  const c = leaves.find((s) => s.parcelId === CENTER) || JSON.parse(readFileSync(l3Path, "utf8")).singles.find((s) => s.parcelId === CENTER);
  if (!c) { console.error(`center ${CENTER} not in ${zone}`); process.exit(1); }
  const [cx, cy] = c.center;
  // the view box = the extent of the L3 singles within the radius (the intended patch)…
  let vx0 = Infinity, vy0 = Infinity, vx1 = -Infinity, vy1 = -Infinity;
  for (const s of leaves) if (s.center && Math.hypot(s.center[0] - cx, s.center[1] - cy) <= RADIUS) {
    const [a, b, c2, d] = s.bbox; if (a < vx0) vx0 = a; if (b < vy0) vy0 = b; if (c2 > vx1) vx1 = c2; if (d > vy1) vy1 = d;
  }
  // …then include EVERY leaf whose BBOX INTERSECTS that view (a big L2 estate whose CENTER is
  // outside the radius still covers the view — the recurring gap bug was filtering it out by center).
  singles = leaves.filter((s) => { const [a, b, c2, d] = s.bbox; return c2 >= vx0 && a <= vx1 && d >= vy0 && b <= vy1; });
}
if (!singles.length) { console.error("no parcels selected"); process.exit(1); }
const nL2 = singles.filter((s) => s.sizeClass && s.sizeClass !== "SINGLE").length;
console.log(`${zone}: ${singles.length} parcels in view (${nL2} larger/L2 leaves by bbox-overlap)`);

// world extent over the selected parcels' bboxes → canvas size
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const s of singles) { const [x0, y0, x1, y1] = s.bbox; if (x0 < minX) minX = x0; if (y0 < minY) minY = y0; if (x1 > maxX) maxX = x1; if (y1 > maxY) maxY = y1; }
const spanX = maxX - minX, spanY = maxY - minY;
PPU = Math.min(PPU, MAXDIM / Math.max(spanX, spanY));
const W = Math.max(1, Math.round(spanX * PPU)), H = Math.max(1, Math.round(spanY * PPU));
console.log(`canvas ${W}×${H} px  (${spanX.toFixed(1)}×${spanY.toFixed(1)} zone-units @ ${PPU.toFixed(1)} px/unit)`);

const px = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) { px[i * 4] = BG[0]; px[i * 4 + 1] = BG[1]; px[i * 4 + 2] = BG[2]; px[i * 4 + 3] = 255; }
const put = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; };
const BORDER = [24, 30, 42];                       // clear parcel outline (owner 2026-08-23 "show borders")
const line = (x0, y0, x1, y1, c) => {             // Bresenham stroke
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) { put(x0, y0, c[0], c[1], c[2]); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
};

// zone svg coords (y DOWN, matching the original hexagon-city SVG) → canvas px. No Y-flip: the source
// map is y-down, and we want the same orientation so parcels tile exactly as in the real continent.
const toCanvas = (zx, zy) => [(zx - minX) * PPU, (zy - minY) * PPU];

const t0 = Date.now();
let ok = 0, failed = 0, nopoly = 0;
const rects = [];
for (let n = 0; n < singles.length; n++) {
  const s = singles[n];
  const zpoly = s.svgPath ? svgPathToPolygon(s.svgPath) : null;   // REAL parcel polygon (zone coords)
  if (!zpoly || zpoly.length < 3) { nopoly++; continue; }
  let art;
  try { art = generate(worldParcel(s, { investLevel: INVEST })); }
  catch { failed++; continue; }
  const G = art.terrain.w;
  const cells = new Uint8Array(Buffer.from(art.terrain.cells, "base64"));
  const pal = PALETTE_RGB[art.meta?.params?.palette] || PALETTE_RGB.verdant;
  // polygon in canvas px + its bbox (for texture mapping)
  const cpoly = zpoly.map(([zx, zy]) => toCanvas(zx, zy));
  let px0 = Infinity, py0 = Infinity, px1 = -Infinity, py1 = -Infinity;
  for (const [x, y] of cpoly) { if (x < px0) px0 = x; if (y < py0) py0 = y; if (x > px1) px1 = x; if (y > py1) py1 = y; }
  const pw = Math.max(1, px1 - px0), ph = Math.max(1, py1 - py0);
  rects.push({ id: s.parcelId, x: Math.round(px0), y: Math.round(py0), w: Math.round(pw), h: Math.round(ph) });
  // dominant non-OOB terrain color → the fallback fill so a polygon never has holes at OOB samples
  const counts = [0, 0, 0, 0, 0, 0];
  for (let k = 0; k < cells.length; k++) { const c = cells[k]; if (c !== T.OOB) counts[Math.min(c, 5)]++; }
  let dom = 0; for (let c = 1; c < 6; c++) if (counts[c] > counts[dom]) dom = c;
  const domRGB = pal[dom];
  // SCANLINE-FILL the real polygon (seamless with neighbours — this is what CF does), texture each
  // pixel from the parcel's top-down thumbnail sampled over the polygon's bbox.
  const yA = Math.max(0, Math.floor(py0)), yB = Math.min(H - 1, Math.ceil(py1));
  for (let y = yA; y <= yB; y++) {
    const xs = [];
    for (let e = 0; e < cpoly.length; e++) {
      const a = cpoly[e], b = cpoly[(e + 1) % cpoly.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xL = Math.max(0, Math.ceil(xs[k])), xR = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = xL; x <= xR; x++) {
        const fx = (x - px0) / pw, fy = (y - py0) / ph;
        const cxi = Math.min(G - 1, Math.max(0, Math.floor(fx * G)));
        const czi = Math.min(G - 1, Math.max(0, Math.floor(fy * G)));
        const cell = cells[czi * G + cxi];
        const c = (cell === T.OOB) ? domRGB : pal[Math.min(cell, 5)];
        put(x, y, c[0], c[1], c[2]);
      }
    }
  }
  // clear border stroke around the parcel outline
  for (let e = 0; e < cpoly.length; e++) { const a = cpoly[e], b = cpoly[(e + 1) % cpoly.length]; line(a[0], a[1], b[0], b[1], BORDER); }
  ok++;
  if ((n + 1) % 50 === 0) console.log(`  …${n + 1}/${singles.length}`);
}
if (nopoly) console.log(`  (${nopoly} parcels had no usable svgPath)`);
console.log(`composited ${ok} parcels (${failed} failed the gate) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

mkdirSync(OUT, { recursive: true });
const stem = CENTER ? `${zone}-${CENTER}-r${RADIUS}` : zone;
const png = encodePNG(W, H, Buffer.from(px));
writeFileSync(path.join(OUT, `${stem}.png`), png);
writeFileSync(path.join(OUT, `${stem}.json`), JSON.stringify({
  zone, center: CENTER, radius: RADIUS, invest: INVEST,
  world: { minX, minY, maxX, maxY }, pxPerUnit: PPU, w: W, h: H,
  count: ok, failed, parcels: rects,
}));
console.log(`wrote ${path.relative(ROOT, OUT)}/${stem}.png (${(png.length / 1048576).toFixed(2)} MB) + ${stem}.json`);
