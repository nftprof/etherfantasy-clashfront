# Populace pet spec — what the live website claims each pet can do

**Purpose (for the Clash Front session):** the public populace site
(https://pets.etherfantasy.com/populace/) renders, on **every pet's page**, a
**"Summoning aptitudes"** panel (5 scored bars) and a **"Summon it for"** panel
(Kingdom work / War duties / What it brings home). Example:
https://pets.etherfantasy.com/populace/#species/92 (Wolverize — Ancient/mythic,
Industry 100, Military 100, "Blacksmithing… Siege Engineers…").

These are **player-facing promises about CF/kingdom gameplay**. This folder is the
complete, exact, per-pet extract of those promises so you can **reconcile them with the
real Clash Front game** and decide, per feature: **match it, revise the website, or
remove it** (if it's something we'll never implement).

This is the site's concrete interpretation of **Addendum E**
(`../ADDENDUM-E-PentaPet-Species-Affinity.pdf`) — same design (species define talent,
every pet can do every job but excels differently), turned into hard numbers per pet.

## Answers to your economy-map report (2026-07-06)
Re `../reports/PET-APTITUDE-ECONOMY-MAP.md`:
- **Confirm #1 — rank/rarity = real power: YES.** Intended and locked. The ×1.0–×2.20 rank
  multiplier scales real combat/work output — it's the core of the NFT store-of-value + rental
  economy. The P2W ceiling is held exactly as you noted: decision-17's per-user cap + F2P fielding
  common-mon armies. Build to "rarity is real power."
- **Confirm #2 — the roster: delivered + enriched.** `pets-aptitudes.{csv,md}` now carry the
  scarcity dimension you need (**capacity, dominant_role, biome_hint** per pet), and
  **`role-scarcity-summary.md`** answers your three finalization items directly:
  1. **Role supply** (→ prices): world capacity by dominant role — Farmers **1,945** & Adepts **1,824**
     are scarcest (priciest); Crafters **4,028** & Soldiers **4,005** most abundant; Haulers 2,373.
  2. **Rank ceiling** (→ power cap): mythic is **20 pets total** across the whole world; legendary+mythic ≈ small % of the 14,175 total capacity.
  3. **Biome pools**: capacity by suggested biome (element-derived; refine with your biome wheel).

## Files here
| File | What it is |
|---|---|
| `README.md` | this — orientation, confirms, reconciliation asks |
| `role-scarcity-summary.md` | **the tuning numbers** — role supply, rank ceiling, biome pools (by capacity) |
| `framework-reference.md` | the exact aptitude formula, the 5 rarity ranks (×mult), and all **17 elements** with their capability vectors + role lists |
| `pets-aptitudes.md` | readable table of **all 228 pets**: capacity, type, biome, dominant role, rank, the 5 aptitude scores |
| `pets-aptitudes.csv` | same 228 pets, machine-readable, with capacity/dominant_role/biome_hint + **full** role lists |

Only the 228 pets with an assigned element are included (typeless/unreleased placeholder
classes are excluded — they render no aptitudes on the site). ⚡ marks the 7 never-released
convert-only exclusives (Wickle/Stingweave/Dreadweave, Oilpus/Sultako/Hormaug, Glacewing).

## How the site computes it (summary — full detail in framework-reference.md)
- **5 aptitude axes:** Industry, Agriculture, Military, Logistics, Arcane (0–100).
- Each axis = `primaryElementBase (0–80) × rarityMultiplier`, clamped to 100.
  Dual-type blends `primary×0.70 + secondary×0.45` first.
- **Rarity multiplier:** common 1.00 · uncommon 1.15 · rare 1.35 · legendary 1.70 · mythic 2.20
  (rank names Companion → Adept → Elite → Champion → Ancient; higher ranks also claim an
  "aura" — e.g. mythic "+15% kingdom-wide morale & a unique edict").
- **"Summon it for"** = the primary element's Kingdom-work / War-duty / Brings-home lists
  (e.g. Fire → Blacksmithing, Siege Engineers, Weapons).

## Reconciliation asks (the deliverable back)
For each of the following, tell us **Match / Revise / Remove** and the target state:

1. **The 5 aptitude axes.** Does CF's economy/military model actually use
   *Industry, Agriculture, Military, Logistics, Arcane*? If CF uses different resource/labor
   categories (see `../02-economy.md`, `../03-military.md`), map ours → yours, or flag axes
   the site should rename/drop.
2. **The rank multiplier & auras.** Does rarity scale a pet's output ×1.0–×2.2 in CF? Are the
   claimed auras (rare +5% party, legendary +10% district, mythic +15% kingdom + unique edict)
   real, planned, or fiction to remove?
3. **The role lists** (Kingdom work / War duties / Brings home per element). Are these actual
   CF jobs/units/outputs, or flavor? Which should be trimmed to only what CF will implement?
4. **The productivity formula** (`Base × Experience × Affinity × Morale × Equipment`, from
   Addendum E) — is this the live CF model? If the factors differ, the site's per-pet page
   text should change.
5. **Anything the site over-promises** that CF will never build → list it so we remove it from
   the website, or move it to a clearly-labelled "roadmap/future" framing.

**Suggested output:** a sibling `RECONCILIATION-RESULT.md` in this folder (or PR comments)
with a per-item verdict, plus a `pets-aptitudes.revised.csv` if any numbers/roles should change.
We'll apply the website edits from that.

## Provenance
Generated from the live site's `claim-prototype/{index.html capVector(), affinity.js, species.js}`
(fe-website repo, `v2-redesign-masters-presale` branch) on 2026-07-06. Rarities reflect the
current re-tiered system (incl. this week's changes + the 7 exclusives). Regenerate by porting
`capVector()` over `species.js` × `affinity.js`.
