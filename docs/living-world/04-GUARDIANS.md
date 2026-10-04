# 04 — NFT Guardians (Form 2 / Form 3)

Owner brief (2026-10-04): a player with a **Form 2 or Form 3** NFT pet can station it as a **Guardian**, the
way Dracobra guards the S2 castle. **Form 2** is strong but can be taken down. **Form 3** is nearly
invincible, but only for a limited time. One player pays to defend; the other pays to attack (in units
lost).

Numbers live in `data/living-world/guardians.json`. This doc explains them; tests keep the two in sync.

## 1. Where a Guardian stands

- Only on a **`GUARDIAN_PERCH`** POI (doc 01): 1 per CASTLE/KEEP, 2 per PALACE, inside the castle's
  battle map on the keep.
- The stationing player must **hold** that castle, or hold a **`MERCENARY_DEFEND`** contract for it
  (defend-for-hire).
- It defends **that perch's battle only**. It never leaves the parcel, joins an army or marches.

## 2. The two forms

| | **Form 2: Warden** | **Form 3: Ascendant** |
|---|---|---|
| Fantasy | A champion beast. Hard, but a good assault brings it down | An avatar. While its power holds, you **don't kill it, you outlast or unbind it** |
| Battle HP | 3,000 × zone strength | 6,000 × zone strength, but takes only **5 %** damage while **Ascended** |
| Ascended window (in battle) | n/a | **8 min** per battle, **counted from first contact** (it wakes when struck), then it **tires**: Ascension ends, it drops to 40 % HP and is beatable like a Warden (S2: Dracobra "got bored") |
| Unbinding (counterplay) | n/a | Destroy **3 Ward Stones** around the keep (telegraphed, 1,200 HP each). Each one cuts the Ascended window by 2 min; all 3 end Ascension at once |
| Offence | Bombards the nearest attacker cluster every 6 s (S2 Dracobra cadence, telegraphed 0.9 s) | Same bombard, **no stronger**. Form 3 is about *staying*, not killing |
| Aura | Attackers within 20 u deal −20 % to structures | Attackers within 24 u deal −30 % to structures |
| If beaten | KO'd: never lost (doc 05 raid rule). Goes on **cooldown** | Same |
| Stationing (world time) | Up to **24 h** per stationing | Up to **6 h** per stationing |
| Cooldown per NFT | 24 h after the stationing ends or it's KO'd | **72 h** |
| Per-castle limit | 1 Warden per perch | **1 Ascendant per castle per `SEASON_DAYS` (7 d)** |
| Stationing fee (CT, canon scale since D40) | 1 CT × kind multiplier | 6 CT × kind multiplier |

Kind multiplier: KEEP ×1, CASTLE ×1.5, PALACE ×2.

### 2b. Two rules the headless sim forced (D6c, `reports/SIM-SAMPLE.md`)

- **The keep is shielded while a Guardian stands.** Without this, attackers ignored the Guardian, took the keep and
  won. The breach time was identical with or without a Guardian, so even Form 3 meant nothing. With it, Form 2 means
  "kill it first" and Form 3 means "outlast or unbind it".
- **The Ascension clock starts at first contact, not at battle start.** With a battle-start clock, Form 3 spent its
  8 minutes while the attackers were still on the walls and fell *faster* than Form 2 (14:24 vs 16:10).
- Measured on the calibrated castle with these rules, **Ward Stones and the aura included** (D6d, N = 6):
  - the bare castle breaks at **8:59**;
  - with a **Form 2 Warden** (3,000 HP, −20 % aura) at **13:34**, about **+4.5 min**;
  - with a **Form 3 Ascendant** (6,000 HP, −30 % aura, 8 min from contact, 3 Ward Stones) at **17:16**, about
    **+8 min**.
  - Ward Stones sit on the approach, so attackers hit them first. The Ascendant woke at ~10:20 with one stone
    already down (−2 min).
- Both are always beaten eventually: nothing is bought forever.
- > ❓ OPEN: a Warden castle falls at ~13.5 min (with the D31 damage cap), past the doc-03 12-min floor for *bought defences*. Proposal:
  > Guardians sit outside that floor (they're time-bound and pay their bounty), but never beyond ~20 min.
  > Owner call.

## 3. Who pays what (the defend/attack trade)

- **The defender pays up front.** The stationing fee is a `LedgerEntry`. Per the doc-02 circular split,
  it is not minted, only redistributed or burned.
  - **50 % → a guardian bounty escrow** for this stationing (see "If the Guardian falls" below).
  - **30 % burned**: Decision 17, rake ≥ 10 % burned.
  - **20 % to LAND-YIELD / the zone pool.**
- **The attacker pays in units.** Every unit lost against the Guardian is a real loss (upkeep, supply,
  re-training). Nothing is refunded.
- **If the Guardian falls:**
  - **Form 2 KO'd** → the attacking side splits the **bounty escrow** by damage share.
  - **Form 3 unbound** (all 3 Ward Stones down) → the same bounty is paid out.
  - **Form 3 outlasted** (it tired after its window) → **half** the escrow.
- **If the Guardian holds:**
  - The stationing **expires** unbroken → the escrow returns to the defender.
  - So a defender who picks a strong Guardian pays only the burned and pool shares (50 %).

The result: defending costs CT, attacking costs units, and beating a Guardian *pays*. Guardians become
**events other players hunt**, not walls.

## 4. North Star and the hero cap

- A Guardian affects **one battle on one parcel**. It cannot win a war: no movement, no supply, no
  war-score bonus beyond that battle's structures.
- It is a **unit, not a hero**, but it is held to the same spirit as `HERO_IMPACT_MAX = 0.20`:
  - its **damage contribution** is capped at **20 %** of the defending side's total in any battle. The
    harness enforces it as a running budget (D31): the Guardian holds fire whenever another shot would take it over
    20 %. Uncapped, it dealt 30 % (Warden) and 36 % (Ascendant); capped, 19.5 % and 19.9 %;
  - Form 3's power is **staying** (survivability plus aura), never killing. The defender still needs a
    garrison.
- **Nothing is bought forever.** Every stationing has a window, every NFT has a cooldown, and every
  castle has a limit of one Form 3 a week.

## 5. How it plays (the S2 recipe)

1. **GUARDIAN_WAKE**: the attacker arrives and a 10 s banner shows the Guardian's name, form, owner and
   time left: "⚠ the Ascendant of Emberthrone — 7:52 of power left".
2. **Form 3**: Ward Stones light up on the minimap. The attacker chooses between three plans:
   - **break the wards** (go in);
   - **bait and outlast** (stay out of the aura, kill garrison units);
   - **hit a different POI** (come back when it tires).
3. **Tiring**: at 0:00 a banner reads "the Ascendant tires" and its HP drops to 40 %. Now it can fall.
   The fight changes shape mid-battle.
4. **Fall**: the bounty paid is announced in the region feed ("🏆 Raiders of the Gullshoal broke the
   Warden of Tidegate — 0.75 CT bounty"). That story is a reason to come back tomorrow.

> ❓ OPEN: Which NFTs qualify as Form 2 / Form 3 is set by the pet lineage data (`mon_lineage.json`
> forms). Form 3 art doesn't exist yet (EF MOBA uses Form 2 at 2.0× as a stand-in). Owner to confirm
> whether stand-ins can be stationed.

## 6. The stationing rules as code (D23)

`tools/living-world/stationings.mjs` `canStation(ledger, request)` enforces §2 from `guardians.json`:

| Refusal | Rule |
|---|---|
| `NOT_A_PERCH` | Only a real perch |
| `TOO_LONG` | ≤ 24 h (Warden) or ≤ 6 h (Ascendant) |
| `PERCH_TAKEN` | One Guardian per perch at a time |
| `NFT_COOLDOWN` | 24 h or 72 h after the stationing ends |
| `ASCENDANT_WEEKLY_LIMIT` | One Ascendant per castle per 7 days, across all its perches |

- **A synthetic week over all 76 perches** (6 NFTs per region, placeholder owners): **115 accepted, 154 refused.**
  Almost all refusals (138) are NFT cooldowns, so scarce NFTs, not perches, are the real limit. There were 8
  perch-taken and 8 weekly-Ascendant refusals.
- **Every accepted stationing auto-posts a `GUARDIAN_CHALLENGE`** on its region's event board (doc 05 §7). The banner
  reads "⚠ the Ascendant of Fort Tidegate stands for 1 h 45 m: 8 min of power from first contact, 3 Ward Stones",
  and the row shows the bounty escrow (4.5 CT for a CASTLE Ascendant).

