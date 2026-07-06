// Registry API + thumbnail tests — exercises the real HTTP surface the designer/overworld use.
// World snapshot is unreachable in tests (MAPS_WORLD_URL → localhost dead port) — the API must
// degrade to parcelId-only generation (square fallback per the brief).
import http from "http";
import fs from "fs";
import os from "os";
import path from "path";

process.env.MAPS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "efmaps-api-"));
process.env.MAPS_WORLD_URL = "http://127.0.0.1:9";     // unreachable on purpose
process.env.MAPS_API_TOKEN = "test-admin-key";
delete process.env.MAPS_LLM_PROVIDER;                   // default LLM unconfigured → 503 path

const { mapsApi } = await import("../api.js");
const { renderThumb } = await import("../thumb.js");
const { generate } = await import("../generate.js");

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗ FAIL", n); } };

const srv = http.createServer((req, res) => { if (!mapsApi(req, res)) { res.writeHead(404); res.end("lobby"); } });
await new Promise((r) => srv.listen(0, r));
const B = `http://127.0.0.1:${srv.address().port}`;
const j = (p, opt) => fetch(B + p, opt).then((r) => r.json());
const KEY = { "content-type": "application/json", "x-maps-key": "test-admin-key" };

console.log("— thumbnails —");
{
  const art = generate({ parcelId: "T1", biome: "volcanic", zone: "W" });
  const png1 = renderThumb(art), png2 = renderThumb(art);
  ok(png1.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "valid PNG signature");
  ok(png1.length > 800, `plausible size (${png1.length}B — flat terrain deflates well)`);
  ok(png1.equals(png2), "thumbnail render is deterministic");
}

console.log("— manifest + lazy generation —");
{
  const empty = await j("/internal/v1/designs");
  ok(empty.ok && empty.rows.length === 0 && empty.llm === false, "empty manifest; llm reported unconfigured");
  const d = await j("/internal/v1/designs/888001");
  ok(d.ok && d.row.status === "SEED_V0" && d.artifact.arena.sizeM === 322, "GET lazy-generates v0 despite unreachable world snapshot");
  ok((await j("/internal/v1/designs?status=SEED_V0")).rows.length === 1, "status filter");
  const t = await fetch(B + "/internal/v1/designs/888001/thumb.png");
  ok(t.status === 200 && t.headers.get("content-type") === "image/png", "thumb.png served");
  ok(d.row.thumbnailPath && fs.existsSync(path.join(process.env.MAPS_DIR, d.row.thumbnailPath)), "thumbnailPath in registry row");
  // render manifest: lazily built, cached, engine-ready schema, immutable cache header
  const rm = await fetch(B + "/internal/v1/designs/888001/render.json");
  ok(rm.status === 200 && rm.headers.get("content-type") === "application/json", "render.json served");
  ok((rm.headers.get("cache-control") || "").includes("immutable"), "render.json is cache-immutable");
  const man = await rm.json();
  ok(man.schema === "ef-battlefield-manifest/1" && man.height && man.biome && Array.isArray(man.trees), "manifest has height/biome/trees (engine-ready)");
  ok(fs.existsSync(path.join(process.env.MAPS_DIR, "888001", "render.v0.json")), "manifest cached on disk next to the artifact");
}

console.log("— auth + prompt + freeze —");
{
  const noKey = await fetch(B + "/internal/v1/designs/888001/regenerate", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  ok(noKey.status === 401, "POST without x-maps-key rejected when token set");
  const p503 = await fetch(B + "/internal/v1/designs/888001/prompt", { method: "POST", headers: KEY, body: JSON.stringify({ directive: "lava world" }) });
  ok(p503.status === 503, "prompt w/o params → 503 when no default LLM configured");
  const withParams = await j("/internal/v1/designs/888001/prompt", { method: "POST", headers: KEY,
    body: JSON.stringify({ directive: "lava world", params: { archetype: "riverCrossing", palette: "volcanic", landmark: "OBELISK", laneCount: 2, density: 0.7, waterLevel: 1, resourceRichness: 0.8, roughness: 0.5, mirrorFair: true } }) });
  ok(withParams.ok && withParams.row.designVersion === 1 && withParams.row.status === "OWNER_FROZEN", "browser-LLM params path → v1, owner-frozen");
  ok(withParams.artifact.meta.params.palette === "volcanic" && withParams.artifact.laneCount === 2, "params honoured");
  const fr = await j("/internal/v1/designs/888001/freeze", { method: "POST", headers: KEY, body: JSON.stringify({ on: false }) });
  ok(fr.ok && fr.row.status === "AI_ITERATED", "unfreeze");
  const rg = await j("/internal/v1/designs/888001/regenerate", { method: "POST", headers: KEY, body: JSON.stringify({}) });
  ok(rg.ok && rg.row.designVersion === 2, "regenerate (gardener path) bumps version");
  const th0 = await fetch(B + "/internal/v1/designs/888001/thumb.png?v=0");
  ok(th0.status === 200, "historical version thumb still served");
}

console.log("— edit gate: view public, design needs identity + ownership —");
{
  const { editDecision } = await import("../api.js");
  ok(editDecision({ admin: true }).ok, "admin key edits");
  ok(editDecision({ username: "nftprof" }).ok, "signed-in user edits while ownership unknown (testing phase)");
  ok(editDecision({ username: "NFTProf", owner: "nftprof" }).ok, "owner edits own land (case-insensitive)");
  const d403 = editDecision({ username: "rando", owner: "nftprof" });
  ok(!d403.ok && d403.code === 403 && d403.error.includes("nftprof"), "non-owner blocked with 403 naming the owner");
  const d401 = editDecision({});
  ok(!d401.ok && d401.code === 401, "anonymous blocked with 401");
  const who = await j("/internal/v1/whoami");
  ok(who.ok === false, "whoami without token → not signed in");
  const whoAdmin = await j("/internal/v1/whoami", { headers: { "x-maps-key": "test-admin-key" } });
  ok(whoAdmin.ok && whoAdmin.admin, "whoami with admin key");
}

console.log("— login + account prefs —");
{
  const badLogin = await fetch(B + "/internal/v1/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "x@y.z", password: "nope" }) });
  ok(badLogin.status === 401, "login with bad/unreachable creds rejected");
  const missing = await fetch(B + "/internal/v1/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  ok(missing.status === 400, "login without credentials → 400");
  ok((await j("/internal/v1/prefs")).ok === false, "prefs require sign-in");
  const set = await j("/internal/v1/prefs", { method: "POST", headers: KEY, body: JSON.stringify({ provider: "bedrock", model: "deepseek.v3.2", keys: { sneaky: "key" }, customUrl: "", customModel: "" }) });
  ok(set.ok && set.prefs.provider === "bedrock" && !("keys" in set.prefs) && !("sneaky" in set.prefs), "prefs saved — API keys NEVER stored server-side");
  const got = await j("/internal/v1/prefs", { headers: { "x-maps-key": "test-admin-key" } });
  ok(got.ok && got.prefs.model === "deepseek.v3.2", "prefs roundtrip per account");
}

console.log("— investment (admin-set until CF economy wires in) —");
{
  const inv = await j("/internal/v1/designs/888001/invest", { method: "POST", headers: KEY, body: JSON.stringify({ level: 4 }) });
  ok(inv.ok && inv.row.investLevel === 4 && inv.budget.name === "Rich Vein", "admin invest sets the tier");
  const rich = await j("/internal/v1/designs/888001/prompt", { method: "POST", headers: KEY,
    body: JSON.stringify({ directive: "gold everywhere", params: { archetype: "openSteppe", palette: "desert", landmark: "OBELISK", laneCount: 1, density: 0.4, waterLevel: 0.2, resourceNodes: 99, resourceRichness: 1, mobCamps: 99, towers: 99, roughness: 0.5, mirrorFair: true } }) });
  ok(rich.ok && rich.artifact.resources.length === 6 && rich.artifact.structures.length === 4, "post-invest generation uses the raised budget (tier-4 caps)");
  ok(rich.row.investLevel === 4, "tier survives regeneration");
  const g = await j("/internal/v1/designs/888001");
  ok(g.budget && g.budget.level === 4, "GET returns the parcel's budget for the designer/LLM");
}

console.log("— owner resolution debug (acceptance tool for the CF feed) —");
{
  const anon = await fetch(B + "/internal/v1/designs/888001/owner");
  ok(anon.status === 403, "owner debug is admin-key only");
  const d = await j("/internal/v1/designs/888001/owner", { headers: { "x-maps-key": "test-admin-key" } });
  ok(d.ok && d.owner === null && d.feedConfigured === false, "reports null owner + feed-not-configured before CF ships");
}

console.log("— land picker —");
{
  const d = await j("/internal/v1/parcels");
  ok(d.ok && Array.isArray(d.parcels) && d.parcels.length === 0, "parcels endpoint degrades to empty list when world unreachable");
}

console.log("— designer page —");
{
  const p3 = await fetch(B + "/designer/3d");
  const h3 = await p3.text();
  ok(p3.status === 200 && h3.includes("three.min.js") && h3.includes("OrbitControls"), "standalone 3D preview page served at /designer/3d");
  const r = await fetch(B + "/designer");
  const html = await r.text();
  ok(r.status === 200 && html.includes("Land Designer") && html.includes("PROVIDERS"), "studio page served with provider registry");
  ok((await fetch(B + "/health")).status === 404, "non-maps routes fall through to the lobby");
}

srv.close();
console.log(`\n${fail ? "❌" : "✅"} maps-api: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
