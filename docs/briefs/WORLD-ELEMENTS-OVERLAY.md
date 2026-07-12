# WORLD-ELEMENTS OVERLAY — the shared lore-population layer (EF Hunt ↔ CF)

> **For any team that wants to put named lore places ONTO CF's world maps** — EF Hunt first
> (quest sites, NPC spots, story landmarks, dungeon doors, camps), CF's own events layer later.
> Written by the CF ParcelMap Design Agent (Agent D), 2026-07-11. Owner intent: EF Hunt reuses
> CF's maps and must be able to POPULATE them with lore elements that CF can then reuse — "two
> of the same world". CF's elements already flow to Hunt via the world fields
> (`docs/briefs/EF-HUNT-MAP-HANDOFF.md`); **this is the reverse path.**

## 1. The file convention

One JSON file per zone per layer, committed to this repo:

```
data/world-elements/<ZONE>.<layer>.json
```

- `<ZONE>` = the zone code (`ENT`, `UW2`, …) — must have an authored field in
  `data/world-terrain/<ZONE>.json` (the overlay rides the field; no field ⇒ no merge yet).
- `<layer>` = who owns the file: `hunt` = the EF Hunt team's layer, `cf` = CF's events layer
  (Agent C), etc. The layer name is taken from the FILENAME (authoritative); `_meta.layer`
  should match. Filename order (lexicographic) is the deterministic precedence order between
  overlay files of the same zone.

Live examples (seeded 2026-07-11, marked PROPOSED — the Hunt team owns them):
`data/world-elements/ENT.hunt.json` (Carnavale story-start set) and
`data/world-elements/UW2.hunt.json` (Blackmere main-story set).

## 2. Schema

```json
{
  "_meta": {
    "layer": "hunt",
    "zone": "ENT",
    "owner": "EF Hunt team",
    "note": "...",
    "coords": "zone svg coords (same frame as data/world-terrain/<ZONE>.json)"
  },
  "elements": [
    {
      "id": "ENT-HUNT-MIDWAY-TENT",
      "kind": "QUEST_SITE",
      "at": [21.2, 449.4],
      "name": "The Fortune-Teller's Tent",
      "note": "...",
      "parcelId": "optional explicit L3 parcel",
      "singularId": "optional link into data/singulars.json",
      "loreRef": "optional doc/section reference"
    }
  ]
}
```

- **`id`** (required) — unique across the zone's field `pois[]` + `castles[]` + ALL overlay
  files. Convention: `<ZONE>-<LAYER>-<NAME>`. A colliding id is **skipped with a warning**;
  precedence is deterministic: **field first, then overlay files in filename order** (within a
  file, array order).
- **`kind`** (required) — an OPEN string (`QUEST_SITE`, `NPC`, `CAMP`, `DUNGEON_DOOR`, `SHRINE`,
  `MARKET`, `STAGE`, …). Consumers filter by the kinds they know; unknown kinds pass through
  harmlessly. Kinds are normalized to UPPER_SNAKE in the battle-map A1 output.
- **`at`** (required) — `[x, y]` in **zone SVG coords** (y down), the same frame as the zone's
  field JSON and the `data/hexagon-city-source/l3/<ZONE>.json` parcel bboxes. Must sit inside
  the zone field's bbox (+25% slack) or it is skipped with a warning.
- **`name` / `note` / `singularId` / `loreRef`** (optional) — carried through verbatim to every
  consumer surface (world field, parcel window, battle-map décor, A1).
- **`parcelId`** (optional) — PINS the element to one explicit parcel: it windows into that
  parcel only (resolves bbox-overlap ambiguity where estate bboxes overlap). Without it, plain
  bbox containment decides which parcel window(s) receive the element.

### The POINT-ONLY rule (hard, loader-enforced)

Overlay elements are **points**. Any element carrying geometry (`pts`, `footprint`, `polygon`,
`width`) is skipped with a warning. Roads, rivers, ridges, coasts, castles — everything with
extent — stays the base-geometry layer, which is **Agent D's frozen scope** in
`data/world-terrain/<ZONE>.json`. If a story needs a new road or island, that's a request to
Agent D, not an overlay entry.

## 3. How elements surface (three consumer surfaces)

The merge is **read-time**: field JSONs and committed maps are never rewritten; deleting an
overlay file restores the world byte-identically.

1. **World-field consumers** — `loadWorldField(zone)` (`map-service/maps/worldfield.js`) reads
   every `data/world-elements/<ZONE>.*.json` (sorted), validates, and exposes the merged list as
   **`field.overlayElements`** (each element tagged with its `layer`). They are deliberately NOT
   mixed into `pois[]`; a consumer that wants the union of every named place calls the exported
   helper **`allPlaces(field)`** → pois + castles (tagged `layer: "field"`) + overlay elements.
2. **Parcel windows** — `featuresForParcel(field, parcel)` windows overlay elements into a
   parcel exactly like castles (bbox point test; explicit `parcelId` pins — see §2), transformed
   into the ±161 battle frame through the same fit as everything else, returned as
   `overlayElements: [{ id, kind, layer, at:[x,z], name?, note?, singularId?, loreRef? }]`.
3. **Battle-map décor + A1** — `generate()` materializes the parcel's windowed elements as
   **RUIN-class passive décor anchors** (the seeded Chronicle-layer precedent): rng-free snap to
   the nearest OPEN natural cell on the final grid (never a road/ford/water; no open ground
   within ~60 world-units ⇒ dropped), **never painted into the walk grid** — walkability, the 5
   playability invariants, and every other byte of the artifact are untouched. They ride
   `obstacles[]` (kind = the element's kind, r 4) and pass into the A1 Battlefield JSON as
   `passable: true` obstacles keeping `layer`/`name`/`note`/`singularId`/`loreRef`. Cap **6 per
   parcel**, deterministic priority (layer-file order, then id); anything dropped (cap or no
   open ground) is logged in the artifact's `meta.overlay.dropped`.

Because the décor pass uses no randomness, a parcel in a zone **without** overlay files
regenerates **byte-identically** to before this layer existed, and a parcel WITH one regenerates
as the identical map **plus** the décor — the re-runnable-seed-layer property, same as ruins.

## 4. Ownership

| Layer | File | Author | Review |
|---|---|---|---|
| Base geometry (rivers/roads/ridges/coasts/castles/pois) | `data/world-terrain/<ZONE>.json` | **Agent D** (frozen; edge crossings are the terraform-frozen continuity contract) | canon |
| `hunt` | `data/world-elements/<ZONE>.hunt.json` | **EF Hunt team** | Agent D reviews placement conflicts (an element on OOB/water gets snapped or dropped — check `meta.overlay`) |
| `cf` | `data/world-elements/<ZONE>.cf.json` | **Agent C** (CF events) | Agent D reviews placement conflicts |

## 5. Contribution flow (PR-based)

1. Author/edit your `data/world-elements/<ZONE>.<layer>.json` on your own branch of THIS repo
   (satellite-branch convention — never directly on `claude/clash-front-overworld-mkcyia`).
2. Run the overlay suite locally: `node map-service/maps/test/overlay.test.js` (loader warnings
   list every skipped element and why).
3. PR to the core session; Agent D reviews placement (id collisions, off-field points, elements
   that can't find open ground), then merges. Elements go live for every consumer the moment the
   file lands — no regeneration step (immutable cached artifacts pick it up at their next
   `designVersion` bump or cache expiry, exactly like the ruin layer).

## 6. Determinism contract (read before writing a consumer)

- Same files ⇒ same merge ⇒ same maps, byte for byte. No `Math.random`, no clock.
- Precedence everywhere is (field, then filename order, then array/id order) — documented above.
- The overlay is additive-only from the map pipeline's point of view: it can never move a spawn,
  lane, structure, resource, or terrain cell. If your element MUST clear ground for itself,
  that's a map-design request (invest/design path), not an overlay.
