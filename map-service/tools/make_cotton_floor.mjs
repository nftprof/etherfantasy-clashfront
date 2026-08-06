#!/usr/bin/env node
// make_cotton_floor.mjs — ☁️🍬 COTTON CANDY FLOOR (owner 2026-08-06: full candy-land build,
// "cotton candy as floors?"). The reference-art ground: soft cream-pink cotton/frosting with
// pastel drifts and tiny candy flowers — brighter and pinker than candy_dream, zero hard lines.
//
// Layers (512×512 seamless, pixel math only):
//   0  CREAM BASE — warm vanilla-rose, gently marbled (tileable sine field).
//   1  COTTON WISPS — fibrous curved strands via periodic domain warp (the spun-sugar look).
//   2  PASTEL DRIFTS — broad soft patches of rose / peach / mint / lavender.
//   3  CANDY FLOWERS — tiny 5-petal white/pink daisies scattered like the reference meadow.
//   4  SUGAR SPARKLE — faint white glints.
// Deterministic (mulberry32). Output: floors/cotton_candy.png (/floors/cotton_candy.png).
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../floors/cotton_candy.png");
const S = 512, TAU = Math.PI * 2;
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rng = mulberry32(0xc07704);

const CREAM = [247, 222, 222], ROSE = [242, 184, 206];
const DRIFTS = [
  [247, 198, 216],   // rose
  [250, 222, 200],   // peach
  [210, 238, 220],   // mint
  [224, 210, 240],   // lavender
];
const px = new Float64Array(S * S * 3);
const wrap = (n) => ((n % S) + S) % S;
const field = (x, y, terms) => { let v = 0; for (const [ax, ay, ph, amp] of terms) v += amp * Math.sin(((ax * x + ay * y) / S) * TAU + ph); return v; };

// 0 — cream base
const BASE = [[1, 2, 0.4, 0.5], [3, -1, 2.0, 0.3], [-2, 3, 4.2, 0.2]];
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const m = Math.pow(Math.max(0, Math.min(1, 0.5 + 0.5 * field(x, y, BASE))), 1.5) * 0.5;
  const i = (y * S + x) * 3;
  px[i] = CREAM[0] * (1 - m) + ROSE[0] * m;
  px[i + 1] = CREAM[1] * (1 - m) + ROSE[1] * m;
  px[i + 2] = CREAM[2] * (1 - m) + ROSE[2] * m;
}
// 1 — cotton wisps: thin bright strands, domain-warped (periodic ⇒ seamless)
const WX = [[2, 1, 1.1, 18], [1, -2, 3.3, 11]], WY = [[-1, 2, 0.6, 18], [2, 2, 5.0, 11]];
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const wx = x + field(x, y, WX), wy = y + field(x, y, WY);
  let a = 0;
  for (let k = 0; k < 3; k++) {
    const t = ((([3, 4, 5][k]) * wx + ([5, -3, 2][k]) * wy) / S) * TAU + k * 2.1;
    const band = Math.pow(0.5 + 0.5 * Math.sin(t), 14);   // narrow soft strand
    a += 0.15 * band;
  }
  if (a <= 0.005) continue;
  a = Math.min(0.3, a);
  const i = (y * S + x) * 3;
  px[i] = px[i] * (1 - a) + 255 * a; px[i + 1] = px[i + 1] * (1 - a) + 252 * a; px[i + 2] = px[i + 2] * (1 - a) + 252 * a;
}
// 2 — pastel drifts
DRIFTS.forEach((c, k) => {
  const nx = [1, 2, -1, 2][k], ny = [2, -1, 2, 1][k], ph = 0.8 + k * 1.35;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const t = ((nx * x + ny * y) / S) * TAU + ph + 0.9 * Math.sin(((x - y) / S) * TAU + k);
    const band = Math.pow(0.5 + 0.5 * Math.sin(t), 4) * 0.55;
    if (band <= 0.004) continue;
    const i = (y * S + x) * 3;
    px[i] = px[i] * (1 - band) + c[0] * band;
    px[i + 1] = px[i + 1] * (1 - band) + c[1] * band;
    px[i + 2] = px[i + 2] * (1 - band) + c[2] * band;
  }
});
// 3 — candy flowers: 5 petal dots around a gold heart
for (let f = 0; f < 90; f++) {
  const cx = rng() * S, cy = rng() * S, R = 2.2 + rng() * 1.4;
  const pink = rng() < 0.45;
  const pc = pink ? [250, 170, 200] : [255, 252, 250];
  for (let p = 0; p < 5; p++) {
    const ang = (p / 5) * TAU + rng() * 0.2;
    const pxc = cx + Math.cos(ang) * R, pyc = cy + Math.sin(ang) * R, pr = R * 0.62;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d2 = dx * dx + dy * dy; if (d2 > pr * pr) continue;
      const a = 0.85 * Math.max(0, 1 - d2 / (pr * pr));
      const i = (wrap(Math.round(pyc) + dy) * S + wrap(Math.round(pxc) + dx)) * 3;
      px[i] = px[i] * (1 - a) + pc[0] * a; px[i + 1] = px[i + 1] * (1 - a) + pc[1] * a; px[i + 2] = px[i + 2] * (1 - a) + pc[2] * a;
    }
  }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {   // gold heart
    const d2 = dx * dx + dy * dy; if (d2 > 1.7) continue;
    const a = 0.9 * Math.max(0, 1 - d2 / 1.7);
    const i = (wrap(Math.round(cy) + dy) * S + wrap(Math.round(cx) + dx)) * 3;
    px[i] = px[i] * (1 - a) + 246 * a; px[i + 1] = px[i + 1] * (1 - a) + 206 * a; px[i + 2] = px[i + 2] * (1 - a) + 96 * a;
  }
}
// 4 — sugar sparkle
for (let k = 0; k < 180; k++) {
  const cx = rng() * S, cy = rng() * S, rad = 0.5 + rng() * 0.8, str = 0.25 + rng() * 0.3;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const d2 = dx * dx + dy * dy; if (d2 > rad * rad * 4) continue;
    const a = str * Math.exp(-d2 / (rad * rad));
    const i = (wrap(Math.round(cy) + dy) * S + wrap(Math.round(cx) + dx)) * 3;
    px[i] = px[i] * (1 - a) + 255 * a; px[i + 1] = px[i + 1] * (1 - a) + 255 * a; px[i + 2] = px[i + 2] * (1 - a) + 250 * a;
  }
}
// PNG encode
const crcTable = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const out = Buffer.alloc(8 + data.length + 4); out.writeUInt32BE(data.length, 0); out.write(type, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 8 + data.length); return out; };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 2;
const raw = Buffer.alloc(S * (S * 3 + 1));
for (let y = 0; y < S; y++) { raw[y * (S * 3 + 1)] = 0; for (let x = 0; x < S * 3; x++) raw[y * (S * 3 + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(px[y * S * 3 + x]))); }
writeFileSync(OUT, Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
console.log("wrote floors/cotton_candy.png ☁️🍬");
