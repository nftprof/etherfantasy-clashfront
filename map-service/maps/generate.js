// Deterministic parcel battlefield generator (MAP-GENERATOR.md D3). Pipeline:
//   seed = f(parcelId,biome,zone) → params (or LLM/owner params, clamped) → archetype paint
//   → landmark/prop stamping → anchors/lanes/spawns (mirror-fair) → validate+repair → bake.
// Same inputs ⇒ byte-identical artifact (no Math.random / Date.now anywhere).
import { makeRng } from "../sim/rng.js";
import { clampParams, budgetFor, ARCHETYPES, PALETTES, LANDMARKS, BARRIER_KINDS, T, CELL_M, gIdx, cellOf, worldOf, isBlocked, b64, pointInPoly } from "./schema.js";
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

// props (render décor + client-side collision hints) sampled from the painted grid
function sampleProps(g, G, rng) {
  const props = [];
  const KIND = { [T.FOREST]: ["TREE", 3], [T.ROCK]: ["ROCK", 2.5] };
  for (let z = 0; z < G; z += 2) for (let x = 0; x < G; x += 2) {
    const k = KIND[g[gIdx(G, x, z)]];
    if (k && rng() < 0.16 && props.length < 420)
      props.push({ kind: k[0], x: r1(worldOf(G, x) + (rng() - 0.5) * CELL_M), z: r1(worldOf(G, z) + (rng() - 0.5) * CELL_M), r: r1(k[1] * (0.7 + rng() * 0.6)) });
  }
  return props;
}
const r1 = (n) => Math.round(n * 10) / 10;

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
  const sizeM = parcel.sizeM || 322;   // CANON (2026-07-08): fixed ±161 world-unit frame, every parcel/battle
  const G = Math.round(sizeM / CELL_M);
  const rng = makeRng(seed ^ fnv1a("v" + designVersion));    // each version rolls fresh, still deterministic
  const g = new Uint8Array(G * G);                            // T.OPEN

  // 1) archetype paints terrain; then the parcel's REAL polygon (when known) cuts the arena —
  //    OOB overwrites whatever the archetype painted outside the parcel.
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

  // 3) anchors/spawns — defender base sits at the north of the PARCEL, attacker enters from its
  //    south (bridge canon); reinforcement entries at the E/W/N boundary. Square = the old fixed
  //    points; polygon = boundary extremes pulled inward so they land inside the parcel.
  const half = sizeM / 2;
  const A = (dx, dz, t, fx, fz) => poly ? (({ x, z }) => ({ x: r1(x), z: r1(z) }))(polyAnchor(poly, dx, dz, t)) : { x: fx, z: fz };
  const base = A(0, 1, 0.3, 0, half - 30);
  const atk = A(0, -1, 0.12, 0, -half + 10);
  // per-edge entries: on the overworld an army always crosses in at the MIDPOINT of the specific
  // parcel edge it approaches from — so we emit one arrival point per REAL edge (4 for a square,
  // N for an N-gon), pulled slightly inward so it lands inside the parcel. The FIRM connectivity
  // rule buckets every rim cell into a quadrant that reaches center, so every edge midpoint is a
  // guaranteed-valid start — CLASH/GUARD use whichever edges the current battle's armies arrive on.
  const boundary = poly || [[-half, -half], [half, -half], [half, half], [-half, half]];
  const ccx = boundary.reduce((s, v) => s + v[0], 0) / boundary.length;
  const ccz = boundary.reduce((s, v) => s + v[1], 0) / boundary.length;
  const edgeEntries = boundary.map((v, i) => {
    const w = boundary[(i + 1) % boundary.length];
    let mx = (v[0] + w[0]) / 2, mz = (v[1] + w[1]) / 2;
    mx += (ccx - mx) * 0.14; mz += (ccz - mz) * 0.14;               // pull inward off the boundary
    const bx = mx - ccx, bz = mz - ccz;
    const edge = Math.abs(bz) >= Math.abs(bx) ? (bz >= 0 ? "N" : "S") : (bx >= 0 ? "E" : "W");
    return { id: "entry_e" + i, side: "ANY", edge, canBase: true, x: r1(mx), z: r1(mz) };
  });
  const spawnZones = [
    { id: "atk_S", side: "ATTACKER", edge: "S", x: atk.x, z: atk.z },   // DUEL attacker
    { id: "def_base", side: "DEFENDER", edge: "N", x: base.x, z: base.z }, // DUEL/SIEGE defender
    ...edgeEntries,                                                      // one arrival point per edge midpoint
    { id: "center", side: "OBJECTIVE", edge: "C", x: 0, z: 0 },          // SIEGE/GUARD/DOMINION hold-point
  ];
  const buildSpots = [];
  for (let i = 0; i < 6; i++) {                               // ring of anchors around the defender CC
    const a = (i / 6) * Math.PI * 2;
    buildSpots.push({ anchorId: "bs_ring" + i, x: r1(base.x + Math.cos(a) * 22), z: r1(base.z + Math.sin(a) * 22), size: 6 });
  }
  buildSpots.push({ anchorId: "bs_mid", x: 0, z: r1(base.z - sizeM * 0.35), size: 6 });

  // resource nodes: exactly p.resourceNodes (budget-capped). Explicit resourceAt placements
  // consume the budget first; the seeded mirror-fair roll fills whatever remains.
  const resources = [];
  for (const r of placed.resources) {
    if (resources.length >= p.resourceNodes) break;
    resources.push({ kind: r.kind, x: r1(r.x), z: r1(r.z), richness: r1(Math.min(0.3 + rng() * p.resourceRichness, budget.maxRichness)) });
  }
  for (let i = 0; resources.length < p.resourceNodes && i < 16; i++) {
    const rx = r1((rng() * 0.7 + 0.15) * sizeM - half), rz = r1((rng() * 0.3 + 0.12) * sizeM - half);
    const richness = r1(Math.min(0.3 + rng() * p.resourceRichness, budget.maxRichness));
    resources.push({ kind: i % 2 ? "WOOD_GROVE" : "GOLD_MINE", x: rx, z: rz, richness });
    if (p.mirrorFair && resources.length < p.resourceNodes)
      resources.push({ kind: i % 2 ? "WOOD_GROVE" : "GOLD_MINE", x: r1(-rx), z: r1(-rz), richness });
  }

  // 4) lanes: laneCount corridors from the attacker spawn toward the base, side lanes offset
  //    perpendicular to the attack axis (validator turns them into real pathable chains)
  const ax = base.x - atk.x, az = base.z - atk.z, al = Math.sqrt(ax * ax + az * az) || 1;
  const px_ = -az / al, pz_ = ax / al, off = sizeM * 0.26;
  const laneStarts = p.laneCount === 3
    ? [[atk.x - px_ * off, atk.z - pz_ * off], [atk.x, atk.z], [atk.x + px_ * off, atk.z + pz_ * off]]
    : [[atk.x, atk.z]];

  // 5) validate + repair (edge corridors, base clearing, pathable lanes) then snap points to open
  const v = validateAndRepair(g, G, base, laneStarts);
  snapOpen(resources, v.eroded, G); snapOpen(buildSpots, v.eroded, G); snapOpen(spawnZones, v.eroded, G);
  const lanes = v.lanes.map((wp) => wp.map(([x, z]) => [r1(x), r1(z)]));
  // per-edge NPC routes: entry→center chain for every arrival edge (multi-sided modes). lanes[]
  // stays the DUEL attacker→base push; routes[] is what a unit arriving from an arbitrary edge
  // follows so the dumb lane-AI has a guaranteed path from any side to the central objective.
  const routes = routesToCenter(g, G, spawnZones.filter((s) => s.side === "ANY" || s.side === "ATTACKER"));

  // 5a) destructible HP-gates (investment content): seal shortcuts/pockets, never the main path.
  // Build the avoid-set = every lane + route waypoint cell so no gate lands on a guaranteed path.
  const avoid = new Set();
  for (const wp of [...lanes, ...routes.map((r) => r.wp)]) for (const [x, z] of wp) avoid.add(gIdx(G, cellOf(G, x), cellOf(G, z)));
  const barriers = placeBarriers(g, G, rng, p.barriers, avoid, budget.level);

  // 5b) landowner defenses (investment content): wild monster camps guarding the interior +
  // land-owned towers along the lanes near the base. Game-time assembly instantiates the actual
  // units/structures; these are data anchors like everything else in Layer 1.
  const MOBKINDS = ["WOLF", "BANDIT", "TROLL", "GOLEM", "HARPY", "WYRM"];
  const mobs = [];
  for (const m of placed.mobs) {
    if (mobs.length >= p.mobCamps) break;
    mobs.push({ id: "mob" + mobs.length, kind: MOBKINDS[Math.floor(rng() * MOBKINDS.length)],
      x: r1(m.x), z: r1(m.z), count: 4 + budget.level + Math.floor(rng() * 3) });
  }
  for (let i = mobs.length; i < p.mobCamps; i++) {
    const a = rng() * Math.PI * 2, rad = (0.15 + rng() * 0.3) * half;
    mobs.push({ id: "mob" + mobs.length, kind: MOBKINDS[Math.floor(rng() * MOBKINDS.length)],
      x: r1(Math.cos(a) * rad), z: r1(Math.sin(a) * rad), count: 4 + budget.level + Math.floor(rng() * 3) });
  }
  snapOpen(mobs, v.eroded, G);
  // named "structures" to match the allocate contract verbatim (side DEFENDER; live hp is
  // filled in from the battle context at match time — Layer 2)
  const structures = [];
  for (const t of placed.towers) {
    if (structures.length >= p.towers) break;
    structures.push({ anchorId: "tw" + structures.length, kind: "TOWER", side: "DEFENDER",
      x: r1(t.x), z: r1(t.z), hpMax: 1600 + budget.level * 250 });
  }
  for (let i = structures.length; i < p.towers; i++) {
    const lane = lanes[i % lanes.length];
    const wp = lane[Math.max(1, lane.length - 2 - Math.floor(i / lanes.length) * 3)] || lane[lane.length - 1];
    structures.push({ anchorId: "tw" + structures.length, kind: "TOWER", side: "DEFENDER", x: r1(wp[0] + (rng() - 0.5) * 8), z: r1(wp[1] + (rng() - 0.5) * 8),
      hpMax: 1600 + budget.level * 250 });
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
