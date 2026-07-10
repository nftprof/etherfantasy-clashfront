# Continuous World Terrain — parcels are windows into one authored world (not independent stamps)

> **Map-maker session decision, 2026-07-07** (the session formerly "Clash Front Overworld design"; I now
> own `map-service/maps/*` + the terrain pipeline). **Extends** `CONTINENT-TERRAIN-ATLAS.md` (per-zone
> identity/biome/ranges/rivers) and `../briefs/MAP-MACRO-TERRAIN-AND-POSITION-CONSTRAINTS.md` (the world
> envelope + continuity contract). **Reviewers:** the **merged integration+network session** and **EF Moba
> game dev OP 48**. Owner input wanted on the city mapping (§3) and the terraform granularity (§5).

## 0. The decision (one paragraph)

The **default** terrain of the world is **one continuous, authored terrain field per continent**, and each
parcel's base-terrain map is a **window cropped from that field** — *not* an independently seeded per-parcel
"stamp." Cutting terrain per-parcel (stamps) stays as the **floor** for regions we haven't authored yet, but
the **preferred** default is a coherent world where **neighbouring parcels are actually continuous** —
rivers flow, roads connect, mountain ranges run for 100 parcels — modelled on **real cities from an aerial
perspective** (one reference per continent). We author this **in quality, one continent per week** as LLM
bandwidth allows, not in one rushed pass. Because the terrain is continuous, two things fall out for free:
(a) a new **CF-level aerial view** — the parcel thumbnails tile into a continuous map of roads/rivers/
buildings — and (b) coherent MOBA lanes, because a cross-parcel road *is* a lane network. Landowners may
terraform, but **only the interior of their parcel**: the **edge crossings** (where a road/river/ridge
enters and exits) are frozen, so continuity survives player edits.

## 1. Why continuous beats per-parcel stamps

| | Per-parcel stamp (old default) | Continuous world field (new default) |
|---|---|---|
| Coherence | desert can sit beside grassland; a road dead-ends at every border | rivers/roads/ranges run across many parcels; neighbours blend |
| CF aerial view | thumbnails don't line up — noise mosaic | thumbnails **tile into one aerial map** (roads + buildings read continuously) — §6 |
| Gameplay | each battle's lanes are unrelated | a cross-parcel **road = a lane network**; campaigns read geographically |
| Authoring | fast but throwaway | slower, **quality**, real-city-referenced — worth the weekly bandwidth |

Stamps aren't deleted — they're the **guaranteed floor** (every parcel always has *a* map, so the 3-lane
test drop-in is never hit; see `MAP-PIPELINE-GLOSSARY.md` precedence). The floor is replaced continent-by-
continent by field-windowed terrain as we author each continent.

## 2. The macro field gains a FEATURE-NETWORK layer (the new part)

The atlas/brief field today is three **smooth scalars** (elevation, moisture, temperature → biome). That
gives coherent *biomes* but not roads or a city street plan. So the world field gains a **vector
feature-network layer** on top of the scalars — continuous geometry in **world coordinates**, traced from
the continent's real-city aerial reference (§3), LLM-refined, owner-adjustable:

| Feature | Geometry | Becomes, in a parcel's artifact |
|---|---|---|
| `rivers[]` | polylines (already implied by the atlas) | water obstacle + **river-crossing** edge type; a ford/bridge at the crossing |
| **`roads[]`** *(new)* | polylines (street/highway network) | **lanes** (a road through the parcel = a lane); road edge-crossings = lane entry/exit |
| `ranges[]` | ridgeline polylines / mass regions | rock barrier + **mountain-pass** edge type |
| `coast[]` | coastline polyline | sea edge type; ports where a road meets the coast |
| **`districts[]`** *(new)* | urban/region polygons | denser structure anchors + urban ground; town/keep placement hints |

**These are continuous across parcels by construction** — a parcel just clips the segments that cross its
footprint. No cross-parcel messaging: adjacent parcels read the *same* field at their shared boundary, so
the seam matches (the brief's determinism-stitches-seams rule, now covering roads + districts too).

Asset: this extends **`data/world-terrain.json`** (the atlas §4 table is its scalar seed) with a
`features` block per continent. The scalar fields stay; the feature-network is additive.

## 3. Real-world aerial city references — one per continent (PROPOSED — owner to lock)

Each continent gets **one real city/place as its aerial design reference** — the guideline for how its
roads, rivers, coast, and districts lay out from above. This is *reference*, not a copy: we take the
*character* of the aerial layout (radial vs grid, river role, coastal shape) and fit it to the continent's
**fixed** parcel geometry and its atlas identity.

| Zone | Atlas identity | Aerial reference (proposed) | What we borrow from above |
|---|---|---|---|
| **HUB** | Capital Heartland, central massif, river crossroads | **Beijing / Chengdu / Xi'an** (owner-locked 2026-07-10, supersedes Paris) | a LAYERED capital: ancient imperial walled core (palace axis, gate towers) wrapped in modern concentric ring roads + radial expressways; secondary cities each pair a historic core with a modern ring (the "modern living, ancient history" pattern of today's great Chinese cities) |
| **BUS** | Northern Commercial Coast, urban, delta, N sea-ports | **New York** | dense grid + waterfront piers; commercial coast + harbour |
| **ENT** | Western Carnival Coast, blossom, resort marinas | **Rio de Janeiro** | coast ribbon between hills + sea; marina inlets; carnival waterfront |
| **EDU** | Academy Highlands plateau, blossom, Grand Academy | **Kyoto** | grid basin ringed by highlands; temple/academy campus districts |
| **HS1** | Cloud Gateway mesa, airship gateway (sky) | **Cusco / Machu Picchu** | terraced mesa; a single dock gateway; stepped districts |
| **HS2** | Floating volcano, storm-ash (sky) | **volcanic caldera city (e.g. Reykjavík rim)** | caldera ring; lava-field roads skirting the crater |
| **HS3** | Sky Sanctum, frost summit, sacred (sky) | **Lhasa (Potala)** | a sacred summit citadel; pilgrim roads converging up |
| **UW1** | Upper Caverns, fungal swamp (underworld) | **Derinkuyu / Cappadocia (underground)** | a warren of tunnels + chambers (structural, not aerial) |
| **UW2** | Deep flooded caverns, magma veins (underworld) | **flooded cave network / cenote field** | causeways between black lakes |
| **UW3** | Inferno Vault, magma throne (underworld) | **volcanic vent chamber** | a single central caldera, magma-river spokes |

**On "9 continents":** the atlas geometry is **10 zones**. Seven read as true aerial *cities* (HUB, BUS,
ENT, EDU + the three sky isles); the three underworld zones use **subterranean structural** references
(caverns, not aerial cities). If you want exactly **9**, the natural merge is treating UW as one
descent-continent (UW1→UW2→UW3 as depth tiers of one place) — that gives **9 continent identities**. **Owner
call:** lock the reference per continent + the 9-vs-10 grouping.

### 3b. City ERA per continent — medieval vs modern variety (owner 2026-07-10)

Each continent's **settled core** is built in a distinct **city era/style** (variety by continent); the
**rural land keeps the organic countryside** generator everywhere (owner: rural stays as current). The era
governs the URBAN road pattern + where castles/fortifications sit:

| Continent | Era/style | Urban pattern | Fortification |
|---|---|---|---|
| **Arcadia** (EDU) | **MEDIEVAL castle town** (jōkamachi — Himeji/Kanazawa; owner-locked ✓) | castle-centred: ring road around the walls, curved radial streets from the gates, short organic lanes (dead-ends fine), the Academy PALACE with a ceremonial approach | the **castle** is the town's heart; walls + gates on the battle maps |
| **Tianxia** (HUB) | **LAYERED Chinese metropolis** (Beijing/Chengdu/Xi'an — owner-locked 2026-07-10: "major cities in China today… modern living, high population, with an ancient history") | ancient imperial core (walled palace precinct, grand N–S axis, gate towers — Forbidden-City/Xi'an-wall pattern) **wrapped in modern ring roads + radial expressways** (Beijing 2nd/3rd-ring, Chengdu ring-radial); several such cities, not just the capital | the **walled palace city** is the fortification; ring roads are modern, the walls are ancient — both layers visible from the air |
| **Porthaven** (BUS) | **MODERN port metropolis** (NY/Singapore) | street grid + waterfront piers/quays | citadel/fort at the harbour mouth (star-fort era) |
| **Mythoria** (ENT) | coastal village ribbon (SE-Asia) | shore-following strands, marina inlets, stilt lanes | watchtowers + temple keeps on headlands |
| Sky isles (HS1-3) | terraced citadel (Cusco/Lhasa) | contour terraces + switchback ways up | summit citadel |
| Underworld (UW1-3) | carved warren (Derinkuyu) | tunnels + chambers, gallery rings | gatehouse chokes at level doors |

Rule of thumb: **era applies to the urban core only** — the basin/harbour/terrace district around each
continent's capital + towns. Everything else is countryside (organic clearings, world roads passing
through). Arcadia is the template implementation; other continents follow in their weekly authoring pass.

### 3c. Castle placement rule — castles live on ESTATES (owner 2026-07-10)

**Every castle/palace/keep POI is anchored to an L2 ESTATE, never to open ground or a lone L3 parcel —
and POI importance maps to estate size**: the continent's PALACE (capital seat) goes to the **biggest
estate** (EPIC where one exists), major CASTLEs to **GIANT** estates, minor KEEPs/temples to **LARGE**.
Rationale: an estate is mostly one owner's land, so a castle = the estate's heart, which matches canon
decision 4/5 (estates fight as linked components toward a **castle = final component**, and only estates
carry pre-designed castle/city-wall maps). Arcadia's five castles already follow this by construction
(deterministic picks in `map-service/tools/world_terrain_edu.mjs`): PALACE→the sole EPIC 1020371,
CASTLE Westgate→GIANT 2020367, CASTLE Southreach→GIANT 2020368, KEEPs→LARGE 3020352/3020351. Other
continents' field generators must apply the same rule.

## 4. How a parcel derives its map from the field

```
world-terrain.json (per continent: scalars + feature-network)
        │  window = the parcel's fixed footprint in world coords
        ▼
   crop scalars  → terrain cells (biome/elevation/walkable) ── base-terrain layer
   clip features → roads→lanes, rivers→water+ford, ranges→rock+pass, districts→urban anchors
        │
        ▼   the set of points where each feature meets the parcel BOUNDARY = the CONTINUITY CONTRACT
   base-terrain artifact  (+ later: seeding = wild/towers/resources)  →  full artifact (A)
```

The **edge-crossing set** — for each of the parcel's edges, *what* crosses (road/river/ridge/none) and
*where* on that edge — is the load-bearing output: it's what makes the parcel line up with its neighbours,
and it's exactly what the terraform rule freezes (§5). It also satisfies the MVP invariant "≥1 entry point
per edge a reinforcement can arrive from" (`MAP-LAYER-MODEL.md`) — road/river crossings *are* those entries.

### 4b. River crossings — REAL WATER (owner-hardened 2026-07-10; supersedes the earlier slow-only draft)

**The rule: water is real.** A unit that cannot cross water **cannot cross at all** — it is stuck on its
side of the river. Exemptions: **Flyer units** (fly over) and **Water-element units** (swim). Everyone
else needs a **ford or a bridge**. All on the SAME map data (the grid's WATER/ROAD cells; no re-bake):

1. **Phase 1 — NOW (MVP): walk on water.** Rivers are visual continuity only while the loader/engine
   seams land. Zero work.
2. **Phase 2 — REAL water.** WATER cells are impassable except Flyer/Water-element units. Crossings
   (fords/bridges) are the only paths for everyone else — they become THE tactical chokepoints.
3. **Bridges are LLM-designable + landowner-promptable.** The landowner prompts the map designer
   ("build a bridge across the river at …") → the design pass places a BRIDGE (ROAD over WATER, or a
   bridge structure). Bridges are **destructible structures** — cutting one is a real move. CT-sink via
   the invest/improvement path (`LAND-VALUE-AND-IMPROVEMENT`).

**Consequences (owner-accepted, by design):**
- **A bridgeless river DIVIDES the battlefield** — effectively two maps; forces that can't cross can't
  engage, and the battle **can end in a DRAW**. That is a legitimate outcome, not a bug. (Sim needs a
  DRAW/stalemate settlement rule — flag to the CF sim + engine sessions.)
- **Ranged fire crosses water** — units just across the river can be pinned/poked by ranged attackers.
  Unit AI should not stand and soak (reposition/retreat) — a MOBA-engine behaviour item (OP 48 / engine),
  not map data.
- **Moats become a defense strategy:** a landowner may deliberately design AWAY crossings (a moat) — a
  strong defensive posture whose cost is that battles on that parcel tend to draw (attackers with
  Flyer/Water armies, or siege that outranges the moat, become the counters). Economy/balance reviews
  this lever (invest tier could gate how much moat is allowed).

**Map-side implications (mine):**
- The generator's default maps stay engageable: the carve already creates **fords** (water→ROAD) where
  lanes/roads cross rivers — so out-of-the-box every river map has crossings; *removing* them is a
  deliberate design act.
- The **playability validator needs a water exception** (task): connectivity invariants become
  per-landmass — a water-divided map is VALID if each side is internally connected and each side's
  content (base, entries on that bank) is reachable within its landmass. Today's validator requires full
  connectivity, which would reject legit moat designs.
- `BRIDGE` joins the feature/structure vocabulary (designer DSL + build-spot layer) — generator follow-up.

### 4c. Road × parcel — the overlap taxonomy (parcels play what overlaps them)

Roads are **never forced into a parcel** — the parcel's battle map simply inherits whatever the world
network does at its footprint. The five cases (all already handled by the clipping; named here so every
session says the same thing):

| Case | What the world network does | What the battle map gets |
|---|---|---|
| **THROUGH** | a road transects the parcel | the road segment + BOTH edge crossings (frozen); entries sit on them — a *road battle* (fight for the corridor) |
| **BORDER** | a road runs along a parcel edge (real cities: roads ARE the property lines — frontage) | a road strip along that edge; that whole edge is a *frontage edge* — arrivals from that side come in on the road |
| **CORNER** | clips a corner | a short segment + two crossings on adjacent edges near the corner |
| **TERMINUS** | a local road dead-ends inside (it serves this land — a farmstead/town lane) | one crossing + an interior endpoint anchored on the parcel's settlement/build cluster |
| **NONE** | nothing crosses | pure countryside: terrain + organic clearings only. **Most parcels.** Units travel on open ground — no road needed |
| *(junction)* | two+ roads meet inside | the crossroads parcel — strategically hot (toll/market ground) |

Rivers use the same taxonomy (THROUGH/BORDER/CORNER/NONE); a river TERMINUS = a spring/lake source.

## 5. Terraforming & RIGHT-OF-WAY — the city-planning rulebook

Real cities solved "how do private lots and shared infrastructure coexist" long ago; we borrow their
rules directly. The protection level follows the **road tier** (and feature kind):

| Feature | Planning concept | Terraform rule |
|---|---|---|
| **Highway** | *public trunk / eminent domain* | Owner may NEVER sever or remove it. May reroute the **midspan** inside the parcel (bend it around a town), gate it (toll), build alongside — crossings + continuity absolute. |
| **Secondary road** | *right-of-way easement* | Reroutable within the parcel; crossings frozen. **Removable only with the "vacation" rule**: a shared road may be vacated only if every neighbour it serves keeps an alternative connected path (the network stays connected without it). |
| **Local road/lane** | *private drive* | If it serves ONLY this parcel (TERMINUS), the owner may freely reroute/remove it. If a neighbour depends on it, it's an easement — crossings frozen. |
| **River** | *natural watercourse (riparian law)* | Banks/midspan may be reshaped inside the parcel; **entry/exit points, width class and flow are frozen**; may not be dammed/removed (future mechanic at most). Bridges are additive structures. |
| **Ridge/pass** | *protected terrain* | The pass (gate crossing) is frozen; the rock is otherwise sculptable inside the parcel. |

Two more borrowed rules that keep battle maps sane:
- **SETBACK**: player structures must sit ≥ a small buffer off a protected corridor's centerline (the
  road stays wide enough to march and fight on — a validator rule, ⚙ tunable per tier).
- **GRANDFATHERING (non-destructive network evolution)**: when the world network gains NEW roads later,
  owner-designed parcels are never force-rebaked. New routes prefer unowned land; if one must touch an
  owned parcel it arrives as a **proposal** the owner accepts (or it follows the parcel BORDER instead —
  the frontage case). The artifact records `meta.worldFieldVersion`, and network updates are **additive**:
  they may add features but never move an existing frozen crossing on an owned parcel. Unowned parcels
  simply re-derive on the next bake — that's how the overworld improves without ever "messing up" what
  players built.

Who may do what, in one line: **the interior belongs to the owner; the through-lines belong to the world.**

Landowners (and the LLM on their behalf, or on system land) may terraform — but continuity is protected by
**freezing the boundary, freeing the interior**:

- **FROZEN (the continuity contract):** each edge's **crossing set** — the position + type where a road,
  river, or ridge enters/exits the parcel. A user who owns a parcel in the middle of a 100-parcel highway
  can reroute the road's **midspan**, dam the river's **centre**, build a town over it — but **the road's
  entrance and exit on the parcel edges stay put** (they can mainly adjust the **centre** of the map). So
  the highway still connects through their land; only the middle bends around their town.
- **FREE (the interior):** everything strictly inside the boundary — reroute midspans, place a town/keep,
  flatten a hill, add structures. This is the buildable/terraformable zone.
- **System land (~80%, unowned):** the LLM authors it fully and may **re-terraform the interior** in weekly
  quality passes — but the same edge-freeze applies, so a system re-terraform can **never break a
  neighbour**. Safe-by-construction.
- **Owned land:** user edits (or LLM-for-owner) are confined to that parcel's interior; edges frozen.

Net effect: **~80% of terrain stays coherent/system-owned**; player edits are locally contained and can't
tear the world's road/river/mountain through-lines.

## 6. New view — the CF aerial mosaic (a thumbnail zoom level)

Because terrain is continuous and every parcel already bakes a top-down **`thumb.png`** (file **D**), we get
a **new CF-level view for free**: tile the thumbnails at each parcel's world position and you see a
**continuous aerial map — roads, rivers, buildings** — as the overworld background. This is a **new zoom
level between** the strategic hex/parcel picker and the per-parcel battle map:

| Zoom | View | Source | Today |
|---|---|---|---|
| 1 · strategic | overworld hex/parcel picker | parcel graph (dots/hexes) | exists |
| **2 · aerial** *(new)* | **thumbnail mosaic** — continuous roads/rivers/buildings | tiled **`thumb.png`** (file D), world-registered | **this decision** |
| 3 · tactical | 2D command view | A1 `command.json` (file B) | exists |
| 4 · embodied | 3D hero / in-game | artifact (A) + `render.json` (C) | exists |

**Requirement for seamless tiling:** thumbnails must be rendered **world-registered** — fixed scale
(world-units → px), fixed orientation (+z north), no per-thumb padding/margin — so edges abut exactly. This
is a small `thumb.js` constraint (Map-maker owns it). As parcels get authored/seeded, the mosaic fills in;
un-authored regions show the stamp floor until their continent is authored.

## 7. Rollout & cadence (quality over speed)

1. **Now:** stamp floor everywhere (guaranteed map per parcel; kills the 3-lane drop-in).
2. **Weekly, per continent (LLM bandwidth):** author `world-terrain.json` `features` for one continent
   against its real-city reference (§3) → its parcels switch from stamp to **field-window**. Ship it,
   review the mosaic, iterate. HUB + a sky isle first (the Montreal/Singapore launch continents, atlas §1.3).
3. **Migration is per-continent & non-destructive:** authoring a continent re-derives its *unowned* parcels
   from the field; **owned/built parcels keep their edges frozen** and only re-derive where untouched.
4. **Optional later batch:** pre-seed (wild/towers) all of an authored continent, vs lazy near-player
   seeding — orthogonal to terrain (see the two-layer model in `MAP-PIPELINE-GLOSSARY.md`).

## 8. What changes for other sessions + open questions

**Map-maker (me):** extend `world-terrain.json` with the feature-network; make the generator **window+clip**
from it (not per-parcel noise) when a continent is authored; add the world-registered thumbnail constraint.
No change to the artifact/A1 schema — roads land as `lanes`, rivers/ranges as obstacles+edge-types,
districts as structure anchors (all already in the schema).

**Merged integration+network session — please confirm / flag:**
1. **Edge-crossing contract in allocate.** When CF hands a parcel battle to the engine, the artifact's
   lanes/obstacles already encode the road/river crossings. Confirm the engine consumes them **as-is**
   (deterministic), and that a battle's lanes = the parcel's road network (not a re-rolled 3-lane).
2. **Live map still wins**, unchanged — a running match's `battlefield` beats the static field-window.

**EF Moba game dev OP 48 — please confirm / flag:**
3. **Aerial mosaic** — does the overworld client want the thumbnail-mosaic zoom (view 2)? If yes, I'll emit
   world-registered thumbnails + a manifest of `{parcelId → world x/z, scale}` so tiling is trivial.
4. **Terraform interior/edge model** — does the WC2-style editor honour "edges frozen, interior free"? That
   keeps the 3D client's per-parcel maps continuous with neighbours.

**Owner — decisions wanted:**
- Lock the **real-city reference per continent** (§3 table) + the **9 vs 10** continent grouping.
- **Terraform granularity:** is freezing the *edge-crossing set* (position+type per edge) the right contract,
  or do you want whole edges (a strip band) frozen? (I recommend the crossing-set — least restrictive that
  still guarantees continuity.)
