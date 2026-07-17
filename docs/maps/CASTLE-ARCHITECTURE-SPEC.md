# Castle architecture — real medieval fortresses for the game (owner directive 2026-07-15)

> Owner: "the castle looks like tombstones — we need medieval castles: full stone, higher elevation,
> multi-level walls you can walk onto, transparency when your units are behind buildings, LotR-level
> impressive for the named locations. Study real designs. Visual tricks fine — gameplay untouched.
> Start with walls. Full creativity."
>
> This spec: (1) the real-castle study mapped to our fortification ladder + the five named palaces,
> (2) the STANDARD KEEP / CASTLE / FORTRESS-WALL build as parametric geometry for the shared
> renderer, (3) the best-castle-siege-map layout, (4) the data contract (my generator) vs the render
> vocabulary (MOBA-owned shared module — this doc is their build brief; renderer freeze respected).

## 1. Real-design study → our ladder

| Tier (decision 22) | Real references | What we steal |
|---|---|---|
| **KEEP** (LARGE estates) | Motte-and-bailey (Cardiff, Warwick's mound); Norman square keeps (Rochester, the White Tower) | the MOTTE: keep sits on a raised earthwork — elevation IS the statement. One curtain wall, one gatehouse, one massive square keep with corner turrets |
| **CASTLE** (GIANT) | **Concentric castles — Beaumaris, Caerphilly, Krak des Chevaliers** | TWO wall rings with a killing field between; drum towers every wall run; twin-towered gatehouse; inner ward higher than outer (defense in depth reads instantly from the air) |
| **PALACE / city fortress** (EPIC) | Carcassonne (double city walls, 52 towers), Malbork (brick leviathan), Mont Saint-Michel (the vertical silhouette), Minas Tirith as the fantasy ceiling | THREE nested enceintes climbing a hill; a skyline — the eye should read gate → ward → ward → keep/palace crown from any angle |
| Named-palace styles | see §2 | each palace gets a STYLE KEY, not bespoke meshes |

**The three universal rules** stolen from every great real castle:
1. **Elevation** — fortresses climb. Motte for keeps, stepped wards for castles, a crowned hill for
   palaces. (Our heightfield already supports this — the castle footprint emits a raised mound.)
2. **Continuous curtain walls** — a wall is a WALL: an unbroken crenellated curtain between towers,
   never a dotted line of boxes. Towers punctuate; gates interrupt; nothing else does.
3. **The silhouette** — one dominant vertical (the keep / palace tower) + rhythmic towers + banners.
   Recognizable from across the map, like every LotR establishing shot.

## 2. The five named palaces — style keys (real reference each)

| Palace | styleKey | Reference | Silhouette |
|---|---|---|---|
| Bastion of Dominus (UW2) | `drowned_bastion` | Krak des Chevaliers × sea-fort Bodiam (moat) | squat, brutal, black basalt; water-filled moat ring; iron portcullis glow |
| Palace of Masks (ENT) | `carnavale` | Venice Doge's Palace × Carcassonne | pale arcaded walls, gilded onion finials, banner-heavy, festival colors |
| Grand Academy (EDU) | `collegiate` | Oxford quads × Mont Saint-Michel spire | cloistered walls, one great spire library-tower as the keep |
| Vermilion Palace (HUB) | `vermilion` | **Forbidden City × Xi'an city walls** | red walls, gold-tile hip roofs on every tower, gate PAVILIONS not turrets |
| Grand Exchange (BUS) | `hanseatic` | Malbork × Lübeck Holstentor | brick, stepped gables, twin fat gate towers, crane-and-dock ward |

Style keys change materials/roofs/ornament ONLY — the parametric kit (§3) is shared. This is also
the seam where the ⚙ CT asset packs plug in later (`ASSET-PACKS-CT.md` — a castle skin is a pack).

## 3. The parametric castle kit (renderer vocabulary — for the SHARED MODULE)

All pieces are cheap primitives + canvas textures, in the module's existing idiom (flat-shaded,
baked light). No new asset pipeline. **Gameplay-neutral: collision stays the data layer's circles/
cells — these are visuals draped over the same footprint.**

### 3a. CURTAIN WALLS (start here, per the owner)
- Input: a wall **polyline ring** with gate breaks (from the artifact — §5).
- Extrude: stone curtain `h≈9u` (keep 7 / castle 9 / palace 11), thickness ≈ 3.
- **Three visible levels**: base batter (sloped footing, +20% thickness), the wall body (stone
  texture — the existing `stone_01/03/04` floors tile perfectly), and the **wall-walk**: a parapet
  ledge inset on the defender side with **crenellations** (merlon boxes every ~2.2u, embrasure gaps)
  — the "walls you can walk onto" READ. v1 it's visual; units drawn on it are §4's trick; real
  parapet pathing is a later engine feature (flagged, not required).
- Wall TOWERS auto-punctuate every ~26u of curtain run: drum towers (r≈4.5, h≈wall+5) with
  crenellated crowns + conical roofs (style key decides drum vs square vs pavilion).
- **Gatehouse** at each gate break: twin towers flanking a recessed arch, portcullis grate
  (emissive slits), murder-hole shadow band, drawbridge deck if the moat ring exists.
- Damage states (HP is already on WALL/GATE structures): ≥66% intact / 33–66% cracked overlay +
  rubble at the foot / <33% BREACH — the segment renders collapsed with a climbable rubble ramp
  visual (collision opens only when the data layer says the segment is dead — visual follows data,
  never leads).

### 3b. THE KEEP (standard, every tier)
Massing: 2–3 stacked boxes with chamfered corners, each tier inset 15%; corner turrets (r≈2) on the
top tier; crenellated crown; style-key roof (flat+banner / conical / gold hip); arrow-slit windows
(dark emissive slots, 2 rows per tier); one great door aligned to the inner ward. Height: keep 16u /
castle 22 / palace 30 — the palace keep is the tallest built thing in the game.

### 3c. ELEVATION (the motte)
The castle footprint exports a **mound hint**: heightfield raise `+3u` (keep) / stepped `+2/+4`
(castle wards) / `+2/+4/+6` (palace) inside the wall rings, smooth-shouldered. The converter already
synthesizes height from terrain codes; the mound hint makes fortresses CLIMB (rule 1). Ramps align
with gates so the lane never breaks (validator unchanged).

### 3d. Dressing (cheap, huge)
Banners on every tower (2-tri cloth, style colors, slow sway), braziers at gates (emissive + the
module's existing glow idiom), heraldic door canvas, moat ring (the water layer — `drowned_bastion`
gets it by default), scatter keep-out already respects the wards.

## 4. Occlusion transparency (the "see your units behind walls" rule)

Two SEPARATE things — one renderer, one game-rule:
- **Renderer courtesy (shared module):** when a unit YOU may see is occluded by castle geometry,
  draw its **silhouette** through the wall (classic MOBA x-ray: a flat team-color mask pass), OR
  fade the occluding wall run to ~35% opacity while your selection/army is inside the ward. Standard
  technique, zero gameplay impact — it only reveals units you're already entitled to see.
- **Vision game-rule (engine, already canon-adjacent):** walls block enemy line-of-sight — the
  attacker does NOT see defenders behind an intact wall (this is fog/LoS data, not rendering).
  Breached segments open sight lines. So: owner sees their garrison through the wall (silhouette);
  attacker sees the wall.

## 5. Data contract (MY side — the artifact; additive, A1/manifest compatible)

`castleLayout` upgrades from "ring of discrete structures" to emitting, alongside the existing
WALL/GATE/TOWER structures (which stay — they are the HP/collision truth):

```jsonc
"castle": {
  "tier": "KEEP|CASTLE|PALACE",
  "styleKey": "drowned_bastion|carnavale|collegiate|vermilion|hanseatic|fieldstone",  // fieldstone = generic
  "rings": [ { "pts": [[x,z]…], "h": 9, "gates": [ { "at": [x,z], "structureId": "castle_gate_0" } ] } ],
  "keep": { "at": [x,z], "tiers": 3, "h": 22 },
  "mound": { "steps": [ { "ring": 0, "raise": 2 }, { "ring": 1, "raise": 4 } ] },
  "moat": false
}
```
Every ring polyline vertex maps 1:1 onto existing WALL structure anchors (`structureId` back-refs)
so HP/damage stays a pure data lookup. Ships in the artifact + passes through the converter into
the manifest verbatim (one additive field — the nice-to-have CORE/GATE emission rides along).

## 6. The best castle-siege map (the SIEGE showcase layout)

Concentric design, three honest ways in — every siege story the genre loves, on one ±161 parcel:
1. **The causeway** (main gate): the road crosses the moat to the outer gatehouse — heaviest defense
   (both gate towers + flanking curtain), widest lane. The "front door" assault.
2. **The postern flank**: a smaller side gate on the second ring, reached through the jungle-path
   gap in a rock ridge — weaker gate, longer approach, ambushable. The "sneak the sally port" play.
3. **The breach play**: any curtain segment is destructible (HP) — trebuchet/units focus a wall run,
   rubble ramp opens a THIRD entrance where the attacker chooses. (This is why walls-as-data
   matters: the map's entrances are per-edge fixed, but siege lets you MAKE a door.)
Between rings: the killing field (open ground, defender towers overlooking); inner ward climbs the
mound; the keep is the final objective (SIEGE = raze/breach the hold). buildSpots: outer-ward spots
are the defender's prepared positions (`bakedInto` for the built ring), the killing-field `ANY`
spots are contestable — the in-battle RTS layer fights over them.

## 7. Build order + ownership

1. **Walls first** (owner's call): §3a curtain kit in the SHARED module (MOBA session — this doc is
   the brief; renderer freeze means it lands in the canonical copy, not my vendored file). My data
   side ships `castle.rings` the same week so they have real input.
2. Keep + mound (§3b/3c) — module + my mound hint.
3. Occlusion silhouette/fade (§4 renderer half); LoS rule to CF Overworld eco.
4. Style keys + dressing (§3d) — then the five palaces each get their §2 identity.
5. Damage states last (data already carries HP — pure renderer work).
