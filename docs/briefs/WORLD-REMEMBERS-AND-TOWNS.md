# THE WORLD REMEMBERS + TOWNS — locked canon (owner, 2026-07-10)

> Two depth systems the owner locked from the depth review (`WORLD-DEPTH-AND-COHESION-REVIEW.md` Part I
> #3 + #5). Design-locked here; build scheduling separate.

## 1. THE WORLD REMEMBERS — ✅ LOCKED

The world permanently records player deeds:

- **Great battles auto-name themselves.** Casualties ≥ ⚙ `chronicle.greatBattleCasualties` → the battle
  is christened after where it happened ("The Battle of ___", "The Siege of ___ Gate", "The ___ Ford")
  and **archived forever** in the public **World Chronicle feed** (per-continent history + in-game).
- **Battle scars persist.** A great battle leaves a **cairn/monument POI** on the parcel; battlefield
  graveyards **seed Phantom-element pets** (the ecology writes its own ghost stories).
- **First deeds are INSCRIBED IN THE PLAYER'S NAME — at the place itself** (owner: "at these gates etc.,
  it will write the player's name"). First army through each **GATE**, first ship out of each **port**,
  first boss-kill per zone, first to hold each EPIC, founder of each town: the site's plaque/card
  permanently shows the deed + the player's name ("*First through, in the Fourth Age: WARLORD X*").
  On-chain-grade permanence; curated names only (PG usernames, profanity-filtered).
- The Chronicle is the **Fourth Age** of `docs/lore/WORLD-CHRONICLE.md` — the authored three ages end
  where the player-written record begins.

**Build hooks:** settlement records + `recentBattles` already exist → add the permanence rule (threshold
→ name + archive + monument POI); a `firsts` registry keyed by site id; surfacing on parcel/gate/port
cards + a chronicle feed page. ⚙ dials: `chronicle.greatBattleCasualties`, monument POI cap per parcel.

## 2. TOWNS — ✅ LOCKED (the model)

Towns = the civilization nodes we intended for markets — **like ports: special map locations, ownable by
players**, with these rules:

- **Two kinds:**
  1. **Famous dev-placed towns** — placed by us at chosen locations, each **selling specific things**
     (a spice town, an arms town, a relic bazaar…). The **occupying warlord takes a benefit** (a share
     of the town's trade flow) but the town's function is set by the dev placement.
  2. **Player towns** — grown from the existing town/market plans on ordinary land; owned like ports.
- **No-war sanctuary rules (the MMORPG safe-town feel):**
  - On a **change of occupation**, the town is **war-locked for ⚙ 7–30 days** (`towns.warLockDays`) —
    no war may be waged on it; commerce runs in peace. (The RoTK "consolidate your new city" beat.)
  - **Some dev towns are permanently no-war** — no owner, dev-held forever: pure sanctuaries where any
    player can arrive, trade, and play.
- **What you do in a town:** markets (the commerce/trade layer), **treasure hunt** — a **CT gamble**
  (arcade luck-play; a clean decision-17 sink: house-edged by construction, rake ≥10% burns, prizes from
  the vault), port-like services where coastal, and (Shire layer, #5) the **inn** — rest/morale + the
  rumor board reading the Chronicle aloud.
- **Occupier benefit:** the town holder earns a ⚙ share of trade/gamble/inn flows (like the port fee
  split: owner/occupier/platform-sink) — a **civilian prosperity path**: the innkeeper-warlord, not just
  the conqueror.

**Build hooks:** `ZoneType TOWN` already exists in the world model + `balance.towns` (treasuries re-scaled
v2); add `warLockDays`, the dev-town placement list (a `data/famous-towns.json` register — placement is a
**seed-pass** concern, not base terrain), the trade/gamble flows on the economy seam. Treasure-hunt odds
live server-side under the decision-17 accounting (per-user caps apply).

## Canon status
Both entries appended to CLAUDE.md as decisions 19 (World Remembers) and 20 (Towns). Blueprint-spawn pet
ruling is decision 18. Build order: after the movement/toll sim (towns/inscriptions hang off sites the
movement layer defines).
