// png-decode.js — minimal PNG reader for the world compositor (png.js only ENCODES). Handles the
// case Chromium screenshots + our encoder emit: 8-bit, non-interlaced, colorType 6 (RGBA) / 2 (RGB)
// / 0 (gray). Returns { w, h, rgba: Uint8Array } (always 4 channels). Node zlib does the inflate.
import zlib from "node:zlib";

export function decodePNG(buf) {
  let p = 8;                                              // skip the 8-byte signature
  let w = 0, h = 0, colorType = 6;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;                                        // length + type + data + CRC
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 4;
  const stride = w * ch;
  const out = new Uint8Array(w * h * 4);
  let pos = 0;
  const prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v = raw[pos + x];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; v = (v + pr) & 255; }
      cur[x] = v;
    }
    pos += stride;
    for (let x = 0; x < w; x++) {
      const si = x * ch, di = (y * w + x) * 4;
      out[di] = cur[si];
      out[di + 1] = ch >= 3 ? cur[si + 1] : cur[si];
      out[di + 2] = ch >= 3 ? cur[si + 2] : cur[si];
      out[di + 3] = ch === 4 ? cur[si + 3] : 255;
    }
    prev.set(cur);
  }
  return { w, h, rgba: out };
}
