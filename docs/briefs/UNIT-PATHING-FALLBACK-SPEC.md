# UNIT PATHING FALLBACK — engine-side doctrine (owner 2026-08-31)

**Owner report:** "units running at rocks or walls … not sure if it's not able to reach their target
or stuck or something, perhaps give each soldier line different directives so if their primary can't
reach they automatically do something else. I really shouldn't see units on both sides running into
building or walls non-stop walking into it at all."

Two halves. The MAP half is DONE (v28, CF ParcelMap): every artifact now guarantees
**walkable ⇔ reachable** (see §3). This brief specifies the ENGINE half for **EF Moba (Network)** —
the match server owns unit movement. The permanent fix is doctrine, not a nudge tweak.

## 1. Collision truth comes from the ARTIFACT, never the render meshes

- Build the movement/collision field from `terrain.walk` (the artifact walk bitmask) + the structure
  contracts (`blocking: "WALL_RING"` = the ring polyline at t 4.2 with `gateOpenWidth` arches;
  `blocking: "SOLID"` = drum radius; `blocking: "DOOR"` = arch open/closed by gate state).
- As of GEN_VERSION 28 the mask is HONEST: one connected field, zero walkable-but-unreachable cells
  (CI-enforced per artifact — components=1, isolatedCells=0, 100/100 audit walks). If the engine
  derives collision from anything else (render meshes, its own rasterization), it re-creates the
  stuck-unit disease no map can fix.

## 2. Per-line fallback directives (the owner's rule)

Every soldier line/order carries a DIRECTIVE CHAIN, not a single target. On pathfind failure or
progress stall the unit does not retry the same move — it degrades down the chain:

1. **PRIMARY** — the ordered target (enemy core / structure / rally point).
2. **NEAREST REACHABLE STAND-IN** — if A* fails or the target cell is unreachable, retarget the
   nearest reachable cell to the primary (BFS ring around it); attack-move toward it.
3. **LANE FALLBACK** — if no stand-in within ~12u is reachable, rejoin the nearest lane/route
   waypoint (artifact `lanes[]` / `routes[]` are guaranteed-walkable chains) and resume the push.
4. **HOLD + ENGAGE** — nothing reachable at all (should be impossible on v28 maps): hold position,
   engage anything in range, re-plan on a slow timer (2–5 s) in case a gate opened / wall fell.

**Anti-grind invariant (the visible symptom):** a unit whose position advances < 0.5u over ~1.5 s
while under a move order MUST abandon the current path step and drop one level down the chain.
No unit ever plays its walk animation into a blocker for more than ~1.5 s. That single watchdog
is the difference between "army flows around the castle" and what the owner filmed.

**Dynamic blockers:** gates (`states CLOSED/OPEN/BROKEN`) and destructible walls change reachability
mid-match — invalidate cached paths for the affected region on every structure state change; units
in fallback re-probe their PRIMARY first (so a broken gate pulls the line back on target).

## 3. What the map now guarantees (CF side, DONE, GEN_VERSION 28)

- **Walkable ⇔ reachable** on the walls-stamped model (walls solid, arches open) — flood-verified at
  generation, CI-audited per artifact (`castle_geometry.test.js` R-REACH-ALL, 1,276-check sweep).
- Sealed field pockets got **POSTERN doors** (new `castle_gate_Np` GATE anchors, r 5.5, wood
  DOUBLE_LEAF); river-split banks got carved fords; anything unconnectable is masked walk=0 so no
  order can ever point into it.
- Spawns, lane waypoints, resources and build-spots all stand in the ONE connected field.
- Re-baked + shipped: `data/moba-maps/siege-test.*` and all 11 estate artifacts.

## 4. Acceptance (owner-visible)

Watch any siege for 3 minutes: zero units walk-cycling against a wall/rock/building. Units whose
lane is blocked visibly re-route (around the drum, through the postern, back to the lane) or stand
and fight — never grind.

*Relay: logged in `docs/coord/MOBA-CF-COORD.md`. Questions → append there, not DM.*
