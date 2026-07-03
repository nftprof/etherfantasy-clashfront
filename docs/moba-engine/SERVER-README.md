# EF Moba — Authoritative Game Server

Server-authoritative backend for EF Moba, per `../SERVER_PLAN.md`. The browser stops
hosting; this Node process owns the simulation. Same binary runs on LAN or AWS (§8).

## Status (built 2026-06-16)
- ✅ **P0 (foundation):** pure-data headless sim (`sim/`, zero THREE/DOM), fixed 30 Hz tick,
  seeded deterministic RNG. Golden-master **determinism test passing** (`npm run goldenmaster`).
- ✅ **P1 (transport):** WSS gateway + matchmaker + live `Match` loop; clients connect as pure
  input/snapshot clients (no in-browser host). **Live smoke test passing locally and over the
  internet** (`npm run … test/smoke.js`).
- ✅ **P2 (start):** input schema-validation + per-connection rate-limit; movement clamped to
  `speed*dt`, map bounds enforced, hp/damage/deaths server-side only.
- ⏳ **Porting remaining (P0 cont.):** only `movement` + basic `combat` systems are ported so far.
  Abilities (the 16 `ef_core.js` kits), minions/waves, towers, economy/shop, pets, wild camps,
  evolution still need porting from `index.html` onto the `sim/` data model.
- ⏳ **P3 persistence (RDS, CT ledger), P4 scale (Redis/ALB/load test)** — not started.

## Live deployment
- **Box:** `ubuntu@13.250.39.41` (c7g.large, Ubuntu 22.04 ARM64), via `~/.ssh/doctor_key`.
- **Process:** `pm2` app `ef-moba-server` on **port 8080**, restarts on boot.
- **Health:** `http://13.250.39.41:8080/health`
- **WS endpoint (current):** `ws://13.250.39.41:8080`
  ⚠️ Plain `ws://` for now. Browsers on an `https://` page require `wss://` — add TLS next
  (nginx/Caddy reverse-proxy with an ACM/Let's Encrypt cert on 443, or an ALB). Then set
  `EF_SERVER_URL=wss://<domain>`.

## Run
```bash
npm install
npm start                 # PORT=8080 by default
npm run goldenmaster      # P0 determinism test
node test/smoke.js        # local 2-client match test
node test/smoke.js ws://13.250.39.41:8080   # against the live box
```

## Deploy (repeatable)
```bash
tar czf /tmp/ef-server.tgz --exclude=node_modules --exclude=.git .
scp -i ~/.ssh/doctor_key /tmp/ef-server.tgz ubuntu@13.250.39.41:~/
ssh -i ~/.ssh/doctor_key ubuntu@13.250.39.41 '
  tar xzf ~/ef-server.tgz -C ~/ef-moba-server &&
  cd ~/ef-moba-server && npm install --omit=dev &&
  pm2 restart ef-moba-server --update-env && pm2 save'
```

## Layout
```
server/
  index.js          # http health + attaches WSS gateway
  config.js         # env: PORT, TICK_HZ, SNAPSHOT_HZ, TEAM_SIZE, MAP, rate limit
  net/gateway.js    # WSS handshake, validate+rate-limit, route → matchmaker
  net/matchmaker.js # queue → form match (TEAM_SIZE*2 players)
  net/match.js      # one match: 30Hz tick, 10Hz snapshot broadcast
  sim/              # PURE logic (no THREE/DOM)
    state.js        # plain-data unit/world model
    step.js         # tick(dt, inputs) + applyInput
    systems/        # movement.js, combat.js  (port the rest here)
    rng.js          # seeded PRNG
  validate.js       # anti-cheat input validation + rate limiter
  snapshot.js       # world → snapshot encoder
  test/             # goldenmaster.js, smoke.js
```

## Protocol (matches the existing client input verbs)
- Client → server: `{t:'join', name, slot}` then `{t:'in', a:'move'|'amove'|'atk'|'cast'|'flash'|'potion'|'recall'|'stop'|'buy'|'pet', …}`
- Server → client: `{t:'hello'}`, `{t:'queued'}`, `{t:'start', seats}`, `{t:'snap', tick, units:[…]}`, `{t:'end', winner}`

## Next steps (in order)
1. **TLS/WSS** in front of 8080 (so the deployed HTTPS client can connect).
2. **Client `?server=1` path** in `index.html`: connect to `EF_SERVER_URL`, send inputs via the
   existing `netSendInput` verbs, render `snap` frames by reusing `netGuestFrame`/`applyModel`.
   ⚠️ Coordinate with the hourly game-feature auto-builder (it also edits `index.html`) to avoid
   merge conflicts — ideally pause it for this change or land it in a dedicated commit.
3. **Port remaining sim systems** from `index.html` (abilities → minions → towers → economy → pets),
   golden-mastering each against the browser sim per `SERVER_PLAN.md` §5.
4. **P3/P4:** RDS + CT ledger, then Redis/ALB + 200-ccu load test.
