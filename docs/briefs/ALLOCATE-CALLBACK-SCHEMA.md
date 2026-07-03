# R1/R10 wire contract — allocate context & result callback (v1)

> Companion to `PVP-SERVER-REQUIREMENTS.md` (R-numbers) and `M1-HEADLESS-BATTLES.md` (D-items).
> **Ownership (decided 2026-07-03):** R1 (allocate) + R10 (HMAC callback) + R13 (rates) are built
> in the CANONICAL engine repo (`etherfantasy-browser-moba-game`), reusing its loot-ticket HMAC
> pattern. The CF snapshot repo re-pulls `sim/` + `headless.js` from canonical — engine changes
> land in canonical FIRST, snapshot follows. One deterministic engine, no divergence.
> All money/resource quantities are INTEGERS (canon). All ids are prefix-typed ULIDs.

## 1. `POST /internal/v1/matches/allocate`

Headers: `Idempotency-Key: <battleId>` · `Authorization: Bearer <CF_BATTLE_API_TOKEN>`
Re-sending the same battleId MUST return the original `{matchId, joinDeadline}` — never a second match.

```jsonc
{
  "v": 1,
  "battleId": "battle_01J1QZX3E8K9RM2P5T7W9YBCDE",       // Idempotency key. ULID, prefix-typed.
  "seed": "9f2c4a61d0b3785e",                              // WE supply it. Never seed from Date.now().
  "mode": "live",                                          // "live" (30 Hz, joinable) | "accelerated" (headless)
  "rates": { "tickHz": 30, "commandSnapshotHz": 3 },       // R13; accelerated may run unclamped
  "parcel": { "parcelId": "60203370020", "zone": "EDU", "kind": "WILD" }, // WILD | PLAYER | ESTATE
  "battlefield": {                                         // A1 schema — the parcel's designed map
    "arena": { "shape": "polygon", "sizeM": 240,           // 1 unit = 1 m (canon)
               "bounds": [[0,0],[240,0],[240,240],[0,240]] }, // square = 4-pt polygon (M1/M1.5)
    "laneCount": 1,                                        // 1 default; 3 for estates
    "obstacles": [ { "kind": "TREE", "x": 60, "z": 90, "r": 4 } ],
    "spawnZones": [ { "id": "spawn_atk_s", "side": "ATTACKER", "edge": "S", "x": 120, "z": 8 } ],
    "structures": [                                        // land holder's furniture, incoming HP
      { "anchorId": "anchor_t1", "kind": "TOWER", "side": "DEFENDER", "x": 120, "z": 150, "hp": 1800, "hpMax": 2000 },
      { "anchorId": "anchor_cc", "kind": "CORE",  "side": "DEFENDER", "x": 120, "z": 210, "hp": 5000, "hpMax": 5000 }
    ],
    "mobs": [ { "id": "mob_pack_1", "kind": "WOLF", "x": 90, "z": 120, "count": 6 } ]  // WILD only
  },
  "sides": {
    "ATTACKER": {
      "governorId": "gov_01J1QY...",
      "armies": [ {
        "armyId": "army_01J1QZ...",
        "units": [ { "cls": "INFANTRY", "count": 220 }, { "cls": "ARCHER", "count": 80 } ],
        // cls ∈ INFANTRY | ARCHER | CAVALRY | SPEAR | SIEGE | MARINE | SHIP (canon UnitClass)
        "officers": [ { "masterId": "master_kai_07", "name": "Kai", "level": 12, "revives": 3 } ],
        "provisions": { "food": 4800, "gold": 1200, "wood": 900 },  // food = battle clock; gold+wood = CC tier
        "entryEdge": "S"                                   // spawn edge (overworld approach direction)
      } ]
    },
    "DEFENDER": { "governorId": null, "armies": [] }        // null governor = WILD
  },
  "callback": { "url": "https://cf.etherfantasy.com/internal/battle-result", "keyId": "cf-hmac-1" }
}
```

Response `201`: `{ "matchId": "efm_...", "joinDeadline": "<ISO8601>", "tickHz": 30 }`

### 1b. Join tickets — PROPOSAL for the bridge-layer ↔ game-client seam (2026-07-03)

Client transport is DONE (OP 48): the boot parser accepts `match` + `ticket` URL params and
forwards both in the existing `{t:'join',v:2}` handshake; `window.EFM_JOINURL_TEMPLATE` exposes
the URL format. Remaining: ticket shape + failure message + server-side seating. Proposal (uses
the HMAC secret + patterns both sides already share — counter-proposals welcome, agree in your
handoff doc and note the final shape here):

- **Mint (match server, at allocate for `mode:"live"` and on demand):**
  `ticket = base64url(payload) + "." + base64url(hmacSHA256(CF_BATTLE_HMAC_SECRET, payload))`
  where `payload = {"m":"<matchId>","g":"<governorId>","u":"<userRef>","side":"A|B","exp":<unixSec>}`.
  Short-lived (`exp` ≤ join deadline). One ticket per user per match; re-join with the same
  ticket is allowed until `exp` (reconnects).
- **Validate (match server, on `{t:'join'}` with match+ticket):** signature + `exp` + match is
  this match ⇒ seat the player into THAT match's draft on side `side` (hero seat; ONE-HERO per
  user). Reject ⇒ close with a typed failure the client can render:
  `{t:'join_denied', code:'TICKET_EXPIRED'|'TICKET_INVALID'|'MATCH_ENDED'|'SEAT_TAKEN', msg}`.
- **Flow to the button:** match server fills `EFM_JOINURL_TEMPLATE` → sends the result as
  `joinUrl` in its `/bridge/battles/start` call → CF's "⚡ Take the field" opens it.

### `POST /internal/v1/matches/{matchId}/reinforce` (D1b — reserve now, M2 build)

Body = one `armies[]` entry as above + `"side"`. Effect: officer spawns at `entryEdge`
auto-attacking; the army becomes a NEW LANE from that edge pathing directly to the enemy main
base. 409 if the match already ended.

## 2. Result callback — `POST <callback.url>`

```jsonc
{
  "v": 1,
  "battleId": "battle_01J1QZX3E8K9RM2P5T7W9YBCDE",
  "matchId": "efm_...",
  "outcome": { "winner": "ATTACKER",                       // ATTACKER | DEFENDER | TIE
               "reason": "CORE_DESTROYED" },               // CORE_DESTROYED | WAVES_EXHAUSTED |
                                                           // MOBS_CLEARED | TOWERS_DESTROYED |
                                                           // FOOD_CLOCK | TIMEOUT
  "sides": {
    "ATTACKER": {
      "casualties": { "INFANTRY": 140, "ARCHER": 22 },     // dead, per UnitClass (needs death-event hook)
      "survivors":  { "INFANTRY": 80,  "ARCHER": 58 },     // marchers-home. casualties+survivors == committed
      "provisionsConsumed": { "food": 3100, "gold": 1200, "wood": 700 },
      "officers": [ { "masterId": "master_kai_07", "state": "ALIVE",   // ALIVE | KO
                      "revivesUsed": 1,
                      "contribution": { "kills": 14, "structureDamage": 3200, "damage": 41000 } } ]
                      // RAW + UNCAPPED — the overworld applies HERO_IMPACT_MAX, never the engine
    },
    "DEFENDER": { "casualties": {}, "survivors": {}, "officers": [] }
  },
  "structures": [ { "anchorId": "anchor_t1", "hp": 0, "destroyed": true } ],
  "clock": { "tickCount": 48231, "durationSec": 1608, "tickHz": 30 },
  "verify": { "finalChecksum": "c41e...", "journalHash": "8ab0...", "seed": "9f2c4a61d0b3785e" },
  "issuedAt": "<ISO8601>", "nonce": "d1f4c2..."            // replay protection (inside signed body)
}
```

Receiver behavior (overworld): `200` = ack. Same battleId re-delivered ⇒ `200` without
reprocessing (idempotent). Sender retries with exponential backoff (2s→4s→…→cap 5 min) until ack.

## 3. HMAC provisioning & signing

- Header: `X-CF-Signature: v1=<hex(hmacSHA256(secret, rawRequestBody))>` + `X-CF-Key-Id: cf-hmac-1`.
- Secret: `CF_BATTLE_HMAC_SECRET` env var on BOTH boxes, provisioned manually by the product
  owner for MVP (same pattern as `BRIDGE_SECRET`). `keyId` enables rotation later: receiver
  accepts old+new during a rotation window.
- Allocate-direction auth is a static bearer (`CF_BATTLE_API_TOKEN`), also env-provisioned.
- Reject if `issuedAt` is older than 10 min or `nonce` was seen for a different body.

## 3b. OVERWORLD IMPLEMENTATION (2026-07-03 — live behind a feature flag)

The overworld side of this contract is IMPLEMENTED (tick engine → engine allocate → HMAC
callback → deterministic settlement). Key facts for operators + the engine team:

- **Env (apps/server, all three provisioned or feature OFF):** `BATTLE_ENGINE_URL` (the full
  allocate endpoint; **unset = feature OFF, battles resolve exactly as before**),
  `CF_BATTLE_API_TOKEN`, `CF_BATTLE_HMAC_SECRET`, optional `PUBLIC_BASE_URL` (callback base;
  default `http://127.0.0.1:<PORT>`), optional `CF_LIVE_BATTLES` (**default ON** once the
  engine is wired — live is the norm; `CF_LIVE_BATTLES=0` forces accelerated-only).
  `deploy/remote-deploy.sh` sources the token/secret from
  `~/.cf_battle_api_token` / `~/.cf_battle_hmac_secret` (same pattern as `BRIDGE_SECRET`) and
  defaults `BATTLE_ENGINE_URL=http://127.0.0.1:8140/internal/v1/matches/allocate` when both
  files exist.
- **Flow:** hostile co-location that would resolve via the instant WarScore path instead
  becomes a PENDING ENGINE BATTLE (hex locked like a running wild battle, armies pinned);
  the server POSTs the §1 context (`Idempotency-Key: battleId`, 5 s timeout,
  square-240 4-pt bounds polygon + the parcel's real structure anchors
  `anchor_<i>`, officers with revive budget 3, seed from the seeded world RNG). The verified
  callback (raw-body HMAC, `issuedAt` ≤ 10 min, nonce ledger, idempotent 200 by battleId)
  sets the outcome as a SERVER-BOUNDARY INPUT; the **next world tick** applies casualties per
  UnitClass, provisions consumed, structure damage per anchor, winner/TIE semantics and the
  normal post-battle flow (pillage/occupy choice, §7c.5 retreat ladder). Callback receiver:
  `POST /internal/battle-result` (an /internal deployment-boundary route — never public).
- **MODE SELECTION (2026-07-03):** the overworld allocates `mode:"live"` (rates
  `{tickHz:30, commandSnapshotHz:3}`) whenever **at least one side's governor is a PLAYER** —
  a real player's battle is hero-joinable by default. Pure AI battles (NPC/SYSTEM vs
  NPC/SYSTEM, monster raids on NPCs) stay `mode:"accelerated"`. `CF_LIVE_BATTLES=0` is the
  kill switch (everything accelerated). The chosen mode is stamped on the pending record.
- **JOIN HANDLING (§1b):** live-mode allocate responses carry hero-mode join info; the
  overworld accepts BOTH shapes defensively — `{matchId, joinDeadline, tickHz, ticket,
  joinUrl}` (single, **attacker-oriented** — what the match server returns today) and the
  future `{joins:[{governorId, ticket, joinUrl}]}`. Grants (joinUrl http(s) ≤ 512 chars;
  invalid ones dropped) are stored on the pending engine-battle record and persist in the
  snapshot like the rest of it.
- **VISIBILITY RULE (fog/canon):** a `joinUrl` is **PRIVATE to its governor**. It is exposed
  ONLY on the owning governor's own views: their `/api/state` `liveBattles[]` entry
  (`engine:true`) and a strictly-private `battle_joinable` WS event (announced once). Never
  to other participants, never to ACCURATE-intel spectators, never in public/exhibition
  broadcasts. Client surface: the parcel card shows the gold **“⚡ Take the field”** button
  (one-hero tooltip) to the owner while the engine match runs.
- **LIVE-MATCH LIFETIME:** a live match runs in real time (up to ~40 min). An ALLOCATED
  battle has **no tick-based timeout** — the hex stays locked and the armies pinned until
  the result callback lands; the engine's own `TIMEOUT` reason is the clock authority.
- **FALLBACK RULE:** allocate failure (network error, timeout, non-2xx) marks the battle
  FALLBACK; the next tick resolves it through the internal instant resolution. An engine
  outage never bricks a battle. (Fallback applies to the ALLOCATE step only — see the
  live-match lifetime rule above.)
- **Scope notes:** multi-governor attacker stacks (MVP truce edge) keep the instant path
  (one governorId per side in §1); live wild battles (player vs monster lair) keep the
  built-in tactical sim.
- **Engine-team note (recorded, no action):** officer `contribution` stats are PLACEHOLDER
  in M1 — the overworld treats them as M2 and does NOT yet apply `HERO_IMPACT_MAX` to engine
  results (casualties are authoritative as reported). Faithful finite-wave durability +
  structures-from-battlefield behavior (the R3–R5 PARAM lane) is game-dev side.

## 4. Decisions & answers for the engine team (2026-07-03)

1. **R1/R10/R13 owner: the canonical engine.** Agreed and locked — see header note.
2. **Sync strategy: canonical-first.** Engine/sim changes land in canonical; the CF snapshot
   re-pulls `sim/` + `headless.js` (never edits them in place). Push the current headless work
   (headless.js, tests, **the `world._uidSeq` uid-determinism fix**) to canonical NOW so the
   snapshot can pull — the uid fix is load-bearing for R11 verification.
3. **`world.rng` unconsumed (zero battle variety):** fine for M1 — determinism and verification
   are the priority; identical armies fighting identically is acceptable for AUTO resolution.
   Variety (crit rolls, AI jitter) is wanted for M2, and every draw MUST come from `world.rng`
   (seeded) — never `Math.random` — so replays keep verifying.
4. **Client-hosted verification at M2:** accepted. M1 = headless AI-vs-AI + server-side verify;
   client-mode matches stay untrusted exhibitions until the hero client runs the shared sim.
5. **Casualties-per-UnitClass death-event hook: required IN M1**, not a follow-up — the
   overworld cannot settle army stocks from survivors alone once multi-army/reinforcement
   battles exist (committed − survivors is ambiguous per class across merged armies). It's the
   one report field the economy hard-depends on.
