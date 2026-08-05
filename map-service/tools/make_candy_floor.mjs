#!/usr/bin/env node
// make_candy_floor.mjs — 🍬 CANDY DREAM FLOOR (owner 2026-08-05: "now we need ur best version of
// a candy land — can be rainbow land or purple dream"). The veil_masquerade floor read as a cyber
// grid at the module's 23×25 tiling (hard diamond seams → visible lattice); this one is designed
// FOR that tiling: zero straight lines, low-contrast organic features only.
//
// A seamless 512×512 floor, pixel math only (no canvas, no deps):
//   layer 0  FROSTING BASE — vanilla cream marbled toward strawberry milk (tileable sine field).
//   layer 1  TAFFY SWIRLS — broad soft pastel-rainbow bands (rose/peach/lemon/mint/sky/lilac)
//            through a PERIODIC domain warp ⇒ dreamlike marbling that still tiles perfectly.
//   layer 2  RAINBOW SPRINKLES — small rotated capsule dashes in saturated candy colors, wrapped.
//   layer 3  SUGAR SPARKLE — tiny white glints.
// Deterministic (seeded mulberry32): same bytes forever. Output: map-service/floors/
// candy_dream.png — served at /floors/candy_dream.png, referenced by THEME_BIOME.candyland.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../floors/candy_dream.png");
const S = 512;
const TAU = Math.PI * 2;

const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rng = mulberry32(0xca4d17);

// palette — bright pastel candy: frosting creams + a soft rainbow of taffy
const CREAM = [251, 243, 236], STRAWB = [247, 220, 232];
const TAFFY = [
  [244, 184, 204],   // rose
  [249, 211, 174],   // peach
  [248, 238, 180],   // lemon
  [191, 232, 204],   // mint
  [184, 220, 242],   // sky
  [216, 196, 236],   // lilac
];
const SPRINKLE = [
  [232, 78, 104], [240, 148, 66], [242, 210, 60], [92, 190, 120],
  [86, 148, 224], [158, 100, 214], [250, 250, 250],
];

const px = new Float64Array(S * S * 3);
const wrap = (n) => ((n % S) + S) % S;
// tileable scalar field: sum of whole-cycle sines (every term periodic in S)
const field = (x, y, terms) => {
  let v = 0;
  for (const [ax, ay, ph, amp] of terms) v += amp * Math.sin(((ax * x + ay * y) / S) * TAU + ph);
  return v;
};

// ---- layer 0: frosting base — cream marbled toward strawberry milk
const BASE_TERMS = [[1, 2, 0.7, 0.5], [3, -1, 2.1, 0.3], [-2, 3, 4.0, 0.2]];
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const m = 0.5 + 0.5 * field(x, y, BASE_TERMS);          // 0..1 marble
  const t = Math.pow(Math.max(0, Math.min(1, m)), 1.6) * 0.55;
  const i = (y * S + x) * 3;
  px[i] = CREAM[0] * (1 - t) + STRAWB[0] * t;
  px[i + 1] = CREAM[1] * (1 - t) + STRAWB[1] * t;
  px[i + 2] = CREAM[2] * (1 - t) + STRAWB[2] * t;
}

// ---- layer 1: taffy swirls — six pastel bands through a periodic domain warp.
// warp offsets are whole-cycle sine fields ⇒ (x+wx, y+wy) stays periodic ⇒ seamless.
const WARP_X = [[2, 1, 1.3, 22], [1, -2, 3.7, 14]];
const WARP_Y = [[-1, 2, 0.4, 22], [2, 2, 5.1, 14]];
const BANDS = TAFFY.map((c, k) => ({
  c,
  nx: [1, 2, -1, 1, -2, 2][k], ny: [2, -1, 2, 1, 1, 2][k],
  ph: 0.9 + k * 1.05, alpha: 0.46,
}));
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const wx = x + field(x, y, WARP_X), wy = y + field(x, y, WARP_Y);
  const i = (y * S + x) * 3;
  for (const b of BANDS) {
    const t = ((b.nx * wx + b.ny * wy) / S) * TAU + b.ph;
    const band = Math.pow(0.5 + 0.5 * Math.sin(t), 4);    // soft, broad, low-contrast
    const a = b.alpha * band;
    if (a <= 0.004) continue;
    px[i] = px[i] * (1 - a) + b.c[0] * a;
    px[i + 1] = px[i + 1] * (1 - a) + b.c[1] * a;
    px[i + 2] = px[i + 2] * (1 - a) + b.c[2] * a;
  }
}

// ---- layer 2: rainbow sprinkles — rotated capsule dashes, soft-edged, wrapped
for (let k = 0; k < 260; k++) {
  const cx = rng() * S, cy = rng() * S, ang = rng() * Math.PI;
  const len = 2.6 + rng() * 2.2, rad = 0.9 + rng() * 0.35;
  const c = SPRINKLE[Math.floor(rng() * SPRINKLE.length)];
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const R = Math.ceil(len + rad + 1);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    // distance to the capsule segment
    const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
    const uc = Math.max(-len, Math.min(len, u));
    const d = Math.hypot(u - uc, v);
    if (d > rad + 0.8) continue;
    const a = Math.max(0, Math.min(1, (rad + 0.6 - d) / 1.1)) * 0.88;
    if (a <= 0.02) continue;
    const i = (wrap(Math.round(cy) + dy) * S + wrap(Math.round(cx) + dx)) * 3;
    px[i] = px[i] * (1 - a) + c[0] * a;
    px[i + 1] = px[i + 1] * (1 - a) + c[1] * a;
    px[i + 2] = px[i + 2] * (1 - a) + c[2] * a;
  }
}

// ---- layer 3: sugar sparkle — tiny white glints
for (let k = 0; k < 220; k++) {
  const cx = rng() * S, cy = rng() * S, rad = 0.5 + rng() * 0.9, str = 0.3 + rng() * 0.35;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const d2 = dx * dx + dy * dy;
    if (d2 > rad * rad * 4) continue;
    const a = str * Math.exp(-d2 / (rad * rad));
    const i = (wrap(Math.round(cy) + dy) * S + wrap(Math.round(cx) + dx)) * 3;
    px[i] = px[i] * (1 - a) + 255 * a;
    px[i + 1] = px[i + 1] * (1 - a) + 255 * a;
    px[i + 2] = px[i + 2] * (1 - a) + 252 * a;
  }
}

// ---- minimal PNG encoder (RGB8, zlib) ----
const crcTable = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0); out.write(type, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 8 + data.length);
  return out;
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit RGB
const raw = Buffer.alloc(S * (S * 3 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 3 + 1)] = 0;
  for (let x = 0; x < S * 3; x++) raw[y * (S * 3 + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(px[y * S * 3 + x])));
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(OUT, png);
console.log(`wrote floors/candy_dream.png 🍬 (${png.length} bytes, 512×512 seamless)`);
