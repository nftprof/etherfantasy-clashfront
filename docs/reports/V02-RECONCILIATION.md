# v0.2 Vision Bible + Addendum E — Reconciliation vs Locked Canon

> Sources: [`../VISION-BIBLE-v0.2.md`](../VISION-BIBLE-v0.2.md) +
> [`../ADDENDUM-E-PentaPet-Species-Affinity.pdf`](../ADDENDUM-E-PentaPet-Species-Affinity.pdf)
> (extracted text alongside). Status: **overarching new spec, adopted as vision**; this report
> maps it against the built system + locked canon, flags conflicts, and lists product-owner
> questions. Nothing in canon is changed by this report — each ✅/⚠ item gets folded in only
> after the owner answers the questions below.

## What aligns (no action needed)

| v0.2 says | Status |
|---|---|
| Hex parcels ≈ 14 acres, smallest political unit | ✅ matches locked scale law (240×240 m) |
| Enemy territory blocked until battle | ✅ built (blockade rule) |
| Sea via fixed harbor routes | ✅ canon (docs/01 routes; NAVAL later) |
| Real-time travel consuming time/food/morale | ✅ built (food/step, morale starvation) |
| Existing EF MOBA = battle engine; accelerated NPC battles; drop-in joins; timeout → war score | ✅ canon + battle-engine plan M1–M5 |
| Supply from settlements/depots/harbors/caravans; broken supply → morale → desertion | ✅ canon (docs/01 §5) — depots/caravans are new *content* on the same system |
| Circular economy with plunder/recovery | ✅ built (FS3 splitter, raze/salvage, conservation) — v0.2 extends it with a MATERIALS loop |
| Server stores recipes not meshes (AI polygon construction) | ✅ same philosophy as our seeded-battlefield determinism |
| AI services roster | ✅ superset of docs/06 — adds Construction/Blueprint/Logistics AI |
| "Human attention is limited", AI-first, logistics over micromanagement | ✅ adopt as pillars |
| Wild terrain launches EF Hunt; travel through wild → Hunt encounters | ✅ fits docs/05; encounter-on-travel is a new hook |

## ✅ RESOLVED by product owner (2026-07-02, same day)

1. **Pets = the soldier TYPES.** PentaPets ARE the rank-and-file units (not officers); Masters
   command, Hero = you. Units are EXPENDABLE — "they come and go". The workforce/identity
   simulation layer is explicitly SKIPPED for now ("let's not overkill this layer").
2. **Terraforming = terrain design, never geometry.** Each parcel has a designed battle map
   (trees/water/boulders — fixed MOBA-style map design). AI SERVER auto-designs empty land:
   builds randomly into battle terrain, ITERATES, SAVES server-side. A zoomed-out small-PNG
   render of each parcel map becomes its overworld thumbnail/texture overlay. The LANDOWNER may
   freeze the AI and take over as map designer (Warcraft-II-editor model). OCCUPIERS only ADD
   (towers/military structures) — destructible in battle, pillageable for materials after a win.
3. **Battles are full MOBA matches** (20–40 min, armies on both sides, real server build).
   AI-vs-AI runs the SAME simulation with accelerated ticks. Instant WarScore resolution in the
   demo = placeholder until battle-engine M1+.
4. Cohort/materials/blueprint phases deferred accordingly (Phase B skipped for now; C/D later).

## Superseded analysis (kept for the record — need owner decisions)

### 1. PentaPets replace population — and fight ⚠⚠⚠
v0.2/Addendum E: PentaPets ARE the population (workers, soldiers, companions, battle units),
with species affinities (Earth/Fire/Water/Grass/Electric/Wind × civilian/military/economy),
`Productivity = BaseSkill × Experience × Affinity × Morale × Equipment`, AI-assigned workforce.

Conflicts with locked canon: **"pets are strictly defensive — only Masters (and Hero) invade"**
(2026-07-02) and with `Population` as an abstract resource + `UnitStack` soldiers trained from it.

**Proposed reading (needs blessing):** the old "pet" concept splits into roles of ONE species
system — PentaPets fill *all* the ranks: workers (civilian professions), rank-and-file soldiers
(military affinities: Earth heavy infantry, Wind cavalry, Fire siege…), guards, companions.
**Masters remain the officers; the Hero remains you.** Then `UnitClass` maps onto species
affinities and "armies = Masters commanding PentaPet troops" — RoTK generals leading creature
legions. The defensive-only rule dies as written but its intent (NFT companions never
permanently lost) survives as the KO/recover rule for *named/NFT* pets.

### 2. Scale: millions of individuals ⚠
"Population = actual PentaPets with identities" × 292,766 parcels × thousands-per-parcel =
millions of simulated individuals. Untenable literally; standard solution: **cohort simulation**
(buckets of species × profession × experience-band × morale-band) with full individual identity
ONLY for NFT/named/hero-tier pets. Needs owner sign-off since it touches the fantasy ("every
creature has an identity" → true for the ones players ever meet).

### 3. Terraforming vs "map is FIXED" + seeded interiors ⚠
Locked: overworld geometry immutable; parcel interiors = pure seeded function (lazy cache).
v0.2: landowners permanently reshape terrain; matter conserved. Reconciliation: terraform
applies to PARCEL INTERIORS only (never overworld geometry), stored as **persistent deltas on
top of the seeded baseline** — battlefield = f(seed) + terraformDeltas. Costs the pure-cache
property (deltas must be stored) but only for touched parcels. Matter conservation = a second
conservation ledger (materials), mirroring the CT one.

### 4. Landowner vs Occupier powers ⚠
v0.2: Landowner = terraform/zone/city-planning; Occupier = walls/forts/depots/military.
Current build: governor does ALL development. Open: does landowner zoning *constrain* occupiers?
What can an occupier do when the landowner is absentee (the dominant case at launch)?
Also "captured territories may be occupied, **preserved**, or plundered" — define *preserved*.

### 5. Materials/blueprint economy layer ⚠ (phasing, not conflict)
Geology → mining → crafting → construction → cities → plunder → recovered materials →
marketplace. A full physical-resource layer on top of CT (which stays the money). Blueprint
NFTs with royalties plug cleanly into the FS3 splitter (a new royalty bucket). This is a major
version-2 program — needs deliberate phasing so it doesn't destabilize the playable core.

### 6. Smaller deltas
- **Morale 20%–120%** (multiplier semantics) vs canon 0–100 (score). Pick one representation.
- **"Live, Scheduled or Accelerated"** — "Scheduled" is new: battles booked into a future
  window (async defense across time zones — answers an existing open question). Define it.
- Allied treaty passage → diplomacy feature (planned, unbuilt).
- Population-growth loops move from abstract growth to PentaPet breeding (EF Hunt hook).

## Recommended integration sequence

1. Owner answers the questions (below) → canon edits (README glossary, 03/05/08) in one pass.
2. **Phase A (cheap, soon):** rename/reframe — soldiers become PentaPet troops by species
   (labels + unit classes), workforce %s replace raw population display, morale multiplier map.
3. **Phase B:** workforce cohort sim (professions drive AGRI/ECON/MIL outputs), AI allocation.
4. **Phase C:** materials + geology + crafting (new conservation ledger), depots/caravans.
5. **Phase D:** terraform deltas + blueprint NFTs + AI construction.
Each phase keeps `pnpm -r test` green and the demo playable.
