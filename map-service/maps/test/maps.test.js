// Map generator tests — MAP-GENERATOR.md "definition of done":
//   20 parcels → 20 distinct valid battlefields in <2s · same seed ⇒ byte-identical ·
//   every edge pathable to base on every map · owner-prompt (params) path validates ·
//   hostile/garbage LLM params can't break anything · registry lifecycle + freeze.
import fs from "fs";
import os from "os";
import path from "path";
import { generate, seedFor, paramsFromSeed } from "../generate.js";
import { clampParams, T, gIdx, cellOf, CELL_M } from "../schema.js";
import { erode } from "../validate.js";
import * as reg from "../registry.js";

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗ FAIL", name); } };

const decode = (s) => new Uint8Array(Buffer.from(s, "base64"));
// independent re-check (not the generator's own claim): BFS on the eroded walk grid from each edge to the base
function edgesReachBase(art) {
  const G = art.terrain.w, g = decode(art.terrain.cells);
  const e = erode(g, G);
  const base = art.spawnZones.find((s) => s.id === "def_base");
  const bi = gIdx(G, cellOf(G, base.x), cellOf(G, base.z));
  const par = new Int32Array(G * G).fill(-2); const q = [];
  const seed = e[bi] ? bi : (() => { for (let r = 1; r < 10; r++) for (let d = -r; d <= r; d++) { for (const i of [bi + d, bi + d * G]) if (i >= 0 && i < G * G && e[i]) return i; } return bi; })();
  par[seed] = -1; q.push(seed);
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % G, z = (i / G) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= G || nz >= G) continue;
      const ni = nz * G + nx;
      if (par[ni] === -2 && e[ni]) { par[ni] = i; q.push(ni); }
    }
  }
  const hit = (cells) => cells.some((i) => par[i] !== -2);
  return hit([...Array(G)].map((_, t) => t)) && hit([...Array(G)].map((_, t) => (G - 1) * G + t)) &&
         hit([...Array(G)].map((_, t) => t * G)) && hit([...Array(G)].map((_, t) => t * G + G - 1));
}

console.log("— determinism —");
{
  const parcel = { parcelId: "60203370020", biome: "verdant", zone: "EDU" };
  const a = JSON.stringify(generate(parcel)), b = JSON.stringify(generate(parcel));
  ok(a === b, "same parcel twice ⇒ byte-identical artifact");
  ok(JSON.stringify(generate(parcel, null, 1)) !== a, "new designVersion ⇒ different map (fresh roll)");
  ok(seedFor("A", "x", "y") !== seedFor("B", "x", "y"), "different parcels ⇒ different seeds");
}

console.log("— 20-parcel bench: distinct + valid + fast —");
{
  const t0 = process.hrtime.bigint();
  const arts = [];
  for (let i = 0; i < 20; i++) arts.push(generate({ parcelId: "6020" + (100 + i * 37) + "00" + i, biome: "b" + (i % 3), zone: "Z" }));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  ok(ms < 2000, `20 battlefields in ${ms.toFixed(0)}ms (<2000ms)`);
  ok(new Set(arts.map((a) => JSON.stringify(a.terrain))).size === 20, "all 20 terrains distinct");
  ok(arts.every(edgesReachBase), "EVERY edge reaches the base area on all 20 (reinforcement rule)");
  ok(arts.every((a) => a.lanes.length === a.laneCount && a.lanes.every((l) => l.length >= 2)), "lanes present with ≥2 waypoints");
  ok(arts.every((a) => a.obstacles.length > 0 && a.buildSpots.length >= 7 && a.resources.length >= 1), "props, anchors, resources emitted");
  const kinds = new Set(arts.map((a) => a.meta.params.archetype));
  ok(kinds.size >= 4, `archetype variety across parcels (${[...kinds].join(",")})`);
}

console.log("— hostile / owner params —");
{
  const junk = clampParams({ archetype: "DROP TABLE", laneCount: 99, density: 1e9, waterLevel: -5, landmark: "<script>", mirrorFair: "yes" });
  ok(junk.archetype === "openSteppe" && junk.laneCount === 3 && junk.density === 1 && junk.waterLevel === 0 && junk.landmark === "NONE" && junk.mirrorFair === true, "garbage LLM output clamps to safe values (laneCount 99→3, enums→defaults)");
  const themed = generate({ parcelId: "P-VOLCANO", biome: "volcanic", zone: "WILD", investLevel: 4 },
    { archetype: "riverCrossing", palette: "volcanic", landmark: "RUINED_TOWER", laneCount: 3, density: 0.9, waterLevel: 1, resourceNodes: 4, resourceRichness: 1, roughness: 0.8, mirrorFair: true });
  ok(edgesReachBase(themed), "max-density owner prompt still passes edge-pathability (validator gate)");
  ok(themed.lanes.length === 3, "3-lane owner request honoured");
  ok(themed.obstacles[0].kind === "RUINED_TOWER", "landmark stamped");
  const cells = decode(themed.terrain.cells), walk = decode(themed.terrain.walk);
  ok(cells.includes(T.WATER) && walk.includes(0) && walk.includes(1), "terrain + walk mask baked");
}

console.log("— detail features (LLM placement DSL) —");
{
  const { clampFeatures, budgetFor: bf } = await import("../schema.js");
  const junk = clampFeatures([{ kind: "nukeMap" }, { kind: "forestPatch", x: 99, z: -99, r: 9 }, "garbage", null,
    ...Array.from({ length: 40 }, () => ({ kind: "road", x1: 0, z1: 0, x2: 1, z2: 1 }))]);
  ok(junk.length === 24 && junk[0].kind === "forestPatch" && junk[0].x === 1 && junk[0].r === 0.3, "junk kinds dropped, coords/radii clamped, 24-cap enforced");
  const feats = [
    { kind: "riverBand", axis: "x", at: 0.3, width: 0.06, fords: 2 },
    { kind: "clearing", x: 0, z: 0, r: 0.12 },
    { kind: "landmarkAt", x: 0.5, z: 0.5 },
    { kind: "resourceAt", x: -0.4, z: 0.1, res: "GOLD_MINE" }, { kind: "resourceAt", x: 0.4, z: 0.1, res: "GOLD_MINE" },
    { kind: "resourceAt", x: 0, z: -0.5, res: "WOOD_GROVE" }, { kind: "resourceAt", x: 0, z: 0.5, res: "WOOD_GROVE" },
    { kind: "mobCampAt", x: 0.2, z: -0.2 }, { kind: "towerAt", x: 0, z: 0.6 },
  ];
  const p = { archetype: "openSteppe", palette: "autumn", landmark: "OBELISK", laneCount: 1, density: 0.3, waterLevel: 0.5,
    resourceNodes: 8, resourceRichness: 0.8, mobCamps: 2, towers: 2, roughness: 0.4, mirrorFair: true, features: feats };
  const a = generate({ parcelId: "FEAT1", investLevel: 3 }, p);
  const cells = decode(a.terrain.cells), G = a.terrain.w;
  let water = 0; for (let x = 0; x < G; x++) for (let dz = -6; dz <= 6; dz++) if (cells[(Math.round(0.3 * G) + dz) * G + x] === T.WATER) water++;
  ok(water > G, "riverBand painted where requested (row ~0.3)");
  const lm = a.obstacles.find((o) => o.kind === "OBELISK");
  ok(lm && Math.abs(lm.x - 0.5 * (161 * 0.92)) < 15 && Math.abs(lm.z - 0.5 * (161 * 0.92)) < 15, "landmarkAt places the landmark");
  ok(a.resources.length === 5 && a.resources.filter((r) => r.kind === "GOLD_MINE").length >= 2, "explicit resourceAt honoured, budget cap (tier-3 = 5) still enforced over 4 explicit + fill");
  ok(a.mobs.length === 2 && a.structures.length === 2, "explicit camp/tower placements + fill respect param counts");
  ok(JSON.stringify(generate({ parcelId: "FEAT1", investLevel: 3 }, p)) === JSON.stringify(a), "featured generation byte-identical");
  // adversarial: 12 ridges trying to wall the map — validator must still deliver pathability
  const walls = Array.from({ length: 12 }, (_, i) => ({ kind: "ridge", x1: -1, z1: -0.9 + i * 0.15, x2: 1, z2: -0.9 + i * 0.15, passes: 1 }));
  const hostile = generate({ parcelId: "FEAT-HOSTILE" }, { ...p, features: walls, landmark: "NONE" });
  ok(edgesReachBase(hostile), "ridge-spam map still passes every-edge pathability (validator carves)");
}

console.log("— FIRM connectivity: every edge ↔ center ↔ every edge —");
{
  // independent full-connectivity check (shape-agnostic): BFS from center on the eroded walk
  // grid; EVERY entry point (spawn zones = the actual edge/bearing entrances) + center must be
  // in that one component. This is exactly "any edge → center → any other edge".
  function fullyConnected(art) {
    const G = art.terrain.w, g = decode(art.terrain.cells), e = erode(g, G), h = G >> 1;
    const nrOpen = (cx, cz) => { for (let r = 0; r < 12; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const x = cx + dx, z = cz + dz; if (x >= 0 && z >= 0 && x < G && z < G && e[gIdx(G, x, z)]) return gIdx(G, x, z); } return -1; };
    const seed = nrOpen(h, h); if (seed < 0) return false;
    const seen = new Uint8Array(G * G), q = [seed]; seen[seed] = 1;
    for (let k = 0; k < q.length; k++) { const i = q[k], x = i % G, z = (i / G) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= G || nz >= G) continue; const ni = nz * G + nx; if (!seen[ni] && e[ni]) { seen[ni] = 1; q.push(ni); } } }
    const near = (wx, wz) => { const s = nrOpen(cellOf(G, wx), cellOf(G, wz)); return s >= 0 && seen[s]; };
    return art.spawnZones.every((s) => near(s.x, s.z));   // every entrance reaches center
  }
  const arts = [];
  for (let i = 0; i < 30; i++) arts.push(generate({ parcelId: "CONN" + i, biome: "b" + (i % 4), zone: "Z" }));
  ok(arts.every(fullyConnected), "30 seed maps: every entrance (all edges) connects through center");
  // adversarial: a hostile max-obstacle prompt is still repaired to full connectivity
  const walled = generate({ parcelId: "WALL1", investLevel: 3 }, { archetype: "boxCanyon", palette: "ashen", landmark: "NONE", laneCount: 3, density: 1, waterLevel: 1, resourceNodes: 2, resourceRichness: 0.3, mobCamps: 0, towers: 0, roughness: 0.9, mirrorFair: true });
  ok(fullyConnected(walled), "max-obstacle box-canyon repaired to full edge↔center connectivity");
  // polygon parcels connect too
  const hex = [[0, 0], [8, 3], [10, 10], [4, 13], [-3, 9], [-2, 2]];
  ok(fullyConnected(generate({ parcelId: "HEXCONN", polygon: hex })), "polygon parcel: every entrance connects through center");
}

console.log("— per-edge NPC routes: a follow-path from every arrival edge to center —");
{
  const decode = (b) => Uint8Array.from(Buffer.from(b, "base64"));
  const walkAt = (art, x, z) => { const G = art.terrain.w, w = decode(art.terrain.walk); return w[gIdx(G, cellOf(G, x), cellOf(G, z))] === 1; };
  function routesOk(art) {
    const arrivals = art.spawnZones.filter((s) => s.side === "ANY" || s.side === "ATTACKER");
    if (art.routes.length !== arrivals.length) return false;
    for (const r of art.routes) {
      if (r.wp.length < 2) return false;
      const start = r.wp[0], end = r.wp[r.wp.length - 1];
      const entry = arrivals.find((s) => s.id === r.from);
      // route begins near its entry, ends near center (0,0), and every waypoint is walkable
      if (Math.hypot(start[0] - entry.x, start[1] - entry.z) > 20) return false;
      if (Math.hypot(end[0], end[1]) > 24) return false;
      if (!r.wp.every(([x, z]) => walkAt(art, x, z))) return false;
    }
    return true;
  }
  let ok1 = true;
  for (let i = 0; i < 20; i++) if (!routesOk(generate({ parcelId: "RTE" + i, biome: "b" + (i % 3), zone: "Z" }))) { ok1 = false; console.log("   route fail RTE" + i); }
  ok(ok1, "20 seed maps: every arrival edge has a walkable entry→center route");
  ok(routesOk(generate({ parcelId: "RTEHEX", polygon: [[0, 0], [8, 3], [10, 10], [4, 13], [-3, 9], [-2, 2]] })), "hex parcel: all 6 edge routes reach center on walkable ground");
  const walled = generate({ parcelId: "RTEWALL", investLevel: 3 }, { archetype: "boxCanyon", palette: "ashen", landmark: "NONE", laneCount: 3, density: 1, waterLevel: 1, resourceNodes: 2, resourceRichness: 0.3, mobCamps: 0, towers: 0, roughness: 0.9, mirrorFair: true });
  ok(routesOk(walled), "max-obstacle canyon: routes still carve from every edge to center");
}

console.log("— destructible HP-gates: optional shortcuts, never the main path —");
{
  const decode = (b) => Uint8Array.from(Buffer.from(b, "base64"));
  // tier-0 has no barrier budget; a high-tier invested map can carry gates
  const t0 = generate({ parcelId: "BAR0", investLevel: 0 });
  ok((t0.barriers || []).length === 0, "tier-0 map has no HP-gates (budget 0)");
  // force gates via explicit params at a tier that allows them
  const g5 = generate({ parcelId: "BAR5", investLevel: 5 }, { archetype: "forestMaze", palette: "verdant", landmark: "NONE", laneCount: 3, density: 0.7, waterLevel: 0.2, resourceNodes: 6, resourceRichness: 0.7, mobCamps: 2, towers: 2, barriers: 4, roughness: 0.6, mirrorFair: true });
  ok(g5.barriers.length >= 1 && g5.barriers.length <= 4, "invested forest map places 1–4 gates (budget-capped): " + g5.barriers.length);
  // every gate: valid kind, positive hp, opens ≥1 cell, and each opened cell is CURRENTLY blocked
  const G = g5.terrain.w, walk = decode(g5.terrain.walk);
  const wblk = (x, z) => walk[gIdx(G, cellOf(G, x), cellOf(G, z))] === 0;
  ok(g5.barriers.every((b) => b.kind && b.hp > 0 && b.opens.length >= 1 && b.opens.every(([x, z]) => wblk(x, z))), "every gate opens currently-blocked ground (a real breach)");
  // no gate cell sits on a lane/route waypoint (the guaranteed path stays clear)
  const routeCells = new Set();
  for (const wp of [...g5.lanes, ...g5.routes.map((r) => r.wp)]) for (const [x, z] of wp) routeCells.add(gIdx(G, cellOf(G, x), cellOf(G, z)));
  ok(g5.barriers.every((b) => b.opens.every(([x, z]) => !routeCells.has(gIdx(G, cellOf(G, x), cellOf(G, z))))), "no gate blocks a lane/route cell (dumb NPC path unaffected)");
  // deterministic: same seed → identical gates
  const a = generate({ parcelId: "BARDET", investLevel: 4 }), b = generate({ parcelId: "BARDET", investLevel: 4 });
  ok(JSON.stringify(a.barriers) === JSON.stringify(b.barriers), "gates are deterministic (same seed → identical)");
}

console.log("— simulation gate: unwritten-rules approval before deploy —");
{
  const { simulate } = await import("../simulate.js");
  // every seeded map must pass the sim gate (the validator already guarantees the hard backbone)
  let allPass = true, allDuel = true;
  for (let i = 0; i < 25; i++) {
    const s = simulate(generate({ parcelId: "SIM" + i, biome: "b" + (i % 4), zone: "Z" }));
    if (!s.pass) { allPass = false; console.log("   sim fail SIM" + i + ":", s.summary); }
    if (!s.modes.includes("DUEL")) allDuel = false;
  }
  ok(allPass, "25 seed maps all PASS the simulation gate (hard rules)");
  ok(allDuel, "every passing map supports at least DUEL mode");
  // a heavily-DEFENDED invested map hosts SIEGE/GUARD (interior guards + a reachable assault route)
  const rich = simulate(generate({ parcelId: "SIMRICH", investLevel: 5 }, { archetype: "openSteppe", palette: "verdant", landmark: "OBELISK", laneCount: 3, density: 0.3, waterLevel: 0.2, resourceNodes: 8, resourceRichness: 0.8, mobCamps: 6, towers: 4, roughness: 0.3, mirrorFair: true }));
  ok(rich.pass && rich.modes.includes("SIEGE") && rich.modes.includes("GUARD"), "rich defended map hosts SIEGE + GUARD: " + rich.summary);
  // an OPEN, fair, lightly-defended map hosts the multi-sided modes (no edge kill-box → fair CLASH)
  const openFair = simulate(generate({ parcelId: "SIMOPEN", investLevel: 2 }, { archetype: "openSteppe", palette: "verdant", landmark: "NONE", laneCount: 3, density: 0.15, waterLevel: 0.1, resourceNodes: 4, resourceRichness: 0.6, mobCamps: 0, towers: 0, roughness: 0.2, mirrorFair: true }));
  ok(openFair.pass && openFair.modes.includes("CLASH") && openFair.modes.includes("DOMINION"), "open fair map hosts CLASH + DOMINION: " + openFair.summary);
  // every hard check has a boolean verdict + human detail (report is well-formed for the queue UI)
  const anySim = simulate(generate({ parcelId: "SIMSHAPE" }));
  ok(anySim.checks.length >= 6 && anySim.checks.every((c) => typeof c.ok === "boolean" && c.detail), "sim report is well-formed (checks with ok + detail)");
  ok(anySim.score >= 0 && anySim.score <= 100 && typeof anySim.summary === "string", "sim yields a 0-100 score + summary string");
  // the artifact itself advertises its approved modes to the game/loader
  const art = generate({ parcelId: "SIMMETA", investLevel: 2 });
  const sm = simulate(art); art.meta.modes = sm.modes;   // registry does this on save
  ok(Array.isArray(sm.modes) && sm.modes.length >= 1, "artifact meta.modes advertises supported battle modes");
}

console.log("— investment budgets (landowner CT → map content caps) —");
{
  const { clampParams, budgetFor } = await import("../schema.js");
  const greedy = { archetype: "riverCrossing", palette: "volcanic", landmark: "OBELISK", laneCount: 1, density: 0.5,
    waterLevel: 0.5, resourceNodes: 99, resourceRichness: 1, mobCamps: 99, towers: 99, roughness: 0.5, mirrorFair: true };
  const t0 = clampParams(greedy, budgetFor(0));
  ok(t0.resourceNodes === 2 && t0.resourceRichness === 0.4 && t0.mobCamps === 1 && t0.towers === 0 && t0.landmark === "NONE",
     "tier-0 budget clamps a greedy LLM (2 nodes, richness 0.4, no towers, no landmark)");
  const t5 = clampParams(greedy, budgetFor(5));
  ok(t5.resourceNodes === 8 && t5.towers === 6 && t5.mobCamps === 6 && t5.landmark === "OBELISK", "tier-5 unlocks the full map");
  const poor = generate({ parcelId: "BUD0", investLevel: 0 }, greedy);
  const rich = generate({ parcelId: "BUD5", investLevel: 5 }, greedy);
  ok(poor.resources.length === 2 && poor.structures.length === 0 && poor.mobs.length <= 1, "tier-0 artifact is sparse");
  ok(rich.resources.length === 8 && rich.structures.length === 6 && rich.mobs.length === 6, "tier-5 artifact = fighting in a gold mine (8 nodes, 6 towers, 6 camps)");
  ok(poor.resources.every((r) => r.richness <= 0.4) && rich.resources.every((r) => r.richness <= 1), "richness respects the tier cap");
  ok(poor.meta.budget.name === "Untamed" && rich.meta.budget.name === "Golden", "tier recorded in artifact meta");
  ok(rich.structures.every((s) => s.hpMax === 1600 + 5 * 250 && s.side === "DEFENDER") && rich.mobs.every((m) => m.count >= 4 + 5), "tier scales tower HP + camp size (allocate-contract shape)");
  ok(JSON.stringify(generate({ parcelId: "BUD5", investLevel: 5 }, greedy)) === JSON.stringify(rich), "budgeted generation byte-identical");
}

console.log("— real parcel polygon (hexagon cut-out) —");
{
  const { pointInPoly } = await import("../schema.js");
  const hex = [[10, 8], [10.87, 8.5], [10.87, 9.5], [10, 10], [9.13, 9.5], [9.13, 8.5]]; // world-snapshot-like coords
  const parcel = { parcelId: "HEX1", biome: "verdant", zone: "WILD", polygon: hex };
  const a = generate(parcel);
  ok(a.arena.shape === "polygon" && a.arena.bounds.length === 6, "arena carries the normalized polygon");
  const cells = decode(a.terrain.cells), G = a.terrain.w;
  ok(cells[0] === T.OOB && cells[G - 1] === T.OOB && cells[(G - 1) * G] === T.OOB, "grid corners are out-of-bounds (hexagon cuts them)");
  ok(cells.includes(T.OOB) && cells.includes(T.OPEN), "inside/outside both present");
  const walk = decode(a.terrain.walk);
  ok(cells.every((c, i) => c !== T.OOB || walk[i] === 0), "OOB is never walkable");
  const inside = (x, z) => pointInPoly(x, z, a.arena.bounds);
  ok(a.spawnZones.every((s) => inside(s.x, s.z)), "all spawn zones inside the parcel");
  ok(a.resources.every((r) => inside(r.x, r.z)) && a.buildSpots.every((b) => inside(b.x, b.z)), "resources + build spots inside the parcel");
  ok(a.lanes.every((l) => l.every(([x, z]) => inside(x, z))), "every lane waypoint inside the parcel");
  ok(a.obstacles.every((o) => o.kind === "TREE" || o.kind === "ROCK" ? inside(o.x, o.z) : true), "props inside the parcel");
  ok(JSON.stringify(generate(parcel)) === JSON.stringify(a), "polygon generation byte-identical");
  // pathability: attacker spawn reaches the base on the eroded walk grid
  const e = erode(cells, G);
  const atk = a.spawnZones.find((s) => s.id === "atk_S"), base = a.spawnZones.find((s) => s.id === "def_base");
  const start = gIdx(G, cellOf(G, atk.x), cellOf(G, atk.z)), goal = gIdx(G, cellOf(G, base.x), cellOf(G, base.z));
  const par = new Int32Array(G * G).fill(-2); const q = [];
  const s0 = e[goal] ? goal : (() => { for (let r = 1; r < 8; r++) for (const c of [goal + r, goal - r, goal + r * G, goal - r * G]) if (c >= 0 && c < G * G && e[c]) return c; return goal; })();
  par[s0] = -1; q.push(s0);
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % G, z = (i / G) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= G || nz >= G) continue; const ni = nz * G + nx;
      if (par[ni] === -2 && e[ni]) { par[ni] = i; q.push(ni); } } }
  let reached = false;
  for (let dz = -4; dz <= 4 && !reached; dz++) for (let dx = -4; dx <= 4 && !reached; dx++) {
    const i = start + dz * G + dx; if (i >= 0 && i < G * G && par[i] !== -2) reached = true;
  }
  ok(reached, "attacker spawn pathable to base inside the polygon");
}

console.log("— RUIN: the seeded Chronicle layer (depth-layer 1) —");
{
  const { RUIN_TYPES } = await import("../chronicle.js");
  const { toBattlefieldA1 } = await import("../command_converter.js");
  const ruinOf = (a) => (a.obstacles || []).find((o) => o.kind === "RUIN") || null;
  // density band + shape over a seeded batch (~1 in 7 target; band allows binomial noise)
  const arts = [];
  for (let i = 0; i < 70; i++) arts.push(generate({ parcelId: "RUINP" + i, biome: "b" + (i % 3), zone: ["EDU", "HUB", "BUS", "ENT"][i % 4] }));
  const ruined = arts.filter((a) => ruinOf(a));
  ok(ruined.length >= 3 && ruined.length <= 20, `ruin density in the 1-in-6–10 band: ${ruined.length}/70 parcels`);
  ok(ruined.every((a) => { const r = ruinOf(a); return RUIN_TYPES.includes(r.ruinType) && r.name && r.inscription && r.r > 0; }),
     "every ruin carries a valid ruinType + Chronicle name + one-line inscription");
  ok(arts.every((a) => (a.obstacles || []).filter((o) => o.kind === "RUIN").length <= 1), "at most one ruin per parcel");
  // placement: on OPEN walkable ground, away from both duel bases (never breaks a route — décor only)
  ok(ruined.every((a) => {
    const r = ruinOf(a), G = a.terrain.w, walk = decode(a.terrain.walk);
    if (walk[gIdx(G, cellOf(G, r.x), cellOf(G, r.z))] !== 1) return false;
    const atk = a.spawnZones.find((s) => s.id === "atk_S"), def = a.spawnZones.find((s) => s.id === "def_base");
    return Math.hypot(r.x - atk.x, r.z - atk.z) >= 40 && Math.hypot(r.x - def.x, r.z - def.z) >= 40;
  }), "every ruin sits on open walkable ground, clear of both bases");
  ok(ruined.every(edgesReachBase), "ruined maps still pass every-edge pathability (décor breaks no route)");
  // determinism: same parcel ⇒ same ruin, byte-identical artifact
  const twin = ruined[0] ? generate({ parcelId: ruined[0].meta.parcelId, biome: ruined[0].meta.biome, zone: ruined[0].meta.zone }) : null;
  ok(twin && JSON.stringify(ruinOf(twin)) === JSON.stringify(ruinOf(ruined[0])), "same parcel ⇒ identical ruin (seeded)");
  // castle parcels never roll a ruin (living strongholds are not ruins)
  const rp = ruined[0].meta;
  const castled = generate({ parcelId: rp.parcelId, biome: rp.biome, zone: rp.zone,
    worldField: { rivers: [], roads: [], ridges: [], edgeCrossings: [], castles: [{ id: "T-KEEP", kind: "KEEP", name: "Test Keep", at: [20, 20] }] } });
  ok(ruinOf(castled) === null, "a castle parcel never rolls a ruin");
  // A1 pass-through: the ruin rides obstacles[] as a passable décor anchor with its lore intact
  const bf = toBattlefieldA1(ruined[0]);
  const bfRuin = (bf.obstacles || []).find((o) => o.kind === "RUIN");
  ok(bfRuin && bfRuin.passable === true && bfRuin.ruinType === ruinOf(ruined[0]).ruinType
     && bfRuin.name === ruinOf(ruined[0]).name && bfRuin.inscription === ruinOf(ruined[0]).inscription,
     "toBattlefieldA1 carries the ruin as passable décor with ruinType/name/inscription");
  // zone flavor: the same table reads differently per zone culture (seed includes zone)
  const zoneNames = new Set(ruined.map((a) => ruinOf(a).name));
  ok(zoneNames.size >= 2, `ruin names vary across the batch (${zoneNames.size} distinct)`);
}

console.log("— registry lifecycle —");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "efmaps-"));
  reg._resetForTest(tmp);
  const parcel = { parcelId: "777001", biome: "swamp", zone: "WILD" };
  ok(reg.getRow("777001") === null, "unknown parcel ⇒ UNDESIGNED (no row)");
  const { row, artifact } = reg.ensureDesign(parcel);
  ok(row.status === "SEED_V0" && artifact.meta.designVersion === 0, "lazy first request generates + persists v0");
  ok(JSON.stringify(reg.ensureDesign(parcel).artifact) === JSON.stringify(artifact), "second request reads the SAVED artifact");
  const r2 = reg.regenerate(parcel, { archetype: "forestMaze" }, { directive: "dense woods" });
  ok(r2.row.designVersion === 1 && r2.row.status === "AI_ITERATED", "regenerate bumps version");
  ok(reg.readArtifact("777001", 0) !== null && reg.readArtifact("777001", 1) !== null, "version history kept (immutable artifacts)");
  reg.freeze("777001", true);
  ok(reg.regenerate(parcel, {}, {}).error === "frozen", "gardener blocked on OWNER_FROZEN");
  ok(reg.regenerate(parcel, { palette: "ashen" }, { byOwner: true }).row.designVersion === 2, "owner can still iterate while frozen");
  ok(reg.list().length === 1 && reg.list("OWNER_FROZEN").length === 1, "manifest list + status filter");
  ok(fs.readFileSync(path.join(tmp, "prompts.log"), "utf8").includes("dense woods"), "directive→params logged (POCA training data)");
}

console.log(`\n${fail ? "❌" : "✅"} maps: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
