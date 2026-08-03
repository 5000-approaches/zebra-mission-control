#!/usr/bin/env bash
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
SCRIPT="$HERE/check-pr-proof.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
ok() {
  if [ "$1" -eq 0 ]; then
    PASS=$((PASS + 1))
    echo "  ok $PASS: $2"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: $2"
  fi
}

run_case() {
  REPO=5000-approaches/Example \
  PR_BODY_FILE="$TMP/body" \
  PR_CHANGED_FILES="$TMP/changed" \
  PR_BRANCHES_FILE="$TMP/branches" \
  PR_CONTENT_MANIFEST="$TMP/content" \
    bash "$SCRIPT" > "$TMP/log" 2>&1
}

printf '%s\n' dev feature/proof feature/proof/long > "$TMP/branches"
printf 'feature/proof\tscreenshots/real.png\n' > "$TMP/content"

printf 'src/app.ts\n' > "$TMP/changed"
printf '## Proof\n\n' > "$TMP/body"
run_case
[ $? -ne 0 ]; ok $? "RED: runnable change with an empty Proof section"

printf '## Proof\n<!-- <img src="example"> -->\n' > "$TMP/body"
run_case
[ $? -ne 0 ]; ok $? "RED: template comments do not count as proof"

printf '## Proof\n<img src="https://github.com/5000-approaches/example/blob/feature/proof/screenshots/real.png?raw=true">\n' > "$TMP/body"
run_case
ok $? "GREEN: an existing same-branch picture passes"

printf '## Proof\n<img src="https://github.com/5000-approaches/example/blob/feature/proof/screenshots/missing.png?raw=true">\n' > "$TMP/body"
run_case
[ $? -ne 0 ]; ok $? "RED: a missing picture fails"

printf '## Proof\n<img src="https://github.com/someone/else/blob/dev/proof.png?raw=true">\n' > "$TMP/body"
run_case
[ $? -ne 0 ]; ok $? "RED: an outside-repository picture cannot satisfy the gate"

printf 'README.md\n' > "$TMP/changed"
printf '## Proof\n\n' > "$TMP/body"
run_case
ok $? "GREEN: documentation-only changes owe no proof"

printf 'src/app.ts\n' > "$TMP/changed"
printf 'feature/proof/long\tscreenshots/real.png\n' > "$TMP/content"
printf '## Proof\n<img src="https://github.com/5000-approaches/example/blob/feature/proof/long/screenshots/real.png?raw=true">\n' > "$TMP/body"
run_case
ok $? "GREEN: the longest matching slashed branch is used"

mkdir -p "$TMP/bin"
printf '#!/usr/bin/env bash\nexit 17\n' > "$TMP/bin/gh"
chmod +x "$TMP/bin/gh"
PATH="$TMP/bin:$PATH" REPO=5000-approaches/example PR=1 bash "$SCRIPT" > "$TMP/log" 2>&1
[ $? -ne 0 ]; ok $? "RED: an unreadable GitHub diff fails closed"

echo ""
if [ "$FAIL" -gt 0 ]; then
  echo "PR PROOF TEST: FAIL ($FAIL of $((PASS + FAIL)))"
  exit 1
fi
echo "PR PROOF TEST: PASS ($PASS checks)"
