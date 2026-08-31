# MOBA GAME-SIDE IMPLEMENTATION BRIEF — NAVAL + AIRSHIP (three-layer maps)

**To: MOBA BattleEngine RAW (3D client + render/obfuscation) · cc EF Moba (Network — server items
marked [NET]).** From: CF ParcelMap Design Agent, 2026-08-31. Owner-directed
("full brief on what they need to implement from game side").

Canon + contract: `docs/briefs/NAVAL-AIRSHIP-THREE-LAYER-MAPS.md` (doctrine, owner-locked combat
rulings §6) · `docs/briefs/BATTLEFIELD-SCHEMA.md` v30/v31 addendum (data shapes) ·
`docs/coord/MOBA-CF-COORD.md` (Q&A — append questions there).
**Map data is DELIVERED (authority genVersion 31+): every artifact already carries everything
below.** Testbeds: `siege-test` (1 NORMAL pad, moat), estate `1101100` Bastion of Dominus (2
IMPERIAL seas, 3 piers, pads), estate `1001178` Grand Exchange (harbour, pier, N naval approach).

---
## 1. THE DOCTRINE IN ONE PARAGRAPH

Every battle map has three traversal planes. **L0 GROUND** — unchanged (walk mask + structures).
**L−1 WATER** — a per-cell depth grade: SHALLOW (wade band; water pets stand and fight here),
DEEP (NORMAL/LARGE hulls + water pets — a moored ship is a floating fortress), OCEAN
(edge-connected big water — the only grade an IMPERIAL carrier occupies). **L+1 AIR** — airships
and flying pets; **airships never attack from the air — they must LAND at a marked pad** (or
moor/beach, sea-side) and unload troops who then fight normally. Reinforcements can ARRIVE
mid-battle by sea or air, exactly like the existing land-march edge arrivals (decision 11).

## 2. DATA YOU CONSUME (all shipping now — read, never re-derive)

| Field | Shape | Meaning |
|---|---|---|
| `terrain.water` | base64 Uint8, G×G (same grid as `cells`/`walk`) | 0 none · 1 SHALLOW · 2 DEEP · 3 OCEAN |
| movement masks | derive | land-walk = `walk` (unchanged; ALL water blocked for land units) · SWIM = `water>0` (water pets only in DEEP; flyers overfly everything) · SAIL = `water≥2` (NORMAL/LARGE hulls) · SAIL_IMPERIAL = `water==3` |
| `structures[]` kind `LANDING_PAD` | `{anchorId:"landing_pad_N", blocking:"NONE", r, x, z, flat:true, markers:"HELI_RING", class:"HEAVY"\|"NORMAL"\|"LIGHT", plaza?}` | where airships may land. HEAVY r26 seats LARGE hulls, NORMAL r16 the standard hull, LIGHT r12 scouts only. `plaza` = painted on street paving. Estates only; single parcels have none. Guaranteed ≥45u from the keep, ≥30u from every buildable spot (no kill-box), clear walkable ground. |
| `structures[]` kind `PIER` | `{anchorId:"pier_N", blocking:"NONE", x, z, r:3, dir:[dx,dz], len, walkable:true}` | the sea unload point: shore anchor, `dir` points shore→deep, `len` = plank length. **The plank is walkable** — make its strip traversable over the water (the one exception to "water blocks land units"). One per arrivable sail region. |
| `meta.approaches` | `{naval:["N","E"...], air:["N","S","E","W"]}` | edges a fleet can enter from (+z = NORTH). Air is always all four. |
| `meta.sailRegions` | `[{cells, edge, draft:"NORMAL"\|"LARGE"\|"IMPERIAL"}]` | per water body: which hull classes fit. |
| `meta.sizeClass` | `"SMALL"…"EPIC"` when estate | drives pad ladder; absent = single parcel (no pads, no airship participation). |

Headless truth: `map-service/maps/traverse.js` `runNavalAudit(artifact)` is the reference sim —
CI guarantees every arrivable region has a beachhead + pier, every pad/pier marches to the heart.

## 3. RENDERING (BattleEngine RAW owns)

1. **Water depth read:** SHALLOW = current light band; DEEP noticeably darker; OCEAN darkest with
   swell. `preview3d.html` is the reference (its per-body depth tint already reads right — match
   it, driven by `terrain.water`, not your own shore distance).
2. **Landing pads:** flat marked circle — apron disc + white ring + "H", scaled by `r`; `plaza`
   variant sits on paving. NEVER a solid blob; ground stays walkable when no vessel is seated.
   Reference implementation already in `preview3d.html`.
3. **Piers:** timber plank from `(x,z)` along `dir` for `len`, ~3u wide, low posts into the water.
   Walkable surface (see §4.2).
4. **Vessels:** REUSE the composed voyage hulls (`build/voyage/vessel.js` — ship, and airship =
   same hull winged; lava barge remap exists). No GLBs needed. Classes: NORMAL = as built
   (deck 14×34u); LARGE ≈ 2× scale-up of the same composition; IMPERIAL = parcel-scale carrier —
   compose bigger (multi-deck, launch bays); it only ever appears in OCEAN water or off the map
   edge, so LOD can be generous.
5. **Arrival telegraphs:** an approaching airship must be SEEN and HEARD before it lands (dread
   telegraph); a fleet appears at its `approaches.naval` edge and visibly sails in.

## 4. SYSTEMS (RAW where in-match, [NET] where authoritative)

1. **[NET] Movement masks** from §2 — water pets path on SWIM (deep allowed for them alone;
   flyers ignore terrain), hulls on SAIL per their class/draft, land units on `walk` only.
2. **[NET] Pier walkability:** the pier strip (from anchor along `dir`, `len` × ~3u wide) is
   walkable ground for land units — add it to the collision field at load.
3. **[NET] Sea arrival flow:** fleet enters at a naval approach edge in DEEP/OCEAN → sails to
   its target sail region → unloads EITHER at the pier head (fast, single-file chokepoint —
   contestable) OR by beaching: stops at the deep edge, troops wade the SHALLOW band ashore
   (slower, spread out, exposed while wading). The anchored flagship stays as a floating-fortress
   spawn/rally, exactly like a land edge-arrival creates a new lane (decision 11).
4. **[NET] Air arrival flow:** airship enters any edge → flies to a free pad of sufficient class
   (HEAVY ≥ LARGE hull etc.; singles = no pads = airships cannot join) → descends → unloads over
   several seconds → lifts empty (or is destroyed on the ground). **No hover-drop v1** (owner has
   not granted it — pad or nothing).
5. **Vulnerability windows (owner-locked):** airborne airships CAN be hit — by FLYING pets and
   ARCHERS (arrows reach the sky; map guarantees no buildable tower overlooks a pad). Descent +
   unload = maximum exposure. Ships in DEEP water can be hit by SIEGE-class range only — archers
   are too short. Everything HP'd, original-game style: **NORMAL ship ≈ CC-class HP (a bit
   more); LARGE "almost impossible to take down"; IMPERIAL beyond that** (⚙ propose NORMAL 1.2×
   CC · LARGE 4× · IMPERIAL 20×; tune with CF).
6. **Pets vs structures:** water pets (from SHALLOW/DEEP) and air pets damage STRUCTURES too —
   plain range rules, no immunity flag: if the wall/tower is in attack range from the water or
   air, it takes damage. A seaside wall is a real front.
7. **[NET] Imperial carrier:** never lands, never enters non-OCEAN water; acts as an offshore
   spawn that LAUNCHES NORMAL hulls (sea) or scout/normal airships (sky) on a cadence; its deck
   is a future battlefield of its own (out of scope now — just don't hard-code "vessels are
   small").
8. **Command:** naval/air battles use the SAME command/hero model and slot/fee ladder as land
   battles (decisions 15/16) — no separate naval command system.
9. **Anti-grind:** all vessel/unload pathing obeys `UNIT-PATHING-FALLBACK-SPEC.md` (fallback
   directive chain + 1.5s watchdog) — no ship nosing a sandbar forever, no troops wading into a
   cliff.

## 5. ACCEPTANCE (owner-visible)

- Siege-test: an airship flies in, lands on the pad NE of the castle, unloads a squad that
  marches to the gate; archers on the wall shoot at it during descent.
- Bastion of Dominus: a fleet enters from N/E/W ocean, one ship moors at each pier, troops file
  down the planks; a beached landing wades ashore where no pier is; water pets close through the
  shallows and strike the waterline wall.
- Grand Exchange: harbour arrival from the N edge; the pier by the road becomes the fight's
  chokepoint.
- Nothing ever grinds: every landed/beached unit visibly re-routes or fights, never wall-cycles.

## 6. OUT OF SCOPE (later phases)

Fleet-vs-fleet SEA arenas + deck boarding (N2), imperial deck battlefields, the HS2↔HS3 sky-war
theater (N3), CF-side land-control gating of vessel access (CF Overworld owns; the map data is
already class-aware).
