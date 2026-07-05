# cfx.etherfantasy.com — isolated staging (look-and-feel preview)

A **second, fully isolated** Clash Front instance on the same box, so visual work can be shipped and
reviewed **without ever touching the live game**.

| | live | cfx staging |
|---|---|---|
| host | cf.etherfantasy.com | **cfx.etherfantasy.com** |
| app port | 8130 | **8131** |
| pm2 app | `clashfront` | **`clashfront-cfx`** |
| dir | `~/clashfront-mvp` | **`~/clashfront-cfx`** |
| world save | `data/save.json` | **`data/save.cfx.json`** |
| deploy branch | `deploy/cf-mvp` | **`deploy/cfx`** |
| PG login / battle engine | on | **off** (dev name-only join, instant resolves) |

Restarting `clashfront-cfx` never restarts `clashfront` — separate process. DNS: `cfx → 13.250.39.41`
(same box, plain A record, done 2026-07-05).

## Deploying to cfx
Push the branch to the `deploy/cfx` ref (or run the `cfx-deploy.yml` workflow manually). The
self-hosted runner builds and (re)starts `clashfront-cfx` on :8131 in `~/clashfront-cfx`:

```bash
git push origin <branch>:deploy/cfx      # → cfx-deploy.yml → clashfront-cfx on :8131
```

## One-time box setup (needs sudo on the box — run once, after the first cfx deploy has started :8131)

```bash
sudo cp ~/clashfront-cfx/deploy/nginx-cfx.etherfantasy.com.conf /etc/nginx/sites-available/cfx.etherfantasy.com
sudo ln -sf /etc/nginx/sites-available/cfx.etherfantasy.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d cfx.etherfantasy.com          # DNS already resolves → issues TLS
```

After that, `https://cfx.etherfantasy.com` serves the preview. Promote an approved look to the live
game by merging the same commits into `deploy/cf-mvp` (owner's call — never automatic).
