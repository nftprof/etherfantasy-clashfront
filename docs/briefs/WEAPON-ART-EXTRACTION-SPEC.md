# Weapon-art extraction spec — named artifacts from the original asset folder

> **For the agent doing the asset sweep** (owner will hand this over; MOBA BattleEngine RAW binds the
> final picks). Goal: find the existing hero weapon/armor art in the original MOBA asset folders and
> deliver a **candidate catalog** from which the owner picks the pieces that become the **NAMED
> ARTIFACTS** (`data/singulars.json` in `etherfantasy-clashfront` — the one-of-one, vault-granted,
> provenance-tracked NFTs). Context: `docs/lore/WORLD-CHRONICLE.md` + decision 19.

## What to look for

Distinct, **visually characterful** weapon + armor models the heroes already wear/carry in the MOBA
client — the pieces that would read as "legendary" if given a name. Sources, in priority order:
1. the original asset folders (hero gear: weapon meshes, shields/offhands, helms/armor sets),
2. per-hero skin variants (a striking variant makes a better singular than a default),
3. any unused/shelved gear art (unshipped assets are ideal — they've never been seen, so they arrive
   as genuinely new legends).

## How many

| Need | Count | Notes |
|---|---|---|
| **Named artifacts (the committed list)** | **8** | slots already proposed: sword · greatsword · flail/chain · siege hammer · bow · offhand/lantern · shield · helm (`data/singulars.json artifacts[]`) |
| **Carnival relics (masks)** | **5–6** | the five Masks + the Sigil of Binding — if any mask-like/face art exists, flag it; else these become 2D relic art (website/UI), not 3D |
| **Catalog to choose FROM** | **~24–30 candidates** | ≈3 options per committed slot so the owner can pick; include any standout piece even if its slot isn't on the list — the names can move |

Slot fit is flexible: if there's no flail but a spectacular spear, say so — we rename the artifact to
fit the art (the art wins; the lore bends).

## What to deliver per candidate (the manifest)

One `weapon-art-catalog.json` + a `previews/` folder, delivered to the CF hub repo
(`etherfantasy-clashfront`, own branch per satellite convention):

```jsonc
{
  "candidates": [{
    "id": "wpn_017",                       // your stable id
    "assetPath": "assets/heroes/…/sword_fire_02.(fbx|glb|png…)", // exact repo path(s): mesh + textures
    "slot": "sword",                        // sword|greatsword|bow|shield|offhand|helm|armor|other
    "currentUse": "Hero X default weapon | skin Y | UNUSED",     // is it live on a hero today?
    "preview": "previews/wpn_017.png",      // REQUIRED: one render/screenshot, ~512px, neutral bg
    "style": "curved blade, ember glow, gold filigree",          // one line, what makes it distinct
    "suggestSingular": "dawnbreaker?"       // optional: which named artifact it could be
  }]
}
```

**The preview image is the deliverable that matters** — the owner picks by eye. A screenshot from the
client/viewer is fine; consistency beats quality.

## Constraints & notes

- **Extract references, don't move files** — catalog paths + previews only; the MOBA client agent does
  the actual binding (distinct item ids/skins) after the owner picks.
- **Reuse is expected and fine** — a named artifact may share a mesh with a live hero weapon; the named
  version gets its own id (+ ideally a tint/FX variant so it reads as unique in-game).
- Note anything **animated/FX-bearing** (glows, trails) — those make the best singulars.
- If armor SETS exist (multi-piece), catalog the set as one candidate (slot `armor`).

## What happens after

Owner picks 8 (+ masks if found) → names locked in `data/singulars.json` (bind `assetPath`/item id per
entry) → **MOBA BattleEngine RAW** ships the distinct item ids/skins → **CF** mints them as vault-prize
NFTs with on-chain provenance (decision 17/19).
