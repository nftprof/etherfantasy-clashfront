// D1 manifest API + owner-prompt endpoint + designer studio page. Mounts on the lobby HTTP
// server via one hook: `if (mapsApi(req, res)) return;` — self-contained, no lobby coupling.
//
//   GET  /internal/v1/designs?status=S            manifest list (registry rows)
//   GET  /internal/v1/designs/:parcelId           { row, artifact }  (lazy-generates v0)
//   GET  /internal/v1/designs/:parcelId/thumb.png[?v=N]
//   POST /internal/v1/designs/:parcelId/prompt    { directive, params? } → LLM/params → new version
//   POST /internal/v1/designs/:parcelId/regenerate{ params?, byOwner? }
//   POST /internal/v1/designs/:parcelId/freeze    { on }
//   GET  /designer                                the studio page (maps/designer.html)
//
// Auth (MVP): if MAPS_API_TOKEN is set, POSTs require `x-maps-key` to match. Real landowner
// auth arrives when the CF overworld proxies these calls with land-ownership checks.
// Parcel facts come from the overworld world snapshot (MAPS_WORLD_URL), cached 10 min;
// unreachable world ⇒ generate from parcelId alone (square fallback per the brief).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as reg from "./registry.js";
import { translateDirective, llmEnabled } from "./llm.js";
import { clampParams, budgetFor } from "./schema.js";
import { verifyToken, loginPassword } from "../lobby/auth.js";
import { worldParcel, l3Row, l3Zone, zoneList, loadWorldField } from "./worldfield.js";
import { landOfWallet, walletOwnsParcel } from "./nftowners.js";

// STRICT NFT gating: when on, ONLY the on-chain owner (or admin) may edit a parcel. Default OFF =
// testing (NFT owner OR the permissive game-feed fallback) so the tool stays usable pre-mint.
const STRICT_NFT = () => process.env.MAPS_STRICT_NFT === "1";

// The edit gate, NFT-aware (owner 2026-07-21): admin → yes; the CONNECTED WALLET owns this parcel
// on-chain → yes; else STRICT ⇒ deny, testing ⇒ fall back to the game-feed / permissive default.
async function editGate(req, parcelId) {
  const id = await identify(req);
  if (id && id.admin) return { ok: true, by: (id && id.username) || "__admin__" };
  const owns = id && id.wallet ? await walletOwnsParcel(id.wallet, parcelId).catch(() => false) : false;
  if (owns) return { ok: true, by: (id && id.username) || id.wallet };
  if (STRICT_NFT()) return { ok: false, code: 403, error: id && id.wallet ? "this parcel isn't in your connected wallet" : "connect the wallet that owns this land to design it" };
  const d = editDecision({ admin: false, username: id && id.username, owner: await ownerOf(parcelId) });
  return d.ok ? { ...d, by: (id && id.username) || "__anon__" } : d;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORLD_URL = () => process.env.MAPS_WORLD_URL || "https://cf.etherfantasy.com/api/world";
// admin key: env or ~/.ef_maps_key (file = no pm2 env dance; CF's overworld runs on the SAME
// box, so it reads the file directly — the invest secret never travels anywhere).
let _tok = null;
const TOKEN = () => {
  if (process.env.MAPS_API_TOKEN) return process.env.MAPS_API_TOKEN;
  if (_tok === null) { try { _tok = fs.readFileSync(`${process.env.HOME || ""}/.ef_maps_key`, "utf8").trim(); } catch { _tok = ""; } }
  return _tok;
};

let _world = { at: 0, byId: new Map() };
async function parcelFacts(parcelId) {
  // LOCAL FIRST (the fix): the hexagon-city l3 snapshot carries zone + bbox + svgPath, so the
  // continuous-world field (rivers/roads/castles/ridges from data/world-terrain) windows into the
  // parcel — the actual map. `worldParcel` builds the full generate-ready parcel (same path the
  // committed cf-maps + the bake tool use). The public /api/world snapshot carries NO zone/bbox, so
  // it can only give the raw outline (generic terrain) — it is the FALLBACK for parcels not in the
  // local snapshot (e.g. a __warm__ probe or a not-yet-extracted zone).
  if (parcelId !== "__warm__") {
    const snap = l3Row(parcelId);
    if (snap) return worldParcel(snap);
  }
  if (Date.now() - _world.at > 600_000) {
    try {
      const d = await fetch(WORLD_URL(), { signal: AbortSignal.timeout(6000) }).then((r) => r.json());
      const parcels = d.parcels || d.world?.parcels || [];
      _world = { at: Date.now(), byId: new Map(parcels.map((p) => [String(p.id ?? p.parcelId), p])) };
    } catch { _world.at = Date.now() - 540_000; } // retry in ~1 min, don't hammer
  }
  const p = _world.byId.get(String(parcelId));
  // polygon → the battlefield is built inside the parcel's REAL shape (square fallback without it)
  return { parcelId: String(parcelId), zone: p?.zone || "", biome: p?.biome || "", polygon: p?.polygon };
}

const J = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((ok) => { let b = ""; req.on("data", (d) => { b += d; if (b.length > 32768) req.destroy(); }); req.on("end", () => { try { ok(JSON.parse(b || "{}")); } catch { ok(null); } }); req.on("error", () => ok(null)); });

// ---- edit gate: VIEWING is public, DESIGNING needs identity (+ ownership once known) --------
// Identity: admin `x-maps-key` (ops), or a PG access token (the same one the lobby stores in
// localStorage `ef_pg_token` — same origin) verified to the canonical username via lobby/auth.
const _who = new Map(); // token -> { u, at } (60s cache so POST bursts don't hammer the PG API)
// ADMIN PG accounts (owner 2026-07-18: "admin is nftprof — can view any land"). A PG login whose
// canonical username is in this set is treated as admin: sees every parcel (owned/unminted alike)
// and may design any land. Env override MAPS_ADMIN_USERS = comma list; default just nftprof.
const ADMIN_USERS = new Set((process.env.MAPS_ADMIN_USERS || "nftprof").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
export const isAdminUser = (u) => !!u && ADMIN_USERS.has(String(u).toLowerCase());
async function identify(req) {
  if (TOKEN() && req.headers["x-maps-key"] === TOKEN()) return { admin: true, username: "__admin__" };
  const m = /^Bearer\s+(.+)$/.exec(req.headers.authorization || "");
  if (!m) return null;
  const tok = m[1], c = _who.get(tok);
  if (c && Date.now() - c.at < 60_000) return c.u ? { username: c.u, admin: isAdminUser(c.u), wallet: c.w || null } : null;
  const v = await verifyToken(tok).catch(() => null);
  if (_who.size > 500) _who.clear();
  _who.set(tok, { u: v && v.ok ? v.username : null, w: v && v.ok ? (v.wallet || null) : null, at: Date.now() });
  return v && v.ok ? { username: v.username, admin: isAdminUser(v.username), wallet: v.wallet || null } : null;
}
// Ownership: pluggable feed (MAPS_OWNERS_URL → {owners:{parcelId:username}} or [{parcelId,owner}]),
// cached 5 min. The public world snapshot has no owner data yet — until the CF overworld exposes
// this feed, owners are UNKNOWN and any signed-in account may design (testing phase). The moment
// the feed exists, owner-mismatch → 403 automatically. undefined = unknown/unowned.
let _owners = { at: 0, map: new Map() };
let _ownersUrl = null;   // env or ~/.ef_maps_owners_url (file = point at CF's feed without env)
const ownersUrl = () => {
  if (process.env.MAPS_OWNERS_URL) return process.env.MAPS_OWNERS_URL;
  if (_ownersUrl === null) { try { _ownersUrl = fs.readFileSync(`${process.env.HOME || ""}/.ef_maps_owners_url`, "utf8").trim(); } catch { _ownersUrl = ""; } }
  return _ownersUrl;
};
async function ownerOf(parcelId) {
  const url = ownersUrl();
  if (!url) return undefined;
  if (Date.now() - _owners.at > 300_000) {
    try {
      const d = await fetch(url, { signal: AbortSignal.timeout(6000) }).then((r) => r.json());
      const src = d.owners || d, m = new Map();
      if (Array.isArray(src)) for (const o of src) m.set(String(o.parcelId), String(o.owner ?? o.username ?? "").toLowerCase());
      else for (const [k, v] of Object.entries(src)) m.set(String(k), String(v).toLowerCase());
      _owners = { at: Date.now(), map: m };
    } catch { _owners.at = Date.now() - 240_000; }
  }
  return _owners.map.get(String(parcelId));
}
// pure decision (unit-tested): admin → yes; anonymous → 401; owned by someone else → 403.
export const editDecision = ({ admin, username, owner }) =>
  admin ? { ok: true } :
  !username ? { ok: false, code: 401, error: "sign in to design land — log in through the game lobby first (viewing is open to everyone)" } :
  owner && owner !== String(username).toLowerCase() ? { ok: false, code: 403, error: `this land belongs to ${owner} — only the owner can redesign it` } :
  { ok: true };

// returns true if the request was ours (response handled), false to let the lobby continue
export function mapsApi(req, res) {
  const [p] = req.url.split("?");
  if (p === "/designer" || p === "/designer/" || p === "/designer/3d") {
    // /designer = the studio · /designer/3d?parcel= = standalone layout-true 3D preview
    // (placeholder art; the game-model render is the client's bfpreview, CLIENT_BATTLEFIELD_LOADER.md)
    fs.readFile(path.join(__dirname, p === "/designer/3d" ? "preview3d.html" : "designer.html"), (e, buf) => {
      if (e) { res.writeHead(404); return res.end("page missing"); }
      res.writeHead(200, { "content-type": "text/html", "cache-control": "no-cache" });
      res.end(buf);
    });
    return true;
  }
  if (p === "/internal/v1/zones") {                         // world → CONTINENT zoom: the 12 zones + counts + bbox
    try { J(res, 200, { ok: true, zones: zoneList() }); } catch (e) { J(res, 500, { ok: false, error: e.message }); }
    return true;
  }
  if (p === "/internal/v1/parcels") {                       // zone → PARCEL zoom: search + paged, owner-tagged
    parcelsList(req).then((r) => J(res, 200, { ok: true, ...r })).catch((e) => J(res, 500, { ok: false, error: e.message }));
    return true;
  }
  if (p === "/internal/v1/my-land") {                       // the connected wallet's on-chain land
    identify(req).then(async (id) => {                      // (NFT-data API — owner 2026-07-21).
      const u = new URL(req.url, "http://x");
      // wallet = the PG-verified mm_address; admin may inspect any ?wallet= (read-only).
      let wallet = id && id.wallet;
      if (id && id.admin && u.searchParams.get("wallet")) wallet = u.searchParams.get("wallet");
      if (!wallet) return J(res, 200, { ok: true, wallet: null, count: 0, parcels: [], estates: [] });
      const land = await landOfWallet(wallet).catch(() => ({ parcels: new Set(), estates: [] }));
      J(res, 200, { ok: true, wallet, count: land.parcels.size, parcels: [...land.parcels], estates: land.estates });
    }).catch((e) => J(res, 500, { ok: false, error: e.message }));
    return true;
  }
  if (p === "/internal/v1/castles") {                       // ESTATE CASTLE EXPLORER (owner 2026-07-21):
    try { J(res, 200, { ok: true, ...castlesList(req) }); }  // every authored castle, filterable, so admin
    catch (e) { J(res, 500, { ok: false, error: e.message }); } //  can review all curated estate forts.
    return true;
  }
  if (p === "/internal/v1/whoami") {                        // designer sign-in state (Bearer = lobby's ef_pg_token)
    identify(req).then((id) => J(res, 200, id ? { ok: true, username: id.username, admin: !!id.admin } : { ok: false }))
      .catch(() => J(res, 200, { ok: false }));
    return true;
  }
  if (p === "/internal/v1/login" && req.method === "POST") {  // direct PG email/password login (identity docs
    readBody(req).then(async (b) => {                          // flow; app key stays server-side, like the lobby)
      if (!b || !b.email || !b.password) return J(res, 400, { ok: false, error: "email + password required" });
      const v = await loginPassword(String(b.email), String(b.password));
      if (!v.ok) return J(res, 401, { ok: false, error: "Login failed: " + (v.reason || "bad credentials") });
      J(res, 200, { ok: true, token: v.token, username: v.username });
    }).catch((e) => J(res, 500, { ok: false, error: e.message }));
    return true;
  }
  if (p === "/internal/v1/prefs") {                           // per-ACCOUNT designer defaults (provider/model —
    (async () => {                                            //  API keys deliberately stay browser-local)
      const id = await identify(req);
      if (!id) return J(res, 401, { ok: false, error: "sign in first" });
      const f = path.join(process.env.MAPS_DIR || path.join(process.env.HOME || ".", "ef-battlefields"), "prefs.json");
      let all = {}; try { all = JSON.parse(fs.readFileSync(f, "utf8")); } catch {}
      const k = String(id.username).toLowerCase();
      if (req.method === "GET") return J(res, 200, { ok: true, prefs: all[k] || null });
      if (req.method !== "POST") return J(res, 404, { ok: false });
      const b = await readBody(req);
      if (!b) return J(res, 400, { ok: false, error: "bad json" });
      all[k] = {                                              // whitelist — never store keys server-side
        provider: String(b.provider || "server").slice(0, 24), model: String(b.model || "").slice(0, 64),
        customUrl: String(b.customUrl || "").slice(0, 200), customModel: String(b.customModel || "").slice(0, 64),
      };
      fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(all));
      J(res, 200, { ok: true, prefs: all[k] });
    })().catch((e) => J(res, 500, { ok: false, error: e.message }));
    return true;
  }
  if (!p.startsWith("/internal/v1/designs")) return false;
  handle(req, res, p).catch((e) => J(res, 500, { ok: false, error: e.message }));
  return true;
}

// zone → parcel picker: the FULL l3 roster of a continent (all ~13k parcels), searchable + paged,
// each tagged with design status + NFT owner + minted/mine/admin flags. Rendered like the CF main
// map (real parcel polygons via svgPath), with the caller's own land highlighted.
//   ?zone=EDU  (required for the grid; default EDU)  ?q=<id substring>  ?page=0  ?pageSize=400
//   ?mine=1  → only the signed-in user's owned parcels (any zone)     ?designed=1 → only designed
// Owner rules (owner 2026-07-18): every parcel links to its NFT owner (land-owners feed) or reads
// UNMINTED when absent; a normal user sees ownership + may design only their own (edit gate stays
// the authority); ADMIN (nftprof) sees + may design ALL. Facts-only endpoint — the edit gate on
// ESTATE CASTLE EXPLORER — aggregate every authored castle POI across all zones so admin can review
// the curated estate forts (owner 2026-07-21: "each castle for estates curated … eventually I
// should see all of them … a separate explorer for large land … as admin filter for them easily").
// Filters: ?zone, ?tier (KEEP|CASTLE|PALACE), ?water=1 (river/coast-adjacent), ?q (name/id).
// Each row's `parcel` = the castle's own L3 hero-parcel (heroParcels[0]) — click-through to the 3D.
function distToLines(pt, lines, thr) {
  for (const L of lines || []) for (let i = 1; i < (L.pts || []).length; i++) {
    const a = L.pts[i - 1], b = L.pts[i], ax = b[0] - a[0], az = b[1] - a[1], L2 = ax * ax + az * az || 1;
    const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * ax + (pt[1] - a[1]) * az) / L2));
    const d = Math.hypot(pt[0] - (a[0] + ax * t), pt[1] - (a[1] + az * t));
    if (d < thr) return Math.round(d);
  }
  return null;
}
let _castleCache = null;
function allCastles() {
  if (_castleCache) return _castleCache;
  const out = [];
  for (const z of zoneList()) {
    const field = loadWorldField(z.zoneId); if (!field) continue;
    for (const c of field.castles || []) {
      const at = Array.isArray(c.at) ? c.at : null;
      const river = at ? distToLines(at, field.rivers, 18) : null;
      const coast = at ? distToLines(at, field.coast, 18) : null;
      out.push({
        zone: z.zoneId, zoneName: z.name || z.zoneId, id: c.id,
        kind: c.kind || "CASTLE", name: c.name || c.id, at,
        parcel: (Array.isArray(c.heroParcels) && c.heroParcels[0]) || null,
        heroParcels: c.heroParcels || [],
        water: river != null ? { kind: "river", d: river } : (coast != null ? { kind: "coast", d: coast } : null),
      });
    }
  }
  _castleCache = out;
  return out;
}
function castlesList(req) {
  const u = new URL(req.url, "http://x");
  const zone = (u.searchParams.get("zone") || "").toUpperCase();
  const tier = (u.searchParams.get("tier") || "").toUpperCase();
  const water = u.searchParams.get("water") === "1";
  const q = String(u.searchParams.get("q") || "").trim().toLowerCase();
  let list = allCastles();
  if (zone) list = list.filter((c) => c.zone === zone);
  if (tier) list = list.filter((c) => c.kind === tier);
  if (water) list = list.filter((c) => c.water);
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || String(c.id).toLowerCase().includes(q) || String(c.parcel || "").includes(q));
  const tierRank = { PALACE: 0, CASTLE: 1, KEEP: 2 };
  list = list.slice().sort((a, b) => (tierRank[a.kind] - tierRank[b.kind]) || a.zone.localeCompare(b.zone) || a.name.localeCompare(b.name));
  const all = allCastles();
  return {
    total: list.length, grandTotal: all.length,
    zones: [...new Set(all.map((c) => c.zone))].sort(),
    counts: { PALACE: all.filter((c) => c.kind === "PALACE").length, CASTLE: all.filter((c) => c.kind === "CASTLE").length, KEEP: all.filter((c) => c.kind === "KEEP").length, water: all.filter((c) => c.water).length },
    castles: list,
  };
}

// POST is the real enforcement.
async function parcelsList(req) {
  const u = new URL(req.url, "http://x");
  const id = await identify(req);
  const admin = !!(id && id.admin), me = id && id.username ? String(id.username).toLowerCase() : null;
  const zone = String(u.searchParams.get("zone") || "EDU").toUpperCase();
  const q = String(u.searchParams.get("q") || "").trim().toLowerCase();
  const page = Math.max(0, parseInt(u.searchParams.get("page") || "0", 10) || 0);
  const pageSize = Math.min(2000, Math.max(1, parseInt(u.searchParams.get("pageSize") || "400", 10) || 400));
  const mineOnly = u.searchParams.get("mine") === "1";
  const designedOnly = u.searchParams.get("designed") === "1";
  // light=1 → the MAP FILL: EVERY parcel of the continent (minimal fields, no svgPath/paging) so the
  // picker draws the whole continent like the CF main map. Heavy (default) → the paged, polygon-
  // detailed slice for the list + a selected parcel's outline.
  const light = u.searchParams.get("light") === "1";
  await ownerOf("__warm__");                                  // refresh the owner feed once
  const rows = new Map(reg.list().map((r) => [String(r.parcelId), r]));
  const source = mineOnly && me ? zoneList().flatMap((z) => l3Zone(z.zoneId)) : l3Zone(zone);
  const owned = (pid) => _owners.map.get(String(pid));       // undefined ⇒ unminted
  let list = source;
  if (q) list = list.filter((s) => String(s.parcelId).toLowerCase().includes(q));
  if (designedOnly) list = list.filter((s) => rows.has(String(s.parcelId)));
  if (mineOnly && me) list = list.filter((s) => owned(s.parcelId) === me);
  const total = list.length;
  const slice = light ? list : list.slice(page * pageSize, page * pageSize + pageSize);
  const parcels = slice.map((s) => {
    const pid = String(s.parcelId), c = s.center || (s.bbox ? [(s.bbox[0] + s.bbox[2]) / 2, (s.bbox[1] + s.bbox[3]) / 2] : [0, 0]);
    const r = rows.get(pid), owner = owned(pid), mine = !!(me && owner === me);
    if (light) return { parcelId: pid, x: c[0], y: c[1], mine, minted: owner !== undefined, status: r ? r.status : undefined };
    return { parcelId: pid, x: c[0], y: c[1], bbox: s.bbox, svgPath: s.svgPath, sizeClass: s.sizeClass,
      owner: owner ?? null, minted: owner !== undefined, mine,
      ...(r ? { status: r.status, v: r.designVersion, archetype: r.archetype, palette: r.palette, approved: r.approved !== false, modes: r.sim?.modes || null } : {}) };
  });
  return { zone, page, pageSize, total, admin, me, ownersKnown: !!ownersUrl(), light, parcels };
}

async function handle(req, res, p) {
  const u = new URL(req.url, "http://x");
  const seg = p.split("/").filter(Boolean); // internal v1 designs [parcelId] [action]
  const parcelId = seg[3], action = seg[4];

  if (req.method === "GET" && !parcelId)
    return J(res, 200, { ok: true, llm: llmEnabled(), rows: reg.list(u.searchParams.get("status") || null) });

  if (req.method === "GET" && parcelId && action === "owner") {
    // acceptance/debug (admin-key only): what owner does the CF feed resolve for this parcel?
    // Lets us verify feed→enforcement wiring the minute CF ships, without needing two accounts.
    const id = await identify(req);
    if (!(id && id.admin)) return J(res, 403, { ok: false });
    return J(res, 200, { ok: true, parcelId, owner: (await ownerOf(parcelId)) ?? null, feedConfigured: !!ownersUrl() });
  }
  if (req.method === "GET" && parcelId && action === "thumb.png") {
    const row = reg.getRow(parcelId);
    const v = u.searchParams.get("v") ?? row?.designVersion;
    const f = path.join(process.env.MAPS_DIR || path.join(process.env.HOME || ".", "ef-battlefields"), String(parcelId), `thumb.v${v}.png`);
    return fs.readFile(f, (e, buf) => {
      if (e) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": "image/png", "cache-control": "no-cache", "access-control-allow-origin": "*" });
      res.end(buf);
    });
  }

  // engine-ready render manifest (heightfield + biome + trees/rocks/scatter derived from the grid).
  // Lazily built + cached per designVersion. Consumed by the client ?bfpreview= render, command-mode
  // underlay, and the designer 3D preview. Public (viewing is open, same as thumb/artifact).
  if (req.method === "GET" && parcelId && action === "render.json") {
    const row = reg.getRow(parcelId);
    if (!row) { await reg.ensureDesign(await parcelFacts(parcelId)); }   // lazy v0 so first hit works
    const v = u.searchParams.get("v");
    const m = reg.readManifest(parcelId, v != null ? Number(v) : null);
    if (!m) return J(res, 404, { ok: false, error: "no_design" });
    if (m.error) return J(res, m.error === "converter_unavailable" ? 501 : 500, { ok: false, ...m });
    res.writeHead(200, { "content-type": "application/json", "cache-control": "public,max-age=31536000,immutable", "access-control-allow-origin": "*" });
    return res.end(JSON.stringify(m));
  }

  if (req.method === "GET" && parcelId) {
    const v = u.searchParams.get("v");
    if (v != null) { const row = reg.getRow(parcelId); return J(res, 200, { ok: true, row, artifact: reg.readArtifact(parcelId, Number(v)), budget: budgetFor(row?.investLevel ?? 0) }); }
    const { row, artifact } = reg.ensureDesign(await parcelFacts(parcelId));   // lazy v0
    return J(res, 200, { ok: true, row, artifact, budget: budgetFor(row?.investLevel ?? 0) });
  }

  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-maps-key,authorization" }); return res.end(); }
  if (req.method !== "POST" || !parcelId) return J(res, 404, { ok: false });
  // EDIT GATE: viewing is public; prompt/regenerate/freeze need identity + on-chain ownership
  // (the connected wallet must own the parcel — owner 2026-07-21) or the testing fallback.
  const id = await identify(req);
  const gate = await editGate(req, parcelId);
  if (!gate.ok) return J(res, gate.code, { ok: false, error: gate.error });
  const by = gate.by || (id && id.username) || "__admin__";
  const body = await readBody(req);
  if (!body) return J(res, 400, { ok: false, error: "bad json" });
  const parcel = await parcelFacts(parcelId);

  const budget = budgetFor(reg.getRow(parcelId)?.investLevel ?? 0);   // parcel's investment budget

  if (action === "prompt") {
    // Owner prompt: browser-side LLM sends ready `params`; otherwise our default provider
    // translates `directive`. Either way clampParams(…, budget) + validator gate the result.
    const directive = String(body.directive || "").slice(0, 600);
    let params;
    try { params = body.params ? clampParams(body.params, budget) : await translateDirective(directive, undefined, budget); }
    catch (e) { return J(res, e.code === 503 ? 503 : 502, { ok: false, error: e.code === 503 ? "no default LLM configured — bring your own key in the designer, or set MAPS_LLM_* on the box" : "LLM failed: " + e.message }); }
    const r = reg.regenerate(parcel, params, { byOwner: true, directive, by });
    return J(res, 200, { ok: true, ...r, params, budget });
  }
  if (action === "regenerate") {
    const r = reg.regenerate(parcel, body.params ? clampParams(body.params, budget) : null, { byOwner: !!body.byOwner, directive: body.directive || null, by });
    return r.error ? J(res, 409, { ok: false, error: r.error }) : J(res, 200, { ok: true, ...r, budget });
  }
  if (action === "invest") {
    // Investment tier changes are ECONOMY — they flow through the Clash Front overworld (it
    // charges the CT). Admin-only until that wiring lands, so tiers can be tested end-to-end.
    if (!(id && id.admin)) return J(res, 403, { ok: false, error: "investing flows through Clash Front (spend CT there to upgrade your land) — coming soon" });
    reg.ensureDesign(parcel);                                  // a row must exist to carry the tier
    const row = reg.setInvest(parcelId, body.level | 0);
    return J(res, 200, { ok: true, row, budget: budgetFor(row.investLevel) });
  }
  if (action === "freeze") {
    const row = reg.freeze(parcelId, body.on !== false);
    if (!row) return J(res, 404, { ok: false, error: "no design yet" });
    if (row.error) return J(res, 409, { ok: false, error: row.error, sim: row.sim }); // failed the sim gate — can't deploy
    return J(res, 200, { ok: true, row });
  }
  return J(res, 404, { ok: false });
}
