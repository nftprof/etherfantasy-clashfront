// traverse.js — HEADLESS TRAVERSABILITY AUDIT (owner 2026-08-01: "run like 100 simulations and
// show all the lines where it can be traversed … so I can visually audit path finding — NPC and
// player; every stair to the walls; can't walk through walls but can walk through gates").
//
// Builds the AUDIT WALK MODEL from an artifact and runs a deterministic batch of headless walks:
//   • GROUND layer = the artifact's canonical walk bitmask, PLUS castle walls stamped as blockers
//     (4.2u bodies) EXCEPT inside the ~5.5u arch opening at each gate — the audit models the v2
//     "walls are solid" rule the engine will enforce, so wall-through paths can't pass silently.
//   • WALL layer  = each ring's wall-walk polyline (walkable band on top of the wall) reached
//     ONLY via that ring's stairs[] (foot on ground → top on the parapet).
// Every walk is BFS on the audit grid (4-neighbor), seeded off the artifact's own seed —
// same artifact ⇒ byte-identical audit, forever.
//
// runAudit(artifact) → {
//   grid: { w, cellM, blocked: b64 }                              — the collision field (toggle 1)
//   trails: [{ kind, ok, from, to, wp: [[x,z]…] }]                — walk lines (toggle 2)
//   wallNet: [{ tier, h, pts }]                                   — wall-walk loops (render at h)
//   stairLinks: [{ tier, h, foot, top, ok }]                      — ground↔parapet connectors
//   stats: { walks, reached, failed, stairs, stairsOk }
// }
import { T, gIdx, inG, worldOf, cellOf, b64, CELL_M, isBlocked } from "./schema.js";
import { makeRng } from "../sim/rng.js";

// GROUND REACHABILITY from the courtyard, walls-solid + arches-open — the generator prunes
// stairs whose foot lands in a sealed bailey pocket (walls + marsh) with this, and the audit
// uses the same stamping rules, so the two can never disagree about what is reachable.
// rings: [{ pts, gates }] (concentricRings shape); returns a tester (x, z) → bool.
export function groundReachability(g, G, rings, home) {
  const blocked = new Uint8Array(G * G);
  for (let i = 0; i < G * G; i++) blocked[i] = isBlocked(g, i) || g[i] === T.OOB ? 1 : 0;
  stampWalls(blocked, G, rings, (i) => !(isBlocked(g, i) || g[i] === T.OOB));
  const src = (() => {
    const i0 = gIdx(G, cellOf(G, home[0]), cellOf(G, home[1]));
    return nearOpen(blocked, G, i0);
  })();
  const seen = new Uint8Array(G * G);
  if (src >= 0) {
    const q = [src];
    seen[src] = 1;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % G, z = (i / G) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= G || nz >= G) continue;
        const ni = nz * G + nx;
        if (!seen[ni] && !blocked[ni]) { seen[ni] = 1; q.push(ni); }
      }
    }
  }
  // SAME rule as the audit's walk check (nearOpen then exact membership) — the pruner and the
  // audit can never disagree about a foot's reachability.
  return (x, z) => {
    const i = nearOpen(blocked, G, gIdx(G, cellOf(G, x), cellOf(G, z)));
    return i >= 0 && !!seen[i];
  };
}

// shared wall stamping: block every wall body cell except the arch at each gate; punch the
// arches clean afterwards (cell quantization otherwise pinches them shut). baseOpen(i) says
// whether a cell is walkable BEFORE walls — punched cells must be real ground.
// EXPORTED (2026-08-31): the generator's honest-walk-mask pass floods on this exact model, so
// generator, audit, and engine can never disagree about what a wall seals.
export function stampWalls(blocked, G, rings, baseOpen) {
  const allGates = [];
  for (const ring of rings || []) {
    const pts = ring.pts || [], gates = (ring.gates || []).map((g2) => g2.at || g2);
    allGates.push(...gates);
    const gd = (x, z) => gates.length ? Math.min(...gates.map((g2) => Math.hypot(g2[0] - x, g2[1] - z))) : 1e9;
    for (let i = 0; i < pts.length; i++) {
      const A = pts[i], B = pts[(i + 1) % pts.length];
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]), steps = Math.max(1, Math.round(L));
      for (let k = 0; k <= steps; k++) {
        const x = A[0] + (B[0] - A[0]) * (k / steps), z = A[1] + (B[1] - A[1]) * (k / steps);
        if (gd(x, z) < GATE_R) continue;
        const cx = cellOf(G, x), cz = cellOf(G, z);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, nz = cz + dz;
          if (!inG(G, nx, nz)) continue;
          if (Math.hypot(worldOf(G, nx) - x, worldOf(G, nz) - z) <= 2.1 + CELL_M * 0.35)
            blocked[gIdx(G, nx, nz)] = 1;
        }
      }
    }
  }
  for (const g2 of allGates) {
    const cx = cellOf(G, g2[0]), cz = cellOf(G, g2[1]);
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const nx = cx + dx, nz = cz + dz;
      if (!inG(G, nx, nz)) continue;
      const i = gIdx(G, nx, nz);
      if (baseOpen(i) && Math.hypot(worldOf(G, nx) - g2[0], worldOf(G, nz) - g2[1]) <= 4.5) blocked[i] = 0;
    }
  }
}

const r1 = (n) => Math.round(n * 10) / 10;
const GATE_R = 5.5;                       // arch half-width — matches the render kit's opening

export function buildAuditGrid(art) {
  const G = art.terrain.w;
  const walk = new Uint8Array(Buffer.from(art.terrain.walk, "base64"));
  const blocked = new Uint8Array(G * G);
  for (let i = 0; i < G * G; i++) blocked[i] = walk[i] ? 0 : 1;
  const cg = art.meta && art.meta.castleGeom;
  if (cg) stampWalls(blocked, G, cg.rings || [], (i) => !!walk[i]);
  return { G, blocked, walk };
}

// BFS with parent recovery; returns null (unreachable) or a simplified world-coord polyline.
function bfsPath(blocked, G, from, to) {
  const src = gIdx(G, cellOf(G, from[0]), cellOf(G, from[1]));
  const dst = gIdx(G, cellOf(G, to[0]), cellOf(G, to[1]));
  const seed = nearOpen(blocked, G, src), goal = nearOpen(blocked, G, dst);
  if (seed < 0 || goal < 0) return null;
  const par = new Int32Array(G * G).fill(-2);
  par[seed] = -1;
  const q = [seed];
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    if (i === goal) break;
    const x = i % G, z = (i / G) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= G || nz >= G) continue;
      const ni = nz * G + nx;
      if (par[ni] === -2 && !blocked[ni]) { par[ni] = i; q.push(ni); }
    }
  }
  if (par[goal] === -2) return null;
  const cells = [];
  for (let i = goal; i !== -1; i = par[i]) cells.push(i);
  cells.reverse();
  const wp = [];
  for (let k = 0; k < cells.length; k++)
    if (k === 0 || k === cells.length - 1 || k % 3 === 0)
      wp.push([r1(worldOf(G, cells[k] % G)), r1(worldOf(G, (cells[k] / G) | 0))]);
  return wp;
}
function nearOpen(blocked, G, i0) {
  if (!blocked[i0]) return i0;
  const x0 = i0 % G, z0 = (i0 / G) | 0;
  for (let r = 1; r <= 6; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const x = x0 + dx, z = z0 + dz;
    if (x >= 0 && z >= 0 && x < G && z < G && !blocked[z * G + x]) return z * G + x;
  }
  return -1;
}

export function runAudit(art, { walks = 100 } = {}) {
  const { G, blocked } = buildAuditGrid(art);
  const cg = art.meta && art.meta.castleGeom;
  const keep = cg ? cg.keep.at : null;
  const spawns = art.spawnZones || [];
  const base = spawns.find((s) => s.id === "def_base");
  const home = keep || (base ? [base.x, base.z] : [0, 0]);
  const tasks = [];
  // 1) every spawn/entry → the defended heart (arrival pathability)
  for (const s of spawns) if (s.id !== "def_base") tasks.push({ kind: "entry", from: [s.x, s.z], to: home });
  // 2) every outer gate: outside apron → courtyard (walks THROUGH the arch, never the wall).
  // Boundary-hugging estates: the apron probes inward through [10,7,4,2.5]u until it lands on
  // real ground — a gate whose entire outside is beyond the parcel has no outside approach (skip).
  const cellsT = new Uint8Array(Buffer.from(art.terrain.cells, "base64"));
  if (cg) for (const g of cg.rings[0].gates || []) {
    const at = g.at || g, m = Math.hypot(at[0] - home[0], at[1] - home[1]) || 1;
    let out = null;
    for (const dd of [10, 7, 4, 2.5]) {
      const ox = r1(at[0] + ((at[0] - home[0]) / m) * dd), oz = r1(at[1] + ((at[1] - home[1]) / m) * dd);
      if (cellsT[gIdx(G, cellOf(G, ox), cellOf(G, oz))] !== T.OOB) { out = [ox, oz]; break; }
    }
    if (out) tasks.push({ kind: "gate", from: out, to: home });
  }
  // 3) every stair foot ← courtyard (ground reachability of every flight, all rings)
  if (cg) for (const ring of cg.rings) for (const s of ring.stairs || [])
    tasks.push({ kind: "stairFoot", from: home, to: s.foot });
  // 4) resources → heart
  for (const rsc of art.resources || []) tasks.push({ kind: "resource", from: [rsc.x, rsc.z], to: home });
  // 5) seeded random pairs across the MAIN open field, up to the walk budget. Roam endpoints
  // sample the LARGEST connected component only — 1–2-cell slivers pinched between a wall band
  // and a rock aren't play space; genuine disconnections still surface via the dedicated tasks
  // and the components/isolatedCells stats below.
  const comp = new Int32Array(G * G).fill(-1);
  const compSizes = [];
  for (let s = 0; s < G * G; s++) {
    if (blocked[s] || comp[s] >= 0) continue;
    const nc = compSizes.length, q = [s];
    comp[s] = nc; let n = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h]; n++;
      const x = i % G, z = (i / G) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= G || nz >= G) continue;
        const ni = nz * G + nx;
        if (!blocked[ni] && comp[ni] < 0) { comp[ni] = nc; q.push(ni); }
      }
    }
    compSizes.push(n);
  }
  const mainComp = compSizes.indexOf(Math.max(0, ...compSizes));
  const rng = makeRng(((art.meta && art.meta.seed) >>> 0) ^ 0x7a11);
  const open = [];
  for (let i = 0; i < G * G; i++) if (!blocked[i] && comp[i] === mainComp) open.push(i);
  while (tasks.length < walks && open.length > 2) {
    const a = open[Math.floor(rng() * open.length)], b = open[Math.floor(rng() * open.length)];
    tasks.push({ kind: "roam", from: [r1(worldOf(G, a % G)), r1(worldOf(G, (a / G) | 0))],
                 to: [r1(worldOf(G, b % G)), r1(worldOf(G, (b / G) | 0))] });
  }
  const trails = [];
  let reached = 0;
  for (const t of tasks.slice(0, Math.max(walks, tasks.length - 0))) {
    const wp = bfsPath(blocked, G, t.from, t.to);
    if (wp) reached++;
    trails.push({ kind: t.kind, ok: !!wp, from: t.from, to: t.to, ...(wp ? { wp } : {}) });
  }
  // wall-walk network + stair connectors (the WALL layer of the audit)
  const wallNet = [], stairLinks = [];
  let stairsOk = 0, stairsN = 0;
  if (cg) for (const ring of cg.rings) {
    wallNet.push({ tier: ring.tier, h: (ring.h || 9) + (ring.lift || 0), pts: ring.pts });
    for (const s of ring.stairs || []) {
      stairsN++;
      const footTrail = trails.find((t) => t.kind === "stairFoot" && t.to[0] === s.foot[0] && t.to[1] === s.foot[1]);
      const ok = !!(footTrail && footTrail.ok);
      if (ok) stairsOk++;
      stairLinks.push({ tier: ring.tier, h: (ring.h || 9) + (ring.lift || 0), foot: s.foot, top: s.top, ok });
    }
  }
  const sigComps = compSizes.filter((n) => n >= 8).length;   // components big enough to matter
  return {
    grid: { w: G, cellM: CELL_M, blocked: b64(blocked) },
    trails, wallNet, stairLinks,
    stats: { walks: trails.length, reached, failed: trails.length - reached, stairs: stairsN, stairsOk,
             components: sigComps, isolatedCells: open.length ? compSizes.reduce((a, b) => a + b, 0) - compSizes[mainComp] : 0 },
  };
}

/* ============================================================================
   NAVAL/AIR AUDIT (v31, three-layer doctrine — NAVAL-AIRSHIP-THREE-LAYER-MAPS.md).
   Headless sim of REINFORCEMENT BY SEA AND AIR (owner 2026-08-31):
   • SAIL model: BFS over water≥2 (deep/ocean), per SAIL REGION (deep cells split by
     shallow pinches sail separately — a shallow bar stops a hull even inside one body).
   • BEACHHEAD: a shallow cell adjacent to a sail region on one side and to MAIN-component
     walkable land on the other — where a fleet can put troops ashore. Every EDGE-CONNECTED
     sail region must offer ≥1 (else arriving ships have nowhere to land = dead content).
   • AIR assault: every LANDING_PAD must reach the defended heart on foot (units unload
     and MARCH — airships never bombard from the air).
   • AMPHIBIOUS FRONTAGE: shallow cells within reach of main-comp land = where water pets
     can stand and strike (structures included, per owner range ruling).
   runNavalAudit(art) → { stats, beachheads[], sailRegions[], padTrails[] }
   ============================================================================ */
export function runNavalAudit(art) {
  const G = art.terrain.w;
  const cells = new Uint8Array(Buffer.from(art.terrain.cells, "base64"));
  const walk = new Uint8Array(Buffer.from(art.terrain.walk, "base64"));
  const water = art.terrain.water ? new Uint8Array(Buffer.from(art.terrain.water, "base64")) : new Uint8Array(G * G);
  const { blocked } = buildAuditGrid(art);
  // main walkable component (walls stamped) — the field troops fight on
  const comp = new Int32Array(G * G).fill(-1); const compN = [];
  for (let s0 = 0; s0 < G * G; s0++) {
    if (blocked[s0] || comp[s0] >= 0) continue;
    const nc = compN.length, q = [s0]; comp[s0] = nc; let n = 0;
    for (let h = 0; h < q.length; h++) { const i = q[h]; n++; const x = i % G, z = (i / G) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= G || nz >= G) continue; const ni = nz * G + nx;
        if (!blocked[ni] && comp[ni] < 0) { comp[ni] = nc; q.push(ni); } } }
    compN.push(n);
  }
  const main = compN.indexOf(Math.max(0, ...compN));
  // SAIL REGIONS: components of water≥2 (4-connected through deep only)
  const sail = new Int32Array(G * G).fill(-1); const sailN = []; const sailEdge = [];
  for (let s0 = 0; s0 < G * G; s0++) {
    if (water[s0] < 2 || sail[s0] >= 0) continue;
    const nc = sailN.length, q = [s0]; sail[s0] = nc; let n = 0, edge = false;
    for (let h = 0; h < q.length; h++) { const i = q[h]; n++; const x = i % G, z = (i / G) | 0;
      if (x === 0 || z === 0 || x === G - 1 || z === G - 1) edge = true;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= G || nz >= G) { continue; }
        const ni = nz * G + nx;
        if (cells[ni] === T.OOB) edge = true;
        if (water[ni] >= 2 && sail[ni] < 0) { sail[ni] = nc; q.push(ni); } } }
    sailN.push(n); sailEdge.push(edge);
  }
  // BEACHHEADS: a WADE CORRIDOR through the shallow band — the ship stops at the deep edge and
  // troops wade ashore. BFS through SHALLOW cells seeded at every shallow cell touching a sail
  // region, capped at WADE_MAX cells (~16u — nobody wades a lake); a reached shallow cell whose
  // 8-neighborhood holds MAIN-component walkable land = a landing point for that region.
  const WADE_MAX = 8;
  const beachheads = []; const regionBeach = new Array(sailN.length).fill(0);
  let frontage = 0;
  const wsrc = new Int32Array(G * G).fill(-1);   // which sail region wades through this cell
  const wdep = new Int16Array(G * G).fill(999);
  { const q = [];
    for (let i = 0; i < G * G; i++) {
      if (water[i] !== 1) continue;
      const x = i % G, z = (i / G) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= G || nz >= G) continue;
        const ni = nz * G + nx;
        if (water[ni] >= 2 && sail[ni] >= 0) { wsrc[i] = sail[ni]; wdep[i] = 0; q.push(i); break; }
      }
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h]; if (wdep[i] >= WADE_MAX) continue;
      const x = i % G, z = (i / G) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= G || nz >= G) continue;
        const ni = nz * G + nx;
        if (water[ni] === 1 && wdep[ni] > wdep[i] + 1) { wdep[ni] = wdep[i] + 1; wsrc[ni] = wsrc[i]; q.push(ni); }
      }
    }
  }
  for (let i = 0; i < G * G; i++) {
    if (water[i] !== 1) continue;
    const x = i % G, z = (i / G) | 0;
    let landOk = false;
    for (let dz = -1; dz <= 1 && !landOk; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= G || nz >= G) continue;
      const ni = nz * G + nx;
      if (walk[ni] && comp[ni] === main) { landOk = true; break; }
    }
    if (landOk) frontage++;                                    // a water pet can stand + strike here
    if (landOk && wsrc[i] >= 0) {
      regionBeach[wsrc[i]]++;
      if (beachheads.length < 400) beachheads.push({ x: r1(worldOf(G, x)), z: r1(worldOf(G, z)), region: wsrc[i], wade: wdep[i] });
    }
  }
  // every EDGE-connected sail region (a fleet can arrive there) must land somewhere
  let arrivable = 0, landable = 0;
  for (let s = 0; s < sailN.length; s++) {
    if (!sailEdge[s] || sailN[s] < 12) continue;               // tiny deep slivers don't host fleets
    arrivable++;
    if (regionBeach[s] > 0) landable++;
  }
  // AIR: pads → the defended heart on foot (unload and MARCH)
  const cg = art.meta && art.meta.castleGeom;
  const spawns = art.spawnZones || [];
  const base = spawns.find((s) => s.id === "def_base");
  const home = (cg && cg.keep.at) || (base ? [base.x, base.z] : [0, 0]);
  const pads = (art.structures || []).filter((s) => s.kind === "LANDING_PAD");
  const padTrails = [];
  let padsOk = 0;
  for (const p of pads) {
    const wp = bfsPath(blocked, G, [p.x, p.z], home);
    if (wp) padsOk++;
    padTrails.push({ from: [p.x, p.z], ok: !!wp, ...(wp ? { wp } : {}) });
  }
  // beachhead → heart (reinforce-by-sea march), sampled up to 12 spread beachheads
  let beachWalks = 0, beachOk = 0;
  const step = Math.max(1, Math.floor(beachheads.length / 12));
  for (let k = 0; k < beachheads.length; k += step) {
    const b = beachheads[k]; beachWalks++;
    if (bfsPath(blocked, G, [b.x, b.z], home)) beachOk++;
  }
  // PIER → heart (the sea unload point must march like any spawn)
  const piers = (art.structures || []).filter((s) => s.kind === "PIER");
  let piersOk = 0;
  for (const p of piers) if (bfsPath(blocked, G, [p.x, p.z], home)) piersOk++;
  // PAD BALANCE: nearest pad→heart distance (a pad on the keep's doorstep = airborne coup de
  // main with no march; too far = dead content) + quadrant spread (all pads on one side = the
  // defender only ever watches one sky).
  let padKeepMin = Infinity, padQuads = new Set();
  for (const p of pads) {
    padKeepMin = Math.min(padKeepMin, Math.hypot(p.x - home[0], p.z - home[1]));
    padQuads.add((p.x >= home[0] ? "E" : "W") + (p.z >= home[1] ? "N" : "S"));
  }
  return {
    beachheads, padTrails,
    sailRegions: sailN.map((n, s) => ({ cells: n, edge: sailEdge[s], beach: regionBeach[s] })).filter((r) => r.cells >= 12),
    stats: { sailRegions: sailN.filter((n, s) => n >= 12).length, arrivable, landable,
             beachheads: beachheads.length, frontage, pads: pads.length, padsOk,
             beachWalks, beachOk, piers: piers.length, piersOk,
             padKeepMin: pads.length ? r1(padKeepMin) : null, padQuads: padQuads.size },
  };
}
