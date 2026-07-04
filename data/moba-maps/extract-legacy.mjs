// Extract the legacy EF MOBA 3-lane arena into a Battlefield JSON
// (docs/briefs/BATTLEFIELD-SCHEMA.md v1). Run: `node data/moba-maps/extract-legacy.mjs`
//
// SOURCE OF TRUTH: blockchainsuperheroes/etherfantasy-browser-moba-game @ 15d610c, index.html.
// Every constant below is copied VERBATIM from index.html (line refs in comments) — this is the
// exact geometry the in-game minimap draws (drawMM, index.html:5140-5162). Coordinates are the
// authored values scaled by MAPK, matching CF's convention (origin center, x=east, z=north,
// 1 unit = 1 metre). Deterministic: no Date.now / Math.random — the cosmetic tree/grass scatter
// (index.html:1468-1520, which DOES use Math.random) is intentionally omitted; only stable
// structural geometry is emitted.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const MAPK = 1.4;                          // index.html:1352 — master scale knob
const K = (v) => Math.round(v * MAPK * 100) / 100;   // scale + tidy to cm
const P = ([x, z]) => [K(x), K(z)];

// ---- raw authored constants (pre-MAPK) -------------------------------------
const HILLS = [ { x:-38, z:38, r:17, h:4 }, { x:38, z:-38, r:17, h:4 } ];   // :1353
const LANES = {                                                            // :1452-1456
  mid: [[-72,-72],[0,0],[72,72]],
  top: [[-72,-60],[-72,72],[60,72]],
  bot: [[-60,-72],[72,-72],[72,60]],
};
const WALLS = [                                                            // :1480-1487
  [[-52,-6],[-26,20]], [[-10,36],[16,62]],       // upper-left jungle ridge (gap in middle)
  [[-6,-52],[20,-26]], [[36,-10],[62,16]],       // lower-right jungle ridge (gap in middle)
  [[-86,-40],[-86,56]], [[86,-56],[86,40]],      // west / east border ridges
  [[-40,-86],[56,-86]], [[-56,86],[40,86]],      // south / north border ridges
  [[-100,0],[-84,0]], [[84,0],[100,0]],          // corridor seals
  [[0,-100],[0,-84]], [[0,84],[0,100]],
];
// cores :4854 ; towers :4855-4857 ; fountains :3204 ; build pads :4983 ; camps :4980 ; bosses :4987
const CORES   = [ { side:"ATTACKER", team:"B", x:-82, z:-82 }, { side:"DEFENDER", team:"R", x:82, z:82 } ];
const TOWERS  = [
  ["ATTACKER",-40,-40],["ATTACKER",-20,-20],["ATTACKER",-72,-18],["ATTACKER",-72,32],["ATTACKER",-2,-72],["ATTACKER",-44,-72],
  ["DEFENDER", 40, 40],["DEFENDER", 20, 20],["DEFENDER", 72, 18],["DEFENDER", 72,-32],["DEFENDER", 2, 72],["DEFENDER", 44, 72],
];
const FOUNTAINS = [ { side:"ATTACKER", edge:"SW", x:-94, z:-94 }, { side:"DEFENDER", edge:"NE", x:94, z:94 } ];
const BUILD_PADS = [[-60,-38],[-38,-60],[-58,-8],[-8,-58],[-50,-50]];       // blue side only
const CAMPS = [ { x:-74, z:10 }, { x:10, z:-74 } ];                          // WC(...) :4980
const BOSSES = [ { x:-38, z:38, kind:"weapon" }, { x:38, z:-38, kind:"armor" } ]; // BZ(...) :4987
// resource nodes N(type,x,z,amount) :4972-4976 (+ per-camp nodes in spawnWildCamp :3074)
const NODES = [
  ["mineral",-70,-86,900],["tree",-86,-70,900],["mineral",-90,-88,700],["tree",-78,-92,800],
  ["tree",-40,-18,800],["tree",-18,-40,800],["mineral",-32,-32,700],
  ["tree",42,18,800],["tree",18,42,800],["mineral",32,32,700],
  ["tree",-52,42,750],["tree",52,-52,750],["mineral",2,28,650],["mineral",-2,-28,650],
];

// ---- stats (for reference; game-time overrides hp per battle context) ------
const STAT = {
  CORE:  { hp:2400, dmg:0,  range:0,  note:"innate cannon defDmg35 defRange20 (:3066)" },
  TOWER: { hp:1400, dmg:85, range:21 },   // :3064
  WILD_GUARD: { hp:340, dmg:22, range:2.4 }, // :3077
  BOSS:  { hp:2400, dmg:60, range:3.5 },  // :3104  (+2 adds hp420 :3110)
};

// ---- helpers ---------------------------------------------------------------
function heightAt(x, z) {   // index.html:1355-1358 (operates in scaled world units)
  let y = 0;
  for (const H of HILLS) {
    const hx = K(H.x), hz = K(H.z), hr = K(H.r);
    const d = Math.hypot(x - hx, z - hz);
    if (d < hr) y += H.h * 0.5 * (1 + Math.cos(Math.PI * d / hr));
  }
  return Math.round(y * 100) / 100;
}
function wallFootprint(seg, w = 4.5) {   // segment → thin CCW quad, half-width w metres
  const [a, b] = seg.map(P);
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
  const nx = -dz / L * w, nz = dx / L * w;
  return [[a[0]+nx, a[1]+nz], [b[0]+nx, b[1]+nz], [b[0]-nx, b[1]-nz], [a[0]-nx, a[1]-nz]]
    .map(([x, z]) => [Math.round(x*100)/100, Math.round(z*100)/100]);
}
const richness = (amt) => amt >= 1000 ? 3 : amt >= 800 ? 2 : 1;

// ---- bounds: the engine's HARD clamp square ±115*MAPK (clampMap, index.html:2919-2920).
// This is the true movement boundary that contains ALL units/economy. clampMap ALSO soft-clamps
// EVERY unit (not just heroes) to a ±90*MAPK box except the two diagonal fountain pockets
// (index.html:2927-2931) so spawn/recall pads behind each base stay reachable — the tighter
// functional play area, noted in meta, NOT the rendered arena extent. CCW winding. ----
const HARD = K(115);      // 161 — hard clamp (all units)
const SOFT = K(90);       // 126 — soft clamp box (all units; index.html:2927 const R=90*MAPK)
const bounds = [ [HARD,-HARD], [HARD,HARD], [-HARD,HARD], [-HARD,-HARD] ];

// ---- heightField (coarse hillshade; two low h=4 hills = the boss lairs) -----
const HF_N = 21, HF_SPAN = 2 * HARD, HF_CELL = Math.round((HF_SPAN / (HF_N - 1)) * 100) / 100;
const hf = [];
for (let r = 0; r < HF_N; r++) for (let c = 0; c < HF_N; c++) {
  hf.push(heightAt(-HARD + c * HF_CELL, -HARD + r * HF_CELL));   // row-major, x=east cols, z=north rows
}

// ---- assemble the Battlefield object ---------------------------------------
const bf = {
  v: 1,
  meta: {
    parcelId: "moba-legacy-3lane",
    seed: "ef-moba-15d610c",
    designVersion: 1,
    biome: "TEMPERATE_MEADOW",   // MOBA default biome 'meadow' (index.html:1372); match picks 1 of 4 at start
    sizeClass: "LEGACY",         // NB: not a parcel — the legacy full 3-lane arena. sizeM is authoritative.
    sizeM: Math.round(2 * HARD),
    laneCount: 3,
    // clampMap (index.html:2919-2931) applies TWO clamps to EVERY unit: a hard ±115*MAPK=161 m
    // outer limit (= arena.bounds), then a soft ±90*MAPK=126 m box — EXCEPT the two diagonal
    // fountain pockets (blue SW / red NE, r=16*MAPK around each fountain). softClampBoxM is that
    // inner box (all units, not just heroes); render arena.bounds, path against box+pockets.
    softClampBoxM: 2 * SOFT,
    source: "etherfantasy-browser-moba-game@15d610c index.html (drawMM minimap geometry, MAPK=1.4)",
    note: "Structural geometry only; cosmetic tree/grass scatter (Math.random in-engine) omitted. " +
          "Blue(SW)->ATTACKER, Red(NE)->DEFENDER (MOBA is symmetric PvP; sides are a labelling choice).",
  },
  arena: { shape: "polygon", sizeM: Math.round(2 * HARD), hardClampM: HARD, softClampBoxM: SOFT, bounds },
  heightField: { cols: HF_N, rows: HF_N, cellM: HF_CELL, data: hf },
  obstacles: WALLS.map((w, i) => ({
    id: `ridge_${String(i + 1).padStart(2, "0")}`, kind: "RIDGE", passable: false, footprint: wallFootprint(w),
  })),
  resources: [
    ...NODES.map((n, i) => ({
      id: `${n[0]}_${String(i + 1).padStart(2, "0")}`,
      kind: n[0] === "mineral" ? "GOLD_MINE" : "WOOD_GROVE",
      x: K(n[1]), z: K(n[2]), richness: richness(n[3]),
    })),
    // per-camp nodes (spawnWildCamp :3074): mineral at camp, tree at camp+(6,4)
    ...CAMPS.flatMap((cmp, i) => ([
      { id: `camp_gold_${i + 1}`, kind: "GOLD_MINE",  x: K(cmp.x),     z: K(cmp.z),     richness: 3 },
      { id: `camp_wood_${i + 1}`, kind: "WOOD_GROVE", x: K(cmp.x) + 6, z: K(cmp.z) + 4, richness: 2 },
    ])),
  ],
  buildSpots: BUILD_PADS.map((s, i) => ({
    anchorId: `spot_${String(i + 1).padStart(2, "0")}`, x: K(s[0]), z: K(s[1]), size: "M", side: "ATTACKER",
  })),
  spawnZones: FOUNTAINS.map((f) => ({
    id: `spawn_${f.side.toLowerCase()}`, side: f.side, edge: f.edge, x: K(f.x), z: K(f.z),
  })),
  lanes: Object.entries(LANES).map(([id, wp]) => ({
    id: `lane_${id}`, side: "ATTACKER", waypoints: wp.map(P),
    note: "symmetric/bidirectional — DEFENDER minions traverse in reverse (mkMinion reverses, index.html:3057)",
  })),
  structures: [
    ...CORES.map((c, i) => ({
      anchorId: `anchor_cc_${c.team}`, kind: "CORE", side: c.side, x: K(c.x), z: K(c.z), _ref: STAT.CORE,
    })),
    ...TOWERS.map((t, i) => ({
      anchorId: `anchor_t${String(i + 1).padStart(2, "0")}`, kind: "TOWER", side: t[0], x: K(t[1]), z: K(t[2]), _ref: STAT.TOWER,
    })),
  ],
  mobs: [
    ...CAMPS.map((c, i) => ({ id: `camp_${i + 1}`, kind: "WILD_GUARD", x: K(c.x), z: K(c.z), count: 3, _ref: STAT.WILD_GUARD })),
    ...BOSSES.map((b, i) => ({ id: `boss_${b.kind}`, kind: "BOSS", x: K(b.x), z: K(b.z), count: 1, adds: 2, guards: `legendary:${b.kind}`, _ref: STAT.BOSS })),
  ],
  thumbnail: null,   // no top-down PNG exported yet
};

const out = join(dirname(fileURLToPath(import.meta.url)), "legacy.json");
writeFileSync(out, JSON.stringify(bf, null, 2) + "\n");
console.log(`wrote ${out}`);
console.log(`  bounds ±${HARD}m (hero soft box ±${SOFT}m) · ${bf.obstacles.length} ridges · ${bf.structures.length} structures · ${bf.resources.length} resources · ${bf.mobs.length} mob groups · ${bf.lanes.length} lanes`);
