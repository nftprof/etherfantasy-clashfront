# Base-building defense layer — build/upgrade towers on your land (owner ask 2026-07-11)

> Goal: a second account can OCCUPY a real parcel, pay CT/resources to build & tier up towers on
> its buildSpots, and defend when the first account attacks — on real generated maps. Plus wild
> parcels get a seeded garrison so there's always something to attack.
>
> **Lane boundary (owner 2026-07-11):** the **Map session (D) only makes the MAP** — geometry,
> the empty **buildSpot slots**, geography-baked castle POIs. **Everything that GOES INTO the
> map is CF Overworld eco (C)** — one structure-writing owner, whether the writer is a PLAYER
> (building on their owned parcel) or the CF game ENGINE (seeding a wild garrison *in lieu of a
> player*). So: **A = engine (done), C = build API + persistence + UI + WILD SEEDING, D = map/slots only.**

## The structure layer — where it lives (answering the owner)

**Yes, it's server-stored and I (engine) already read it.** The chain:

```
Territory.structures: StructureState[]   ← CF SERVER save (packages/shared types.ts:115)
   { key:'TOWER'|'WALL'|'GATE'|…, track, level, hp, maxHp, anchor:[x,y] 0–1 }
        │  CF game.ts engineAllocateContext maps each → battlefield.structures
        ▼
allocate.battlefield.structures[] { anchorId, kind:'TOWER', side:'DEFENDER', x, z, tier|level, hp, hpMax }
        │  MOBA engine makeBattleWorld consumes it
        ▼
battle: a real defensive tower, TIER-scaled stats, at the built anchor
```

So the data model (`StructureState`) exists, storage exists (`Territory.structures`), and the
battle wire exists. **What's missing is the BUILD/UPGRADE action + its UI + the wild seed.**

## ✅ DONE — Agent A (engine, deployed on SG 2026-07-11)

- **`makeBattleWorld` consumes the INLINE battlefield** (arena + spawnZones + `structures`, no
  terrain grid) — exactly what `engineAllocateContext` sends from `Territory.structures`. Player-built
  towers now reach the battle (previously the loader rejected the no-terrain shape → canon fallback).
- **Tower TIERS 1–5** (`TOWER_TIERS`): `tier|level` scales hp/dmg/range/atkSpd (tier 1 = canon
  1400/85/21 … tier 5 = 6000/300/25); explicit `hp`/`hpMax` honored so a damaged tower persists.
- **Engine reads `structure.tier` (or `.level`) and `.hp`/`.hpMax`** — CF just needs to send them.
  A top-level `structures[]` alongside a `{ref}` OVERRIDES the artifact's baked structures (player
  build layer is authoritative, canon decision 9).

**So the engine is ready.** The moment CF writes towers into `Territory.structures` with a tier and
sends them in the allocate context, they appear and fight in the battle.

## ▢ TODO — Agent C (CF: build API + persistence + UI) — their lane, biggest piece

1. **`POST /api/build`** — place/upgrade a defense module on a parcel you own:
   `{ parcelId, anchorId (a buildSpot id), key:'TOWER'|'WALL'|'GATE'|…, }` →
   - Validate: caller owns the territory; `anchorId` is a real buildSpot; **count ≤ the artifact's
     buildSpot cap** (read `battlefield.buildSpots.length` — e.g. this EDU parcel has 7).
   - Charge CT/resources on the **tier cost ladder** (⚙ `build.towerCostCt = [base × growth^tier]`,
     decision-17 accounted: the spend is a SINK, ≥10% burns — reuse the `develop` cost path).
   - Mutate `Territory.structures` (add new at `level:1`, or `level++` on upgrade), set `hp=maxHp`,
     `anchor` = the buildSpot's normalized [x,y]. Persist + `version++`.
2. **Send `tier`/`level` + `hp`/`hpMax` per structure** in `engineAllocateContext` (map
   `StructureState.level` → the wire `tier`; the engine already consumes it). Also pass the
   defender's built towers on the DEFENDER side, attacker's staging as ATTACKER.
3. **UI** — the base-building surface on an owned parcel card: buildSpot slots, place/upgrade
   buttons with CT cost, tier readout, HP. (The `develop`/`raze` UI is the pattern to copy.)
4. **Repair** — CT to restore a damaged tower's hp (siege persistence; `develop` cost path again).

## ▢ TODO — Agent C (CF game engine: WILD garrison seeding) — the CF eco's job, NOT the map's

Owner ruling (2026-07-11): **wild parcels should carry a garrison** (a few towers + mob camps) so
they're attackable PvE targets — NOT bare. **This is CF game-engine seeding, in lieu of a player** —
the SAME structure-writing path a player uses to build their base, but the CF eco fills a WILD
parcel's slots since there's no owner to do it:
- When a battle allocates on a `parcel.kind==='WILD'` parcel, CF seeds **N ⚙ `wild.towerCount`
  DEFENDER towers** onto the parcel's buildSpots (from the map's slot layout — D's geometry) +
  **`wild.mobCamps`** mob camps, scaled by zone strength (`WORLD-ZONE-DETAIL`). Deterministic from
  `parcelId` (safe to compute lazily / cache in the wild territory's `structures`).
- These ride the same `battlefield.structures`/`mobs` the engine already renders — **zero engine
  change** (Agent A already consumes tiered towers + mobs).
- **The Map session (D) does NOT seed wilds** — D only delivers the empty buildSpot slots + the
  map's geography (castle POIs baked by world-field). CF decides what garrison occupies a wild.
- Fast path for testing: this can be the same `POST /api/build` write, called by the CF engine for
  a SYSTEM-owned wild territory, so player-build and wild-seed share one code path.

## Test loop this unlocks

Account B occupies a real parcel → builds/tiers towers (C) → Account A attacks → the battle renders
B's actual towers at their tiers (A, done) → resolution ladder settles it (A, done). Wild parcels
(D or the CF stopgap) give solo attack targets with towers. **All on real generated maps.**
