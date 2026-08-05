#!/usr/bin/env node
// make_veil_floor.mjs — 🎭 THE VEIL MASQUERADE FLOOR (owner 2026-08-05: "make a NEW texture based
// on the Hunt game masquerade mini-game floors — purple themed veil", not a re-tint of grass).
//
// A seamless 512×512 floor authored from scratch, pixel math only (no canvas, no deps):
//   layer 1  BALLROOM HARLEQUIN — 45°-rotated diamond lattice in two velvet purples with thin
//            antique-gold seams (the masquerade dance floor).
//   layer 2  THE VEIL — three overlapping translucent silk bands (whole sine cycles ⇒ perfectly
//            tileable) sweeping across the floor in pale orchid, like gauze drifting over it.
//   layer 3  SPARKLE DUST — seeded gold/white flecks (candle-light glitter).
// Deterministic (seeded mulberry32): same bytes forever. Output: map-service/floors/
// veil_masquerade.png — served at /floors/veil_masquerade.png, referenced by THEME_BIOME.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../floors/veil_masquerade.png");
const S = 512;

const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rng = mulberry32(0x9a5c4e);

// palette — the Hunt masquerade mood: deep violet velvet, plum, antique gold, pale orchid silk
const VELVET = [58, 33, 84], PLUM = [84, 48, 122], GOLD = [201, 162, 39], ORCHID = [186, 148, 220];

const px = new Uint8Array(S * S * 3);
const wrap = (n) => ((n % S) + S) % S;

// ---- layer 1: harlequin diamonds + gold seams (periodic in u=x+y, v=x−y; 128 | 1024 ⇒ seamless)
const CELL2 = 128, SEAM = 2.2;
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const u = x + y, v = x - y + S;                       // +S keeps v positive; period preserved
  const cu = Math.floor(u / CELL2), cv = Math.floor(v / CELL2);
  const base = (cu + cv) % 2 === 0 ? VELVET : PLUM;
  // soft velvet shading inside each diamond (distance to diamond center)
  const du = (u % CELL2) - CELL2 / 2, dv = (v % CELL2) - CELL2 / 2;
  const shade = 1 - 0.16 * Math.min(1, (du * du + dv * dv) / (CELL2 * CELL2 * 0.18));
  let r = base[0] * shade, g = base[1] * shade, b = base[2] * shade;
  const su = Math.abs((u % CELL2) - 0) < SEAM || Math.abs((u % CELL2) - CELL2) < SEAM;
  const sv = Math.abs((v % CELL2) - 0) < SEAM || Math.abs((v % CELL2) - CELL2) < SEAM;
  if (su || sv) { r = r * 0.35 + GOLD[0] * 0.65; g = g * 0.35 + GOLD[1] * 0.65; b = b * 0.35 + GOLD[2] * 0.65; }
  const i = (y * S + x) * 3;
  px[i] = r; px[i + 1] = g; px[i + 2] = b;
}

// ---- layer 2: the veils — whole-cycle sine silk bands, alpha-blended (perfectly tileable)
const VEILS = [
  { nx: 1, ny: 2, phase: 0.9, width: 0.34, alpha: 0.24 },
  { nx: 2, ny: -1, phase: 2.2, width: 0.26, alpha: 0.18 },
  { nx: -1, ny: 1, phase: 4.4, width: 0.42, alpha: 0.13 },
];
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  let a = 0;
  for (const vl of VEILS) {
    const t = ((vl.nx * x + vl.ny * y) / S) * Math.PI * 2 + vl.phase;
    const band = Math.pow(Math.max(0, Math.sin(t)), 3);   // soft-edged silk band
    a += vl.alpha * band * (band > vl.width ? 1 : band / vl.width);
  }
  if (a <= 0.003) continue;
  a = Math.min(0.42, a);
  const i = (y * S + x) * 3;
  px[i] = px[i] * (1 - a) + ORCHID[0] * a;
  px[i + 1] = px[i + 1] * (1 - a) + ORCHID[1] * a;
  px[i + 2] = px[i + 2] * (1 - a) + ORCHID[2] * a;
}

// ---- layer 3: sparkle dust (wrapped soft dots — candle-light glitter on the floor)
for (let k = 0; k < 340; k++) {
  const cx2 = rng() * S, cy2 = rng() * S, rad = 0.7 + rng() * 1.5, gold = rng() < 0.55;
  const c = gold ? [232, 198, 120] : [240, 232, 250], str = 0.35 + rng() * 0.4;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const d2 = dx * dx + dy * dy;
    if (d2 > rad * rad * 4) continue;
    const a = str * Math.exp(-d2 / (rad * rad));
    const i = (wrap(Math.round(cy2) + dy) * S + wrap(Math.round(cx2) + dx)) * 3;
    px[i] = px[i] * (1 - a) + c[0] * a;
    px[i + 1] = px[i + 1] * (1 - a) + c[1] * a;
    px[i + 2] = px[i + 2] * (1 - a) + c[2] * a;
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
for (let y = 0; y < S; y++) { raw[y * (S * 3 + 1)] = 0; Buffer.from(px.subarray(y * S * 3, (y + 1) * S * 3)).copy(raw, y * (S * 3 + 1) + 1); }
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(OUT, png);
console.log(`wrote floors/veil_masquerade.png 🎭 (${png.length} bytes, 512×512 seamless)`);
