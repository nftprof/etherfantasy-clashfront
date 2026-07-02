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

## Working rules

- **Retry differently (product owner 2026-07-02):** when anything fails, do NOT repeat the same
  attempt — change the approach each retry (different tool/method, smaller scope, isolated
  worktree, alternate data source, or restructure the step). Escalate to the product owner only
  after materially different attempts have failed.
- Follow `docs/AGENTS.md` (prime directives: determinism, integer money, canon names, doc-first).
- Never edit canon (names/schemas/constants) without updating `docs/README.md` + `docs/08` in the same PR.
- Commit and push to `claude/clash-front-overworld-mkcyia`; never force-push others' work away.
- The stop-hook requires a clean pushed tree at end of turn.
