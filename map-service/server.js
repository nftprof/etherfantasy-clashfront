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
// Env: MAPS_PORT (default 8140), MAPS_HOST (default 127.0.0.1 — nginx fronts TLS),
//      MAPS_OWNERS_URL (owner feed; default CF's /api/land-owners), plus everything maps/api.js
//      reads (MAPS_WORLD_URL, MAPS_DIR, PG_APP_KEY, MAPS_API_TOKEN, MAPS_LLM_*).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapsApi } from "./maps/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MAPS_PORT || 8140);
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

const sendFile = (res, file, type) => {
  fs.readFile(path.join(__dirname, file), (e, buf) => {
    if (e) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
    res.end(buf);
  });
};

const server = http.createServer((req, res) => {
  const [p] = req.url.split("?");

  if (p === "/healthz" || p === "/health") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok"); }

  // gallery landing page (all-maps + my-land filter → click into /designer)
  if (p === "/" || p === "/gallery" || p === "/gallery/") return sendFile(res, "maps/gallery.html", "text/html");

  // same-origin owners feed for the gallery's "my land" filter
  if (p === "/gallery/owners") {
    ownersMap().then((owners) => {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-cache" });
      res.end(JSON.stringify({ ok: true, owners }));
    }).catch(() => { res.writeHead(200, { "content-type": "application/json" }); res.end('{"ok":false,"owners":{}}'); });
    return;
  }

  // everything else → the map API (designer, registry, prompt/regenerate/freeze, thumbs, render.json)
  if (mapsApi(req, res)) return;

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[map-service] listening on http://${HOST}:${PORT}  (gallery / · designer /designer · api /internal/v1/*)`);
});
