// Deterministic parcel battlefield generator (MAP-GENERATOR.md D3). Pipeline:
//   seed = f(parcelId,biome,zone) → params (or LLM/owner params, clamped) → archetype DENSE paint
//   → landmark/prop stamping → carve the MOBA lane network out of the jungle (lanes / entry
//   corridors / inter-lane chokes / base+staging clearings / resource pockets) → anchors/spawns
//   (mirror-fair) → validate+repair → bake.
// Same inputs ⇒ byte-identical artifact (no Math.random / Date.now anywhere).
//
// LAYOUT CANON (2026-07-10, golden reference examples/moba-singleplayer.artifact.json — the
// reverse-engineered REAL MOBA single-player map): ±161 frame, ATTACKER base SW / DEFENDER NE
// (spawns at ±118 on the diagonal, matching the reference), laneCount 3 ⇒ mid diagonal lane +
// top (W→N) + bot (S→E) edge lanes at ±100.8 with shoulders at ±84 (the DESIGNED estate arena —
// unchanged). laneCount 1 (the ~20K continent singles) ⇒ ORGANIC COUNTRYSIDE (owner 2026-07-10,
// supersedes the crossroads-web template): roads belong ONLY to the world layer — a parcel plays
// whatever world features overlap it and carves NO road template of its own. The ground gets
// strongly-meandering OPEN corridors (walkability clearings, one per entry, seeded joins that
// vary per parcel — no repeating motif), and the DECLARED battle lane is an instantiation over
// those corridors at battle time (atk_S → ride the carved ground through center → def_base).
// T.ROAD is painted exclusively by the world field (+ water fords). The space between corridors
// is DENSE jungle (35–55% blocked) — not open field.
import { makeRng } from "../sim/rng.js";
import { clampParams, budgetFor, ARCHETYPES, PALETTES, LANDMARKS, BARRIER_KINDS, T, CELL_M, gIdx, inG, cellOf, worldOf, isBlocked, b64, pointInPoly } from "./schema.js";
import { archetypes } from "./archetypes.js";
import { validateAndRepair, snapOpen, snapOpenOrDrop, erode, routesToCenter } from "./validate.js";
import { executeFeatures } from "./features.js";
import { loadWorldField, featuresForParcel, fitToArena } from "./worldfield.js";
import { ruinLore, RUIN_TYPES } from "./chronicle.js";

// ---- real-parcel polygon support ------------------------------------------------------------
// The overworld gives each parcel its actual polygon; the battlefield is built INSIDE it —
// everything outside is T.OOB (void). Square stays the fallback when no polygon is known.
// fitToArena (worldfield.js) is the SINGLE source of the parcel→arena fit: world features go
// through the identical scale+center, so a river and the polygon land in the same frame.
function normPoly(polygon, sizeM) {          // world-snapshot coords → arena coords (centered, fitted)
  const f = fitToArena(polygon, sizeM);
  return polygon.map(([x, z]) => [Math.round((x - f.cx) * f.s * 10) / 10, Math.round((z - f.cz) * f.s * 10) / 10]);
}
function stampOOB(g, G, poly) {
  for (let cz = 0; cz < G; cz++) for (let cx = 0; cx < G; cx++)
    if (!pointInPoly(worldOf(G, cx), worldOf(G, cz), poly)) g[gIdx(G, cx, cz)] = T.OOB;
}
// boundary point furthest along (dx,dz), pulled toward the centroid by t (0..1) so it lands inside
function polyAnchor(poly, dx, dz, t) {
  let cx = 0, cz = 0; for (const [x, z] of poly) { cx += x; cz += z; } cx /= poly.length; cz /= poly.length;
  let best = poly[0], bd = -1e9;
  for (const p of poly) { const d = p[0] * dx + p[1] * dz; if (d > bd) { bd = d; best = p; } }
  return { x: best[0] + (cx - best[0]) * t, z: best[1] + (cz - best[1]) * t };
}

export const fnv1a = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
export const seedFor = (parcelId, biome = "", zone = "") => fnv1a(`${parcelId}|${biome}|${zone}`);
// regional coherence: neighbouring parcels share a biome palette (region = coarse id bucket)
export const regionPalette = (parcelId) => PALETTES[fnv1a("region:" + String(parcelId).slice(0, -3)) % PALETTES.length];

// BIOME → ground palette. The colour MUST match the declared biome — a DESERT parcel must never
// render green. biomeFamily (from data/zone-registry.json) maps to the palette(s) whose PALETTE_RGB
// reads correctly for that terrain; a seed picks among a biome's variants for coherent variety.
const BIOME_PALETTES = {
  TEMPERATE_GRASS: ["verdant", "autumn"],
  TEMPERATE_FOREST: ["verdant", "autumn", "sakura"],
  DESERT: ["desert"],
  SNOW: ["tundra", "ashen"],
  VOLCANIC: ["volcanic", "ashen"],
  SWAMP: ["swamp"],
};
export function biomePalette(biome, seed = 0) {
  if (!biome) return null;
  const key = String(biome).toUpperCase();
  const opts = BIOME_PALETTES[key];
  if (opts) {
    if (opts.length === 1) return opts[0];
    // bias to the canonical (first) palette; ~1 in 3 rolls a variant for coherent regional variety
    return (seed % 3 === 0) ? opts[1 + (seed % (opts.length - 1))] : opts[0];
  }
  const low = String(biome).toLowerCase();
  return PALETTES.includes(low) ? low : null;   // biome already given as a palette name
}

// default parameter roll from the seed (v0 maps) — owner/LLM directives override via `params`.
// Rolls WITHIN the parcel's investment budget (a fresh tier-0 parcel rolls a modest map).
export function paramsFromSeed(seed, parcelId, budget = budgetFor(0)) {
  const rng = makeRng(seed ^ 0xa11ce);
  return clampParams({
    archetype: ARCHETYPES[Math.floor(rng() * ARCHETYPES.length)],
    palette: regionPalette(parcelId),
    landmark: rng() < 0.02 ? LANDMARKS[1 + Math.floor(rng() * (LANDMARKS.length - 1))] : "NONE", // ~1 in 50 spectacular
    laneCount: 1, density: 0.3 + rng() * 0.5, waterLevel: rng(),
    resourceNodes: 1 + Math.floor(rng() * budget.resourceNodes), resourceRichness: 0.3 + rng() * 0.6,
    mobCamps: Math.floor(rng() * (budget.mobCamps + 1)), towers: Math.floor(rng() * (budget.towers + 1)),
    barriers: Math.floor(rng() * ((budget.barriers ?? 0) + 1)),
    roughness: 0.3 + rng() * 0.6, mirrorFair: true,
  }, budget);
}

// props (render décor + client-side collision hints) sampled from the painted grid.
// Probability adapts to the (now dense) fill so ~380 props spread across the WHOLE map instead
// of the fixed-rate cap starving the north half.
function sampleProps(g, G, rng) {
  const props = [];
  const KIND = { [T.FOREST]: ["TREE", 3], [T.ROCK]: ["ROCK", 2.5] };
  let cand = 0;
  for (let z = 0; z < G; z += 2) for (let x = 0; x < G; x += 2) if (KIND[g[gIdx(G, x, z)]]) cand++;
  const prob = Math.min(0.16, 380 / Math.max(1, cand));
  for (let z = 0; z < G; z += 2) for (let x = 0; x < G; x += 2) {
    const k = KIND[g[gIdx(G, x, z)]];
    if (k && rng() < prob && props.length < 420)
      props.push({ kind: k[0], x: r1(worldOf(G, x) + (rng() - 0.5) * CELL_M), z: r1(worldOf(G, z) + (rng() - 0.5) * CELL_M), r: r1(k[1] * (0.7 + rng() * 0.6)) });
  }
  return props;
}
const r1 = (n) => Math.round(n * 10) / 10;

// ---- RUIN — the seeded Chronicle layer (depth-layer 1) ------------------------------------------
// A low-density seeded entity like the landmark: fallen keeps / cairns / old walls / sunken
// shrines of the pre-Sundering kingdoms, named + inscribed from the Chronicle table
// (chronicle.js). PASSIVE DÉCOR: never painted into the grid — walkability and the 5 CF
// invariants are untouched (it rides obstacles[] like the landmark props and becomes a
// passable:true décor anchor in the A1). Rolled on its OWN rng stream (seed ^ fnv1a("ruin")),
// so the layer never disturbs the rest of the map: regenerating an existing parcel yields the
// byte-identical artifact plus (sometimes) a ruin — a re-runnable seed layer, NOT base-bake.
// Density: ~1 in 7 parcels, wilds-biased — castle parcels never roll one; road-laced ground
// (urban cores / trunk crossings) rolls at a quarter of the odds. Deterministic placement:
// seeded probes over the FINAL grid for an OPEN pocket away from every spawn/base.
const RUIN_R = { FALLEN_KEEP: 6, OLD_WALL: 5, SUNKEN_SHRINE: 4, CAIRN: 3 };
const RUIN_P_WILD = 0.14;       // ~1 in 7 countryside parcels
const RUIN_P_URBAN = 0.035;     // ~1 in 29 road-laced (urban-core) parcels
const RUIN_ROAD_FRAC = 0.06;    // grid ROAD fraction above which ground reads as urban
export function placeRuin(g, G, { seed, zone, castle, avoidPts }) {
  if (castle) return null;                                    // castle parcels are LIVING strongholds
  const rng = makeRng((seed ^ fnv1a("ruin")) >>> 0);
  let inb = 0, road = 0;
  for (let i = 0; i < g.length; i++) if (g[i] !== T.OOB) { inb++; if (g[i] === T.ROAD) road++; }
  if (rng() >= (road / Math.max(1, inb) > RUIN_ROAD_FRAC ? RUIN_P_URBAN : RUIN_P_WILD)) return null;
  for (let t = 0; t < 80; t++) {                              // seeded probes, first fit wins
    const cx = 8 + Math.floor(rng() * (G - 16)), cz = 8 + Math.floor(rng() * (G - 16));
    if (g[gIdx(G, cx, cz)] !== T.OPEN) continue;              // open natural ground (never a road/ford)
    const x = worldOf(G, cx), z = worldOf(G, cz);
    if (avoidPts.some((a) => Math.hypot(x - a.x, z - a.z) < a.d)) continue;
    let open = 0;                                             // needs a mostly-open pocket around it
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++)
      if (inG(G, cx + dx, cz + dz) && !isBlocked(g, gIdx(G, cx + dx, cz + dz))) open++;
    if (open < 19) continue;
    const ruinType = RUIN_TYPES[Math.floor(rng() * RUIN_TYPES.length)];
    const { name, inscription } = ruinLore(rng, zone, ruinType);
    return { kind: "RUIN", ruinType, name, inscription, x: r1(x), z: r1(z), r: RUIN_R[ruinType] };
  }
  return null;
}

// ---- WORLD-ELEMENTS OVERLAY décor (docs/briefs/WORLD-ELEMENTS-OVERLAY.md) ----------------------
// Overlay elements windowed into the parcel (worldfield.js featuresForParcel .overlayElements)
// materialize as seed-layer DÉCOR anchors exactly like the RUIN: never painted into the walk
// grid, no invariant can move, rng-free (pure deterministic snap) — so a parcel with no overlay
// regenerates byte-identically, and one WITH an overlay regenerates as the identical map plus
// the décor. Placement follows the ruin placer's ground rule: the authored point snaps to the
// nearest OPEN natural cell (never a road/ford/water) on the FINAL grid; an element with no open
// ground within OVERLAY_SNAP_MAX cells is dropped (logged in artifact meta.overlay.dropped).
const OVERLAY_DECOR_CAP = 6;      // per-parcel cap; overflow dropped by (layer-file order, id)
const OVERLAY_SNAP_MAX = 30;      // snap search radius in cells (~60 world-units)
const OVERLAY_DECOR_R = 4;        // décor anchor radius (world-units) — passive, RUIN-class
function snapDecorOpen(g, G, x, z) {
  const cx0 = cellOf(G, x), cz0 = cellOf(G, z);
  let best = null, bd = Infinity;
  for (let dz = -OVERLAY_SNAP_MAX; dz <= OVERLAY_SNAP_MAX; dz++) for (let dx = -OVERLAY_SNAP_MAX; dx <= OVERLAY_SNAP_MAX; dx++) {
    const cx = cx0 + dx, cz = cz0 + dz;
    if (!inG(G, cx, cz) || g[gIdx(G, cx, cz)] !== T.OPEN) continue;
    const d = dx * dx + dz * dz;                          // fixed scan order ⇒ deterministic ties
    if (d < bd) { bd = d; best = { x: worldOf(G, cx), z: worldOf(G, cz) }; }
  }
  return best;
}
function placeOverlayDecor(g, G, overlayElements) {
  const decor = [], dropped = [];
  // deterministic priority under the cap: overlay-file (layer) order, then id — the windowed
  // list already arrives in file order, the sort makes the contract explicit + id-stable.
  const els = [...overlayElements].sort((a, b) => (a.layer < b.layer ? -1 : a.layer > b.layer ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const el of els) {
    if (decor.length >= OVERLAY_DECOR_CAP) { dropped.push({ id: el.id, why: "cap" }); continue; }
    const s = snapDecorOpen(g, G, el.at[0], el.at[1]);
    if (!s) { dropped.push({ id: el.id, why: "no-open-ground" }); continue; }
    decor.push({ id: el.id, kind: el.kind, x: r1(s.x), z: r1(s.z), r: OVERLAY_DECOR_R, layer: el.layer,
      ...(el.name ? { name: el.name } : {}),
      ...(el.note ? { note: el.note } : {}),
      ...(el.singularId ? { singularId: el.singularId } : {}),
      ...(el.loreRef ? { loreRef: el.loreRef } : {}) });
  }
  return { decor, dropped };
}

// ---- MOBA lane-network carving ----------------------------------------------------------------
// Everything below carves WALKABLE geometry out of the archetype's dense jungle: never touches
// OOB, water under a corridor becomes ROAD (ford/causeway), blocked becomes OPEN. Lane corridors
// are painted ROAD (they ARE roads on the real map).

// open (or road) every in-bounds cell within Euclidean r of (cx,cz)
function disc(g, G, cx, cz, r, road = false) {
  const R = Math.ceil(r);
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    if (dx * dx + dz * dz > r * r) continue;
    const x = cx + dx, z = cz + dz;
    if (!inG(G, x, z)) continue;
    const i = gIdx(G, x, z);
    if (g[i] === T.OOB) continue;
    if (road) g[i] = T.ROAD;
    else g[i] = g[i] === T.WATER ? T.ROAD : (isBlocked(g, i) ? T.OPEN : g[i]);
  }
}
// swept corridor of half-width hw (cells) along a world-coord polyline
function carvePath(g, G, pts, hw, road = false) {
  for (let s = 1; s < pts.length; s++) {
    const ax = cellOf(G, pts[s - 1][0]), az = cellOf(G, pts[s - 1][1]);
    const bx = cellOf(G, pts[s][0]), bz = cellOf(G, pts[s][1]);
    const steps = Math.max(Math.abs(bx - ax), Math.abs(bz - az), 1);
    for (let k = 0; k <= steps; k++)
      disc(g, G, Math.round(ax + ((bx - ax) * k) / steps), Math.round(az + ((bz - az) * k) / steps), hw, road);
  }
}
// ---- BRIDGES (bridges read as bridges) ---------------------------------------------------------
// A carved corridor that crosses WATER always got a ford (disc turns WATER→ROAD) — but the ford
// used to sit alone in the river, an orphan stub. carveCorridor wraps carvePath with the water
// mask captured at carve time (world rivers + archetype pools alike):
//   • CONSOLIDATE: a crossing whose midpoint lies within BRIDGE_REUSE_U of an already-made
//     crossing (earlier corridor ford or a world-road bridge) reroutes through that crossing —
//     one shared bridge instead of a braid of parallel fords.
//   • APPROACHES: each remaining crossing paints T.ROAD along the corridor for ~BRIDGE_APPR_U on
//     BOTH banks, so the crossing reads road–bridge–road, never a lone causeway in the water.
const BRIDGE_REUSE_U = 14;                   // reuse an existing crossing within this range (world-units)
const BRIDGE_APPR_U = 6;                     // road approach length on each bank (world-units)
function densify(pts, step = CELL_M) {
  const out = [pts[0].slice()];
  for (let s = 1; s < pts.length; s++) {
    const [ax, az] = pts[s - 1], [bx, bz] = pts[s];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
}
// wet runs: maximal index ranges of dense samples sitting on masked water
function wetRuns(water, G, dense) {
  const runs = [];
  const wet = (p) => water[gIdx(G, cellOf(G, p[0]), cellOf(G, p[1]))] === 1;
  for (let i = 0; i < dense.length; i++) {
    if (!wet(dense[i])) continue;
    let j = i;
    while (j + 1 < dense.length && wet(dense[j + 1])) j++;
    runs.push([i, j]); i = j;
  }
  return runs;
}
function carveCorridor(g, G, pts, hw, bridge) {
  if (!bridge || !bridge.water || pts.length < 2) { carvePath(g, G, pts, hw, false); return; }
  let dense = densify(pts);
  // DE-BRAID: a corridor that dips in and out of water repeatedly (wading diagonally along a
  // wide river) collapses to ONE clean crossing — straight from just before its first wet
  // sample to just after its last — instead of a zigzag braid of fords.
  let runs0 = wetRuns(bridge.water, G, dense);
  if (runs0.length >= 2) {
    const a = Math.max(0, runs0[0][0] - 1), b = Math.min(dense.length - 1, runs0[runs0.length - 1][1] + 1);
    dense = [...dense.slice(0, a), ...densify([dense[a], dense[b]]), ...dense.slice(b + 1)];
    runs0 = wetRuns(bridge.water, G, dense);
  }
  // consolidation pass: reroute each crossing through a nearby existing one (single reroute pass)
  for (let r = runs0.length - 1; r >= 0; r--) {           // splice back-to-front, indices stay valid
    const [i0, i1] = runs0[r];
    const mid = dense[(i0 + i1) >> 1];
    let via = null, bd = Infinity;
    for (const c of bridge.reg) {
      const d = Math.hypot(c[0] - mid[0], c[1] - mid[1]);
      if (d > 0.5 && d < BRIDGE_REUSE_U && d < bd) { bd = d; via = c; }
    }
    if (via) dense.splice(i0, i1 - i0 + 1, [via[0], via[1]]);
  }
  carvePath(g, G, dense, hw, false);
  // approaches + registry on the FINAL polyline (reroutes included)
  const appr = Math.ceil(BRIDGE_APPR_U / CELL_M);
  for (const [i0, i1] of wetRuns(bridge.water, G, dense)) {
    bridge.reg.push([dense[(i0 + i1) >> 1][0], dense[(i0 + i1) >> 1][1]]);
    carvePath(g, G, dense.slice(Math.max(0, i0 - appr), Math.min(dense.length, i1 + appr + 1)), Math.min(hw, 2.0), true);
  }
}
// ---- continuous-world feature painting (CONTINUOUS-WORLD-TERRAIN.md) --------------------------
// A world feature is a swept band (discs of half-width hw) along a battle-frame polyline that may
// run far outside the arena (the window has margin) — so NO cellOf clamping here: out-of-grid
// cells are skipped, never smeared onto the border. Paints the terrain CODE hard (the macro world
// overrides the archetype coat); OOB is never touched (the band is polygon-cut like everything).
function paintBand(g, G, pts, hw, code) {
  const rc = Math.max(0.75, hw / CELL_M);                 // half-width in cells
  const R = Math.ceil(rc), half = (G * CELL_M) / 2;
  for (let s = 1; s < pts.length; s++) {
    const [ax, az] = pts[s - 1], [bx, bz] = pts[s];
    if (Math.min(ax, bx) > half + hw || Math.max(ax, bx) < -half - hw || Math.min(az, bz) > half + hw || Math.max(az, bz) < -half - hw) continue;   // segment fully outside the grid
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / CELL_M));
    for (let k = 0; k <= steps; k++) {
      const cx = Math.floor((ax + ((bx - ax) * k) / steps + half) / CELL_M);
      const cz = Math.floor((az + ((bz - az) * k) / steps + half) / CELL_M);
      if (cx < -R || cz < -R || cx >= G + R || cz >= G + R) continue;
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > rc * rc) continue;
        const x = cx + dx, z = cz + dz;
        if (!inG(G, x, z)) continue;
        const i = gIdx(G, x, z);
        if (g[i] !== T.OOB) g[i] = code;
      }
    }
  }
}
// FILL water (worldfield.js `fill: true` rivers — lakes/calderas at their honest uncapped width).
// A fill band's half-width can exceed the whole arena (a single parcel deep inside the Mere of
// Dominus is 100% underwater), so the disc-sweep of paintBand would be O((2R)²) per sample —
// paintFill instead tests every grid cell ONCE against the windowed centerline segments
// (distance-to-segment ≤ hw ⇒ water). Deterministic float math; OOB never touched.
// PLAYABILITY: fill water is honest, the map stays valid — the carve stage turns corridor water
// into ROAD fords and validateAndRepair carves edge→base corridors as a last resort; on a
// water-dominant parcel that repair carve IS the causeway across the mere (WATER→ROAD, the
// documented causeway/ford guarantee). A 100%-submerged parcel still ends valid after repair.
function paintFill(g, G, pts, hw, code) {
  if (!pts || pts.length < 2) return;
  const half = (G * CELL_M) / 2, hw2 = hw * hw;
  const segs = [];
  for (let s = 1; s < pts.length; s++) {
    const [ax, az] = pts[s - 1], [bx, bz] = pts[s];
    if (Math.min(ax, bx) > half + hw || Math.max(ax, bx) < -half - hw ||
        Math.min(az, bz) > half + hw || Math.max(az, bz) < -half - hw) continue;  // fully clear of the grid
    segs.push([ax, az, bx - ax, bz - az, (bx - ax) ** 2 + (bz - az) ** 2]);
  }
  if (!segs.length) return;
  for (let cz = 0; cz < G; cz++) for (let cx = 0; cx < G; cx++) {
    const i = gIdx(G, cx, cz);
    if (g[i] === T.OOB) continue;
    const x = worldOf(G, cx), z = worldOf(G, cz);
    for (const [ax, az, dx, dz, L2] of segs) {
      let t = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - ax - dx * t, ez = z - az - dz * t;
      if (ex * ex + ez * ez <= hw2) { g[i] = code; break; }
    }
  }
}
// Paint the parcel's window of the zone macro network. Order matters: ridges (rock mass), then
// rivers (water cuts the rock), then roads LAST — a road crossing a river paints ROAD over WATER,
// i.e. the causeway/bridge falls out for free. Rivers stay WATER (blocked) in the grid; the carve
// stage + validator turn lane/corridor crossings into ROAD fords exactly like any other water.
// `fill: true` rivers (lakes/calderas) paint their TRUE footprint via paintFill (above).
function paintWorldFeatures(g, G, wf) {
  for (const r of wf.ridges || []) paintBand(g, G, r.pts, r.width / 2, T.ROCK);
  for (const r of wf.rivers || []) (r.fill ? paintFill : paintBand)(g, G, r.pts, r.width / 2, T.WATER);
  for (const r of wf.roads || []) paintBand(g, G, r.pts, r.width / 2, T.ROAD);
}

// point at arc-length fraction t along a world polyline (+ local direction)
function pointAt(lane, t) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < lane.length; i++) {
    const d = Math.hypot(lane[i][0] - lane[i - 1][0], lane[i][1] - lane[i - 1][1]);
    segs.push(d); total += d;
  }
  let want = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? want / segs[i] : 0;
      const [ax, az] = lane[i], [bx, bz] = lane[i + 1];
      const dl = Math.hypot(bx - ax, bz - az) || 1;
      return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, dx: (bx - ax) / dl, dz: (bz - az) / dl };
    }
    want -= segs[i];
  }
  return { x: lane[0][0], z: lane[0][1], dx: 1, dz: 0 };
}
// nearest point on a set of polylines to (x,z) — sampled every ~4 world units
function nearestOnNetwork(network, x, z) {
  let best = null, bd = Infinity;
  for (const lane of network) for (let i = 1; i < lane.length; i++) {
    const [ax, az] = lane[i - 1], [bx, bz] = lane[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4));
    for (let k = 0; k <= n; k++) {
      const px = ax + ((bx - ax) * k) / n, pz = az + ((bz - az) * k) / n;
      const d = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (d < bd) { bd = d; best = [px, pz]; }
    }
  }
  return best || [0, 0];
}

// Carve the lane network + staging clearings + entry corridors + chokes + jungle pockets.
// TWO GROUND LAYOUTS (the anchors/spawn contract is identical):
//   • laneCount 3 (2) — the golden-reference ARENA: mid diagonal + top/bot edge lanes. The
//     designed estate/castle arena geometry (canon decision 5) — unchanged.
//   • laneCount 1 — ORGANIC COUNTRYSIDE CLEARINGS (owner 2026-07-10; supersedes the crossroads
//     web): each entry_e* arrival wanders its OWN strongly-meandering OPEN corridor into the
//     middle, WHEREVER the entry is (the world-field pass may relocate entries onto road/river
//     crossings). The joins VARY per seed — an arm either runs to a seeded hub point near
//     center or merges into an earlier arm partway — so corridors tree up organically and no
//     two parcels share a motif (no cross, no diagonal, nothing axis-aligned repeating on the
//     mosaic). Corridors are walkability CLEARINGS (OPEN), never T.ROAD: painted roads come
//     exclusively from the continuous world field (+ water fords). The DECLARED lane (the A1
//     battle line) is an INSTANTIATION over those corridors: atk_S → mount the nearest carved
//     vertex → ride through center → def_base — the command view still gets a real lane.
// Returns { lanes (the DECLARED world polylines), resPockets, campPockets }.
function carveMobaNetwork(g, G, rng, p, { atk, def, poly, half, spawnZones, rimPts, bridge }) {
  const inPoly = (x, z) => !poly || pointInPoly(x, z, poly);
  let pcx = 0, pcz = 0;
  if (poly) { for (const [x, z] of poly) { pcx += x; pcz += z; } pcx /= poly.length; pcz /= poly.length; }
  const pull = (x, z) => {           // pull a template point toward the polygon centroid until inside
    if (inPoly(x, z)) return [x, z];
    for (let t = 1; t <= 10; t++) { const f = t / 10, nx = x + (pcx - x) * f, nz = z + (pcz - z) * f; if (pointInPoly(nx, nz, poly)) return [nx, nz]; }
    return [pcx, pcz];
  };
  let declared, side, network;
  if (p.laneCount === 1) {
    // ---- organic countryside clearings (no template — see the function comment) ----------------
    const lim = half - 4;
    const clampIn = (x, z) => pull(Math.max(-lim, Math.min(lim, x)), Math.max(-lim, Math.min(lim, z)));
    const entries = spawnZones.filter((s) => s.id.startsWith("entry_e"));
    // corridors follow the BANK of world water, not braid across it: a waypoint landing on painted
    // WATER slides sideways (perpendicular) to the nearest dry ground — the river gets ONE ford
    // where a crossing is genuinely needed (usually at the entry crossing itself), not a lattice
    // of causeways. Deterministic: probes fixed offsets against the already-painted grid.
    // STICKY bank-hugging dodge (bridges follow-up 2026-07-10): probes reach much further than
    // before (±64 u — the Arcadia Flow is ~2 parcels wide at battle scale) AND an arm remembers
    // which bank it last landed on, preferring that side for the next waypoint — so a corridor
    // whose chord runs along the river HUGS ONE BANK instead of zigzag-braiding across it. An
    // arm only ends up crossing when its entry/target genuinely sit on the other side.
    let dodgeSign = 0;
    const dodgeWater = (x, z, px, pz) => {
      if (g[gIdx(G, cellOf(G, x), cellOf(G, z))] !== T.WATER) return [x, z];
      const order = [];
      if (dodgeSign) {
        for (let d = 4; d <= 64; d += 4) order.push(dodgeSign * d);
        for (let d = 4; d <= 64; d += 4) order.push(-dodgeSign * d);
      } else {
        for (let d = 4; d <= 64; d += 4) order.push(d, -d);    // no bank yet: nearest first
      }
      for (const d of order) {
        const nx = x + px * d, nz = z + pz * d;
        if (Math.abs(nx) < lim && Math.abs(nz) < lim && inPoly(nx, nz) && g[gIdx(G, cellOf(G, nx), cellOf(G, nz))] !== T.WATER) { dodgeSign = d > 0 ? 1 : -1; return [nx, nz]; }
      }
      return [x, z];
    };
    // dry-point nudge for corridor JOIN/HUB targets: probe 8 directions outward for the nearest
    // dry ground so arms don't converge to a mid-river meeting point (deterministic probe order)
    const dryNear = (x, z) => {
      if (g[gIdx(G, cellOf(G, x), cellOf(G, z))] !== T.WATER) return [x, z];
      for (let d = 4; d <= 64; d += 4) for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [0.707, -0.707], [-0.707, 0.707], [-0.707, -0.707]]) {
        const nx = x + ux * d, nz = z + uz * d;
        if (Math.abs(nx) < lim && Math.abs(nz) < lim && inPoly(nx, nz) && g[gIdx(G, cellOf(G, nx), cellOf(G, nz))] !== T.WATER) return [nx, nz];
      }
      return [x, z];
    };
    // one seeded profile PER ARM (never shared/mirrored): two sine harmonics + a drift bow,
    // envelope-pinned at both endpoints so the arm still lands exactly on its entry + join.
    const wander = (from, to) => {
      dodgeSign = 0;                                    // each arm picks (and then keeps) its own bank
      const prof = { p1: rng() * Math.PI * 2, f1: 0.7 + rng() * 1.1, a1: 10 + rng() * 14,
                     p2: rng() * Math.PI * 2, f2: 1.7 + rng() * 1.8, a2: 4 + rng() * 7,
                     drift: (rng() - 0.5) * 44 };
      const dx = to[0] - from[0], dz = to[1] - from[1];
      const len = Math.hypot(dx, dz) || 1;
      const px = dz / len, pz = -dx / len;                // unit perpendicular to the chord
      const n = Math.max(4, Math.round(len / 22));
      const pts = [[from[0], from[1]]];
      for (let k = 1; k < n; k++) {
        const t = k / n, env = Math.sin(Math.PI * t);     // pinned at both ends
        const off = env * (Math.sin(prof.p1 + t * prof.f1 * Math.PI * 2) * prof.a1
                         + Math.sin(prof.p2 + t * prof.f2 * Math.PI * 2) * prof.a2
                         + prof.drift * t * (1 - t) * 2);
        const [wx, wz] = clampIn(from[0] + dx * t + px * off, from[1] + dz * t + pz * off);
        pts.push(dodgeWater(wx, wz, px, pz));
      }
      pts.push([to[0], to[1]]);
      return pts;
    };
    const arms = [];       // the carved corridor polylines (the physical clearings)
    const toCenter = [];   // per entry: a vertex path entry → … → [0,0] on carved ground only
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (i >= 2 && toCenter.length && rng() < 0.5) {
        // merge into an earlier arm partway — corridors tree up, joins vary per parcel
        const tgt = toCenter[Math.floor(rng() * toCenter.length)];
        const at = pointAt(tgt, 0.35 + rng() * 0.4);
        const join = dryNear(...clampIn(at.x, at.z));
        const pts = wander([e.x, e.z], join);
        let bi = 0, bd = Infinity;
        for (let k = 0; k < tgt.length; k++) {
          const d = (tgt[k][0] - join[0]) ** 2 + (tgt[k][1] - join[1]) ** 2;
          if (d < bd) { bd = d; bi = k; }
        }
        arms.push(pts);
        toCenter.push([...pts, ...tgt.slice(bi)]);
      } else {
        // hub arm: approach the middle via a seeded ring point — joins land all around center
        const a = rng() * Math.PI * 2, rr = 5 + rng() * 10;
        const hub = dryNear(...clampIn(Math.cos(a) * rr, Math.sin(a) * rr));
        const pts = [...wander([e.x, e.z], hub), [0, 0]];
        arms.push(pts);
        toCenter.push(pts);
      }
    }
    // DECLARED lane: mount the corridor network at the nearest carved vertex to each duel base
    // and ride it through center — the polyline follows the carved clearings, so it is walkable
    // by construction (the base↔mount hops are carved with the lane itself below).
    const mount = (x, z) => {
      let best = toCenter[0], bi = 0, bd = Infinity;
      for (const path of toCenter) for (let k = 0; k < path.length; k++) {
        const d = (path[k][0] - x) ** 2 + (path[k][1] - z) ** 2;
        if (d < bd) { bd = d; best = path; bi = k; }
      }
      return best.slice(bi);                              // [mountPt, …, center]
    };
    const rideIn = mount(atk.x, atk.z), rideOut = mount(def.x, def.z);
    declared = [[[atk.x, atk.z], ...rideIn, ...rideOut.slice(0, -1).reverse(), [def.x, def.z]]];
    side = arms;
    network = [...arms, declared[0]];
  } else {
    // ---- golden-reference arena (estates / formal 3-lane maps) — unchanged ---------------------
    // reference geometry: lanes at ±100.8, shoulders at ±84 (fractions of the ±161 frame)
    const L = half * 0.626, S = half * 0.522;
    const mid = [[atk.x, atk.z], [0, 0], [def.x, def.z]].map(([x, z]) => pull(x, z));
    const top = [[-L, -S], [-L, L], [S, L]].map(([x, z]) => pull(x, z));    // west edge → north edge
    const bot = [[-S, -L], [L, -L], [L, S]].map(([x, z]) => pull(x, z));    // south edge → east edge
    declared = p.laneCount === 3 ? [mid, top, bot] : [mid, top];
    side = p.laneCount === 3 ? [] : [bot];
    network = [...declared, ...side];
  }

  // 1) lanes: declared ~10 u wide; undeclared corridor arms / side-paths ~8–9 u wide
  // Lanes carve as CLEARED TRACKS (OPEN), not paved ROAD — they are battle lines / paths of attack
  // (the A1 lanes[] overlay), not roads on the land. T.ROAD is reserved for REAL roads: the
  // continuous world-field highways + fords/bridges (owner 2026-07-10 — roads must read as one
  // connected network on the map; battle lanes dead-ending at parcel edges looked like broken roads).
  // disc(road=false) still turns WATER→ROAD, so lane/track fords stay visible crossings —
  // carveCorridor consolidates those crossings and paints the road–bridge–road approaches.
  for (const lane of declared) carveCorridor(g, G, lane, 2.5, bridge);
  for (const path of side) carveCorridor(g, G, path, p.laneCount === 1 ? 2.2 : 2.0, bridge);
  // 2) base plateaus + center + staging clearings (mirrors command_converter's CORE/SPAWN pockets)
  disc(g, G, cellOf(G, atk.x), cellOf(G, atk.z), 9.5);
  disc(g, G, cellOf(G, def.x), cellOf(G, def.z), 12);       // wider: holds the CoC build-spot ring
  disc(g, G, G >> 1, G >> 1, 5);
  for (const s of spawnZones) disc(g, G, cellOf(G, s.x), cellOf(G, s.z), 4.5);
  // 3) both duel bases connect into the network. Countryside layout: the declared lane already
  // rides the corridors base-to-base; arena layout: every reference lane starts/ends at a base.
  if (p.laneCount !== 1) {
    for (const lane of network) {
      carveCorridor(g, G, [[atk.x, atk.z], lane[0]], 2.0, bridge);
      carveCorridor(g, G, [[def.x, def.z], lane[lane.length - 1]], 2.0, bridge);
    }
  }
  // 4) edge-entry corridors: true rim point → its entry spawn → nearest lane (reinforcements).
  // Countryside entries sit ON their own arm (zero-length hop); polygon extras get a short trail.
  for (let i = 0; i < rimPts.length; i++) {
    const s = rimPts[i];
    carveCorridor(g, G, [[s.rimX, s.rimZ], [s.x, s.z], nearestOnNetwork(network, s.x, s.z)], 2.0, bridge);
  }
  // 5) chokes. Arena: mirrored jungle crossings between mid and each side lane. Countryside:
  // two seeded arm-to-arm shortcut trails between distinct corridors — varied, never mirrored.
  if (p.laneCount === 1) {
    const nArms = side.length;
    for (let k = 0; k < Math.min(2, nArms - 1); k++) {
      const ai = Math.floor(rng() * nArms);
      let bi = Math.floor(rng() * (nArms - 1)); if (bi >= ai) bi++;
      const a = pointAt(side[ai], 0.3 + rng() * 0.4);
      const b = pointAt(side[bi], 0.3 + rng() * 0.4);
      carveCorridor(g, G, [[a.x, a.z], [b.x, b.z]], 1.6, bridge);
    }
  } else {
    const t1 = 0.30 + rng() * 0.12;
    const mid = declared[0];
    for (const t of [t1, 1 - t1]) {
      const m = pointAt(mid, t);
      for (const other of network) {
        if (other === mid) continue;
        carveCorridor(g, G, [[m.x, m.z], nearestOnNetwork([other], m.x, m.z)], 1.6, bridge);
      }
    }
  }
  // 6) jungle pockets: clearings punched off the lanes (resources) + mid-map dens (camps),
  //    each connected to its lane by a short trail. Resource pockets come in mirrored pairs.
  const resPockets = [], campPockets = [];
  const digPocket = (list, lane, t, dir, dist, mirror) => {
    const a = pointAt(lane, t);
    let px = a.x + -a.dz * dir * dist, pz = a.z + a.dx * dir * dist;
    if (poly) [px, pz] = pull(px, pz);
    px = Math.max(-half + 6, Math.min(half - 6, px)); pz = Math.max(-half + 6, Math.min(half - 6, pz));
    if (Math.hypot(px - atk.x, pz - atk.z) < 50 || Math.hypot(px - def.x, pz - def.z) < 50) return;
    disc(g, G, cellOf(G, px), cellOf(G, pz), 3.4);
    carveCorridor(g, G, [[a.x, a.z], [px, pz]], 1.6, bridge);
    list.push({ x: px, z: pz });
    if (mirror) {                                       // 180°-rotated twin (network is symmetric)
      disc(g, G, cellOf(G, -px), cellOf(G, -pz), 3.4);
      carveCorridor(g, G, [[-a.x, -a.z], [-px, -pz]], 1.6, bridge);
      list.push({ x: -px, z: -pz });
    }
  };
  const wantRes = Math.max(2, p.resourceNodes), wantCamp = Math.max(1, p.mobCamps);
  for (let i = 0; resPockets.length < wantRes && i < wantRes + 4; i++) {
    const lane = network[i % network.length];
    // mirrored twins only on the SYMMETRIC arena layout — the countryside corridors are
    // asymmetric, so a 180°-rotated twin would land in unconnected jungle and get sealed.
    digPocket(resPockets, lane, 0.22 + rng() * 0.3, i % 2 ? 1 : -1, 18 + rng() * 12, p.mirrorFair && !poly && p.laneCount !== 1);
  }
  for (let i = 0; campPockets.length < wantCamp && i < wantCamp + 4; i++) {
    const lane = network[i % network.length];
    digPocket(campPockets, lane, 0.40 + rng() * 0.2, i % 2 ? -1 : 1, 16 + rng() * 10, false);
  }
  return { lanes: declared, resPockets, campPockets };
}

// Seal enclosed open pockets: any walkable cell not 4-connected to the center network becomes
// jungle. Keeps the vector A1 (whose footprints drop interior holes) in parity with the grid and
// guarantees nothing spawns in a sealed bubble. Deterministic flood fill.
function sealDisconnectedPockets(g, G) {
  const open = (i) => g[i] !== T.OOB && !isBlocked(g, i);
  const h = G >> 1;
  let seed = -1;
  outer: for (let r = 0; r < 20; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const x = h + dx, z = h + dz;
    if (inG(G, x, z) && open(gIdx(G, x, z))) { seed = gIdx(G, x, z); break outer; }
  }
  if (seed < 0) return;
  const seen = new Uint8Array(G * G), q = [seed];
  seen[seed] = 1;
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % G, z = (i / G) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!inG(G, nx, nz)) continue;
      const ni = gIdx(G, nx, nz);
      if (!seen[ni] && open(ni)) { seen[ni] = 1; q.push(ni); }
    }
  }
  for (let i = 0; i < G * G; i++) {
    if (!open(i) || seen[i]) continue;
    let fill = T.FOREST;                                 // absorb into the surrounding mass type
    const x = i % G, z = (i / G) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!inG(G, nx, nz)) continue;
      const c = g[gIdx(G, nx, nz)];
      if (c !== T.OOB && isBlocked(g, gIdx(G, nx, nz))) { fill = c; break; }
    }
    g[i] = fill;
  }
}

// destructible HP-gates: place `count` barriers on BREACHABLE wall cells — a blocked cell with
// open ground on BOTH opposite sides (a 1-cell wall a breach would punch through). Opening it
// creates a SHORTCUT; it is never on a lane/route waypoint, so the guaranteed main path (and the
// dumb NPC) is unaffected — barriers are optional tactical shortcuts, not required passages.
// `opens` = the cells that become walkable when hp hits 0 (the sim flips them; the artifact walk
// mask stays blocked). Deterministic: candidates are scanned in grid order and picked via rng.
function placeBarriers(g, G, rng, count, avoid, budgetLevel) {
  if (count <= 0) return [];
  const openAt = (x, z) => x >= 0 && z >= 0 && x < G && z < G && g[gIdx(G, x, z)] !== T.OOB && !isBlocked(g, gIdx(G, x, z));
  const cand = [];
  for (let z = 2; z < G - 2; z++) for (let x = 2; x < G - 2; x++) {
    const i = gIdx(G, x, z);
    if (g[i] === T.OOB || !isBlocked(g, i)) continue;
    const horiz = openAt(x - 1, z) && openAt(x + 1, z);   // wall runs vertically, breach goes E–W
    const vert = openAt(x, z - 1) && openAt(x, z + 1);     // wall runs horizontally, breach goes N–S
    if (horiz || vert) cand.push({ x, z, axis: horiz ? "h" : "v", kind: g[i] });
  }
  // deterministic shuffle, then greedily take spaced-out gates that don't touch a route waypoint
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const used = new Set(avoid), out = [];
  const kindOf = (t) => t === T.FOREST ? "FOREST_WALL" : t === T.ROCK ? "BOULDER_PILE" : t === T.WATER ? "ICE_WALL" : "PORTCULLIS";
  for (const c of cand) {
    if (out.length >= count) break;
    // grow the gate 1 cell each way ALONG the wall (perpendicular to the breach axis)
    const seg = [[c.x, c.z]];
    const [ax, az] = c.axis === "h" ? [0, 1] : [1, 0];     // wall direction
    for (const s of [-1, 1]) { const nx = c.x + ax * s, nz = c.z + az * s; const ni = gIdx(G, nx, nz); if (nx > 0 && nz > 0 && nx < G - 1 && nz < G - 1 && g[ni] !== T.OOB && isBlocked(g, ni)) seg.push([nx, nz]); }
    if (seg.some(([x, z]) => used.has(gIdx(G, x, z)))) continue;         // don't reuse / touch a route cell
    // reject if any gate cell is adjacent to a route waypoint (keep gates off the main path)
    if (seg.some(([x, z]) => avoid.has(gIdx(G, x, z)))) continue;
    seg.forEach(([x, z]) => { for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) used.add(gIdx(G, x + dx, z + dz)); });
    const mx = seg.reduce((s, p) => s + p[0], 0) / seg.length, mz = seg.reduce((s, p) => s + p[1], 0) / seg.length;
    out.push({ id: "gate" + out.length, kind: kindOf(c.kind), axis: c.axis, x: r1(worldOf(G, mx)), z: r1(worldOf(G, mz)),
      hp: 400 + budgetLevel * 150, opens: seg.map(([x, z]) => [r1(worldOf(G, x)), r1(worldOf(G, z))]) });
  }
  return out;
}

// ---- CASTLE LAYOUT (castle-v1 on singles; canon decision 5 — castles are the defended base) ----
// Grows a fortification around the (already relocated) defender base: a rough wobbly WALL ring
// (8–12 anchor segments, ~35–50 u radius, following terrain — anchors on WATER/OOB are clipped
// away, nature defends the gap) with 4 corner TOWERs and 2 opposed GATEs, courtyard cleared OPEN.
// Gates sit where the ring meets the battle approaches (the bearing the attacker/declared lane
// arrives on + the opposite side), snapped to usable ring anchors on carved-walkable ground;
// gate openings are carved courtyard→gate→outside so the courtyard ALWAYS connects out through
// its gates.
// v1 SIMPLIFICATION (documented): WALLs are STRUCTURES, not terrain — they do NOT block the walk
// grid. The ground under the ring is cleared to a thin wall-walk band so every anchor sits on
// walkable cells (CF invariant 3); when walls turn solid in v2 the carved gate openings already
// guarantee courtyard↔outside connectivity.
function castleLayout(g, G, rng, { base, atkPt, poly, half, budgetLevel, bridge }) {
  const cx = base.x, cz = base.z;
  // radii: rough rectangle/oval 35–50 u, capped so the ring stays inside the arena square
  const avail = Math.max(26, half - 6 - Math.max(Math.abs(cx), Math.abs(cz)));
  const Rx = Math.min(35 + rng() * 15, avail), Rz = Math.min(35 + rng() * 15, avail);
  const n = 14 + Math.floor(rng() * 5);                   // 14–18 ring anchors ⇒ 8–12 WALLs after the 2 GATEs + 4 TOWERs
  const rot = rng() * Math.PI * 2;
  const ring = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const w = 1 + (rng() - 0.5) * 0.15;                   // hand-laid wobble, never a circle
    const x = r1(cx + Math.cos(a) * Rx * w), z = r1(cz + Math.sin(a) * Rz * w);
    const ci = gIdx(G, cellOf(G, x), cellOf(G, z));
    const ok = Math.abs(x) < half - 3 && Math.abs(z) < half - 3
      && (!poly || pointInPoly(x, z, poly)) && g[ci] !== T.OOB && g[ci] !== T.WATER;
    ring.push({ x, z, a, ok });
  }
  const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const nearestOk = (want, taken) => {
    let bi = -1, bd = Infinity;
    for (let i = 0; i < n; i++) {
      if (!ring[i].ok || taken.has(i)) continue;
      const d = angDiff(ring[i].a, want);
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  };
  // gates: toward the attacker approach + the opposite side (two opposed doors)
  const aAtk = Math.atan2(atkPt.z - cz, atkPt.x - cx);
  const taken = new Set();
  const gates = [];
  for (const want of [aAtk, aAtk + Math.PI]) {
    const gi = nearestOk(want, taken);
    if (gi >= 0) { taken.add(gi); gates.push(gi); }
  }
  // ground prep: a thin wall-walk band along the ring (anchors stand on walkable ground)
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    if (a.ok && b.ok) carvePath(g, G, [[a.x, a.z], [b.x, b.z]], 1.2, false);
  }
  // courtyard: cleared OPEN (the defended base; the 22 u build-spot ring fits inside)
  disc(g, G, cellOf(G, cx), cellOf(G, cz), Math.max(12, (Math.min(Rx, Rz) - 8) / CELL_M));
  // gate openings: courtyard → gate → ~12 u beyond the wall line
  for (const gi of gates) {
    const gp = ring[gi];
    const m = Math.hypot(gp.x - cx, gp.z - cz) || 1;
    const ox = Math.max(-half + 4, Math.min(half - 4, gp.x + ((gp.x - cx) / m) * 12));
    const oz = Math.max(-half + 4, Math.min(half - 4, gp.z + ((gp.z - cz) / m) * 12));
    carveCorridor(g, G, [[cx, cz], [gp.x, gp.z], [ox, oz]], 2.0, bridge);
  }
  // 4 corner TOWERs at the diagonals between the gates
  for (let k = 0; k < 4; k++) {
    const gi = nearestOk(aAtk + Math.PI / 4 + (k * Math.PI) / 2, taken);
    if (gi >= 0) { taken.add(gi); ring[gi].tower = true; }
  }
  const out = [];
  const gateInfo = [];
  let wallN = 0, gateN = 0, towerN = 0;
  for (let i = 0; i < n; i++) {
    if (!ring[i].ok) continue;
    if (gates.includes(i)) {
      const id = `castle_gate_${gateN++}`;
      gateInfo.push({ at: [ring[i].x, ring[i].z], structureId: id });
      out.push({ anchorId: id, kind: "GATE", side: "DEFENDER", x: ring[i].x, z: ring[i].z, hpMax: 700 + budgetLevel * 150 });
    }
    else if (ring[i].tower) out.push({ anchorId: `castle_tower_${towerN++}`, kind: "TOWER", side: "DEFENDER", x: ring[i].x, z: ring[i].z, hpMax: 1600 + budgetLevel * 250 });
    else out.push({ anchorId: `castle_wall_${wallN++}`, kind: "WALL", side: "DEFENDER", x: ring[i].x, z: ring[i].z, hpMax: 900 + budgetLevel * 150 });
  }
  // CASTLE-ARCHITECTURE-SPEC §5: the geometry block the shared renderer extrudes CONTINUOUS
  // crenellated curtain walls from (the structures above stay the HP/collision truth — every ring
  // vertex maps onto a structure anchor).
  const geom = { pts: ring.filter((p) => p.ok).map((p) => [p.x, p.z]), gates: gateInfo, keepAt: [r1(cx), r1(cz)] };
  return { structures: out, geom };
}

// tier ladder + per-tier build numbers (CASTLE-ARCHITECTURE-SPEC §3: walls climb, keeps crown)
const CASTLE_TIERS = {
  PALACE: { wallH: 11, keepTiers: 3, keepH: 30, moundRaise: 6 },
  CASTLE: { wallH: 9, keepTiers: 2, keepH: 22, moundRaise: 4 },
  KEEP: { wallH: 7, keepTiers: 2, keepH: 16, moundRaise: 3 },
};
// §2 style keys: PALACES carry their zone's named identity; everything else = generic fieldstone
const PALACE_STYLES = { UW2: "drowned_bastion", ENT: "carnavale", EDU: "collegiate", HUB: "vermilion", BUS: "hanseatic" };

// Generator version — BUMP whenever generation output meaningfully changes (palette rules, terrain
// passes, water, structures…). Stamped into meta; registry.ensureDesign auto-reseeds stale SEED_V0
// rows (pure seed maps, no owner work) so cached registries self-heal on next view — no manual bust.
// v2 = zone-coherent biomeFamily palettes (2026-07-14). v3 = v2 re-stamped after the box dataRoot
// fix. v4 = geometry-based mode support (SIEGE/GUARD from geometry; occupant content overlays at
// battle time). v5 = castleGeom block (rings/keep/mound/styleKey — CASTLE-ARCHITECTURE-SPEC §5).
export const GEN_VERSION = 5;

export function generate(parcel, params = null, designVersion = 0) {
  const { parcelId, biome = "", zone = "" } = parcel;
  const seed = seedFor(parcelId, biome, zone);
  const budget = budgetFor(parcel.investLevel ?? 0);   // investment tier = hard content budget
  const p = params ? clampParams(params, budget) : paramsFromSeed(seed, parcelId, budget);
  // biome is authoritative for the ground COLOUR: override the seeded/region palette so the terrain
  // renders as its declared biome (desert = sandy, not green). An explicit params.palette wins.
  // Palette VARIANT is rolled per REGION, not per parcel: with a real bbox the region is a spatial
  // bucket (~6 zone-units), so adjacent parcels share the same biome-family variant and the aerial
  // mosaic reads as one coherent landscape (CONTINUOUS-WORLD-TERRAIN.md §6); without a bbox it
  // falls back to the per-parcel seed (unchanged legacy behavior).
  const palSeed = Array.isArray(parcel.bbox)
    ? fnv1a(`pal:${zone}:${Math.floor((parcel.bbox[0] + parcel.bbox[2]) / 12)}:${Math.floor((parcel.bbox[1] + parcel.bbox[3]) / 12)}`)
    : seed;
  // zone-family fallback: no declared per-parcel biome ⇒ the ZONE's biomeFamily bounds the roll
  // (worldfield.zoneBiomeFamily; kept OUT of seedFor so layouts don't re-roll — palette only).
  const bp = biomePalette(biome || parcel.biomeFamily || "", palSeed);
  if (bp && !(params && params.palette)) p.palette = bp;
  const sizeM = parcel.sizeM || 322;   // CANON (2026-07-08): fixed ±161 world-unit frame, every parcel/battle
  const G = Math.round(sizeM / CELL_M);
  const rng = makeRng(seed ^ fnv1a("v" + designVersion));    // each version rolls fresh, still deterministic
  const g = new Uint8Array(G * G);                            // T.OPEN

  // 1) archetype paints the DENSE jungle base coat; then the parcel's REAL polygon (when known)
  //    cuts the arena — OOB overwrites whatever the archetype painted outside the parcel.
  const { features } = archetypes[p.archetype](g, G, rng, p);
  // 1b) detail features (LLM placement DSL) layer over the base coat — then the polygon cut
  //     runs LAST so no feature can paint outside the parcel.
  const placed = (p.features && p.features.length)
    ? executeFeatures(g, G, rng, p.features, sizeM)
    : { landmarkAt: null, resources: [], mobs: [], towers: [] };
  const poly = (Array.isArray(parcel.polygon) && parcel.polygon.length >= 3) ? normPoly(parcel.polygon, sizeM) : null;
  if (poly) stampOOB(g, G, poly);
  // 1c) CONTINUOUS WORLD TERRAIN: when the zone has an authored macro field, the parcel is a
  //     WINDOW into it — ridges/rivers/roads clipped to this parcel arrive pre-transformed into
  //     the SAME arena fit as the polygon (worldfield.js), so adjacent parcels agree at their
  //     shared boundary by construction. Painted over the archetype coat, under the carve stage.
  let wf = parcel.worldField;
  if (wf === undefined && Array.isArray(parcel.bbox) && zone) {
    const field = loadWorldField(zone);
    wf = field ? featuresForParcel(field, { bbox: parcel.bbox, polygon: parcel.polygon, sizeM, parcelId }) : null;
  }
  if (wf && !(wf.rivers?.length || wf.roads?.length || wf.ridges?.length || wf.castles?.length || wf.overlayElements?.length)) wf = null;
  if (wf) paintWorldFeatures(g, G, wf);
  // 1d) BRIDGE context: snapshot every WATER cell at carve time (world rivers + archetype pools
  //     alike) — carveCorridor uses it to consolidate crossings and paint road–bridge–road
  //     approaches. The registry is seeded with the WORLD-ROAD bridges (cells the road pass
  //     painted ROAD with river water beside them) so corridors reuse the real bridge instead
  //     of fording 10 u upstream.
  const bridge = { water: new Uint8Array(G * G), reg: [] };
  let hasWater = false;
  for (let i = 0; i < g.length; i++) if (g[i] === T.WATER) { bridge.water[i] = 1; hasWater = true; }
  if (!hasWater) bridge.water = null;
  if (wf && hasWater) {
    for (const rd of wf.roads || []) {
      for (const [x, z] of densify(rd.pts, CELL_M * 2)) {
        const cx = cellOf(G, x), cz = cellOf(G, z);
        if (Math.abs(x) > sizeM / 2 || Math.abs(z) > sizeM / 2) continue;
        if (g[gIdx(G, cx, cz)] !== T.ROAD) continue;
        let nearWater = false;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]])
          if (inG(G, cx + dx, cz + dz) && bridge.water[gIdx(G, cx + dx, cz + dz)]) { nearWater = true; break; }
        if (nearWater && !bridge.reg.some((c) => Math.hypot(c[0] - x, c[1] - z) < BRIDGE_APPR_U))
          bridge.reg.push([x, z]);
      }
    }
  }
  const spot = features[0] || { cx: G >> 1, cz: (G >> 1) + Math.round((rng() - 0.5) * G * 0.3) };
  const landmark = p.landmark !== "NONE"
    ? (placed.landmarkAt
        ? { kind: p.landmark, x: r1(placed.landmarkAt.x), z: r1(placed.landmarkAt.z), r: 6 }
        : { kind: p.landmark, x: r1(worldOf(G, spot.cx)), z: r1(worldOf(G, spot.cz)), r: 6 })
    : null;

  // 2) anchors/spawns — golden-reference frame: ATTACKER base at the SW of the parcel, DEFENDER
  //    at the NE (the reference's atk_S/def_N diagonal at ±118); reinforcement entries at every
  //    real edge midpoint. Square = fixed reference points; polygon = boundary extremes pulled
  //    inward so they land inside the parcel.
  const half = sizeM / 2;
  const SPAWN_F = 0.733;               // 118 / 161 — the reference base spawn radius
  const A = (dx, dz, t, fx, fz) => poly ? (({ x, z }) => ({ x: r1(x), z: r1(z) }))(polyAnchor(poly, dx, dz, t)) : { x: fx, z: fz };
  const base = A(1, 1, 0.24, r1(half * SPAWN_F), r1(half * SPAWN_F));       // DEFENDER, NE
  const atk = A(-1, -1, 0.15, r1(-half * SPAWN_F), r1(-half * SPAWN_F));    // ATTACKER, SW
  // CASTLE (canon decision 5, castle-v1 on singles): a world fortification POI on this parcel
  // makes the defender base THE castle — def_base relocates INTO the courtyard and the WALL/
  // GATE/TOWER ring grows around it after the carve stage (castleLayout below).
  const castle = wf?.castles?.length
    ? wf.castles.reduce((b, c) => (Math.hypot(c.at[0], c.at[1]) < Math.hypot(b.at[0], b.at[1]) ? c : b), wf.castles[0])
    : null;
  if (castle) {
    const lim = half - 40;                        // keep the courtyard well inside the arena
    let cxw = Math.max(-lim, Math.min(lim, castle.at[0]));
    let czw = Math.max(-lim, Math.min(lim, castle.at[1]));
    if (poly && !pointInPoly(cxw, czw, poly)) {   // pull toward the polygon centroid until inside
      let pcx = 0, pcz = 0;
      for (const [x, z] of poly) { pcx += x; pcz += z; }
      pcx /= poly.length; pcz /= poly.length;
      for (let t = 1; t <= 10 && !pointInPoly(cxw, czw, poly); t++) {
        cxw = castle.at[0] + (pcx - castle.at[0]) * (t / 10);
        czw = castle.at[1] + (pcz - castle.at[1]) * (t / 10);
      }
    }
    base.x = r1(cxw); base.z = r1(czw);
  }
  // per-edge entries: on the overworld an army always crosses in at the MIDPOINT of the specific
  // parcel edge it approaches from — so we emit one arrival point per REAL edge (4 for a square,
  // N for an N-gon), pulled slightly inward so it lands inside the parcel. The FIRM connectivity
  // rule buckets every rim cell into a quadrant that reaches center, so every edge midpoint is a
  // guaranteed-valid start — CLASH/GUARD use whichever edges the current battle's armies arrive on.
  const boundary = poly || [[-half, -half], [half, -half], [half, half], [-half, half]];
  const ccx = boundary.reduce((s, v) => s + v[0], 0) / boundary.length;
  const ccz = boundary.reduce((s, v) => s + v[1], 0) / boundary.length;
  // CONTINUITY CONTRACT: where a world ROAD (preferred) or RIVER crosses a boundary edge, the
  // arrival entry for that edge sits ON the crossing — both neighbours clip the same zone
  // polyline, so the two parcels' entries meet at the identical world point (a cross-parcel road
  // IS the march route). Ridges never move entries (a ridge crossing is a wall, not a door).
  const xingByEdge = new Map();
  if (wf) for (const c of wf.edgeCrossings || []) {
    if (c.kind === "ridge" || !Number.isInteger(c.edgeIndex)) continue;
    const prev = xingByEdge.get(c.edgeIndex);
    if (!prev || (prev.kind !== "road" && c.kind === "road")) xingByEdge.set(c.edgeIndex, c);
  }
  const rimPts = [];
  const edgeEntries = boundary.map((v, i) => {
    const w = boundary[(i + 1) % boundary.length];
    const xing = xingByEdge.get(i);
    const rimX = xing ? xing.at[0] : (v[0] + w[0]) / 2,                     // world-feature crossing, else
          rimZ = xing ? xing.at[1] : (v[1] + w[1]) / 2;                     // the true boundary midpoint
    const mx = rimX + (ccx - rimX) * 0.14, mz = rimZ + (ccz - rimZ) * 0.14; // pulled inward off the rim
    const bx = mx - ccx, bz = mz - ccz;
    const edge = Math.abs(bz) >= Math.abs(bx) ? (bz >= 0 ? "N" : "S") : (bx >= 0 ? "E" : "W");
    rimPts.push({ rimX, rimZ, x: r1(mx), z: r1(mz) });
    return { id: "entry_e" + i, side: "ANY", edge, canBase: true, x: r1(mx), z: r1(mz) };
  });
  const spawnZones = [
    { id: "atk_S", side: "ATTACKER", edge: "S", x: atk.x, z: atk.z },   // DUEL attacker (SW)
    { id: "def_base", side: "DEFENDER", edge: "N", x: base.x, z: base.z }, // DUEL/SIEGE defender (NE)
    ...edgeEntries,                                                      // one arrival point per edge midpoint
    { id: "center", side: "OBJECTIVE", edge: "C", x: 0, z: 0 },          // SIEGE/GUARD/DOMINION hold-point
  ];
  let buildSpots = [];
  for (let i = 0; i < 6; i++) {                               // ring of anchors around the defender CC
    const a = (i / 6) * Math.PI * 2;
    buildSpots.push({ anchorId: "bs_ring" + i, x: r1(base.x + Math.cos(a) * 22), z: r1(base.z + Math.sin(a) * 22), size: 6 });
  }
  // 3) carve the MOBA lane network out of the jungle (lanes/entries/chokes/clearings/pockets),
  //    then seal any leftover enclosed bubbles so the map is one connected battlefield.
  const net = carveMobaNetwork(g, G, rng, p, { atk, def: base, poly, half, spawnZones, rimPts, bridge });
  // forward build spot on the defender half of the DECLARED lane — placed via arc length so it
  // sits ON carved ground for both layouts (the web's declared lane no longer runs the diagonal)
  const bm = pointAt(net.lanes[0], 0.7);
  buildSpots.push({ anchorId: "bs_mid", x: r1(bm.x), z: r1(bm.z), size: 6 });
  // 3b) world roads JOIN the carved lane network: a short connector trail from each road's
  //     in-parcel midpoint to the nearest declared lane, so the cross-parcel highway and the
  //     MOBA network are one connected walkable graph (and the seal pass below never eats a road).
  if (wf) for (const rd of wf.roads || []) {
    const inside = rd.pts.filter(([x, z]) => Math.abs(x) < half && Math.abs(z) < half && (!poly || pointInPoly(x, z, poly)));
    if (!inside.length) continue;
    const a = inside[inside.length >> 1];
    carveCorridor(g, G, [a, nearestOnNetwork(net.lanes, a[0], a[1])], 2.0, bridge);
  }
  // 3c) CASTLE LAYOUT: grow the WALL/GATE/TOWER ring around the relocated defender base (the
  //     castle IS the defended base). Runs after the carve so the courtyard/gates stay open.
  const castleParts = castle
    ? castleLayout(g, G, rng, { base, atkPt: atk, poly, half, budgetLevel: budget.level, bridge })
    : null;
  const castleStructures = castleParts ? castleParts.structures : [];
  sealDisconnectedPockets(g, G);

  // resource nodes: exactly p.resourceNodes (budget-capped). Explicit resourceAt placements
  // consume the budget first; mirrored jungle-pocket pairs (off the lanes) fill the rest.
  const resources = [];
  for (const r of placed.resources) {
    if (resources.length >= p.resourceNodes) break;
    resources.push({ kind: r.kind, x: r1(r.x), z: r1(r.z), richness: r1(Math.min(0.3 + rng() * p.resourceRichness, budget.maxRichness)) });
  }
  for (let i = 0; resources.length < p.resourceNodes && i < net.resPockets.length; i += 2) {
    const kind = (i >> 1) % 2 ? "WOOD_GROVE" : "GOLD_MINE";
    const richness = r1(Math.min(0.3 + rng() * p.resourceRichness, budget.maxRichness));
    resources.push({ kind, x: r1(net.resPockets[i].x), z: r1(net.resPockets[i].z), richness });
    if (resources.length < p.resourceNodes && net.resPockets[i + 1])
      resources.push({ kind, x: r1(net.resPockets[i + 1].x), z: r1(net.resPockets[i + 1].z), richness });
  }
  for (let i = 0; resources.length < p.resourceNodes && i < 16; i++) {   // fallback: along the mid lane
    const a = pointAt(net.lanes[0], 0.25 + rng() * 0.5);
    resources.push({ kind: i % 2 ? "WOOD_GROVE" : "GOLD_MINE", x: r1(a.x), z: r1(a.z),
      richness: r1(Math.min(0.3 + rng() * p.resourceRichness, budget.maxRichness)) });
  }

  // 4) lanes are the carved golden-reference polylines (mid diagonal + edge lanes) — the grid
  //    was carved along EXACTLY these waypoint segments, so they are walkable by construction.
  const laneStarts = net.lanes.map((l) => l[0]);

  // 5) validate + repair (edge corridors, base clearing, safety net) then snap points to open
  const v = validateAndRepair(g, G, base, laneStarts);
  snapOpen(resources, v.eroded, G); buildSpots = snapOpenOrDrop(buildSpots, v.eroded, G); snapOpen(spawnZones, v.eroded, G);
  const lanes = net.lanes.map((wp) => wp.map(([x, z]) => [r1(x), r1(z)]));
  // per-edge NPC routes: entry→center chain for every arrival edge (multi-sided modes). lanes[]
  // stays the DUEL attacker→base push; routes[] is what a unit arriving from an arbitrary edge
  // follows so the dumb lane-AI has a guaranteed path from any side to the central objective.
  const routes = routesToCenter(g, G, spawnZones.filter((s) => s.side === "ANY" || s.side === "ATTACKER"));

  // 5a) destructible HP-gates (investment content): seal shortcuts/pockets, never the main path.
  // Build the avoid-set = every lane + route waypoint cell so no gate lands on a guaranteed path.
  const avoid = new Set();
  for (const wp of [...lanes, ...routes.map((r) => r.wp)]) for (const [x, z] of wp) avoid.add(gIdx(G, cellOf(G, x), cellOf(G, z)));
  const barriers = placeBarriers(g, G, rng, p.barriers, avoid, budget.level);

  // 5b) landowner defenses (investment content): wild monster camps in the jungle dens +
  // land-owned towers spaced along the lanes on the DEFENDER half (reference tower chain).
  // Game-time assembly instantiates the actual units/structures; these are data anchors.
  const MOBKINDS = ["WOLF", "BANDIT", "TROLL", "GOLEM", "HARPY", "WYRM"];
  const mobs = [];
  for (const m of placed.mobs) {
    if (mobs.length >= p.mobCamps) break;
    mobs.push({ id: "mob" + mobs.length, kind: MOBKINDS[Math.floor(rng() * MOBKINDS.length)],
      x: r1(m.x), z: r1(m.z), count: 4 + budget.level + Math.floor(rng() * 3) });
  }
  for (let i = mobs.length; i < p.mobCamps; i++) {
    const pk = net.campPockets[i];
    if (pk) {
      mobs.push({ id: "mob" + mobs.length, kind: MOBKINDS[Math.floor(rng() * MOBKINDS.length)],
        x: r1(pk.x), z: r1(pk.z), count: 4 + budget.level + Math.floor(rng() * 3) });
    } else {
      const a = rng() * Math.PI * 2, rad = (0.15 + rng() * 0.3) * half;
      mobs.push({ id: "mob" + mobs.length, kind: MOBKINDS[Math.floor(rng() * MOBKINDS.length)],
        x: r1(Math.cos(a) * rad), z: r1(Math.sin(a) * rad), count: 4 + budget.level + Math.floor(rng() * 3) });
    }
  }
  snapOpen(mobs, v.eroded, G);
  // named "structures" to match the allocate contract verbatim (side DEFENDER; live hp is
  // filled in from the battle context at match time — Layer 2). Slots walk the lanes at
  // defender-half arc fractions like the reference's tower chain (distinct spots per lane).
  const structures = [];
  for (const t of placed.towers) {
    if (structures.length >= p.towers) break;
    structures.push({ anchorId: "tw" + structures.length, kind: "TOWER", side: "DEFENDER",
      x: r1(t.x), z: r1(t.z), hpMax: 1600 + budget.level * 250 });
  }
  const towerTs = [0.70, 0.84, 0.58, 0.92, 0.64, 0.78];
  for (let i = structures.length, slot = 0; i < p.towers; i++, slot++) {
    const lane = net.lanes[slot % net.lanes.length];
    const a = pointAt(lane, towerTs[(Math.floor(slot / net.lanes.length) + (slot % net.lanes.length)) % towerTs.length]);
    structures.push({ anchorId: "tw" + structures.length, kind: "TOWER", side: "DEFENDER",
      x: r1(a.x), z: r1(a.z), hpMax: 1600 + budget.level * 250 });
  }
  snapOpen(structures, v.eroded, G);
  // castle anchors join AFTER snapOpen — they already stand on the cleared wall-walk band and
  // snapping would bend the ring out of shape.
  structures.push(...castleStructures);

  // 5c) RUIN — the seeded Chronicle layer (own rng stream — see placeRuin; décor only, so the
  //     grid/walk mask and every invariant are untouched). Avoid points come from the FINAL
  //     (snapped) spawn zones so placement is recoverable from the artifact alone: wide berth
  //     around the duel bases, a smaller one around every entry + the center objective.
  const ruin = placeRuin(g, G, {
    seed, zone, castle: !!castle,
    avoidPts: spawnZones.map((s) => ({ x: s.x, z: s.z, d: s.side === "ATTACKER" || s.side === "DEFENDER" ? 45 : 18 })),
  });

  // 5d) WORLD-ELEMENTS OVERLAY décor: lore elements another team authored onto this ground
  //     (Hunt quest sites, NPC spots, camps, dungeon doors…) become RUIN-class passive décor
  //     anchors — rng-free, grid untouched, so a zone with no overlay files is a byte-identical
  //     no-op (see placeOverlayDecor above + docs/briefs/WORLD-ELEMENTS-OVERLAY.md).
  const overlay = wf?.overlayElements?.length
    ? placeOverlayDecor(g, G, wf.overlayElements)
    : { decor: [], dropped: [] };

  // 6) bake: props from final grid; walkability bitmask (1 = open at native cell res)
  const props = sampleProps(g, G, rng);
  if (ruin) props.unshift(ruin);
  if (landmark) props.unshift(landmark);
  if (overlay.decor.length) props.unshift(...overlay.decor);
  const walk = new Uint8Array(G * G);
  for (let i = 0; i < g.length; i++) walk[i] = isBlocked(g, i) ? 0 : 1;

  return {
    arena: poly
      ? { shape: "polygon", sizeM, bounds: poly }
      : { shape: "square", sizeM, bounds: [[-half, -half], [half, -half], [half, half], [-half, half]] },
    laneCount: p.laneCount,
    terrain: { cellM: CELL_M, w: G, h: G, cells: b64(g), walk: b64(walk) },
    obstacles: props,
    resources, buildSpots, spawnZones, lanes, routes, barriers, mobs, structures,
    meta: { seed, designVersion, genVersion: GEN_VERSION, parcelId, biome, zone, params: p, repairs: v.repairs,
            budget: { level: budget.level, name: budget.name },
            ...(castle ? { castle: { id: castle.id, kind: castle.kind, name: castle.name } } : {}),
            ...(castleParts ? (() => {
              // CASTLE-ARCHITECTURE-SPEC §5 — the geometry the shared renderer builds real
              // fortresses from: continuous wall ring(s), the keep, the ELEVATION mound (owner
              // 2026-07-17: "even with extra elevation, up a hill for the most epic"), style key.
              const tier = CASTLE_TIERS[castle.kind] ? castle.kind : "KEEP";
              const T2 = CASTLE_TIERS[tier];
              const styleKey = tier === "PALACE" ? (PALACE_STYLES[zone] || "fieldstone") : "fieldstone";
              return { castleGeom: {
                tier, styleKey,
                rings: [{ pts: castleParts.geom.pts, h: T2.wallH, gates: castleParts.geom.gates }],
                keep: { at: castleParts.geom.keepAt, tiers: T2.keepTiers, h: T2.keepH },
                mound: { steps: [{ ring: 0, raise: T2.moundRaise }] },
                moat: styleKey === "drowned_bastion",
              } };
            })() : {}),
            ...(overlay.decor.length || overlay.dropped.length
              ? { overlay: { placed: overlay.decor.length, ...(overlay.dropped.length ? { dropped: overlay.dropped } : {}) } }
              : {}) },
  };
}
