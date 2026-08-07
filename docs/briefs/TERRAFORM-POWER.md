# ⛏ Terraform Power — marginal-change map editing under hard invariants (owner 2026-08-07)

**Owner direction:** user AIs may reshape their land, but only MARGINALLY per step — "they can
remove trees but not replace all trees in one instance… more change more cost… full redo needs to
pay more… VIP can make more drastic change… a gamified system, their AI works within constraints."
All numbers below are ⚙ proposals for the owner to tune.

## 1. HARD INVARIANTS — never editable, at any price, by anyone

1. **The parcel boundary polygon** — NFT-fixed geometry (canon decision 1/5b).
2. **Edge connections** — every road/river ENTRY and EXIT point on the parcel edge is locked
   (`worldField.edgeCrossings`): roads must still lead in where the overworld road arrives, the
   river must still flow from its entry edge to its exit edge. Inside the parcel a road may curve
   and a river may meander, but connectivity entry↔exit is preserved — the CONTINUOUS WORLD keeps
   running (rivers still run, caravans still arrive).
3. **The 10 engine terrain rules + 5 playability invariants + a clean traverse audit** — a design
   that fails any gate is rejected regardless of budget.
4. **Battle contract anchors** — spawn zones, cores, lane endpoints, estate castle-tier laws
   (rings/gates/stairs), hero-parcel designations.
5. **Theme = visuals only** — no design change ever alters gameplay stats (MAP-THEMES contract).

The AI-build pipeline enforces all five automatically: invariant violations are auto-rejected
before pricing is even computed.

## 2. The change budget — ⛏ Terraform Power (TP)

Every proposed design is DIFFED against the current live design on the typed terrain grid
(cell-class by cell-class) + structure/prop deltas. The diff is priced; the owner of the parcel
spends TP to apply it.

**Per-cell class-change weights (⚙):**
| change | TP/cell | flavor |
|---|---|---|
| FOREST → OPEN (clear trees) | 1 | lumberjacks — cheap, the owner's example |
| OPEN → FOREST (plant) | 1 | |
| ROCK → OPEN (remove boulder) | 2 | quarry crew |
| ROAD reroute | 4 | roadworks (endpoints locked per §1) |
| WATER add/remove/reroute | 8 | hydro-engineering — the expensive one |
| CLIFF add/remove | 8 | |
| structure anchor move (tower spot, build spot) | 6/each | |
| theme swap (visuals only) | flat 25 | separate ENABLE fee may apply (MAP-THEMES) |

**Superlinear total (anti-full-redo):** `cost = Σ(weighted cells) ^ 1.3` (⚙). Ten scattered
tweaks are cheap; bulldozing the map in one shot is punitive — exactly "more change more cost."

**Per-class instance caps (the "not ALL trees at once" rule, ⚙):** one edit session may change at
most **30%** of any class's cells (non-VIP) / **60%** (VIP) / **100%** (VIP3). Under the cap =
allowed if affordable; over the cap = split across days (incremental path) or use the NPC below.

## 3. Earning and buying TP (net-sink compliant)

- **Trickle:** each owned parcel regenerates ⚙ 10 TP/day up to a cap (⚙ 100 non-VIP / 250 VIP /
  600 VIP3) — free incremental editing forever, the owner's "or they can do it incrementally."
- **Purchase:** CT → TP at ⚙ 1 CT = 50 TP. **CT burns** (net-sink doctrine, decision 13/17). This
  IS economy-seam Hook 2 ("invest CT → map budget") given its concrete meaning.
- **VIP multiplier:** VIPs regen faster + higher caps + higher class caps (the "more drastic"
  unlock); VIP3 additionally unlocks image-reference rebuilds (AI-MAP-BUILD tiers).

## 4. The full-redo path — 👷 the Royal Surveyor (NPC)

"Redo the entire map" is a purchasable NPC SERVICE, not a normal edit: flat ⚙ price (e.g. 20 CT,
burns) + resets the parcel to a fresh AI build honoring §1 invariants, cooldown ⚙ 7 days. Framed
as hiring the surveyor's crew — the gamified skin for "pay more to redo everything."

## 5. Why this composes cleanly with what's built

- The AI-build worker already produces a candidate design → adding `diffPrice(current, proposed)`
  is one pure function over two typed grids (deterministic, testable, sweep-able).
- The gates already reject invariant violations; pricing sits AFTER gates, so an illegal design
  never costs anyone TP.
- The pending-design approval step becomes the "confirm spend" screen: *"This change clears 214
  forest cells and reroutes 12 road cells — 312 ⛏ TP. Apply?"*
- Overworld continuity was already data (`edgeCrossings`) — §1.2 just makes it a validator.

## 5b. Execution model — "their AI" IS our claude-code agent (owner clarification 2026-08-07)

For most VIPs, "their AI" is not a model they bring — it is **the hosted claude-code agent (the AR
box) running on their behalf**, invoked with THEIR prompt inside THEIR constraint envelope (TP
balance, class caps, VIP ring, parcel invariants). One agent stack, many envelopes. Non-VIP BYO-key
runs the identical playbook with the user's key. Practical consequences:
- The agent is prompted to return **2–3 distinct candidate designs** per request (different takes
  on the same brief) — previewing candidates is FREE, applying one costs its TP price. Variety per
  user comes from prompts + seeds + budgets, not from different models.
- The constraint envelope travels IN the job context, so the agent self-censors early ("that
  clears 80% of the forest — over your 30% cap; here is the largest compliant version and a
  3-day incremental plan") instead of burning passes on rejectable designs.
- Per-user metering (passes, tokens, jobs/day ⚙) sits on the shared stack; VIP raises the meters.

## 6. Open ⚙ for the owner

- weight table values, exponent (1.3?), class-cap %s, trickle/caps, CT→TP rate, surveyor price +
  cooldown; whether estates price per-parcel or per-estate (suggest: per-parcel, castle district
  locked to dev/estate-holder rules).
