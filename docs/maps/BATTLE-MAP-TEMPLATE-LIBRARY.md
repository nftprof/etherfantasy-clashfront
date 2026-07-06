# Clash Front — Battle-Map Template Library (Battlefields)

> **Design input for the map-maker session** that owns the procedural generator
> (`map-service/maps/*`, `docs/briefs/MAP-GENERATOR.md`, `docs/briefs/BATTLEFIELD-SCHEMA.md`).
> This document + its companion **[CASTLE-TEMPLATE-LIBRARY.md](./CASTLE-TEMPLATE-LIBRARY.md)**
> turn the generator's archetype set from **7 → ~48** by grounding every template in a REAL
> game map/archetype or a REAL historical place/battle. No template is invented from nowhere.
>
> Battlefields: **24 templates** (open-field / terrain maps), below.
> Castles: **24 templates** in the companion doc (siege / estate "final component" maps).
>
> Author: Clash Front Overworld design session, 2026-07-06. Sources cited inline.

---

## 1. Methodology & how templates map to the A1 schema

**What a template is.** Each template is a *design recipe*: a real-world tactical shape distilled
into (a) the nearest existing generator **archetype** (or a flagged **NEW ARCHETYPE**), (b) concrete
**PARAM_SPACE** values (`map-service/maps/schema.js`), (c) a **feature-DSL** sketch, and (d) explicit
**A1 Battlefield-JSON** hints (lanes, cores, obstacle footprints, spawns) in the **fixed ±161 frame**.

**The frame (locked — `docs/briefs/BATTLEFIELD-SCHEMA.md`).**
- FIXED arena: half-edge **±161 world-units**, `sizeM = 322`, origin at **CENTER (0,0)**, `x` = east,
  `z` = north (**+z = up-screen**). Coordinates are dimensionless world-units, **consumed as-is**.
- **blue/ATTACKER = SW (−,−); red/DEFENDER = NE (+,+).** Canonical spawns at **±131.6**, cores at
  **±114.8**. A single-lane battle can be read either as the SW→NE diagonal (default here) or the
  N–S axis the schema example uses (`spawn_atk_s (0,−131.6)` → `anchor_cc (0,+114.8)`); both are
  valid — a template's `spawnZones`/`lanes` fix which. Estates fight as a **SERIES of standard ±161
  component battles** (canon decision 4): parcel size scales army/structure/component COUNT, **never
  arena size**, so every template below is a single ±161 component.
- **Invariants (must hold):** every spawn edge keeps a min-width corridor to its base; every lane is
  pathable end-to-end; all nodes on walkable ground; base clear-radius; deterministic. The generator
  auto-repairs (carves corridors, moves nodes) — so a template may *bias* toward chokes/mazes
  aggressively; the validator guarantees it never actually seals a spawn.

**Existing generator vocabulary (do not re-derive — reuse).**
- `ARCHETYPES` = `openSteppe, forestMaze, riverCrossing, boxCanyon, cliffTerraces, marshCauseways, ridgePasses`
- `PALETTES` = `verdant, autumn, volcanic, tundra, desert, swamp, ashen, sakura`
- `LANDMARKS` = `NONE, STANDING_STONES, RUINED_TOWER, CRATER_LAKE, ANCIENT_BRIDGE, SHIPWRECK, GIANT_SKULL, OBELISK`
- `MODES` = `DUEL` (2 opposed bases), `SIEGE` (1 defender holds centre vs edge attacker),
  `CLASH` (4 per-edge, last-standing), `DOMINION` (4 per-edge, hold-centre), `GUARD` (PvE, waves).
- Feature DSL (`FEATURE_SPECS`, coords **normalized −1..1**): `forestPatch, rockPatch, waterPool,
  clearing, riverBand{axis,at,width,fords}, ridge{x1,z1,x2,z2,passes}, road, landmarkAt, resourceAt,
  mobCampAt, towerAt`. Max 24 features; radii are arena-fractions 0.02–0.3.
- `PARAM_SPACE`: `archetype, palette, landmark, laneCount 1–3, density 0–1, waterLevel 0–1,
  resourceNodes 0–8, resourceRichness 0–1, mobCamps 0–6, towers 0–6, barriers 0–4, roughness 0–1,
  mirrorFair bool`. Investment tiers 0–5 cap the budgeted counts.

Where a template needs geometry the 7 archetypes can't express, it is flagged **`NEW ARCHETYPE:
<name>`** with the one-line generation strategy — these feed §4 (implementation appendix) and the
companion doc's castle archetypes.

---

## 2. Battlefield archetype taxonomy (the design axes)

Every battlefield is a point in this space. Templates below are chosen to span it.

| Axis | Range / values | What it controls |
|---|---|---|
| **Symmetry** | mirror-fair · asymmetric-attacker · asymmetric-defender · 4-way radial | PvP fairness vs scripted-terrain drama (`mirrorFair`) |
| **Lane count** | 1 (defile/duel) · 2 (opposed push) · 3 (estate/MOBA) · radial (4-edge) | `laneCount`; reinforcements always add an edge lane |
| **Chokepoint type** | none (open) · single defile · ford/bridge · pass-through-wall · gate/barbican · maze | where force concentrates; drives `barriers`, ridges, water |
| **High ground** | flat · one dominating hill · escarpment/ridge line · terraces · pit/basin (inverted) · plateau | elevation advantage; `cliffTerraces`, ridges, heightField |
| **Water** | dry · single river (fordable) · lake/coast edge · marsh (causeways) · tidal · frozen (hazard) | `waterLevel`, `riverBand`, WATER footprints |
| **Cover density** | bare · scattered · patchy woods · dense forest maze · urban rubble | `density`, `roughness`, forest/rock scatter |
| **Objective / mode** | DUEL · SIEGE · CLASH · DOMINION · GUARD | who spawns where + win condition |
| **Rarity landmark** | none · 1 landmark · spectacular (~1 in 50) | `landmark`, `landmarkAt` |

The 24 battlefields, at a glance:

| # | Template | Real source | Nearest / NEW archetype | Primary mode |
|---|---|---|---|---|
| B1 | The Hot Gates | Thermopylae, 480 BC | **NEW coastalDefile** | DUEL |
| B2 | Envelopment Plain | Cannae, 216 BC | openSteppe | CLASH / DUEL |
| B3 | The Muddy Funnel | Agincourt, 1415 | **NEW woodedFunnel** | DUEL |
| B4 | Ambush Gauntlet | Teutoburg, 9 AD | **NEW forestDefile** | GUARD / DUEL |
| B5 | Rubble City | Stalingrad, 1942–43 | **NEW urbanRubble** | CLASH / DUEL |
| B6 | The Shield Ridge | Hastings/Senlac, 1066 | **NEW ridgeEscarpment** | SIEGE / DUEL |
| B7 | Chariot Flats | Gaugamela, 331 BC | openSteppe (desert) | CLASH / DUEL |
| B8 | The Great River | Red Cliffs / Chibi, 208 AD | riverCrossing | DUEL |
| B9 | Back-to-the-River | Jingxing (Han Xin), 205 BC | boxCanyon + river | DUEL |
| B10 | Broken Coulees | Little Bighorn, 1876 | **NEW brokenBadlands** | CLASH / GUARD |
| B11 | The Bottleneck | El Alamein, 1942 | **NEW desertBottleneck** | DUEL |
| B12 | Battle on the Ice | Lake Peipus, 1242 | **NEW frozenLake** | DUEL / CLASH |
| B13 | The Caldera | Vesuvius / Spartacus, 73 BC | **NEW volcanicCaldera** | SIEGE / GUARD |
| B14 | Lakeside Defile | Lake Trasimene, 217 BC | marshCauseways + ridgePasses | GUARD / DUEL |
| B15 | The Basin | Dien Bien Phu, 1954 | **NEW valleyBasin** | SIEGE / GUARD |
| B16 | The Bridge | Stirling Bridge, 1297 | marshCauseways + ANCIENT_BRIDGE | DUEL |
| B17 | Sea-and-Marsh Plain | Marathon, 490 BC | **NEW coastalPlain** | DUEL / CLASH |
| B18 | The Sphinx Field | Isandlwana, 1879 | openSteppe + landmark | CLASH / GUARD |
| B19 | Canopy Maze | Kohima / Petén jungle | forestMaze (jungle) | CLASH / GUARD |
| B20 | The Open Steppe | Kalka / Legnica (Mongol) | openSteppe | CLASH / DUEL |
| B21 | Sky Plateau | Roraima tepui (Venezuela) | **NEW skyPlateau** | DUEL / DOMINION |
| B22 | The Underworld | Derinkuyu / Cu Chi | **NEW cavernWarren** | GUARD / CLASH |
| B23 | No-Man's-Land | The Somme, 1916 | **NEW trenchLine** | DUEL |
| B24 | The Terraces | Ollantaytambo / Inca andenes | cliffTerraces | SIEGE / DUEL |

---

## 3. The 24 battlefield templates

> Per template: **Real source · Tactical concept · Layout (±161 coords) · Generator params · A1
> notes · Recommended MODE(s) · Biome/palette fit.** Coordinates are world-units in the fixed frame;
> normalized (−1..1) feature-DSL coords in parentheses where useful.

---

### B1 — The Hot Gates
**Real source.** The pass at **Thermopylae, 480 BC** (Greek phalanx vs Persia) — a sliver of coast
pinned between the Malian Gulf and the Kallidromo cliffs; the "middle gate" was a few dozen metres
wide. The canonical narrow-defile archetype.
**Tactical concept.** A small force negates a numeric advantage by forcing the enemy through a
frontage only a handful of units wide, denying envelopment. Whoever holds the throat wins on
attrition. The "goat path" flank (Anopaea) is the design's one shortcut — a barrier-gated bypass
that, when broken, unlocks a second, punishing lane.
**Layout.** A **hard cliff wall along the NW** (footprint from `[-161,20]` sweeping to `[40,161]`)
and **impassable water along the SE** (footprint `[-161,-40]`→`[20,-161]`) squeeze a single
**diagonal corridor ~24 units wide** from the attacker's SW spawn to the defender's NE core. Choke
narrowest at centre `(0,0)` (~16 units). A **barrier-gated goat path** (BOULDER_PILE) hugs the far
NW behind the cliff: breaking it opens a thin second lane arriving at the defender's rear edge.
**Generator params.** **NEW ARCHETYPE: `coastalDefile`.** `{archetype:"coastalDefile", palette:"verdant",
landmark:"RUINED_TOWER", laneCount:1, density:0.25, waterLevel:0.55, resourceNodes:1,
resourceRichness:0.3, mobCamps:0, towers:2, barriers:1, roughness:0.4, mirrorFair:false}`.
Features: `waterPool` band SE, `ridge`(cliff) NW `{x1:-1,z1:0.1,x2:0.25,z2:1,passes:1}`,
`road` down the throat, `landmarkAt(0.6,0.6)` (the tower on the far gate).
**A1 notes.** One lane `[[-131.6,-131.6],[-40,-30],[0,0],[40,30],[114.8,114.8]]`. Cliff + water as
`passable:false` footprints forming the walls. Defender TOWER pair flanking the throat at
`(±14, 8)`; CORE at `(114.8,114.8)`. Barrier (`kind:"BOULDER_PILE"`) at `(-120,110)` opening a rim
lane. Attacker spawn `(-131.6,-131.6)`.
**Recommended MODE(s).** **DUEL** (last-stand hold); GUARD works for a wild pass held by monsters.
**Biome/palette.** `verdant` (Greek coast) or `tundra` for a mountain-gate reskin.

---

### B2 — Envelopment Plain
**Real source.** **Cannae, 216 BC** (Hannibal's double envelopment of Rome) — a broad flat plain by
the Aufidus river where a deliberately weak centre bowed back and the wings wheeled inward to encircle.
**Tactical concept.** Open ground with **no chokes** rewards manoeuvre and flank timing over position.
A single river-anchored flank (the Aufidus) stops one side from being turned, funnelling the fight
into a wide crescent. The template is the generator's showcase "field battle": armies actually
collide, and the wider-frontage army can wrap the line.
**Layout.** Almost entirely **open** in the central `±110`. A **river along the far SE edge**
(footprint hugging `[161,-161]`→`[40,-161]`) is an un-turnable flank. Two shallow **rise features**
(passable, cosmetic high-ground via `heightField`) at `(-60,60)` and `(60,-60)` give wings a lip to
form on. Scattered brush only.
**Generator params.** `openSteppe`. `{archetype:"openSteppe", palette:"autumn", landmark:"NONE",
laneCount:2, density:0.2, waterLevel:0.25, resourceNodes:3, resourceRichness:0.5, mobCamps:0,
towers:1, barriers:0, roughness:0.5, mirrorFair:true}`. Features: `riverBand`(SE flank, no fords —
it's an edge), light `forestPatch` scatter, `clearing(0,0,0.35)` to guarantee the collision heart.
**A1 notes.** Two mirrored lanes bowing through centre; wide `spawnZones` (frontage matters). CORE
attacker `(-114.8,-114.8)`, defender `(114.8,114.8)`. Keep obstacle density low so wrap-around
pathing exists. `mirrorFair:true` for PvP.
**Recommended MODE(s).** **CLASH** (multi-army melee) or **DUEL**.
**Biome/palette.** `autumn`/`verdant` grassland; `desert` reskin → doubles as B7.

---

### B3 — The Muddy Funnel
**Real source.** **Agincourt, 1415** — a narrowing ploughed field, **soaked to mud**, between the
woods of Agincourt and Tramecourt; the English drew the French into a shrinking frontage where mud
and stakes broke the charge.
**Tactical concept.** A **converging funnel**: two woodlines pinch the passable ground from a wide
attacker start to a narrow defender front, so the attacker's numbers can't deploy — the frontage
does the killing. Mud = a **slow-terrain band** (passable but movement-penalized) that blunts charges.
**Layout.** Two large **forest masses** on the flanks — NW block `(-90..-161, 0..120)` and SE block
`(60..161, -120..0)` — angled so the gap between them **narrows from ~120 units at the SW mouth to
~40 units at the NE throat** before the defender line. A **mud band** (SLOW terrain / passable WATER
décor) fills the central `z∈[-20,20]` stripe. Optional **stake line** (barrier) across the throat.
**Generator params.** **NEW ARCHETYPE: `woodedFunnel`** (a `forestMaze`/`openSteppe` hybrid with two
convergent forest walls). `{archetype:"woodedFunnel", palette:"autumn", landmark:"NONE", laneCount:1,
density:0.5, waterLevel:0.3, resourceNodes:2, resourceRichness:0.4, mobCamps:0, towers:2, barriers:1,
roughness:0.6, mirrorFair:false}`. Features: two `forestPatch` at `(-0.7,0.4,0.28)` and
`(0.6,-0.4,0.28)`, a `clearing` throat at `(0.5,0.5,0.12)`, a mud `waterPool`(passable) mid.
**A1 notes.** Single converging lane; the two forest footprints as `passable:false`. Defender TOWERs
at `(30,55)` and `(70,30)` bracketing the throat; CORE `(114.8,114.8)`. Barrier stake-line
(`FOREST_WALL`) at `(45,45)`.
**Recommended MODE(s).** **DUEL** (asymmetric-defender favoured).
**Biome/palette.** `autumn` (muddy Picardy autumn) — the signature look.

---

### B4 — Ambush Gauntlet
**Real source.** **Teutoburg Forest, 9 AD** — three Roman legions strung out on a track between
**bog and wooded ridge**, ambushed along a march corridor with no room to form line.
**Tactical concept.** A **linear gauntlet**: one long, kinked corridor through dense forest with a
**bog wall on one side and a ridge on the other**, studded with ambush pockets (mob camps / hidden
build-spots). The mover is punished for length; the ambusher owns the flanks. Prime **PvE GUARD** map.
**Layout.** A **serpentine road** from SW to NE that kinks three times: waypoints `(-131.6,-131.6)`,
`(-70,-100)`, `(-30,-20)`, `(20,40)`, `(80,90)`, `(114.8,114.8)`. **Forest walls** press both sides
of the road to ~20 units; a **bog** (impassable WATER) bulges into the NW at `(-40,60)`, a **rock
ridge** into the SE at `(40,-60)`. Ambush **mob camps** sit just off each kink.
**Generator params.** **NEW ARCHETYPE: `forestDefile`** (road-through-dense-forest with
ridge+bog flanks; distinct from `forestMaze`'s open scatter — this one gates to a single winding lane).
`{archetype:"forestDefile", palette:"verdant", landmark:"GIANT_SKULL", laneCount:1, density:0.75,
waterLevel:0.4, resourceNodes:1, resourceRichness:0.3, mobCamps:4, towers:0, barriers:2, roughness:0.7,
mirrorFair:false}`. Features: `road` polyline, `forestPatch` ×3 tight to it, `waterPool`(bog) NW,
`ridge` SE, `mobCampAt` at each kink, `landmarkAt(0.1,0.1)` (a skull cairn).
**A1 notes.** One kinked lane; forests + bog + ridge as `passable:false`. `mobs[]` 4 camps at kinks
(WILD). No towers (it's an ambush, not a hold). CORE at NE for the DUEL variant.
**Recommended MODE(s).** **GUARD** (wild-held gauntlet); **DUEL** for a player defile.
**Biome/palette.** `verdant`/`swamp`; `autumn` for a Germanic-forest gloom.

---

### B5 — Rubble City
**Real source.** **Stalingrad, 1942–43** — street-by-street urban attrition among collapsed
buildings; the front measured in rooms, not kilometres.
**Tactical concept.** **Dense hard cover in a grid** turns the map into interlocking chokes and
sightline pockets — the "urban maze." Movement is channelled by building footprints; every
intersection is a killbox; strongpoints (a fortified block) anchor defence. High cover density,
many short lanes rather than one.
**Layout.** A **loose grid of rectangular building footprints** (`passable:false` ROCK/rubble blocks
~24×18 units) leaving 12–16-unit "streets" between them across the whole field, offset so no straight
sightline crosses more than ~60 units. A **central strongpoint** (a cluster of blocks around a plaza
at `(0,0)`) is the DOMINION objective / defender redoubt. Rubble piles (passable-slow) soften some
streets.
**Generator params.** **NEW ARCHETYPE: `urbanRubble`** (grid of building footprints + streets +
central strongpoint; new because none of the 7 lays orthogonal hard-cover blocks).
`{archetype:"urbanRubble", palette:"ashen", landmark:"RUINED_TOWER", laneCount:3, density:0.8,
waterLevel:0.0, resourceNodes:2, resourceRichness:0.5, mobCamps:0, towers:4, barriers:2,
roughness:0.3, mirrorFair:true}`. Features: many `rockPatch` (blocks), `clearing`(0,0) plaza,
`landmarkAt(0,0)` (gutted tower), `road` streets on a grid.
**A1 notes.** 3 street-lanes weaving the grid; building blocks as `passable:false` footprints.
TOWERs = fortified corners; CORE = the central strongpoint `(0,0)` for SIEGE/DOMINION, else NE.
Keep at least two parallel streets per lane so pathing survives a barrier drop.
**Recommended MODE(s).** **CLASH** / **DOMINION** (hold the plaza); **DUEL** for a two-base push.
**Biome/palette.** `ashen` (ruined city) — signature; `tundra` for a winter-Stalingrad reskin.

---

### B6 — The Shield Ridge
**Real source.** **Hastings / Senlac Hill, 1066** — Harold's shield-wall held the crest of a ridge;
Norman cavalry had to charge **uphill** into it all day.
**Tactical concept.** **One dominating escarpment**: the defender holds a raised ridge line across
the map; the attacker must cross open ground and climb **ramps** (the only passable breaks in the
scarp) into prepared fire. High-ground advantage is the whole map. The feigned-retreat lure (Normans')
is emergent, not baked.
**Layout.** A **continuous escarpment (CLIFF) across the NE third**, running `(-120,60)`→`(120,120)`,
with **2–3 ramp passes** (ROAD gaps) at `(-40,80)`, `(30,100)`. The defender's line + CORE sit on
the **high side** (NE, `z>80`); the attacker crosses the **open lower field** (SW two-thirds) and
must funnel through the ramps. Optional marsh at the SW foot to slow the approach.
**Generator params.** **NEW ARCHETYPE: `ridgeEscarpment`** (single continuous scarp with a few ramp
gaps + a heightField step; `cliffTerraces` does *two parallel* bands — this is *one* asymmetric wall
dividing low attacker ground from high defender ground). `{archetype:"ridgeEscarpment", palette:"verdant",
landmark:"NONE", laneCount:2, density:0.25, waterLevel:0.2, resourceNodes:3, resourceRichness:0.5,
mobCamps:0, towers:4, barriers:1, roughness:0.5, mirrorFair:false}`. Features: `ridge`(the scarp)
`{x1:-0.75,z1:0.37,x2:0.75,z2:0.75,passes:2}`, `heightField` +8m on the NE side, `clearing` lower field.
**A1 notes.** 2 lanes each threading a ramp; scarp as `passable:false` CLIFF footprint broken by ROAD
cells at the ramps. Defender TOWERs crown the ramps `(-40,90),(30,110)`; CORE high at `(80,120)`.
Attacker spawn low `(-131.6,-131.6)`. heightField gives the visual + slope gate.
**Recommended MODE(s).** **SIEGE** (attacker-from-below vs held crest) or **DUEL**.
**Biome/palette.** `verdant` English downland; `tundra` alpine reskin.

---

### B7 — Chariot Flats
**Real source.** **Gaugamela, 331 BC** — Darius levelled a **wide desert plain** so his scythed
chariots and cavalry had open running room against Alexander.
**Tactical concept.** The **maximally open** template — a bare, near-featureless plain that maximizes
manoeuvre, flanking arcs, and cavalry-type unit value; terrain does *nothing*, so the fight is pure
army-vs-army. The generator's low-density floor / "clean field" reference.
**Layout.** Open across the entire `±140`. Only faint **dune swells** (passable heightField ripples)
and 2–3 lone **rock outcrops** as line-of-sight breaks near the edges. No water, no forest walls.
**Generator params.** `openSteppe` at desert. `{archetype:"openSteppe", palette:"desert",
landmark:"OBELISK", laneCount:2, density:0.1, waterLevel:0.0, resourceNodes:2, resourceRichness:0.4,
mobCamps:0, towers:1, barriers:0, roughness:0.4, mirrorFair:true}`. Features: 2 `rockPatch` near
corners, `landmarkAt(0,0.7)` obelisk waymarker, subtle `heightField` dunes.
**A1 notes.** 2 wide mirrored lanes; almost no obstacles (`passable:false` only the 2–3 outcrops).
COREs at the ±114.8 corners. Best PvP fairness reference (`mirrorFair:true`).
**Recommended MODE(s).** **CLASH** / **DUEL**.
**Biome/palette.** `desert` (signature); `tundra` for a frozen-plain twin.

---

### B8 — The Great River
**Real source.** **Battle of Red Cliffs / Chibi, 208 AD** (Three Kingdoms) — a decisive fight across
the **Yangtze**; the river is the axis, crossings and fire-ships decide it. (Also the generator's
existing `riverCrossing` in its most iconic form.)
**Tactical concept.** A **broad river bisects the map**; the only ways over are 2–3 **fords/bridges**
(chokes). Each side masses at a crossing; whoever forces one first gains the far bank. The river is
the great equalizer — it converts a frontal battle into a few decisive chokepoint fights.
**Layout.** A **wide WATER band along the mid-axis** (perpendicular to the SW→NE line, i.e. running
NW–SE through centre), width ~28 units, with **fords at `(-50,50)` and `(40,-40)`** (ROAD gaps) and a
central **ANCIENT_BRIDGE** at `(0,0)`. Attacker masses SW bank, defender NE bank.
**Generator params.** `riverCrossing`. `{archetype:"riverCrossing", palette:"verdant",
landmark:"ANCIENT_BRIDGE", laneCount:2, density:0.35, waterLevel:0.7, resourceNodes:3,
resourceRichness:0.5, mobCamps:0, towers:3, barriers:1, roughness:0.5, mirrorFair:true}`. Features:
`riverBand{axis:"z",at:0.5,width:0.09,fords:3}`, `landmarkAt(0,0)` bridge, `forestPatch` on both banks.
**A1 notes.** River as `passable:false` WATER footprint broken by ROAD fords + the bridge (passable).
2 lanes, each through a ford/bridge. Defender TOWERs guard the far ends of each crossing; CORE
`(114.8,114.8)`. A destructible bridge = a `PORTCULLIS`-class barrier at `(0,0)`.
**Recommended MODE(s).** **DUEL** (contest the crossings).
**Biome/palette.** `verdant`; `swamp` for a delta reskin.

---

### B9 — Back-to-the-River
**Real source.** **Battle of Jingxing (井陘), 205 BC** — Han Xin deployed **with a river at his back**
in a narrow pass, denying his own men retreat (背水一戰), then took the enemy camp. Canyon defile
that dead-ends against water.
**Tactical concept.** A **one-way canyon**: a walled pass opens into a pocket **backed by an
impassable river** — no retreat, no flank. The defender is pinned but the attacker must commit fully
through the throat. Classic "cornered lion" psychology as terrain.
**Layout.** **Box-canyon walls** (CLIFF) frame a corridor from the SW mouth; the corridor opens into
a **pocket at NE** whose far side is sealed by a **river/water edge** (`z>110` and `x>110`
impassable). The defender CORE sits with its back to that water at `(105,105)`; the only exit is back
through the throat at `(0,0)`.
**Generator params.** `boxCanyon` + river. `{archetype:"boxCanyon", palette:"ashen",
landmark:"CRATER_LAKE", laneCount:1, density:0.4, waterLevel:0.55, resourceNodes:2,
resourceRichness:0.5, mobCamps:1, towers:2, barriers:1, roughness:0.55, mirrorFair:false}`.
Features: canyon `ridge` walls, a `riverBand` sealing the NE corner, `clearing` pocket, `waterPool`.
**A1 notes.** Single lane through the canyon throat; CLIFF walls + a WATER edge behind the defender
as `passable:false`. Defender CORE `(105,105)`, TOWERs at the throat `(±14,4)`. No rear spawn edge
lane on the water side (validator still keeps the *throat* edge open).
**Recommended MODE(s).** **DUEL** (do-or-die).
**Biome/palette.** `ashen`/`desert` gorge; `volcanic` for a lava-backed twin.

---

### B10 — Broken Coulees
**Real source.** **Little Bighorn, 1876** — a maze of **coulees, ravines and grassy ridges** above a
river; broken ground fragmented Custer's command into isolated knots.
**Tactical concept.** **Fragmented terrain**: a lattice of low ridges and gullies breaks the field
into many small compartments, so a large force can't stay concentrated — sub-fights erupt in each
pocket. Good for CLASH (multi-army) and last-stand GUARD (a knoll redoubt).
**Layout.** Several **short rock/earth ridges** at scattered angles (`(-80,-40)`→`(-30,20)`;
`(20,-30)`→`(70,10)`; `(-10,60)`→`(50,90)`) with gully gaps between them; a **river along the far SW
edge**; a **dominating knoll** (heightField + clearing) at `(60,60)` as the "Last Stand Hill"
DOMINION point / GUARD centre. No single lane — the map is a compartment lattice.
**Generator params.** **NEW ARCHETYPE: `brokenBadlands`** (multi-ridge lattice + gullies + one knoll;
distinct from `ridgePasses`' single diagonal ridge). `{archetype:"brokenBadlands", palette:"desert",
landmark:"GIANT_SKULL", laneCount:3, density:0.55, waterLevel:0.3, resourceNodes:3,
resourceRichness:0.5, mobCamps:2, towers:1, barriers:0, roughness:0.8, mirrorFair:false}`. Features:
3–4 short `ridge` segments at varied angles, `riverBand` SW edge, `clearing`+`heightField` knoll,
`landmarkAt(0.37,0.37)`.
**A1 notes.** 3 loose lanes threading the gullies; ridges as `passable:false` ROCK footprints. CORE
/ DOMINION objective on the knoll `(60,60)`. `mobs[]` for the GUARD variant.
**Recommended MODE(s).** **CLASH** / **DOMINION** / **GUARD** (last stand).
**Biome/palette.** `desert`/`autumn` high-plains; `tundra` reskin.

---

### B11 — The Bottleneck
**Real source.** **Second El Alamein, 1942** — the front was pinned in a **~65 km gap between the
Mediterranean coast and the impassable Qattara Depression**; no flanking, only a frontal grind.
**Tactical concept.** **Both flanks are un-turnable** (sea one side, impassable salt-marsh/sink the
other), so a numerically inferior defender can hold a fixed line — the map *cannot* be flanked, only
punched through. A minefield belt (barriers) deepens the grind.
**Layout.** **Impassable WATER along the NW edge** (the "sea") and an **impassable marsh/depression
along the SE edge** (the "Qattara sink"), leaving a **central dry corridor ~180 units wide** spanning
SW→NE. A **minefield belt** of barriers (`FOREST_WALL`/`BOULDER_PILE`) runs across the corridor at
centre, with 2 cleared gaps. Dunes as passable heightField.
**Generator params.** **NEW ARCHETYPE: `desertBottleneck`** (dune plain with two impassable long
edges + a barrier belt; a `desert` `openSteppe` variant that adds the flank-sealing edges + belt).
`{archetype:"desertBottleneck", palette:"desert", landmark:"SHIPWRECK", laneCount:2, density:0.3,
waterLevel:0.35, resourceNodes:2, resourceRichness:0.4, mobCamps:0, towers:3, barriers:3,
roughness:0.5, mirrorFair:true}`. Features: `waterPool` NW edge, marsh `waterPool` SE edge,
barrier belt across mid (via `barriers`), `landmarkAt(-0.6,0.5)` (a wreck in the sand).
**A1 notes.** 2 lanes through the belt gaps; both long edges `passable:false`. Barrier line drops to
open a shortcut when broken. CORE `(114.8,114.8)`. `mirrorFair:true` (fair frontal PvP).
**Recommended MODE(s).** **DUEL** (frontal grind).
**Biome/palette.** `desert` (signature).

---

### B12 — Battle on the Ice
**Real source.** **Battle on the Ice, Lake Peipus, 1242** (Alexander Nevsky vs the Teutonic Order) —
fought on a **frozen lake**; the ice as a hazard is the folk-memory of the battle.
**Tactical concept.** A **frozen-water hazard field**: most of the map is passable ice, but marked
**thin-ice zones behave as slow/hazard terrain** (movement penalty, optional attrition), and the
**shoreline** gives firm footing. Heavy formations that bunch on thin ice are punished — terrain that
rewards spreading out. Novel because water here is *passable-with-hazard*, not a wall.
**Layout.** A broad **ice sheet** across the centre with **shore (firm ground) strips along SW and NE
edges** where the two bases sit. **Thin-ice patches** (hazard footprints, `passable:true` +
`hazard` flag) scattered mid at `(-40,20)`, `(30,-10)`, `(0,60)`. A cracked-ice **barrier** can drop
a chunk to impassable water mid-battle.
**Generator params.** **NEW ARCHETYPE: `frozenLake`** (passable water sheet + hazard patches + firm
shore bands; requires a new `hazard`/slow terrain code beyond the current BLOCKED set).
`{archetype:"frozenLake", palette:"tundra", landmark:"SHIPWRECK", laneCount:2, density:0.2,
waterLevel:0.8, resourceNodes:2, resourceRichness:0.4, mobCamps:0, towers:2, barriers:1,
roughness:0.4, mirrorFair:true}`. Features: full-field passable `waterPool` (ice), firm `clearing`
shore bands SW+NE, hazard patches, `landmarkAt(0,0)` (a frozen wreck).
**A1 notes.** 2 lanes over the ice to opposing shore CORES `(±114.8)`. Ice = décor WATER marked
walkable; thin-ice = a NEW hazard obstacle kind. Needs a terrain-code addition (see §4).
**Recommended MODE(s).** **DUEL** / **CLASH**.
**Biome/palette.** `tundra` (signature).

---

### B13 — The Caldera
**Real source.** **Vesuvius, 73 BC** — Spartacus and the rebels were besieged **on the volcano's
crater rim**, then descended the cliffs by vine ropes to strike the Roman camp below. A crater
redoubt with one guarded ascent.
**Tactical concept.** A **ring-fortress of terrain**: a circular caldera rim (CLIFF) with a single
guarded ascent path; whoever holds the rim holds a natural fortress, but is bottled up. Inverts the
usual "attack the centre" — here the strong point is a raised ring with a killable throat.
**Layout.** A **circular CLIFF rim** (radius ~90, centred `(0,0)`) with **one ascent gap** at the SW
(`(-60,-60)`) facing the attacker. Inside: a raised **crater floor** (defender CORE at `(0,0)`,
heightField high). Outside the rim: the lower approach where the attacker forms. Optional **lava
vents** (impassable hazard) dotting the outer slope.
**Generator params.** **NEW ARCHETYPE: `volcanicCaldera`** (ring cliff + single gap + raised interior;
a radial cousin of `boxCanyon`). `{archetype:"volcanicCaldera", palette:"volcanic", landmark:"OBELISK",
laneCount:1, density:0.45, waterLevel:0.0, resourceNodes:3, resourceRichness:0.7, mobCamps:2,
towers:4, barriers:1, roughness:0.6, mirrorFair:false}`. Features: ring `ridge`/cliff, `clearing`
crater floor, lava `waterPool`(hazard) on the slope, `landmarkAt(0,0)`.
**A1 notes.** One ascent lane SW→centre through the rim gap; rim as `passable:false` CLIFF ring
broken by one ROAD gap. Defender CORE + TOWERs on the rim throat. GUARD variant: mobs hold the rim.
**Recommended MODE(s).** **SIEGE** (take the crater) / **GUARD** (wild volcano).
**Biome/palette.** `volcanic` (signature); `ashen` reskin.

---

### B14 — Lakeside Defile
**Real source.** **Lake Trasimene, 217 BC** — Hannibal trapped a Roman column on a **road pinched
between the lake shore and hills**, in morning mist; a perfect linear ambush.
**Tactical concept.** A cousin of B4 but water-flanked: a **shore road** with the **lake (impassable)
on one side and wooded hills (mob camps) on the other** — the mover is caught between drowning and
ambush. Emphasis on GUARD/ambush; the "mist" is flavour (fog-of-war already handled by intel gate).
**Layout.** A **long WATER body along the SE** (footprint `[161,-40]`→`[-20,-161]`), a **road**
hugging its shore from SW to NE, and **wooded hills (FOREST + low ridge) on the NW** pressing the road
to ~20 units with ambush camps at `(-60,40)`, `(0,20)`, `(60,60)`.
**Generator params.** `marshCauseways` + `ridgePasses` blend. `{archetype:"marshCauseways",
palette:"verdant", landmark:"NONE", laneCount:1, density:0.55, waterLevel:0.7, resourceNodes:2,
resourceRichness:0.4, mobCamps:3, towers:0, barriers:1, roughness:0.6, mirrorFair:false}`. Features:
`waterPool`(lake) SE, `road` shore, `forestPatch`+`ridge` NW, `mobCampAt` ×3.
**A1 notes.** One shore lane; lake as `passable:false` WATER edge, hills as FOREST/ROCK. `mobs[]`
camps NW for GUARD. DUEL variant puts a defender CORE at the NE road end.
**Recommended MODE(s).** **GUARD** (ambush) / **DUEL**.
**Biome/palette.** `verdant` lakeside; `swamp` reskin.

---

### B15 — The Basin
**Real source.** **Dien Bien Phu, 1954** — the French dug into a **valley floor ringed by hills the
enemy held**; artillery from the surrounding high ground made the basin a trap.
**Tactical concept.** **Inverted high-ground**: the *defender is in the pit*, the *attacker owns the
rim*. A ring of surrounding heights (attacker firing positions / spawn arcs) looks down on a central
basin where the defender's CORE and strongpoints sit. Reverses B13. Brutal SIEGE/GUARD asymmetry.
**Layout.** A **raised rim (CLIFF/heightField high) around the whole perimeter** (`|x|>120` or
`|z|>120`), sloping down to a **flat central basin** (`±80`). The **defender CORE + satellite
strongpoints** ("Béatrice/Gabrielle"-style TOWER outposts) sit on the basin floor at `(0,0)`,
`(-50,40)`, `(50,-40)`. Attackers spawn on the rim on **multiple edges** and push down.
**Generator params.** **NEW ARCHETYPE: `valleyBasin`** (perimeter-high, centre-low bowl with
multi-edge attacker spawns; the geometric inverse of `boxCanyon`/`volcanicCaldera`).
`{archetype:"valleyBasin", palette:"verdant", landmark:"NONE", laneCount:3, density:0.4,
waterLevel:0.3, resourceNodes:4, resourceRichness:0.6, mobCamps:0, towers:5, barriers:2,
roughness:0.5, mirrorFair:false}`. Features: perimeter `ridge`/heightField high, `clearing` basin,
a stream `riverBand` across the floor, TOWER outposts via `towerAt`.
**A1 notes.** 3 descent lanes from rim edges to the basin CORE `(0,0)`; rim slope as heightField
(walkable but a firing lip) with a few `passable:false` crag footprints. Defender TOWER outposts
ring the CORE. Reinforcements naturally arrive on the rim (edge-enter rule fits perfectly).
**Recommended MODE(s).** **SIEGE** / **GUARD** (defender survives waves from every edge).
**Biome/palette.** `verdant` jungle valley; `tundra`/`ashen` reskins.

---

### B16 — The Bridge
**Real source.** **Stirling Bridge, 1297** — Wallace let the English cross a **narrow bridge over the
boggy Forth**, then struck when only part had crossed; the bridge + marsh were the battle.
**Tactical concept.** A **single hard chokepoint**: one narrow bridge over an otherwise impassable
marsh/river; the crossing rate is capped, so an attacker's force arrives piecemeal and can be beaten
in detail. The most extreme funnel after B1 — the whole map hinges on one 8–12-unit-wide span.
**Layout.** An **impassable marsh/river band across the middle** (NW–SE), crossed by exactly **one
ANCIENT_BRIDGE** at `(0,0)` (span ~10 units). Optional **fordable shallows** far to one flank as a
slow, punishing alternate (a barrier-gated bog path). Firm ground on both banks.
**Generator params.** `marshCauseways` (single causeway). `{archetype:"marshCauseways",
palette:"swamp", landmark:"ANCIENT_BRIDGE", laneCount:1, density:0.4, waterLevel:0.85,
resourceNodes:2, resourceRichness:0.4, mobCamps:0, towers:2, barriers:1, roughness:0.6,
mirrorFair:true}`. Features: `riverBand{axis:"z",at:0.5,width:0.12,fords:1}`, `landmarkAt(0,0)`
bridge, marsh `waterPool` spread, one barrier-gated `road` ford far flank.
**A1 notes.** One lane across the bridge; marsh as `passable:false` WATER with a single passable
bridge footprint. Defender TOWERs at the far bridgehead. A destructible bridge = a `PORTCULLIS`
barrier (breaking it *closes* the only lane → forces the ford — nice inversion; keep the ford as the
guaranteed-open validator lane).
**Recommended MODE(s).** **DUEL** (contest the span).
**Biome/palette.** `swamp` (signature); `verdant` reskin.

---

### B17 — Sea-and-Marsh Plain
**Real source.** **Marathon, 490 BC** — the Athenians formed on a **coastal plain bounded by the bay
and a marsh**, thinned their centre, and charged; the flanks were sealed by water so only frontage
mattered.
**Tactical concept.** A **coastal plain with both flanks water-sealed** (sea + marsh), inviting a
**thinned-centre / strong-wings** deployment. Like B2 but *both* flanks anchored, so it's a pure
frontage contest with a decisive-charge tempo. Also the archetype for beach-assault framing (one
side is the shore spawn).
**Layout.** **Sea along the NE edge** (the shore where a landing/defender forms), **marsh along the
SW/S edge**, an **open plain between**. The attacker forms on the SW dry ground; the defender's CORE
sits near the shore `(100,100)` with the sea at its back (no rear lane). A **beach strip** (firm) runs
the NE edge.
**Generator params.** **NEW ARCHETYPE: `coastalPlain`** (open plain with a sea edge + a marsh edge +
a firm beach band; an `openSteppe`/`marshCauseways` hybrid that anchors both flanks to water).
`{archetype:"coastalPlain", palette:"verdant", landmark:"SHIPWRECK", laneCount:2, density:0.25,
waterLevel:0.5, resourceNodes:3, resourceRichness:0.5, mobCamps:0, towers:2, barriers:0,
roughness:0.45, mirrorFair:true}`. Features: `waterPool`(sea) NE, marsh `waterPool` SW, `clearing`
plain, `landmarkAt(0.5,0.6)` (a beached ship).
**A1 notes.** 2 lanes across the plain; sea + marsh as `passable:false` edges. Defender CORE near the
shore `(100,100)`; attacker spawn `(-131.6,-131.6)`. Firm beach as walkable ROAD band NE.
**Recommended MODE(s).** **DUEL** (charge) / **CLASH**.
**Biome/palette.** `verdant` Aegean coast; `desert` for a sun-bleached shore.

---

### B18 — The Sphinx Field
**Real source.** **Isandlwana, 1879** — a Zulu army enveloped a British camp on an **open plain
beneath a distinctive sphinx-shaped crag (Isandlwana hill)**; the terrain was open but for the
dominating massif and a hidden ravine (the Zulu "horns" formed unseen).
**Tactical concept.** **Open plain + one iconic landmark massif + a hidden approach.** Mostly open
(rewarding envelopment / "horns of the buffalo"), but a **central impassable crag** splits sightlines
and a **concealed dead-ground ravine** lets a flank arrive unseen (fits reinforcement edge-entry).
Showcases the rare-landmark system.
**Layout.** A large **central crag** (impassable ROCK massif, ~40-unit footprint at `(0,20)`) around
which the plain opens. A **dead-ground donga (ravine)** — a passable but sight-blocking gully — runs
across the SE. Bases at SW/NE. The crag forces armies to commit to one side, enabling the wrap.
**Generator params.** `openSteppe` + landmark. `{archetype:"openSteppe", palette:"desert",
landmark:"GIANT_SKULL", laneCount:3, density:0.3, waterLevel:0.2, resourceNodes:3,
resourceRichness:0.5, mobCamps:1, towers:2, barriers:0, roughness:0.55, mirrorFair:false}`.
Features: one big `rockPatch(0,0.12,0.25)` (the crag), a `ridge`/gully SE, `landmarkAt(0,0.12)`.
**A1 notes.** 3 lanes routing around the crag; crag as one large `passable:false` ROCK footprint.
CORES at ±114.8 corners. The ravine as a heightField dip (walkable). GUARD variant: the crag holds a
BOSS.
**Recommended MODE(s).** **CLASH** (envelopment) / **GUARD**.
**Biome/palette.** `desert`/`autumn` veldt.

---

### B19 — Canopy Maze
**Real source.** **Jungle warfare — Kohima 1944 & the Petén/Yucatán jungle** (Maya sacbe causeways) —
dense canopy reduces the fight to trails, clearings, and ambush; movement is trail-bound.
**Tactical concept.** **Dense forest maze with trail lanes and pockets** — the generator's existing
`forestMaze` at maximum, given a jungle palette and **raised stone causeways (sacbe) as the reliable
lanes** through otherwise trackless green. High ambush value; short sightlines; clearing objectives.
**Layout.** **Dense FOREST** across ~70% of the field, cut by **2–3 causeway roads** (raised, firm)
connecting **clearings** at `(-60,-60)`, `(0,0)`, `(70,70)`. Ambush **mob camps** tucked off the
trails. A **ruined step-pyramid landmark** (RUINED_TOWER) crowns the central clearing (a DOMINION
point).
**Generator params.** `forestMaze` (jungle). `{archetype:"forestMaze", palette:"verdant",
landmark:"RUINED_TOWER", laneCount:3, density:0.85, waterLevel:0.3, resourceNodes:3,
resourceRichness:0.6, mobCamps:4, towers:1, barriers:2, roughness:0.75, mirrorFair:false}`. Features:
heavy `forestPatch` fill, `road` causeways, `clearing` ×3, `landmarkAt(0,0)` pyramid, `mobCampAt` ×4.
**A1 notes.** 3 trail lanes through the maze; forest as `passable:false` with guaranteed ROAD
causeways (validator keeps them open). Central clearing CORE/objective `(0,0)`. `mobs[]` for PvE.
**Recommended MODE(s).** **CLASH** / **DOMINION** (hold the pyramid) / **GUARD**.
**Biome/palette.** `verdant` (tropical); `swamp` for a mangrove reskin.

---

### B20 — The Open Steppe
**Real source.** **Mongol steppe battles — Kalka River 1223 / Legnica 1241** — vast open grassland
where feigned retreats lured pursuers into encirclement; the steppe's emptiness *is* the weapon.
**Tactical concept.** The **manoeuvre-warfare** template: wide-open, but with **shallow rolling swells
and dry stream-beds** that create dead ground for feints and encirclement pockets — subtler than B7.
Rewards mobility and timing; punishes overextension. Fair mirror for cavalry-heavy PvP.
**Layout.** Open across `±150`, textured with **broad heightField swells** and **2–3 dry gullies**
(passable, sight-blocking) at `(-50,30)`, `(40,-40)`. **Watering-hole resource** (a small pool +
GOLD/WOOD nodes) at `(0,-20)` as a contested centre. Bases at SW/NE.
**Generator params.** `openSteppe`. `{archetype:"openSteppe", palette:"autumn", landmark:"STANDING_STONES",
laneCount:2, density:0.2, waterLevel:0.3, resourceNodes:4, resourceRichness:0.6, mobCamps:1,
towers:1, barriers:0, roughness:0.5, mirrorFair:true}`. Features: heightField swells, `ridge`/gully
×2, `waterPool(0,-0.12,0.06)` hole, `landmarkAt(0,0.6)` stone circle, `resourceAt` at the hole.
**A1 notes.** 2 wide lanes; minimal `passable:false` (just gully lips if any). CORES ±114.8. Contest
node centre for a DOMINION variant. `mirrorFair:true`.
**Recommended MODE(s).** **CLASH** / **DUEL** / **DOMINION**.
**Biome/palette.** `autumn` steppe grass; `tundra` for a cold-steppe reskin.

---

### B21 — Sky Plateau
**Real source.** **Roraima & the Venezuelan tepuis** — sheer-sided table mountains isolated by
kilometre-high cliffs; the "floating island in the clouds" real-world archetype (the brief's
floating-island biome, grounded in real geography rather than invented).
**Tactical concept.** A **plateau-top arena ringed by void**: the playable ground is a mesa whose
edges are **sheer drops (impassable void, not water)**; a few **land-bridge / stair approaches** are
the only ways on, so the map is an island with 2–3 entry causeways. Falling-edge geometry; DOMINION
over the flat top.
**Layout.** The **bounds polygon is a rounded mesa** filling the centre (`±120`), with the corners
beyond it as **void (OOB)** — the drop. **2–3 stone land-bridges** reach the mesa from the SW, NE, and
one flank (the spawn causeways). A **central obelisk/monolith** (OBELISK) marks the DOMINION point.
Thin **spur ledges** off the rim as risky flank routes.
**Generator params.** **NEW ARCHETYPE: `skyPlateau`** (mesa bounds + void rim + few approach bridges;
uses the schema's existing `OOB` void code as impassable rim, plus a plateau heightField).
`{archetype:"skyPlateau", palette:"verdant", landmark:"OBELISK", laneCount:2, density:0.3,
waterLevel:0.0, resourceNodes:2, resourceRichness:0.7, mobCamps:1, towers:2, barriers:1,
roughness:0.5, mirrorFair:true}`. Features: mesa `clearing`, void rim (bounds shape), `road` bridges,
`landmarkAt(0,0)` obelisk.
**A1 notes.** `bounds` = the mesa polygon (rest is OOB void = impassable). 2 approach lanes over the
land-bridges to a central CORE/objective. TOWERs guard the bridge heads. Uniquely, "edge-enter"
reinforcements arrive at a *bridge mouth*, not any edge — validator must keep each bridge open.
**Recommended MODE(s).** **DOMINION** (own the top) / **DUEL**.
**Biome/palette.** `verdant` cloud-forest mesa; `volcanic` for a lava-isle; `ashen` sky-ruin.

---

### B22 — The Underworld
**Real source.** **Derinkuyu underground city (Cappadocia) & the Cu Chi tunnels (Vietnam)** — real
subterranean warrens of narrow tunnels, chambers, and rolling-stone doors; the cave/underworld biome
grounded in real sites.
**Tactical concept.** A **low-ceiling warren**: the whole map is enclosed rock with **narrow tunnel
lanes linking chambers**, choked by **rolling-stone doors (barriers)**. No open manoeuvre — everything
is corridor fighting and chamber ambushes; ideal PvE GUARD (a monster lair) or a claustrophobic CLASH.
**Layout.** The field is **mostly impassable rock**, carved into a **network of 12–16-unit tunnels**
connecting **3–4 chambers** (`clearing` pockets at `(-70,-60)`, `(0,10)`, `(60,70)`, `(-30,60)`).
**Barrier doors** (`BOULDER_PILE`, the "rolling stones") gate side-tunnels; main tunnels stay open. A
**BOSS lair chamber** (mobs) sits at centre for GUARD.
**Generator params.** **NEW ARCHETYPE: `cavernWarren`** (inverse of open maps — carve walkable
tunnels+chambers out of a solid rock fill; the negative-space cousin of `urbanRubble`).
`{archetype:"cavernWarren", palette:"ashen", landmark:"GIANT_SKULL", laneCount:2, density:0.9,
waterLevel:0.1, resourceNodes:3, resourceRichness:0.8, mobCamps:3, towers:1, barriers:3,
roughness:0.4, mirrorFair:false}`. Features: solid ROCK fill, carved `road` tunnels, `clearing`
chambers, `mobCampAt` in chambers, `landmarkAt(0,0)` bone pile, barrier doors on side-tunnels.
**A1 notes.** 2 tunnel lanes chamber→chamber; the rock as one big `passable:false` fill minus carved
walkable tunnels/chambers. `mobs[]` lair centre. Rolling-stone doors = `barriers` on shortcuts (not
the main lane). Underground → omit heightField / dark palette.
**Recommended MODE(s).** **GUARD** (lair) / **CLASH**.
**Biome/palette.** `ashen` (stone) / `volcanic` (magma caves) — signature cave look.

---

### B23 — No-Man's-Land
**Real source.** **The Somme, 1916** — two parallel **trench lines** separated by a cratered,
wire-choked no-man's-land; frontal assaults crossed open killing ground into fixed defences.
**Tactical concept.** **Two fixed parallel defensive lines** with a lethal open gap between: the
attacker must cross **no-man's-land** (open, slow, wire-barriered) into an entrenched defender. The
trench = a linear cover line + a barrier belt; the drama is the crossing. Extreme attacker-disadvantage
frontal template.
**Layout.** **Two trench lines** (linear low cover + barrier wire) parallel across the field: attacker
trench along the SW at `z≈-90`, defender trench along the NE at `z≈+90`. Between them a **cratered
open belt** (`z∈[-70,70]`) strewn with **shell-hole cover** (passable rock/water pocks) and **2–3 wire
barriers** with cut gaps. Communication saps (side trenches) feed each line.
**Generator params.** **NEW ARCHETYPE: `trenchLine`** (two parallel linear trench+wire lines with a
cratered gap; new because it's a *paired linear defensive* layout unlike any of the 7).
`{archetype:"trenchLine", palette:"ashen", landmark:"NONE", laneCount:3, density:0.5,
waterLevel:0.2, resourceNodes:2, resourceRichness:0.4, mobCamps:0, towers:4, barriers:3,
roughness:0.7, mirrorFair:true}`. Features: two `ridge`(trench) lines parallel, shell-hole
`rockPatch`/`waterPool` scatter mid, wire `barriers` with gaps, TOWER strongpoints on the trenches.
**A1 notes.** 3 lanes crossing the gap through wire gaps; trenches as linear cover (walkable behind,
firing lip) + wire as `barriers`. Defender TOWERs on the NE trench; CORE behind it. `mirrorFair:true`
(both trenches symmetric). heightField dips for the trench cuts.
**Recommended MODE(s).** **DUEL** (frontal assault).
**Biome/palette.** `ashen`/`swamp` (mud & wire); signature WWI look.

---

### B24 — The Terraces
**Real source.** **Ollantaytambo, 1537 & Inca agricultural andenes** — Manco Inca's defenders held
the **stepped terraces (andenes)** above the valley and rained fire down as the Spanish climbed; the
existing `cliffTerraces` archetype grounded in a real terraced battle.
**Tactical concept.** **Stacked defensive shelves**: several parallel terrace walls with limited
stairs, so an attacker must climb shelf-by-shelf, each a fresh defended line — a *staged* ascent (each
terrace ≈ a mini-front). Reads beautifully as an estate component ladder (each terrace = a component).
**Layout.** **Two–three parallel CLIFF terrace bands** across the field at `z≈-40`, `z≈+20`, `z≈+70`,
each with **2 staircase gaps** (offset, so the climb zig-zags). The defender's line strengthens with
each higher shelf; **CORE on the top terrace** `(0,110)`. Attacker climbs from the SW valley floor.
Farm-plot resource nodes on the terraces.
**Generator params.** `cliffTerraces`. `{archetype:"cliffTerraces", palette:"verdant",
landmark:"OBELISK", laneCount:2, density:0.35, waterLevel:0.25, resourceNodes:4, resourceRichness:0.6,
mobCamps:1, towers:4, barriers:2, roughness:0.5, mirrorFair:false}`. Features: 3 `ridge`(terrace) bands
with `passes:2` each (offset), `resourceAt` farm plots, `landmarkAt(0,0.7)` a sun-temple obelisk.
**A1 notes.** 2 lanes zig-zagging up the offset stairs; terraces as `passable:false` CLIFF bands
broken by ROAD stairs. Defender TOWERs crown each terrace; CORE top `(0,110)`. Each terrace is a
natural **estate sub-component** boundary (see estate note below).
**Recommended MODE(s).** **SIEGE** (staged ascent) / **DUEL**.
**Biome/palette.** `verdant` Andean; `desert` for a Hittite/hill-fort reskin.

---

## 4. Implementation appendix — NEW battlefield archetypes (deduped)

These are the generator archetypes the 24 battlefields imply beyond the existing 7. Each is a
one-line generation strategy for the map-maker session (`map-service/maps/archetypes.js` adds a
layout fn; `schema.js` `ARCHETYPES` gets the id). Castle archetypes are listed separately in the
[companion doc](./CASTLE-TEMPLATE-LIBRARY.md) §4; the two lists are disjoint.

| New archetype | Battlefields | Generation strategy (one line) |
|---|---|---|
| `coastalDefile` | B1 | Two convergent impassable edges (cliff + water) squeezing a single narrow diagonal corridor; one barrier-gated rim bypass. |
| `woodedFunnel` | B3 | Two convergent forest walls narrowing the passable gap from a wide mouth to a throat; optional slow-mud band + stake barrier. |
| `forestDefile` | B4, (B14) | Dense forest fill carved to ONE serpentine road with ridge+bog flank bulges and ambush mob-camps at each kink. |
| `urbanRubble` | B5 | Grid of rectangular hard-cover building footprints leaving offset streets (lanes); central strongpoint clearing. |
| `ridgeEscarpment` | B6 | ONE continuous scarp (cliff + heightField step) dividing low attacker ground from high defender ground, broken by 2–3 ramp gaps. |
| `brokenBadlands` | B10 | Multi-ridge lattice at varied angles + gullies + one dominating knoll (heightField); river on one edge. |
| `desertBottleneck` | B11 | Dune plain with TWO impassable long edges (sea + depression) + a barrier belt with 2 cleared gaps across the middle. |
| `frozenLake` | B12 | Passable ice sheet + firm shore bands + scattered thin-ice HAZARD patches (needs a new slow/hazard terrain code, see below). |
| `volcanicCaldera` | B13 | Ring cliff with ONE ascent gap enclosing a raised crater floor (CORE); lava hazard vents on the outer slope. |
| `valleyBasin` | B15 | Perimeter-high rim (heightField/cliff) sloping to a central low basin (defender CORE); multi-edge attacker spawns. |
| `coastalPlain` | B17 | Open plain with a sea edge + a marsh edge + a firm beach band; both flanks water-anchored, CORE near the shore. |
| `skyPlateau` | B21 | Mesa `bounds` polygon surrounded by OOB void rim; 2–3 land-bridge approach lanes; central objective. |
| `cavernWarren` | B22 | Solid rock fill with carved walkable tunnels+chambers (negative space); rolling-stone barrier doors on side-tunnels. |
| `trenchLine` | B23 | Two parallel linear trench+wire lines with a cratered open gap; wire barriers with cut gaps. |

**Shared new capabilities these archetypes need (flag to the map-maker session):**
1. **A HAZARD / SLOW terrain code** beyond the current `BLOCKED` set (`schema.js` `T`) — for mud
   (B3), thin ice (B12), and lava fringes (B13): *passable but movement-penalized / attrition*. Add
   e.g. `T.HAZARD = 7` (walkable, tagged) so the validator still treats it as pathable but the sim
   can apply a penalty. Ice/mud today can only be faked as passable décor with no gameplay effect.
2. **Void-rim (`OOB`) as a deliberate design element** (B21 `skyPlateau`) — the code already exists
   as the fog rim; `skyPlateau` uses it *inside* a normal square parcel to shape a mesa. Reinforcement
   edge-entry must snap to the nearest land-bridge mouth, not a void edge — a validator special-case.
3. **HeightField-as-gameplay** (B6, B10, B15, B24) — several templates want elevation to gate slope
   (already in the passability rule) *and* confer a firing-lip advantage; today `heightField` is
   hillshade-only. A "high ground = range/accuracy bonus" hook is a sim-side follow-up (design-only here).
4. **Negative-space carving** (`cavernWarren`, `urbanRubble`) — the current `blob`/`band` primitives
   ADD blocked terrain to an open field; these two archetypes want the inverse (carve OPEN out of a
   filled field). A `carve()` primitive (fill grid with ROCK, then subtract tunnels/streets) is the
   clean addition.

**Estate-component note (canon decision 4).** Several battlefields decompose naturally into the
estate "series of ±161 components": **B24 The Terraces** (each terrace shelf = one component,
top-terrace CORE = final component), **B6 The Shield Ridge** (lower field → ramp → crest), **B15 The
Basin** (rim → floor → CORE redoubt). For open templates (B2, B7, B20) an estate simply repeats the
same archetype across N components with rising army/structure counts, the last carrying the CORE.
The **castle templates** (companion doc) are the canonical "final component" designs — an estate's
battlefield components lead into one of those.

---

*Companion: **[CASTLE-TEMPLATE-LIBRARY.md](./CASTLE-TEMPLATE-LIBRARY.md)** — 24 fortification/siege
templates + the castle-archetype appendix.*
