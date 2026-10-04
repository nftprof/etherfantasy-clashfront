# 07 — Naval & air layer (harbours, sea ships, airship docks, landing spots)

Owner question (2026-10-04): *"I haven't seen any sea ships?"*

## 1. Why there are no ships yet

The canon is ready. The build isn't.

| Piece | Canon | Built? |
|---|---|---|
| Sea lanes ("any port pair", cross-server voyage, regular Kraken water) | `WORLD-STATE-AND-TRAVEL.md` | ❌ no lane data, no ship entity on the overworld |
| `UnitClass` `SHIP` / `MARINE`, `BattleType` `NAVAL`, blockades | `docs/03`, `docs/04` §NAVAL | ❌ the sim has no fleet movement |
| Battle-map anchors `PIER`, `LANDING_PAD`; spawn classes `NAVAL_APPROACH`, `AIR_APPROACH` | `NAVAL-AIRSHIP-THREE-LAYER-MAPS.md` §3b | ⚠ 8 PIERs and 22 LANDING_PADs across 373 maps; approach classes **plan only**; only 14 maps carry the water-depth channel |
| Vessel access by land controlled (5 / 10 / 25 / 100 parcels) | same brief §7 | ❌ |
| The MOBA's naval hook (every 3rd Field wave lands by ship) | S2 code | ✅ the only ships anyone has seen, and only on water maps |

## 2. What the living world adds, in three steps

**Step 1: ships you can SEE (ambient, no new combat).**
- `data/living-world/sea-lanes.json` (this cycle) lists every lane:
  - sea lanes between `SEA_PORT` pairs;
  - airship lanes surface → Aeropolis → Emberfall / Empyrea.
- The overworld renderer moves **ambient merchant hulls and airships** along these lanes on a
  seeded schedule (`PRNG(world.seed, tick, laneId)`). The world looks alive before any naval combat
  exists.
- Harbours (doc 01) show moored ships (`ships: 1–2` per harbour in `castle-pois.json`). Airship docks
  show `airships: tier`.

**Step 2: ships that ARRIVE in battles (events).**
- Coastal battle maps get `PIER` + `NAVAL_APPROACH`; sky and estate maps get `LANDING_PAD` +
  `AIR_APPROACH` (map-designer PR, backlog D8).
- The events in `poi-archetypes.json` use them:
  - **NAVAL_LANDING**: a fleet appears at the deep-water edge, then seizes a pier or beaches at the
    shallows (S2 naval wave);
  - **AIRSHIP_DROP**: lands at a `LANDING_SPOT`/pad; can be shot down (S2: +150);
  - **SMUGGLER_RUN**, **SKY_RAIDERS**.
- The landing spot is the prize: **whoever holds it when the drop lands takes the drop** (doc 01).

**Step 3: ships you COMMAND (canon vessels).**
- Vessel classes unlock by land controlled (5 / 10 / 25 / 100).
- Players then can:
  - ferry armies on sea lanes (passage fee = CT sink; a share is burned);
  - **blockade** a hostile harbour (`NAVAL` battle trigger);
  - escort or raid **CARAVAN_RUN** ships (doc 05).
- **The Kraken** (`KRAKEN_SIGHTING`) is the one involuntary event. Lane risk rises with length; a lost
  fight drags the fleet to Blackmere (canon: "it's a place, not a death").

## 3. Lane risk (seeded per crossing, never per player)

```
krakenRisk(lane) = clamp(0.02 + 0.004 × lengthU, 0, 0.25)       // longer crossings, more Kraken
                   × season (storm season ×1.5, doc 01 §seasons; storms also close lanes)
```

The event fires as a telegraphed 12 s **KRAKEN_SIGHTING** (doc 01 events). Fleets can turn back during
the telegraph. Fair surprise, never an unfair one.

## 4. What the map designer needs (feeds backlog D8)

| Designer POI / anchor | Where | Placement rule |
|---|---|---|
| `HARBOUR` zone + `PIER` (existing anchor) | Coastal estates, castle harbours | Shore where a road meets water; plank into SHALLOW ending at DEEP |
| `LANDING_SPOT` + `LANDING_PAD` (existing anchor) | Estates (SMALL/MEDIUM 1, LARGE 2, GIANT 3, EPIC 4); sky castles | Flat open circle r ≈ 10–12 u, kept clear |
| `AIRSHIP_DOCK` (new) | Sky castles + surface airship ports | Mast + pad pair; the pad is a `LANDING_SPOT` |
| `NAVAL_APPROACH` / `AIR_APPROACH` spawn classes (planned) | Edges touching DEEP water / sky edges | Arrival vector for fleets and airships |
| `SEA_SHIP` prop (new, ambient) | Moored at piers; sailing along `sailRegions` | Visual only in step 1 |
