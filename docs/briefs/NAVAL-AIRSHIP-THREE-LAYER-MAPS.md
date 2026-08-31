# NAVAL + AIRSHIP BATTLES — THE THREE-LAYER MAP DOCTRINE (planning brief, 2026-08-31)

**Status: N0 (map-data groundwork) BUILT + SHIPPED same day — GEN_VERSION 30:** `terrain.water`
depth channel (SHALLOW/DEEP/OCEAN, deep centerlines where water cuts through), `LANDING_PAD`
anchors on all estates (HEAVY r26 / NORMAL r16 / LIGHT r12 + plaza pads for walled cities; singles
none), CI R-LAYERS/R-PADS (sweep 1,485 checks), preview3d renders pads (apron+ring+H) — verified
on siege-test. Contract text: `BATTLEFIELD-SCHEMA.md` v30 addendum. N1+ remain plans.

**VESSEL CLASS LADDER (owner 2026-08-31): NORMAL · LARGE · IMPERIAL.** Normal = the composed
voyage hull (`build/voyage/vessel.js`, deck 14×34u, airship = same hull winged, span ≈36u — no
GLB, composed primitives). Large ≈ 2× (pads r26 / piers only). **IMPERIAL = parcel-scale — an
aircraft-carrier fortress that LAUNCHES normal ships/airships and never lands or enters rivers:**
sea-side it holds OCEAN-grade water (`water==3`), sky-side the map edge; its deck is itself a
future battlefield artifact (a battle can be fought ON an imperial ship). Sizes/economics ⚙ open.

## 0. Owner directives (2026-08-31, verbatim intent)

1. "Start planning how water naval battle works — in the MOBA game we had travel mode with a hero
   on the boat; can we use similar boats. We also need airships."
2. "Sometimes the enemy can arrive on ships or airships — so build **all maps with 3 layers**:
   **deep waters**, where it's like a **floating fortress**; then **low water** (what we already
   have) where **water-type pets or other pets** can get to and attack; and **flying airships**
   which can be in the air but **need to LAND to attack**. These are map design elements on WHERE."
3. "Boats and airships can possibly land on the map."
4. "Airships land on **specific locations near water, or open areas — think HELIPADS (wide areas
   with markers)**. Only **small–medium lands (estates)** have these; **single parcels don't**."

## 1. What already exists (build on it, don't reinvent)

| Piece | Where | What it gives us |
|---|---|---|
| **VOYAGE/VESSEL system** (the "travel mode with a hero on the boat") | MOBA repo `TRAVEL_SYSTEM.md` | Walkable **deck-as-moving-platform** (pitch/roll, friction, slide, OVERBOARD), SHIP + AIRSHIP vessel classes, wind-bent ballistics, weather FX, **pirate boarding = a fight on a deck**. The boats exist — we reuse them. |
| **NAVAL battle canon** | `docs/04` §7 NAVAL + `docs/03` | `SHIP` unit (hulls, `SHIP_CAPACITY` 200), `MARINE` (fights on decks *and* beaches), fleets, **blockades of `HARBOR`s**, "embarked land units sink with their transports". |
| **Sea route canon** | Hunt route canon §4b | **Any SEA_PORT pair is a legal voyage leg.** Ports/harbours already exist as POIs in the world fields; towns are port-like (decision 20). |
| **Airship route canon (LOCKED)** | `zone-registry.json zoneLinks` + `SKY_EXPANSION.md` | Surface→**HS1 Aeropolis (Gate to Heaven)**→branch HS2 *or* HS3; no surface→HS2/HS3 shortcut; HS2↔HS3 = the **War of the Sky Throne** (`warFront:true`) — explicitly flagged as **future CF battle content**. Airship-fall rule: over sea → water; **over land → you die**. |
| **Water on battle maps today** | `schema.js` `T.WATER` (blocked), R-LAND shore shelves (wade→swim ≥6u), Battlefield-JSON water footprints | The **"low water" layer the owner references** — exists visually + as blocked ground; no depth distinction yet. |
| **Rosters** | `data/PETS_ROSTER.csv` | **24 flying pets**, Tide-element water giants (Ruffski, Watuber, Onchor, Kelpony…) — the units for the two new layers already exist. |
| **Arena law** | decision 5b/4g | Every battle = the FIXED ±161 arena; parcel size scales counts, never the frame. Naval arenas obey this too. |

## 2. THE THREE LAYERS (the doctrine — who can be where)

Every battle map gains two traversal planes around the existing ground plane:

| Layer | Terrain | Who operates there | Attacks |
|---|---|---|---|
| **L+1 AIR** | open sky above the arena | **airships** (transports, NOT gunships), flying pets | Airships **cannot attack from the air — they must LAND** (owner rule). Flying pets may engage air-to-ground per their kit. |
| **L0 GROUND** | land + **SHALLOW water** (the wade band we already have) | all land units, heroes; **water pets may enter shallow water and attack from it** — a flanking lane walls don't cover | normal combat; shallow water = the amphibious approach lane |
| **L−1 DEEP WATER** | new depth class beyond the shallow band | **ships** (each a walkable deck = a **FLOATING FORTRESS**: spawn point, archer platform, cargo hold) + **water-type pets** | ships bombard/land troops at the shore; only water pets or an enemy navy can reach a ship in deep water |

**The floating fortress reading:** a ship anchored in deep water is a base land units simply cannot
touch — the naval mirror of a castle. Counterplay is layer-native: your own fleet, or water pets.
Airships are the mirror in the sky — untouchable while flying, **but they must come down to matter**,
and while landing/unloading they are exposed. Both new layers trade power for a vulnerable
transition through L0.

## 3. Map data design (CF ParcelMap deliverables)

### 3a. Water depth — additive, never breaking
Keep `T.WATER` cells + the walk mask exactly as they are (land units: water = blocked). Add a
parallel base64 channel:

```
terrain.water : per-cell 0 = none · 1 = SHALLOW · 2 = DEEP     (base64 Uint8, same G×G grid)
```
- Derived deterministically: shore-distance + the heightfield (same machinery as the mosaic's
  quantized shallows bands + R-LAND's ≥6u wade shelf). SHALLOW ≈ the first ~6–10u off every shore;
  DEEP = the rest of any water body that is big enough (small ponds stay all-shallow — no
  battleship in a duck pond).
- Three derived masks fall out for engines (documented, never shipped — derivable from `water` +
  `walk`): land-walk (today's mask), **swim** (shallow+deep, water pets), **sail** (deep only).
- Renderer: deep water = darker band (the mosaic already paints this distinction; the 3D preview
  gains one darker water material).

### 3b. New anchors (structures/markers)
| Anchor | Placement rule | Who uses it |
|---|---|---|
| **`PIER`** (boat landing) | shore points where a road/route meets water, at harbours, and ≥1 per coastal map edge with deep water; walkable plank from shore into SHALLOW ending at DEEP | ships moor here to unload without beaching; defenders can contest the plank |
| **`LANDING_PAD`** (the helipad) | **wide flat OPEN circle (r ≈ 10–12u) with painted markers**; kept clear like a gate apron (no props/builds). **Estates only — single parcels get NONE** (owner rule 4). Count by class: SMALL/MEDIUM 1 · LARGE 2 · GIANT 3 · EPIC 4 (⚙, proposal) — near the harbour/keep where the field affords it | airships must land here (or hover-drop at heavy penalty — open question §6) |
| **`NAVAL_APPROACH`** (spawn zone class) | every map edge whose border touches DEEP water | where an arriving enemy fleet materializes — the sea version of the decision-11 edge-arrival rule |
| **`AIR_APPROACH`** (spawn zone class) | any sky edge — airships enter from the map edge matching their overworld approach bearing | arrival vector for airborne reinforcements |

### 3c. Arrival flows (the "enemy can arrive on ships or airships" encounter)
Mirrors decision 11's land-arrival canon (armies enter at the matching edge and their soldiers
create a new edge spawn = a NEW LANE — never an instant dump):

- **BY SEA:** the fleet appears at a `NAVAL_APPROACH` edge in deep water → sails to bombardment
  range → either seizes a `PIER` (fast unload, contestable chokepoint) or **beaches at a SHALLOW
  band** (slow unload, units wade — vulnerable). The anchored flagship stays offshore as the
  floating-fortress spawn: the attacker's edge-lane, waterborne.
- **BY AIR:** the airship enters at an `AIR_APPROACH` edge → flies (untouchable, visible, audible —
  a dread telegraph) → **must descend onto a `LANDING_PAD`** → vulnerable during descent + unload →
  lifts off empty or stays as a capturable ground structure. On single parcels (no pads) airships
  **cannot participate** — sky arrivals are estate-battle content, exactly per the owner's rule.
- **Water-pet flank:** water pets swim the deep, close through the shallow band, and attack
  anything in reach of the waterline — the un-walled flank every coastal castle must now respect.

### 3d. Naval-vs-naval arenas (fleet battles at sea)
A NAVAL battle (docs/04 trigger: hostile fleets meet at sea / blockade assault) gets a **SEA
battlefield**: the same ±161 arena, `water` nearly all DEEP, dealt islands/reefs/sandbars as the
obstacle layer (the sea's rocks-and-forests), wind as a field modifier (reuse the VOYAGE wind).
Ships are the units-that-are-platforms; boarding = the pirate-boarding fight the MOBA already has,
on a pitching deck. Harbour assaults use the existing **harbour POI parcels** (already in every
LARGE+ castle estate's `heroParcels[]`) with the new water channel making the harbour actually
navigable.

### 3e. Strategic layer (CF Overworld sim, unchanged canon)
Marches by sea = SEA_PORT-pair legs; blockades close harbours per docs/04. Airships move ONLY on
`zoneLinks` airship ways (surface→HS1→branch) — no free flight between surface zones; the
HS2↔HS3 war front becomes the first airship battle theater when the sky fields are authored.
Decisions 15/16 (live battles scarce, command bought at march time) apply to naval/air battles
unchanged.

## 4. Work split

| Agent | Owns |
|---|---|
| **CF ParcelMap (me)** | `terrain.water` depth channel + derivation; PIER/LANDING_PAD/approach anchors + generation rules + CI (pads only on estates, pads clear + flat, every DEEP region reachable by SAIL from an approach edge — the naval R-REACH-ALL); SEA arena generator; harbour-parcel water pass; preview3d water/pad rendering; BATTLEFIELD-SCHEMA.md delta |
| **EF Moba (Network)** | VESSEL as a networked unit-platform in battles (it exists for travel); arrival flows (sea/air) server-side; sail/swim/land movement masks from the artifact; landing/unload vulnerability windows |
| **MOBA BattleEngine RAW** | reuse travel-mode boat + airship models/decks in battle scenes; landing-pad markers; deep-water material; boarding camera |
| **CF Overworld eco** | NAVAL march legs (SEA_PORT graph), blockade sim, SHIP/MARINE draft economics, airship zoneLink moves |

## 5. Phasing (proposal)

- **N0 — data groundwork (map-side, cheap, unblocks everyone):** `terrain.water` channel + derived
  masks; LANDING_PAD/PIER anchors on estates; schema doc + CI. No engine change needed to ship.
- **N1 — arrivals:** enemy fleets/airships as arrival vectors on existing coastal/estate battles
  (the owner's "encounter"). Sea beachhead + pad landing flows.
- **N2 — fleet battles:** the SEA arena + boarding; harbour assault + blockade wiring.
- **N3 — sky war:** airship battles proper on the HS2↔HS3 war front (waits for sky fields).

## 6. Open questions for the owner (do not decide unilaterally)

1. **Landing-pad ladder:** SMALL/MEDIUM 1 · LARGE 2 · GIANT 3 · EPIC 4 — good? And confirm LARGE+
   estates DO have pads (the "small–medium" line read as "estates yes, singles no").
2. **Hover-drop:** may an airship unload WITHOUT a pad (rope-drop: slow, units take fall risk,
   ship exposed) — or is no-pad = no-landing, hard rule?
3. **Can airships be attacked while airborne** by flying pets / archer ports, or only during
   descent/unload?
4. **Ship durability:** can shore units (archers/siege modules) hit ships in deep water at all, or
   is the floating fortress truly land-immune (only navy/water-pets counter)?
5. **Naval command mode:** does a fleet battle count against the same command-slot/fee ladder
   (decision 16) as land battles? (Recommended: yes, one system.)
6. **Water-pet shallow attack:** may they hit STRUCTURES (walls/towers at the waterline) or only
   units — i.e., is a seaside wall safe from pet siege?

*Cross-team relay: `docs/coord/MOBA-CF-COORD.md` 2026-08-31 entry. Boats/airships themselves =
travel-mode reuse, confirmed against the MOBA's `TRAVEL_SYSTEM.md` + `SKY_EXPANSION.md`.*
