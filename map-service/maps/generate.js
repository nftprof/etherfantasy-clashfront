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
import { groundReachability } from "./traverse.js";
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
function castleLayout(g, G, rng, { base, atkPt, poly, half, budgetLevel, bridge, ringN = 1, ringGap = 0 }) {
  let cx = base.x, cz = base.z;
  // polygon depth at a point (an inscribed-radius upper bound); −1 when outside the polygon
  const depth = (x, z) => {
    if (!poly || poly.length < 3) return Infinity;
    if (!pointInPoly(x, z, poly)) return -1;
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const A = poly[i], B = poly[(i + 1) % poly.length];
      const abx = B[0] - A[0], abz = B[1] - A[1], L2 = abx * abx + abz * abz || 1;
      const t = Math.max(0, Math.min(1, ((x - A[0]) * abx + (z - A[1]) * abz) / L2));
      best = Math.min(best, Math.hypot(x - (A[0] + abx * t), z - (A[1] + abz * t)));
    }
    return best;
  };
  // RE-CENTER (owner 2026-07-29 — the Vault-Palace ESTATE map crushed its 3-ring palace to r≈20
  // with deep dents because the declared castle point hugs the polygon edge): when the center is
  // too shallow to hold the tier's rings, slide the castle to the DEEPEST nearby interior point
  // (deterministic ring search, pure geometry — no rng call-order change). The defender base
  // follows its courtyard: generate() re-anchors base + def_base from geom.keepAt afterwards.
  {
    const need = 30 + (ringN - 1) * 11;              // comfortable footprint radius for the tier
    let bd = depth(cx, cz);
    if (bd < need) {
      let bx2 = cx, bz2 = cz;
      for (let rr = 8; rr <= 72; rr += 8) for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        if (Math.abs(x) > half - 10 || Math.abs(z) > half - 10) continue;
        const d = depth(x, z);
        if (d > bd + 0.5) { bd = d; bx2 = x; bz2 = z; }
      }
      cx = r1(bx2); cz = r1(bz2);
    }
  }
  // radii: rough rectangle/oval, capped so the ring stays inside the arena square. Multi-ring
  // tiers need a BIGGER footprint so each nested ward clears the next by a full stair flight +
  // buffer — and (owner 2026-07-21) a PALACE leaves TOWN-SIZED baileys between rings. needR =
  // keep footprint + (ringN-1)·ringGap + margin.
  const availSq = Math.max(26, half - 6 - Math.max(Math.abs(cx), Math.abs(cz)));
  // POLYGON-AWARE CAP (owner 2026-07-27, Vault-Palace screenshot): the ring must fit inside the
  // PARCEL FOOTPRINT, not just the arena square — beyond the inscribed radius the pointInPoly cull
  // degenerated rings to arena-long triangles. Wobble headroom w≤1.075 + wall margin; multi-ring
  // wards COMPRESS via concentricRings — rank stays readable as ring COUNT, never overflow.
  const availPg = (poly && poly.length >= 3) ? depth(cx, cz) / 1.08 - 3 : Infinity;
  const avail = Math.max(26, Math.min(availSq, availPg));
  const needR = RING_INNER_R + (ringN - 1) * ringGap + 6;   // outer radius fits the walkable core + all wards
  const Rbase = Math.max(35 + rng() * 15, needR);
  const Rx = Math.min(Rbase, avail), Rz = Math.min(Rbase * (0.9 + rng() * 0.18), avail);
  const n = 14 + Math.floor(rng() * 5);                   // 14–18 ring anchors ⇒ 6–12 WALLs after the 2–4 GATEs + 4 TOWERs
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
  // ENCLOSED CIRCUITS (owner 2026-07-27: "most keeps should be enclosed" + the never-again rule):
  // an anchor that fails the bounds/polygon/terrain test is pulled RADIALLY INWARD until it lands
  // on valid ground — never silently culled. Culling is exactly what degenerated the Vault-Palace
  // ring to a 3-anchor triangle: dropped anchors opened the circuit and left arena-long wall runs.
  // With the pull, the wall circuit ALWAYS closes; the ring just dents inward around bad ground.
  for (const p of ring) {
    if (p.ok) continue;
    const m = Math.hypot(p.x - cx, p.z - cz) || 1;
    const vx = (p.x - cx) / m, vz = (p.z - cz) / m;
    for (let r = m - 2; r >= 18; r -= 2) {
      const x = r1(cx + vx * r), z = r1(cz + vz * r);
      const ci = gIdx(G, cellOf(G, x), cellOf(G, z));
      if (Math.abs(x) < half - 3 && Math.abs(z) < half - 3
        && (!poly || pointInPoly(x, z, poly)) && g[ci] !== T.OOB && g[ci] !== T.WATER) {
        p.x = x; p.z = z; p.ok = true; break;
      }
    }
    // LAST RESORT (water-heavy parcels, e.g. a 39%-marsh keep): a wall may STAND IN WATER — real
    // castles do — and a closed circuit beats terrain purity. Accept the nearest in-polygon point
    // even on WATER (only OOB stays forbidden).
    if (!p.ok) for (let r = m; r >= 2; r -= 1.5) {    // even a deep dent near the keep beats an open circuit
      const x = r1(cx + vx * r), z = r1(cz + vz * r);
      const ci = gIdx(G, cellOf(G, x), cellOf(G, z));
      if (Math.abs(x) < half - 3 && Math.abs(z) < half - 3
        && (!poly || pointInPoly(x, z, poly)) && g[ci] !== T.OOB) {
        p.x = x; p.z = z; p.ok = true; break;
      }
    }
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
  // TREES OUT OF THE CASTLE (owner 2026-08-01, estate 1071728 — a tree blocking a gate arch):
  // the whole walled interior is lived-in ground. Clear every FOREST/ROCK cell inside the outer
  // ring polygon to OPEN — no props bake there (sampleProps reads the grid) and the walk grid
  // opens with it. Pure grid writes, no rng — call order untouched.
  {
    const ringPoly = ring.filter((p) => p.ok).map((p) => [p.x, p.z]);
    if (ringPoly.length >= 3) {
      for (let zc = 0; zc < G; zc++) for (let xc = 0; xc < G; xc++) {
        const i = gIdx(G, xc, zc);
        if (g[i] !== T.FOREST && g[i] !== T.ROCK) continue;
        if (pointInPoly(worldOf(G, xc), worldOf(G, zc), ringPoly)) g[i] = T.OPEN;
      }
    }
  }
  // EFFECTIVE RING COUNT (v19 owner 2026-08-01, Jinjiang Citadel: "either needs to be 1 ring wall
  // or something entirely wrong — too compact"): full-width wards or FEWER rings, never a crushed
  // nest. The footprint this ring actually achieved (avg radius after all caps/pulls) affords
  // floor((R0 − keepFoot)/12) wards of honest 12u width; the tier's ringN is a CEILING, not a
  // mandate. Supersedes the v15 "rank = ring count" reading — the owner ruled compactness worse.
  const okAn = ring.filter((p) => p.ok);
  // ROAD DOORS (v19 owner 2026-08-01, Vermilion Palace: "a castle where a road leads to the wall
  // must have an opening = a door where the road comes — apply to all castles"): walk the whole
  // wall polyline at ~1u steps; group CONSECUTIVE road-hit samples into RUNS (an oblique road
  // cutting the wall at a shallow angle is ONE crossing, never a stitch-line of many); the anchor
  // nearest each run's midpoint MOVES onto the road and becomes a GATE — the door stands exactly
  // where the road pierces the wall. World roads + lanes are painted before the castle grows, and
  // the castle's own carves never lay ROAD on land, so this reads the true road network.
  const taken = new Set();
  const gates = [];
  {
    const samples = [];
    for (let q = 0; q < okAn.length; q++) {
      const A = okAn[q], B = okAn[(q + 1) % okAn.length];
      const L = Math.hypot(B.x - A.x, B.z - A.z), steps = Math.max(1, Math.round(L));
      for (let k = 0; k < steps; k++)
        samples.push([A.x + (B.x - A.x) * (k / steps), A.z + (B.z - A.z) * (k / steps)]);
    }
    const hit = samples.map(([x, z]) => g[gIdx(G, cellOf(G, x), cellOf(G, z))] === T.ROAD);
    const runs = [];
    let cur = null, gapRun = 0;
    for (let i = 0; i < samples.length; i++) {
      if (hit[i]) { if (!cur) cur = [i, i]; else cur[1] = i; gapRun = 0; }
      else if (cur && ++gapRun > 6) { runs.push(cur); cur = null; }
    }
    if (cur) runs.push(cur);
    if (runs.length >= 2 && runs[0][0] === 0 && runs[runs.length - 1][1] === samples.length - 1) {
      const last = runs.pop();                          // the polyline is closed — merge the wrap
      runs[0] = [last[0] - samples.length, runs[0][1]];
    }
    for (const [s0, s1] of runs.slice(0, 5)) {          // hard cap — a wall is not a sieve
      const mi = ((Math.round((s0 + s1) / 2) % samples.length) + samples.length) % samples.length;
      const mid = samples[mi];
      // GATE SPACING (v20, Grand Exchange "outer wall entirely broken"): doors ≥20u apart — two
      // openings closer than that erase the whole wall stretch between their gatehouses.
      if (gates.some((g3) => Math.hypot(ring[g3].x - mid[0], ring[g3].z - mid[1]) < 20)) continue;
      let bi = -1, bd2 = Infinity;
      for (let i = 0; i < n; i++) {
        if (!ring[i].ok || taken.has(i)) continue;
        const d = Math.hypot(ring[i].x - mid[0], ring[i].z - mid[1]);
        if (d < bd2) { bd2 = d; bi = i; }
      }
      if (bi >= 0 && bd2 < 30) {
        ring[bi].x = r1(mid[0]); ring[bi].z = r1(mid[1]);   // the door stands ON the road
        taken.add(bi); gates.push(bi);
      }
    }
  }
  // EFFECTIVE RING COUNT + KEEP-RATIO (after the road-door anchor moves — R0est reads the FINAL
  // ring, so the affordability math and the sweep test always agree).
  const R0est = okAn.reduce((s, p) => s + Math.hypot(p.x - cx, p.z - cz), 0) / (okAn.length || 1);
  const nEff = Math.max(1, Math.min(ringN, Math.floor((R0est - RING_KEEP_FOOT) / 12) + 1));
  // KEEP-RATIO SIZING LAW (owner 2026-08-01): the outer wall's circumference stays ≥2–3× the
  // keep's (PALACE 2×+, target 3×; CASTLE 1.5×+, target 2×). Roomy land already exceeds this by
  // construction (palaces span most of the parcel — intended, "you feel like you are right at the
  // gate"); on cramped footprints the KEEP SHRINKS to hold the ratio (radius ∝ circumference;
  // keep visual radius ≈ 0.72 × its base width).
  const keepMinRatio = ringN >= 3 ? 2 : ringN === 2 ? 1.5 : 1.2;
  const keepW = r1(Math.min(16, Math.max(8, (R0est / keepMinRatio) / 0.72)));
  const aAtk = Math.atan2(atkPt.z - cz, atkPt.x - cx);
  // GATE COUNT LADDER (owner 2026-08-01, parcel 21010920077 "no outside castle wall gate"): the
  // OUTERMOST wall carries nEff+1 doors (KEEP 2 / CASTLE 3 / PALACE 4) — road doors count toward
  // the ladder; the spread fills from the attacker approach.
  const gateWant = Math.min(4, nEff + 1);
  for (let k = 0; k < gateWant && gates.length < gateWant; k++) {
    const want = aAtk + (k * Math.PI * 2) / gateWant;
    let bi = -1, bd3 = Infinity;
    for (let i = 0; i < n; i++) {
      if (!ring[i].ok || taken.has(i)) continue;
      // v20 gate spacing: never open a door within 20u of another (the wall between vanishes)
      if (gates.some((g3) => Math.hypot(ring[g3].x - ring[i].x, ring[g3].z - ring[i].z) < 20)) continue;
      const d = angDiff(ring[i].a, want);
      if (d < bd3) { bd3 = d; bi = i; }
    }
    if (bi >= 0) { taken.add(bi); gates.push(bi); }
  }
  // ground prep: a thin wall-walk band along the ring (anchors stand on walkable ground)
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    if (a.ok && b.ok) carvePath(g, G, [[a.x, a.z], [b.x, b.z]], 1.2, false);
  }
  // courtyard: cleared OPEN (the defended base; the 22 u build-spot ring fits inside)
  disc(g, G, cellOf(G, cx), cellOf(G, cz), Math.max(12, (Math.min(Rx, Rz) - 8) / CELL_M));
  // gate openings: courtyard → gate → ~12 u beyond the wall line. The apron disc keeps every
  // arch clear of tree canopy from OUTSIDE the wall too (owner 2026-08-01 — the corridor alone
  // was narrower than a mature TREE prop's radius, so a cell just off the path could still
  // barge the doorway).
  for (const gi of gates) {
    const gp = ring[gi];
    const m = Math.hypot(gp.x - cx, gp.z - cz) || 1;
    const ox = Math.max(-half + 4, Math.min(half - 4, gp.x + ((gp.x - cx) / m) * 12));
    const oz = Math.max(-half + 4, Math.min(half - 4, gp.z + ((gp.z - cz) / m) * 12));
    carveCorridor(g, G, [[cx, cz], [gp.x, gp.z], [ox, oz]], 2.0, bridge);
    disc(g, G, cellOf(G, gp.x), cellOf(G, gp.z), 7, false);
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
      out.push({ anchorId: id, kind: "GATE", side: "DEFENDER", material: "WOOD", states: ["CLOSED", "OPEN", "BROKEN"], x: ring[i].x, z: ring[i].z, hpMax: 700 + budgetLevel * 150 });
    }
    else if (ring[i].tower) out.push({ anchorId: `castle_tower_${towerN++}`, kind: "TOWER", side: "DEFENDER", x: ring[i].x, z: ring[i].z, hpMax: 1600 + budgetLevel * 250 });
    else out.push({ anchorId: `castle_wall_${wallN++}`, kind: "WALL", side: "DEFENDER", x: ring[i].x, z: ring[i].z, hpMax: 900 + budgetLevel * 150 });
  }
  // CASTLE-ARCHITECTURE-SPEC §5: the geometry block the shared renderer extrudes CONTINUOUS
  // crenellated curtain walls from (the structures above stay the HP/collision truth — every ring
  // vertex maps onto a structure anchor).
  const geom = { pts: ring.filter((p) => p.ok).map((p) => [p.x, p.z]), gates: gateInfo, keepAt: [r1(cx), r1(cz)],
    towers: ring.filter((p) => p.ok && p.tower).map((p) => [p.x, p.z]),   // stair tops steer clear of these (v18)
    ringNEff: nEff, keepW };                                              // v19: honest ring count + ratio-law keep size
  return { structures: out, geom };
}

// STAIR ACCESS POINTS AS DATA (MOBA contract fix 2, 2026-07-21; v18 owner 2026-08-01: "we only
// spec two types of stairs — perpendicular to the inner wall onto the wall's top surface, or
// along the inner side of the wall ending at a part of the wall or a tower you can walk into"):
// the sim needs the legal ground↔parapet transition points and the visual kit must not derive
// placement independently — this is the ONE source both consume, and since v18 renderers draw
// these flights VERBATIM (no renderer-side stair derivation at all — the drift class is gone).
// PARALLEL hugs a straight wall stretch at least one flight long; else PERPENDICULAR descends
// the wall's inner normal into the ward. foot = ground entry, top = parapet landing (flush).
// towers[] = anchor points a top may NOT land within 5u of (a drum/corner tower would swallow
// the landing); runCap bounds the perpendicular run so an inner-ward flight never crosses the
// NEXT ring's wall line (callers pass the ward's actual clearance).
function computeStairs(pts, gates, base, towers = [], runCap = Infinity, ground = null) {
  const STEPS = 7, TREAD = 1.6, ALONG = 13.5, FLIGHT = STEPS * TREAD + 0.6;
  // v20 (traverse audit finding, Bastion of Dominus): a flight's FOOT must stand on WALKABLE
  // ground — geometry guards alone let a stair descend into moat marsh. ground = {g, G} of the
  // final grid; 1-cell tolerance (the foot may kiss a blocked cell's edge).
  const footOnGround = (s) => {
    if (!ground) return true;
    const { g, G } = ground;
    const cx2 = cellOf(G, s.foot[0]), cz2 = cellOf(G, s.foot[1]);
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx2 + dx, nz = cz2 + dz;
      if (inG(G, nx, nz) && !isBlocked(g, gIdx(G, nx, nz))) return true;
    }
    return false;
  };
  const cx = base.x, cz = base.z, out = [], fb = new Map();   // fb = per-gate safe perpendicular fallback
  const rAvg = pts.reduce((s, q) => s + Math.hypot(q[0] - cx, q[1] - cz), 0) / (pts.length || 1);
  // ---- guards (defined up front — the tight-ward parallel search below validates with them) ----
  const segD = (px, pz, ax, az, bx2, bz2) => {
    const abx = bx2 - ax, abz = bz2 - az, L2 = abx * abx + abz * abz || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / L2));
    return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
  };
  // R-ST1 — NO STAIR↔WALL INTERSECTION (owner 2026-07-27): the centerline keeps clearance from
  // EVERY wall segment — only the TOP-TREAD contact zone (the last ~4.5u, where the stair lands
  // flush on the wall-walk platform) may approach the wall. Foot must stand INSIDE the ward.
  const clearOfWalls = (s) => {
    const [fx, fz] = s.foot, [tx, tz] = s.top, L = Math.hypot(tx - fx, tz - fz) || 1;
    if (!pointInPoly(fx, fz, pts)) return false;
    for (let d = 0; d <= L - 4.5; d += 1.2) {
      const px2 = fx + ((tx - fx) / L) * d, pz2 = fz + ((tz - fz) / L) * d;
      for (let i = 0; i < pts.length; i++) {
        const A = pts[i], B = pts[(i + 1) % pts.length];
        if (segD(px2, pz2, A[0], A[1], B[0], B[1]) < 3.3) return false;   // wall half 2.1 + stair half 1.7 − wobble tolerance
      }
    }
    return true;
  };
  // v18: a top inside a drum/corner tower footprint isn't walkable-onto — ≥5u from tower anchors.
  const clearOfTowers = (s) => towers.every((t) => Math.hypot(s.top[0] - t[0], s.top[1] - t[1]) >= 5);
  // TIGHT WARD ⇒ PARALLEL PATTERN (v19 owner 2026-08-01: "where the distance is too close use the
  // other pattern of stairs, parallel to the walls, from ground to the wall height"): when the
  // ward can't hold a full-tread perpendicular run, a compressed steep flight jamming the bailey
  // is the WRONG answer — hug the wall instead. This permissive parallel search accepts ANY
  // straight-enough wall stretch near the gate (not just one collinear with the gate wall),
  // compresses the run down to 0.62× a full flight if the segment is short, and validates with
  // the full guard set before accepting.
  const tight = runCap < STEPS * TREAD;
  const mkPar2 = (gi, gx, gzp, side, used) => {
    const cand = [];
    for (let i = 0; i < pts.length; i++) {
      const A = pts[i], B = pts[(i + 1) % pts.length];
      const sdx = B[0] - A[0], sdz = B[1] - A[1], sL = Math.hypot(sdx, sdz);
      if (sL < FLIGHT * 0.62 + 2.4) continue;
      const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2;
      cand.push({ i, A, dx2: sdx / sL, dz2: sdz / sL, sL, d: Math.hypot(mx - gx, mz - gzp) });
    }
    cand.sort((q, w) => q.d - w.d);
    for (const c of cand) {
      if (used.has(c.i)) continue;
      const run = Math.min(FLIGHT, c.sL - 2.4);
      for (const dir of side > 0 ? [1, -1] : [-1, 1]) {
        const a0 = dir > 0 ? 1.2 : c.sL - 1.2, a1 = a0 + dir * run;
        let nx = -c.dz2, nz = c.dx2;
        const smx = c.A[0] + c.dx2 * (a0 + a1) / 2, smz = c.A[1] + c.dz2 * (a0 + a1) / 2;
        if (nx * (cx - smx) + nz * (cz - smz) < 0) { nx = -nx; nz = -nz; }
        const off = 2.1 + 1.7 - 0.35;   // v20: stair EMBEDS 0.35u into the wall face — touching, walkable-onto (owner 2026-08-01)
        const s = { gate: gi, side, mode: "PARALLEL",
          foot: [r1(c.A[0] + c.dx2 * a0 + nx * off), r1(c.A[1] + c.dz2 * a0 + nz * off)],
          top: [r1(c.A[0] + c.dx2 * a1 + nx * off), r1(c.A[1] + c.dz2 * a1 + nz * off)] };
        if (clearOfWalls(s) && clearOfTowers(s) && footOnGround(s)) { used.add(c.i); return s; }
      }
    }
    return null;
  };
  for (let gi = 0; gi < gates.length; gi++) {
    const ga = gates[gi].at || gates[gi], gx = ga[0], gzp = ga[1];
    let bx = 1, bz = 0, bd = Infinity;                 // local wall tangent at this gate
    for (let i = 0; i < pts.length; i++) {
      const A = pts[i], B = pts[(i + 1) % pts.length];
      const d2 = Math.hypot((A[0] + B[0]) / 2 - gx, (A[1] + B[1]) / 2 - gzp);
      if (d2 < bd) { bd = d2; bx = B[0] - A[0]; bz = B[1] - A[1]; }
    }
    const bL = Math.hypot(bx, bz) || 1, wdx = bx / bL, wdz = bz / bL;
    let ux = -wdz, uz = wdx;                          // inner normal (toward the courtyard)
    if (ux * (cx - gx) + uz * (cz - gzp) < 0) { ux = -ux; uz = -uz; }
    const usedSeg = new Set();                        // one tight-ward parallel per wall stretch per gate
    for (const side of [1, -1]) {
      // the inward PERPENDICULAR is always constructible and safe by design (it runs along the inner
      // normal, away from the wall body; only its TOP TREAD meets the wall face) — build it as the
      // per-gate fallback even when a parallel fit is chosen (R-ST1 guard below may reject fits).
      const mkPerp = () => {
        // ANCHOR TO THE REAL WALL (R-ST2): walk ALONG from the gate, then PROJECT onto the nearest
        // actual wall segment and build the flight down THAT segment's inner normal. The old
        // gate-tangent offset walked off the wall face on curved rings (tops landed 3–13u off the
        // platform); projecting guarantees the top tread sits flush on the wall-walk.
        const px0 = gx + wdx * side * ALONG, pz0 = gzp + wdz * side * ALONG;
        let best = null, bd2 = Infinity;
        for (let i = 0; i < pts.length; i++) {
          const A = pts[i], B = pts[(i + 1) % pts.length];
          const abx = B[0] - A[0], abz = B[1] - A[1], L2 = abx * abx + abz * abz || 1;
          const t = Math.max(0, Math.min(1, ((px0 - A[0]) * abx + (pz0 - A[1]) * abz) / L2));
          const qx = A[0] + abx * t, qz = A[1] + abz * t, d = Math.hypot(px0 - qx, pz0 - qz);
          if (d < bd2) { bd2 = d; best = { qx, qz, abx, abz, L: Math.sqrt(L2) || 1 }; }
        }
        let nx2 = -best.abz / best.L, nz2 = best.abx / best.L;      // inner normal of the REAL segment
        if (nx2 * (cx - best.qx) + nz2 * (cz - best.qz) < 0) { nx2 = -nx2; nz2 = -nz2; }
        const maxRun = Math.max(3.5, Math.min(rAvg * 1.7 - 2.7, runCap)), tread2 = Math.min(TREAD, maxRun / STEPS);
        return { gate: gi, side, mode: "PERPENDICULAR",
          foot: [r1(best.qx + nx2 * (2.7 + (STEPS - 1) * tread2)), r1(best.qz + nz2 * (2.7 + (STEPS - 1) * tread2))],
          top: [r1(best.qx + nx2 * 2.7), r1(best.qz + nz2 * 2.7)] };
      };
      if (side === 1) fb.set(gi, mkPerp());
      let par = null;                                  // parallel-fit scan (same rule as the kit)
      for (let i = 0; i < pts.length && !par; i++) {
        const A = pts[i], B = pts[(i + 1) % pts.length];
        const sdx = B[0] - A[0], sdz = B[1] - A[1], sL = Math.hypot(sdx, sdz);
        if (sL < FLIGHT) continue;
        const dx2 = sdx / sL, dz2 = sdz / sL;
        if (Math.abs(dx2 * wdx + dz2 * wdz) < 0.92) continue;
        const t0 = (gx - A[0]) * dx2 + (gzp - A[1]) * dz2;
        const dirS = Math.sign(dx2 * wdx + dz2 * wdz) * side;
        const a0 = t0 + dirS * ALONG, a1 = t0 + dirS * (ALONG + FLIGHT);
        if (Math.min(a0, a1) >= 1.2 && Math.max(a0, a1) <= sL - 1.2) par = { A, dx2, dz2, a0, a1 };
      }
      if (par) {
        let nx = -par.dz2, nz = par.dx2;
        // INNER side judged from the FLIGHT'S OWN midpoint (owner 2026-07-28, Grand Academy: "stairs
        // outside going nowhere") — the matched segment may sit far from the gate, and judging
        // "inner" from the gate could flip the offset to the OUTSIDE of the wall there.
        const smx = par.A[0] + par.dx2 * (par.a0 + par.a1) / 2, smz = par.A[1] + par.dz2 * (par.a0 + par.a1) / 2;
        if (nx * (cx - smx) + nz * (cz - smz) < 0) { nx = -nx; nz = -nz; }
        const off = 2.1 + 1.7 - 0.35;   // v20: stair EMBEDS 0.35u into the wall face — touching, walkable-onto (owner 2026-08-01)
        out.push({ gate: gi, side, mode: "PARALLEL",
          foot: [r1(par.A[0] + par.dx2 * par.a0 + nx * off), r1(par.A[1] + par.dz2 * par.a0 + nz * off)],
          top: [r1(par.A[0] + par.dx2 * par.a1 + nx * off), r1(par.A[1] + par.dz2 * par.a1 + nz * off)] });
      } else if (tight) {
        // too close between walls for a comfortable inward run — the wall-hugging parallel is the
        // owner-spec'd pattern here; the compressed perpendicular only if no stretch validates.
        const s2 = mkPar2(gi, gx, gzp, side, usedSeg);
        out.push(s2 || mkPerp());
      } else out.push(mkPerp());
    }
  }
  // Violators of the guard set drop; a gate that loses both sides walks a FALLBACK CHAIN, every
  // link guard-checked: its safe perpendicular (run compressed until the foot stands in-ward) →
  // a permissive wall-hugging parallel → STAIRLESS (the ring's other gates keep the parapet
  // reachable — a stair jammed into a wall is never emitted). Only a ring that would end up with
  // ZERO stairs accepts its least-bad fallback (reachability beats purity, and only then).
  const kept = out.filter((s) => clearOfWalls(s) && clearOfTowers(s) && footOnGround(s));
  for (let gi = 0; gi < gates.length; gi++) {
    if (kept.some((s) => s.gate === gi)) continue;
    const ga = gates[gi].at || gates[gi];
    const s = fb.get(gi);
    if (s && !pointInPoly(s.foot[0], s.foot[1], pts)) {
      // a deeply dented ward can leave even the safe fallback's foot outside the polygon —
      // compress the run toward the wall until the foot stands inside (R-ST3).
      const dx = s.foot[0] - s.top[0], dz = s.foot[1] - s.top[1];
      for (const f of [0.75, 0.55, 0.4, 0.28]) {
        const fx = r1(s.top[0] + dx * f), fz = r1(s.top[1] + dz * f);
        if (pointInPoly(fx, fz, pts)) { s.foot = [fx, fz]; break; }
      }
    }
    if (s && clearOfWalls(s) && clearOfTowers(s) && footOnGround(s)) { kept.push(s); continue; }
    const p2 = mkPar2(gi, ga[0], ga[1], 1, new Set());
    if (p2) kept.push(p2);
  }
  if (!kept.length && fb.size) kept.push(fb.values().next().value);
  return kept;
}

// tier ladder + per-tier build numbers (CASTLE-ARCHITECTURE-SPEC §3: walls climb, keeps crown)
// CONCENTRIC LADDER (owner 2026-07-21: "the biggest castle should have 2 or 3 rings with further
// elevation at each level"). ringN = nested wall rings; each inner ward climbs (defense in depth
// reads from the air — CASTLE-ARCHITECTURE-SPEC §1). KEEP = motte (1 ring); CASTLE = concentric
// (2); PALACE = the climbing silhouette (3).
// wardGap = target clearance between nested wards (owner 2026-07-21: enough for a stair flight +
// buffer, and a PALACE leaves a TOWN-SIZED bailey — "literally having a town inside the wall is
// fine"). RING_KEEP_FOOT = the innermost ward must clear the keep.
const RING_KEEP_FOOT = 14;
// innermost ward = the good WALKABLE "original tower" size; extra rings grow OUTWARD from it
// (owner 2026-07-21: "our original basic tower is good … make new rings OUTSIDE of that size").
const RING_INNER_R = 36;
export const CASTLE_TIERS = {          // exported for the castle-geometry sweep test (ring ladder = data)
  // FLAT ON THE LAND (owner 2026-07-27: "castles do NOT need to be on an elevation — flat on the
  // existing land"): no moundRaise — the fortress sits on the existing terrain; height reads from
  // wall/keep geometry alone, and siege elevation comes ONLY from the WALL_WALK tier (never a motte).
  PALACE: { wallH: 11, keepTiers: 3, keepH: 30, ringN: 3, wardGap: 48 },
  CASTLE: { wallH: 9, keepTiers: 2, keepH: 22, ringN: 2, wardGap: 26 },
  KEEP: { wallH: 7, keepTiers: 2, keepH: 16, ringN: 1, wardGap: 0 },
};

// Build the nested rings from the single outer ring the layout grew. Deterministic (pure geometry
// of geom + T2), so the siege block and castleGeom call it and always agree. Each inner ring is
// the outer ring scaled toward the keep, with a taller wall, a climbing ward floor (`lift`), and
// ONE staggered gate (no straight run to the keep). Returns rings[] + mound steps[].
function concentricRings(geom, T2, poly, ground = null) {
  // v19 (owner 2026-08-01, Jinjiang Citadel "either 1 ring wall or too compact"): the ring count
  // ADAPTS to the honest footprint — castleLayout computed how many full-width 12u wards this
  // castle's achieved radius affords (geom.ringNEff); the tier's ringN is the ceiling. A cramped
  // citadel builds ONE grand wall, never a crushed nest. Supersedes the v15 "rank = ring count".
  const N = Math.max(1, Math.min(T2.ringN || 1, geom.ringNEff || (T2.ringN || 1)));
  const kx = geom.keepAt[0], kz = geom.keepAt[1], outer = geom.pts;
  // The INNERMOST ward is pinned to a WALKABLE base radius (RING_INNER_R — the good "original
  // tower" size); additional rings grow OUTWARD from it (owner 2026-07-21). So the core is never a
  // tiny unwalkable circle, and every bailey gets a full gap for its stairs.
  let R0 = 0;
  for (const [x, z] of outer) R0 += Math.hypot(x - kx, z - kz);
  R0 /= Math.max(1, outer.length);                                 // outer ring AVG radius
  // walkable innermost ward. v19 ward TARGET = 16u (owner 2026-08-01, parcel 20716710172 "okay
  // but not greatest — a bit wider"): where the radius affords it, each bailey aims for 16u of
  // ring-to-ring room; the keep-foot floor keeps the core walkable on small castles.
  const Rin = Math.max(RING_KEEP_FOOT, Math.min(R0 * 0.85, RING_INNER_R, R0 - 16));
  const gap = N > 1 ? (R0 - Rin) / (N - 1) : 0;                    // uniform outward spacing (target)
  // PER-ANCHOR ward spacing (owner 2026-07-28, Grand Exchange: "some parts merged — no gap between
  // walls"): inner rings were UNIFORM scaled copies, so wherever the outer ring is locally dented or
  // small the ward collapsed below one wall thickness. Build each inner ring from the PREVIOUS ring
  // per anchor: follow the uniform target where roomy, but never closer than wardMin centerline-to-
  // centerline, floored at the keep footprint. HARD ward minimum = 12u (owner 2026-08-01: "the
  // distance between walls should be at least 1 stair's width + some margin") = 4.2u wall
  // thickness + 3.4u stair width + ~4.4u margin. Since v19 the ring COUNT adapts (above) instead
  // of the width scaling down — 12 is absolute.
  const wardMin = 12;
  const ptsArr = [outer];
  for (let ri = 1; ri < N; ri++) {
    const sRatio = (R0 - ri * gap) / ((R0 - (ri - 1) * gap) || 1);
    ptsArr.push(ptsArr[ri - 1].map(([x, z]) => {
      const dx = x - kx, dz = z - kz, r = Math.hypot(dx, dz) || 1;
      let rNew = Math.max(RING_KEEP_FOOT, Math.min(r * sRatio, r - wardMin));
      // the parcel polygon is not star-shaped around the keep — a radial step inward can EXIT
      // through a notch; keep pulling inward until the anchor is back inside.
      if (poly && poly.length >= 3)                       // may dent BELOW the keep-foot floor: an
        while (rNew > 2 && !pointInPoly(kx + (dx / r) * rNew, kz + (dz / r) * rNew, poly)) rNew -= 1.5;   // in-parcel dent beats an out-of-parcel wall
      return [r1(kx + (dx / r) * rNew), r1(kz + (dz / r) * rNew)];
    }));
  }
  // SEGMENT-LEVEL clearance pass (owner 2026-07-29: "minimal distance between walls still an issue
  // on some maps"): the per-anchor radial rule bounds anchor↔anchor spacing, but after dents and
  // polygon pulls an inner-ring SEGMENT can still cut close to the outer ring at a DIFFERENT angle.
  // Push every inner anchor further inward until it clears the outer ring's whole POLYLINE by
  // wardMin (processed outer→inner so each consecutive pair settles).
  const segDist = (px, pz, ringPts) => {
    let best = Infinity;
    for (let i = 0; i < ringPts.length; i++) {
      const A = ringPts[i], B = ringPts[(i + 1) % ringPts.length];
      const abx = B[0] - A[0], abz = B[1] - A[1], L2 = abx * abx + abz * abz || 1;
      const t = Math.max(0, Math.min(1, ((px - A[0]) * abx + (pz - A[1]) * abz) / L2));
      best = Math.min(best, Math.hypot(px - (A[0] + abx * t), pz - (A[1] + abz * t)));
    }
    return best;
  };
  for (let ri = 1; ri < N; ri++) {
    for (const p of ptsArr[ri]) {
      for (let it = 0; it < 24; it++) {
        const d = segDist(p[0], p[1], ptsArr[ri - 1]);
        if (d >= wardMin - 0.01) break;
        const dx = p[0] - kx, dz = p[1] - kz, r = Math.hypot(dx, dz) || 1;
        let rNew = r - Math.max(1, wardMin - d + 0.4);
        // v18 (Vault-Palace): the wardMin push never crushes a ward below the keep footprint —
        // an innermost ring collapsed to an unwalkable blob is worse than a locally tight ward.
        // Only the POLYGON pull below may dent deeper (an in-parcel dent beats an OOB wall).
        if (rNew < RING_KEEP_FOOT) rNew = RING_KEEP_FOOT;
        if (rNew >= r - 0.01) break;
        if (poly && poly.length >= 3)
          while (rNew > 2 && !pointInPoly(kx + (dx / r) * rNew, kz + (dz / r) * rNew, poly)) rNew -= 1.5;
        if (rNew < 2) break;
        p[0] = r1(kx + (dx / r) * rNew); p[1] = r1(kz + (dz / r) * rNew);
      }
    }
  }
  const rings = [];
  for (let ri = 0; ri < N; ri++) {
    const targetR = R0 - ri * gap;                                 // ri=0 outer … ri=N-1 = Rin (walkable)
    const pts = ptsArr[ri];
    // OWNER 2026-07-21 simplification: NO ward elevation/ramps (lift=0 — flat interior). A 2-ring
    // CASTLE is just a bigger outer circle, SAME wall height, no new mechanism. A 3-ring PALACE
    // makes ONLY the FINAL (innermost) wall taller. v18 (owner 2026-08-01): the SPIRAL stair is
    // RETIRED — only the two spec'd stair types exist, so the tall final wall is climbed by the
    // same standard flights (renderers just draw more/steeper treads from the same data).
    const isFinalTall = (N >= 3 && ri === N - 1);
    const h = isFinalTall ? T2.wallH + 7 : T2.wallH;
    const gapIn = r1(ri < N - 1
      ? Math.min(...pts.map(([x, z], j) => { const q = ptsArr[ri + 1][j]; return Math.hypot(x - q[0], z - q[1]); }))
      : targetR - RING_KEEP_FOOT);                                 // ACTUAL min clearance to the next ward
    let gates;
    if (ri === 0) gates = geom.gates;                              // outer doors come from castleLayout (ringN+1 of them)
    else {
      // GATE COUNT LADDER, inner wards (owner 2026-08-01): each ward inward carries one door
      // fewer than the one outside it, floored at 2 (PALACE 4/3/2, CASTLE 3/2) — evenly spread
      // from a staggered base angle so there is never a straight run to the keep.
      const g0 = geom.gates[0] ? (geom.gates[0].at || geom.gates[0]) : [kx, kz + 1];
      const baseA = Math.atan2(g0[1] - kz, g0[0] - kx) + ri * 2.2;  // stagger each ward's doors
      const count = Math.min(pts.length, Math.max(2, Math.min(4, N + 1 - ri)));
      const chosen = new Set();
      gates = [];
      for (let k2 = 0; k2 < count; k2++) {
        const wantA = baseA + (k2 * Math.PI * 2) / count;
        let best = -1, bd = Infinity;
        for (let pi = 0; pi < pts.length; pi++) {
          if (chosen.has(pi)) continue;
          const a = Math.atan2(pts[pi][1] - kz, pts[pi][0] - kx);
          const d = Math.abs(Math.atan2(Math.sin(a - wantA), Math.cos(a - wantA)));
          if (d < bd) { bd = d; best = pi; }
        }
        if (best >= 0) { chosen.add(best); gates.push({ at: pts[best] }); }
      }
    }
    // PER-RING STAIRS AS DATA (v18): every ring computes its own flights with the full guard set
    // (wall clearance, in-ward foot, tower-top avoidance, run capped to the ward's ACTUAL
    // clearance so a flight never crosses the next wall line). Renderers draw these verbatim.
    const stairs = computeStairs(pts, gates, { x: kx, z: kz },
      ri === 0 ? (geom.towers || []) : [], Math.max(4.5, gapIn - 3), ground);
    rings.push({ pts, h, gates, lift: 0, tier: ri, gapIn, stairs });
  }
  // STAIR FOOT REACHABILITY PRUNE (v20, traverse-audit finding on the Bastion of Dominus): a
  // geometrically valid flight can still descend into a bailey pocket sealed off by walls + moat
  // marsh. BFS from the courtyard over the walls-solid/arches-open model (the SAME stamping the
  // audit uses) and drop unreachable-footed flights — unless that would leave a ring stairless
  // (then they stay, and the audit paints them red for the designer to see).
  if (ground) {
    const reach = groundReachability(ground.g, ground.G, rings, [kx, kz]);
    for (const r of rings) {
      const kept2 = (r.stairs || []).filter((s) => reach(s.foot[0], s.foot[1]));
      if (kept2.length) r.stairs = kept2;
    }
  }
  // NO MOUND AT ALL (owner 2026-07-27, supersedes the earlier outer-motte ruling): the castle sits
  // FLAT on the existing land. moundSteps stays in the schema (renderers read steps[0].raise ?? 0,
  // so an empty array renders flat with no code change) but is always empty now.
  return { rings, moundSteps: [] };
}
// §2 style keys: PALACES carry their zone's named identity; everything else = generic fieldstone
const PALACE_STYLES = { UW2: "drowned_bastion", ENT: "carnavale", EDU: "collegiate", HUB: "vermilion", BUS: "hanseatic" };

// Generator version — BUMP whenever generation output meaningfully changes (palette rules, terrain
// passes, water, structures…). Stamped into meta; registry.ensureDesign auto-reseeds stale SEED_V0
// rows (pure seed maps, no owner work) so cached registries self-heal on next view — no manual bust.
// v2 = zone-coherent biomeFamily palettes (2026-07-14). v3 = v2 re-stamped after the box dataRoot
// fix. v4 = geometry-based mode support (SIEGE/GUARD from geometry; occupant content overlays at
// battle time). v5 = castleGeom block (rings/keep/mound/styleKey — CASTLE-ARCHITECTURE-SPEC §5).
// v6 = tower↔wall clearance on castle parcels. v7 = wall-conflicting towers relocate OUTWARD only
// (courtyard = keep/CC + player builds; baked defaults = field pickets). v8 = standard top-level
// `siege` block (tiers on ALL high ground, wallRing/gates/stairs-as-data/drawbridge on fortresses)
// + designVersion made mandatory — MOBA contract fixes 1–4, 2026-07-21. v9 = CONCENTRIC castle
// rings: CASTLE 2 / PALACE 3 nested wards, each climbing (lift). v10 = tier-scaled ward GAPS
// (palace = town-sized bailey) + guaranteed min clearance (gapIn) so stairs never touch the next
// wall + switchback stairs on tall walls — owner 2026-07-21. v11/v12 = flat interior + outward-grown
// rings (owner sign-off). v13 = GATE structures + siege.gates/drawbridge carry material:"WOOD" +
// states:["CLOSED","OPEN","BROKEN"] (renderer swaps the door leaf by runtime HP/toggle) so renderers
// draw a distinct, stateful wooden gate (not a stone segment) — owner 2026-07-25. v14 = drop baked
// build pads that sit on/hug the castle (wall ring / tower / gate / keep) — no-overlap building,
// owner 2026-07-25. v15 (owner 2026-07-27, the Vault-Palace screenshot + castle rules pass) =
// (a) ring radius capped by the PARCEL POLYGON's inscribed radius (not just the arena square) —
// beyond it the pointInPoly cull degenerated the ring to a 3-anchor triangle; wards compress, ring
// COUNT stays; (b) ENCLOSED CIRCUITS — invalid ring anchors pull radially INWARD instead of being
// culled, so the wall circuit always closes; (c) FLAT castles — no mound/motte at all (moundSteps
// always [], siege MOUND tier gone; elevation = WALL_WALK only); (d) stair↔wall NO-INTERSECTION
// guard — stairs verified clear of every wall segment except the top-tread platform contact, with
// a safe perpendicular fallback per gate. See docs/maps/CASTLE-STAIRS-AND-WALLS-SPEC.md.
// v16 (owner 2026-07-28 castle tour): (a) PER-ANCHOR ward spacing — inner rings derive from the
// previous ring per anchor with WARD_MIN 10u centerline clearance (uniform scaling merged walls at
// dented spots); gapIn = the ACTUAL min ward clearance; (b) parallel stairs judge their inner side
// from the flight's own midpoint (a far segment judged from the gate could land the stair OUTSIDE)
// and every stair foot must be inside its ward polygon. v17 = SEGMENT-LEVEL ward clearance — every
// inner-ring anchor is pushed until it clears the outer ring's whole polyline by WARD_MIN (the
// per-anchor radial rule alone still let dented segments graze at other angles) — owner 2026-07-29.
// v18 (owner 2026-08-01 castle tour round 2): (a) STAIRS AS DATA PER RING — every ring carries its
// own computeStairs flights (wall clearance + in-ward foot + tower-top avoidance + run capped to
// the ward's actual clearance) and renderers draw them VERBATIM (renderer-side stair derivation
// retired — the drift class is gone); only the two spec'd stair types exist, the SPIRAL is
// RETIRED; (b) ward min 10→12 — full 12u, scaling down to 8.5u only where the footprint cannot afford it ("at least 1 stair width + margin" between walls); (c) GATE COUNT
// LADDER — outer wall ringN+1 doors (KEEP 2 / CASTLE 3 / PALACE 4), each ward inward one fewer,
// floored at 2; (d) TREES OUT OF THE CASTLE — FOREST/ROCK cells inside the outer ring clear to
// OPEN and every gate gets a 14u apron disc (no canopy barging a door arch).
// v19 (owner 2026-08-01 castle tour round 3): (a) ADAPTIVE RING COUNT — the tier's ringN is a
// CEILING; the achieved outer radius affords floor((R0−keepFoot)/12)+1 honest 12u wards and a
// cramped citadel builds ONE grand wall, never a crushed nest ("either 1 ring wall or too
// compact"; supersedes v15 rank=ring-count and retires the v18 8.5u ward scale-down — 12u is
// absolute, target 16u where roomy); (b) TIGHT WARD ⇒ PARALLEL stairs — where a full-tread
// perpendicular can't fit the bailey, a wall-hugging parallel flight (permissive search, full
// guard set) replaces the steep compressed run; (c) ROAD DOORS — every road crossing the wall
// line claims a gate there (cap 5); (d) KEEP-RATIO LAW — outer wall circumference ≥2–3× keep
// (PALACE) / 1.5–2× (CASTLE); cramped castles shrink the keep (castleGeom.keep.w) to hold it;
// (e) renderer: estate maps mask OOB to the parcel silhouette (the "square maps" fix).
// v20 (owner 2026-08-01 castle tour round 4): (a) GATE SPACING — doors never open within 20u of
// each other (road doors + ladder + post-repair passes all guard it; adjacent doors on the Grand
// Exchange erased 20–35u wall stretches between their gatehouses) + the renderer clips walls
// PER-SAMPLE (a segment near two gates keeps its middle — nothing vanishes wholesale);
// (b) STAIRS TOUCH THE WALL — parallel flights embed 0.35u into the wall face (off 3.45) and the
// kit extends the drawn flight 1u past the data top so the last tread lands flush INTO the wall;
// (c) the estate silhouette mask is a translucent DIMMING VEIL (terrain reads through) instead of
// a black void; (d) NEW traverse-audit endpoint + designer overlay (headless walk sims: ground +
// gate arches + stairs→wall-walk, green/red trails) for visual pathability audits.
export const GEN_VERSION = 20;

export function generate(parcel, params = null, designVersion = 0) {
  // designVersion is MANDATORY in every artifact (MOBA contract fix 3: it pins caches, replays,
  // and the live render.json at 10K scale — never null/undefined downstream).
  designVersion = Number.isInteger(designVersion) ? designVersion : 0;
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
  const _ctier = castle ? (CASTLE_TIERS[castle.kind] || CASTLE_TIERS.KEEP) : null;
  const castleParts = castle
    ? castleLayout(g, G, rng, { base, atkPt: atk, poly, half, budgetLevel: budget.level, bridge,
                                ringN: _ctier.ringN, ringGap: _ctier.wardGap })
    : null;
  const castleStructures = castleParts ? castleParts.structures : [];
  // the castle may have RE-CENTERED to deeper ground (castleLayout depth search) — the defender
  // base + its spawn belong in the courtyard, so they follow the keep.
  if (castleParts && castleParts.geom && castleParts.geom.keepAt) {
    const [ncx, ncz] = castleParts.geom.keepAt;
    if (Math.hypot(ncx - base.x, ncz - base.z) > 0.5) {
      base.x = ncx; base.z = ncz;
      const db = spawnZones.find((s) => s.id === "def_base");
      if (db) { db.x = ncx; db.z = ncz; }
    }
  }
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
  // 5b) POST-REPAIR ROAD DOORS (v19): the repair pass may carve NEW road corridors/causeways that
  // cross the castle wall (castleLayout only saw the pre-repair network). Re-scan the final grid
  // for road runs through the wall polyline; any run without a door converts the nearest WALL
  // anchor into a GATE moved onto the road — the owner rule ("a road that leads to the wall must
  // have an opening") holds against every road source, repairs included.
  if (castleParts && castleParts.geom && castleParts.geom.pts.length >= 3) {
    const geo = castleParts.geom, structures2 = castleParts.structures;
    const samples = [];
    for (let q = 0; q < geo.pts.length; q++) {
      const A = geo.pts[q], B = geo.pts[(q + 1) % geo.pts.length];
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]), steps = Math.max(1, Math.round(L));
      for (let k = 0; k < steps; k++)
        samples.push([A[0] + (B[0] - A[0]) * (k / steps), A[1] + (B[1] - A[1]) * (k / steps)]);
    }
    const hit = samples.map(([x, z]) => g[gIdx(G, cellOf(G, x), cellOf(G, z))] === T.ROAD);
    const runs = [];
    let cur = null, gapRun = 0;
    for (let i = 0; i < samples.length; i++) {
      if (hit[i]) { if (!cur) cur = [i, i]; else cur[1] = i; gapRun = 0; }
      else if (cur && ++gapRun > 6) { runs.push(cur); cur = null; }
    }
    if (cur) runs.push(cur);
    if (runs.length >= 2 && runs[0][0] === 0 && runs[runs.length - 1][1] === samples.length - 1) {
      const last = runs.pop();
      runs[0] = [last[0] - samples.length, runs[0][1]];
    }
    for (const [s0, s1] of runs) {
      if ((geo.gates || []).length >= 5) break;                       // same hard cap as castleLayout
      const mi = ((Math.round((s0 + s1) / 2) % samples.length) + samples.length) % samples.length;
      const mid = samples[mi];
      if ((geo.gates || []).some((g2) => { const at = g2.at || g2; return Math.hypot(at[0] - mid[0], at[1] - mid[1]) <= 20; })) continue;   // v20 gate spacing
      // nearest WALL structure (never a tower/gate) converts to a door ON the road
      let bi = -1, bd2 = Infinity;
      for (let i = 0; i < structures2.length; i++) {
        const s2 = structures2[i];
        if (s2.kind !== "WALL") continue;
        const d = Math.hypot(s2.x - mid[0], s2.z - mid[1]);
        if (d < bd2) { bd2 = d; bi = i; }
      }
      if (bi < 0 || bd2 >= 30) continue;
      const s2 = structures2[bi];
      const pi = geo.pts.findIndex((p2) => p2[0] === s2.x && p2[1] === s2.z);
      const gid = `castle_gate_${(geo.gates || []).length}r`;        // r-suffix: repair-road door
      const nx2 = r1(mid[0]), nz2 = r1(mid[1]);
      if (pi >= 0) { geo.pts[pi][0] = nx2; geo.pts[pi][1] = nz2; }
      structures2[bi] = { anchorId: gid, kind: "GATE", side: "DEFENDER", material: "WOOD",
        states: ["CLOSED", "OPEN", "BROKEN"], x: nx2, z: nz2, hpMax: s2.hpMax };
      geo.gates.push({ at: [nx2, nz2], structureId: gid });
      disc(g, G, cellOf(G, nx2), cellOf(G, nz2), 7, false);          // apron — the arch stays clear
    }
  }
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
  // MIN TOWER↔WALL CLEARANCE (owner 2026-07-21: "a tower is stuck in the wall — set minimal
  // distance of tower to wall based on size of wall so it doesn't conflict with stairs and wall;
  // mid-castle is fine"). Free defense towers keep ≥ ~2× the wall thickness off the ring
  // centerline (the stairs also live in that band) and stay out of the gate-stair aprons.
  // Relocation is RADIAL from the courtyard center: inside → inward, outside → outward.
  if (castleParts) {
    const ringPts = castleParts.geom.pts, gates = castleParts.geom.gates || [];
    const WALL_T = 4.2, MIND = WALL_T * 2.1, GATE_APRON = 16;
    const rAvg2 = ringPts.reduce((s2, q) => s2 + Math.hypot(q[0] - base.x, q[1] - base.z), 0) / (ringPts.length || 1);
    const distRing = (x, z) => {
      let d = Infinity;
      for (let i = 0; i < ringPts.length; i++) {
        const A = ringPts[i], B = ringPts[(i + 1) % ringPts.length];
        const abx = B[0] - A[0], abz = B[1] - A[1], L2 = abx * abx + abz * abz || 1;
        const tt = Math.max(0, Math.min(1, ((x - A[0]) * abx + (z - A[1]) * abz) / L2));
        d = Math.min(d, Math.hypot(x - (A[0] + abx * tt), z - (A[1] + abz * tt)));
      }
      return d;
    };
    // iterative: the ring wobbles, so one radial hop can still graze a bulging segment.
    // Wall-conflicting towers relocate OUTWARD ONLY (owner 2026-07-21: the courtyard belongs to
    // the keep/CC + the player's own free-form builds; baked defaults become field pickets
    // covering the approaches — never garrison towers dropped beside the CC).
    for (const s of structures) {
      for (let it = 0; it < 12; it++) {
        let moved = false;
        const d = distRing(s.x, s.z);
        const dx = s.x - base.x, dz = s.z - base.z, dd = Math.hypot(dx, dz) || 1;
        const inside = dd < rAvg2;
        if (d < MIND || (inside && d < MIND + 2)) {        // in the band (or courtyard-side of it)
          const step = (MIND - d) + (inside ? rAvg2 - dd + MIND : 0) + 0.6;
          s.x = r1(s.x + (dx / dd) * step); s.z = r1(s.z + (dz / dd) * step);   // always OUTWARD
          moved = true;
        } else if (inside) for (const gq of gates) {       // pre-existing deep-courtyard towers:
          const ga = gq.at || gq, gd = Math.hypot(s.x - ga[0], s.z - ga[1]);    // keep stairs clear
          if (gd < GATE_APRON) {
            const vx = (s.x - ga[0]) / (gd || 1), vz = (s.z - ga[1]) / (gd || 1);
            s.x = r1(s.x + vx * (GATE_APRON - gd + 0.5)); s.z = r1(s.z + vz * (GATE_APRON - gd + 0.5));
            moved = true; break;
          }
        }
        if (!moved) break;
      }
    }
    // NO-OVERLAP build pads (owner 2026-07-25 "make sure no tower spawn points can be too close to
    // the castle — this is a no-overlapping building"): drop any tower/CC spawn pad sitting on or
    // hugging the castle — the wall ring, a castle tower/gate anchor, or the keep. Players still build
    // FREE-FORM elsewhere; this only removes BAKED pads that would let a build overlap the fortress.
    {
      const keepAt = castleParts.geom.keepAt;
      const PAD_WALL = MIND;                      // ≈8.8 : off the wall band (a courtyard pad may sit inside)
      const PAD_STRUCT = MIND + 5;                // ≈13.8 : clearly off any tower/gate/keep footprint
      buildSpots = buildSpots.filter((b) => {
        if (distRing(b.x, b.z) < PAD_WALL) return false;                                        // on the wall
        if (keepAt && Math.hypot(b.x - keepAt[0], b.z - keepAt[1]) < PAD_STRUCT + 4) return false; // the keep (bigger)
        for (const s of castleStructures) if (Math.hypot(b.x - s.x, b.z - s.z) < PAD_STRUCT) return false; // tower/gate/wall anchor
        return true;
      });
    }
  }
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

  // ---- SIEGE BLOCK (standard contract — MOBA contract fix 1/2/4, 2026-07-21; the shapes that
  // lived under the test map's `_siegeTest` are now a first-class field). Emitted on EVERY parcel
  // with siege-relevant geometry: fortress parcels get the full block (tiers/wallRing/gates/
  // stairs/drawbridge); ANY parcel with baked high ground still gets elevationTiers, so the
  // strictly-above-tier over-wall rule works wherever ridges exist — castle or not.
  const siege = (() => {
    const tier1 = [];
    if (wf) for (const rr of wf.ridges || [])
      if (rr.pts && rr.pts.length >= 2)
        tier1.push({ kind: "RIDGE_TOP", poly: rr.pts.map((q) => [r1(q[0]), r1(q[1])]), w: r1(rr.width || 8) });
    if (!castleParts && !tier1.length) return null;
    const out = { elevationTiers: { tier1, tier2: [] } };
    if (castleParts) {
      const gpts = castleParts.geom.pts, gz2 = castleParts.geom.gates || [];
      const T2s = CASTLE_TIERS[castle && CASTLE_TIERS[castle.kind] ? castle.kind : "KEEP"];
      const CRs = concentricRings(castleParts.geom, T2s, poly, { g, G });
      // NO MOUND tier (owner 2026-07-27 flat-castle ruling): castle elevation advantage comes ONLY
      // from the WALL_WALK tier2 entries below — never a motte under the ward.
      // one WALL_WALK tier2 per nested ring, climbing (inner wards outrank outer — the
      // strictly-above-tier over-wall rule makes defense-in-depth work for free).
      for (const rr of CRs.rings) out.elevationTiers.tier2.push({ kind: "WALL_WALK", ring: rr.pts, lift: rr.lift, tier: rr.tier });
      out.wallRing = { pts: gpts, h: T2s.wallH, gates: gz2.map((g2) => g2.at || g2), ringN: CRs.rings.length };
      out.gates = structures.filter((s2) => /^castle_gate_/.test(s2.anchorId))
        .map((s2) => ({ id: s2.anchorId, at: [s2.x, s2.z], hp: s2.hpMax, material: "WOOD", states: ["CLOSED", "OPEN", "BROKEN"] }));
      out.stairs = CRs.rings[0].stairs;      // v18: ONE stair source — the ring's own data flights
      if (bridge.reg.length) {          // nearest world-road bridge = the drawbridge/causeway site
        let bb = bridge.reg[0], bd = Infinity;
        for (const c of bridge.reg) { const d2 = Math.hypot(c[0] - base.x, c[1] - base.z); if (d2 < bd) { bd = d2; bb = c; } }
        out.drawbridge = { at: [r1(bb[0]), r1(bb[1])], material: "WOOD" };
      }
    }
    return out;
  })();

  return {
    arena: poly
      ? { shape: "polygon", sizeM, bounds: poly }
      : { shape: "square", sizeM, bounds: [[-half, -half], [half, -half], [half, half], [-half, half]] },
    laneCount: p.laneCount,
    terrain: { cellM: CELL_M, w: G, h: G, cells: b64(g), walk: b64(walk) },
    obstacles: props,
    resources, buildSpots, spawnZones, lanes, routes, barriers, mobs, structures,
    ...(siege ? { siege } : {}),
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
              const CR = concentricRings(castleParts.geom, T2, poly, { g, G });
              return { castleGeom: {
                tier, styleKey,
                rings: CR.rings,
                keep: { at: castleParts.geom.keepAt, tiers: T2.keepTiers, h: T2.keepH,
                        w: castleParts.geom.keepW || 16,              // v19 keep-ratio law (owner: wall ≥2–3× keep)
                        lift: CR.rings[CR.rings.length - 1].lift },   // keep crowns the innermost ward
                mound: { steps: CR.moundSteps },
                moat: styleKey === "drowned_bastion",
              } };
            })() : {}),
            ...(overlay.decor.length || overlay.dropped.length
              ? { overlay: { placed: overlay.decor.length, ...(overlay.dropped.length ? { dropped: overlay.dropped } : {}) } }
              : {}) },
  };
}
