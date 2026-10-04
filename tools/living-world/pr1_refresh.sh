#!/usr/bin/env bash
# D27 — rebuild the PR #1 refresh patch: the world-elements overlay on the PR head (cf-overworld branch
# claude/living-world-cf-overlay, read via git show — nothing is written to that repo) vs the overlay this branch
# generates now (data/living-world/world-elements). Output: docs/living-world/handoff/PR1-overlay-refresh.patch,
# verified to apply cleanly to the PR head and reproduce the current overlay byte-for-byte.
set -euo pipefail
CFO=${CFO:-/home/user/cf-overworld}; REF=${REF:-origin/claude/living-world-cf-overlay}
ROOT=$(cd "$(dirname "$0")/../.." && pwd); T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/a/data/world-elements" "$T/b/data/world-elements"
for f in $(git -C "$CFO" ls-tree --name-only "$REF" data/world-elements/ | grep '\.cf\.json$'); do git -C "$CFO" show "$REF:$f" > "$T/a/$f"; done
cp "$ROOT"/data/living-world/world-elements/*.cf.json "$T/b/data/world-elements/"
(cd "$T" && git diff --no-index --src-prefix=a/ --dst-prefix=b/ a/data b/data || true) | sed -E 's#(a|b)/(a|b)/data#\1/data#g' > "$ROOT/docs/living-world/handoff/PR1-overlay-refresh.patch"
mkdir -p "$T/check" && cp -r "$T/a/data" "$T/check/" && (cd "$T/check" && git init -q && git apply "$ROOT/docs/living-world/handoff/PR1-overlay-refresh.patch") && diff -r "$T/check/data" "$T/b/data" >/dev/null
echo "PR1 refresh patch: $(grep -c '^+ ' "$ROOT/docs/living-world/handoff/PR1-overlay-refresh.patch") changed lines; applies clean on $(git -C "$CFO" rev-parse --short "$REF")"
