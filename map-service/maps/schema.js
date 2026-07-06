// Parcel map generator — parameter space + battlefield artifact schema (MAP-GENERATOR.md D2).
// The LLM (or gardener/owner UI) only ever emits THESE parameters; the deterministic generator
// turns them into geometry and the validator guarantees playability. clampParams() is the trust
// boundary: any out-of-schema value from an LLM/user collapses to a safe default.

export const ARCHETYPES = ["openSteppe", "forestMaze", "riverCrossing", "boxCanyon", "cliffTerraces", "marshCauseways", "ridgePasses"];
export const PALETTES = ["verdant", "autumn", "volcanic", "tundra", "desert", "swamp", "ashen", "sakura"];
export const LANDMARKS = ["NONE", "STANDING_STONES", "RUINED_TOWER", "CRATER_LAKE", "ANCIENT_BRIDGE", "SHIPWRECK", "GIANT_SKULL", "OBELISK"];

// terrain cell codes (u8 grid; walkability derives from these — grid is the truth, props are décor)
// OOB = outside the parcel's real polygon: not part of the battlefield at all (void / fog rim).
// ---- battle modes a battlefield can host (capability, derived from geometry + content) --------
// A map is ONE artifact; the mode decides who spawns where and what the win-objective is. The
// generator declares which modes a map SUPPORTS (meta.modes) after simulation; the overworld
// picks the mode per match. Every fully-connected map supports DUEL + CLASH by construction.
export const MODES = {
  DUEL:     { sides: 2, bases: "opposed",  objective: "raze_base",   note: "today's two-lane push: attacker S vs defender base N" },
  SIEGE:    { sides: 2, bases: "asymm",    objective: "take_center", note: "Clash-of-Clans: one defender's guards/towers hold the center vs attacker from an edge" },
  CLASH:    { sides: 4, bases: "per_edge",  objective: "last_standing", note: "multi-sided melee: each army bases at its entry edge, all converge — any edge is a start" },
  DOMINION: { sides: 4, bases: "per_edge",  objective: "hold_center",  note: "king-of-the-hill: occupy/hold the central objective" },
  GUARD:    { sides: 1, bases: "center",    objective: "survive",      note: "PvE defend: wild/pet monsters guard the center, waves attack from every edge" },
};
export const MODE_IDS = Object.keys(MODES);

export const T = { OPEN: 0, FOREST: 1, ROCK: 2, WATER: 3, CLIFF: 4, ROAD: 5, OOB: 6 };
export const BLOCKED = new Set([T.FOREST, T.ROCK, T.WATER, T.CLIFF, T.OOB]); // dense forest blocks; lone trees are props
export const CELL_M = 2;             // world-UNITS per grid cell (±161 frame / 322 → 161×161 grid; ~0.74 m/unit is a label, never a runtime transform)

// ray-cast point-in-polygon (arena/world coords). Deterministic float math only.
export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export const PARAM_SPACE = {         // what the LLM fills — keep expressive but enum/range-bound
  archetype: { enum: ARCHETYPES },
  palette: { enum: PALETTES },
  landmark: { enum: LANDMARKS },
  laneCount: { int: [1, 3] },
  density: { num: [0, 1] },          // obstacle coverage bias
  waterLevel: { num: [0, 1] },       // more/larger water features where the archetype allows
  resourceNodes: { int: [0, 8] },    // gold mines + wood groves on the map  (budget-capped)
  resourceRichness: { num: [0, 1] }, //                                     (budget-capped)
  mobCamps: { int: [0, 6] },         // wild monster camps defending the land (budget-capped)
  towers: { int: [0, 6] },           // land-owned defense towers            (budget-capped)
  barriers: { int: [0, 4] },         // destructible HP-gates sealing shortcuts/pockets (budget-capped)
  roughness: { num: [0, 1] },        // blob irregularity
  mirrorFair: { bool: true },        // PVP fairness: mirror lanes/spawns/resources (decor stays asymmetric)
};

// ---- investment tiers (landowner CT re-investment → what the map may contain) ---------------
// The OVERWORLD owns the CT math (battle rake → landowner, invest costs); we own what each tier
// UNLOCKS. A tier is a hard budget: the LLM is TOLD it (designs within it) but never trusted —
// clampParams enforces it, the validator guarantees the result plays. "Fighting in a gold mine"
// is a tier-5 map; a fresh parcel can't fake it.
export const INVEST_TIERS = [
  { level: 0, name: "Untamed",    resourceNodes: 2, maxRichness: 0.40, mobCamps: 1, towers: 0, barriers: 0, landmark: false },
  { level: 1, name: "Settled",    resourceNodes: 3, maxRichness: 0.55, mobCamps: 2, towers: 1, barriers: 0, landmark: false },
  { level: 2, name: "Developed",  resourceNodes: 4, maxRichness: 0.70, mobCamps: 3, towers: 2, barriers: 1, landmark: true },
  { level: 3, name: "Prosperous", resourceNodes: 5, maxRichness: 0.85, mobCamps: 4, towers: 3, barriers: 2, landmark: true },
  { level: 4, name: "Rich Vein",  resourceNodes: 6, maxRichness: 1.00, mobCamps: 5, towers: 4, barriers: 3, landmark: true },
  { level: 5, name: "Golden",     resourceNodes: 8, maxRichness: 1.00, mobCamps: 6, towers: 6, barriers: 4, landmark: true },
];
// destructible HP-gates: an obstacle with hitpoints that seals a SHORTCUT or resource pocket —
// never a main lane/route (those stay open, so the dumb NPC always has a path). Breaking one
// opens its `opens` cells → a new route. The sim/NPC must know: gate = attackable, drops walk cells.
export const BARRIER_KINDS = ["FOREST_WALL", "BOULDER_PILE", "PORTCULLIS", "ICE_WALL"];
export const budgetFor = (lv) => INVEST_TIERS[Math.max(0, Math.min(INVEST_TIERS.length - 1, Number.isInteger(lv) ? lv : 0))];

// ---- detail features: the bounded placement DSL the LLM may emit for fine control ------------
// Each entry is one deterministic op. Coords are NORMALIZED (-1..1 across the arena, 0 = center,
// +z north); radii/widths are fractions of the arena. Still parameters — clamped, budget-capped
// at execution, validator-gated — never raw geometry.
export const FEATURE_SPECS = {
  forestPatch: { x: "n", z: "n", r: "f" },
  rockPatch:   { x: "n", z: "n", r: "f" },
  waterPool:   { x: "n", z: "n", r: "f" },
  clearing:    { x: "n", z: "n", r: "f" },                       // force-open ground (arena, duel pit)
  riverBand:   { axis: ["x", "z"], at: "a", width: "f", fords: [1, 3] },
  ridge:       { x1: "n", z1: "n", x2: "n", z2: "n", passes: [1, 3] },
  road:        { x1: "n", z1: "n", x2: "n", z2: "n" },
  landmarkAt:  { x: "n", z: "n" },                               // places params.landmark here
  resourceAt:  { x: "n", z: "n", res: ["GOLD_MINE", "WOOD_GROVE"] }, // counts against the budget
  mobCampAt:   { x: "n", z: "n" },                               // counts against the budget
  towerAt:     { x: "n", z: "n" },                               // counts against the budget
};
export const MAX_FEATURES = 24;
const _n = (v) => (typeof v === "number" && isFinite(v)) ? Math.max(-1, Math.min(1, v)) : 0;
export function clampFeatures(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const f of list) {
    if (out.length >= MAX_FEATURES) break;
    const spec = f && typeof f === "object" && FEATURE_SPECS[f.kind];
    if (!spec) continue;
    const c = { kind: f.kind };
    for (const [k, s] of Object.entries(spec)) {
      const v = f[k];
      if (Array.isArray(s) && typeof s[0] === "string") c[k] = s.includes(v) ? v : s[0];
      else if (Array.isArray(s)) c[k] = Number.isInteger(v) ? Math.max(s[0], Math.min(s[1], v)) : s[0];
      else if (s === "f") c[k] = (typeof v === "number" && isFinite(v)) ? Math.max(0.02, Math.min(0.3, v)) : 0.12;
      else if (s === "a") c[k] = (typeof v === "number" && isFinite(v)) ? Math.max(0.1, Math.min(0.9, v)) : 0.5;
      else c[k] = _n(v);
    }
    out.push(c);
  }
  return out;
}

export function clampParams(p, budget = null) {
  const src = p && typeof p === "object" ? p : {};
  const out = {};
  for (const [k, spec] of Object.entries(PARAM_SPACE)) {
    const v = src[k];
    if (spec.enum) out[k] = spec.enum.includes(v) ? v : spec.enum[0];
    else if (spec.int) out[k] = Number.isInteger(v) ? Math.max(spec.int[0], Math.min(spec.int[1], v)) : spec.int[0];
    else if (spec.num) out[k] = (typeof v === "number" && isFinite(v)) ? Math.max(spec.num[0], Math.min(spec.num[1], v)) : 0.5;
    else if (spec.bool !== undefined) out[k] = typeof v === "boolean" ? v : spec.bool;
  }
  out.features = clampFeatures(src.features);         // optional detail DSL (empty = archetype-only)
  if (budget) {                                       // investment budget = hard ceiling, whatever was asked
    out.resourceNodes = Math.min(out.resourceNodes, budget.resourceNodes);
    out.resourceRichness = Math.min(out.resourceRichness, budget.maxRichness);
    out.mobCamps = Math.min(out.mobCamps, budget.mobCamps);
    out.towers = Math.min(out.towers, budget.towers);
    out.barriers = Math.min(out.barriers, budget.barriers ?? 0);
    if (!budget.landmark) out.landmark = "NONE";
  }
  return out;
}

// grid helpers -------------------------------------------------------------
export const gIdx = (G, cx, cz) => cz * G + cx;
export const inG = (G, cx, cz) => cx >= 0 && cz >= 0 && cx < G && cz < G;
export const worldOf = (G, c) => (c + 0.5) * CELL_M - (G * CELL_M) / 2;   // cell → MOBA coord (center origin)
export const cellOf = (G, w) => Math.max(0, Math.min(G - 1, Math.floor((w + (G * CELL_M) / 2) / CELL_M)));
export const isBlocked = (g, i) => BLOCKED.has(g[i]);
export const b64 = (u8) => Buffer.from(u8).toString("base64");
