# SKY-CITY LIVING — how a stacked city is actually built, and what living in one is like
*(owner 2026-09-03: "build on top of this for a more complete realistic how a city like this
would be built, with details on living in one — convenience etc; Apple's HQ egg may be an
interesting analogy." Companion to `docs/briefs/SKY-STACKED-CITY-BATTLEMAPS.md`; the built
demonstrator is `data/moba-maps/DECK-HS2-RING.json` → map.etherfantasy.com/designer/decks?map=DECK-HS2-RING.)*

## 1. The Apple Park key — why the ring answers everything

Apple Park is one building shaped as a ring, and every one of its famous properties maps
one-to-one onto a stacked sky city:

| Apple Park | The sky ring city |
|---|---|
| One continuous ring — no "far wing"; walking the loop passes every department | **The Ring deck is ONE street.** Every home, market and inn is on the same loop; there is no wrong turn, only clockwise or counter-clockwise |
| The courtyard park in the middle — every window faces green | **The central void is the light well**; its floor (the deck below) is the orchard park + pond. Every ring house fronts either the sky (outer rim) or the park (inner rim) |
| All service traffic underground (parking, freight, the theater) — the campus surface is pedestrian-only | **The Underworks deck** carries every cart, pipe, reactor and warehouse. A resident never meets freight on the promenade — it moves one deck below and rises at the four lift wells |
| Prefabricated segments craned into place; base-isolated foundation | **Arc-segment construction** on the isle's spine pylons (§2) |
| The roof as a working surface (solar) | **The Roof Walk** — gardens, rain cisterns, and the airship pads. Sky traffic docks above your head, never on your street |

The one-line doctrine: **horizontal rings for life, vertical layers for function.** People live
on a loop; functions stack. That is what makes a three-deck city *convenient* instead of a maze.

## 2. How it gets built (the construction sequence — becomes lore + visible detail)

1. **The spine pylons.** The isle's rock is drilled and crystal-anchored pylons rise at the four
   quarter points — the same shafts later house the LIFTS. (Everything else hangs off these
   four; in-game, they are why lifts are where they are, and why sappers dream about them.)
2. **The Underworks plate first.** The full service disc is laid while still open to the sky —
   power runs from the reactors, freight loops, cisterns' downpipes, granary cellars. Cheapest
   to build, hardest to change: the under-city is the city's skeleton.
3. **The Ring, in arc segments.** Eight prefabricated deck arcs are flown in by heavy airship
   and keyed onto the pylons — each arc arrives with its rim housing terraces already framed
   (this is why ring houses sit in regular rhythm: they are the segment sockets). Battle tie-in:
   canon decision 9's buildable-base sockets are the SAME sockets — wartime towers bolt where
   peacetime houses did.
4. **The Roof Walk last.** Roof gardens, the rain-catch cisterns (gravity-feeds every fountain
   and trough below), and the pads. The city is topped off, literally.
5. **Growth** = another ring (a second concentric ring deck, or a second storey on the arc
   segments) — never sprawl. A sky isle has no suburbs; it has *storeys*.

## 3. Living in one — the convenience ledger (what a resident actually experiences)

- **Nothing is far.** The Ring's mid-line loop is ~670 world-units around (~½ km at the
  declared ~0.74 m/unit) — the far side of town is a 4-minute walk, or one lift ride + a
  quarter-loop. Apple Park's own loop is ~1.1 km; we are cozier.
- **The vertical commute is seconds, not stairswells.** Four quarter-point lifts serve all
  three decks; grand stairs descend into the park for the scenic route. Rule of thumb baked
  into the layout: *any address = (which quarter, which deck)* — wayfinding a child can use.
- **You never meet a cart.** Freight enters at the rim tunnel mouths, moves on the Underworks
  loop, and rises inside the lift wells straight into the market quarter's back rooms. The
  promenade is stroller-and-pet territory, full stop.
- **Light and weather.** The inner rim fronts the light well (park view, morning light off the
  pond); the outer rim fronts the open sky (sunset over the void — premium view, premium rent).
  Ember-crystal lamps pace the loop at lamplighter intervals; under-deck arcades stay dry in
  storms — the ring roof IS the umbrella.
- **Water and food.** Roof cisterns catch rain → gravity feeds the ring fountains and the park
  pond → the orchard and granaries below. A sky isle's water budget is visible city furniture.
- **The market quarter** concentrates commerce on one SE arc (stalls, workshops directly below
  on the Underworks, granaries beside them) — the rest of the loop stays residential-quiet.
  The two inns flank lift mouths, where a traveler steps off. (Towns canon, decision 20: the
  inn is where rumor boards read the Chronicle.)
- **Safety culture of the edge.** Rails line every deck edge — with honest GAPS at connector
  mouths (the vessel-deck physics rule). Sky-city children learn "walk inside the lamp line"
  the way harbor children learn about the quay edge. It is the city's signature thrill and its
  signature funeral.
- **Pets everywhere** (canon decisions 9/18): gather-assigned pets work the orchard and the
  Underworks; flyers commute between decks freely — the "3D traffic" of the 5th-Element read
  is mostly THEM.

## 4. The same geometry at war (why this is still a battle map)

The convenience machine inverts elegantly under siege — every amenity is a mechanic:

- **The Underworks is the siege basement**: rim tunnel mouths = under-deck arrival; take the
  reactors and the floodlights above die (§4.2 of the stacked-city brief).
- **The four pylon lifts are THE chokepoints** — peacetime commute, wartime murder-holes.
  Hold two opposite lifts and the ring is cut into defensible arcs.
- **The Ring fights like one long street** — a running battle around the loop, houses as
  cover, the market quarter as the plunder magnet (materials, per canon decision 10).
- **The Roof Walk is the air door**: pads for reinforcement, archers over both rims, cisterns
  as (destructible) water-weight hazards.
- **The park is the killing floor** — the one open field, watched from every inner rim window.
- Rails-with-gaps: knockback near an edge remains the sky city's signature kill.

## 5. Status + next steps

- **Built now:** `DECK-HS2-RING` (generator `map-service/tools/deck_prototypes.mjs`, viewer
  `/designer/decks`) — the lived-in demonstrator with houses/markets/inns/workshops/granaries/
  warehouses, orchard park + pond, lamps, cisterns, roof gardens, 4 lifts, park stairs, rim
  tunnels. Concept data (`cf-deck-prototype/1` + additive `buildings[]`/`props[]`), not yet a
  playable map.
- **Owner questions:** (a) adopt the ring as THE template for sky TOWNS (decision 20 towns in
  HS zones = ring cities of this pattern, sized by town rank)? (b) should the Spire of
  Emberfall (7 decks) be a stack of ring storeys — same doctrine, taller? (c) do ring houses
  = the wartime build-spot sockets 1:1 (recommended — it makes peace/war the same geometry)?
- **Engine milestone unchanged:** decks/connectors pathing + N-deck audit (stacked-city brief
  §3) — these prototypes are the acceptance targets.
