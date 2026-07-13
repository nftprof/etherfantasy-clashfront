# Deploying the CF map service (`map.etherfantasy.com`)

The map service runs as its **own small Node process** on the shared box (`13.250.39.41`) and nginx
`proxy_pass`es `map.etherfantasy.com` at it. The vhost + Let's Encrypt cert are already live (created
by the map-maker session, `nginx -t`-gated so it can't break the live game); the **interim upstream is
the old lobby `:8090`**. This service replaces that upstream — bring it up, then repoint one line.

## What it serves

| Route | Purpose |
|---|---|
| `/` `/gallery` | all-maps gallery → owned-parcel filter → click into the designer (`maps/gallery.html`) |
| `/designer` `/designer/3d` | the studio + standalone 3D preview (`maps/api.js`, unchanged mirror) |
| `/internal/v1/*` | manifest / artifact / prompt / regenerate / freeze / thumbs / render.json |
| `/internal/v1/designs/<id>/command.json` | the **A1 command-view battlefield** for a parcel (raster registry artifact → §3 converter). The vector map CF's command view + the MOBA loader render; cached per designVersion. |
| `/gallery/owners` | same-origin passthrough of CF's ownership feed (gallery "my land" filter; no CORS) |
| `/healthz` | liveness (returns `ok`) — health-gate the deploy on this |

`server.js` is CF-only glue (gallery, owners passthrough, listener). **`maps/` stays a pristine mirror
of the MOBA repo** — re-pull it on engine upgrades without losing CF wiring. The only CF touch inside
`maps/` is a 2-line `?parcel=` deep-link bootstrap in `designer.html` (so gallery clicks land on the parcel).

## Env

| Var | Default | Notes |
|---|---|---|
| `MAPS_PORT` | `8150` | listener port — this is what `proxy_pass` targets |
| `MAPS_HOST` | `127.0.0.1` | nginx fronts TLS; keep it loopback |
| `MAPS_DIR` | `~/ef-battlefields` | the immutable design registry. **READ the shared dir, don't migrate** (immutable per `designVersion` → concurrent readers are safe). ONE writer only — this service owns generate/regenerate; don't also let the lobby write. |
| `MAPS_WORLD_URL` | `https://cf.etherfantasy.com/api/world` | parcel facts (zone/biome/polygon) |
| `MAPS_OWNERS_URL` | CF `/api/land-owners` | owner-gating feed. Until reachable, owners are UNKNOWN → any signed-in account may design (testing phase); the moment it resolves, owner-mismatch → 403 automatically. |
| `PG_APP_KEY` | — | Pentagon Games login verification (same key the CF app uses) |
| `MAPS_API_TOKEN` | — | optional admin `x-maps-key` (ops); or drop `~/.ef_maps_key` on the box |
| `MAPS_LLM_*` | — | optional server-side default LLM for owner prompts (else bring-your-own-key in the designer) |

## Bring it up — automated (CF self-hosted runner)

Push to the **`deploy/map`** branch (or run the *Deploy map service* workflow via dispatch). The CF
runner (label `cf`, already on `13.250.39.41` — no ssh key) rsyncs `map-service/` → `~/ef-map-service`
and runs `deploy/remote-deploy-map.sh`: `pm2 start server.js --name ef-map-service` on `:8150`,
health-gated on `/healthz`. The registry (`~/ef-battlefields`) is never touched. Isolated pm2 app —
restarting it can't disturb `clashfront` (:8130) or cfx (:8131).

```bash
git push bsh HEAD:deploy/map      # ships map-service to the box via the CF runner
```

## Bring it up — manual (pm2)

```bash
# from the CF checkout on the box (this repo), in map-service/
cd map-service
MAPS_PORT=8150 \
MAPS_DIR="$HOME/ef-battlefields" \
MAPS_WORLD_URL="https://cf.etherfantasy.com/api/world" \
MAPS_OWNERS_URL="https://cf.etherfantasy.com/api/land-owners" \
pm2 start server.js --name ef-map-service --update-env
pm2 save
curl -fsS http://127.0.0.1:8150/healthz   # → ok
```

(`PG_APP_KEY` comes from the box's existing provisioning — export it in the pm2 env or rely on the
`~/.ef_maps_*` files the box already carries. This is a **non-workspace** folder: it never runs in
`pnpm -r build && pnpm -r test`, so it cannot affect the live CF build/deploy gate.)

## Repoint nginx (one line)

Edit `/etc/nginx/sites-available/map.etherfantasy.com` — change the interim upstream to `:8150`:

```nginx
location / {
    proxy_pass http://127.0.0.1:8150;   # was :8090 (interim lobby)
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx      # -t gate: never reload a broken config
curl -fsS https://map.etherfantasy.com/healthz    # → ok
```

No cert/vhost rework needed — only the `proxy_pass` port changes.

## Retire the old `:8090` maps mount (owner-approved 2026-07-11 — "we only use map.etherfantasy.com")

`map.etherfantasy.com` → `:8150` (the standalone map-service) is now the ONLY map path. The old maps
API mounted in the MOBA lobby (`:8090`) is superseded and must stop sharing `~/ef-battlefields` —
two writers on one registry race and serve each other stale rows (the exact bug the deploy session
hit). Box steps (needs SSH; run once):

1. **Confirm nginx points to `:8150`** (the deploy session already did this): `grep proxy_pass
   /etc/nginx/sites-available/map.etherfantasy.com` → `:8150`. If not, do the one-line repoint above.
2. **⚠ Check what else `:8090` serves before stopping it.** `:8090` is `ef-moba-lobby` — it may still
   serve the MOBA game lobby (auth/matchmaking), not only maps. So:
   - If `:8090` is **ONLY** the maps mount (fully superseded) → stop it: `pm2 stop ef-moba-lobby &&
     pm2 delete ef-moba-lobby && pm2 save`.
   - If `:8090` **also** serves the live MOBA lobby → do NOT kill it; instead remove its maps route
     (or point ITS maps at a throwaway dir) so it stops writing `~/ef-battlefields`. The map-service
     (`:8150`) becomes the sole writer.
   - Belt-and-suspenders alternative (no `:8090` change): give the map-service its **own** registry —
     start `ef-map-service` with `MAPS_DIR=$HOME/ef-map-registry` (a fresh dir) so the two processes
     never share storage. Trade-off: existing frozen/owner designs in `~/ef-battlefields` would need
     a one-time copy into the new dir.
3. **Verify one writer:** `lsof +D ~/ef-battlefields 2>/dev/null | awk '{print $2}' | sort -u` should
   show only the `:8150` process. Then `curl -fsS https://map.etherfantasy.com/healthz` → ok.

Recommended: option in step 2 that leaves the live MOBA lobby untouched if it's still needed —
retire the maps ROUTE, not necessarily the whole process. The owner's intent ("retire the old map
path/site") is satisfied the moment `~/ef-battlefields` has a single writer and the public map path
is `map.etherfantasy.com → :8150` only.

## Nine-layer game render in the designer (2026-07-13)

The 3D preview (`/designer/3d?parcel=`) now renders **the game's own scene builder** —
`maps/ef_battlefield.js` (`EF_BATTLEFIELD`, vendored verbatim from the MOBA repo's `shared/`) fed by
the render manifest from `maps/battlefield_converter.cjs` (vendored from MOBA `tools/`; the registry
auto-detects it → `render.json` returns real manifests now). Floor textures live in `floors/` and
are served at `/floors/*.png`; the module itself at `/ef_battlefield.js`. No env, no config — after
a `git pull` + `pm2 restart ef-map-service` the designer shows the FINAL nine-layer look for every
parcel (manifests build lazily per designVersion and cache as `render.v{N}.json` next to the
artifact; previously-cached designs light up on first hit, no bust needed). If the converter file is
ever missing the preview falls back to the old flat render and says so in the HUD chip.
Re-pull both vendored files whenever the MOBA repo upgrades them (they are pristine mirrors).

## Last mile — generated maps in live battles

The maps loop closes in two steps CF already ships:
1. **Produce/serve the A1**: `GET /internal/v1/designs/<parcelId>/command.json` returns the parcel's
   designed battlefield (raster registry artifact → §3 `command_converter`), cached per version.
2. **CF prefers the parcel's own map**: CF's `battleStatic` calls `loadParcelBattlefield(parcelId)` —
   it reads `<CF_PARCEL_MAPS_DIR>/<parcelId>.json` (default `data/cf-maps/parcels/`), validates it
   against the 5 playability invariants, and uses it in place of the stand-in; missing/invalid ⇒
   falls back to `legacy-{1,3}lane.json`. A bridge/match-server map still wins upstream (engine path).

So to light up a real per-parcel map for the wild/command view, drop its `command.json` output at
`<CF_PARCEL_MAPS_DIR>/<parcelId>.json` on the CF box (a tiny sync from the registry, or curl the
endpoint). No code change, no restart of the game needed beyond picking up the file (cache is
per-parcel, cleared on process restart).

## Retire the old designer (when `map.` is proven)

Add to the **moba** vhost (owned by the map-maker session — graceful 301, reversible, preserves links):

```nginx
location /designer { return 301 https://map.etherfantasy.com/designer; }
```

Hard-remove `moba.etherfantasy.com/designer` only after the redirect has soaked.

## Verify locally (no box)

```bash
cd map-service
MAPS_PORT=8145 MAPS_DIR=/tmp/ef-bf node server.js &
curl -s localhost:8145/healthz                                   # ok
curl -s localhost:8145/internal/v1/designs/60202500123 -o /dev/null  # lazily makes a v0 design
open http://localhost:8145/                                      # gallery with the new card
```
