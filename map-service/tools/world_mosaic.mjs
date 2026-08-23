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
import { worldParcel } from "../maps/worldfield.js";
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

const l3Path = path.join(ROOT, `data/hexagon-city-source/l3/${zone}.json`);
if (!existsSync(l3Path)) { console.error(`no L3 data for zone ${zone}`); process.exit(1); }
let singles = JSON.parse(readFileSync(l3Path, "utf8")).singles;
if (CENTER) {
  const c = singles.find((s) => s.parcelId === CENTER);
  if (!c) { console.error(`center ${CENTER} not in ${zone}`); process.exit(1); }
  const [cx, cy] = c.center;
  singles = singles.filter((s) => Math.hypot(s.center[0] - cx, s.center[1] - cy) <= RADIUS);
}
if (!singles.length) { console.error("no parcels selected"); process.exit(1); }
console.log(`${zone}: ${singles.length} parcels in the patch`);

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

const t0 = Date.now();
let ok = 0, failed = 0;
const rects = [];
for (let n = 0; n < singles.length; n++) {
  const s = singles[n];
  let art;
  try { art = generate(worldParcel(s, { investLevel: INVEST })); }
  catch { failed++; continue; }
  const G = art.terrain.w;
  const cells = new Uint8Array(Buffer.from(art.terrain.cells, "base64"));
  const pal = PALETTE_RGB[art.meta?.params?.palette] || PALETTE_RGB.verdant;
  // parcel bbox → canvas rect (flip Y so higher zone-y = north = up, matching thumb.js)
  const [bx0, by0, bx1, by1] = s.bbox;
  const rx0 = Math.floor((bx0 - minX) * PPU), rx1 = Math.ceil((bx1 - minX) * PPU);
  const ry0 = Math.floor((maxY - by1) * PPU), ry1 = Math.ceil((maxY - by0) * PPU);
  const rw = Math.max(1, rx1 - rx0), rh = Math.max(1, ry1 - ry0);
  rects.push({ id: s.parcelId, x: rx0, y: ry0, w: rw, h: rh });
  for (let yy = ry0; yy < ry1; yy++) {
    for (let xx = rx0; xx < rx1; xx++) {
      const fx = (xx - rx0) / rw, fy = (yy - ry0) / rh;
      const cx = Math.min(G - 1, Math.floor(fx * G));
      const cz = Math.min(G - 1, Math.floor((1 - fy) * G));   // flip: top row = north
      const cell = cells[cz * G + cx];
      if (cell === T.OOB) continue;                           // outside the polygon → keep background
      const c = pal[Math.min(cell, 5)];
      put(xx, yy, c[0], c[1], c[2]);
    }
  }
  ok++;
  if ((n + 1) % 50 === 0) console.log(`  …${n + 1}/${singles.length}`);
}
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
