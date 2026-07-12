#!/usr/bin/env bash
#
# Removes the dead / misplaced files identified during the 2026-07-10 cleanup.
# The interactive session couldn't delete files (deletion is blocked there),
# so run this yourself after a quick review:
#
#     bash cleanup-dead-files.sh
#
# What it removes (all verified unreferenced):
#   src/index-works           — dead 361-line copy of src/index.ts, imported nowhere
#   tests/e2e/_diag.spec.ts   — self-labeled "safe to delete", contains no tests
#   polar_shot.mjs            — screenshot script for a different project (threejs-app/viewshed)
#   polar_shot_finest.mjs     — ditto
#   dist/index-works.d.ts     — stale untracked build artifact (not in git, not published)

set -euo pipefail

# Run from the repo root regardless of where the script is invoked from.
cd "$(dirname "$0")"

# Safety check: make sure this really is the maplibre-transition repo.
if [ ! -f package.json ] || ! grep -q '"name": "maplibre-transition"' package.json; then
  echo "Refusing to run: this doesn't look like the maplibre-transition repo root." >&2
  exit 1
fi

echo "Removing tracked dead files (git rm)..."
git rm -f --ignore-unmatch \
  src/index-works \
  tests/e2e/_diag.spec.ts \
  polar_shot.mjs \
  polar_shot_finest.mjs

echo "Removing stale untracked build artifact (if present)..."
rm -f dist/index-works.d.ts

echo
echo "Done. Review with:  git status"
echo "Then commit, e.g.:  git commit -m 'Remove dead/misplaced files'"
echo
echo "(You can delete this script afterward:  rm cleanup-dead-files.sh)"
