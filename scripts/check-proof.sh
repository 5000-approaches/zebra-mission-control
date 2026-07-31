#!/usr/bin/env bash
# The proof gate — a change a person can watch run must arrive with a picture.
#
# WHY (Rune, 30 Jul): "the loop isn't doing its job by iterating, testing it,
# doing a screenshot, seeing it works and then seeing it doesn't work." A
# caching bug shipped as fixed twice because no round ever looked at its own
# proof. On that same night this repo had ZERO screenshots and ZERO clips on
# dev, and one change merged with an entirely blank body.
#
# The requirement already existed — as PROSE inside the builder's prompt. A
# paragraph is an instruction to an agent: it holds when the agent remembers
# and evaporates when it does not. This is the same requirement as something
# that RUNS, so it cannot be forgotten, only argued with.
#
# WHAT COUNTS AS PROOF: a picture, clip or video committed under screenshots/
# in the same change. A GIF is best because it plays by itself; a PNG of a real
# run is fine for work with no moving parts; an mp4 is the crisp copy.
# "There is nothing to show" is never the answer — it means the thing was not
# run. A backend change photographs its real requests and their real answers.
#
# WHAT IS EXEMPT: prose, docs, lockfiles, and tests on their own. Those cannot
# be watched, and a gate that fires on honest work is not stricter, it is
# broken.
#
# Usage:  check-proof.sh                 # compare against origin/dev
#         check-proof.sh --files <path>  # read an exact changed-file list
set -uo pipefail

FILES_LIST=""
if [ "${1:-}" = "--files" ]; then
  FILES_LIST="${2:-}"
  if [ -z "$FILES_LIST" ] || [ ! -f "$FILES_LIST" ]; then
    echo "PROOF GATE: FAIL — no changed-file list to read ('${FILES_LIST}')" >&2
    exit 1
  fi
  CHANGED=$(cat "$FILES_LIST")
else
  BASE="${PROOF_BASE:-origin/dev}"
  MERGE_BASE=$(git merge-base "$BASE" HEAD 2>/dev/null) || {
    echo "PROOF GATE: FAIL — cannot find a common commit with $BASE" >&2; exit 1; }
  CHANGED=$(git diff --name-only "$MERGE_BASE"..HEAD 2>/dev/null) || {
    echo "PROOF GATE: FAIL — cannot read the changed files" >&2; exit 1; }
fi

echo "PROOF GATE"

# --- is there a picture in this change? -------------------------------------
# Under screenshots/ specifically: a marketing image in public/ is not evidence
# that anything was run, and letting any stray png count would make the gate
# meaningless on the first day someone adds a logo.
PROOF=$(printf '%s\n' "$CHANGED" | grep -E '^screenshots/.+\.(png|gif|mp4)$' || true)

# --- does this change need one? ---------------------------------------------
# Anything a person could watch behave: the app, its styles, the scripts, the
# workflows. A SKILL or prompt counts as runnable elsewhere in the fleet; here
# it is the product and the machinery around it.
RUNNABLE=$(printf '%s\n' "$CHANGED" \
  | grep -Ev '^\s*$' \
  | grep -Ev '^screenshots/' \
  | grep -Ev '(^|/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$' \
  | grep -Ev '\.(md|mdx|txt|csv|svg|ico|snap)$' \
  | grep -Ev '(^|/)__tests__/|\.test\.[jt]sx?$|\.spec\.[jt]sx?$|^e2e/' \
  | grep -E '\.(m?[jt]sx?|css|scss|html|ya?ml|json|sh|py|sql)$|^\.github/workflows/' \
  || true)

if [ -z "$RUNNABLE" ]; then
  echo "  nothing in this change can be watched run — no picture owed"
  echo ""
  echo "PROOF GATE: PASS"
  exit 0
fi

if [ -n "$PROOF" ]; then
  COUNT=$(printf '%s\n' "$PROOF" | grep -c . )
  echo "  $COUNT piece(s) of proof committed with this change:"
  printf '%s\n' "$PROOF" | sed 's/^/    /'
  echo ""
  echo "PROOF GATE: PASS"
  exit 0
fi

echo "  these changed and can be watched run:"
printf '%s\n' "$RUNNABLE" | head -20 | sed 's/^/    /'
echo ""
echo "PROOF GATE: FAIL — this change carries no picture."
echo ""
echo "Commit the proof under screenshots/ on this branch, then push again:"
echo "  - something that moves  -> an animated GIF (it plays by itself inline)"
echo "  - a screen that changed -> a PNG each of desktop and mobile"
echo "  - server-side work      -> a PNG of the real request and its real answer"
echo ""
echo "\"There is nothing to show\" is never the answer — it means the thing was"
echo "not run. Run it, photograph what it did, and commit that."
exit 1
