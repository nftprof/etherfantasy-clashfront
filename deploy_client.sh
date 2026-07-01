#!/usr/bin/env bash
# Push the EF Moba CLIENT (the /play static files) to the live game box.
# Run from the repo root (C:\Users\ADMIN\Desktop\EF Moba) in Git Bash / WSL, on a
# machine that has the box SSH key. The Cowork sandbox CANNOT run this (no key/route).
#
#   bash deploy_client.sh
#
# Ships the FULL client file list — crucially model_calibration.js + hero/ (the run-timing
# fix + the Kai/Leah/Irene models), which a graphics-only "index.html" refresh leaves behind.
set -euo pipefail

KEY="${KEY:-$HOME/.ssh/ef-moba-deploy}"
# Both region boxes (Singapore + Montreal/ca). Region selection routes players to either, so the
# client must be identical on both or they drift (e.g. one box gets a model fix, the other doesn't).
BOXES="${BOXES:-ubuntu@13.250.39.41 ubuntu@3.98.68.96}"
DEST="${DEST:-~/ef-moba-game}"

echo "==> packing client from the canonical manifest CLIENT_FILES.txt ..."
# CLIENT_FILES.txt is the SINGLE SOURCE OF TRUTH for what /play ships. Only tar entries that
# exist (e.g. hotkeys.html may not be generated yet) so the list can grow without breaking.
FILES=()
while IFS= read -r f; do
  f="${f%%#*}"; f="$(echo -n "$f" | xargs)"   # strip comments/whitespace
  [ -z "$f" ] && continue
  [ -e "$f" ] && FILES+=("$f") || echo "    (skip, not present yet: $f)"
done < CLIENT_FILES.txt
tar czf /tmp/ef-game.tgz "${FILES[@]}"

for BOX in $BOXES; do
  echo "==> [$BOX] uploading ..."
  scp -i "$KEY" -o StrictHostKeyChecking=accept-new /tmp/ef-game.tgz "$BOX:~/"
  echo "==> [$BOX] unpacking into $DEST ..."
  ssh -i "$KEY" "$BOX" "tar xzf ~/ef-game.tgz -C $DEST && echo unpacked"
  echo "==> [$BOX] verify (should show the run-rate fix):"
  ssh -i "$KEY" "$BOX" "grep -o 'ANIM_RATE:{[^}]*}[^}]*}[^}]*}' $DEST/model_calibration.js | head -1" || true
done

cat <<'NOTE'

Done. Now in the browser:
  1) open  https://moba.etherfantasy.com/play/model_calibration.js
     -> it should contain  irene:{ run:0.45 }  (and kai/leah run:0.6)
  2) hard-refresh the game (Ctrl+Shift+R) to bust the browser cache.
If step 1 still shows the old file, the upload didn't land - re-run this script.
NOTE
