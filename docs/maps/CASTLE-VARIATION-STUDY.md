# Castle variation study — shapes, terrain-fit, and real-history suggestions (2026-07-21)

Owner asked: study castles, suggest variations; specifically SQUARE (Chinese) vs CIRCULAR castles,
and walls that adapt to limited terrain (river-side etc.). Here's the study + a buildable roadmap.
Current state after today: KEEP = 1 ring (motte), CASTLE = 2 same-height rings, PALACE = 3 rings
(final wall taller, spiral stair). All CIRCULAR/organic ovals so far.

## 1. SQUARE vs ROUND — the owner's instinct is exactly right, and it's a GAMEPLAY lever

**History:** the earliest stone castles WERE square — Norman keeps (the White Tower, Rochester,
Dover), and Chinese/East-Asian walls (Xi'an, the Forbidden City) are rectilinear. The owner's guess
is correct: **square is easier to build** — straight curtains, right-angle corners, no curved
masonry, stones don't need shaping. That's literally why they came first.

**Then round won, for a reason worth stealing:** square CORNERS are the weakness — dead ground the
defenders can't cover, and a right-angle is the easiest place for attackers to MINE/SAP (undermine
one corner, the whole tower drops). Round drum towers (Pembroke, Coucy, Krak des Chevaliers)
deflect projectiles, have no dead angles, and resist mining. Round is stronger but costs more skilled
masonry.

**⇒ Proposed as a real mechanic (ties to the upgrade economy, decision #7 ladder):**
| Shape | Build cost/time | Defense | Flavor |
|---|---|---|---|
| **SQUARE** (`layout: "square"`) | cheaper + faster (⚙) | **corner weakness**: corner cells take +X% siege/mine damage; a small dead-zone the defender's wall-walk can't fire into | Chinese / Norman / early-era; per-zone default for HUB (vermilion), etc. |
| **ROUND** (`layout: "round"`, today's default) | pricier + slower | even coverage, no dead angle, mine-resistant | European high-medieval; the "upgraded" look |

Cheap-square-vs-strong-round is a genuine choice, not just a skin — and it dovetails with the
"pay CT to upgrade your fort" ladder (§7 of SIEGE-MECHANICS-SPEC): square is the starter fort,
round the investment. **Buildable:** the generator already grows the ring from a parametric loop —
a square layout is the same loop clamped to 4 straight runs + corner towers; the siege block's
per-cell wall data + a `cornerCells[]` list feeds the mine/dead-zone rule.

## 2. TERRAIN-ADAPTIVE WALLS — the river IS a wall (owner: "flexibility when terrain is limited")

Real castles fit their site; they never ignored it:
- **River / coast / cliff edge:** you don't wall the water — the water is the wall. Caernarfon
  hugs the river; Krak sits on a spur; a sea-castle has a **water-gate / harbour** instead of a
  land gate on the wet side. Fewer walls where nature already defends.
- **Spur / ridge castle:** the curtain FOLLOWS the contour instead of a clean ring — a long thin
  bailey along the high ground.
- **D-shape:** flat back against a cliff/river, round front to the field.

**⇒ Proposed generator behavior (the parcel already knows its rivers/ridges/coast from the world
field):** when a castle parcel has a river/cliff/coast segment crossing near the fortress, the ring
CLIPS to it — the wall runs along the bank on that side (or omits a span and drops a **water-gate /
harbour** structure), and the ring only closes where there's open approachable ground. Result:
D-shaped and spur castles fall out naturally, no two castle parcels look alike, and it reads as
"someone built this HERE for a reason." This is the same windowing machinery the terrain already
uses — high leverage.

## 3. Other real-castle features worth adding (ranked by bang-for-buck)

1. **Barbican** — a forward fortified gatehouse in front of the main gate (a walled kill-corridor
   attackers must pass first). Cheap to add (one extra gate + short walls at the outer gate), huge
   for siege gameplay: the approach becomes a gauntlet. **Recommend first.**
2. **The bailey is a TOWN** — the town-sized gap we just built between palace rings is begging to
   hold a village/market (ties to TOWNS decision #20): houses, a well, market stalls, a chapel.
   Turns the palace into a living walled city. **Recommend second** (visual + world-depth).
3. **Barbican's cousin — the bent entrance** (Japanese *masugata* / Middle-Eastern bent gate):
   the gate passage turns 90° inside so attackers can't charge straight through. Pairs with #1.
4. **Machicolations** — overhanging galleries at the wall-top (drop-holes over the gate). We have
   merlons; this is the next masonry detail for the "impressive named location" palaces.
5. **Concentric height, done right** — we ONLY raise the final wall now (per owner). Real
   concentric (Beaumaris) also keeps the inner wall taller than the outer so inner defenders fire
   OVER the outer wall onto attackers between rings. Our tier system already supports this if you
   later want the middle-ground killing zone — flagged, not built.
6. **Keep variety** — shell keep (a ring wall, no central tower — the courtyard is the keep) vs
   tower keep (what we have) vs a great-hall palace. A cheap per-seed variation.
7. **Approach & glacis** — a cleared sloped killing-ground outside the wall (no cover for
   attackers). We scatter rocks now; a deliberate open glacis reads more defensive.

## 4. Recommended build order (all optional — your call)

1. **Square-vs-round layout** (the big one — new variation + economy hook). ~medium.
2. **Terrain-adaptive walls** (river/cliff clip + water-gate). ~medium, high visual payoff.
3. **Barbican + bent gate** (siege-gameplay depth). ~small.
4. **Town-in-the-bailey** (palace as living city). ~small-medium, ties to TOWNS.
5–7 as polish for the named palaces.

None of these are started — this doc is the menu. Say which (and I'll spec + build); the castle
`layout`/`shape` field will be additive to the `siege`/`castleGeom` contract (coord-logged before
it ships, per the module agreement).
