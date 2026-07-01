# Deploy `moba.etherfantasy.com` (lobby + game) with SSL

Goal: players hit **https://moba.etherfantasy.com**, see the landing page, log in
with Pentagon Games, wait in a **lobby**, then play a **server-hosted** match.

> **Who runs this:** anyone with the box SSH key (`~/.ssh/doctor_key`). It can't be
> run from the Cowork sandbox (no key, no network route). Each step is copy-paste.

## Topology
- **Game box** `13.250.39.41` (this is where moba.* lives). The main website lives on
  the **web box** `13.213.205.145` (a *different* Claude Code session) — we don't touch it.
- Three things run on the game box behind nginx:
  - **8080** `ef-moba-server` — authoritative game (already running, pm2).
  - **8090** `ef-moba-lobby` — the new lobby/matchmaking service.
  - **static** the game client (`/play`) + the lobby landing (`/`).
- nginx terminates TLS on 443 and reverse-proxies. Node ports stay internal.

```
https://moba.etherfantasy.com
   /            → lobby service (8090)  [landing, login, lobby, ws]
   /game        → game server  (8080)  [authoritative match ws]
   /play/       → static game client (EF Moba index.html, shared/, assets…)
```

## 0. DNS + firewall (do first)
1. Add an **A record**: `moba.etherfantasy.com → 13.213` … **`13.250.39.41`**.
2. In the game box's security group, open inbound **80** and **443** (TCP). You can
   now *close* public **8080** (nginx reaches it on localhost) — or leave it for the
   existing `ws://…:8080` smoke tests.

## 1. Ship the code to the box
From your machine (repo root = `EF Moba/`):
```bash
KEY=~/.ssh/doctor_key ; BOX=ubuntu@13.250.39.41
# a) the server bundle (game server + lobby live in the same tree)
tar czf /tmp/ef-server.tgz --exclude=node_modules --exclude=.git server
scp -i $KEY /tmp/ef-server.tgz $BOX:~/
# b) the game client (static html/assets the lobby links to as /play)
tar czf /tmp/ef-game.tgz index.html pve.html launcher.html model_calibration.js \
        shared hero pets boss masters mons vrm wiki.html wiki_img audit.html
scp -i $KEY /tmp/ef-game.tgz $BOX:~/
```
On the box:
```bash
ssh -i ~/.ssh/doctor_key ubuntu@13.250.39.41
mkdir -p ~/ef-moba-server ~/ef-moba-game
tar xzf ~/ef-server.tgz -C ~/ef-moba-server --strip-components=1   # → ~/ef-moba-server (index.js, lobby/, …)
tar xzf ~/ef-game.tgz   -C ~/ef-moba-game
cd ~/ef-moba-server && npm install --omit=dev    # installs `ws`
```

## 2. Configure the lobby front-end
Edit `~/ef-moba-server/lobby/public/config.js`:
```js
window.EF_PG_LOGIN_URL = "<Pentagon Games hosted-login URL>"; // confirm against pg-identity-docs
window.EF_LOBBY_WS     = "";              // blank = same origin (wss://moba.etherfantasy.com)
window.EF_GAME_CLIENT  = "/play/index.html";
```

## 3. Run the lobby under pm2 (alongside the game server)
```bash
cd ~/ef-moba-server
PG_DEV_FALLBACK=0 \
LOBBY_PORT=8090 \
EF_GAME_WS=wss://moba.etherfantasy.com/game \
PG_API_BASE=https://api.account.pentagon.games \
  pm2 start lobby/index.js --name ef-moba-lobby --update-env
pm2 save
curl -s localhost:8090/health   # {"ok":true,"service":"ef-moba-lobby",...}
```
> Keep `PG_DEV_FALLBACK=0` in production (disables the `dev:Name` login). The game
> server (`ef-moba-server`, 8080) keeps running unchanged.

## 4. nginx + Let's Encrypt SSL
```bash
sudo apt-get update && sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo tee /etc/nginx/sites-available/moba.etherfantasy.com >/dev/null <<'NGINX'
server {
  listen 80;
  server_name moba.etherfantasy.com;

  # authoritative game websocket
  location /game {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 600s;
  }

  # static game client
  location /play/ {
    alias /home/ubuntu/ef-moba-game/;
    try_files $uri $uri/ =404;
  }

  # lobby service (landing + login + lobby websocket) — catch-all LAST
  location / {
    proxy_pass http://127.0.0.1:8090;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 600s;
  }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/moba.etherfantasy.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# issue + auto-install the cert (also sets up the 80→443 redirect and renewal timer)
sudo certbot --nginx -d moba.etherfantasy.com --redirect -m admin@etherfantasy.com --agree-tos -n
```

## 5. Verify
```bash
curl -s https://moba.etherfantasy.com/health        # lobby health over TLS
# open https://moba.etherfantasy.com in a browser → landing → login → lobby
```
Two browsers (or one + an incognito) → both Quick Match → you should land in the same
room, ready up, and launch together.

## 6. Updating later (repeatable)
```bash
# lobby/server code
tar czf /tmp/ef-server.tgz --exclude=node_modules --exclude=.git server
scp -i ~/.ssh/doctor_key /tmp/ef-server.tgz ubuntu@13.250.39.41:~/
ssh -i ~/.ssh/doctor_key ubuntu@13.250.39.41 '
  tar xzf ~/ef-server.tgz -C ~/ef-moba-server --strip-components=1 &&
  cd ~/ef-moba-server && npm install --omit=dev &&
  pm2 restart ef-moba-lobby --update-env'
```

## What works now vs. pending
- ✅ **Now:** landing, PG login (server-verified username), rooms + quick-match + ready-up
  lobby, server-hosted launch handoff, TLS. Movement + basic combat already run on the
  authoritative server (8080).
- ⏳ **Pending (game-server session):** finish porting abilities / minions / towers / economy
  / pets into the headless sim so a *full* match is server-authoritative end-to-end; and add
  the `party` grouping to `matchmaker.js` (see `lobby/PROTOCOL.md`) so a launched group is
  kept together. Until then `/play` loads the existing client (local/AI) — the lobby flow is
  fully real, the *in-match* server-rendering is the remaining port.
- ⏳ **PG login URL:** set `EF_PG_LOGIN_URL` once the exact hosted-login redirect is confirmed
  from pg-identity-docs (the server-side token→username verification is already implemented).

## Coordination
- Don't deploy onto the **web box** (`13.213.205.145`) — that's the other session's website.
- This adds nginx + an 8090 pm2 app on the **game box**; it doesn't modify `ef-moba-server`.
- The hourly game-feature auto-builder edits the *game client* (`index.html`); re-run step 1b
  to refresh `/play` after notable client changes.
