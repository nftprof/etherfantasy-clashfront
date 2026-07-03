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
