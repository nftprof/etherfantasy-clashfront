// D5 — game-time battlefield loader. Takes the allocate payload's `battlefield` field (inline
// artifact JSON or {ref:{parcelId, designVersion?}}) and returns a match-ready view: decoded
// walkability + terrain grids with O(1) world-coord lookups, lanes/spawns/anchors. The match
// server stamps Layer-2 furniture (towers/CC per battle context) onto buildSpots — designs
// only ever provide anchors (MAP-GENERATOR.md layer split).
// Pure data-load + typed-array decode: no generation at match start unless the ref was never
// designed (then the registry lazily creates v0 — same artifact every time, deterministic).
import * as reg from "./registry.js";

export function loadBattlefield(refOrJson) {
  let art = refOrJson;
  if (refOrJson && refOrJson.ref) {
    const { parcelId, designVersion = null } = refOrJson.ref;
    art = reg.readArtifact(parcelId, designVersion) ||
          reg.ensureDesign({ parcelId: String(parcelId) }).artifact;   // lazy v0 (facts-light)
  }
  if (!art || !art.terrain || !art.arena) throw new Error("bad battlefield payload");

  const G = art.terrain.w, cell = art.terrain.cellM, half = art.arena.sizeM / 2;
  const walk = new Uint8Array(Buffer.from(art.terrain.walk, "base64"));
  const cells = new Uint8Array(Buffer.from(art.terrain.cells, "base64"));
  const cIdx = (w) => Math.max(0, Math.min(G - 1, Math.floor((w + half) / cell)));
  const at = (x, z) => cIdx(z) * G + cIdx(x);

  return {
    artifact: art,
    sizeM: art.arena.sizeM,
    laneCount: art.laneCount,
    lanes: art.lanes,                 // guaranteed-pathable waypoint chains (world coords) — DUEL push
    routes: art.routes || [],         // per-edge entry→center follow-paths (CLASH/GUARD/SIEGE)
    barriers: art.barriers || [],     // destructible HP-gates: {id,kind,x,z,hp,opens[]} — optional shortcuts
    spawnZones: art.spawnZones,
    buildSpots: art.buildSpots,
    resources: art.resources,
    mobs: art.mobs || [],             // wild camps (investment content) — game-time spawns
    structures: art.structures || art.defenses || [],  // land-owned anchors (allocate-contract name)
    obstacles: art.obstacles,         // render/prop list — the GRID is the movement truth
    blockedAt: (x, z) => walk[at(x, z)] === 0,
    terrainAt: (x, z) => cells[at(x, z)],   // T.* code (schema.js)
    // nearest open point to (x,z) — spawn/reinforcement placement helper
    clampToOpen(x, z, rMaxM = 24) {
      if (walk[at(x, z)]) return { x, z };
      const c0x = cIdx(x), c0z = cIdx(z), rMax = Math.ceil(rMaxM / cell);
      for (let r = 1; r <= rMax; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const cx = c0x + dx, cz = c0z + dz;
        if (cx < 0 || cz < 0 || cx >= G || cz >= G || !walk[cz * G + cx]) continue;
        return { x: (cx + 0.5) * cell - half, z: (cz + 0.5) * cell - half };
      }
      return { x, z }; // pathological — validator guarantees open ground exists nearby
    },
  };
}
