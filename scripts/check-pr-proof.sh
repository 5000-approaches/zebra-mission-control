#!/usr/bin/env bash
# Checks the PR body and every linked proof file. Test fixtures can replace
# GitHub reads, so the exact script CI runs is also the script the tests run.
set -euo pipefail

: "${REPO:?REPO is required}"
FAIL=0

if [ -n "${PR_BODY_FILE:-}" ]; then
  BODY=$(cat "$PR_BODY_FILE")
else
  : "${PR:?PR is required}"
  BODY=$(gh pr view "$PR" --repo "$REPO" --json body --jq .body)
fi

if [ -n "${PR_CHANGED_FILES:-}" ]; then
  CHANGED=$(cat "$PR_CHANGED_FILES")
else
  : "${PR:?PR is required}"
  CHANGED=$(gh pr diff "$PR" --repo "$REPO" --name-only)
fi

RUNNABLE=$(printf '%s\n' "$CHANGED" \
  | grep -Ev '^\s*$' \
  | grep -Ev '^screenshots/' \
  | grep -Ev '(^|/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$' \
  | grep -Ev '\.(md|mdx|txt|csv|svg|ico|snap)$' \
  | grep -Ev '(^|/)__tests__/|\.test\.[jt]sx?$|\.spec\.[jt]sx?$|^e2e/' \
  | grep -E '\.(m?[jt]sx?|css|scss|html|ya?ml|json|sh|py|sql)$|^\.github/workflows/' \
  || true)

if [ -n "$RUNNABLE" ]; then
  SECTION=$(printf '%s\n' "$BODY" \
    | awk '/^## Proof/{on=1;next} /^## /{on=0} on' \
    | perl -0pe 's/<!--.*?-->//gs')
  if [ -z "$(printf '%s' "$SECTION" | tr -d '[:space:]')" ]; then
    echo "❌ this change can be watched run, and its Proof section is missing or empty"
    FAIL=1
  elif ! printf '%s\n' "$SECTION" | grep -qiE '<img |cannot be run|nothing visual was produced'; then
    echo "❌ the Proof section carries no inline picture and no stated reason there is none"
    FAIL=1
  else
    echo "✅ the Proof section is filled"
  fi
else
  echo "✅ nothing in this change can be watched run — no proof owed"
fi

LINKS=$(printf '%s\n' "$BODY" \
  | grep -oE 'https://github\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+/blob/[^ )"<>]+' \
  | sed 's/[.,;:]*$//' | sed 's/?raw=true$//' | sort -u || true)

if [ -n "$LINKS" ]; then
  if [ -n "${PR_BRANCHES_FILE:-}" ]; then
    BRANCHES=$(cat "$PR_BRANCHES_FILE")
  else
    BRANCHES=$(gh api "repos/$REPO/branches" --paginate --jq '.[].name')
  fi

  while read -r LINK; do
    [ -z "$LINK" ] && continue
    PREFIX="https://github.com/$REPO/blob/"
    LOWER_LINK=$(printf '%s' "$LINK" | tr '[:upper:]' '[:lower:]')
    LOWER_PREFIX=$(printf '%s' "$PREFIX" | tr '[:upper:]' '[:lower:]')
    case "$LOWER_LINK" in
      "$LOWER_PREFIX"*) ;;
      *)
        echo "❌ proof link points outside this repository: $LINK"
        FAIL=1
        continue
        ;;
    esac

    REST="${LINK:${#PREFIX}}"
    REF=""
    while read -r BRANCH; do
      case "$REST" in
        "$BRANCH"/*) [ ${#BRANCH} -gt ${#REF} ] && REF="$BRANCH" ;;
      esac
    done <<< "$BRANCHES"

    if [ -z "$REF" ]; then
      echo "❌ broken link (no such branch): $LINK"
      FAIL=1
      continue
    fi

    PATH_IN_REPO="${REST#"$REF"/}"
    if [ -n "${PR_CONTENT_MANIFEST:-}" ]; then
      if ! grep -Fqx "$REF"$'\t'"$PATH_IN_REPO" "$PR_CONTENT_MANIFEST"; then
        echo "❌ broken link (file not on $REF): $LINK"
        FAIL=1
        continue
      fi
    elif ! gh api "repos/$REPO/contents/$PATH_IN_REPO?ref=$REF" --jq .sha > /dev/null 2>&1; then
      echo "❌ broken link (file not on $REF): $LINK"
      FAIL=1
      continue
    fi
    echo "✅ exists: $LINK"
  done <<< "$LINKS"
fi

[ "$FAIL" -eq 0 ]
