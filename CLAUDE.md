# Clash Front — Session Handoff & Project Guide

**Read this first, then `docs/AGENTS.md`, then `docs/README.md` (canon glossary).**

Clash Front is the grand-strategy overworld layer of the Ether Fantasy ecosystem: a persistent
browser war game built ON TOP of the hexagone-city NFT land map, using the existing EF browser
MOBA as the battle engine. The full design bible lives in `docs/` (13 documents). The working
branch is `claude/clash-front-overworld-mkcyia`.

## Current status (as of 2026-07-02)

**Done:**
- Complete design bible in `docs/` (00–10 + AGENTS.md + README canon). Consistency-reviewed.
- Monorepo scaffold, builds green, 13/13 tests passing:
  - `packages/shared` — canon in code: constants, enums, all 18 interfaces from `docs/08`,
    prefix-typed ULIDs, seeded RNG (no Math.random in sim), `balance.json` + typed loader.
  - `packages/sim-engine` — deterministic tick engine skeleton (exact phase order from `docs/01` §6),
    seeded test world, golden-master determinism + invariant tests (node:test, zero deps).
  - `pnpm install && pnpm -r build && pnpm -r test` must stay green.

**Key decisions locked with the product owner (beyond what's in docs):**
1. Overworld map is FIXED — exact hexagone-city geometry, never regenerated.
2. Each hexagon's interior battlefield is procedurally SEEDED (deterministic); biome overrides on the
   main map (mountains etc.) to be designated later.
3. Battle maps are NOT MOBA maps anymore — armies collide against natural terrain; hero drop-in stays.
4. One battle map = smallest parcel size. Estates (100s–10,000 hexes) fight as linked per-hex
   components with an adjacency-gated internal front; castle = final component. See `docs/04` §7b.
5. Only estates have pre-designed castle/city-wall maps (real-world castle design references).
6. Chain = Pentagon Chain. Hero impact cap = 20% (`HERO_IMPACT_MAX`). Landlord tax share default 30%.

**Sibling repos (the real system landscape — see `docs/AGENTS.md` table):**
- `blockchainsuperheroes/etherfantasy-browser-moba-game` — battle engine (3D client + authoritative server)
- `blockchainsuperheroes/hexagone-city-website` — the overworld map source (TS, NFT land)
- `blockchainsuperheroes/games-etherfantasy-backend` — EF platform API (accounts/heroes, confirm SoT)
- `blockchainsuperheroes/hexagon-crons` — existing land/yield cron jobs (Python)
- `_archive-infra-hexr-backend` — archived, reference only

## Immediate next steps (in order)

1. **Requires sibling-repo access in session scope:** read `hexagone-city-website` (+ backend) and
   extract the parcel table — all land parcels, sizes (small parcel ↔ estate), positions, estate
   boundaries. Parcel sizes are PERMANENT: snapshot as `data/parcels.json` in this repo, then write
   the importer → canonical `Hex`/`Territory` model (`docs/08`). This unblocks everything else.
2. Inspect the MOBA repo's match-server API → concretize the battle handoff contract (`docs/09`)
   against real code; scope per-hex battlefield loading (square map → hex-component battlefields).
3. Confirm whether `games-etherfantasy-backend` is the source of truth for accounts/heroes.
4. Then continue roadmap T1 (`docs/10`): flesh out tick-engine phases against real map data.

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

- Follow `docs/AGENTS.md` (prime directives: determinism, integer money, canon names, doc-first).
- Never edit canon (names/schemas/constants) without updating `docs/README.md` + `docs/08` in the same PR.
- Commit and push to `claude/clash-front-overworld-mkcyia`; never force-push others' work away.
- The stop-hook requires a clean pushed tree at end of turn.
