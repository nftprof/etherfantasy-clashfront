# Depth layers + pending work — the 4-agent split (owner-confirmed landscape, 2026-07-10)

> **The definitive who-builds-what.** The session landscape is now FOUR agents (owner):
>
> | # | Agent | Owns |
> |---|---|---|
> | **A** | **EF Moba (Network + Obfuse deploy)** | MOBA match server, netcode, tickets/allocate/callback, MOBA deploys |
> | **B** | **MOBA BattleEngine RAW** | the 3D in-game client — rendering, loading screens, hero-mode UX, in-match systems |
> | **C** | **CF Overworld eco (main Dev)** | THIS session — overworld sim/server/client, economy, canon, world map, deploys to cf/clashfront |
> | **D** | **CF ParcelMap Design Agent** | the map/designer tool — ALL map + continent design: generator, base/seed passes, artifacts, towns/roads/ruins placement |
>
> Every task below names exactly one owner. Data contracts are in this repo (the delivery hub).

---

## Depth layer 1 — WORLD CHRONICLE + ruins

| Task | Agent | Specifics |
|---|---|---|
| Chronicle text review/edit | **Owner** | `docs/lore/WORLD-CHRONICLE.md` — it's your lore; edit freely |
| `RUIN` POI kind in the seed pass | **D** | new seeded entity (like landmarks): fallen keeps/cairns; names + one-line inscriptions drawn from the Chronicle; deterministic; NOT base-bake (re-runnable seed layer) |
| Lore-fragment drops at ruins | **C** | dig-site yields feeding the Arcane/research + DNA-fragment economies (⚙ drop tables) |
| Ruin render (2D thumb + 3D prop) | **D** (thumb/artifact) + **B** (3D prop) | a broken-tower prefab is enough for v1 |

## Depth layer 2 — NAMED SINGULARS

| Task | Agent | Specifics |
|---|---|---|
| Approve/edit the 31 names | **Owner** | `data/singulars.json` (places, the 5 Masks, Sigil, 8 weapons, wardens) |
| Bind named weapons to existing hero-gear art | **B** | pick which in-game weapon/armor models become the named pieces (owner's extraction idea); ship as distinct skins/ids |
| Mint path for artifact NFTs + provenance | **C** | vault-granted (decision 17); provenance = NFT transfer history read from chain |
| Singular PLACES on maps | **D** | pin `data/singulars.json` places to real parcels (the Shaft, gates, drowned palaces…) in the artifact/POI data |
| Surfacing (world map, parcel cards) | **C** | show the name + legend line where the thing lives |

## Depth layer 3 — THE WORLD REMEMBERS (decision 19)

| Task | Agent | Specifics |
|---|---|---|
| The whole system v1 | **C** | permanence rule on settlement records (⚙ `chronicle.greatBattleCasualties` → auto-name + archive), the `firsts` registry (gate/port/boss/EPIC/town-founding inscriptions **in the player's name**), the Chronicle feed page + site plaques |
| Monument POI placement on scarred parcels | **D** | consume C's monument events → cairn/graveyard POI in that parcel's seed data (graveyards seed Phantom pets) |
| Nothing needed from A/B | — | (in-match kill counts already flow back via the settlement callback) |

## Depth layer 4 — ZONE CULTURES (written ✅) → MOBA loading screens

**Owner directive:** the MOBA already has a loading-screen TIPS system — when a player loads into a battle
**in a continent, show that continent's culture card instead of generic tips.**

| Task | Agent | Specifics |
|---|---|---|
| **Loading-screen culture tips** | **B** | consume **`data/zone-cultures.json`** (this repo). Key: the battle's parcelId → `zoneCode = parcelId.slice(1,3)` → zone entry. Rotate short lines while loading: **proverb** (lead), **greeting**, **festival**, **dish/architecture** one-liners — prefix "*{Zone name} — *". Fallback: no zone match (e.g. the shared test arena) → the existing generic tips. Copy is final in the json; no invention needed. |
| Same cards on CF surfaces | **C** | travel panel, town cards, world-map click panel (already planned) |
| Festival dates onto the seasonal calendar | **C** | `docs/12` calendar hookup (later, with the events system) |

## Depth layer 5 — TOWNS + roads (decision 20)

**Owner directive:** map changes for towns/roads = **the ParcelMap agent**.

| Task | Agent | Specifics |
|---|---|---|
| **Famous dev-town placement + roads on maps** | **D** | owner picks locations/goods → `data/famous-towns.json` register; D places town POIs + the road network on the affected parcels/continents (seed-layer; roads use the existing ROAD terrain 0.5× bonus). Town-naming conventions per zone are in the culture cards. |
| Town sim rules | **C** | `towns.warLockDays` (7–30d war-lock), occupier benefit share, permanent no-war dev towns, market/trade flows on the economy seam |
| **Treasure hunt (CT gamble)** | **C** | house-edged under decision-17 accounting (per-user caps; rake ≥10% burns; prizes from the vault) |
| Inns (rest/morale + rumor board) | **C** | rumor board = the World-Remembers feed re-skinned |
| Road NAMING from real traffic | **C** (data) + **D** (map label) | post-movement-sim; needs march telemetry first |

---

## The pending engineering register, same split (from the cohesion review)

| Work item | Agent |
|---|---|
| Movement/toll/gate/pass sim + trespass + migration desertion | **C** |
| World-Remembers build (above) | **C** |
| Decision-16 command-fee queue + tick-rate (100ms↔30Hz) resolution | **C** (sim/canon) + **A** (engine side of tick alignment) |
| Vault contract + keeper (decision 17) — start now, longest lead | **C** leads (with owner/chain infra) |
| 20K base-terrain bake — pre-flight §1 sign-offs then run (incl. region/GATE fields §1.9) | **D** runs; **A + B** must sign off frame/grid/obstacle-authority first (`MAP-MAKER-HANDOFF-RECAP.md`) |
| Hero-mode last mile (deployed client honors tickets, auto-seat) | **B** |
| Live-match late-seat / join-window keepalive | **A** |
| Cross-server handoff infra (multi-server travel) | **A** (server move) + **C** (overworld handoff UX already built) |
| Mythoria N/S slice rules (border crossing = port action?) | **C** to draft, owner to rule |

## Reading list per agent (one line each)
- **A:** `ALLOCATE-CALLBACK-SCHEMA.md` (unchanged) · `MAP-MAKER-HANDOFF-RECAP.md` §1 (sign-off asks) · `SERVER-MIGRATION-AND-PASSAGE.md` (what the handoff must eventually do)
- **B:** `data/zone-cultures.json` (loading screens — buildable today) · `data/singulars.json` (weapon-art binding) · `CLIENT_BATTLEFIELD_LOADER` + hero-mode last mile (already owed)
- **C:** this doc's C-column (I schedule my own queue: World-Remembers first, then movement/toll sim)
- **D:** `RUIN`+monument+town/road placement asks above · `MAP-MAKER-HANDOFF-RECAP.md` (the bake) · `data/famous-towns.json` format lands when the owner picks town locations
