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
import { worldParcel, l3Row, l3Zone, zoneList, loadWorldField, estateList, dataRoot } from "./worldfield.js";
import { runAudit } from "./traverse.js";
import { worldMap } from "./worldmap.js";
import { bakeMosaic } from "./mosaic.js";
import { landOfWallet, walletOwnsParcel, mintedSet, PARCELS_CONTRACT, ESTATE_CONTRACT } from "./nftowners.js";
// Land mint config (distributors + size tokens) — the registry the other session delivered.
let _landCfg = null;
const landCfg = () => { if (_landCfg) return _landCfg; try { _landCfg = JSON.parse(fs.readFileSync(path.join(dataRoot(), "land-contracts.json"), "utf8")); } catch { _landCfg = {}; } return _landCfg; };

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
// Admin WALLETS (owner 2026-07-21) — a connected MetaMask wallet in this set sees ALL land.
const ADMIN_WALLETS = new Set((process.env.MAPS_ADMIN_WALLETS ||
  "0x1D187Aa2832cC7a3F778B075eEd0268744D3017a,0xB2e3e82a95f5c4c47E30A5b420Ac4f99d32EF61f")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
export const isAdminWallet = (w) => !!w && ADMIN_WALLETS.has(String(w).toLowerCase());
// The wallet a MetaMask connect asserts (x-wallet header). Used for VIEW + admin-see-all + the
// my-land highlight. NOTE: unverified (no server-side signature check yet) — so it grants VIEW
// only; the design EDIT gate still requires the PG-verified mm_address (or PG-admin).
const connectedWallet = (req) => {
  const w = req.headers["x-wallet"];
  return w && /^0x[0-9a-fA-F]{40}$/.test(String(w)) ? String(w).toLowerCase() : null;
};
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
  if (p === "/designer" || p === "/designer/" || p === "/designer/3d" || p === "/designer/world") {
    // /designer = the studio · /designer/3d?parcel= = standalone 3D preview · /designer/world =
    // the 2D WORLD OVERVIEW (coverage map — the whole CF game map as one picture).
    const page = p === "/designer/3d" ? "preview3d.html" : p === "/designer/world" ? "worldmap.html" : "designer.html";
    fs.readFile(path.join(__dirname, page), (e, buf) => {
      if (e) { res.writeHead(404); return res.end("page missing"); }
      res.writeHead(200, { "content-type": "text/html", "cache-control": "no-cache" });
      res.end(buf);
    });
    return true;
  }
  if (p === "/internal/v1/worldmap.json") {                 // the 2D world overview data + coverage %
    try {
      const u = new URL(req.url, "http://x");
      const gen = new Set(reg.list().map((r) => String(r.parcelId)));
      // dev-only visual aid: ?demo=<frac> deterministically marks a fraction "generated" so the
      // coverage overlay can be eyeballed on a box with an empty registry. Never affects prod data.
      const demo = parseFloat(u.searchParams.get("demo") || "");
      if (process.env.WORLDMAP_DEMO === "1" && demo > 0) {
        for (const z of zoneList()) for (const r of l3Zone(z.zoneId)) {
          const pid = String(r.parcelId);
          let h = 2166136261; for (let i = 0; i < pid.length; i++) { h ^= pid.charCodeAt(i); h = Math.imul(h, 16777619); }
          if (((h >>> 0) % 1000) < demo * 1000) gen.add(pid);
        }
      }
      J(res, 200, { ok: true, ...worldMap(gen) });
    } catch (e) { J(res, 500, { ok: false, error: e.message }); }
    return true;
  }
  // AERIAL 3D-THUMB MOSAIC (owner 2026-08-25) — the continent baked as one picture: real 3D map
  //   thumbnails at true parcel positions (castle→castle), grey where ungenerated. Used as the
  //   /designer select-map base layer + the /designer/world overview. Baked once, cached, re-baked
  //   when a thumb is re-shot (fingerprint in mosaic.js). ?zone=EDU · .json = alignment meta only.
  if (p === "/internal/v1/mosaic.json" || p === "/internal/v1/mosaic.png") {
    try {
      const u = new URL(req.url, "http://x");
      const zone = (u.searchParams.get("zone") || "EDU").toUpperCase();
      const mode = u.searchParams.get("mode") === "planner" ? "planner" : "thumb";
      const force = u.searchParams.get("force") === "1";
      const opts = { zone, mode, force };
      const ppuP = parseFloat(u.searchParams.get("ppu") || "");
      if (ppuP) opts.ppu = Math.max(2, Math.min(60, ppuP));
      const { png, meta } = bakeMosaic(opts);
      if (p === "/internal/v1/mosaic.json") { J(res, 200, { ok: true, ...meta }); return true; }
      res.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=300", "x-mosaic-thumbed": String(meta.thumbed) });
      res.end(png);
    } catch (e) { J(res, p.endsWith(".json") ? 200 : 500, { ok: false, error: e.message }); }
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
  // ---- NFT METADATA OVERRIDE (owner 2026-07-21) — the pg-nft-data override SOURCE, ETH + Polygon.
  //   GET /nft/<contract>/<tokenId>          → OpenSea-style metadata JSON (image = the parcel thumb)
  //   GET /nft/<contract>/<tokenId>/image    → the thumb PNG, or the EtherFantasy logo placeholder
  // The override service crawls the contract + points its metadata URI here; tokenId === parcelId
  // for the Polygon parcels collection, so the image is that parcel's live design thumbnail.
  {
    const m = /^\/nft\/(0x[0-9a-fA-F]{40})\/([^/]+)(\/image)?$/.exec(p);
    if (m && req.method === "GET") {
      const contract = m[1].toLowerCase(), tokenId = decodeURIComponent(m[2]).trim();
      if (m[3]) { nftImage(res, contract, tokenId); return true; }
      const meta = nftMetadata(req, contract, tokenId);
      res.writeHead(200, { "content-type": "application/json", "cache-control": "public,max-age=120", "access-control-allow-origin": "*" });
      res.end(JSON.stringify(meta)); return true;
    }
  }
  // ---- UNMINTED (primary-sale) land — the mint explorer's data source (owner 2026-07-21) --------
  //   GET /internal/v1/unminted?collection=estates&size=LARGE   → unminted estates of that size
  //   GET /internal/v1/unminted?collection=parcels&zone=EDU     → all SINGLE parcel dots (minted flag)
  // Unminted = the full snapshot MINUS minted (from the NFT-data API). tokenId === parcelId.
  if (p === "/internal/v1/unminted") {
    (async () => {
      const u = new URL(req.url, "http://x");
      const coll = (u.searchParams.get("collection") || "parcels").toLowerCase();
      const cfg = landCfg();
      if (coll === "estates") {
        const size = (u.searchParams.get("size") || "").toUpperCase();
        const minted = await mintedSet(ESTATE_CONTRACT()).catch(() => new Set());
        let est = estateList();
        if (size) est = est.filter((e) => e.sizeClass === size);
        const unminted = est.filter((e) => !minted.has(e.tokenId));
        J(res, 200, {
          ok: true, collection: "estates", chain: "ethereum", size: size || null,
          contract: ESTATE_CONTRACT(), distributor: (cfg.distributors || {}).eth_estates || null,
          claimToken: size ? ((cfg.sizeTokens || {})[size] || {}).address || null : null,
          total: est.length, mintedKnown: minted.size, unmintedCount: unminted.length,
          items: unminted.slice(0, 5000).map((e) => ({ tokenId: e.tokenId, zone: e.zone, size: e.sizeClass, center: e.center, l3: e.l3Enabled })),
        });
      } else {
        const zone = (u.searchParams.get("zone") || "EDU").toUpperCase();
        const minted = await mintedSet(PARCELS_CONTRACT()).catch(() => new Set());
        const singles = l3Zone(zone);
        const dots = singles.map((s) => ({ t: s.tokenId, x: s.center[0], y: s.center[1], m: minted.has(String(s.tokenId)) ? 1 : 0 }));
        J(res, 200, {
          ok: true, collection: "parcels", chain: "polygon", zone,
          contract: PARCELS_CONTRACT(), distributor: (cfg.distributors || {}).pol_parcels || null,
          claimToken: ((cfg.sizeTokens || {}).SINGLE || {}).address || null,
          total: singles.length, mintedCount: dots.filter((d) => d.m).length, unmintedCount: dots.filter((d) => !d.m).length, dots,
        });
      }
    })().catch((e) => J(res, 500, { ok: false, error: e.message }));
    return true;
  }
  if (p === "/internal/v1/my-land") {                       // the connected wallet's on-chain land
    identify(req).then(async (id) => {                      // (NFT-data API — owner 2026-07-21).
      const u = new URL(req.url, "http://x");
      // wallet = the connected MetaMask wallet, else the PG-verified mm_address; admin may inspect any ?wallet=.
      let wallet = connectedWallet(req) || (id && id.wallet);
      if (((id && id.admin) || isAdminWallet(connectedWallet(req))) && u.searchParams.get("wallet")) wallet = u.searchParams.get("wallet");
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
  if (p.startsWith("/internal/v1/moba-map/")) {             // AUTHORITATIVE MOBA MAP FEED (owner 2026-07-25):
    // the single source of truth for a committed data/moba-maps/<name>.json — so the MOBA staging can
    // FETCH (not hand-copy) the current map + verify meta.genVersion instead of drifting to a stale copy.
    // /internal/v1/moba-map/siege-test           → the Battlefield A1 (siege-test.json)
    // /internal/v1/moba-map/siege-test?form=artifact|manifest → the raw artifact / render manifest
    try {
      const name = p.slice("/internal/v1/moba-map/".length).replace(/[^a-z0-9_-]/gi, "");
      if (!name) return J(res, 400, { ok: false, error: "map name required" });
      const form = (new URL(req.url, "http://x").searchParams.get("form") || "").toLowerCase();
      const suffix = form === "artifact" ? ".artifact.json" : form === "manifest" ? ".manifest.json" : ".json";
      const file = path.join(dataRoot(), "moba-maps", name + suffix);
      fs.readFile(file, (e, buf) => {
        if (e) return J(res, 404, { ok: false, error: "no such map: " + name + suffix });
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-cache",
          "x-map-name": name, "access-control-allow-origin": "*" });
        res.end(buf);
      });
    } catch (e) { J(res, 500, { ok: false, error: e.message }); }
    return true;
  }
  if (p === "/internal/v1/moba-maps") {                     // list the served maps + their genVersion (verify tool)
    try {
      const dir = path.join(dataRoot(), "moba-maps");
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.includes(".artifact") && !f.includes(".manifest"));
      const maps = files.map((f) => {
        const name = f.replace(/\.json$/, "");
        let genVersion = null, gates = null;
        try { const m = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
          genVersion = m.meta?.genVersion ?? null;
          gates = (m.structures || []).filter((s) => s.kind === "GATE" && /^castle_gate_/.test(s.anchorId || "")).length;
        } catch {}
        return { name, genVersion, castleGates: gates, url: "/internal/v1/moba-map/" + name };
      });
      J(res, 200, { ok: true, maps });
    } catch (e) { J(res, 500, { ok: false, error: e.message }); }
    return true;
  }
  if (p === "/internal/v1/worldfield") {                    // CONTINENT FEATURE OVERLAY (owner 2026-07-25):
    try {                                                   // a zone's designed geography (borders/rivers/roads/
      const u = new URL(req.url, "http://x");               // ridges/castles) as polylines in ZONE coords — the
      const zone = (u.searchParams.get("zone") || "").toUpperCase();  // same space as the parcel dots, so the
      const f = zone ? loadWorldField(zone) : null;         // client overlays them on the continent map directly.
      if (!f) return J(res, 200, { ok: false, error: "no field for zone " + zone });
      const lines = (arr) => (arr || []).filter((x) => Array.isArray(x.pts) && x.pts.length >= 2)
        .map((x) => ({ id: x.id || null, name: x.name || null, width: x.width || null, magma: !!x.magma, fill: !!x.fill, pts: x.pts }));
      J(res, 200, {
        ok: true, zone,
        rivers: lines(f.rivers), roads: lines(f.roads), coast: lines(f.coast), ridges: lines(f.ridges),
        castles: (f.castles || []).map((c) => ({ id: c.id, name: c.name, kind: c.kind, at: c.at })),
        pois: (f.pois || []).map((q) => ({ id: q.id, name: q.name, kind: q.kind, at: q.at })).filter((q) => Array.isArray(q.at)),
      });
    } catch (e) { J(res, 500, { ok: false, error: e.message }); }
    return true;
  }
  if (p === "/internal/v1/whoami") {                        // designer sign-in state (Bearer = lobby's ef_pg_token)
    const cw = connectedWallet(req), adminW = isAdminWallet(cw);
    identify(req).then((id) => {
      const admin = !!(id && id.admin) || adminW;           // PG-admin OR admin wallet → see all
      if (!id && !cw) return J(res, 200, { ok: false });
      J(res, 200, { ok: true, username: (id && id.username) || null, admin, wallet: cw || (id && id.wallet) || null, walletAdmin: adminW });
    }).catch(() => J(res, 200, cw ? { ok: true, username: null, admin: adminW, wallet: cw, walletAdmin: adminW } : { ok: false }));
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
        // castles without L3 subdivision link to their PRE-DESIGNED estate map (served read-only by
        // the designs route) — every castle in the explorer gets a working ▶ 3D link. The estate
        // artifact existence check covers non-palace estates (walled cities / beacons) too.
        parcel: (Array.isArray(c.heroParcels) && c.heroParcels[0]) || c.estateMapId
          || (c.townEstateId && fs.existsSync(path.join(dataRoot(), "cf-maps/artifacts", String(c.townEstateId) + ".artifact.json")) ? String(c.townEstateId) : null),
        estateMap: !(Array.isArray(c.heroParcels) && c.heroParcels[0]),
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

// ---- NFT metadata override helpers (owner 2026-07-21) --------------------------------------
const publicBase = (req) => {
  if (process.env.PUBLIC_MAP_URL) return String(process.env.PUBLIC_MAP_URL).replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0];
  return host ? `${proto}://${host}` : "https://map.etherfantasy.com";
};
const mapsDir = () => process.env.MAPS_DIR || path.join(process.env.HOME || ".", "ef-battlefields");
// Serve the parcel's live thumbnail; fall back to the EtherFantasy logo when no design exists yet.
function nftImage(res, contract, tokenId) {
  const send = (buf, maxAge) => { res.writeHead(200, { "content-type": "image/png", "cache-control": `public,max-age=${maxAge}`, "access-control-allow-origin": "*" }); res.end(buf); };
  const logo = () => fs.readFile(path.join(__dirname, "..", "assets", "ef-logo-512.png"), (e, buf) => e ? (res.writeHead(404), res.end()) : send(buf, 3600));
  const row = contract === PARCELS_CONTRACT() ? reg.getRow(tokenId) : null;   // parcels only carry thumbs
  if (!row) return logo();
  fs.readFile(path.join(mapsDir(), String(tokenId), `thumb.v${row.designVersion}.png`), (e, buf) => e ? logo() : send(buf, 300));
}
// OpenSea-style metadata. tokenId === parcelId for the Polygon parcels collection.
function nftMetadata(req, contract, tokenId) {
  const base = publicBase(req);
  const image = `${base}/nft/${contract}/${encodeURIComponent(tokenId)}/image`;
  const attributes = [];
  let name, description;
  if (contract === ESTATE_CONTRACT()) {
    const c = allCastles().find((x) => x.heroParcels && x.heroParcels.includes(String(tokenId)));
    name = c ? c.name : `Ether Fantasy Estate #${tokenId}`;
    description = "An Ether Fantasy estate — a large landholding in the Clash Front overworld.";
    attributes.push({ trait_type: "Chain", value: "Ethereum" }, { trait_type: "Type", value: "Estate" });
    if (c) attrPush(attributes, "Continent", c.zoneName || c.zone, "Fortification", c.kind);
  } else {
    const snap = l3Row(tokenId);
    name = `Hexagon Parcel #${tokenId}`;
    description = "A Hexagon City land parcel — a battlefield in the Clash Front overworld.";
    attributes.push({ trait_type: "Chain", value: "Polygon" }, { trait_type: "Type", value: "Parcel" });
    if (snap) {
      const z = (zoneList() || []).find((x) => x.zoneId === snap.zone);
      attrPush(attributes, "Continent", (z && z.name) || snap.zone, "Zone", snap.zone, "Size", snap.sizeClass);
    }
    const row = reg.getRow(tokenId);
    attributes.push({ trait_type: "Designed", value: row ? "Yes" : "No" });
    if (row && row.status) attributes.push({ trait_type: "Design status", value: row.status });
  }
  return { name, description, image, external_url: `${base}/designer/3d?parcel=${encodeURIComponent(tokenId)}`, attributes };
}
const attrPush = (arr, ...kv) => { for (let i = 0; i < kv.length; i += 2) if (kv[i + 1] != null && kv[i + 1] !== "") arr.push({ trait_type: kv[i], value: kv[i + 1] }); };

// POST is the real enforcement.
async function parcelsList(req) {
  const u = new URL(req.url, "http://x");
  const id = await identify(req);
  const admin = !!(id && id.admin) || isAdminWallet(connectedWallet(req)), me = id && id.username ? String(id.username).toLowerCase() : null;
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
    // named demo/theme maps (CANDYLAND …) live outside the registry — serve their committed
    // manifest file so the game-render path works for them too.
    if (!l3Row(parcelId)) {
      try {
        const safe = String(parcelId).replace(/[^0-9A-Za-z_-]/g, "");
        const buf = fs.readFileSync(path.join(dataRoot(), "cf-maps/manifests", safe + ".manifest.json"));
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-cache", "access-control-allow-origin": "*" });
        return res.end(buf);
      } catch {}
    }
    const row = reg.getRow(parcelId);
    if (!row) { await reg.ensureDesign(await parcelFacts(parcelId)); }   // lazy v0 so first hit works
    const v = u.searchParams.get("v");
    const m = reg.readManifest(parcelId, v != null ? Number(v) : null);
    if (!m) return J(res, 404, { ok: false, error: "no_design" });
    if (m.error) return J(res, m.error === "converter_unavailable" ? 501 : 500, { ok: false, ...m });
    res.writeHead(200, { "content-type": "application/json", "cache-control": "public,max-age=31536000,immutable", "access-control-allow-origin": "*" });
    return res.end(JSON.stringify(m));
  }

  // TRAVERSABILITY AUDIT (owner 2026-08-01): headless walk sims over the artifact — the designer's
  // ⛔ collision + 🧭 paths overlays. Public (viewing is open, same as the artifact GET).
  if (req.method === "GET" && parcelId && action === "traverse.json") {
    let artifact = null;
    if (!l3Row(parcelId)) {
      try {
        const safe = String(parcelId).replace(/[^0-9A-Za-z_-]/g, "");
        artifact = JSON.parse(fs.readFileSync(path.join(dataRoot(), "cf-maps/artifacts", safe + ".artifact.json"), "utf8"));
      } catch {}
    }
    if (!artifact) {
      try { ({ artifact } = reg.ensureDesign(await parcelFacts(parcelId))); } catch {}
    }
    if (!artifact) return J(res, 404, { ok: false, error: "no_design" });
    return J(res, 200, { ok: true, ...runAudit(artifact) });
  }

  if (req.method === "GET" && parcelId) {
    // PRE-DESIGNED ESTATE MAPS (canon decision 5 — palaces are pre-designed, never lazily seeded):
    // an ESTATE id (absent from the l3 snapshot) with a committed cf-maps artifact serves that
    // artifact READ-ONLY — so every PALACE opens in the 3D viewer even with no L3 subdivision
    // (estate_palace_maps.mjs is the single writer; the map is frozen by definition).
    if (!l3Row(parcelId)) {
      try {
        const safe = String(parcelId).replace(/[^0-9A-Za-z_-]/g, "");
        const est = JSON.parse(fs.readFileSync(path.join(dataRoot(), "cf-maps/artifacts", safe + ".artifact.json"), "utf8"));
        return J(res, 200, { ok: true, row: { parcelId: safe, status: "ESTATE_MAP", designVersion: est.meta?.designVersion ?? 0, frozen: true, archetype: "palace estate", palette: est.meta?.biome || "" }, artifact: est, budget: budgetFor(3) });
      } catch {}
    }
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
