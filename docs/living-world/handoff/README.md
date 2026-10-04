# Handoff: ready-to-apply changes for other branches

The living-world loop pushes **only** to `claude/browser-moba-clashfont-gmiy7p`. Changes meant for other branches
wait here as patches until the owner says go.

## `PR1-overlay-refresh.patch`: nftprof/etherfantasy-clashfront PR #1

PR #1 (branch `claude/living-world-cf-overlay`, head `2e312dd`) carries the world-elements overlay generated
**before** the threat retunes:

- D6f: banded threat;
- D14b: ground shift;
- D24: in-castle barbarian camps.

The patch brings it up to date.

- **What changes:** 249 lines across the 10 `data/world-elements/*.cf.json` files, **only** the `threat N` number in
  each Node's note. No Node moves, appears or disappears; ids, kinds and positions are identical (verified).
- **Apply:** on the PR branch, run `git apply docs/living-world/handoff/PR1-overlay-refresh.patch`, then commit and
  push. It's verified to apply cleanly to `2e312dd` and reproduce this branch's overlay byte for byte.
- **Rebuild after later re-seeds:** run `tools/living-world/pr1_refresh.sh`. It reads the PR head with `git show`
  and never writes to that repo.

## `PR2-canon-refresh.patch`: nftprof/etherfantasy-clashfront PR #2 (canon proposal)

PR #2 (branch `claude/living-world-canon`, head `73a9008`) proposed the first living-world canon: POI kinds, Guardians,
defence stakes and player events. This patch adds what was designed since, all marked *(proposed)*:

- **`docs/08-data-models.md`:**
  - enums `GuardianOutcome`, `RegionRight`, `SeasonBeat`, `FeedItemKind` and `ArrivalVia`;
  - entities `FeedItem` and `JournalEntry`;
  - the note that the two progression ladders are kept apart;
  - invariant 11 extended (Guardian damage budget, ≥ 10 % burn on every pot, no coalition farm loop).
- **`docs/README.md`:** glossary entries for region rights, season beat, and feed item / journal entry.
- **`docs/04-battle-system.md`:** the SKY → HILLS / UNDER → MOUNTAIN terrain-mapping proposal, under the canon table.
- **`docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md`:** §2b, the additive `livingWorld@1` blocks on allocate and result.

**Apply:** on the PR branch, run `git apply docs/living-world/handoff/PR2-canon-refresh.patch`, then commit and push.
It's verified to apply cleanly to `73a9008`. A test keeps its enums in sync with the living-world code; if they drift,
the patch needs regenerating.

