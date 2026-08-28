# Castle architecture — build the real fortification, then miniaturize (owner 2026-08-28)

Governing principle (owner): **study how real castles are built and USED for defence, build that
properly, THEN miniaturize it** — so the small in-game castle still embodies the real fortification
relationships (a wall you walk and shoot from, towers that flank it, a gate you must force). Not a pile
of cylinders: a working fort, shrunk.

This is the design north-star for the castle generator (`generate.js`), the designer 3D reference
(`preview3d.html`), and the MOBA 3D client. Concrete render/data rules live in
`CASTLE-STAIRS-AND-WALLS-SPEC.md`; this doc is the WHY they must satisfy.

## 1. The real elements & their defensive purpose (what we study)

| Element | Real purpose (how a castle is USED) | In-game must read as |
|---|---|---|
| **Curtain wall** | the continuous defended barrier; too high to scale, thick enough to resist. | a solid stone ring, unbroken except at gates. |
| **Wall-walk / allure** | defenders move + fight ALONG the top, reinforcing any threatened stretch. | a **continuous** walkable parapet the whole way round — **through the towers** (see below). |
| **Crenellations (merlons/embrasures)** | shoot from cover between the teeth. | toothed parapet edge (cover pattern), never a block on the walk. |
| **Mural towers / bastions** | project PAST the wall so archers **enfilade the wall foot** (shoot along the face at anyone at the base) + command the field; break the wall into defendable sections. | **drum base + turret above** with **arrow-loops facing outward + along the flanks** (`archerPorts`). |
| **Arrow loops / machicolations** | shoot out / drop on attackers with near-total cover. | dark slit ports on the turret's outward faces. |
| **Gatehouse / gate** | the ONE deliberate weak point, therefore the most defended — the fight funnels here. | a real door on the approach, flanked, forceable (CLOSED/OPEN/BROKEN). |
| **Road to the gate** | attackers + trade both arrive by the road; the gate sits where the road meets the wall. | **one wide door centered on the road** (≥1.5× road width). |
| **Mural stairs** | get defenders UP to the walk quickly; deliberately awkward for an enemy who takes the wall. | **walkable stone steps** (two patterns: perpendicular up, or parallel along the wall). |
| **Keep / donjon** | the last redoubt; commands the whole enclosure. | the central multi-tier tower (already built). |
| **Baileys / concentric wards** | defence in depth — each ring bought separately. | nested rings, keep innermost (already built). |
| **Moat / ditch** | stop siege engines + undermining; force the approach to the gate. | water/marsh band (already, where terrain gives it). |

## 2. The miniaturization pipeline (build full, then shrink)

1. **Design at real scale, real relationships.** A curtain you can stand a soldier on, towers spaced so
   their arrow-loops cover the wall between them, a gate on the road, stairs that reach the walk.
2. **Shrink to the ±161 arena** keeping the RELATIONSHIPS, not the metre counts: the wall stays a walk
   you can run along and shoot from; towers still flank the wall between them; the gate is still the
   funnel. Parcel size scales the ring COUNT / circumference, never the arena (canon 4/5b).
3. **Simplify the geometry, keep the function.** Low-poly drum + turret + slit, toothed parapet, box
   steps — readable at a glance, but every piece still does its defensive job. A player looking at it
   should be able to say *where they'd attack and how they'd defend*.

## 3. The rules this fixes (owner 2026-08-28, all in the spec)

- **Wall-walk is CONTINUOUS through every tower.** Tower = solid drum at ground (units circle it), then a
  turret **hut above the walk with openings on the two wall-facing sides** (the walk passes through) +
  **arrow-loops facing outward** for stationary archers. Data: `form:"DRUM_TURRET"`, `wallWalkThrough`,
  `passageW`, `archerPorts`.
- **Access is WALKABLE.** Default = **stone STEPS** (walkable at grade). A renderer may substitute a
  **RAMP only if it is WOOD and ≤ 40°** (a ramp is gentler than the stair, never steeper, and reads as
  a timber siege/service ramp, not masonry). Data per flight: `rise/steps/riser/tread/width/grade/mode/
  material:"STONE"/render:"STEPS"/rampAlt:{material:"WOOD",maxGrade:40}`.
- **One wide gate centered on the road.** Road crossings merge to a single door on the road centre, arch
  ≥ 1.5× road width.

## 4. Split of work
- **CF ParcelMap (me):** the generator DATA (rings/towers/gates/stairs with all the above fields) + the
  `preview3d.html` reference render (drum+turret+arrow-loops, stepped stairs, continuous walk, wide road
  door — reference for the client). Spec + this study.
- **MOBA BattleEngine RAW:** the in-game 3D client must render to this same contract (it currently draws
  ramps + solid towers). Relayed in `docs/coord/MOBA-CF-COORD.md`.
- Open (my next passes): tower spacing so arrow-loops actually cover the wall between them; parapet
  crenellation teeth on the client; stair-grade toward ≤40° where the ward affords the run.
