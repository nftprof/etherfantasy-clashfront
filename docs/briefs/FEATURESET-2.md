# Feature Set 2 — Intel, Neutral Towns, Active Wilds, Development, Tutorial Library

> Product-owner scope (2026-07-02, post-MVP-loop): "defence attack, wild enemy, towns u can
> pillage and take over without battle, scouting/fog with ?? and fuzzy numbers (don't slow the
> game — no mandatory scouting), territory gives passive visibility, full tutorial menu."

## F1 — Intel & fog (the scout system)

Per-player parcel intel levels; **ownership is ALWAYS public** (NFT record + map readability),
**military contents are fogged** (garrison/army compositions, exact strengths, defenses):

- `ACCURATE` — adjacent to own territory (radius grows with contiguous cluster size:
  `1 + floor(sqrt(clusterSize)/2)`, cap 4 ⚙), parcels within an army's sight (1; SCOUTS 3 ⚙),
  or recently scouted (decays to FUZZY after `INTEL_DECAY_TICKS` ⚙ ≈ 1 day).
- `FUZZY` — next band out: strengths shown as deterministic bands ("~100–200") seeded by
  (parcelId, day) — stable across refreshes, no info leaking.
- `UNKNOWN` — beyond: terrain + owner color visible, contents render as **??**.
- **No mandatory scouting**: attacks are always allowed; the march preview shows the intel grade
  and warns on fuzzy/unknown ("you don't know what's in there").
- SCOUTS preset purpose: cheap/fast/weak, sight 3, faster march ⚙ — a moving reveal brush.
- Server-authoritative: /api/state and WS deltas filter military fields per viewer's intel.

## F2 — Neutral towns (bloodless conquest)

Seed a % of parcels as SYSTEM **TOWNs**: population + treasury + prosperity, NO garrison.
An army arriving at a neutral town takes it **without battle**: pendingChoice PILLAGE (loot,
town burns) or OCCUPY (normal oversight rules). Towns near the frontier are richer ⚙.
This is the "free real estate" pull that draws players outward — and into each other.

## F3 — Active wild enemies

Monsters stop being furniture: each monster garrison rolls (seeded, per N ticks ⚙) to RAID an
adjacent player/NPC territory — a monster army marches out (visible! interceptable!), attacks,
then returns to its lair (or occupies-as-wild if the defender was crushed and land unowned).
Raid frequency scales with local overgrowth/frontier distance ⚙. Defended land (garrison,
future: pets/structures) deters raids ⚙. The frontier BITES back.

## F4 — Territory development (defence/attack economy)

The Develop action: parcel card button, CT cost per level (`base×1.6^level` ⚙ from balance):
- **AGRI** → +food production/tick (feeds garrisons + provisioning discount at home ⚙)
- **DEF** → garrison combat multiplier in battles on this parcel (`1 + 0.1×level` ⚙) — the
  defence answer until CoC structures land
- **ECON** → +CT trickle to governor per tick ⚙ (first passive CT faucet)
- **MIL** → raise-cost discount on this parcel ⚙
Levels visible on parcel card + prestige accents at high levels (existing lobby/gold accent).
NPC kingdom develops too (dumb: round-robin).

## F5 — Tutorial library

A 📖 "Tutorials" menu (next to 🎓/?): browsable list of ALL tutorials & tips grouped by system
(Basics, Claiming, Armies & Provisions, Combat & Intel, Towns & Development), each entry
replayable on demand; unseen ones badged. Data-driven off the existing tip/tutorial registries.

## Build order

1. Sim+server (worktree, parallel with the in-flight client batch): F1 intel model + state
   filtering, F2 towns, F3 raids, F4 develop — all with tests, deterministic, green.
2. Client (after current batch merges): fog rendering (?? / fuzzy bands / intel-grade in march
   preview), town flows, Develop UI, F5 library, wild-raid alerts.
3. Balance pass on the full loop; screenshots; deploy update.
