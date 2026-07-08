// server.js — the standalone CF map-service HTTP process (map.etherfantasy.com upstream).
//
// The map system was originally mounted INTO the MOBA lobby via `if (mapsApi(req,res)) return;`.
// On the CF side it runs as its OWN small Node process so nginx can `proxy_pass` map.etherfantasy.com
// straight at it — no lobby coupling, and it can be brought up / restarted without touching the
// live game (cf :8130) or the map-maker lobby (:8090). See DEPLOY.md for the pm2 + proxy_pass repoint.
//
// Layering (keeps maps/api.js a PRISTINE mirror of the MOBA repo — re-pull stays clean):
//   • maps/api.js  — the unchanged map API (designer, registry, prompt/regenerate/freeze).
//   • THIS file    — CF-only glue: the gallery landing page, a same-origin owners passthrough
//                    (so the gallery can filter "my land" without a cross-origin fetch to CF),
//                    /healthz, and the HTTP listener. No map logic lives here.
//
// Env: MAPS_PORT (default 8150; :8140 is cf-battle-api), MAPS_HOST (default 127.0.0.1 — nginx fronts TLS),
//      MAPS_OWNERS_URL (owner feed; default CF's /api/land-owners), plus everything maps/api.js
//      reads (MAPS_WORLD_URL, MAPS_DIR, PG_APP_KEY, MAPS_API_TOKEN, MAPS_LLM_*).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapsApi } from "./maps/api.js";
import * as reg from "./maps/registry.js";
import { toBattlefieldA1 } from "./maps/command_converter.js";
import { renderThumb } from "./maps/thumb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// NB: :8140 is taken by cf-battle-api on the shared box; the map service uses :8150.
const PORT = Number(process.env.MAPS_PORT || 8150);
const HOST = process.env.MAPS_HOST || "127.0.0.1";

// Owner feed URL — env, or ~/.ef_maps_owners_url (the file the box already uses), or CF's default.
const ownersUrl = () => {
  if (process.env.MAPS_OWNERS_URL) return process.env.MAPS_OWNERS_URL;
  try { const f = fs.readFileSync(`${process.env.HOME || ""}/.ef_maps_owners_url`, "utf8").trim(); if (f) return f; } catch { /* not set */ }
  return "https://cf.etherfantasy.com/api/land-owners";
};

// Same-origin owners passthrough for the gallery. Normalizes CF's `{owners:{parcelId:username}}`
// (or a `[{parcelId,owner}]` array) to a flat `{parcelId: username}` map. Cached 5 min; a dead
// feed relays `{}` (gallery degrades to "all maps" — never errors). The map service and CF run on
// the same box, so this is a localhost hop; the browser never touches CF's origin (no CORS dance).
let _owners = { at: 0, map: {} };
async function ownersMap() {
  if (Date.now() - _owners.at < 300_000) return _owners.map;
  try {
    const d = await fetch(ownersUrl(), { signal: AbortSignal.timeout(6000) }).then((r) => r.json());
    const src = d.owners || d, out = {};
    if (Array.isArray(src)) for (const o of src) out[String(o.parcelId)] = String(o.owner ?? o.username ?? "");
    else for (const [k, v] of Object.entries(src)) out[String(k)] = String(v);
    _owners = { at: Date.now(), map: out };
  } catch { _owners.at = Date.now() - 240_000; } // retry in ~1 min, don't hammer
  return _owners.map;
}

// A1 command-map producer: current (or ?v=N) raster artifact → toBattlefieldA1, cached per
// parcelId+designVersion (immutable). Lazily generates v0 (square fallback) so a first hit works,
// mirroring render.json. Never throws to the socket — errors → JSON 4xx/5xx.
const _cmdCache = new Map(); // `${parcelId}:${v}` → A1 object
function commandJson(req, res, parcelId) {
  try {
    const u = new URL(req.url, "http://x");
    const vq = u.searchParams.get("v");
    let row = reg.getRow(parcelId);
    if (!row && vq == null) { try { reg.ensureDesign({ parcelId: String(parcelId) }); row = reg.getRow(parcelId); } catch { /* fall through */ } }
    const v = vq != null ? Number(vq) : row?.designVersion;
    if (v == null) { res.writeHead(404, { "content-type": "application/json", "access-control-allow-origin": "*" }); return res.end('{"ok":false,"error":"no_design"}'); }
    const key = `${parcelId}:${v}`;
    let a1 = _cmdCache.get(key);
    if (!a1) {
      const art = reg.readArtifact(parcelId, v);
      if (!art) { res.writeHead(404, { "content-type": "application/json", "access-control-allow-origin": "*" }); return res.end('{"ok":false,"error":"no_design"}'); }
      a1 = toBattlefieldA1(art);
      if (_cmdCache.size > 2000) _cmdCache.clear();
      _cmdCache.set(key, a1);
    }
    res.writeHead(200, { "content-type": "application/json", "cache-control": "public,max-age=31536000,immutable", "access-control-allow-origin": "*" });
    res.end(JSON.stringify(a1));
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
  }
}

// Bundled EXAMPLE maps (hand-authored raster artifacts, e.g. the real MOBA single-player map
// reverse-engineered from the client) — served exactly like registry designs so /designer,
// /designer/3d and /command.json work for them without a seed in the registry. Keyed by parcelId.
const EXAMPLES = (() => {
  const out = new Map();
  try {
    const dir = path.join(__dirname, "maps", "examples");
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".artifact.json")) continue;
      const art = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      out.set(String(art.meta?.parcelId || f.replace(".artifact.json", "")), art);
    }
  } catch { /* no examples dir */ }
  return out;
})();
const jsonRes = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end(JSON.stringify(obj)); };

const sendFile = (res, file, type) => {
  fs.readFile(path.join(__dirname, file), (e, buf) => {
    if (e) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
    res.end(buf);
  });
};

export function handleRequest(req, res) {
  const [p] = req.url.split("?");

  if (p === "/healthz" || p === "/health") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok"); }

  // gallery landing page (all-maps + my-land filter → click into /designer)
  if (p === "/" || p === "/gallery" || p === "/gallery/") return sendFile(res, "maps/gallery.html", "text/html");

  // multi-format viewer: 2D command · landscape/thumbnail · 3D link · raw JSON — for one parcel/example.
  // Reads the same public endpoints the CF command view + designer use, so it works for any designed
  // parcel OR bundled example. (The gallery's "2D" button points here — NOT the designer.)
  if (p === "/view" || p === "/view/") return sendFile(res, "maps/view.html", "text/html");

  // list the bundled example maps (MOBA reverse-engineer + the CF biome references) for the gallery
  if (p === "/gallery/examples") {
    const list = [...EXAMPLES.values()].map((a) => ({
      parcelId: a.meta?.parcelId, biome: a.meta?.biome, palette: a.meta?.params?.palette,
      archetype: a.meta?.params?.archetype, laneCount: a.laneCount ?? a.meta?.laneCount ?? 1,
    }));
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-cache" });
    return res.end(JSON.stringify({ ok: true, examples: list }));
  }

  // same-origin owners feed for the gallery's "my land" filter
  if (p === "/gallery/owners") {
    ownersMap().then((owners) => {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-cache" });
      res.end(JSON.stringify({ ok: true, owners }));
    }).catch(() => { res.writeHead(200, { "content-type": "application/json" }); res.end('{"ok":false,"owners":{}}'); });
    return;
  }

  // Bundled EXAMPLE maps (e.g. MOBA-SINGLEPLAYER) — serve like a registry design so /designer +
  // /designer/3d + command.json render them. render.json 404s → the 3D preview falls back to flat
  // (MOBA maps are flat anyway), which is exactly the "current 3D from the 2D spec" the owner wants.
  {
    const ex = /^\/internal\/v1\/designs\/([^/]+)(\/command\.json|\/render\.json|\/thumb\.png)?$/.exec(p);
    if (ex && EXAMPLES.has(decodeURIComponent(ex[1]))) {
      const art = EXAMPLES.get(decodeURIComponent(ex[1]));
      const sub = ex[2];
      if (sub === "/command.json") { jsonRes(res, 200, toBattlefieldA1(art)); return; }
      if (sub === "/render.json") { jsonRes(res, 404, { ok: false, error: "no_manifest" }); return; }
      if (sub === "/thumb.png") {
        // bake the top-down landscape PNG on the fly (examples have no registry-saved thumb) so the
        // viewer's Landscape tab + gallery thumbnails work for bundled maps too.
        try {
          const png = renderThumb(art);
          res.writeHead(200, { "content-type": "image/png", "cache-control": "public,max-age=86400", "access-control-allow-origin": "*" });
          res.end(Buffer.from(png));
        } catch (e) { res.writeHead(500, { "content-type": "text/plain" }); res.end(String(e && e.message || e)); }
        return;
      }
      jsonRes(res, 200, { ok: true, row: { parcelId: art.meta.parcelId, designVersion: 0, status: "EXAMPLE", archetype: art.meta.params?.archetype, palette: art.meta.params?.palette }, artifact: art, budget: { level: 0 } });
      return;
    }
  }

  // A1 command-view battlefield for a parcel (raster registry artifact → §3 converter). This is the
  // vector map CF's command view + the MOBA loader consume (docs/briefs/BATTLEFIELD-SCHEMA.md). The
  // bridge/match server (or CF's per-parcel loader) pulls it per battle; public + cached per version.
  // GET /internal/v1/designs/<parcelId>/command.json[?v=N]
  {
    const m = /^\/internal\/v1\/designs\/([^/]+)\/command\.json$/.exec(p);
    if (m) { commandJson(req, res, decodeURIComponent(m[1])); return; }
  }

  // everything else → the map API (designer, registry, prompt/regenerate/freeze, thumbs, render.json)
  if (mapsApi(req, res)) return;

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
}

export const createMapServer = () => http.createServer(handleRequest);

// Listen only when run as the entrypoint (tests import handleRequest without binding a port).
// Under pm2 FORK mode the entry is pm2's ProcessContainerFork wrapper, not this file — pm2 exposes
// the real script path in `pm_exec_path`. Fall back to argv[1] for a direct `node server.js`.
const entry = process.env["pm_exec_path"] || process.argv[1] || "";
const isMain = import.meta.url === `file://${entry}`;
if (isMain) {
  const srv = createMapServer();
  srv.on("error", (e) => {
    // fail LOUDLY on a port clash so a misconfigured port never silently 404s behind nginx
    // eslint-disable-next-line no-console
    console.error(`[map-service] FATAL: cannot bind ${HOST}:${PORT} — ${e && e.code === "EADDRINUSE" ? "port already in use (pick a free MAPS_PORT; :8140 is cf-battle-api)" : (e && e.message)}`);
    process.exit(1);
  });
  srv.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`[map-service] listening on http://${HOST}:${PORT}  (gallery / · designer /designer · api /internal/v1/*)`);
  });
}
