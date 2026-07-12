# Command Mode — "feel like a real commander" (deep review, owner ask 2026-07-11)

> By the netcode/deploy session (Agent A) after building + live-testing the steer stack with the
> owner. What exists, what's weak, and a phased path to command mode being *the* fantasy — RoTK
> general on a hill — rather than a debug viewer with buttons. Owners per DEPTH-LAYERS-AGENT-SPLIT.

## 1. Where we are (after the 2026-07-11 sprint)

Working today: move/focus/rally + waypoint queue (shift+right-click) + swarm focus + stances
(⚔ ALL_IN / 🛡 DEFEND / 🎯 FOLLOW / ✋ CLEAR) + soldiers-remaining + legend + hero-view orientation
+ order acknowledgment + control-toggle cooldown. Event feed streams (kills/towers/cores) but has
no UI yet. That is a competent RTS **input** layer. What it is NOT yet: a reason to *stay* in
command view when hero mode is more fun. A commander's fantasy is built from **information
asymmetry, consequence, and drama** — not more buttons.

## 2. The three pillars still missing (ranked)

**P1 — CONSEQUENCE: battles should be decided by orders, not just DPS.**
- Morale/rout (the big one): units below an army-strength or local-outnumbered threshold BREAK
  and flee toward their spawn; a rallied regroup restores them. Suddenly REGROUP/DEFEND are not
  cosmetics — they are how you prevent/force routs. Deterministic thresholds, zero pathfinding.
  (A: sim. Small.)
- Flanking bonus: units attacked from >90° off their facing take ⚙ +15% — makes the waypoint
  queue (envelopment) mechanically real. (A: sim, cheap — we already have positions/facing.)
- Fire attack (RoTK signature): burn a forest patch → area denial + panic. Needs artifact
  terrain (D) + sim burn state (A). Phase 3.

**P2 — INFORMATION: a commander reads the field, subordinates report.**
- Battle log UI (feed exists on the wire — C renders; sprint #7C).
- Threat pings + "reports from the line": auto-callouts ("Left flank collapsing", "Tower down",
  "Master under fire") — derived client-side from events + hp deltas. (C)
- Fog option for command view (see only near your units; scouts widen it) — makes hero mode a
  RECON tool: jump in to see, jump out to command. The two modes start feeding each other. (A+C)
- Officer status card + order target-lines (sprint #5/#8) — always know what your army is DOING.

**P3 — DRAMA: make moments legible and loud.**
- Swarm ring, rout animations (units streaming back), horn sound on stance change, banner drop
  where a Master falls, slow pulse when a core is under 25%. (C, cosmetic, cheap, huge feel.)
- End-of-battle COMMANDER REPORT: orders issued vs outcome ("your 14:02 regroup saved 12
  soldiers"), casualties by phase, decisive moment. Feeds decision-19 (the Chronicle). (C)

## 3. Command surface v2 (proposed, small increments)

| Order | Input | Sim behavior (deterministic) | Status |
|---|---|---|---|
| Move Master | left-click ground | dest, 20s hold | ✅ |
| Focus fire | left-click enemy | officer atk + swarm ≤34u | ✅ |
| Rally/regroup | right-click | converge, lane script wiped | ✅ |
| Waypoints | shift+right-click | chained flags, 70%-arrival advance | ✅ NEW |
| Stances | buttons | ALL_IN/DEFEND/FOLLOW/CLEAR | ✅ |
| **Split force** | drag-select % or 50/50 button | two groups with separate rally chains (`world._groups`) | proposed next — the single biggest "real commander" unlock |
| **Retreat!** | button | all units disengage + flee home, take flank hits | proposed (pairs with morale) |
| **Scout** | right-click w/ mode | one fast unit runs a path, wide vision (needs fog) | proposed |
| **Duel challenge** | click enemy Master | canon decision-14 duel, mid-battle | design w/ owner |

## 4. Sequencing (each step ships alone)

1. **Now-next (C):** battle log UI + threat pings + swarm ring + officer card + target lines +
   hotkeys (finish sprint #5/#7C/#8/#9/#11/#12) — the information layer, all client-side.
2. **A, one sim batch:** morale/rout + flanking + Retreat order (+tests). Turns stances into
   strategy. ~a day.
3. **A+C:** split-force groups (group id on rally/stance wire; `_groups` in sim). The RTS leap.
4. **C+A:** command-view fog + scout order — differentiates command info from hero info.
5. **A+D:** fire attack once artifact terrain is in live battles; **C:** commander report → Chronicle.
6. Later, canon-gated: supply/fatigue (anti-turtle), night/weather, formations (owner: "maybe
   later"), duel challenge.

## 5. Guardrails (so it stays shippable)

Every mechanic above is a deterministic parameter bias — no pathfinding, no per-unit micro AI, no
new netcode primitives (all through the existing 1.5s command channel + cmd:1 gate). Nothing here
touches combat power balance except morale/flanking, which are ⚙ dials. Command mode stays a thin
client over the same authoritative match — hero mode always remains the high-agency option
(canon decision 11's two surfaces, one state).
