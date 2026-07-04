# PG-IDENTITY — Pentagon Games login as the primary Clash Front identity

**Status: IMPLEMENTED 2026-07-03** (server + client + deploy; owner-verified API contract).
Owner decision: Pentagon Games (PG) accounts are the primary login for cf.etherfantasy.com.
The dev name-only banner login remains the fallback whenever PG is not configured.

## 1. The PG API contract (verified 2026-07-03, owner-corrected host)

- **Base URL:** `https://login.pentagon.games` (env `PG_API_URL`). The older
  `api.account.pentagon.games` doc host is STALE — do not use it.
- **`POST /user/login`** — body
  `{"type":"email","username":"<email|pns|username>","password":"…","login_from":"clashfront"}`
  → `{"status":true,"result":{"access_token":"<jwt>","refresh_token":"<jwt>"}}`.
  A wallet-signature login variant exists — OUT of MVP scope (noted only).
  Identifier resolution order on PG's side: **Email → PNS name (lowercase) → current
  username → legacy username**.
- **Required header** on login/signup: `X-PG-App-Key`. Our key is **PUBLISHABLE**
  (`pk_live_3e996782bb03792b8787a02b2d076ec2`, registered for `cf.etherfantasy.com`,
  login scope) — it is safe in the repo, in env, and in the browser. Rotation happens
  by dropping a replacement into `~/.cf_pg_app_key` on the box (see §4).
- **Token verification:** there is NO dedicated verify endpoint. Backends verify a
  presented token via **`GET /user/info`** with `Authorization: Bearer <access_token>`;
  200 returns the user object (`username`, `email`, `mm_address`, user id, …);
  any non-200 = invalid token.
- **`POST /user/token/refresh`** `{"refresh": <refresh_token>}`; access tokens live
  24 h; there is **no logout endpoint**.
- **NFT Data API** (`api.metadata.pentagon.games:9010`, `nft-data` scope) is a separate
  service and OUT of scope for identity — future land/character NFT reads only.

## 2. Clash Front server surface

- **`POST /api/login-pg`** `{access_token}` → server-side `GET {PG_API_URL}/user/info`
  (injectable `pgFetch` for tests; 5 s timeout). Non-200 ⇒ `401 PG_TOKEN_INVALID`;
  network failure/timeout ⇒ `502 PG_UNAVAILABLE`; PG disabled ⇒ `503 PG_DISABLED`.
  On success derives `pgUid` (user id) + `displayName` (PNS name → username → email
  local-part) and answers with the same shape as `/api/join`
  (`{playerId, token, governorId, officers}` — the cf token, same Session model).
- **Binding rules** (`Game.loginPg`, persisted `pgBindings: pgUid → governorId` in the
  save — survives restarts):
  1. existing binding → RESUME that governor (fresh cf token);
  2. no binding → **ADOPT** the richest same-name (case-insensitive) **unbound** PLAYER
     governor — this is how a pre-PG banner (e.g. the owner's "Idon") is reclaimed;
  3. else → create a new governor named `displayName` (numeric suffix on collisions).
  An adopted/bound governor is NEVER re-adoptable by a different pgUid.
- **`GET /api/world`** meta exposes `pgEnabled` (+ `pgApiUrl`, `pgAppKey` when enabled)
  so the client picks the login UI. The app key is publishable by design.
- **`/api/join` (name-only login) stays untouched** — the dev fallback and local mode.

## 3. Client (apps/server/public)

When `pgEnabled`: the join overlay becomes an embedded Pentagon sign-in form (per PG
docs — build the form directly, **no redirects**): identifier field (placeholder
"email / PNS name / username") + password + "Sign in with Pentagon". The browser POSTs
`{pgApiUrl}/user/login` with `X-PG-App-Key`, hands `result.access_token` to
`/api/login-pg`, stores the cf token in `localStorage.cf_token` exactly like the name
login, and stores `result.refresh_token` as `localStorage.pg_refresh` for later
refresh support. PG errors surface in the join overlay's `#join-err`. When
`!pgEnabled` the historic banner-name form renders verbatim. The ⇄ switch-banner
button works in both modes (clears `cf_token`, reloads to the join overlay).

## 3b. Masters roster from ownership (implemented 2026-07-04)

**Owner mandate:** a player commands ONLY the Masters their wallet actually owns/rents —
pulled live from the EF Masters API (`09` §7), exactly like the MOBA game. This replaces the
fixed demo-roster officers CF handed every governor.

- **Wallet source:** `derivePgIdentity` reads it from the PG `/user/info` `mm_address` field.
  No `mm_address` ⇒ no wallet ⇒ the feature stays off (demo roster).
- **Fetch:** on PG login, after `/user/info` verification, if a wallet was derived the server
  calls `GET {MASTERS_API_URL}/api/gameplay/masters/active/{wallet}` (5 s timeout, injectable
  `mastersFetch` for tests) and passes the result into `Game.loginPg(…, ownedMasters?)`.
- **Officer pool = owned Masters.** Each officer keeps a CF-internal `hero_…` id for references
  but carries the real `masterId` + `slug` + `name` + `source` + `koUntil` + `joinChance` +
  `rentalExpires`. The **allocate context** sends the real `masterId` (+ `slug`) so the MOBA client
  maps to the champion and pre-locks the seat (fixes the old `masterId = hero_… ULID` bug).
- **Refresh on every login** (picks up new mints/rentals/KO). Reconciled by `masterId`:
  still-owned Masters keep their overseer/army assignment; newly owned ones are added; an officer
  whose Master is no longer owned is **removed if free**, but **kept until idle if busy**
  (overseeing a territory or leading a live army) — never yank a general out of an active command.
- **Fallbacks (the game never bricks):** API unreachable / non-200 ⇒ keep existing (demo) roster,
  login still succeeds; wallet owns **nothing** (empty list) ⇒ keep the demo roster as a
  playability fallback and log it (a governor is never left with zero officers). KO enforcement is
  stored (`alive`/`koUntil`) but not yet gated in v1.

## 4. Env & deploy

| Env | Meaning | Default |
|---|---|---|
| `PG_APP_KEY` | publishable app key; **setting it turns PG login ON** | unset (dev name login) |
| `PG_API_URL` | PG identity API base | `https://login.pentagon.games` |
| `MASTERS_API_URL` | EF Masters API base (roster gate, `09` §7) | `https://api.etherfantasy.com` |

`deploy/remote-deploy.sh` sources `PG_APP_KEY` from `~/.cf_pg_app_key` when present,
else defaults it to the publishable `pk_live_3e996782bb03792b8787a02b2d076ec2` — so PG
login is ON at cf.etherfantasy.com from the next deploy onward, no provisioning step.
`MASTERS_API_URL` defaults to the live host in the server (exported by the deploy script if set) —
**the box must be able to reach `api.etherfantasy.com`** for the roster gate to take effect;
otherwise every PG login silently falls back to the demo roster.
Sandbox/dev/tests never reach the real API: tests inject `pgFetch` + `mastersFetch`; local runs
without `PG_APP_KEY` keep the name-only login.

## 5. Tests

`apps/server/test/pgLogin.test.ts` (mock PG via injectable fetch): create / resume /
adopt / no-re-adopt / 401 invalid / 502 down / 503 disabled / world-meta exposure /
binding persistence across save-reload.

`apps/server/test/mastersRoster.test.ts` (mock PG + Masters via injectable fetch): wallet from
`mm_address` / 2 masters ⇒ exactly those officers (masterId/slug/source) / API unreachable ⇒ demo
fallback / empty list ⇒ playability fallback + logged / no wallet ⇒ never fetched / re-login refresh
(add, free-eviction, busy-retention) / allocate context carries the real masterId + slug.
