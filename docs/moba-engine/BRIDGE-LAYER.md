# Bridge Layer / Match-Server — component reference & ownership

> The **bridge-layer** session owns the Clash Front battle engine: a **pure function, context in →
> report out**, plus the live telemetry relay and the hero-mode join seam. It runs *on top of* the
> canonical MOBA sim (`server/sim/`, shared with netcode) and never changes normal MOBA behaviour.
> Everything below is **built + live** unless marked TODO. Owner repo: `etherfantasy-browser-moba-game`.

## 1. What this layer owns (CF requirement → where)
| Req | What | File |
|---|---|---|
| **R1** allocate | `POST /internal/v1/matches/allocate` | `server/cf/api.js` + `battle.js` |
| **R2** deterministic sim / external seed | `seedU32(hex)`; sim audited pure | `battle.js`, `sim/*` |
| **R10** result callback | HMAC-signed payload, retry-until-ack | `battle.js buildCallback/postCallback` |
| **R10** casualties per UnitClass | death hook → `world._deaths` | `sim/state.js killUnit`, `headless.js` |
| **R11** tamper-proof | `worldChecksum`, `journalHash`, `verifyResult` | `server/headless.js` |
| **R12** headless runner | `runBattle(context) → report` | `server/headless.js` |
| **R13** rates | tickHz per-match, reported | `battle.js`, `headless.js` |
| **M1.5** telemetry relay | bridge CLIENT (start/snapshot/commands/end) | `server/cf/bridge.js`, `run-exhibition.mjs` |
| Hero-mode **join ticket** | mint/verify + joinUrl | `server/cf/ticket.js` |

**Explicitly NOT ours** (overworld side): CT economy math, `HERO_IMPACT_MAX` cap, retreat/re-assault,
world persistence, land ownership. We report raw numbers; the overworld settles.

## 2. Files (`server/cf/` + `server/headless.js`)
- `headless.js` — `runBattle` (fast-forward `step()`), checksum/journal/verify. The goldenmaster engine.
- `cf/battle.js` — `allocate(context)` (async; accelerated = resolve+callback, live = game-server match),
  `makeBattleWorld` (context→sim world), `buildCallback` (R10), `postCallback` (HMAC+retry), `seedU32`.
- `cf/api.js` — internal HTTP on **:8140**: `POST /internal/v1/matches/allocate`, `POST …/:id/ticket`.
- `cf/ticket.js` — one-time, matchId-bound, 2-min HMAC join ticket; `verifyTicket` (called by the game
  gateway), `joinUrl` (the client's deep-link template).
- `cf/bridge.js` + `cf/run-exhibition.mjs` — the M1.5 relay client + a wall-clock exhibition driver.

## 3. Endpoints & wire
- **Allocate (R1):** `POST http://127.0.0.1:8140/internal/v1/matches/allocate`, `Authorization: Bearer
  <CF_BATTLE_API_TOKEN>`, `Idempotency-Key: <battleId>`. Accelerated → resolves headlessly + fires the
  callback; live → creates a game-server match, returns `{matchId, ticket, joinUrl}`. Schema:
  `ALLOCATE-CALLBACK-SCHEMA.md`.
- **Ticket mint:** `POST …/matches/:matchId/ticket {side,user,seat?}` → `{ticket, joinUrl}` (on-demand,
  mint when the user clicks "⚡ Take the field"). Contract: `TICKET-CONTRACT.md`.
- **Result callback (R10):** we POST `<callback.url>` with `X-CF-Signature: v1=hmacSHA256(secret,
  rawBody)` + `X-CF-Key-Id`; retry-until-ack (2s→…→5m). Receiver 200 = ack; idempotent by battleId.
- **Bridge relay (M1.5):** our match server CALLS the overworld bridge at `cf.etherfantasy.com/bridge/
  battles/{start | :id/snapshot | :id/commands | :id/end}`, `Bearer <BRIDGE_SECRET>`. Contract:
  `TELEMETRY-RELAY.md`.

## 4. Secrets & env (Singapore box `13.250.39.41`)
Files (mode 600), sourced like `BRIDGE_SECRET` by the deploy — survive restarts:
- `~/.cf_battle_api_token` — Bearer for `/allocate`.
- `~/.cf_battle_hmac_secret` — signs the R10 callback AND the join ticket (same secret).
- `~/.cf_bridge_secret` — Bearer for the M1.5 bridge relay.
Env overrides: `CF_BATTLE_PORT`(8140), `CF_GAME_INTERNAL`(http://127.0.0.1:8080), `CF_GAME_HOST`
(https://moba.etherfantasy.com), `CF_GAME_WS`(wss://moba.etherfantasy.com/game), `CF_TICKET_TTL_MS`.

## 5. Ops
- pm2 proc **`cf-battle-api`** on the Singapore box (localhost-only; not nginx-exposed).
- **Deploy:** `scp server/cf/*.js` → `~/ef-moba-server/cf/` then `pm2 restart cf-battle-api`. Engine
  (`sim/`, `headless.js`) ships with the normal server tree.
- **Health:** `curl localhost:8140/health` → `{ok, tokenSet}`.
- **Tests:** `cd server && npm test` = goldenmaster + headless(12) + cf-battle(13). Determinism +
  the full allocate→callback loop.
- **Canonical-first:** engine changes land here; the CF snapshot re-pulls `sim/` + `cf/`.

## 6. Seams (who I meet, and status)
- **Ticket ↔ MOBA client/gateway** — ✅ DONE both sides. Gateway (netcode fork) calls `verifyTicket`
  → `mm.joinExisting` → `Match.addSeat`; client sends `match`+`ticket`.
- **Battlefield JSON ↔ maps session** — `allocate.battlefield` consumes the generator's schema (A1).
  Aligned; no action until it emits real maps.
- **Live-match ↔ netcode** — ⏳ **TODO (netcode's half).** `allocate(mode:"live")` POSTs
  `GAME_INTERNAL/internal/cf/live` and binds the ticket to the id the game server returns. Netcode
  builds `POST /internal/cf/live` + `mm.createLiveMatch(context)` + keep-open Match + `String(matchId)`.
  See `TICKET-CONTRACT.md §6`. This is the last item before a clickable hero-mode demo.

## 7. Known follow-ups (flagged, not blocking)
- **Officer contribution stats** (kills/structureDamage/damage) are placeholder — need a per-hero stat
  hook like the death hook, if the overworld economy needs them in M1.
- **Faithful `makeBattleWorld`** — finite-wave durability by CC tier + structures-from-battlefield JSON
  (R3–R5) is the game-dev PARAM lane; today's builder is M1-minimal (officers→heroes, army→cls units).
- **Montreal parity** — the allocate API runs on Singapore (where the overworld is); add to Montreal
  only if it hosts an overworld.
- **Reinforce (D1b)** — reserved for v2 per the schema (client `joinAlly` already speaks the shape).
