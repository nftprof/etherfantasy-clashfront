// D7 — top-down thumbnail renderer: battlefield artifact → PNG buffer (2 px per cell → 240²).
// The overworld textures parcels with these, and the command-mode viewer can underlay them.
// Pure JS, deterministic. Palette tints keep regional biomes visually distinct at a glance.
import { T, cellOf } from "./schema.js";
import { encodePNG } from "./png.js";

// per-palette cell colors: [OPEN, FOREST, ROCK, WATER, CLIFF, ROAD]
const PALETTE_RGB = {
  verdant:  [[86, 118, 72], [38, 72, 40],  [110, 106, 98], [52, 86, 120],  [90, 82, 74],   [150, 132, 96]],
  autumn:   [[122, 102, 58], [122, 74, 34], [110, 100, 92], [60, 84, 110], [96, 84, 70],   [152, 128, 92]],
  volcanic: [[60, 52, 50],  [70, 44, 36],  [88, 80, 78],   [190, 74, 30], [50, 44, 44],   [110, 96, 84]],   // water reads as lava
  tundra:   [[168, 178, 182], [96, 116, 110], [140, 146, 150], [110, 140, 160], [120, 126, 132], [180, 172, 158]],
  desert:   [[188, 162, 110], [120, 124, 62], [150, 128, 96], [70, 120, 140], [140, 116, 84], [204, 182, 136]],
  swamp:    [[74, 88, 58],  [44, 60, 38],  [96, 98, 86],   [46, 78, 92],  [80, 84, 66],   [128, 116, 84]],   // water = murky teal (was ground-green — deltas were invisible)
  ashen:    [[96, 94, 92],  [64, 66, 62],  [118, 114, 110], [70, 80, 92], [84, 80, 78],   [140, 132, 120]],
  sakura:   [[120, 140, 96], [172, 120, 140], [130, 124, 128], [96, 130, 160], [110, 102, 106], [168, 150, 130]],
};
const MARK = { GOLD_MINE: [230, 190, 60], WOOD_GROVE: [70, 150, 60], buildSpot: [225, 225, 235], atk: [220, 80, 70], def: [90, 140, 220], landmark: [242, 230, 190], lane: [210, 190, 140] };

export function renderThumb(artifact) {
  const G = artifact.terrain.w;
  const S = 2, W = G * S;                          // 2 px/cell
  const cells = new Uint8Array(Buffer.from(artifact.terrain.cells, "base64"));
  const pal = PALETTE_RGB[artifact.meta.params.palette] || PALETTE_RGB.verdant;
  const px = new Uint8Array(W * W * 4);

  const put = (x, y, [r, g, b]) => { if (x < 0 || y < 0 || x >= W || y >= W) return; const i = (y * W + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; };
  const dot = (wx, wz, rgb, r) => {                // world coords → pixels (z northward = image up)
    const cx = cellOf(G, wx) * S + 1, cy = (G - 1 - cellOf(G, wz)) * S + 1;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) put(cx + dx, cy + dy, rgb);
  };

  for (let cz = 0; cz < G; cz++) for (let cx = 0; cx < G; cx++) {
    if (cells[cz * G + cx] === T.OOB) continue;   // outside the parcel polygon → transparent (cut-out)
    const c = pal[Math.min(cells[cz * G + cx], 5)];
    const y = (G - 1 - cz) * S, x = cx * S;
    const shade = ((cx + cz) & 1) ? 0 : 4;         // subtle checker so open ground isn't flat
    const rgb = [c[0] + shade, c[1] + shade, c[2] + shade];
    put(x, y, rgb); put(x + 1, y, rgb); put(x, y + 1, rgb); put(x + 1, y + 1, rgb);
  }
  for (const lane of artifact.lanes)               // dotted lane paths
    for (let i = 0; i < lane.length - 1; i++) {
      const [ax, az] = lane[i], [bx, bz] = lane[i + 1];
      const steps = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 4));
      for (let s = 0; s <= steps; s += 2) dot(ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps, MARK.lane, 0);
    }
  for (const b of artifact.buildSpots) dot(b.x, b.z, MARK.buildSpot, 1);
  for (const r of artifact.resources) dot(r.x, r.z, MARK[r.kind] || MARK.GOLD_MINE, 2);
  for (const s of artifact.spawnZones) if (s.side !== "ANY") dot(s.x, s.z, s.side === "ATTACKER" ? MARK.atk : MARK.def, 3);
  for (const m of artifact.mobs || []) dot(m.x, m.z, [200, 60, 200], 2);          // wild camps (magenta)
  // structures by kind: towers white (as before); castle anchors get distinct marks so a castle
  // parcel's wall ring / gates / keep read on the thumbnail (and on the aerial mosaic)
  const SKIND = { TOWER: [[235, 235, 245], 3], WALL: [[120, 116, 128], 1], GATE: [[212, 168, 60], 2], CORE: [[240, 210, 90], 3] };
  for (const s of artifact.structures || []) { const k = SKIND[s.kind] || SKIND.TOWER; dot(s.x, s.z, k[0], k[1]); }
  const lm = artifact.obstacles.find((o) => o.kind !== "TREE" && o.kind !== "ROCK");
  if (lm) dot(lm.x, lm.z, MARK.landmark, 4);

  return encodePNG(W, W, px);
}
