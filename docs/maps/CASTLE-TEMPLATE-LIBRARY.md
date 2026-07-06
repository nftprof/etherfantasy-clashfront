# Clash Front — Castle / Fortification Template Library (Siege Maps)

> Companion to **[BATTLE-MAP-TEMPLATE-LIBRARY.md](./BATTLE-MAP-TEMPLATE-LIBRARY.md)**. Read that
> doc's §1 (methodology, the fixed ±161 frame, the generator vocabulary) first — it is not repeated
> here. This doc holds the **24 castle / fortification templates**: the siege maps that serve as an
> estate's **"final component"** (canon decision 4/5 — only estates have pre-designed castle maps).
>
> Every template is grounded in a REAL fortification, spanning the globe (Europe, Levant/Persia,
> India, China, Japan, Africa, the Americas) and eras (motte-and-bailey → concentric → bastion star).
> Author: Clash Front Overworld design session, 2026-07-06. Sources cited inline.

---

## 1. How castles map to the schema (siege-specific)

A castle map is a battlefield in the same **fixed ±161 arena**, but authored for **SIEGE mode**
(`MODES.SIEGE`: one defender holds the centre vs an attacker entering from an edge; objective =
`take_center`). Key mappings:

- **CORE = the keep / donjon / citadel** — the final objective, placed at/near the strong heart of
  the fort (usually NE or centre, at the ±114.8 magnitude or the geometric core).
- **WALL / GATE / TOWER anchors = the fortification** (`structures[]`). WALLs are the curtain lines
  (rendered as linked `passable:false` footprints with GATE gaps); GATE = the guarded opening a lane
  must pass; TOWER = flanking fire points at wall junctions.
- **Rings → estate components.** A multi-ring fort **decomposes into the estate "series of ±161
  components"**: outer ward = component 1, middle ward = component 2, inner ward / keep = the **final
  component**. Each ring is played as its own ±161 battle; clearing it unlocks the next inward
  component. A single-ring fort is one component; a great concentric fort (Krak, Beaumaris) is 2–3.
- **Approach & killzone** = the lane routing through gates + the ground the defender's TOWERs cover.
  The signature of good castle design is the **bent/zig-zag/spiral approach** that keeps attackers in
  a killzone (murder-holes, flanking fire) the whole way to the keep.
- **Barriers = destructible gates/portcullises** (`BARRIER_KINDS` includes `PORTCULLIS`): a broken
  gate opens the lane inward. The **outer edge always stays enterable** (invariant 1) — walls seal the
  *interior*, never a spawn edge; reinforcements still arrive at the parcel edge and open a new lane
  to the keep.

Because all castle maps are SIEGE-oriented, per-template **Recommended MODE** is SIEGE unless noted
(a few double as GUARD when the keep holds wild defenders, or DUEL for a two-army wall-assault).

**Siege-specific fields per template:** *Fortification type · Approach & killzone · Ring/component
breakdown · Gate/wall/keep anchors*, in addition to the shared fields (Real source · Tactical concept
· Layout · Generator params · Biome/palette).

The 24 castles, at a glance:

| # | Template | Real source (place/era) | NEW/shared archetype | Rings→components |
|---|---|---|---|---|
| C1 | The Motte | Norman motte-and-bailey (Berkhamsted, 11thc) | **NEW motteBailey** | 2 (bailey→motte) |
| C2 | The Crusader Crown | Krak des Chevaliers, Syria, 12–13thc | **NEW concentricRings** | 3 (talus→outer→inner) |
| C3 | The Perfect Ring | Beaumaris, Wales, 1295 | concentricRings | 2 (outer→inner) |
| C4 | The Walled Town Keep | Caernarfon, Wales, 1283 | **NEW keepAndWalledTown** | 2 (town→keep) |
| C5 | The Spur Fortress | Château Gaillard, France, 1198 | **NEW spurCastle** | 3 (outer→middle→keep) |
| C6 | The Double Town Wall | Carcassonne, France, 12–13thc | concentricRings + town | 2 (lices→cité→château) |
| C7 | The Triple Land Wall | Theodosian Walls, Constantinople, 5thc | **NEW tripleWall** | 3 (moat→outer→inner) |
| C8 | The Three-Tier Castle | Malbork, Poland, 13–14thc | **NEW tieredCastle** | 3 (low→middle→high) |
| C9 | The Tidal Fortress | Mont-Saint-Michel, France | **NEW tidalIsland** | 2 (causeway→mount) |
| C10 | The Crag-and-Tail | Edinburgh Castle, Scotland | **NEW cragTail** | 2 (esplanade→rock) |
| C11 | The Water Star | Bourtange, Netherlands, 1593 | **NEW bastionStar** | 2 (ravelins→star) |
| C12 | The Ideal Star City | Palmanova, Italy, 1593 | bastionStar (radial) | 3 (glacis→bastion→town) |
| C13 | The Spiral Keep | Himeji, Japan, 1609 | **NEW spiralKuruwa** | 3 (outer→spiral→tenshu) |
| C14 | The Moated Bailey | Osaka Castle, Japan, 16thc | **NEW waterCastle** | 3 (outer moat→inner moat→honmaru) |
| C15 | The Grid City | Xi'an / Pingyao, China | **NEW walledCityGrid** | 2 (barbican gate→city→drum-tower) |
| C16 | The Pass Fort | Jiayuguan, Great Wall, China, 1372 | **NEW passFort** | 2 (outer gate→inner gate→tower) |
| C17 | The Switchback Hill Fort | Mehrangarh, India, 15thc | **NEW hillFortSwitchback** | 3 (lower gates→mid→palace) |
| C18 | The Layered Granite Fort | Golconda, India, 16thc | hillFortSwitchback + acoustic | 3 (outer→mid→citadel) |
| C19 | The Sea Fort | Murud-Janjira, India, 17thc | **NEW seaFort** | 2 (sea approach→wall→inner) |
| C20 | The Throat-Cutter | Rumeli Hisarı / Aleppo Citadel | **NEW citadelMound** | 2 (glacis mound→gate→keep) |
| C21 | The Eagle's Nest | Alamut, Persia, 11thc | **NEW eyrie** | 2 (ridge path→eyrie) |
| C22 | The Drystone Enclosure | Great Zimbabwe, 11–15thc | **NEW drystoneEnclosure** | 2 (outer wall→parallel passage→tower) |
| C23 | The Castle Compound | Fasil Ghebbi, Gondar, Ethiopia, 17thc | **NEW compoundCluster** | 2 (curtain→multi-keep compound) |
| C24 | The Zigzag Rampart | Sacsayhuamán, Peru, 15thc | **NEW zigzagRampart** | 3 (three zigzag terraces) |

---

## 2. The 24 castle templates

---

### C1 — The Motte
**Real source.** **Norman motte-and-bailey** (e.g. **Berkhamsted, c.1070**) — an earthen mound
(motte) topped by a timber keep, beside a palisaded courtyard (bailey), ringed by a ditch. The
simplest, most reproducible medieval fort — the estate's *entry-level* castle.
**Fortification type.** Earthwork motte-and-bailey, single ditch + palisade.
**Tactical concept.** A **two-stage climb**: take the open bailey (livestock/garrison yard), then
storm the **raised motte** via its single steep ramp/flying-bridge into the keep. Cheap terrain, one
real chokepoint (the motte ramp).
**Approach & killzone.** Attacker enters SW, crosses the ditch at the **bailey gate** (barrier),
fights across the bailey under palisade fire, then funnels to the **single motte ramp** (NE) — a tight
killzone under the keep.
**Ring/component breakdown.** **2 components:** (1) bailey, (2) motte+keep (final).
**Gate/wall/keep anchors.** Palisade WALL ring (bailey), one GATE SW, one bridge-gate at the motte
ramp; TOWERs flank both gates; **CORE = timber keep atop the motte** at `(80,80)` (heightField high).
**Layout.** Circular ditch (impassable WATER) around the bailey (`±90`), a gate gap SW; the **motte**
a raised heightField disc at NE (`(80,80)`, r≈30) with one ramp gap. Bailey open inside.
**Generator params.** **NEW ARCHETYPE: `motteBailey`.** `{archetype:"motteBailey", palette:"verdant",
landmark:"RUINED_TOWER", laneCount:1, density:0.3, waterLevel:0.4, resourceNodes:2,
resourceRichness:0.4, mobCamps:0, towers:3, barriers:2, roughness:0.4, mirrorFair:false}`.
**Biome/palette.** `verdant` (English earthwork); `tundra` reskin.

---

### C2 — The Crusader Crown
**Real source.** **Krak des Chevaliers, Syria, 12–13thc** — the archetypal **concentric castle**: two
full curtain rings, a sloped **talus/glacis** at the base, projecting round towers for overlapping
fire, and a **~137 m zig-zagging bent-entrance ramp** with murder-holes.
**Fortification type.** Concentric spur castle, double enceinte + talus.
**Tactical concept.** **Rings within rings**: the attacker breaches the outer curtain only to find a
*higher* inner wall firing down into the **narrow lists** between them — a killing corridor. The bent
entrance denies any straight ram-run at a gate.
**Approach & killzone.** Enter SW; the **bent ramp** doglegs left-right up to the outer gate
(murder-hole killzone the whole climb); the lists between outer and inner walls are a crossfire
ring; the inner gate faces *away* from the outer, forcing a second dogleg.
**Ring/component breakdown.** **3 components:** (1) talus/glacis + bent ramp, (2) outer ward (the
lists), (3) inner ward + keep (final).
**Gate/wall/keep anchors.** Outer WALL ring (r≈130) with round TOWERs at 6 junctions + one GATE SW;
inner WALL ring (r≈75) with a GATE offset NE; **CORE = the inner keep/great tower** at `(0,0)` (or
`(40,40)`). Bent ramp = a walled ROAD corridor with two barriers.
**Layout.** Two concentric wall rings (see anchors); a **dogleg ramp** carved as a walled ROAD from SW
edge to the outer gate; talus = a heightField slope skirt outside the outer wall.
**Generator params.** **NEW ARCHETYPE: `concentricRings`** (2–3 nested wall rings with offset gates +
a bent entry ramp; the master castle archetype). `{archetype:"concentricRings", palette:"desert",
landmark:"OBELISK", laneCount:1, density:0.35, waterLevel:0.15, resourceNodes:3, resourceRichness:0.5,
mobCamps:0, towers:6, barriers:3, roughness:0.35, mirrorFair:false}`.
**Biome/palette.** `desert` (Levantine limestone); `verdant` reskin.

---

### C3 — The Perfect Ring
**Real source.** **Beaumaris, Wales, 1295** (Master James of St George) — the most **geometrically
symmetrical concentric castle** ever built: a square inner ward inside an octagonal outer ward, a
moat, and a **staggered double-gate** so no gate aligns with the one behind it.
**Fortification type.** Symmetrical concentric castle + wet moat.
**Tactical concept.** **Textbook concentric symmetry** — the design ideal Krak approached and
Beaumaris perfected. Every approach is covered from two wall heights; the offset gates mean breaching
the outer gate leaves you facing solid inner wall, forced to turn.
**Approach & killzone.** Cross the **wet moat** at the SW outer gatehouse; the outer/inner lists are a
full-perimeter crossfire; the **inner gate is offset ~90°** so the lane must turn along the lists under
fire before entering.
**Ring/component breakdown.** **2 components:** (1) moat + outer ward, (2) inner ward + hall (final).
**Gate/wall/keep anchors.** Octagonal outer WALL (r≈120) with 12 TOWERs + GATE SW; square inner WALL
(±70) with 4 corner TOWERs + GATE offset to the E; **CORE = inner ward great hall** `(0,0)`. Wet moat
= WATER ring outside the outer wall.
**Layout.** Concentric symmetric rings; a moat causeway lane SW; offset gate forces an L-shaped
interior lane.
**Generator params.** `concentricRings` (symmetric, `mirrorFair:true`). `{archetype:"concentricRings",
palette:"verdant", landmark:"NONE", laneCount:1, density:0.3, waterLevel:0.5, resourceNodes:3,
resourceRichness:0.5, mobCamps:0, towers:6, barriers:3, roughness:0.25, mirrorFair:true}`.
**Biome/palette.** `verdant` (Welsh); `tundra` reskin.

---

### C4 — The Walled Town Keep
**Real source.** **Caernarfon, Wales, 1283** — a castle fused to a **walled town**: polygonal
(not round) towers, the castle at one end, the burgage streets of the town enclosed by the same
circuit; the King's Gate a deep barbican with multiple portcullises and murder-holes.
**Fortification type.** Enclosure castle + attached walled town (linear plan).
**Tactical concept.** **Two-phase objective**: fight through the **town streets** (an urban-lite
maze inside the walls) to reach the **castle keep** at the far end. The barbican gatehouse is a deep
killbox — several portcullises in series.
**Approach & killzone.** Enter the town **town-gate** SW; a **street grid** (light urban cover) leads
NE to the **castle's barbican** — a long walled passage with 2–3 portcullis barriers and murder-hole
fire before the inner bailey.
**Ring/component breakdown.** **2 components:** (1) walled town (streets), (2) castle + Eagle Tower
keep (final).
**Gate/wall/keep anchors.** Town WALL circuit with polygonal TOWERs + a GATE SW; a partition WALL
separating town from castle with the **barbican GATE** (2–3 barriers); **CORE = the Eagle Tower**
`(110,110)`.
**Layout.** Outer wall enclosing a light street grid (SW half) + a walled castle bailey (NE quarter)
behind a barbican passage.
**Generator params.** **NEW ARCHETYPE: `keepAndWalledTown`** (an outer wall enclosing a light street
grid that leads to a partitioned inner keep bailey via a deep barbican). `{archetype:"keepAndWalledTown",
palette:"verdant", landmark:"RUINED_TOWER", laneCount:2, density:0.55, waterLevel:0.2,
resourceNodes:3, resourceRichness:0.5, mobCamps:0, towers:5, barriers:3, roughness:0.4,
mirrorFair:false}`.
**Biome/palette.** `verdant`; `ashen` for a ruined-town look.

---

### C5 — The Spur Fortress
**Real source.** **Château Gaillard, France, 1198** (Richard I) — a **spur castle** on a rocky
promontory: three baileys in a line separated by dry moats, an outer triangular bailey covering the
only land approach, and an inner keep with early **machicolations**. Fell only when sappers took the
chapel.
**Fortification type.** Spur castle, three linear baileys + dry moats.
**Tactical concept.** **A castle you can only attack end-on.** Cliffs seal both flanks and the rear;
the sole approach is a **narrow spur** through three baileys in series — each a fresh wall + moat.
Depth, not concentric rings, is the defence.
**Approach & killzone.** Enter along the spur SW; take the **triangular outer bailey** (its point aimed
at the attacker, deflecting fire); cross a **dry moat** to the middle bailey; a second moat to the
inner keep. Flanks are cliff — no way round.
**Ring/component breakdown.** **3 linear components:** (1) outer triangular bailey, (2) middle bailey,
(3) inner keep (final).
**Gate/wall/keep anchors.** Three WALL segments across the spur (not rings — chords), each with a GATE
+ dry-moat barrier; TOWERs at each wall; **CORE = the machicolated donjon** `(110,110)`. Cliff
footprints seal the NW, SE, and rear.
**Layout.** A diagonal **spur ridge** (walkable) SW→NE flanked by CLIFF drops; three transverse walls
+ moats staging the ascent to the keep.
**Generator params.** **NEW ARCHETYPE: `spurCastle`** (linear promontory with cliff flanks + N
transverse wall+moat lines staging to an end keep). `{archetype:"spurCastle", palette:"verdant",
landmark:"NONE", laneCount:1, density:0.4, waterLevel:0.3, resourceNodes:2, resourceRichness:0.5,
mobCamps:0, towers:4, barriers:3, roughness:0.5, mirrorFair:false}`.
**Biome/palette.** `verdant` (Seine valley); `desert` reskin.

---

### C6 — The Double Town Wall
**Real source.** **Carcassonne, France, 12–13thc** — a **double concentric town wall** (inner + outer
enceinte) separated by the **lices** (an open kill-corridor between the walls), ~52 towers, plus an
inner **Château Comtal** with its own barbican and moat.
**Fortification type.** Double-walled town (concentric enceinte) + inner château.
**Tactical concept.** The **lices** are the star: an attacker over the outer wall lands in a bare
corridor overlooked by the taller inner wall — a shooting gallery — and *still* has to take the town
and then the inner château. Three nested objectives.
**Approach & killzone.** Outer GATE SW → the **lices corridor** (crossfire from both walls) → an inner
GATE → town → the **Château Comtal barbican** (moated) at the far side.
**Ring/component breakdown.** **2 components (3 sub-phases):** (1) outer wall + lices + town, (2) the
inner château + keep (final). (A large estate can split the lices into its own component.)
**Gate/wall/keep anchors.** Outer WALL ring (r≈135) + inner WALL ring (r≈100) with the lices between,
TOWERs densely on both; town street grid inside; a moated inner **château WALL** with barbican GATE;
**CORE = château keep** `(40,40)`.
**Layout.** Two concentric rings with a narrow open lices band between; a light town grid inside;
a small moated inner castle offset NE.
**Generator params.** `concentricRings` + town. `{archetype:"concentricRings", palette:"autumn",
landmark:"RUINED_TOWER", laneCount:2, density:0.5, waterLevel:0.25, resourceNodes:3,
resourceRichness:0.5, mobCamps:0, towers:6, barriers:3, roughness:0.35, mirrorFair:false}`.
**Biome/palette.** `autumn`/`verdant` (Languedoc).

---

### C7 — The Triple Land Wall
**Real source.** **Theodosian Walls of Constantinople, 5thc** — the greatest urban land defence of
the ancient/medieval world: a **flooded moat + breastwork**, a **terrace (parateichion)**, an **outer
wall (8 m, 82 towers)**, a **peribolos terrace**, and an **inner wall (12 m, 96 towers)** — five
layers in depth. Held for a thousand years.
**Fortification type.** Layered linear land wall (moat + double wall + terraces).
**Tactical concept.** **Defence in depth as a straight line.** Not concentric rings but **parallel
belts**: each crossed belt drops the attacker into a terrace under fire from the *next, taller* wall.
The moat can be flooded (a water barrier that can open/close).
**Approach & killzone.** Cross the **flooded moat** (barrier) + breastwork; the **parateichion
terrace** is swept by the outer wall; breach the outer wall into the **peribolos terrace** — a
crossfire strip under the inner wall; then the inner wall + city.
**Ring/component breakdown.** **3 components:** (1) moat + outer wall, (2) peribolos + inner wall,
(3) the city/keep behind (final).
**Gate/wall/keep anchors.** Two parallel WALL lines across the field (outer `z≈-20`, inner `z≈+40`)
with many TOWERs, GATE gaps offset between them; a WATER moat band along the SW front (floodable
barrier); **CORE = the imperial keep/city core** `(0,110)`.
**Layout.** Parallel wall belts + terraces filling the NE two-thirds; the attacker crosses the moat
and open glacis from the SW.
**Generator params.** **NEW ARCHETYPE: `tripleWall`** (stacked parallel linear belts: moat → outer
wall+terrace → inner wall, gates offset). `{archetype:"tripleWall", palette:"verdant",
landmark:"OBELISK", laneCount:2, density:0.4, waterLevel:0.45, resourceNodes:3, resourceRichness:0.5,
mobCamps:0, towers:6, barriers:3, roughness:0.3, mirrorFair:false}`.
**Biome/palette.** `verdant` (Byzantine); `ashen` for a ruined-wall siege.

---

### C8 — The Three-Tier Castle
**Real source.** **Malbork (Marienburg), Poland, 13–14thc** — the largest brick castle in the world;
the Teutonic Order's seat, three linked castles in one: **Low Castle** (outer bailey / arsenal),
**Middle Castle** (administration), **High Castle** (the monastic keep), each separated by dry moats
and gates.
**Fortification type.** Tiered enclosure castle (three linked wards in a line/L).
**Tactical concept.** **A castle in three acts** — take an outer utility bailey, then the grand
middle ward, then the fortified High Castle. Each is a full enclosure with its own gate + moat;
scale and depth over trickery.
**Approach & killzone.** Enter the **Low Castle** SW (open, lightly held); a gated **dry moat** to the
Middle Castle (its courtyard overlooked); a final **drawbridge gate** to the High Castle's tight
cloister-keep.
**Ring/component breakdown.** **3 components:** (1) Low Castle, (2) Middle Castle, (3) High Castle keep
(final).
**Gate/wall/keep anchors.** Three WALL enclosures chained SW→NE, each a GATE + dry-moat barrier +
corner TOWERs; **CORE = High Castle keep** `(110,110)`. Brick-red palette flavour.
**Layout.** Three progressively smaller walled wards stepping NE, moats between.
**Generator params.** **NEW ARCHETYPE: `tieredCastle`** (chain of 3 progressively smaller full
enclosures, each gate+moat, stepping toward the keep). `{archetype:"tieredCastle", palette:"autumn",
landmark:"RUINED_TOWER", laneCount:1, density:0.4, waterLevel:0.4, resourceNodes:3,
resourceRichness:0.5, mobCamps:0, towers:5, barriers:3, roughness:0.35, mirrorFair:false}`.
**Biome/palette.** `autumn` (brick Gothic); `tundra` reskin.

---

### C9 — The Tidal Fortress
**Real source.** **Mont-Saint-Michel, France** — an island abbey-fortress reachable only by a
**causeway drowned at high tide**; the sea itself is the outer defence, then a **single walled ramp
spiralling up the mount** to the abbey at the summit.
**Fortification type.** Tidal island fortress + spiral ramp to a summit keep.
**Tactical concept.** **The sea is the outer wall.** The attacker must cross a **narrow tidal
causeway** (the only approach; timing/hazard) to a single **fortified village gate**, then climb one
**spiral ramp** hugging the walls to the summit abbey. One thread of attack, all of it exposed.
**Approach & killzone.** Cross the **causeway** SW (water on both sides — a hard funnel); the **town
gate**; a single **switchback ramp** up the mount under wall fire to the **summit keep**.
**Ring/component breakdown.** **2 components:** (1) causeway + walled town, (2) the spiral ramp +
summit abbey-keep (final).
**Gate/wall/keep anchors.** WATER surrounds all but the causeway; town WALL with GATE at the causeway
head; a spiralling walled ROAD ramp; **CORE = summit abbey** `(0,0)` on high heightField.
**Layout.** A near-circular island (bounds) ringed by water/void, one causeway lane SW; a conical
mount rising to centre with a spiral ramp.
**Generator params.** **NEW ARCHETYPE: `tidalIsland`** (island bounds + water/void rim + one causeway
approach + a spiral ramp to a summit CORE). `{archetype:"tidalIsland", palette:"verdant",
landmark:"RUINED_TOWER", laneCount:1, density:0.45, waterLevel:0.8, resourceNodes:2,
resourceRichness:0.5, mobCamps:0, towers:4, barriers:2, roughness:0.4, mirrorFair:false}`.
**Biome/palette.** `verdant`/`swamp` (tidal flats); `tundra` reskin.

---

### C10 — The Crag-and-Tail
**Real source.** **Edinburgh Castle, Scotland** — perched on a **volcanic crag** with sheer cliffs on
three sides; the only approach is up the gentle **"tail"** (the Royal Mile / Esplanade) into the gate.
A one-way fortress.
**Fortification type.** Crag fortress, single approachable side (crag-and-tail geology).
**Tactical concept.** **Three sides unassailable, one side a long exposed ramp.** The whole defence
is geological: attackers can only come up the tail into concentrated gate/battery fire — the tightest
"single-approach" castle after the eyrie (C21).
**Approach & killzone.** Up the **esplanade tail** SW→NE (a long open glacis under battery fire) to
the **gatehouse**; a short bent passage to the upper ward and the keep on the crown. Cliffs seal N, E, W.
**Ring/component breakdown.** **2 components:** (1) esplanade + gatehouse, (2) upper ward + crown keep
(final).
**Gate/wall/keep anchors.** CLIFF footprints seal three edges; a WALL + GATE across the tail; a battery
of TOWERs above the approach; **CORE = crown keep** `(100,100)` on high heightField.
**Layout.** A raised crag occupying the NE (heightField high, cliff-rimmed) with one ramp/tail from
the SW; open glacis on the tail.
**Generator params.** **NEW ARCHETYPE: `cragTail`** (cliff-rimmed raised crag with ONE gentle ramp
approach + gate battery). `{archetype:"cragTail", palette:"tundra", landmark:"OBELISK", laneCount:1,
density:0.35, waterLevel:0.1, resourceNodes:2, resourceRichness:0.5, mobCamps:0, towers:5,
barriers:2, roughness:0.5, mirrorFair:false}`.
**Biome/palette.** `tundra`/`verdant` (Scottish basalt); `volcanic` for the crag's origin.

---

### C11 — The Water Star
**Real source.** **Bourtange, Netherlands, 1593** — a **Vauban-style bastion star fort** with
**water-filled ditches, ravelins, and a crownwork**; the pointed bastions eliminate blind spots so
every face is covered by flanking fire from two neighbours.
**Fortification type.** Bastioned star fort (gunpowder-age), wet ditches + ravelins.
**Tactical concept.** **Geometry kills.** Star bastions mean there is **no dead ground** — every
approach is enfiladed from two directions; detached **ravelins** force attackers to take an outwork
first, funnelling them onto the bastion faces across water. Low, thick, angled — cannon-proof.
**Approach & killzone.** Cross the **glacis** (a smooth killing slope) SW; take a **ravelin** (a
triangular island outwork) under crossfire; cross the **wet ditch** to a **bastion curtain** gate; the
star interior is the keep.
**Ring/component breakdown.** **2 components:** (1) glacis + ravelins + wet ditch, (2) the bastioned
enceinte + interior magazine/keep (final).
**Gate/wall/keep anchors.** A **star WALL** (5–7 pointed bastions, TOWERs at each point) around the
centre; detached **ravelin WALL** islands beyond a WATER ditch; GATE behind a ravelin SW; **CORE =
central magazine/keep** `(0,0)`; glacis = heightField skirt.
**Layout.** A pentagon/heptagon star polygon centre, wet ditch ring, triangular ravelin islands off
the faces, a low glacis apron outside.
**Generator params.** **NEW ARCHETYPE: `bastionStar`** (star polygon wall with pointed bastions +
detached ravelins + wet ditch + glacis apron). `{archetype:"bastionStar", palette:"verdant",
landmark:"NONE", laneCount:1, density:0.4, waterLevel:0.55, resourceNodes:3, resourceRichness:0.5,
mobCamps:0, towers:6, barriers:3, roughness:0.25, mirrorFair:false}`.
**Biome/palette.** `verdant`/`swamp` (Dutch polder); `desert` for a colonial star fort.

---

### C12 — The Ideal Star City
**Real source.** **Palmanova, Italy, 1593** (Venetian) — a **radially symmetric nine-bastion star**
enclosing a planned city with a hexagonal central piazza; concentric bastion generations + ditch +
glacis, roads radiating from the centre.
**Fortification type.** Radial ideal star-city (9-point bastion, planned interior).
**Tactical concept.** **Perfect radial symmetry** — a 4-way/9-way fortress with no weak face; the
radial street plan means every gate route leads to the central piazza. Best read as a **DOMINION** or
**CLASH** siege where attackers press multiple bastions at once (fits the estate's multi-edge waves).
**Approach & killzone.** Three **town gates** set between bastions (never on a point); each opens a
**radial avenue** straight to the central piazza — the killzone is the avenue, raked from the flanking
bastions.
**Ring/component breakdown.** **3 components:** (1) glacis + ditch, (2) nine-bastion enceinte,
(3) inner city + central citadel piazza (final).
**Gate/wall/keep anchors.** Nine-point star WALL (TOWER/bastion at each point) around the field; 3 GATE
gaps; radial ROAD avenues to a central hexagonal plaza; **CORE = central citadel** `(0,0)`.
**Layout.** Nine-point star centred on `(0,0)`; radial roads; ditch + glacis rings; symmetric.
**Generator params.** `bastionStar` (radial, symmetric, high point count). `{archetype:"bastionStar",
palette:"autumn", landmark:"OBELISK", laneCount:3, density:0.4, waterLevel:0.45, resourceNodes:4,
resourceRichness:0.6, mobCamps:0, towers:6, barriers:3, roughness:0.2, mirrorFair:true}`.
**Biome/palette.** `autumn`/`verdant` (Friuli plain).

---

### C13 — The Spiral Keep
**Real source.** **Himeji Castle, Japan, 1609** — the "White Heron": concentric **kuruwa** (baileys)
arranged so the approach **spirals** around the complex through **84 gates** (the iroha-named maze),
with narrow walled passages, 180° reversals, and *hazama* loopholes — designed to confuse, tire, and
expose attackers on their way to the **tenshu** (main keep).
**Fortification type.** Japanese hilltop castle (hirayama-jiro), spiral kuruwa maze.
**Tactical concept.** **The path itself is the weapon.** Rather than stop the attacker, the maze
**routes** him — spiralling, doubling back, single-file through walled lanes under fire from every
side — so he arrives at the keep exhausted and thinned. Movement-punishment as fortification.
**Approach & killzone.** Enter the **Otemon** SW; the lane **spirals clockwise** through a sequence of
gates (barriers), twice reversing 180° and twice pinching to single-file walled stretches (hazama
loophole fire), climbing to the **tenshu** at the spiral's centre.
**Ring/component breakdown.** **3 components:** (1) outer kuruwa, (2) the spiral gate-maze,
(3) the honmaru + tenshu keep (final).
**Gate/wall/keep anchors.** Nested, offset WALL kuruwa arcs forming a spiral; many GATE barriers along
it; TOWERs (yagura) at wall bends; **CORE = the tenshu** at the spiral centre `(30,30)` on high
heightField.
**Layout.** A spiral of walled corridors from the SW edge winding inward/upward to a central raised
keep; white-plaster palette.
**Generator params.** **NEW ARCHETYPE: `spiralKuruwa`** (a single spiral walled corridor from edge to
a central raised keep, gated + loopholed, with 180° reversals). `{archetype:"spiralKuruwa",
palette:"sakura", landmark:"RUINED_TOWER", laneCount:1, density:0.5, waterLevel:0.2,
resourceNodes:2, resourceRichness:0.5, mobCamps:0, towers:6, barriers:4, roughness:0.4,
mirrorFair:false}`.
**Biome/palette.** `sakura` (signature — white keep, cherry); `verdant` reskin.

---

### C14 — The Moated Bailey
**Real source.** **Osaka Castle, Japan, 16thc** (Toyotomi/Tokugawa) — colossal **cyclopean stone
walls** and **broad double water moats** (outer + inner) around concentric baileys, the main keep on
the **honmaru** island at the centre; the moats are the primary defence.
**Fortification type.** Japanese flatland/water castle (mizujiro), concentric water moats.
**Tactical concept.** **Water in depth.** Two enormous moats mean the attacker must force **two
bridged crossings** under fire, across bare stone-walled ground between, to reach the keep island.
Sightlines are long over water; the defence is the crossings, not a maze.
**Approach & killzone.** Cross the **outer moat** bridge SW to the second bailey (a bare stone
killground swept from the inner wall); cross the **inner moat** bridge to the **honmaru** keep island.
**Ring/component breakdown.** **3 components:** (1) outer moat + bailey, (2) inner moat + second
bailey, (3) honmaru keep (final).
**Gate/wall/keep anchors.** Two concentric WATER moat rings, each crossed by ONE bridged GATE
(barrier), massive stone WALLs behind each with corner TOWERs (yagura); **CORE = honmaru keep**
`(0,0)` on a raised island.
**Layout.** Concentric water rings + walls; two offset bridge gates; central raised keep island.
**Generator params.** **NEW ARCHETYPE: `waterCastle`** (concentric wide water moats + stone walls,
each crossed by a single bridge-gate, to a central keep island). `{archetype:"waterCastle",
palette:"sakura", landmark:"OBELISK", laneCount:1, density:0.35, waterLevel:0.7, resourceNodes:3,
resourceRichness:0.5, mobCamps:0, towers:5, barriers:3, roughness:0.3, mirrorFair:false}`.
**Biome/palette.** `sakura`/`verdant`. (Matsumoto's black flatland water castle is a `tundra`/`ashen`
reskin of this template.)

---

### C15 — The Grid City
**Real source.** **Xi'an & Pingyao, China** — rectangular **rammed-earth/brick walled cities** aligned
to the cardinal directions, with a **gate in each of the four walls**, each gate protected by a
**barbican (urn city / wèngchéng)** — a walled forecourt that traps attackers who breach the outer
gate — and a central **bell/drum tower**.
**Fortification type.** Chinese rectangular walled city + barbican gates.
**Tactical concept.** **The barbican trap.** Break the outer gate and you're inside a small walled
courtyard (the urn) with the *real* gate at 90°, surrounded by walls firing down — "catching a turtle
in a jar." Then a grid city to the central tower.
**Approach & killzone.** Assault a **cardinal gate** (say S) into the **barbican courtyard** (a
crossfire box), turn 90° through the inner gate, then a **grid of avenues** to the **central drum
tower** citadel.
**Ring/component breakdown.** **2 components:** (1) wall + barbican + city grid, (2) central
drum-tower citadel (final). (A large estate splits the barbican into its own brutal component.)
**Gate/wall/keep anchors.** A rectangular WALL circuit (`±140` square) with a barbican WALL box outside
each GATE; TOWERs at corners + gate barbicans; a light avenue grid inside; **CORE = central drum
tower** `(0,0)`.
**Layout.** Rectangular wall + four barbican gate-boxes; orthogonal avenue grid; central tower.
**Generator params.** **NEW ARCHETYPE: `walledCityGrid`** (rectangular wall + barbican gate-traps +
orthogonal avenue grid to a central tower). `{archetype:"walledCityGrid", palette:"ashen",
landmark:"RUINED_TOWER", laneCount:3, density:0.5, waterLevel:0.2, resourceNodes:4,
resourceRichness:0.6, mobCamps:0, towers:6, barriers:3, roughness:0.25, mirrorFair:true}`.
**Biome/palette.** `ashen`/`desert` (grey brick, loess); `autumn` reskin.

---

### C16 — The Pass Fort
**Real source.** **Jiayuguan, Great Wall, China, 1372** — the "First and Greatest Pass under Heaven":
a fort straddling a **strategic pass**, with **nested outer and inner gate-towers**, a walled ramp,
and the Great Wall running off both flanks so the fort *is* the only way through.
**Fortification type.** Frontier pass fortress (gate-tower in series, wall flanks).
**Tactical concept.** **A gate you cannot go around.** The wall seals both flanks to the map edge;
the only route is through **two gate-towers in series** with a walled courtyard between (a killbox),
so the whole assault is a gate-fight in depth. (Shanhaiguan and Rumeli Hisarı share the "throat" idea.)
**Approach & killzone.** Approach the **outer gate-tower** SW; through it into a **walled courtyard**
(swept from all sides); the **inner gate-tower** offset so a straight run is impossible; then the
fort interior/beyond.
**Ring/component breakdown.** **2 components:** (1) outer gate + courtyard, (2) inner gate + fort keep
(final).
**Gate/wall/keep anchors.** A WALL spanning the full width (edge to edge) with two GATE towers in
series and a courtyard WALL between; TOWERs over each gate; **CORE = the inner gate-tower keep**
`(60,60)`. Wall flanks = `passable:false` to both edges (validator keeps only the gate lane + the
mandatory spawn edge open).
**Layout.** A wall wall-to-wall across the field with a double gate-tower and killbox courtyard;
open glacis approach SW.
**Generator params.** **NEW ARCHETYPE: `passFort`** (full-width wall with two in-series gate-towers +
killbox courtyard). `{archetype:"passFort", palette:"desert", landmark:"OBELISK", laneCount:1,
density:0.35, waterLevel:0.1, resourceNodes:2, resourceRichness:0.5, mobCamps:0, towers:5,
barriers:3, roughness:0.35, mirrorFair:false}`.
**Biome/palette.** `desert` (Gobi frontier); `tundra` for a mountain pass.

---

### C17 — The Switchback Hill Fort
**Real source.** **Mehrangarh, Jodhpur, India, 15thc** — a fort on a **122 m cliff** reached by a
**winding road through seven successive gates (pols)**, angled and studded with anti-elephant iron
spikes, doglegging up the hillside so no charge or ram can build momentum.
**Fortification type.** Rajput hill fort, serpentine multi-gate ascent.
**Tactical concept.** **Seven gates up a switchback.** Each gate is a fresh chokepoint set on a bend,
so the attacker never gets a straight run and is under fire from the walls above at every turn — a
long, punishing, ascending killzone to the palace-citadel on the crown.
**Approach & killzone.** A **switchback ramp** SW→up, passing **7 GATE chokes** on its bends
(barriers), each overlooked by wall fire; the ramp doglegs so momentum resets at each gate; ends at
the **palace keep** on the summit.
**Ring/component breakdown.** **3 components:** (1) lower gates (1–3), (2) mid gates (4–6),
(3) upper gate + palace keep (final).
**Gate/wall/keep anchors.** A serpentine walled ROAD ramp with 7 GATE barriers on its bends; WALLs +
TOWERs lining the ascent (firing down); **CORE = summit palace** `(110,110)` high heightField; CLIFF
footprints below the ramp.
**Layout.** A raised cliff-hill NE; a zig-zag ramp climbing it from the SW with seven gates; sheer
drops off the ramp.
**Generator params.** **NEW ARCHETYPE: `hillFortSwitchback`** (a serpentine walled ramp up a cliff-hill
with N gates on the bends, wall fire above, cliff below, summit keep). `{archetype:"hillFortSwitchback",
palette:"desert", landmark:"OBELISK", laneCount:1, density:0.45, waterLevel:0.05, resourceNodes:2,
resourceRichness:0.6, mobCamps:0, towers:6, barriers:4, roughness:0.5, mirrorFair:false}`.
**Biome/palette.** `desert` (Thar/Rajasthan sandstone); `verdant` reskin.

---

### C18 — The Layered Granite Fort
**Real source.** **Golconda, India, 16thc** — a granite hill fort with **concentric outer walls
connected to natural boulders**, **87 bastions, eight gates with zig-zag iron-spiked entryways**, and
a famous **acoustic warning system** (a clap at the Fateh Darwaza gate carries to the hilltop citadel
~1 km away).
**Fortification type.** Layered granite hill fort (concentric + natural boulders + acoustic alarm).
**Tactical concept.** **The landscape is the wall.** Concentric granite curtains splice into natural
boulder outcrops, so there's no clean line to breach; **zig-zag spiked gates** stop elephant-rams;
the acoustic gate is flavour but maps to an early-warning intel beat. Take outer city → mid walls →
hilltop citadel.
**Approach & killzone.** Enter the **Fateh Darwaza** SW (zig-zag, spiked — a bent killzone); cross the
outer town; climb through the mid wall's gate into the **citadel** on the granite hilltop, boulders
channeling the whole way.
**Ring/component breakdown.** **3 components:** (1) outer wall + city, (2) mid wall, (3) hilltop
citadel (final).
**Gate/wall/keep anchors.** Concentric WALL arcs merging with big ROCK boulder footprints; zig-zag
GATE barbicans; TOWERs (bastions) dense on the arcs; **CORE = hilltop citadel** `(60,80)` high.
**Layout.** Concentric arcs interrupted by natural boulder masses; a bent gate SW; rising ground to a
citadel. (Reuse `hillFortSwitchback` with concentric arcs + boulder scatter.)
**Generator params.** `hillFortSwitchback` (+ boulder scatter, concentric). `{archetype:"hillFortSwitchback",
palette:"ashen", landmark:"STANDING_STONES", laneCount:1, density:0.55, waterLevel:0.1,
resourceNodes:3, resourceRichness:0.7, mobCamps:1, towers:6, barriers:3, roughness:0.6,
mirrorFair:false}`.
**Biome/palette.** `ashen` (granite grey); `desert` reskin.

---

### C19 — The Sea Fort
**Real source.** **Murud-Janjira, Maharashtra, India, 17thc** — an **oval island fortress** in the
Arabian Sea, ~12 m walls with 19 bastions rising straight from tidal rock; **unconquered** through
centuries because the sea denies siege engines and the single sea-gate is hidden and enfiladed.
**Fortification type.** Island sea fort (oval wall rising from water).
**Tactical concept.** **A fort you must land against.** The sea is a total outer wall; attackers
arrive by boat at a **single concealed sea-gate** and must storm straight up the wall from the
waterline with no room to deploy — the ultimate defender's-advantage siege.
**Approach & killzone.** Cross **open water** SW to the **hidden sea-gate** (the only breach point,
enfiladed from two flanking bastions); through it into the packed inner courtyards to the citadel.
The whole waterline is a wall-top killzone.
**Ring/component breakdown.** **2 components:** (1) sea approach + wall + gate, (2) inner courts +
citadel (final).
**Gate/wall/keep anchors.** An **oval WALL** rising from a WATER rim (island bounds); one concealed
GATE SW flanked by two TOWERs; dense bastion TOWERs around the oval; **CORE = inner citadel** `(0,0)`.
**Layout.** Oval island (bounds) surrounded by water/void; one gate; tight inner ward. (Distinct from
`tidalIsland` — no causeway, water on ALL sides, a wall-assault not a ramp-climb.)
**Generator params.** **NEW ARCHETYPE: `seaFort`** (oval/round island wall rising from all-around
water, one enfiladed gate, tight interior). `{archetype:"seaFort", palette:"verdant",
landmark:"SHIPWRECK", laneCount:1, density:0.4, waterLevel:0.85, resourceNodes:2, resourceRichness:0.5,
mobCamps:0, towers:6, barriers:2, roughness:0.35, mirrorFair:false}`.
**Biome/palette.** `verdant`/`swamp` (tropical sea); `tundra` for a northern sea fort.

---

### C20 — The Throat-Cutter
**Real source.** **Rumeli Hisarı, Bosphorus, 1452** ("Boğazkesen", throat-cutter) & the **Aleppo
Citadel** — a fort commanding a strait/mound: Rumeli's three great towers + connecting walls choke the
narrows; Aleppo sits on a huge **glacis mound** reached by a single **arched bridge over a moat** to a
fortified gate block.
**Fortification type.** Strait/mound citadel — glacis mound + single bridged gate.
**Tactical concept.** **Command a chokepoint from a mound.** A steep artificial **glacis mound** with
smooth slick slopes makes escalade near-impossible; the only way up is a **single narrow arched
bridge** to a massive gate-block — one thread, wholly exposed, over a moat.
**Approach & killzone.** Cross the **moat bridge** SW (a long exposed span, flanked) to the **great
gate-block**; a bent passage inside up the mound to the citadel; the glacis slopes deny any other route.
**Ring/component breakdown.** **2 components:** (1) moat + bridge + gate-block, (2) mound citadel/keep
(final).
**Gate/wall/keep anchors.** A raised **glacis mound** (heightField, steep) with a WATER moat ring; ONE
GATE at a bridge causeway; a fortified gate-block + flanking TOWERs; **CORE = mound citadel** `(0,0)`.
**Layout.** A steep central mound rimmed by a moat, a single bridge lane SW; huge gate; smooth slopes.
**Generator params.** **NEW ARCHETYPE: `citadelMound`** (steep glacis mound + moat ring + single
bridge-gate to a summit keep). `{archetype:"citadelMound", palette:"desert", landmark:"OBELISK",
laneCount:1, density:0.35, waterLevel:0.45, resourceNodes:2, resourceRichness:0.5, mobCamps:0,
towers:5, barriers:2, roughness:0.4, mirrorFair:false}`.
**Biome/palette.** `desert` (Aleppo limestone) / `verdant` (Bosphorus shore).

---

### C21 — The Eagle's Nest
**Real source.** **Alamut, Persia, 11thc** (the Nizari "Assassins") — a castle on a **narrow rock
ridge ~2,000 m up**, reached only by a **single hidden mountain path** along a knife-edge; siege was
almost impossible — starvation, not assault, took such eyries.
**Fortification type.** Mountain eyrie — ridge-top redoubt, single knife-edge approach.
**Tactical concept.** **Sheerest single-approach of all.** The map is mostly impassable cliff/void;
one **thin winding ridge path** leads to a small tight redoubt. Almost no frontage — a handful of
defenders hold the path; the drama is the exposed climb, not walls.
**Approach & killzone.** A **single narrow ridge path** (8–10 units wide) snaking from the SW up
between sheer drops (void/cliff on both sides) to a **small gate** and the tight eyrie redoubt; one or
two gate chokes along it.
**Ring/component breakdown.** **2 components:** (1) the ridge path + outpost gate, (2) the eyrie keep
(final). (Often a single brutal component in practice.)
**Gate/wall/keep anchors.** CLIFF/OOB void over most of the field; one thin walkable ROAD ridge; 1–2
GATE chokes; a small WALL ring at the top with 2–3 TOWERs; **CORE = eyrie keep** `(80,90)` on the
highest heightField.
**Layout.** A knife-edge diagonal ridge across a void field; tiny summit fort. (Shares void geometry
with the battlefield `skyPlateau` but as a linear path, not a mesa.)
**Generator params.** **NEW ARCHETYPE: `eyrie`** (mostly void/cliff field with ONE thin ridge path to
a tiny summit redoubt; 1–2 gate chokes). `{archetype:"eyrie", palette:"tundra", landmark:"RUINED_TOWER",
laneCount:1, density:0.5, waterLevel:0.0, resourceNodes:1, resourceRichness:0.6, mobCamps:1,
towers:3, barriers:2, roughness:0.55, mirrorFair:false}`.
**Biome/palette.** `tundra` (high Elburz peaks); `ashen`/`volcanic` reskins.

---

### C22 — The Drystone Enclosure
**Real source.** **Great Zimbabwe (Great Enclosure), 11–15thc** — sub-Saharan Africa's largest ancient
structure: a **massive mortarless granite outer wall** (~250 m round, 11 m high) with an **inner wall
forming a narrow ~55 m parallel passage** that channels anyone entering toward the Conical Tower.
**Fortification type.** Drystone royal enclosure — curved outer wall + inner parallel-passage channel.
**Tactical concept.** **A wall that funnels you sideways.** There's no maze and no moat — just a great
curved enclosure whose **inner wall creates a long, ~1-m-tight parallel passage** that forces any
entrant into a single-file channel (a natural killzone) before the sacred inner court and tower.
**Approach & killzone.** Enter the outer **wall gap** SW; instead of open ground you're in the **narrow
parallel passage** between outer and inner walls — a long single-file corridor overlooked from both
sides — leading to the **Conical Tower** court.
**Ring/component breakdown.** **2 components:** (1) outer wall + parallel passage, (2) inner court +
Conical Tower (final).
**Gate/wall/keep anchors.** A curved outer WALL (r≈130, one gap SW) + a concentric inner WALL offset to
leave a narrow passage between them; TOWERs sparse (drystone has few); **CORE = the Conical Tower**
`(40,40)`.
**Layout.** Two curved concentric drystone walls with a tight winding passage between; open inner court;
chevron-decorated wall flavour.
**Generator params.** **NEW ARCHETYPE: `drystoneEnclosure`** (curved outer wall + offset inner wall
forming a narrow single-file parallel passage to an inner court/tower). `{archetype:"drystoneEnclosure",
palette:"desert", landmark:"OBELISK", laneCount:1, density:0.35, waterLevel:0.1, resourceNodes:3,
resourceRichness:0.6, mobCamps:1, towers:2, barriers:2, roughness:0.4, mirrorFair:false}`.
**Biome/palette.** `desert`/`verdant` (Zimbabwean granite veld).

---

### C23 — The Castle Compound
**Real source.** **Fasil Ghebbi, Gondar, Ethiopia, 17thc** — a royal **compound of several stone
castles and palaces inside one crenellated curtain wall** with twelve gates; not one keep but a
*cluster* of fortified buildings sharing an enclosure.
**Fortification type.** Royal compound — a single curtain enclosing multiple keeps.
**Tactical concept.** **Multiple keeps, one wall.** Breaching the curtain doesn't end it — inside is a
**compound of several fortified buildings**, each a defensible strongpoint, so the interior is a
second, distributed battle (take each palace) rather than a single core. Reads as a **CLASH/DOMINION**
interior.
**Approach & killzone.** Enter a **curtain gate** SW; inside, an **open compound studded with 3–4
fortified palace-keeps** (strongpoints), each with its own door and fire — clear them in sequence /
hold the compound; the **royal castle** (largest) is the final objective NE.
**Ring/component breakdown.** **2 components:** (1) curtain wall + gate, (2) the multi-keep compound
(final — with the royal castle as the last strongpoint).
**Gate/wall/keep anchors.** A crenellated curtain WALL (`±140`) with several GATEs; inside, 3–4 small
WALL+TOWER strongpoints scattered; **CORE = the royal castle** `(90,90)`; the others are TOWER/keep
sub-anchors.
**Layout.** A large curtain enclosure containing several separate small forts (building footprints +
walls); open ground between them.
**Generator params.** **NEW ARCHETYPE: `compoundCluster`** (one curtain wall enclosing several
independent small keep-strongpoints; interior is a multi-objective). `{archetype:"compoundCluster",
palette:"desert", landmark:"RUINED_TOWER", laneCount:3, density:0.5, waterLevel:0.15, resourceNodes:4,
resourceRichness:0.6, mobCamps:1, towers:6, barriers:2, roughness:0.4, mirrorFair:false}`.
**Biome/palette.** `desert`/`verdant` (Ethiopian highland); `autumn` reskin.

---

### C24 — The Zigzag Rampart
**Real source.** **Sacsayhuamán, Cusco, Peru, 15thc** — the Inca fortress-temple above Cusco: **three
tiers of colossal zig-zag megalithic ramparts** (~540 m long, cyclopean stones up to 125 t), the
saw-tooth plan creating **~22 salient angles per level** that put any attacker in **crossfire** and
force the assault to zig-zag.
**Fortification type.** Megalithic zig-zag terrace ramparts (three tiers).
**Tactical concept.** **The wall is a saw.** Instead of a smooth curtain, each rampart is a row of
alternating salients and recesses — an attacker at any face is enfiladed from the two flanking angles,
and the **three tiers stack** the effect, so the ascent zig-zags up through three crossfire terraces.
**Approach & killzone.** Approach the **lowest zigzag rampart** SW; each recess you enter is raked from
its two salients (crossfire); climb through a stair gap to the **second** and **third** ramparts,
zig-zagging under fire the whole way to the temple-keep on the crown.
**Ring/component breakdown.** **3 components:** (1) lower rampart, (2) middle rampart, (3) upper
rampart + temple keep (final) — one component per tier.
**Gate/wall/keep anchors.** Three parallel **zig-zag WALL lines** (saw-tooth footprints) across the
field at `z≈-40, +15, +65`, each with TOWERs on the salients + a stair GATE gap (offset between tiers);
**CORE = crown temple** `(0,110)` high heightField.
**Layout.** Three saw-tooth rampart bands stacking up the NE; offset stair gaps; the zig-zag geometry
is the signature. (Related to the battlefield `cliffTerraces`/B24, but with **saw-tooth crossfire
walls** instead of straight terrace edges.)
**Generator params.** **NEW ARCHETYPE: `zigzagRampart`** (parallel saw-tooth wall lines with salient
TOWERs + offset stair gaps, stacked in tiers to a crown keep). `{archetype:"zigzagRampart",
palette:"verdant", landmark:"OBELISK", laneCount:2, density:0.4, waterLevel:0.15, resourceNodes:3,
resourceRichness:0.6, mobCamps:1, towers:6, barriers:3, roughness:0.45, mirrorFair:false}`.
**Biome/palette.** `verdant` (Andean); `desert`/`ashen` reskins.

---

## 3. Cross-cutting siege design notes

- **Bent / offset gates are the universal killzone primitive.** Krak, Beaumaris, Himeji, Xi'an's
  barbican, Golconda's spiked zig-zag, Mehrangarh's seven pols — all deny a straight ram/charge run.
  In the schema this is a **walled ROAD corridor with ≥1 dogleg + a barrier gate**, TOWERs lining it.
  Make it a reusable generator sub-routine (`bentApproach(gate, doglegs, barriers)`).
- **Concentric vs linear vs radial vs mound** are the four structural families:
  *concentric* (C2, C3, C6 — nested rings), *linear/depth* (C5, C7, C8, C16, C24 — parallel belts),
  *radial star* (C11, C12 — bastion polygons), *single-approach mound/island/eyrie* (C1 motte, C9,
  C10, C13 spiral, C17, C19, C20, C21 — one thread to a raised/isolated keep). The generator should
  key these families and pick gate/killzone logic per family.
- **The final component always carries the CORE.** However many rings, the last inward component holds
  the keep; earlier components hold WALL/GATE/TOWER lines with no CORE (clearing them = "breach", which
  the estate ladder treats as advancing the internal front to the next component).
- **Invariant 1 is never violated by a wall.** Walls seal the *interior* routing; the parcel's outer
  spawn edges stay open so mid-battle reinforcements can always land and cut a new lane to the keep —
  the classic "relief force arrives at the siege" moment.

## 4. Implementation appendix — NEW castle archetypes (deduped)

Disjoint from the battlefield archetypes in the [companion doc](./BATTLE-MAP-TEMPLATE-LIBRARY.md) §4.
Each is a one-line generation strategy for the map-maker session.

| New archetype | Castles | Structural family | Generation strategy (one line) |
|---|---|---|---|
| `motteBailey` | C1 | mound | Ditch-ringed open bailey + a raised heightField motte with one ramp to a keep. |
| `concentricRings` | C2, C3, (C6) | concentric | 2–3 nested wall rings, gates offset per ring, lists (kill-corridor) between, bent outer ramp. |
| `keepAndWalledTown` | C4 | linear | Outer wall enclosing a light street grid leading to a partitioned inner keep bailey via a deep barbican. |
| `spurCastle` | C5 | linear/mound | Cliff-flanked promontory with N transverse wall+moat lines staging to an end keep. |
| `tripleWall` | C7 | linear | Stacked parallel belts: moat → outer wall+terrace → inner wall, gates offset (defence in depth). |
| `tieredCastle` | C8 | linear | Chain of 3 progressively smaller full enclosures (gate+moat each) stepping to the keep. |
| `tidalIsland` | C9 | mound/island | Island bounds + water/void rim + ONE causeway approach + a spiral ramp to a summit keep. |
| `cragTail` | C10 | mound | Cliff-rimmed raised crag with ONE gentle ramp ("tail") + gate battery; three sides sheer. |
| `bastionStar` | C11, C12 | radial star | Star polygon wall (pointed bastions, no dead ground) + detached ravelins + wet ditch + glacis apron. |
| `spiralKuruwa` | C13 | mound/spiral | Single spiral walled corridor edge→centre, gated + loopholed, 180° reversals, central raised keep. |
| `waterCastle` | C14 | concentric | Concentric wide water moats + stone walls, each crossed by one bridge-gate, to a central keep island. |
| `walledCityGrid` | C15 | linear | Rectangular wall + barbican gate-traps (urn courts) + orthogonal avenue grid to a central tower. |
| `passFort` | C16 | linear | Full-width wall (edge to edge) with two in-series gate-towers + a killbox courtyard between. |
| `hillFortSwitchback` | C17, C18 | mound | Serpentine walled ramp up a cliff-hill with N gates on the bends, wall fire above, cliff below, summit keep. |
| `seaFort` | C19 | island | Oval/round island wall rising from all-around water, one enfiladed gate, tight interior. |
| `citadelMound` | C20 | mound | Steep glacis mound + moat ring + single bridge-gate to a summit keep. |
| `eyrie` | C21 | mound | Mostly void/cliff field with ONE thin ridge path to a tiny summit redoubt; 1–2 gate chokes. |
| `drystoneEnclosure` | C22 | concentric | Curved outer wall + offset inner wall forming a narrow single-file parallel passage to an inner court/tower. |
| `compoundCluster` | C23 | enclosure | One curtain wall enclosing several independent small keep-strongpoints; interior is a multi-objective. |
| `zigzagRampart` | C24 | linear | Parallel saw-tooth wall lines (salient TOWERs + offset stair gaps) stacked in tiers to a crown keep. |

**Shared new capabilities the castle archetypes need (flag to the map-maker session):**
1. **A WALL primitive** — the current `blob`/`band` add blobs; castles need **linked wall segments**
   (a polyline of `passable:false` cells of set thickness) with **parametric GATE gaps** and **TOWER
   anchors at junctions**. Add `wall(polyline, thickness, gates[], towers[])` — the single most
   important addition; ~15 of the 20 castle archetypes are wall-shaped.
2. **`bentApproach()` sub-routine** — a walled ROAD corridor with configurable doglegs + barrier gates
   + flanking TOWERs; reused by every bent/spiral/switchback entrance (C2, C13, C17, C18, C20…).
3. **Ring→component tagging** — the generator should emit a **component index per structure/region** so
   the estate ladder can slice a multi-ring castle into its ±161 component sequence automatically
   (outer=comp 0 … keep=final). This is the bridge between these maps and canon decision 4.
4. **Star/saw-tooth polygon generators** — `bastionStar` (regular star polygon + ravelin triangles) and
   `zigzagRampart` (saw-tooth line) need small parametric-polygon helpers.
5. **Reuse of battlefield capabilities** — `citadelMound`/`cragTail`/`spurCastle` reuse the
   battlefield **heightField-as-gameplay** hook; `tidalIsland`/`seaFort`/`eyrie` reuse the
   **void-rim (OOB) bounds** hook; `waterCastle`/`tripleWall` reuse water footprints. See companion §4.

**Total NEW archetypes across both docs:** 14 battlefield + 20 castle = **34 new**, taking the
generator from **7 → 41 named archetypes** (some castle archetypes are close cousins — e.g.
`concentricRings` covers C2/C3/C6 and `bastionStar` covers C11/C12 — so the *minimum viable* new-code
set is ~28 layout functions plus the shared `wall()`, `bentApproach()`, `carve()`, and hazard/void
primitives). Prioritize the shared **`wall()`** primitive first: it unlocks the majority of the castle
library in one addition.

---

*Companion: **[BATTLE-MAP-TEMPLATE-LIBRARY.md](./BATTLE-MAP-TEMPLATE-LIBRARY.md)** — 24 open-field
battlefield templates + the battlefield-archetype appendix, taxonomy, and schema methodology.*
