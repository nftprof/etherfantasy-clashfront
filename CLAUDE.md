# Clash Front — Session Handoff & Project Guide

**Read this first, then `docs/AGENTS.md`, then `docs/README.md` (canon glossary).**

Clash Front is the grand-strategy overworld layer of the Ether Fantasy ecosystem: a persistent
browser war game built ON TOP of the hexagone-city NFT land map, using the existing EF browser
MOBA as the battle engine. The full design bible lives in `docs/` (13 documents). The working
branch is `claude/clash-front-overworld-mkcyia`.

## Current status (as of 2026-07-02)

**Done:**
- Complete design bible in `docs/` (00–10 + AGENTS.md + README canon). Consistency-reviewed.
- Monorepo scaffold, builds green, 22/22 tests passing:
  - `packages/shared` — canon in code: constants, enums, all 18 interfaces from `docs/08`,
    prefix-typed ULIDs, seeded RNG (no Math.random in sim), `balance.json` + typed loader.
  - `packages/sim-engine` — deterministic tick engine skeleton (exact phase order from `docs/01` §6),
    seeded test world, golden-master determinism + invariant tests (node:test, zero deps).
  - `pnpm install && pnpm -r build && pnpm -r test` must stay green.
- **Parcel import pipeline** (`packages/sim-engine/src/parcels.ts`, map-import session 2026-07-02):
  `data/parcels.json` snapshot format (documented in `data/README.md` + `data/parcels.sample.json`)
  → `importParcels()` → canonical `Hex`/`Territory`/`LandNFT`/`Region` genesis world. Deterministic,
  order-insensitive, invariant-2 enforced, estate classification via `ESTATE_MIN_HEXES`.
  `LandNFT.sourceParcelId` added to `docs/08` + shared types for import provenance.

**⚠ Map-source finding (2026-07-02, supersedes the assumption in next-step 1 below):**
`hexagone-city-website` does NOT contain the map — it is the marketing/auth/Polygon-staking
site. The real hex map + land marketplace is a separate app at **`map.hexagon.city`**
(header link with `land_type`/`zone`/`chain_ids` filters); its codebase is not in any session
scope so far, and the sandbox network policy blocks its API. `hexagon-crons` = MATIC staking
sync (no land tables); `games-etherfantasy-backend` = accounts/heroes/gameplay (no land).
**The real `data/parcels.json` snapshot is therefore still missing** — it needs the
map.hexagon.city codebase (or a land DB/API export) in scope; any parcel-id → hex-coords
export can be converted to the documented format. See `data/README.md`.

**Key decisions locked with the product owner (beyond what's in docs):**
1. Overworld map is FIXED — exact hexagone-city geometry, never regenerated.
2. Each hexagon's interior battlefield is procedurally SEEDED (deterministic); biome overrides on the
   main map (mountains etc.) to be designated later.
3. Battle maps are NOT MOBA maps anymore — armies collide against natural terrain; hero drop-in stays.
4. One battle map = smallest parcel size. Estates (100s–10,000 hexes) fight as linked per-hex
   components with an adjacency-gated internal front; castle = final component. See `docs/04` §7b.
5. Only estates have pre-designed castle/city-wall maps (real-world castle design references).
5b. SCALE LAWS: overworld game map = the source SVG verbatim (exact geometry); 1 L3 parcel =
    1 MOBA-map-sized battlefield, bounds polygon = the parcel's actual shape normalized to arena
    scale. LOCKED 2026-07-02: 1 engine unit = 1 m; SINGLE ≈ 240×240 m ≈ 14.2 acres; ladder
    SMALL 27.7× … EPIC 480.3× (≈6,800 acres, ~480 components); world ≈ 29,900 km² (`docs/04` §7b).
6. Chains (CORRECTED ×2): estates(L2)=Ethereum, parcels(L3)=Polygon, Pentagon Chain =
   characters + MOBA escrow + **the CT token itself (live on-chain)**. Game = deposit/withdraw
   escrow economy; deposit caps = the P2W faucet cap; burns settle on-chain (`docs/02` §13).
   Hero impact cap = 20% (`HERO_IMPACT_MAX`). Landlord tax 30%.
7. **Masters = the RoTK generals** (owned/RENTED character NFTs, KO/revive lifecycle). LIVE API on
   `api.etherfantasy.com` — endpoints + samples in `docs/09` §7. This CONFIRMS
   `games-etherfantasy-backend` as character source of truth (old open question #3 → answered).
9. Battlefields materialize LAZILY (first player visit; pure seeded function = safe caching).
   Occupied parcels are buildable bases (CoC layer): placeable defense modules (WALL/TOWER/GATE/
   TRAP/GRANARY/PET_DEN) with HP + battlefield anchors (`docs/04` §7b 2b). Pets (Palworld model):
   assigned to occupied territories to GATHER (yield boost) + GUARD (fight raiders); raiders beat
   pets down to KO — pets are NEVER lost, auto-return + recover; then territory can be occupied
   (`docs/05` §9, `Pet` schema in `docs/08`).
8. Creature layers: wild monsters + BOSSes occupy WILD estates; element-aligned Pets occupy
   territories/zones (`docs/05` §9). Fantasy world. **Rosters DELIVERED 2026-07-02** →
   `data/CHARACTER_ROSTER.csv` (47 Masters, 10 Bosses, 51 Monsters, 3 MOBA Heroes) and
   `data/PETS_ROSTER.csv` (128 pets, 122 battle-ready, 24 flying). Full breakdown + open
   questions (Hero-vs-Master split, pet elements, episode→biome mapping): `docs/05` §9.

**Sibling repos (the real system landscape — see `docs/AGENTS.md` table):**
- `blockchainsuperheroes/etherfantasy-browser-moba-game` — battle engine (3D client + authoritative server)
- `blockchainsuperheroes/hexagone-city-website` — the overworld map source (TS, NFT land)
- `blockchainsuperheroes/games-etherfantasy-backend` — EF platform API (accounts/heroes, confirm SoT)
- `blockchainsuperheroes/hexagon-crons` — existing land/yield cron jobs (Python)
- `_archive-infra-hexr-backend` — archived, reference only

10. v0.2 ANSWERS LOCKED (2026-07-02): PentaPets = the soldier unit TYPES (expendable; Masters
    command; workforce-identity sim SKIPPED for now). Every battle = a FULL MOBA match (20–40
    min, armies both sides; AI-vs-AI = same sim, accelerated ticks; instant resolve = placeholder).
    Parcel geometry fixed but terrain is a DESIGNED map: AI auto-designs + iterates + SAVES
    server-side; landowner can freeze AI and design (WC2-editor); occupiers only ADD structures
    (destructible/pillageable for materials); parcel-map PNG thumbnails texture the overworld
    (`docs/04` §7b, `docs/05` §9, reports/V02-RECONCILIATION.md).

11. TWO CONTROL SURFACES (2026-07-03): every battle = one authoritative match with COMMAND MODE
    (top-down overlay: watch + high-level orders — built in the demo as js/battle.js, the
    permanent command-channel client) and HERO MODE (full 3D MOBA, embody Master/Hero), with
    seamless mid-battle switching (possession model) under the ONE-HERO rule: multiple Masters
    may fight on one map; a player embodies exactly ONE at a time; switching heroes or issuing
    commands requires returning to command mode (hero/command mutually exclusive) — so the MOBA
    client can forever assume one-player-one-hero. CLARIFIED 2026-07-03: one hero PER USER, not
    per map — 2v2/3v3+ with allied users on either side. ENTRY MODEL (OP48 2026-07-03):
    taking the field = seated AS your Master via the normal champion draft (Masters are
    selectable champions now); walk-up possession lives on as the `joinAlly` primitive for
    AI-support reinforcements. Spawn trigger: Masters appear
    when their overworld march ARRIVES (mid-battle reinforcement), entering at the hexagon edge
    matching the approach direction, auto-attacking on arrival (existing MOBA behavior), and
    their soldiers create a new edge spawning point that acts as a NEW LANE pathing directly to
    the enemy main base (never an instant unit dump). M1 brief D2b + D1b specify command
    channel + reinforce API.

12. GEO ZONE-SERVER MAPPING (2026-07-03): shard = zone; each enabled zone served by EXACTLY ONE
    regional server (Montreal + Singapore first ⇒ 2 enabled continents at launch; huge continents
    may split into sub-zone slices). ONE world — no realm duplication; disabled zones visible as
    "beyond the frontier"; cross-zone = inter-shard handoff; a zone's battles run on its regional
    server (latency locality). `docs/07` §4.4.

13. NET-SINK DOCTRINE + ENRICHMENT PERKS (2026-07-03): Clash Front = a SINK (deposits > payouts;
    burn is the siphon; other EF games are the earn faucets; Keynesian injections = explicit
    owner policy only, never emergent). Enrichment's real payoff is LAND-BOUND perks, not the
    ~12% decaying trickle: pet-population migration rolls (∝ pool, element↔biome; "a general
    arrives" messages), population raises draft CAP/SPEED but DRAFTING ALWAYS COSTS FULL CT
    (no free-soldier faucet; any granted units' deaths must never feed pools), DNA-fragment
    drops (→ pet NFT crafting), and battle-kill enrichment (⚙ share of pillage/scavenge flows
    diverted to the battlefield's pool — redistribution only, never mint). Advertise in the
    enrich UI once implemented. `docs/02` §13.6.

14. LONE OCCUPATIONS (2026-07-03): Masters may hold land without an army — encounter = 
    OVERWHELM (attacker loses a few soldiers, defender KO'd via the LIVE Masters KO API) |
    DUEL (one seeded core: rating × Addendum-E element wheel × ⚙ bounded chance; v1 = 
    Uncharted-Waters-style best-of-3 auto-duel animation, M2+ = tiny-arena live 1v1 on the
    engine) | FLEE (rating-based escape roll, failed = caught). Offline-proof via per-Master
    standing orders (DUEL/FLEE/STAND). NFT pets = passive homesteads: farm yield, never
    defend, walk-on take-over returns the pet home (never lost). `docs/04` §7d.

15. COMMAND vs AUTO — SCALING KEYSTONE (2026-07-04): LIVE 30Hz battles are a SCARCE OPT-IN
    resource, AUTO (accelerated resolve, watch-only) is the DEFAULT. Player declares intent at
    MARCH time — `MARCH` (auto) vs `MARCH & COMMAND` (play/steer live). Bounded by per-player
    COMMAND SLOTS (⚙ small) + a global live-match POOL with a QUEUE (over-capacity command
    battles wait, then fall back to auto). Mode = LIVE iff a participant elected command AND has
    a free slot AND the pool has room; else accelerated. SUPERSEDES the old "≥1 player ⇒ live"
    rule — applies to PvP too. Future ⚙ COMMAND FEE (CT sink for dedicated command). Only
    commanded battles use 30Hz capacity ⇒ world-scale tractable; server expand = more slots.
    `docs/04` §3a.

16. COMMAND QUEUE — exponential fee, non-overlap, cancellable (2026-07-05; EVOLVES 15, replaces
    the fixed per-player slot cap). The per-player limiter is no longer a hard count but a QUEUE:
    (a) NON-OVERLAP not a fixed N — a live battle plays in real time (~10–15 min) and a player
    embodies one hero at a time, so their committed command battles may not overlap in time; within
    that they may queue as many as they like (a fight in 15 min AND one in 1 h both commit). (b)
    RISING COMMAND FEE in CT = the abuse limiter + the CT SINK (net-sink doctrine). Fee LADDER by
    queue depth (⚙ `commandFeeLadderCt`, owner 2026-07-05): 1st queued = 1 CT, then 3, 5, 10, 20 CT
    — **max 5 concurrent** (ladder length = the hard cap). Burns. (c) CANCELLABLE before start → fee
    refunded, depth drops (next is cheaper), march continues AUTO. (d) PRE-COMMITMENT ABSOLUTE —
    command is bought at MARCH time; a battle that starts with no committed command resolves
    accelerated + PLAYBACK-ONLY; no late command: "⚔ Battle already started — it's too late to take
    command now." Global `liveMatchPoolMax` pool + queue/timeout unchanged (server 30Hz capacity,
    orthogonal). `commandWindowTicks` ≈ a live-battle duration for the non-overlap check.
    `docs/04` §3a. **BUILD PENDING** — canon locked; sim/server/client + test churn next.
    NB pricing context (owner 2026-07-05): 1 CT ≈ $0.10; start balances ≈ 5 CT (most) / 50 (casual)
    / 500 (whale); most actions (e.g. raise a batch of soldiers) ≈ 1 CT ⇒ **the whole `balance.json`
    CT economy needs a re-scale down** (current values are 10–100× too high). Scoped as a task in
    `docs/briefs/HANDOFF-BATTLE-COMMAND-HERO-MAPS.md`.

17. **SECURITY INVARIANT — the anti-cheat engine (2026-07-06, TOP PRIORITY, on-contract):** the rule
    ABOVE all economy mechanics. **A user can NEVER withdraw more CT than they deposited** — the game is a
    **house-edged, negative-sum CT machine** (arcade / ticket-redemption): put CT in, play, redeem, but the
    base mechanic never pays out more CT than went in. **Rake on CT flows: ≥10% ALWAYS burned** (hard
    floor, net-sink); total cut up to **10–40%**, the part above the burn to a **developer VAULT** =
    the redistribution/prize pool (rake + revenue), paid out **discretionarily + vetted** (the only path to
    net-positive; the "occasional major reward"; unpublished). This is the anti-cheat: structurally
    negative-sum + house-granted-only upside ⇒ botting/cheating can't drain it. **On-contract, per-user
    accounted** (vault contract + keeper). The internal resource economy (gold/plunder/trade/craft) is a
    rich off-chain gameplay layer; the **on-chain CT cash-out is where the per-user cap + rake bite** —
    in-game-rich ≠ on-chain-profit. Net-sink doctrine (decision 13) made per-user + contract-enforced.
    Full model: `docs/reports/ECONOMY-MASTER-SUMMARY.md` §0b (+ RESOURCE-MAP, WARGAME-DESIGN-STUDY,
    `docs/maps/LAND-VALUE-AND-IMPROVEMENT.md`). Economy design is in REVIEW; this invariant is locked.

## 📜 v0.2 VISION BIBLE (2026-07-02): `docs/VISION-BIBLE-v0.2.md` + `docs/ADDENDUM-E-PentaPet-Species-Affinity.pdf`
Overarching new spec from the product owner: PentaPets = the living population (workers/soldiers/
units, species affinities), terraforming, geology/materials, blueprint NFTs, living cities.
Reconciliation vs locked canon + open questions: `docs/reports/V02-RECONCILIATION.md`. Canon
edits happen only after the owner answers its questions; integration phases A–D defined there.

## 🎯 TOP PRIORITY: MVP playable by 2026-07-07

Scope contract: `docs/briefs/MVP-JULY7.md`. Everything else yields to it. Map data is DELIVERED
(`data/hexagon-city-source/` — 292,766 parcels; see `MAP-EXTRACTION-REPORT.md` there). MVP runs on
the parcel graph of ONE zone (hexification deliberately punted — permanent decision, post-MVP).

## Immediate next steps (in order)

1. **Requires map.hexagon.city access (see finding above):** obtain the parcel table — all land
   parcels, sizes (small parcel ↔ estate), positions, estate boundaries — from the map.hexagon.city
   codebase or a land DB/API export. Parcel sizes are PERMANENT: snapshot as `data/parcels.json`
   (format already defined — `data/README.md`); the importer to canonical `Hex`/`Territory` is
   DONE and tested. This snapshot unblocks everything else.
2. ~~Inspect the MOBA repo's match-server API~~ **DONE 2026-07-02** — see
   `docs/reports/BATTLE-ENGINE-DISCOVERY.md` + `REPURPOSING-PLAN.md`. Key: server sim is
   deterministic/headless-proven (keep as kernel); no match API/result callback/pathfinding/army
   scale yet (plan items A–G, milestones M1–M5). **M1 (headless battles) is unblocked NOW** —
   placeholder hex radius, zero client work, delivers AUTO/ACCELERATED battle resolution to the
   tick engine. Canon conflict to resolve: `BATTLE_TICK_MS=100` vs real engine 30 Hz (33 ms).
3. ~~Confirm accounts/heroes SoT~~ **DONE** — `games-etherfantasy-backend` confirmed via live
   Masters API (`docs/09` §7).
4. Battle-engine implementation (in the MOBA repo, per REPURPOSING-PLAN): start M1 = B1 strip-MOBA
   + A1 battlefield model + D1 allocate + D3 headless runner + D2 result callback.
4b. ~~T1 engine integration (overworld side)~~ **DONE 2026-07-03, behind a feature flag** — the
   tick engine is wired to the LIVE M1 allocate API + HMAC result callback per
   `docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md` §3b (its OVERWORLD IMPLEMENTATION note = the
   operator doc). Env: `BATTLE_ENGINE_URL` (unset = OFF, instant resolves unchanged),
   `CF_BATTLE_API_TOKEN`, `CF_BATTLE_HMAC_SECRET`, optional `PUBLIC_BASE_URL`;
   `deploy/remote-deploy.sh` auto-sources both secrets from `~/.cf_battle_*` files and defaults
   the URL when they exist. Allocate failure ⇒ automatic fallback to instant resolution.
   Engine callbacks apply as server-boundary inputs next tick (determinism preserved).
   **HERO-MODE LAST MILE (CF side) DONE 2026-07-03:** Allocate-response join info accepted in
   both shapes (single attacker-oriented `{ticket,joinUrl}` and future `joins[]`), persisted on
   the pending record; `joinUrl` is PRIVATE to its governor (owner-only `/api/state` liveBattles +
   strictly-private `battle_joinable` event) — the owner gets a gold “⚡ Take the field” button on
   the PARCEL CARD. Live matches have NO tick timeout (callback settles; engine TIMEOUT = clock
   authority). §3b documents all of it. Remaining for the watch feed: bridge session
   auto-registers the D2b command channel from allocate.
   **COMMAND-vs-AUTO SCALING KEYSTONE DONE 2026-07-04 (decision 15 / docs/04 §3a; SUPERSEDES
   "≥1 PLAYER ⇒ live"):** LIVE is now a SCARCE OPT-IN resource chosen at MARCH time. `POST
   /api/march` takes `command?:bool` (default false = AUTO) → `army.commandIntent`, consumed at
   the collision tick. The sim decides LIVE iff a participant elected COMMAND **and** holds a free
   ⚙ `battle.commandSlotsPerPlayer` (2) slot **and** the ⚙ `battle.liveMatchPoolMax` (8) global
   live pool has room; command+slot but full pool ⇒ QUEUED (hex locked, promoted when a slot
   frees, else accelerated after ⚙ `battle.commandQueueTimeoutTicks` 20); else ACCELERATED.
   Applies to PvP + player-vs-wild; pure AI stays accelerated. `EngineBattleState` gains QUEUED
   status + `commandGovernorIds` + `queuedTick`; `createEngineBattle`/`promoteQueuedEngineBattles`
   (sim, deterministic) own it; `CF_LIVE_BATTLES=0` → `tickOptions.liveBattles` kill switch.
   Client: march popover = **⚔ March** (auto) + gold **⚔ March & Command** (live) with a
   `Command used/max` hint; at-capacity march toasts the downgrade; only LIVE engine battles open
   the command viewer/⚡ doorway. Owner-visible change: **marches now AUTO-resolve by default;
   pick "March & Command" to play a battle live, limited to N (2) at a time.** Future ⚙ COMMAND
   FEE hook noted (not built). Tests: +7 sim-engine (`engineCommand.test.ts`) + engineBattle
   integration; suite 161 green.
4c. ~~Pentagon Games identity login~~ **DONE 2026-07-03** — `docs/briefs/PG-IDENTITY.md`.
   PG accounts are the PRIMARY login: embedded sign-in form (identifier+password →
   browser POST login.pentagon.games/user/login with publishable X-PG-App-Key) →
   `/api/login-pg` verifies server-side via GET /user/info → pgUid→governor binding
   persisted in the save (resume / adopt richest unbound same-name PLAYER governor /
   create; adopted never re-adoptable). Env `PG_APP_KEY` (unset = dev name-only login
   untouched) + `PG_API_URL`; `deploy/remote-deploy.sh` defaults the publishable key
   (file `~/.cf_pg_app_key` overrides) — **PG login turns ON at the next deploy**.
4d. ~~Masters roster gate~~ **DONE 2026-07-04** — `docs/briefs/PG-IDENTITY.md` §3b. A
   PG-logged-in player commands ONLY the Masters their wallet owns/rents, pulled live from the EF
   Masters API (`09` §7, `GET /api/gameplay/masters/active/{wallet}`). Wallet from PG `mm_address`;
   `MASTERS_API_URL` (default `https://api.etherfantasy.com`, injectable `mastersFetch` for tests);
   `Game.loginPg(…, ownedMasters?)` re-syncs the officer pool on every login (reconcile by
   `masterId`: keep still-owned + assignments, add new, drop no-longer-owned if FREE / keep until
   idle if BUSY). API-down or wallet-owns-nothing ⇒ demo-roster fallback (never zero officers).
   Officers now carry the REAL `masterId`/`slug` into the battle allocate context (fixes the old
   `masterId = hero_… ULID` bug so the MOBA client maps the champion + pre-locks the seat).
   New env `MASTERS_API_URL` (deploy exports if set; **the box must reach api.etherfantasy.com**).
   +7 tests (`apps/server/test/mastersRoster.test.ts`); suite 152 green.
4e. ~~Recently-resolved battle review~~ **DONE 2026-07-04** (owner: "the battle ends too quickly
   to view" — AUTO is the default now). Server keeps a bounded, fog-filtered **recentBattles ring**
   (⚙ `review.ringCap` = 12; newest-first, older ages out — only recently-completed are reviewable)
   populated at settlement in `Game.tick()` for ALL paths (engine callback / wild / instant/bridge),
   persisted in the snapshot, exposed per-viewer on `/api/state` + every WS tick (`recentBattlesFor`
   reuses the liveBattleSummaries intel gate). Each record: sides + labels, winner/reason,
   casualties/survivors counts, duration, `wasLive`, and a **compact synthesized strength timeline**
   (⚙ `review.timelineKeyframes` = 12 — honest reconstruction from start troops → known casualties
   with a seeded rhythm, NOT 30 Hz frames). Client: **🎬 Recent battles** control in the War-report
   rail header + clickable resolved feed rows → a **result/replay panel** reusing the `#battle`
   overlay (`battle.js` `openReview`): RESULT CARD + scrubbable SVG strength chart, "▶ Review all"
   auto-advance with a per-battle timer (⚙ `review.reviewTimerSec` = 7, via `/api/world` meta),
   prev/next + jump dropdown + manual scrub. Accelerated battles show the honest reconstruction (no
   fake live replay); LIVE keeps real telemetry. Scoped `.review-*` CSS injected from `battle.js`
   (app.css untouched — visual session owns it). New ⚙ `balance.review` section (+ `revealDurationTicks`
   reserved for the sealed-reveal follow-up, designed-not-wired). +4 tests (`recentBattles.test.ts`
   + engineBattle review case); suite 165 green. Docs: `docs/04` §7b.
4f. ~~Command-view battlefield renderer + real MOBA-style stand-in map~~ **DONE 2026-07-04** (owner:
   "the command map is a made-up placeholder that looks nothing like the real MOBA battlefield").
   `battle.js` now has a fully DATA-DRIVEN Battlefield-JSON renderer (`docs/briefs/BATTLEFIELD-SCHEMA.md`):
   bounds polygon → biome terrain + water footprints + forest/rock obstacles → lane corridors →
   structure anchors (CORE/TOWER/GATE/WALL coloured by side) → spawn zones → resource nodes →
   build-spots, with the LIVE unit snapshot layered on top; it renders ANY conformant Battlefield JSON,
   so the MOBA team's real export drops in with ZERO renderer changes. Shipped the interim stand-ins
   `data/moba-maps/legacy-3lane.json` (default/estates) + `legacy-1lane.json` (single parcels) — valid
   Battlefield JSON, tagged `_placeholder`, passing all 5 playability invariants. Server wiring:
   `game.ts` + `bridge.ts` `battleStatic` attach a `battlefield` to `battle_hello` (precedence: a REAL
   map from the match server/bridge wins, else the stand-in; 3-lane for estates, 1-lane for single).
   Loader/validator `apps/server/src/battlefield.ts` (shared walkability rule + 5-invariant validator,
   `CF_MOBA_MAPS_DIR` override). +5 tests (`battlefield.test.ts`); suite 170 green. Docs: `docs/04` §7b,
   `BATTLEFIELD-SCHEMA.md`, `ALLOCATE-CALLBACK-SCHEMA.md` §1a.
4g. ~~Battlefield coordinate-frame rescale to the client's REAL ±161 frame~~ **DONE 2026-07-04**
   (authoritative — EF Moba game dev OP 48, who owns client geometry). Retired the pre-scale
   ±120/sizeM240 artifact; the battlefield frame is now the **FIXED standard ±161 arena
   (`sizeM = 322`) for EVERY battle** (singles AND estates — an estate is a SERIES of ±161
   component battles per canon decision 4, so parcel size scales army/structure/component COUNT,
   not arena size; the MOBA needs zero arena change). Coords are dimensionless **WORLD-UNITS**
   (~0.74 m/unit by the declared 14-acre parcel mapping), center-origin, +z north, blue/ATTACKER
   SW / red/DEFENDER NE, **spawns ±131.6, cores ±114.8**, consumed AS-IS post-MAPK — **NO ×MAPK
   anywhere in the CF path**. `game.ts engineAllocateContext` (S=322, bounds ±161, spawns ±131.6,
   anchors `(anchor−0.5)·322`), both stand-ins rescaled + passing all 5 invariants, loader now
   **prefers a real `data/moba-maps/legacy.json`** (the MOBA BattleEngine source of truth) over
   the stand-ins. Renderer (`battle.js`) already data-driven off `sizeM`/`bounds` (no hardcoded
   240/120) — renders ±161 unchanged. Docs: `BATTLEFIELD-SCHEMA.md` (coord system + scale
   declaration), `ALLOCATE-CALLBACK-SCHEMA.md` §1, `docs/04` §7b reconciliation note. Tests
   updated (engineBattle expected frame + stand-in sizeM/core checks); suite 170 green.
4h. ~~Maps economy seam Hook 1 — ownership feed~~ **DONE 2026-07-04** (maps deliverable merged from
   `claude/maps-econ-seam` → `docs/maps/ECONOMY-SEAM.md` + `README.md`). CF now serves the public
   **`GET /api/land-owners` → `{ owners: { parcelId: pgUsername } }`** feed (map form the maps lobby
   accepts) for PLAYER-owned parcels. Reports the **canonical PG username** (`pgUsernames` map,
   governorId→PG username, captured at `loginPg` + persisted) — NOT the empire name, which differs
   when a PG account adopts a legacy empire (PG "nftprof" → empire "Idon"). Wild/system land and
   name-only (non-PG) players are ABSENT ⇒ stay designable by any signed-in account (agreed testing
   default; we never fabricate an owner). Activation: `echo 'http://localhost:8130/api/land-owners' >
   ~/.ef_maps_owners_url && pm2 restart ef-moba-lobby` on the shared box (13.250.39.41), or hand the
   URL to the maps session to wire+verify. +1 test (`landOwners.test.ts`); suite 171 green.
   Also joinWindowSec staging dial now sent in the live allocate context (⚙ `battle.joinWindowSec`
   = 120; network F5 Fork's hero-mode late-seat window). **STILL OWED — Hook 2 (invest CT → map
   budget tier 0..5, keyed POST) + Hook 3 (landowner payout from the casualty callback).**
5. Then continue roadmap T1 (`docs/10`): flesh out tick-engine phases against real map data.

**Open design questions for the product owner** (do not decide unilaterally):
- Estate sieges: can defenders counterattack components to push the front back? (recommended yes)
- Estate campaign pacing: assault-wave rate limits / defense windows per time zone?
- Biome designations on the main map; estate threshold (`ESTATE_MIN_HEXES = 7` is a proposal).
- Battle join-window length (minutes-scale lobby vs hours-scale asynchronous).

## Repo layout convention (delivery hub)

This repo is the delivery hub for the whole Clash Front project — ALL known assets, extracted data,
and cross-repo reports are delivered into subfolders here:

- `docs/` — the design bible (canon)
- `docs/briefs/` — mission briefs for satellite work-stream sessions (maps, battle engine, …)
- `docs/reports/` — discovery/extraction reports delivered by those sessions
- `data/` — permanent extracted assets (e.g. `parcels.json` — the hexagone-city parcel snapshot)
- `packages/` — the monorepo code (shared canon, sim-engine, …)

Satellite sessions deliver on their OWN branches (`claude/map-extraction`,
`claude/battle-engine-discovery`) — never directly on `claude/clash-front-overworld-mkcyia`;
a core session merges them.

**Live session landscape (owner-confirmed 2026-07-04 — ALWAYS refer to a session by its EXACT name below; never say "netcode"/"the server" ambiguously):**
| Session name (use verbatim) | Repo(s) | Owns |
|---|---|---|
| **Clash Front Overworld design** (THIS) | `etherfantasy-clashfront` only | CF game-dev / overworld UI + hub + canon; all `docs/briefs/*` contracts; `BATTLE_ENGINE_URL` wiring; deploys to cf.etherfantasy.com |
| **EF v2 Moba Server (network) (F5 Fork)** | MOBA repo | the match server / old PVP server: 30 Hz match loop, `addSeat`, snapshot streaming. **Owns "keep the match LIVE for the join window + late-seat"** (the current hero-mode blocker: match must stay open ~10–15 min so a ⚡ click can seat mid-game) |
| **EF v2 Moba Server (bridge layer)** | MOBA repo ↔ CF | sits between CF and the match server: allocate, ticket mint/verify, cfpump telemetry, `makeBattleWorld`, **map layout in `battle_hello`**. ✅ delivered tickets + a map JSON; owes: send the REAL loaded map layout to CF's command view |
| **EF Moba game dev OP 48** (Cowork) | MOBA repo (3D client) | the actual game — `index.html` MOBA 3D client. ✅ hero-mode entry (ticket=auth login bypass, `cf:1` auto-seat as `youHn`, `joinAlly`). Owes: make the deployed client actually honor the ticket (login still flashes) + auto-seat |
| **EF v2 CF Moba (map maker) (F5)** | CF + MOBA | AI/LLM generates a unique battlefield per CF parcel hexagon (`briefs/MAP-GENERATOR.md` + `BATTLEFIELD-SCHEMA.md`); eventually merges in for per-parcel battle maps |
| **MOBA BattleEngine** | bridges `etherfantasy-browser-moba-game` ↔ `etherfantasy-clashfront` | delivers maps + the details CF needs onto the CF side (the repo-to-repo courier for battlefield/map data) |
| **EF v2 Main WebSite FE** / **EF v2 WebSite (Pets Claim)** | website FE | the main marketing/app site + the pets-claim page (not battle-path) |
Seams: **bridge layer ↔ OP 48** = join ticket format; **map maker ↔ bridge layer** (via **MOBA BattleEngine**) = Battlefield JSON (`briefs/BATTLEFIELD-SCHEMA.md`); **network (F5 Fork) ↔ OP 48** = keep-match-live so the client can late-seat.

## Working rules

- **Retry differently (product owner 2026-07-02):** when anything fails, do NOT repeat the same
  attempt — change the approach each retry (different tool/method, smaller scope, isolated
  worktree, alternate data source, or restructure the step). Escalate to the product owner only
  after materially different attempts have failed.
- Follow `docs/AGENTS.md` (prime directives: determinism, integer money, canon names, doc-first).
- Never edit canon (names/schemas/constants) without updating `docs/README.md` + `docs/08` in the same PR.
- Commit and push to `claude/clash-front-overworld-mkcyia`; never force-push others' work away.
- The stop-hook requires a clean pushed tree at end of turn.
