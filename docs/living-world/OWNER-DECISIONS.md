# Owner decisions: Living World (one page)

Each open call below lists the options, a recommendation, **what changes for each answer**, and what we do
meanwhile. Everything is built so that any answer is a data edit or a short doc change, not a rebuild.

## The five calls

### 1. Points vs CT: what pays for what?

Sources: doc 01 §rewards ❓, doc 03 §5 ❓.

| Option | Meaning | What changes |
|---|---|---|
| **A (recommended)** | **CT** pays for anything with a lasting world effect: defences, Guardians, mercenaries, event pots. Pentagon **Points** pay for one-off experiences: event entries, revives, cosmetic banners. Points never touch the CT ledger | Nothing in data. Doc 01, 03 and 06 lose their ❓. The future Points price list goes in `experience.json` |
| B | CT only | Event entries and revives get CT prices, a new CT sink. Points stay MOBA-only |
| C | Points can buy defences too | A Points → world-effect path that `LedgerEntry` can't see. ⚠ It breaks the circular-economy invariant (doc 02 canon) and the ≥ 10 % burn (Decision 17) |

**Meanwhile:** everything is priced in CT, and nothing is priced in Points.

### 2. Form 3 Guardians: can stand-in art be stationed?

Source: doc 04 §5 ❓.

| Option | Meaning | What changes |
|---|---|---|
| **A (recommended)** | Yes. A Form 3 stations with the MOBA stand-in (Form 2 model at 2.0×) and a "Form 3" badge, then swaps to the real art when it ships | Nothing; the numbers in `guardians.json` are form-based, not art-based |
| B | No. Form 3 stationing waits for the real art | `guardians.json` `forms.3.enabled = false` until the art ships. Only Wardens exist at launch |

Either way, which NFTs qualify is read from the pet lineage forms (`mon_lineage.json`), not chosen by hand.

**Meanwhile:** the design and the sim assume Form 3 exists.

### 3. Guardians vs the 12-minute floor

Source: doc 04 §2b ❓. The doc-03 rule says bought defences can't make a castle last past 12 minutes against the
floor-case attacker. The sim measures a Warden castle at **13:34** and an Ascendant castle at **17:16** (with the D31 20 % damage cap)
(`reports/SIM-SAMPLE.md`).

| Option | Meaning | What changes |
|---|---|---|
| **A (recommended)** | Guardians are exempt from the 12-min floor but capped at **~20 min**. They're time-bound (≤ 24 h / ≤ 6 h), limited to one Ascendant per castle per week, and they pay a bounty when they fall | Doc 03 gains one exemption line, and the sampler asserts F2/F3 ≤ 20 min |
| B | Guardians must respect 12 min | Cut Warden HP 3,000 → ~1,500 and Ascendant 6,000 → ~3,000 (re-run the sampler to confirm). Form 3 then means little |
| C | No cap | ⚠ An Ascendant plus full defences could stall a castle for 25 min or more, against the North Star (no single battle decides a war) |

**Meanwhile:** option A's numbers are in `guardians.json`.

### 4. Close stale MOBA PR #50?

`blockchainsuperheroes/etherfantasy-browser-moba-game#50` ("Leaderboard: Season 1/2 tabs, Prize column,
co-champion notice") is open and unchanged since 2026-09-13. Season 2 standings shipped through other PRs since.

| Option | What changes |
|---|---|
| **A (recommended)** | Close it, noting that it was superseded by the Season 2 standings work |
| B | Keep it: rebase onto main and re-review |

**Meanwhile:** no action.

### 5. What is a Guardian hunt *for*? (D15 balance sheet)

Source: `reports/BALANCE-SHEET.md`. Per extra attacker unit lost, a Form 2 Warden costs the defender **0.033 CT**; a
full defence stack costs **3.0 CT** (canon scale since D40). And at 10 soldiers per sim unit, the losses an attacker takes against a Warden
are worth **~28×** the bounty they can win (it was ~140× before D40 priced losses at the canon re-training cost). Raising fees alone can't close that gap.

| Option | Meaning | What changes |
|---|---|---|
| **A (recommended)** | The prize is the castle; the bounty is a trophy | Warden fee 1 → 3 CT in `guardians.json`. Feed copy says "the bounty is glory; the castle is the prize". Doc 04 §3's "beating a Guardian pays" becomes "beating a Guardian *wins the castle*, and a trophy" |
| B | The bounty is a wage | The region pool tops up a standing Guardian's escrow to ~25 % of expected attacker losses. That needs a pool source: a new CT sink decision |
| C | Leave as is | ⚠ Wardens stay ~90× the cheapest defence purchase |

A related engine parameter needs a value: **soldiers per sim unit** (canon reports casualties in soldiers). It's
proposed at 10 and has no canon value yet. Every CT-equivalent loss in the sheet scales with it.

**Meanwhile:** fees stay as they are (1 / 6 CT, canon scale).

## Proposals waiting on canon (no decision needed now; flagged so nothing slips in silently)

| Proposal | Where | Status |
|---|---|---|
| New canon terms: POI kinds, Guardians, defence stakes, player events | PR **nftprof/etherfantasy-clashfront#2** | Open, waiting for review. The refresh with everything since (feed, journal, region rights, season beats, arrivals, the `livingWorld@1` wire, SKY/UNDER terrain) is in `handoff/PR2-canon-refresh.patch`; apply when you say go |
| World-elements overlay + designer POI icons | PR **nftprof/etherfantasy-clashfront#1** | Open. ⚠ Its overlay notes carry the **old** threat numbers. The ready patch is `handoff/PR1-overlay-refresh.patch` (threat text only); apply it on the PR branch when you say go |
| Storm season: the last 7 of every 28 days, 35 % lane closure per day | doc 07 §4c | Proposal; no canon definition of "storm season" exists yet |
| `FeedItem` `{ id, tick, zone, kind, facts }` (the region feed) | doc 05 §5 | Proposal for the next canon PR |
| Region rights ladder: POST_EVENTS 3, HARBOUR_RIGHTS 5, PAD_RIGHTS 10, FORM3_STATION 25 | doc 06 §5 | Living-world proposal. The vessel classes themselves stay canon (parcels 5 / 10 / 25 / 100) |
| Sky and Underworld terrain: SKY → HILLS, UNDER → MOUNTAIN (existing canon rows) + seed groundShift −8 / −13 | doc 02 §7f, `SIM-MATRIX-PROPOSED.md` | Proposal; 57 / 57 in band when applied; not applied yet |
| Vessel loss below a threshold: vessels persist vs decommission after grace | canon brief §7 ⚙ | Canon's own open question; the living world works with either answer |
