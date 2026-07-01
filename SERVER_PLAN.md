# EF Moba — Server-Authoritative Backend Plan

Target: **~200 concurrent players**, server-authoritative simulation, real anti-cheat,
front end on AWS. Covered by the AWS grant (~$100–150/mo at this scale).

## 0. The key insight (why this is tractable)
The game is ALREADY **host-authoritative P2P**: one player's browser runs the whole
simulation; the other players are **input-only "guest" clients** that send `{a:'move'|'cast'|...}`
and receive **10 Hz snapshots** (`netGuestFrame`, `netSendInput`, the `hr`/unit snapshot format
in `index.html`). Going server-authoritative = **move the "host" out of a browser and into a
headless Node process, and make EVERY player a guest.** The existing guest code is ~60% of the
client we need; the existing host loop is ~70% of the server sim we need. We are refactoring,
not rewriting.

## 1. Architecture (200 concurrent = ~50 matches @ 2v2)
```
            ┌─────────── CloudFront (HTTPS) ───────────┐
  Browser ──┤  static front end (S3): HTML/JS/GLB       │
   (client) └───────────────────────────────────────────┘
        │ WSS (inputs up, snapshots down)
        ▼
   ┌──────────────── EC2 (Node) ────────────────┐
   │  Gateway/WSS  →  Matchmaker  →  Match sims  │   1 box is plenty for 200 ccu
   │   (auth, route)   (queue)       (N worker    │
   │                                  processes,  │
   │                                  20–30 Hz)   │
   └───────┬───────────────────────────┬─────────┘
           │                           │
      RDS Postgres                ElastiCache Redis (optional at this scale)
   (accounts, CT ledger,        (matchmaking queue, presence,
    match results, gear)         snapshot pub/sub if multi-process)
```

## 2. The refactor — decouple SIM from RENDER (the real work)
Today the sim and Three.js rendering are fused (e.g. a unit's position lives on `u.grp` =
a `THREE.Group`). To run headless we split them:

1. **`sim/` module — pure data + logic, ZERO Three.js / DOM.**
   - Unit state becomes plain data: `{id, kind, team, x, z, hp, maxHp, mp, cd[], state, ...}`
     instead of reading position off `u.grp.position`.
   - Port the update systems verbatim but operating on that data: movement, collision,
     combat/`dmgUnit`, abilities (already parameterized in `ef_core.js` via the `P` primitives —
     server provides non-visual primitives: `fxRing`=noop, `aoe`/`lineShot`/`dash`=state math),
     AI, economy, spawns, win/lose.
   - Deterministic fixed-timestep tick (e.g. 30 Hz). Seed RNG per match so it's reproducible.
2. **Server** = `new Match(seed, roster)` ticking `sim.step(dt, inputs)` and emitting snapshots.
3. **Client** = the current renderer, but ALWAYS in "guest" mode: send inputs, receive
   snapshots, interpolate, render with Three.js. Reuse `netGuestFrame` + snapshot-apply +
   `applyModel`/`updateAnim`. The local player no longer simulates anything authoritative.
4. **Shared code stays shared**: `ef_core.js` kits/values, `mon_lineage.json`, calibration —
   server imports the logic, client imports the rendering. Single source of truth preserved.

Migration tactic: do it **incrementally behind a flag**. Keep P2P working; add a `?server=1`
path that connects to the Node sim. Port one system at a time, diffing server vs. browser
output for the same input log until they match.

## 3. Anti-cheat = server authority (NOT client memory obfuscation)
All of these live in the server's input handler / sim. The client is a renderer that can only
lie about its *inputs*; the server validates every one:
- **HP / damage / deaths**: computed server-side only. Client never sets its own HP.
- **Movement**: clamp displacement to `maxSpeed*dt`; reject teleports except server-executed
  blink/recall; clamp to map; reject NaN/▒ inputs.
- **Abilities**: enforce cooldown, mana, range, target validity server-side; ignore otherwise.
- **Economy / CT**: gold + CT mutate server-side only, written to the RDS ledger (and the
  on-chain contract for staked matches). Never trust a client balance.
- **Inputs**: schema-validate + rate-limit per connection; drop malformed; one identity per seat.
- **Match result + payout**: decided and recorded server-side; clients just display it.
(We are NOT doing ASLR/dynamic-offset memory tricks — those are native-game defenses that don't
map to JS, where the attack is just DevTools/packet forgery. Server authority is the real fix.)

## 4. AWS topology + specs for 200 concurrent
- **Front end**: S3 + CloudFront, ACM cert, Route53. (No box; HTTPS required for WSS/mobile.)
- **Backend**: 1× **EC2 c6i.large (2 vCPU/4 GB)** to start — 50 matches @ 30 Hz is light; size
  up to c6i.xlarge if load tests say so. Node cluster: 1 gateway/matchmaker + worker procs.
- **WSS ingress**: ALB with WebSocket support (or terminate TLS on the box). Sticky by match.
- **DB**: **RDS Postgres db.t3.small** (accounts, CT ledger, results, gear). Separate from day 1.
- **Cache/queue**: ElastiCache Redis **t4g.micro** — optional now, add when multi-process.
- **TURN**: not needed once authoritative (no P2P NAT traversal — clients talk only to the server).
- **Rough monthly**: EC2 ~$60 + RDS ~$30 + ALB ~$20 + Redis ~$15 + CF/S3 minimal ≈ **$100–150**.
- **Capacity**: 200 ccu ≈ 50–100 matches — comfortably one box. Scale = add stateless worker
  boxes behind the matchmaker; Redis for cross-box state. Load-test to confirm real ceiling.

## 5. Phased delivery
- **P0 — Headless sim**: extract `sim/` (no render), run in Node at fixed tick, golden-master
  test (same input log → same end state) vs. the browser sim. *Biggest lift; do it carefully.*
- **P1 — Authoritative match server**: WSS gateway + matchmaker + run one `Match`; client
  connects as pure input/snapshot client (reuse guest code) behind `?server=1`.
- **P2 — Anti-cheat layer**: the §3 input validations.
- **P3 — Persistence**: RDS schema (users, ct_ledger, matches), auth (PNS handle / wallet),
  server-side CT payouts + ledger writes (+ contract hook for staked matches).
- **P4 — Scale & harden**: multiple worker procs, Redis, ALB, reconnect grace, load test to 200.

## 6. Risks / notes
- The sim/render decoupling is the main risk — the codebase is render-coupled. Mitigate with
  the incremental, flagged, golden-master approach in §2.
- Keep P2P as the "casual/unranked" mode if you like; require the authoritative server only for
  ranked/CT-staked matches (the host-can-cheat problem only matters when value is on the line).
- This is a SEPARATE track from the hourly game-feature auto-builder (which does small,
  browser-validatable gameplay slices). The server refactor needs its own focused sessions.

## 7. First concrete step
Scaffold `server/` (package.json, ws gateway stub, an empty `sim/` with the data-model types and
a no-op tick) and port the FIRST system — movement — server-side, golden-master tested against the
browser. Everything else follows the same pattern.

## 8. Deploy target: LAN **or** AWS (same Node binary)
The authoritative server is environment-agnostic. Run `node server/index.js` on:
- **A LAN box** (a PC/Pi on the local network) → players open the client and it auto-connects to
  `ws://<lan-ip>:8080`; matchmaking + sim run on that box; **nobody hosts in-browser**. Great for
  dev, home, and offline LAN events.
- **AWS EC2** → same command, public endpoint, for internet play.
Make the WS endpoint a single config/env var (`EF_SERVER_URL`) so the client points at LAN or
cloud with one change. Keep the existing P2P path as the offline/no-server fallback.

### AWS EC2 spec (hand this to the deploying agent — sized for ~200 concurrent)
- **Instance**: **c7g.large** (ARM/Graviton, 2 vCPU, 4 GB) — recommended for best price/perf
  (Node runs great on ARM). x86 equivalent: **c6i.large**. Use a **compute (c-family), not
  burstable (t-family)** instance — a 30 Hz real-time sim needs steady CPU. (t3.medium is fine
  for *dev* only.) 200 ccu ≈ 50–100 matches fits one box; size up to `*.xlarge` if load tests say so.
- **OS / AMI**: Amazon Linux 2023 (ARM64) or Ubuntu 22.04 LTS (ARM64). **Node 20 LTS**.
- **Storage**: 30 GB **gp3** EBS.
- **Process mgmt**: `pm2` (or systemd unit). Optional: Dockerize → ECS/Fargate later.
- **Security group (EC2)**: inbound **443** (WSS, ideally via ALB/CloudFront) + the WS port
  (e.g. 8080) from the load balancer; **22 (SSH) from your admin IP only**. Outbound to RDS 5432
  and Redis 6379.
- **Load balancer**: ALB with **WebSocket support + stickiness**, **idle timeout ≥ 300s** (long-
  lived WS). TLS via **ACM**. (For a single box you can also terminate TLS on the instance.)
- **DB**: **RDS PostgreSQL 16**, **db.t3.small**, 20 GB gp3, same VPC; its SG allows 5432 **only
  from the EC2 SG**.
- **Cache/queue**: **ElastiCache Redis t4g.micro** — optional at launch, add when you go
  multi-process/multi-box (matchmaking queue + snapshot pub/sub).
- **Front end**: **S3 + CloudFront**, **ACM cert in us-east-1**, **Route53**. HTTPS is mandatory
  (WSS + mobile fullscreen/orientation).
- **Scaling**: workers are stateless → add instances behind the LB, Redis for cross-node state.
- **Rough cost** (covered by the grant): EC2 ~$45 (c7g.large) + RDS ~$30 + ALB ~$20 + Redis ~$15
  + CF/S3 minimal ≈ **$110/mo**.

## 9. Build brief for the implementing (Claude Code) session
**Repo layout to create**
```
server/
  index.js          # entry: starts gateway + matchmaker + match workers
  net/gateway.js    # WSS: auth handshake, route socket → match, rate-limit
  net/matchmaker.js # queue → form match → assign Match instance
  sim/              # PURE logic, no THREE/DOM — ported from index.html systems
    state.js        # plain-data unit/world model + types
    step.js         # fixed-timestep tick(dt, inputs) → new state
    systems/        # movement, combat, abilities, ai, economy, spawns, winlose
    rng.js          # seeded PRNG (deterministic per match)
  validate.js       # §3 anti-cheat input validation
  snapshot.js       # encode/diff snapshots (reuse the client's hr/unit format)
  db/               # pg client + schema (users, ct_ledger, matches, gear)
  config.js         # PORT, EF_SERVER_URL, DB creds via env
client changes (index.html):
  - add ?server=1 path: connect WSS to EF_SERVER_URL, send inputs, render snapshots
    (reuse netGuestFrame / netSendInput / snapshot-apply); local player = guest.
  - keep P2P as the offline/no-server fallback.
```
**Env vars**: `PORT`, `EF_SERVER_URL`, `DATABASE_URL`, `REDIS_URL` (optional), `JWT_SECRET`.
**Run**: `npm i && node server/index.js` (LAN) / `pm2 start server/index.js` (EC2).
**Order of work**: §5 P0→P4. Do NOT rewrite gameplay — PORT the existing systems from
`index.html` onto the pure `sim/` data model; import shared values from `shared/ef_core.js` +
`mon_lineage.json` so server and client stay one source of truth.
**Acceptance per phase**:
- P0: golden-master — feed an identical input log to the browser sim and the Node sim; final
  world state matches (positions/hp within float epsilon).
- P1: two real clients matchmake through the server and play a full game with no in-browser host.
- P2: a tampered client (forged hp/gold/teleport inputs) cannot affect the authoritative result.
- P3: CT balance only changes via server ledger writes; match payouts recorded in `ct_ledger`.
- P4: load test 200 concurrent (50–100 matches @ 30 Hz) on one c7g.large within CPU headroom.
