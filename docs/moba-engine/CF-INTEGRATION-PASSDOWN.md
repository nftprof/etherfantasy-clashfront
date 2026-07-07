# Clash Front × EF Moba — integration passdown (full history + status + next steps)

> **Owner:** EF v2 Moba Server (network/F5) session — as of 2026-07-05 this session owns the **whole
> CF↔engine seam** (network + bridge layer folded in). Single source of truth for the integration.
> **Repos:** engine/sim/client/telemetry = `blockchainsuperheroes/etherfantasy-browser-moba-game`
> (`main`); this doc mirrored to `etherfantasy-clashfront` `docs/moba-engine/`.

---

## 0. The three-layer stack (the mental model)

```
 L1  CF WORLD MAP (continent)          overworld: 293k hex parcels, armies march, battles trigger
      │  click a live battle
      ▼
 L2  COMMAND-VIEW BATTLE MAP           top-down 2D of ONE battle. Watch + issue high-level orders
      │  (rally point / focus / move officer). NO hero control.
      │  ⚡ "Take the field"                        ▲  "Exit to command" (back up one layer)
      ▼                                             │
 L3  HERO MAP (3D MOBA battle)         full 3D game: possess ONE Master, play at hero level.
                                        In L3 you can: 🎮 control · 🚪 hand to AI · ⬆ exit back to L2
```

**Keystone:** L2 and L3 render the **same battle in the same ±161 world frame** (center-origin, +z
north, ATTACKER SW / DEFENDER NE, cores ±114.8, spawns ±131.6, bounds ±161, **no ×MAPK**). A click at
`(x,z)` in L2 is the identical world spot L3 fights on. Correlation is *by construction* — see §5.

---

## 1. Owners (sessions)

| Layer / piece | Session |
|---|---|
| **L1** overworld, hub, canon, `cf.etherfantasy.com` deploy | Clash Front Overworld design |
| **L2** command-view renderer (`battle.js drawBattlefieldMap`) | Clash Front Overworld design |
| **L2↔L3 telemetry + battlefield export + ticket + possession + sim/netcode** | **THIS session (network/F5)** |
| **L3** 3D client (`/play`, index.html) — hero UI, 🚪/🎮 button, exit-to-L2 | EF Moba game dev OP 48 |
| Per-parcel maps (the 1000s, both layers) → `Battlefield` JSON | EF v2 CF Moba (map maker) (F5) |
| repo↔repo courier for map/battle data | MOBA BattleEngine |

---

## 2. Status matrix (what works / unverified / pending)

| Seam | Status | Detail |
|---|---|---|
| L1 → L2 (open a battle) | ✅ CF | overworld shows the battle, opens command view |
| **L2 render (the battle map)** | ✅ **wired, ⚠ not visually verified end-to-end** | CF `drawBattlefieldMap` renders the `battlefield` field I send in `bridgeStart` (my ±161 canon map) — confirmed by the bridge in code; **nobody has watched it render a real battle yet** |
| L2 live units overlay | ✅ mine | `cfpump` streams `frameUnits` @3Hz; CF accepts (HTTP 200) |
| L2 control (rally/focus/move officer) | ✅ mine (basic) | command channel: CF GET `?afterSeq=N` → applied to the AI officer; 409-reject while a user holds the hero seat |
| L2 → L3 (⚡ Take the field) | ✅ | CF ⚡ → ticket (mine) → `/play/?…&match&ticket` → possess |
| **L3 hero mode** | ✅ | 3D battle, per-champion parity, lag-comp, staging, finite stock |
| **L3 hand-to-AI / take-control (🚪/🎮)** | ✅ **live both boxes** | `{a:'release'}`→AI drives, seat reserved · `{a:'claim'}`→player drives · drop=auto-takeover |
| **L3 → L2 (exit back up a layer)** | ⛔ **PENDING** | no in-client "Exit to command" button wired to a return path — see §4.1 |
| **L2↔L3 SAME-MAP correlation** | ⚠ **unverified visually** | same ±161 frame ⇒ correlated by construction; but user hasn't seen command-map + hero-map on one battle. This is the #1 thing to confirm |
| Per-parcel real maps (the 1000s) | ⏳ future | today = built-in canon map for every battle; real maps land via R3/R5 (§4.4) |

---

## 3. Full history (what got built, chronologically)

1. **Netcode v2** — binary delta snapshots (~28–400B vs 7KB JSON), zero-GC client decode, tick-domain
   render clock, **lag compensation** (32-tick rewind). Root-caused the old "lag" = client GC leak,
   not network. (`server/net/proto.js`, inline client decoder.)
2. **Parity scrub** — the server sim was a parallel re-impl of the SP client; ported the numbers/systems
   so co-op/CF battles play like single-player: unit speeds, 3-lane waypoint waves + finite/heavy
   soldiers, per-champion stats (`sim/heroes.js`), type effectiveness (`sim/types.js`), full kill
   economy, tower dive-aggro, potion/flash cds, recall, cosmetic projectiles, **enemy ability VFX on
   the wire** (`world._casts`/`ARCH_IX`), server-truth move speed (walk-stutter fix), kill cosmetics.
   Ledger: `PARITY-SCRUB.md`.
3. **Map canon** — sim geometry raised to `legacy.json`: cores ±114.8, spawns ±131.6, **6 towers/side**,
   bounds ±161 — the shared ±161 frame both layers use. (`sim/state.js`, `config.js`.)
4. **CF M1 (bridge, now mine)** — `POST /internal/v1/matches/allocate` (accelerated headless + live),
   deterministic sim + `seedU32`, tamper-proof `journalHash`/`finalChecksum`/`verifyResult`, headless
   `runBattle`, HMAC result callback, `cfpump` telemetry auto-register. (`server/cf/*`.)
5. **Live-match + late-seat** — a CF battle runs 30Hz for a join window; a ticket seats a user into the
   RUNNING match (possession), mid-battle; rejoin re-mints a ticket into the same match.
6. **Staging** — pre-battle countdown; heroes LOCKED (fair start); shop open; move-clicks BANK as
   waypoints executed at battle start; `context.startingGold` opening budget.
7. **Finite army stock (R4)** + **revive budget (R6)** — `_armyStock` drains line waves; officers KO
   when revives exhausted. Flips the callback's officer fields to real.
8. **Command-map layout export** — `cf/layout.js battlefieldOf(world)` → the `battlefield` JSON in
   `bridgeStart`, so L2 renders the real map (not a generic square).
9. **release/claim (🚪/🎮)** — authoritative in-place hand-to-AI / take-control. (`validate.js`,
   `sim/step.js`.)
10. **Consolidation (2026-07-05)** — bridge layer folded into this session (base `272d639`); this
    session owns the whole seam.

---

## 4. Remaining steps + next steps (prioritized)

### 4.1 L3 → L2 "Exit to command" navigation  ⛔ (OP48 client + a CF field)
Today you can 🚪 hand-to-AI *within* L3, but there's no button to go **back up to L2**. Needs:
- **OP48:** an "⇦ Exit to command" button in `/play` (CF-deeplink mode only).
- **Return path:** either CF opens L3 in a new tab (button = `window.close()`), or CF adds
  **`&returnUrl=<command-view-url>`** to the ⚡ joinUrl and the button navigates there.
- **Server (mine):** already handled — leaving L3 = release → AI, seat reserved, L2 keeps streaming.

### 4.2 VISUALLY VERIFY L2↔L3 same-map correlation  ⚠ (the user's #1 concern)
Open a live battle, view L2 (command) on `cf.etherfantasy.com` and L3 (hero) on `/play` **at the same
time**, confirm the lanes/towers/cores/obstacles line up 1:1. They should (same ±161 frame). If L2 is
blank → the only cause is `battlefield` missing from `bridgeStart` (it's present today).

### 4.3 Inherited callback queue (real→placeholder fields)
- Officer `contribution.damage` + `structureDamage` — per-hero accumulator (`hero.dmgDealt`,
  `hero.structDmg`) → `buildCallback`, RAW/uncapped.
- `provisionsConsumed` (food/gold/wood drawn + looted).
- Food-clock → duration: `maxTicks` from `context.provisions.food`.

### 4.4 R3/R5 battlefield-from-JSON  (the 1000s of maps)
When the map-maker emits real per-parcel `Battlefield` JSON, `makeBattleWorld` positions the world
FROM `context.battlefield` (bounds/spawnZones/structures/lanes/obstacles) instead of the built-in canon
map. **This is what makes each of the 1000s of designed parcels play as its own map in BOTH L2 and L3.**
Supersedes the interim `cf/layout.js` export. Coord frame already matches (±161), so it's a positioning
swap, not a rescale.

### 4.5 R8 reinforcement (v2) — new edge lane + arriving officer. Reserved.

---

## 5. Why L2 and L3 correlate (the coordinate contract)
Both layers consume the **same `Battlefield` JSON in the fixed ±161 frame** (`sizeM 322`, center-origin,
+z north, no ×MAPK). L2 (`drawBattlefieldMap`) projects by `arena.sizeM`; L3 (the sim + 3D client) runs
the same coords. Fields both read: `arena.bounds`, `lanes[].waypoints`, `structures[].{kind,side,x,z(+hp)}`,
`spawnZones`, `obstacles`. **Do not emit a separately-scaled command map** — that's the only way to break
sync. Today my `battlefieldOf(world)` emits all of it from the live canon world; tomorrow the map-maker's
per-parcel JSON does, through the same fields.

---

## 6. Key files / secrets / gotchas (for whoever picks this up)
- **Engine/sim:** `server/sim/{state,step,heroes,types,abilities}.js`, `server/net/{proto,gateway,match,matchmaker}.js`.
- **CF seam:** `server/cf/{api,battle,ticket,bridge,cfpump,layout}.js`. `server/headless.js` (replay/verify).
- **Client:** `index.html` (`/play`) — inline v2 decoder, `netCastFx`, staging, deep-link boot, release/claim.
- **Deploy:** `bash deploy_client.sh` (client → both boxes); server = `tar server/ → both boxes → pm2 restart`.
  ALWAYS ship the whole `server/` tree (cherry-picking breaks goldenmaster). Test: `server/test/*` (goldenmaster,
  joinseam, proto, headless, cfstaging).
- **Boxes:** Singapore `13.250.39.41` (moba.etherfantasy.com) + Montreal `3.98.68.96` (ca.moba). Both run
  `ef-moba-server`(8080) + `ef-moba-lobby`(8090) + `cf-battle-api`(8140). Region pick routes the lobby too.
- **Secrets (per box):** `~/.cf_battle_api_token`, `~/.cf_battle_hmac_secret`, `~/.cf_bridge_secret`.
- **Gotchas:** `/internal/cf/live` POSTs the context **unwrapped** · callback HMAC `"v1="+hmacSHA256(hmac_secret,rawBody)`
  retry-until-ack · Idempotency-Key=battleId · joinUrl needs `/play/` trailing slash · exhibition:false =
  real battle (governor validation) · commands 409 while user holds seat · 30s silence="signal lost" 2min=DRAW.

---

## 7. Onboarding a new agent (assume same folder access)
> You are picking up the **Clash Front × EF Moba integration** (the network/engine + bridge seam), owned
> from the `etherfantasy-browser-moba-game` repo (`main`), deployed to two EC2 boxes. Read this doc top to
> bottom, then `PARITY-SCRUB.md` and `docs/briefs/CF-M1-STATUS*.md`. The three layers are L1 overworld
> (CF), L2 command map (CF renderer + your telemetry), L3 hero 3D (OP48 client + your sim/possession).
> **Your lane:** sim, netcode, telemetry, ticket/possession, the `battlefield` export, and the §4.3/§4.4
> callback + battlefield-from-JSON queue. **Do NOT edit the `etherfantasy-clashfront` repo code** (docs
> only) or OP48's client UI — write a change note instead. Deploy the whole `server/` tree (never
> cherry-pick — it breaks goldenmaster) and always keep both boxes in sync. Current top priorities:
> (1) visually verify L2↔L3 map correlation on a live battle, (2) help OP48 wire L3→L2 exit, (3) the
> officer-contribution callback fields, (4) R3/R5 battlefield-from-JSON for the per-parcel maps.
