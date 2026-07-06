// command_endpoint.test.js — the CF map-service /command.json route: raster registry artifact →
// §3 A1 Battlefield, lazily generated, cached per version, served for the command view + MOBA loader.
// Run:  node maps/test/command_endpoint.test.js   (from map-service/)
import assert from "node:assert";
import test from "node:test";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleRequest } from "../../server.js";
import { _resetForTest } from "../registry.js";

const dir = mkdtempSync(join(tmpdir(), "ms-cmd-"));
process.env.MAPS_DIR = dir;
_resetForTest(dir);
// no world/owners network in tests
process.env.MAPS_WORLD_URL = "http://127.0.0.1:1/none";

const srv = http.createServer(handleRequest);
await new Promise((r) => srv.listen(0, r));
const base = `http://127.0.0.1:${srv.address().port}`;
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

test("GET /command.json lazily generates a valid A1 map for a fresh parcel", async () => {
  const { status, json } = await get("/internal/v1/designs/60202500123/command.json");
  assert.equal(status, 200);
  assert.equal(json.v, 1);
  assert.equal(json.arena.sizeM, 322);
  assert.equal(json.meta.parcelId, "60202500123");
  assert.ok(json.lanes.length >= 1 && json.lanes[0].waypoints.length >= 2);
  assert.equal(json.structures.filter((s) => s.kind === "CORE").length, 2);
  assert.ok(json.obstacles.length >= 1);
});

test("byte-identical on a second hit (cache + determinism)", async () => {
  const a = await get("/internal/v1/designs/60202500123/command.json");
  const b = await get("/internal/v1/designs/60202500123/command.json");
  assert.deepEqual(a.json, b.json);
});

test("pinned ?v=0 returns the same version", async () => {
  const { status, json } = await get("/internal/v1/designs/60202500123/command.json?v=0");
  assert.equal(status, 200);
  assert.equal(json.meta.designVersion, 0);
});

test("404 for a pinned version that doesn't exist", async () => {
  const { status } = await get("/internal/v1/designs/60202500123/command.json?v=9");
  assert.equal(status, 404);
});

test.after(() => { srv.close(); rmSync(dir, { recursive: true, force: true }); });
