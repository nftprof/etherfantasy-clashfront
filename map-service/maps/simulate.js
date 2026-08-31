// Battle simulation gate (MAP-GENERATOR.md D5). This is the "unwritten rules" engine: after a
// map is generated it must PASS this before it can be deployed/frozen — the reason a landowner
// pays to upgrade is that the new map is *simulated and approved*, not just drawn. Everything
// here is a pure, deterministic graph analysis on the artifact (no engine, no rng) so it can run
// server-side in the approval queue and give byte-identical verdicts.
//
// The validator (validate.js) already GUARANTEES the hard geometric backbone (every edge ↔ center
// ↔ every edge). This layer verifies the *game-fairness* rules a human designer knows implicitly
// and decides which battle MODES the map may host:
//   • flow: all entrances reach center AND each other (multi-sided reinforcement)         [hard]
//   • choke: the tightest corridor on the flow is wide enough that armies don't jam       [hard]
//   • fair-start: candidate bases are ~equidistant to center (no army starts 2× closer)   [clash]
//   • spawn-safety: no entrance drops you inside an enemy tower/guard kill-box             [hard]
//   • reach: every resource / build spot / objective sits on reachable open ground        [hard]
//   • lanes: each declared lane is a real pathable chain (dumb NPC can follow it)          [hard]
//   • siege-balance: guards exist between edges and center, but a beatable path remains    [siege]
import { T, gIdx, inG, cellOf, worldOf, isBlocked, CELL_M, MODES } from "./schema.js";
import { erode } from "./validate.js";

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const dec = (s) => new Uint8Array(Buffer.from(s, "base64"));
const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

// tunables (world units / cells). Deliberately conservative — a rejected map just re-rolls.
const MIN_CHOKE_CELLS = 1;     // eroded clearance ≥1 ⇒ real corridor ≥3 cells (~6 m) wide
const SAFE_SPAWN_M = 22;       // an entrance must be this far from any enemy structure/mob
const FAIR_RATIO = 1.6;        // farthest-base ÷ nearest-base path distance ceiling (clash)

// multi-source BFS path-distance (in cells) over an eroded walk grid; -1 = unreachable
function bfsDist(e, G, sources) {
  const d = new Int32Array(G * G).fill(-1), q = [];
  for (const i of sources) if (e[i]) { d[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % G, z = (i / G) | 0;
    for (const [dx, dz] of N4) { const nx = x + dx, nz = z + dz; if (!inG(G, nx, nz)) continue; const ni = gIdx(G, nx, nz); if (d[ni] < 0 && e[ni]) { d[ni] = d[i] + 1; q.push(ni); } }
  }
  return d;
}
// clearance transform: for every cell, 4-neighbour distance to the nearest blocked/OOB cell.
// open-cell value = how many cells of corridor sit between it and a wall (the pinch metric).
function clearanceOf(g, G) {
  const d = new Int32Array(G * G).fill(1e9), q = [];
  for (let i = 0; i < G * G; i++) if (isBlocked(g, i)) { d[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % G, z = (i / G) | 0;
    for (const [dx, dz] of N4) { const nx = x + dx, nz = z + dz; if (!inG(G, nx, nz)) continue; const ni = gIdx(G, nx, nz); if (d[ni] > d[i] + 1) { d[ni] = d[i] + 1; q.push(ni); } }
  }
  return d;
}
const nearestOpen = (e, G, cx, cz, rMax = 16) => {
  if (inG(G, cx, cz) && e[gIdx(G, cx, cz)]) return gIdx(G, cx, cz);
  for (let r = 1; r <= rMax; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const x = cx + dx, z = cz + dz; if (inG(G, x, z) && e[gIdx(G, x, z)]) return gIdx(G, x, z);
  }
  return -1;
};
// trace the min clearance along the shortest path from `from` back up a BFS distance field
function minChokeOnPath(dField, clr, G, fromCell) {
  let i = fromCell, min = 1e9, guard = 0;
  while (i >= 0 && dField[i] > 0 && guard++ < G * G) {
    if (clr[i] < min) min = clr[i];
    const x = i % G, z = (i / G) | 0; let nxt = -1, best = dField[i];
    for (const [dx, dz] of N4) { const nx = x + dx, nz = z + dz; if (!inG(G, nx, nz)) continue; const ni = gIdx(G, nx, nz); if (dField[ni] >= 0 && dField[ni] < best) { best = dField[ni]; nxt = ni; } }
    if (nxt < 0) break; i = nxt;
  }
  if (i >= 0 && clr[i] < min) min = clr[i];
  return min === 1e9 ? 0 : min;
}

// simulate(artifact) → { pass, score, modes:[...], checks:[{id,ok,severity,mode?,detail}] }.
// pass = every HARD check ok. modes = the battle modes whose extra requirements are also met.
export function simulate(art) {
  const G = art.terrain.w, g = dec(art.terrain.cells), e = erode(g, G), clr = clearanceOf(g, G);
  const h = G >> 1;
  const cellIx = (wx, wz) => gIdx(G, cellOf(G, wx), cellOf(G, wz));
  const centerCell = nearestOpen(e, G, h, h);
  const checks = [];
  const add = (id, ok, severity, detail, mode) => { checks.push({ id, ok, severity, detail, ...(mode ? { mode } : {}) }); return ok; };

  // entrances = every spawn zone (all edges + bases). These are the points any army can arrive at.
  const entries = (art.spawnZones || []).map((s) => ({ ...s, cell: nearestOpen(e, G, cellOf(G, s.x), cellOf(G, s.z)) }));
  const base = entries.find((s) => s.id === "def_base") || entries[0];

  // ---- FLOW: every entrance reaches the center, and (via center) every other entrance ---------
  const dc = centerCell >= 0 ? bfsDist(e, G, [centerCell]) : new Int32Array(G * G).fill(-1);
  const unreached = entries.filter((s) => !(s.cell >= 0 && dc[s.cell] >= 0));
  add("flow.allEdgesReachCenter", centerCell >= 0 && unreached.length === 0, "hard",
    unreached.length ? `unreachable entries: ${unreached.map((s) => s.id).join(", ")}` : `${entries.length} entrances all connect through center`);

  // ---- CHOKE: tightest corridor on the base→center flow is wide enough to not deadlock --------
  const choke = (base.cell >= 0 && centerCell >= 0) ? minChokeOnPath(dc, clr, G, base.cell) : 0;
  add("choke.minCorridor", choke >= MIN_CHOKE_CELLS, "hard",
    `tightest corridor ≈ ${(choke * 2 + 1) * CELL_M} world-units (need ≥ ${(MIN_CHOKE_CELLS * 2 + 1) * CELL_M})`);

  // ---- SPAWN-SAFETY: no entrance drops inside an ENEMY tower/guard kill-box -------------------
  // Structures/mobs are DEFENDER-side. The defender base sitting among its OWN towers is fine;
  // the hard concern is the ATTACKER's assault spawn dropping under those towers. Reinforcement
  // entries (side ANY) only become "enemy-adjacent" in CLASH (an army bases there) → soft check.
  // ENEMY hazards only: a two-sided map (e.g. the MOBA arena) carries ATTACKER-side structures —
  // the attacker's own core/towers around its spawn are not a kill-box. Unsided structures stay
  // hazards (generated maps' towers/castle rings are defender content).
  // v31: PIER + LANDING_PAD are flat NEUTRAL traversal markers (blocking NONE) — never a
  // defender "unit"; counting them made a shoreline pier fail spawn.safeRadius for free.
  const hazards = [...(art.structures || []).filter((st) => st.side !== "ATTACKER" && st.kind !== "PIER" && st.kind !== "LANDING_PAD"), ...(art.mobs || [])];
  const clearOf = (s) => { let m = Infinity; for (const hz of hazards) { const d = Math.sqrt(dist2(s.x, s.z, hz.x, hz.z)); if (d < m) m = d; } return m; };
  const atkEntries = entries.filter((s) => s.side === "ATTACKER");
  let minSafe = Infinity, worst = null;
  for (const s of atkEntries) { const d = clearOf(s); if (d < minSafe) { minSafe = d; worst = s.id; } }
  add("spawn.safeRadius", !hazards.length || minSafe >= SAFE_SPAWN_M, "hard",
    !hazards.length ? "no guards placed (open field)" : `attacker spawn ${worst} is ${Math.round(minSafe)} u from nearest defender unit (need ≥ ${SAFE_SPAWN_M})`);
  // soft: every reinforcement entry also clears the defenders — required for a fair CLASH base
  const anyEntries = entries.filter((s) => s.side === "ANY");
  const clashSafe = !hazards.length || anyEntries.every((s) => clearOf(s) >= SAFE_SPAWN_M);

  // ---- REACH: resources, build spots, mobs all sit on center-reachable open ground -----------
  const reachable = (pt) => { const c = nearestOpen(e, G, cellOf(G, pt.x), cellOf(G, pt.z)); return c >= 0 && dc[c] >= 0; };
  const stranded = [...(art.resources || []), ...(art.buildSpots || []), ...(art.mobs || [])].filter((p) => !reachable(p));
  add("reach.contentOnOpenGround", stranded.length === 0, "hard",
    stranded.length ? `${stranded.length} placement(s) stranded off the connected area` : "all resources / build spots / camps reachable");

  // ---- LANES: each declared lane is a genuine pathable chain the dumb NPC can walk -------------
  let laneOk = true, laneBad = [];
  for (let li = 0; li < (art.lanes || []).length; li++) {
    const wp = art.lanes[li]; let ok = wp.length >= 2;
    for (const [x, z] of wp) { const c = nearestOpen(e, G, cellOf(G, x), cellOf(G, z)); if (!(c >= 0 && dc[c] >= 0)) ok = false; }
    if (!ok) { laneOk = false; laneBad.push(li); }
  }
  add("lanes.pathable", laneOk, "hard", laneBad.length ? `lanes not pathable: ${laneBad.join(", ")}` : `${(art.lanes || []).length} lane(s) pathable end to end`);

  // ---- BARRIERS: HP-gates may seal only OPTIONAL shortcuts — never a lane/route cell, and each
  //      gate must open currently-blocked ground (a real breach). Keeps the dumb NPC's path clear.
  const routeCells = new Set();
  for (const wp of [...(art.lanes || []), ...((art.routes || []).map((r) => r.wp))]) for (const [x, z] of wp) routeCells.add(cellIx(x, z));
  const walk = dec(art.terrain.walk);
  let barriersOk = true;
  for (const b of (art.barriers || [])) for (const [x, z] of (b.opens || [])) { const ci = cellIx(x, z); if (routeCells.has(ci) || walk[ci] === 1) barriersOk = false; }
  add("barriers.optionalOnly", barriersOk, "hard", (art.barriers || []).length ? `${art.barriers.length} HP-gate(s) seal optional shortcuts only (main path clear)` : "no gates");

  // ---- FAIR-START (clash): a MUTUALLY-FAIR SUBSET of per-edge bases exists --------------------
  // Not "all edges equidistant" — an elongated polygon can never satisfy that (observed spreads up
  // to 119× on sliver arms), yet a CLASH only needs ≥2 fair starts; armies arriving on the other
  // edges keep their geographic (dis)advantage, disclosed. Largest sorted run within FAIR_RATIO.
  const edgeBases = entries.filter((s) => s.canBase);
  const withD = edgeBases.map((s) => ({ id: s.id, d: s.cell >= 0 ? dc[s.cell] : -1 })).filter((o) => o.d > 0).sort((a, b) => a.d - b.d);
  let fairRun = [];
  for (let i = 0; i < withD.length; i++) {
    let j = i;
    while (j + 1 < withD.length && withD[j + 1].d <= withD[i].d * FAIR_RATIO) j++;
    if (j - i + 1 > fairRun.length) fairRun = withD.slice(i, j + 1);
  }
  const fair = fairRun.length >= 2;
  add("fair.startDistance", fair, "soft",
    withD.length >= 2 ? `${fairRun.length}/${withD.length} edge starts mutually fair (spread ≤ ${FAIR_RATIO}×): ${fairRun.map((o) => o.id).join(",") || "none"}` : "fewer than 2 usable edge starts", "CLASH");

  // ---- SIEGE-BALANCE: guards sit between the edges and the center, but a route survives -------
  const guardsMid = hazards.filter((hz) => dist2(hz.x, hz.z, 0, 0) < (art.arena.sizeM * 0.35) ** 2).length;
  const siegeOk = guardsMid >= 1 && centerCell >= 0 && dc[base.cell] >= 0;
  add("siege.beatableGuards", siegeOk, "soft",
    guardsMid ? `${guardsMid} guard(s) defend the interior; a reachable assault route remains` : "no interior defenders — plays as an open brawl, not a siege", "SIEGE");

  // ---- verdict + supported modes -------------------------------------------------------------
  // GEOMETRY decides mode support (owner 2026-07-14: "most maps should support most modes").
  // The DEFENDING content of SIEGE/GUARD (CC, placed towers/walls, pets on guard) is the
  // OCCUPANT's runtime overlay — seeded mobs/towers are only the wild stand-in. So SIEGE/GUARD
  // are supported when the geometry holds (defender base + center reachable — the FIRM rule
  // already guarantees every edge reaches both); `contentReady` reports whether THIS artifact
  // already carries interior defenders (a wild parcel battle is playable as-seeded) or the
  // defense arrives with the occupant.
  const hard = checks.filter((c) => c.severity === "hard");
  const pass = hard.every((c) => c.ok);
  const holdOk = centerCell >= 0 && base.cell >= 0 && dc[base.cell] >= 0;   // a defensible interior exists
  const modes = [];
  if (pass) {
    modes.push("DUEL");                                     // any connected, laned map (2 CCs, raze)
    if (fair && clashSafe) modes.push("CLASH", "DOMINION"); // needs fair multi-edge starts, no kill-box bases
    if (holdOk) modes.push("SIEGE", "GUARD");               // geometry: a reachable interior to defend/clear
  }
  const score = Math.round(100 * checks.filter((c) => c.ok).length / checks.length);
  return { pass, score, modes: modes.length ? modes : (pass ? ["DUEL"] : []), checks,
    contentReady: { siegeGuards: siegeOk },                 // seeded interior defenders present (wild-playable now)
    fairEdges: fairRun.map((o) => o.id),                    // the mutually-fair CLASH/DOMINION start edges
    summary: pass ? `approved · ${modes.join("/") || "DUEL"} · ${score}%` : `rejected · ${hard.filter((c) => !c.ok).map((c) => c.id).join(", ")}` };
}

export { MODES };
