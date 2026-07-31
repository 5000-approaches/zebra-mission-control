#!/usr/bin/env bash
# The proof gate must be RUN to be trusted, not read.
#
# WHY IT EXISTS (Rune, 30 Jul, angry and exact): "the loop isn't doing its job
# by iterating, testing it, doing a screenshot, seeing it works and then seeing
# it doesn't work." A caching bug shipped as fixed, twice, because no round
# ever looked at its own proof.
#
# The mechanical cause, checked the same night: this repo had ZERO screenshots
# and ZERO clips on dev, and the screenshot/GIF requirement existed only as
# PROSE inside the builder's prompt. A paragraph is an instruction to an agent,
# not a gate — it holds when the agent remembers and evaporates when it does
# not. One change merged that night with an entirely blank body.
#
# So the requirement becomes a thing that RUNS. Every case below drives the
# real script, so a gate that stops gating goes red here instead of going
# quiet in CI.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/check-proof.sh"

pass=0; fails=0
ok () { if [ "$1" = "0" ]; then pass=$((pass+1)); echo "  ok $pass: $2"; \
        else fails=$((fails+1)); echo "  FAIL: $2"; fi; }

echo "PROOF GATE TEST"

[ -f "$SCRIPT" ]; ok $? "the proof gate exists (scripts/check-proof.sh)"
if [ ! -f "$SCRIPT" ]; then
  echo ""; echo "PROOF GATE TEST: FAIL (no script — nothing to run)"; exit 1
fi

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# run <label> <file...> — feeds the gate an exact changed-file list
run () { printf '%s\n' "${@:2}" > "$TMP/files"; bash "$SCRIPT" --files "$TMP/files" > "$TMP/log" 2>&1; }
red   () { local l="$1"; shift; run "$l" "$@"; [ $? -ne 0 ]; ok $? "RED: $l"; }
green () { local l="$1"; shift; run "$l" "$@"; ok $? "GREEN: $l"; }

# ---- the failure that produced this gate -----------------------------------
red "a change to the CV scorer with no picture anywhere" \
    src/lib/cv-match-scorer.ts src/lib/slack-digest-prepare.ts
grep -qi 'screenshots/' "$TMP/log"
ok $? "and the message names where the picture has to go"

red "a page change with only a test beside it" \
    src/app/opportunities/page.tsx src/__tests__/opportunities.test.ts
red "a whole feature with tests, types and config but no picture" \
    src/components/OpportunityCard.tsx src/lib/feature-sources.ts package.json

# ---- the same changes, proved ----------------------------------------------
green "the CV scorer WITH a captured run committed beside it" \
      src/lib/cv-match-scorer.ts screenshots/issue-710/cv-ranking-after.png
green "a page change with an animated clip" \
      src/app/opportunities/page.tsx screenshots/issue-710/opportunities.gif
green "a page change with the crisp video copy" \
      src/app/opportunities/page.tsx screenshots/issue-710/opportunities.mp4

# ---- prose and housekeeping are exempt, or the gate cries wolf -------------
green "a documentation-only change" AGENTS.md docs/whatever.md
green "the ledger and a readme" README.md e2e/COVERAGE.md
green "nothing changed at all"
green "a lockfile refresh on its own" package-lock.json
green "tests only, touching no product code" src/__tests__/broker-digest.test.ts
green "a screenshots folder tidy on its own" screenshots/issue-700/old.png

# ---- a picture must be a picture, not a promise -----------------------------
red "a text file pretending to be the proof" \
    src/lib/broker-digest.ts screenshots/issue-710/notes.txt
red "a picture outside the screenshots folder" \
    src/lib/broker-digest.ts public/marketing-hero.png
grep -qi 'screenshots/' "$TMP/log"
ok $? "and it says the folder is the one that counts"

# ---- things that run but are not the web app still need proof ---------------
red "a CI workflow change with nothing shown" .github/workflows/ci.yml
red "a shell script change with nothing shown" scripts/seed-capability-registry.ts
green "that same workflow change with its run captured" \
      .github/workflows/ci.yml screenshots/ci/gate-red-then-green.png

# ---- the gate must fail loudly rather than pass on air ----------------------
bash "$SCRIPT" --files "$TMP/does-not-exist" > "$TMP/log" 2>&1
[ $? -ne 0 ]; ok $? "RED: a missing file list exits non-zero rather than passing"

echo ""
if [ "$fails" -gt 0 ]; then echo "PROOF GATE TEST: FAIL ($fails of $((pass+fails)))"; exit 1; fi
echo "PROOF GATE TEST: PASS ($pass checks)"
