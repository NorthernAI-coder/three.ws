#!/usr/bin/env bash
# Vercel "Ignored Build Step".
# Exit 0 => SKIP the build (no deploy, no cost).
# Exit 1 => PROCEED with the build.
#
# Policy: skip only when EVERY changed file in this commit is non-deployable
# (docs, runbooks, changelog markdown). If a single deployable file changed,
# we build. This is deliberately conservative — unknown paths always build,
# so we never skip a deploy that mattered.
set -euo pipefail

# Compare against the previous deployed commit when Vercel provides it,
# otherwise fall back to the parent of HEAD.
BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$BASE" ] || ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  BASE="HEAD^"
fi

# List changed files; if git can't diff (shallow clone edge case), build to be safe.
if ! CHANGED="$(git diff --name-only "$BASE" HEAD 2>/dev/null)"; then
  echo "vercel-ignore: cannot diff — building to be safe"
  exit 1
fi

if [ -z "$CHANGED" ]; then
  echo "vercel-ignore: no file changes — skipping build"
  exit 0
fi

# Non-deployable path patterns. Anything matching ALL of these => safe to skip.
is_ignorable() {
  case "$1" in
    *.md)                     return 0 ;;  # all markdown docs (docs/, specs/, README, CHANGELOG)
    */runbooks/*|runbooks/*)  return 0 ;;  # agent runbooks / LOG churn
    LICENSE|.gitignore|.editorconfig) return 0 ;;
    *) return 1 ;;
  esac
}

while IFS= read -r f; do
  [ -z "$f" ] && continue
  if ! is_ignorable "$f"; then
    echo "vercel-ignore: deployable change detected ($f) — building"
    exit 1
  fi
done <<< "$CHANGED"

echo "vercel-ignore: only docs/runbooks changed — skipping build"
exit 0
