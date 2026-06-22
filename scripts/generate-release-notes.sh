#!/usr/bin/env bash
# scripts/generate-release-notes.sh
#
# Auto-generate release notes from git commits between two tags.
# Groups commits by conventional commit type (feat, fix, refactor, etc.)
# and formats them similar to .hermes/changelog/ format.
#
# Usage: ./scripts/generate-release-notes.sh <prev_tag> <current_tag>
#   or:  ./scripts/generate-release-notes.sh <current_tag>  (first release)

set -euo pipefail

PREV_TAG="${1:-}"
CURRENT_TAG="${2:-$PREV_TAG}"
VERSION="${CURRENT_TAG#v}"

if [ -z "$PREV_TAG" ]; then
  echo "Usage: $0 <prev_tag> [current_tag]"
  exit 1
fi

if [ "$PREV_TAG" = "$CURRENT_TAG" ]; then
  RANGE=""
else
  RANGE="${PREV_TAG}..${CURRENT_TAG}"
fi

# ── Collect commits ──────────────────────────────────────────────
RAW=$(
  if [ -n "$RANGE" ]; then
    git log --format="---%nSUBJ:%s%n" "$RANGE" 2>/dev/null
  else
    git log --format="---%nSUBJ:%s%n" 2>/dev/null | head -100
  fi
)

if [ -z "$RAW" ]; then
  echo "No commits found."
  exit 0
fi

# ── Categorize commits ───────────────────────────────────────────
# Use temp files per category (macOS bash 3 compat)
TMPDIR="${TMPDIR:-/tmp}/relnotes-$$"
mkdir -p "$TMPDIR"
trap 'rm -rf "$TMPDIR"' EXIT

CAT_FEAT="$TMPDIR/feat"
CAT_FIX="$TMPDIR/fix"
CAT_REFACTOR="$TMPDIR/refactor"
CAT_DOCS="$TMPDIR/docs"
CAT_CI="$TMPDIR/ci"
CAT_CHORE="$TMPDIR/chore"
CAT_PERF="$TMPDIR/perf"
CAT_TEST="$TMPDIR/test"
CAT_OTHER="$TMPDIR/other"

# Ensure files exist
for f in "$CAT_FEAT" "$CAT_FIX" "$CAT_REFACTOR" "$CAT_DOCS" "$CAT_CI" "$CAT_CHORE" "$CAT_PERF" "$CAT_TEST" "$CAT_OTHER"; do
  touch "$f"
done

# Helper: extract type from conventional commit subject
# "feat(ci): blah" → "feat"
# "fix: blah" → "fix"
# "✨ feat: blah" → "feat"
get_type() {
  local s="$1"
  # Strip leading non-alphabetic chars (emojis, spaces)
  s="$(echo "$s" | sed 's/^[^a-zA-Z]*//')"
  # Extract type (before any paren or colon)
  echo "$s" | sed 's/^\([a-zA-Z0-9_-]*\).*/\1/' | tr '[:upper:]' '[:lower:]'
}

# Helper: extract description after "type(scope): " or "type: "
get_desc() {
  local s="$1"
  # Remove conventional commit prefix: type(scope): or type:
  echo "$s" | sed 's/^[^:]*:[[:space:]]*//'
}

current_subj=""

while IFS= read -r line; do
  case "$line" in
    ---)
      if [ -n "$current_subj" ]; then
        t="$(get_type "$current_subj")"
        desc="$(get_desc "$current_subj")"
        [ -z "$desc" ] && desc="$current_subj"
        entry="- ${desc}"

        case "$t" in
          feat|feature)              echo "$entry" >> "$CAT_FEAT" ;;
          fix|bugfix)                echo "$entry" >> "$CAT_FIX" ;;
          refactor|ref)              echo "$entry" >> "$CAT_REFACTOR" ;;
          docs|documentation)        echo "$entry" >> "$CAT_DOCS" ;;
          ci|cd|build)               echo "$entry" >> "$CAT_CI" ;;
          chore)                     echo "$entry" >> "$CAT_CHORE" ;;
          perf|performance)          echo "$entry" >> "$CAT_PERF" ;;
          test)                      echo "$entry" >> "$CAT_TEST" ;;
          *)                         echo "- ${current_subj}" >> "$CAT_OTHER" ;;
        esac
      fi
      current_subj=""
      ;;
    SUBJ:*)
      current_subj="${line#SUBJ:}"
      ;;
  esac
done <<< "$RAW"

# Last commit
if [ -n "$current_subj" ]; then
  t="$(get_type "$current_subj")"
  desc="$(get_desc "$current_subj")"
  [ -z "$desc" ] && desc="$current_subj"
  entry="- ${desc}"
  case "$t" in
    feat|feature)              echo "$entry" >> "$CAT_FEAT" ;;
    fix|bugfix)                echo "$entry" >> "$CAT_FIX" ;;
    refactor|ref)              echo "$entry" >> "$CAT_REFACTOR" ;;
    docs|documentation)        echo "$entry" >> "$CAT_DOCS" ;;
    ci|cd|build)               echo "$entry" >> "$CAT_CI" ;;
    chore)                     echo "$entry" >> "$CAT_CHORE" ;;
    perf|performance)          echo "$entry" >> "$CAT_PERF" ;;
    test)                      echo "$entry" >> "$CAT_TEST" ;;
    *)                         echo "- ${current_subj}" >> "$CAT_OTHER" ;;
  esac
fi

# ── Count total commits ──────────────────────────────────────────
total=$(echo "$RAW" | grep -c "^SUBJ:" 2>/dev/null || echo "0")

# ── Print release notes ──────────────────────────────────────────
echo "# Release v${VERSION}"
echo ""
echo "_${total} commits_"
echo ""

HAS_CONTENT=false

print_section() {
  local emoji="$1"
  local title="$2"
  local file="$3"
  if [ -s "$file" ]; then
    $HAS_CONTENT && echo ""
    echo "### ${emoji} ${title}"
    echo ""
    cat "$file"
    HAS_CONTENT=true
  fi
}

print_section "✨" "New Features" "$CAT_FEAT"
print_section "🐛" "Bug Fixes" "$CAT_FIX"
print_section "♻️" "Refactors" "$CAT_REFACTOR"
print_section "⚡" "Performance" "$CAT_PERF"
print_section "📚" "Documentation" "$CAT_DOCS"
print_section "👷" "Build & CI/CD" "$CAT_CI"
print_section "🔧" "Chores" "$CAT_CHORE"
print_section "✅" "Tests" "$CAT_TEST"

if [ -s "$CAT_OTHER" ]; then
  echo ""
  echo "### Other"
  echo ""
  cat "$CAT_OTHER"
fi

echo ""

