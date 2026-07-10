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
// top (W→N) + bot (S→E) edge lanes at ±100.8 with shoulders at ±84; laneCount 1 ⇒ the mid lane
// declared + the two edge lanes carved as undeclared jungle side-paths. The space between lanes
// is DENSE jungle (35–55% blocked) with carved chokes — not open field.
import { makeRng } from "../sim/rng.js";
import { clampParams, budgetFor, ARCHETYPES, PALETTES, LANDMARKS, BARRIER_KINDS, T, CELL_M, gIdx, inG, cellOf, worldOf, isBlocked, b64, pointInPoly } from "./schema.js";
import { archetypes } from "./archetypes.js";
import { validateAndRepair, snapOpen, erode, routesToCenter } from "./validate.js";
import { executeFeatures } from "./features.js";

// ---- real-parcel polygon support ------------------------------------------------------------
// The overworld gives each parcel its actual polygon; the battlefield is built INSIDE it —
// everything outside is T.OOB (void). Square stays the fallback when no polygon is known.
function normPoly(polygon, sizeM) {          // world-snapshot coords → arena coords (centered, fitted)
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [x, z] of polygon) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const s = (sizeM * 0.96) / Math.max(x1 - x0, z1 - z0, 1e-9);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  return polygon.map(([x, z]) => [Math.round((x - cx) * s * 10) / 10, Math.round((z - cz) * s * 10) / 10]);
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

// Carve the golden-reference lane network + staging clearings + entry corridors + inter-lane
// chokes + jungle pockets. Returns { lanes (the DECLARED world polylines), resPockets, campPockets }.
function carveMobaNetwork(g, G, rng, p, { atk, def, poly, half, spawnZones, rimPts }) {
  const inPoly = (x, z) => !poly || pointInPoly(x, z, poly);
  let pcx = 0, pcz = 0;
  if (poly) { for (const [x, z] of poly) { pcx += x; pcz += z; } pcx /= poly.length; pcz /= poly.length; }
  const pull = (x, z) => {           // pull a template point toward the polygon centroid until inside
    if (inPoly(x, z)) return [x, z];
    for (let t = 1; t <= 10; t++) { const f = t / 10, nx = x + (pcx - x) * f, nz = z + (pcz - z) * f; if (pointInPoly(nx, nz, poly)) return [nx, nz]; }
    return [pcx, pcz];
  };
  // reference geometry: lanes at ±100.8, shoulders at ±84 (fractions of the ±161 frame)
  const L = half * 0.626, S = half * 0.522;
  const mid = [[atk.x, atk.z], [0, 0], [def.x, def.z]].map(([x, z]) => pull(x, z));
  const top = [[-L, -S], [-L, L], [S, L]].map(([x, z]) => pull(x, z));      // west edge → north edge
  const bot = [[-S, -L], [L, -L], [L, S]].map(([x, z]) => pull(x, z));      // south edge → east edge
  const declared = p.laneCount === 3 ? [mid, top, bot] : p.laneCount === 2 ? [mid, top] : [mid];
  const side = p.laneCount === 3 ? [] : p.laneCount === 2 ? [bot] : [top, bot];
  const network = [...declared, ...side];

  // 1) lanes: declared = ROAD ~10 u wide; undeclared side-paths = OPEN jungle trails ~8 u wide
  for (const lane of declared) carvePath(g, G, lane, 2.5, true);
  for (const path of side) carvePath(g, G, path, 2.0, false);
  // 2) base plateaus + center + staging clearings (mirrors command_converter's CORE/SPAWN pockets)
  disc(g, G, cellOf(G, atk.x), cellOf(G, atk.z), 9.5);
  disc(g, G, cellOf(G, def.x), cellOf(G, def.z), 12);       // wider: holds the CoC build-spot ring
  disc(g, G, G >> 1, G >> 1, 5);
  for (const s of spawnZones) disc(g, G, cellOf(G, s.x), cellOf(G, s.z), 4.5);
  // 3) each lane connects to both base plateaus (the reference lanes all start at a base)
  for (const lane of network) {
    carvePath(g, G, [[atk.x, atk.z], lane[0]], 2.0, false);
    carvePath(g, G, [[def.x, def.z], lane[lane.length - 1]], 2.0, false);
  }
  // 4) edge-entry corridors: true rim point → its entry spawn → nearest lane (reinforcements)
  for (let i = 0; i < rimPts.length; i++) {
    const s = rimPts[i];
    carvePath(g, G, [[s.rimX, s.rimZ], [s.x, s.z], nearestOnNetwork(network, s.x, s.z)], 2.0, false);
  }
  // 5) inter-lane chokes: mirrored jungle crossings between mid and each side lane
  const t1 = 0.30 + rng() * 0.12;
  for (const t of [t1, 1 - t1]) {
    const m = pointAt(mid, t);
    for (const other of network) {
      if (other === mid) continue;
      carvePath(g, G, [[m.x, m.z], nearestOnNetwork([other], m.x, m.z)], 1.6, false);
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
    carvePath(g, G, [[a.x, a.z], [px, pz]], 1.6, false);
    list.push({ x: px, z: pz });
    if (mirror) {                                       // 180°-rotated twin (network is symmetric)
      disc(g, G, cellOf(G, -px), cellOf(G, -pz), 3.4);
      carvePath(g, G, [[-a.x, -a.z], [-px, -pz]], 1.6, false);
      list.push({ x: -px, z: -pz });
    }
  };
  const wantRes = Math.max(2, p.resourceNodes), wantCamp = Math.max(1, p.mobCamps);
  for (let i = 0; resPockets.length < wantRes && i < wantRes + 4; i++) {
    const lane = network[i % network.length];
    digPocket(resPockets, lane, 0.22 + rng() * 0.3, i % 2 ? 1 : -1, 18 + rng() * 12, p.mirrorFair && !poly);
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

export function generate(parcel, params = null, designVersion = 0) {
  const { parcelId, biome = "", zone = "" } = parcel;
  const seed = seedFor(parcelId, biome, zone);
  const budget = budgetFor(parcel.investLevel ?? 0);   // investment tier = hard content budget
  const p = params ? clampParams(params, budget) : paramsFromSeed(seed, parcelId, budget);
  // biome is authoritative for the ground COLOUR: override the seeded/region palette so the terrain
  // renders as its declared biome (desert = sandy, not green). An explicit params.palette wins.
  const bp = biomePalette(biome, seed);
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
  // per-edge entries: on the overworld an army always crosses in at the MIDPOINT of the specific
  // parcel edge it approaches from — so we emit one arrival point per REAL edge (4 for a square,
  // N for an N-gon), pulled slightly inward so it lands inside the parcel. The FIRM connectivity
  // rule buckets every rim cell into a quadrant that reaches center, so every edge midpoint is a
  // guaranteed-valid start — CLASH/GUARD use whichever edges the current battle's armies arrive on.
  const boundary = poly || [[-half, -half], [half, -half], [half, half], [-half, half]];
  const ccx = boundary.reduce((s, v) => s + v[0], 0) / boundary.length;
  const ccz = boundary.reduce((s, v) => s + v[1], 0) / boundary.length;
  const rimPts = [];
  const edgeEntries = boundary.map((v, i) => {
    const w = boundary[(i + 1) % boundary.length];
    const rimX = (v[0] + w[0]) / 2, rimZ = (v[1] + w[1]) / 2;               // the true boundary midpoint
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
  const buildSpots = [];
  for (let i = 0; i < 6; i++) {                               // ring of anchors around the defender CC
    const a = (i / 6) * Math.PI * 2;
    buildSpots.push({ anchorId: "bs_ring" + i, x: r1(base.x + Math.cos(a) * 22), z: r1(base.z + Math.sin(a) * 22), size: 6 });
  }
  buildSpots.push({ anchorId: "bs_mid", x: r1(base.x * 0.4), z: r1(base.z * 0.4), size: 6 }); // forward spot on the defender half of the mid lane

  // 3) carve the MOBA lane network out of the jungle (lanes/entries/chokes/clearings/pockets),
  //    then seal any leftover enclosed bubbles so the map is one connected battlefield.
  const net = carveMobaNetwork(g, G, rng, p, { atk, def: base, poly, half, spawnZones, rimPts });
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
  snapOpen(resources, v.eroded, G); snapOpen(buildSpots, v.eroded, G); snapOpen(spawnZones, v.eroded, G);
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

  // 6) bake: props from final grid; walkability bitmask (1 = open at native cell res)
  const props = sampleProps(g, G, rng);
  if (landmark) props.unshift(landmark);
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
    meta: { seed, designVersion, parcelId, biome, zone, params: p, repairs: v.repairs,
            budget: { level: budget.level, name: budget.name } },
  };
}
