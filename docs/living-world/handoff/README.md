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
