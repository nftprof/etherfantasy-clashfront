# Telemetry Relay — the Battle Bridge contract (v1)

> **Audience: the MOBA battle-engine sessions** (`nftprof/etherfantasy-clashfront` battle-engine
> branch and the real browser-moba repo). This is the wire contract between YOUR match server and
> the overworld server's **battle bridge** (`apps/server/src/bridge.ts` in the canon repo). You
> implement the client side: **PUSH telemetry to us, PULL commands from us.** The overworld's
> COMMAND-MODE viewer (`apps/server/public/js/battle.js`) then shows your match live on the war
> map with steering — this is M1 brief **D2b** made concrete, proven end-to-end against the mock
> emitter before your engine attaches.
>
> Canon context: `docs/04-battle-system.md` §7b (two control surfaces, ONE-HERO rule,
> reinforcement arrivals), `docs/briefs/M1-HEADLESS-BATTLES.md` (D1b/D2b).

## Roles & data flow

```
 YOUR match server (authoritative sim, 30 Hz)          Overworld server (this repo)
 ───────────────────────────────────────────           ─────────────────────────────
 POST /bridge/battles/start            ─────────────▶  battle registered: map badge,
                                                       flames, toasts, viewer entry
 POST /bridge/battles/:id/snapshot     ─────────────▶  translated + fanned out to
   (2–4 Hz, compact top-down frames)                   WS battle_sub subscribers
 GET  /bridge/battles/:id/commands     ◀─────────────  command-mode steering queue
   (poll every 1–2 s, ?afterSeq=N)                     (move / focus / rally)
 POST /bridge/battles/:id/end          ─────────────▶  banner in the viewer, outcome
                                                       toasts; world settlement iff bound
```

The overworld viewer stays a dumb renderer of the existing WS `battle_hello`/`battle_tick`/
`battle_end` frames — all shape adaptation happens in ONE server-side translation function
(`BridgeHub.translateSnapshot`). You never speak WebSocket to us in v1.

## Auth

Every request carries the shared secret:

```
Authorization: Bearer $BRIDGE_SECRET
```

`BRIDGE_SECRET` is an env var on the overworld server (unset ⇒ all `/bridge/*` return
`503 BRIDGE_DISABLED`). Wrong/missing secret ⇒ `401 BAD_BRIDGE_SECRET`. As a curl convenience,
`POST /bridge/battles/start` also accepts `{"token": "..."}` in the body. Constant-time compare
server-side. (v2 will move to per-request HMAC signatures, growing the loot-ticket pattern from
the M1 result callback — same secret, so nothing to re-provision.)

## Coordinate conventions (locked)

- Your match runs on the **legacy square arena**: `arena.size` engine units per side
  (240 for the smoke test), **1 unit = 1 m** (canon scale law).
- Telemetry coordinates are **MOBA-native**: `x ∈ [-size/2, +size/2]` (east positive),
  `z ∈ [-size/2, +size/2]` (**north positive**). Center of the map = `(0, 0)`.
- The bridge converts to viewer space (`[0,size]²`, y grows DOWN/south) and back. **Commands you
  poll are already converted back to MOBA coordinates** — apply them as-is.
- Convention for the smoke test: the attacker musters at the **south edge (z ≈ −size/2) and
  pushes north**. Not enforced — render-side is orientation-agnostic.
- Units outside `±(size/2 + 1)` are rejected (`400 BAD_UNIT`).

## Pacing & liveness (locked)

| What | Rate / limit |
|---|---|
| Snapshots (`POST …/snapshot`) | **2–4 Hz** (the viewer interpolates between frames; >4 Hz is wasted, <1 Hz looks stuttery) |
| Command poll (`GET …/commands`) | every **1–2 s** (steering feels live at ≤2 s worst-case latency) |
| No snapshot for **30 s** | battle marked **stale** — viewer shows "signal lost" |
| No snapshot for **2 min** | exhibition: auto-ended **DRAW** ("signal lost — relay timed out"); bound: unbound, the sim resumes the battle |
| Ended battles | linger 60 s (final command polls still resolve), then forgotten |
| Request body cap | 64 KiB (≈ 400+ units per snapshot — plenty) |

---

## Endpoints

### 1. `POST /bridge/battles/start`

Registers a running battle on an overworld parcel. The map lights up exactly like a native
battle (LIVE badge + flames + toast), and command mode opens from the parcel.

```json
{
  "matchId": "efm-2026-07-03-0001",
  "parcelId": "PARCEL_ID_FROM_/api/world",
  "attacker": { "governorName": "Idon", "armyLabel": "1st Relay Expedition", "troops": 480 },
  "defender": { "label": "Garrison of the Square", "troops": 350 },
  "arena": { "shape": "square", "size": 240 },
  "exhibition": true
}
```

- `parcelId` must exist in the overworld (`GET /api/world` → `parcels[].id`), else
  `404 UNKNOWN_PARCEL`.
- `attacker.governorName` / `governorId` (both optional): names an existing governor as the
  commander — only they may steer, and the battle counts as "theirs" in the UI. Unknown name ⇒
  `404 UNKNOWN_GOVERNOR`. **Omitted ⇒ exhibition-only OPEN COMMANDS: any authenticated viewer
  may steer** (deliberate for smoke tests; never combine with `exhibition: false`).
- `exhibition` (default `true` when `battleId` is absent): display-only battle — **no overworld
  consequences on end**; score/casualties are presentation. The smoke-test path.
- `battleId` (optional, later): **bind** to a real RUNNING overworld wild battle instead — its
  live feed switches from the internal sim to your relay ('sim' → 'bridge' BattleSource). On
  `end` the winner is forced onto the sim battle and the next world tick settles it through the
  normal deterministic phase order. `404 NO_SIM_BATTLE` / `409 ALREADY_BOUND` on bad binds.
- `arena`: v1 supports `{shape:'square', size>0}` only (`400 BAD_ARENA` otherwise).
- `troops` are display numbers for toasts/HUD — no overworld army needs to exist.

**Response `200`:**

```json
{
  "battleId": "BRX0001-efm2026070300001",
  "parcelId": "…",
  "exhibition": true,
  "snapshotUrl": "/bridge/battles/BRX0001-efm2026070300001/snapshot",
  "commandsUrl": "/bridge/battles/BRX0001-efm2026070300001/commands",
  "endUrl": "/bridge/battles/BRX0001-efm2026070300001/end"
}
```

Use the returned `battleId` (NOT your `matchId`) on all subsequent calls.

### 2. `POST /bridge/battles/:id/snapshot` — 2–4 Hz

```json
{
  "tick": 1234,
  "clockMs": 61250,
  "units": [
    { "id": "Am1",  "kind": "master", "team": "A", "x": -12.5, "z": -48.0, "hp": 380, "maxHp": 420, "name": "Cid" },
    { "id": "As17", "kind": "squad",  "team": "A", "x": 4.0,   "z": -60.2, "hp": 96,  "maxHp": 110, "cls": "INFANTRY" },
    { "id": "Bs3",  "kind": "mob",    "team": "B", "x": -40.1, "z": 22.9,  "hp": 120, "maxHp": 120 },
    { "id": "Bt1",  "kind": "tower",  "team": "B", "x": -45.0, "z": 40.0,  "hp": 610, "maxHp": 900 },
    { "id": "Bc1",  "kind": "core",   "team": "B", "x": 0.0,   "z": 100.0, "hp": 1600,"maxHp": 1600 }
  ],
  "score": { "a": 120, "b": 45 },
  "waves": { "stock": 16, "stockStart": 24 },
  "runs": 2,
  "spawns": [
    { "id": "lane-south", "team": "A", "x": 0, "z": -116, "label": "south muster" }
  ]
}
```

- `tick`: your engine tick (any monotonic counter — echoed to the viewer).
- `clockMs`: **milliseconds REMAINING** on the match clock (drives the HUD countdown).
- `units[]`: everything worth drawing. `kind` mapping in the viewer:
  `squad`→small unit dot, `master`→gold-ringed hero with banner, `mob`→wild-mob styling,
  `tower`/`core`→structure with range ring, HP bar and rubble state at `hp: 0` (keep dead
  structures IN the snapshot as rubble; drop dead units).
- `score`, `waves`, `runs` optional: HUD stats (wave budget, Master runs) + end-toast score.
- `spawns[]` optional: **active wave spawn points / arrival lanes.** Canon (owner 2026-07-03):
  a reinforcement arrival opens a NEW LANE at the approach-direction edge whose waves path
  directly to the enemy's main base — put every active spawner here so the general sees every
  front. Rendered as a pulsing team-colored entry ring.
- Malformed frames: `400 BAD_SNAPSHOT` / `400 BAD_UNIT`. Snapshot to an ended battle: `409 ENDED`.

Response: `{"ok": true}`. The frame is translated and fanned out to all live command-mode
subscribers immediately (no world-tick wait).

### 3. `GET /bridge/battles/:id/commands?afterSeq=N` — poll every 1–2 s

Command-mode steering issued by the commander through the overworld viewer, queued for you.
**Coordinates already converted back to MOBA units.**

```json
{
  "battleId": "BRX0001-…",
  "headSeq": 7,
  "ended": false,
  "commands": [
    { "seq": 6, "kind": "move",  "x": 15.0, "z": 62.5, "by": "GOVAB12…", "atMs": 1751500000000 },
    { "seq": 7, "kind": "focus", "targetId": "Bt1",    "by": "GOVAB12…", "atMs": 1751500001200 }
  ]
}
```

- Track `headSeq` client-side and poll with `afterSeq=<last seen>` — the queue is append-only
  (capped at 200; you will never fall that far behind at 1–2 s polls).
- `kind`:
  - `move` — move the commander's Master/officer to `(x, z)`.
  - `focus` — focus-fire the unit/structure with `targetId` (an id from YOUR snapshots — ids
    round-trip untouched).
  - `rally` — set the wave rally point to `(x, z)`.
- `by`: the issuing governor id (`''` never occurs; open exhibitions carry the actual viewer's
  governor id). **ONE-HERO rule (canon 2026-07-03): seats are per-user** — if the user behind
  `by` currently holds a hero seat in your match, DROP the command (your side of the mutual
  exclusion; the overworld will pre-reject at the source in a later rev via seat notifications).
- Commands apply to AI-driven units/officers only — never to a human-embodied hero.
- `ended: true` → stop polling after draining.

### 4. `POST /bridge/battles/:id/end`

```json
{ "winner": "A", "summary": "core destroyed — the expedition takes the field" }
```

- `winner`: `'A'` (attacker) | `'B'` (defender) | `'DRAW'`.
- Viewer shows the victory/defeat/stalemate banner immediately; outcome toasts land on the next
  world tick. **Exhibition ⇒ zero world mutation.** Bound ⇒ the sim battle's outcome is forced
  (`A`→ATTACKER, `B`→DEFENDER, `DRAW`→TIMEOUT) and the world tick settles it (v1: survivor
  accounting still uses the sim's roster; per-unit external casualties come with the M1 D2
  result callback, which stays the source of truth for real settlements).

Response: `{"ok": true, "exhibition": true}`.

### Error envelope

All errors: `{"error": {"code": "...", "message": "..."}}` with meaningful HTTP status
(`400/401/403/404/405/409/503`). Codes above plus `NO_BATTLE` for unknown battle ids.

---

## Reserved for v2 (design for it now, don't implement)

- **`reinforce` (overworld → YOU, M1 brief D1b):** when a marching army arrives at a parcel
  whose battle you are running, the overworld will call YOUR
  `POST /internal/v1/matches/{id}/reinforce` with `{side, officer, unitStacks, provisions,
  entryEdge}` (`entryEdge` = hexagon edge / bearing of the overworld approach direction).
  Contract effect on THIS relay: (a) the officer spawns at that edge **auto-attacking**
  (the existing wild-Master auto-battle AI, kept as-is until a user walks up and takes
  command — possession mechanic unchanged, only the spawn trigger moves to arrival); (b) the
  army's unit stock registers a **new spawn point that acts as a NEW LANE pathing directly to
  the enemy main base** — which you then report in `snapshots.spawns[]` so command mode draws
  the new front. Symmetric for both sides. The `spawns[]` schema above is already sized for this.
- **Hero-seat notifications (ONE-HERO enforcement at the source):** the overworld will learn
  which users hold hero seats and 409 their command-mode inputs before queueing.
- **HMAC request signatures** replacing the bearer secret.
- **Non-square arenas**: `arena.shape:'polygon'` with the parcel's real bounds (the A1
  battlefield schema) once your engine leaves the legacy square.

## Reference implementation & quickstart

`scripts/mock-moba-match.mjs` (zero-dep node) is the executable form of this contract — read it
before writing your relay client. Run the whole loop locally:

```bash
# 1. overworld server with the bridge enabled
BRIDGE_SECRET=dev TICK_MS=1000 pnpm --filter @clashfront/server start

# 2. the mock match (random parcel, ~90 s, winner reported at the end)
node scripts/mock-moba-match.mjs --server http://localhost:8080 --secret dev

# 3. watch: open http://localhost:8080, join, click the ⚔ LIVE toast/badge
#    → square arena renders, steering works (click / right-click), banner on end.
```

Curl smoke of each endpoint:

```bash
B=http://localhost:8080; H='authorization: Bearer dev'; CT='content-type: application/json'
PARCEL=$(curl -s $B/api/world | node -pe 'JSON.parse(require("fs").readFileSync(0)).parcels[0].id')

ID=$(curl -s -X POST $B/bridge/battles/start -H "$H" -H "$CT" -d '{
  "matchId":"curl-1","parcelId":"'$PARCEL'",
  "attacker":{"armyLabel":"Curl Company","troops":100},
  "defender":{"label":"Localhost Garrison","troops":80},
  "arena":{"shape":"square","size":240},"exhibition":true}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).battleId')

curl -s -X POST $B/bridge/battles/$ID/snapshot -H "$H" -H "$CT" -d '{
  "tick":1,"clockMs":90000,"units":[
    {"id":"m1","kind":"master","team":"A","x":0,"z":-100,"hp":400,"maxHp":400,"name":"Curl"},
    {"id":"c1","kind":"core","team":"B","x":0,"z":100,"hp":1600,"maxHp":1600}]}'

curl -s "$B/bridge/battles/$ID/commands?afterSeq=0" -H "$H"
curl -s -X POST $B/bridge/battles/$ID/end -H "$H" -H "$CT" -d '{"winner":"A"}'
```

## What the overworld guarantees back

- Registered battles appear on the war map (LIVE badge + flames) within one world tick and in
  `GET /api/state → liveBattles[]` immediately (exhibitions are public — no fog gate).
- Snapshots reach every open command-mode viewer at your push rate, no re-polling.
- Steering commands queue within one WS frame of the click; permission enforced server-side
  (named governor, or any authenticated viewer for open exhibitions).
- Exhibition battles NEVER mutate the world — end them, crash mid-match, or let them time out;
  the map only ever shows presentation effects.
