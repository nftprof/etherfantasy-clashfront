# SIEGE MECHANICS — spec + test map (owner-directed 2026-07-21)

> Owner: "check if current elevation already gives range advantage … build the map for us to test
> properly … then give the spec along to MOBA game engine to build test. u have limitations that
> inside wall u can't hit in and out of it — only to the wall and wall back down. flyer can go
> over. also whether some units can crawl walls can be possible mechanism."

**Audience:** EF Moba (Network + Obfuse deploy) — authoritative-sim rules; MOBA BattleEngine RAW —
client presentation. CF ParcelMap delivers the map + data contract (this doc). CF Overworld canon
owns balance numbers once tested.

## §0 Engine audit finding (2026-07-21) — elevation does NOT exist today

Read directly from the authoritative sim (`server/sim/`, main @ af1a5a7):
- Units live in **x/z only** — there is no `y` anywhere in sim state (`step.js` `clampPt`, spawns,
  flash, recall are all `{x,z}`).
- `combat.js`: in-range test is flat 2D `dist(u,tgt) > u.range`; damage = `dmg × typeMult`. **No
  elevation term, no LOS test, no terrain/obstacle awareness in the authoritative path at all**
  (consistent with BATTLE-ENGINE-DISCOVERY: "no terrain/obstacles in the authoritative sim").
- Any height seen in the 3D client is cosmetic; it never changes combat.

⇒ Everything below is green-field sim work. The rules are simple by design — cell/zone lookups,
no 3D math needed (the sim can stay 2D + a per-cell `tier`/`wall` layer).

## §1 LOCKED rules (owner 2026-07-21)

- **R1 — WALLS BLOCK ENGAGEMENT ACROSS.** A ground unit inside cannot hit out; a ground unit
  outside cannot hit in. Legal engagements: ground → wall-top, wall-top → ground (both sides),
  wall-top ↔ wall-top, and melee vs the WALL/GATE structure itself. Implementation sketch: attacks
  whose segment crosses a WALL cell are illegal unless attacker or target stands ON the wall ring.
- **R2 — FLYERS GO OVER.** Movement flag `fly`: ignores WALL/WATER/ROCK blocking for pathing (R1
  still governs whether they can be shot: a flyer is always in open LOS — hit-able from both sides,
  and it can hit down on both sides).
- **R3 — DOOR BREACH (already in the data).** Gates are `castle_gate_*` structures with HP
  (~1100+). Destroying the gate opens the passage cell(s). The sim must honor structure-blocked
  cells; the client must render damage/breach states.
- **R4 — WALL-WALK + STAIRS.** The parapet ring is walkable ONLY via access points (stair flights
  beside gates, towers). Data: `_siegeTest.elevationTiers.tier2.WALL_WALK` ring; stairs are at the
  gate flanks (kit renders them since 2026-07-21).
- **R5 — DRAWBRIDGE (defender toggle).** Moat crossings carry a bridge state: DOWN = ROAD
  (crossable), UP = WATER (blocked). Defender-owned toggle with a cooldown (⚙). v1: the bridge
  itself is indestructible — attackers breach the GATE or go around/over; bridge HP is a v2 option.
- **R6 — HEIGHT ADVANTAGE (proposed numbers — TEST TO TUNE, then CF canon locks).** Elevation
  tiers: 0 ground · 1 mound/ridge-top · 2 wall-walk. Per tier of advantage (attacker tier −
  target tier, clamped ±2): ranged damage ±12%, ranged range ±10%. Melee unaffected by tiers
  (R1/R4 already gate melee access). Applies to EVERYONE including besiegers on outside high
  ground — position is the advantage, not the role.
- **R7 — WALL-CRAWLERS (optional mechanism, owner-flagged).** Unit trait `climb`: may traverse
  WALL cells at crawl speed (⚙ ~0.35×) and fight from the wall-top when on it. Counterplay:
  crawlers are exposed (always LOS-visible) while climbing. Build behind a flag; test last.

## §2 Data contract — the STANDARD `siege` block (GEN_VERSION 8, MOBA contract fixes 1–4)

Every parcel with siege-relevant geometry carries a **top-level `siege` block** in the artifact,
the Battlefield A1, AND the render manifest (same object, verbatim passthrough):
- `siege.elevationTiers`: tier-1 zones (MOUND disc, RIDGE_TOP bands) + tier-2 `WALL_WALK` ring.
  **Emitted on ANY parcel with baked high ground, castle or not** (fix 4) — the strictly-above-
  tier over-wall rule works wherever ridges/plateaus exist, automatically.
- `siege.wallRing` (pts + height + gate points) · `siege.gates` (id/at/hp) ·
  `siege.drawbridge.at` (derived from the REAL road-over-water bridge cells).
- **`siege.stairs[]` — stair access points AS DATA** (fix 2): per gate, per side —
  `{gate, side, mode: PARALLEL|PERPENDICULAR, foot:[x,z], top:[x,z]}` — computed by the generator
  under the owner-locked size ladder; sim and client both consume THIS, neither derives placement.
- `meta.designVersion` is **mandatory** in every artifact/A1/manifest (fix 3) — never null.
- `_siegeTest` on the test map is now ONLY `{spec, stations[]}` (T1–T8 coordinates) — genuinely
  test-only. All structural data lives in `siege`.
The raw artifact also carries `meta.castleGeom` for renderers; the grid encodes
WALL/GATE/WATER/ROCK/ROAD per cell.

## §3 The test map — SIEGE-TEST-1

Built by `map-service/tools/make_siege_test.mjs` (deterministic; regenerate any time). Layout:
CASTLE (kind=CASTLE, full ring, 2 gates, stairs, mound) at [52,52] NE · MOAT arc across the S/W
approach · approach ROAD SW spawn → gate, crossing the moat (= causeway/drawbridge site,
~[-41,-34]) · outside HIGH-GROUND ridge band east of the wall ([126,-10]→[100,118], w22) ·
attacker spawn SW, defender = castle. Sim-gate: pass, score 100, all 5 modes. Known v2 polish: the
corridor-carve fragments the moat arc in places; the causeway station itself is intact.

### Test matrix (stations in `_siegeTest.stations`)
| # | Station | Expect |
|---|---|---|
| T1 | ground↔ground across wall | both directions BLOCKED (R1) |
| T2 | ground↔wall-top | both directions allowed (R1) |
| T3 | gate breach | gate HP → 0 opens passage; units path through (R3) |
| T4 | stairs | courtyard→parapet only via stair/tower cells (R4) |
| T5 | drawbridge | DOWN crossable, UP blocked; toggle honors cooldown (R5) |
| T6 | flyer | crosses wall + moat freely; shootable from both sides (R2) |
| T7 | ridge advantage | ridge-top archer vs courtyard archer: wins range + damage trade (R6) |
| T8 | crawler (optional) | scales wall at crawl speed, exposed while climbing (R7) |

## §4 Handoff

- **EF Moba (server sim):** implement R1–R6 (R7 flagged) in the authoritative sim; headless-run
  SIEGE-TEST-1 and assert the matrix. Wall/tier data comes from the map file — no hardcoding.
- **MOBA BattleEngine RAW (client):** breach states on gates (R3), drawbridge up/down visual,
  flyer/crawler reads, tier-bonus feedback (hit numbers already exist).
- **CF:** after the matrix passes, owner tunes R6 numbers → CF locks them into canon
  (`docs/08` + balance ⚙) and the rules apply to every castle parcel automatically (same shapes).

## §5 In-battle building — FREE-FORM, LOCKED (owner 2026-07-21)

**Players may build new command centers and towers ANYWHERE on the map** during gameplay. A
placement is legal iff its footprint does NOT overlap:
1. any existing structure (incl. castle walls/gates/towers — the wall-clearance band counts),
2. trees / forest cells — **while standing**: harvested/cleared forest frees the ground,
3. resource nodes — **while undepleted** (owner 2026-07-21: building on a resource spot is
   possible AFTER it's depleted — mainly tree and gold; a mined-out node's cells become buildable),
4. blocked landscape tiles (ROCK / WATER / CLIFF / OOB).

I.e. the footprint must sit on ground that is clear NOW (OPEN / ROAD — including ground reclaimed
by chopping trees or mining out a node). Depletion frees land; that is deliberate economy-to-
territory conversion (clear the forest → build the fort). That is the WHOLE rule — no
designated-spot restriction. `buildSpots[]` stay in the data as **PREPARED PADS — LOCKED perk
(owner 2026-07-21): building on a pad is CHEAPER and FASTER; free-form anywhere else costs full
price and takes longer to build** (⚙ cost/time multipliers for balance). Pads never gate placement.

Why lane-sealing is acceptable: every structure has HP. A tower-wall across a lane is a legitimate
fortification, not a soft-lock — attackers path-fail into it and BATTER IT DOWN (CoC model). The
map can never become permanently unreachable.

Engine implications (EF Moba): (a) dynamic obstacle insertion at 30 Hz — units path around fresh
buildings; (b) **pathless → attack the blocker**: when no route to the target exists, units target
the nearest blocking structure on the intended path (this is what makes free-form safe); (c) the
overlap check is a cheap server-side cell test against the artifact grid + live structure list.

(Supersedes the earlier "walkability-invariant placement validator" proposal — destructibility +
pathless-attack makes the reachability guarantee unnecessary. EVOLVES canon decision 9's
"placeable modules at battlefield anchors" → anchors optional, free placement canonical.)

## §6 GATE: live CF battle on SIEGE-TEST-1 BEFORE mass production (owner 2026-07-21)

**No further castle-map production until a real CF battle has been played on this exact map.**
Wiring task → **CF Overworld eco (main Dev)**: mount `data/moba-maps/siege-test.json` as the
battlefield for a designated test parcel (the battlefield loader `apps/server/src/battlefield.ts`
already prefers real maps in `data/moba-maps/`; add a per-parcel override so one hex serves the
siege map), march armies there, fight it with TODAY'S mechanics (no new rules needed for the
smoke test), and report flow/pacing/anything broken. Result of that playtest gates both (a) the
R1–R7 mechanics build (EF Moba) and (b) baking more castle maps (CF ParcelMap).

## §7 CASTLE UPGRADE LADDER — pay CT to fortify YOUR land (owner 2026-07-21, recorded)

Future system, recorded now so the build rules above are designed for it:
- Any landowner may **UPGRADE their own parcel's fortification** up the ladder toward the top
  tier (**castle + keeps**) by paying CT. This extends decision 22's baked ladder (EPIC=PALACE /
  GIANT=CASTLE / LARGE=KEEP / MEDIUM=manor / SMALL=nothing) — big estates get their tier baked
  free; smaller land BUYS its way up.
- **Inverse size pricing: the SMALLER the parcel, the MORE the upgrades cost** (⚙ curve TBD —
  a SINGLE paying to the castle tier = "lots of CT", many increments). Net-sink doctrine +
  decision 17 apply: burn floor on every upgrade payment; pricing owned by CF Overworld eco.
- Upgrade output = the same castleGeom/wall/gate/stairs data the generator bakes (indestructible
  walls per CASTLE-STRUCTURE-ACK §2) — one data shape, whether baked by estate size or bought.
- Sequencing: LOCKED after the §6 playtest proves the castle battle loop; then pricing + UI.
