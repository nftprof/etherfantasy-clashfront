# Switchback stairs — the grade-relief design for tight tall castles (spec, not yet built)

**Problem (CASTLE-AUDIT-V27):** 56% of flights exceed 40.5° because tight wards / short wall stretches
can't fit a `rise × 1.2` run in ONE straight flight (worst: estate 3110087, 76.1° — a ladder). They are
legal today (stepped stone, never ramps), but a real mason builds a **switchback**: two flights joined by
a landing, doubling the run in the same footprint.

## Data contract (additive)
Each stair flight gains two OPTIONAL fields (absent = today's ground-to-walk flight):
- `yFoot` (number, default 0) — the height the flight STARTS at. `rise` stays "this flight's climb".
- `landing` ([x,z], only on the lower flight) — the shared platform where the upper flight begins;
  renderers draw a small flat pad (width × width) there.
A switchback = TWO consecutive entries in `ring.stairs[]`:
1. `{ mode:"PARALLEL", foot:F, top:L, yFoot:0, rise:h/2, landing:L, … }`
2. `{ mode:"PARALLEL", foot:L, top:T, yFoot:h/2, rise:h/2, … }` — reversed direction along the wall.
Grade per flight = atan((h/2)/run) — the same wall stretch yields HALF the grade.

## Generator rule (computeStairs v28)
When neither the perpendicular nor any single parallel stretch reaches grade ≤ 45° for this wall:
try a switchback on the best wall stretch — run each = min(GRADE_RUN(h/2), stretch − 2.4); accept iff
both flights pass the full guard set (wall clearance / tower / foot-on-ground; the landing obeys the
same clearances as a top). Only if the switchback also fails does the compressed single flight remain.

## Renderer rule (preview3d = reference; MOBA client mirrors)
Draw each flight from `yFoot` to `yFoot + rise` (today's kit assumes yFoot 0 — one-line change), plus a
landing pad when `landing` present. **A renderer that ignores `yFoot` will float or bury a switchback's
upper flight — the field ships only after both renderers honor it** (coordinate via MOBA-CF-COORD).
