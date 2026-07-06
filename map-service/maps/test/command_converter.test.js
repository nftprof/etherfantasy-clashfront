// command_converter.test.js — raster artifact → A1 Battlefield JSON conformance + walkability parity.
// Run:  node maps/test/command_converter.test.js   (from map-service/)
import assert from "node:assert";
import test from "node:test";
import { generate, seedFor, paramsFromSeed } from "../generate.js";
import { toBattlefieldA1 } from "../command_converter.js";
import { T, CELL_M, BLOCKED, cellOf, gIdx, worldOf } from "../schema.js";

const PARCELS = [
  { parcelId: "60202500123", biome: "TEMPERATE_FOREST", zone: "Z1" },
  { parcelId: "60203370020", biome: "VOLCANIC", zone: "Z2" },
  { parcelId: "60200010007", biome: "TUNDRA", zone: "Z3" },
];
function gen(p) {
  const bounds = [[-161, -161], [161, -161], [161, 161], [-161, 161]];
  const seed = seedFor(p.parcelId, p.biome, p.zone);
  const params = paramsFromSeed(seed, p.parcelId);
  return generate({ ...p, sizeClass: "SINGLE", bounds }, params, 0);
}

function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

test("converts every sample parcel to a structurally valid A1 object", () => {
  for (const p of PARCELS) {
    const bf = toBattlefieldA1(gen(p));
    assert.equal(bf.v, 1);
    assert.equal(bf.arena.shape, "polygon");
    assert.equal(bf.arena.sizeM, 322);
    assert.ok(Array.isArray(bf.arena.bounds) && bf.arena.bounds.length >= 3);
    assert.equal(bf.meta.parcelId, p.parcelId);
    assert.equal(bf.meta.biome, p.biome);
    assert.equal(bf.meta.sizeM, 322);
    assert.ok(bf.meta.laneCount >= 1);
  }
});

test("lanes are wrapped {id, side, waypoints} and pathable-shaped", () => {
  const bf = toBattlefieldA1(gen(PARCELS[0]));
  assert.ok(bf.lanes.length >= 1);
  for (const lane of bf.lanes) {
    assert.equal(typeof lane.id, "string");
    assert.ok(["ATTACKER", "DEFENDER", "ANY"].includes(lane.side));
    assert.ok(Array.isArray(lane.waypoints) && lane.waypoints.length >= 2);
    for (const wp of lane.waypoints) assert.ok(Array.isArray(wp) && wp.length === 2);
  }
});

test("structures include ATTACKER + DEFENDER CORE anchored on the generator's base spawns", () => {
  const art = gen(PARCELS[0]);
  const bf = toBattlefieldA1(art);
  const cores = bf.structures.filter((s) => s.kind === "CORE");
  assert.equal(cores.length, 2);
  const sides = cores.map((c) => c.side).sort();
  assert.deepEqual(sides, ["ATTACKER", "DEFENDER"]);
  // cores sit ON the generator's guaranteed-clear ATTACKER/DEFENDER base spawns (not a fixed ±114.8
  // — a generated map's real cleared base is authoritative), inside bounds.
  const spawnOf = (side) => art.spawnZones.find((s) => s.side === side);
  for (const c of cores) {
    const sp = spawnOf(c.side);
    assert.ok(Math.abs(c.x - sp.x) < 0.2 && Math.abs(c.z - sp.z) < 0.2, `core off its base spawn`);
    assert.ok(Math.max(Math.abs(c.x), Math.abs(c.z)) <= 161, "core inside bounds");
  }
  assert.ok(bf.structures.some((s) => s.kind === "TOWER"));
  assert.ok(bf.structures.some((s) => s.kind === "GATE"));
});

test("terrain BLOCKED cells become passable:false obstacles; décor props are passable:true", () => {
  const art = gen(PARCELS[0]);
  const bf = toBattlefieldA1(art);
  const blockers = bf.obstacles.filter((o) => o.passable === false);
  const decor = bf.obstacles.filter((o) => o.passable === true);
  // the generator's raster has blocked terrain → at least some footprint/circle blockers
  const cells = Buffer.from(art.terrain.cells, "base64");
  const anyBlocked = cells.some((c) => BLOCKED.has(c) && c !== T.OOB);
  if (anyBlocked) assert.ok(blockers.length >= 1, "expected passable:false obstacles from grid");
  assert.equal(decor.length, art.obstacles.length, "every décor prop carried through as passable:true");
  for (const o of bf.obstacles) assert.equal(typeof o.id, "string");
});

test("every obstacle footprint stays inside the arena bounds", () => {
  const bf = toBattlefieldA1(gen(PARCELS[1]));
  for (const o of bf.obstacles) {
    if (!Array.isArray(o.footprint)) continue;
    for (const [x, z] of o.footprint) {
      assert.ok(x >= -161.5 && x <= 161.5 && z >= -161.5 && z <= 161.5, `footprint vertex OOB: ${x},${z}`);
    }
  }
});

test("A1 walkability (bounds ∧ ¬passable:false footprint) matches the raster grid on a sample", () => {
  const art = gen(PARCELS[0]);
  const bf = toBattlefieldA1(art);
  const cells = Buffer.from(art.terrain.cells, "base64");
  const G = art.terrain.w;
  const foot = bf.obstacles.filter((o) => o.passable === false && Array.isArray(o.footprint));
  const circ = bf.obstacles.filter((o) => o.passable === false && !Array.isArray(o.footprint));
  const a1Blocked = (x, z) => {
    for (const o of foot) if (pointInPoly(x, z, o.footprint)) return true;
    for (const o of circ) if ((x - o.x) ** 2 + (z - o.z) ** 2 <= o.r * o.r) return true;
    return false;
  };
  // sample the OPEN (walkable) grid cells: A1 must NOT report them fully blocked at the cell centre.
  // (Footprints trace cell OUTLINES so a centre of a walkable cell is a fair, unambiguous probe.)
  let checked = 0, mism = 0;
  for (let cz = 2; cz < G - 2; cz += 7) {
    for (let cx = 2; cx < G - 2; cx += 7) {
      const code = cells[gIdx(G, cx, cz)];
      if (code === T.OOB) continue;
      const wx = worldOf(G, cx), wz = worldOf(G, cz);
      const gridBlocked = BLOCKED.has(code);
      const a1 = a1Blocked(wx, wz);
      checked++;
      if (gridBlocked !== a1) mism++;
    }
  }
  // exact cell-center parity won't be 100% (polygon simplification nibbles edges), but must be tight.
  const rate = mism / Math.max(1, checked);
  assert.ok(rate < 0.06, `walkability mismatch rate ${(rate * 100).toFixed(1)}% too high (${mism}/${checked})`);
});

test("deterministic: same artifact ⇒ byte-identical A1 object", () => {
  const art = gen(PARCELS[2]);
  assert.equal(JSON.stringify(toBattlefieldA1(art)), JSON.stringify(toBattlefieldA1(art)));
});

test("buildSpots size normalized to S/M/L and resources/mobs get ids", () => {
  const bf = toBattlefieldA1(gen(PARCELS[0]));
  for (const b of bf.buildSpots) assert.ok(["S", "M", "L"].includes(b.size));
  for (const r of bf.resources) assert.equal(typeof r.id, "string");
  if (bf.mobs) for (const m of bf.mobs) assert.equal(typeof m.id, "string");
});

void CELL_M; void cellOf;
