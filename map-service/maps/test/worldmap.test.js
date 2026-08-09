// worldmap.test.js — the 2D world overview assembly + coverage math.
import test from "node:test";
import assert from "node:assert";
import { worldMap, _internal } from "../worldmap.js";

test("skeleton assembles every zone as a placed tile with a coarse grid", () => {
  const sk = _internal.skeleton();
  assert.ok(sk.zones.length >= 8, "expected the surface + UW zones");
  for (const z of sk.zones) {
    assert.ok(z.grid.w >= 1 && z.grid.h >= 1, z.zoneId + " grid");
    assert.ok(z.grid.w <= _internal.GRID_MAX && z.grid.h <= _internal.GRID_MAX, z.zoneId + " grid cap");
    assert.strictEqual(z.total.length, z.grid.w * z.grid.h, z.zoneId + " total length");
    assert.ok(z.world && Number.isFinite(z.world.x) && Number.isFinite(z.world.z), z.zoneId + " world offset");
    assert.ok(z.count > 0, z.zoneId + " has parcels");
    // every parcel landed in a cell
    const sum = z.total.reduce((a, b) => a + b, 0);
    assert.strictEqual(sum, z.cellOf.length, z.zoneId + " every parcel binned");
  }
});

test("coverage math: empty set = 0%, everything = 100%", () => {
  const empty = worldMap(new Set());
  assert.strictEqual(empty.stats.totalGenerated, 0);
  assert.strictEqual(empty.stats.parcelCoverage, 0);
  assert.ok(empty.stats.totalParcels > 100000, "full world parcel count");

  // synthesize a generated set = every parcel in one zone
  const sk = _internal.skeleton();
  const z0 = sk.zones[0];
  const gen = new Set(z0.cellOf.map(([pid]) => pid));
  const wm = worldMap(gen);
  const zr = wm.zones.find((z) => z.zoneId === z0.zoneId);
  assert.strictEqual(zr.generated, z0.count, "all of zone 0 generated");
  assert.strictEqual(zr.coverage, 1, "zone 0 = 100%");
  assert.strictEqual(wm.stats.totalGenerated, z0.count, "world generated = zone 0");
  // generatedGrid per cell never exceeds total per cell
  for (let i = 0; i < zr.total.length; i++)
    assert.ok(zr.generatedGrid[i] <= zr.total[i], "gen<=total at cell " + i);
});

test("bounds cover all placed tiles", () => {
  const wm = worldMap(new Set());
  const b = wm.bounds;
  for (const z of wm.zones) {
    assert.ok(z.world.x - z.world.w / 2 >= b.x0 - 1e-6 && z.world.x + z.world.w / 2 <= b.x1 + 1e-6, z.zoneId + " x in bounds");
    assert.ok(z.world.z - z.world.h / 2 >= b.z0 - 1e-6 && z.world.z + z.world.h / 2 <= b.z1 + 1e-6, z.zoneId + " z in bounds");
  }
});
