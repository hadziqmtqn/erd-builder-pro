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
  LOG_REF="$CURRENT_TAG"
else
  RANGE="${PREV_TAG}..${CURRENT_TAG}"
  LOG_REF="$RANGE"
fi

# ── Collect commits ──────────────────────────────────────────────
RAW=$(
  git log --no-merges --format="---%nHASH:%h%nSUBJ:%s%n" "$LOG_REF" 2>/dev/null
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
current_hash=""

commit_link() {
  if [ -n "${GITHUB_REPOSITORY:-}" ]; then
    echo "([\`${current_hash}\`](https://github.com/${GITHUB_REPOSITORY}/commit/${current_hash}))"
  else
    echo "(\`${current_hash}\`)"
  fi
}

while IFS= read -r line; do
  case "$line" in
    ---)
      if [ -n "$current_subj" ]; then
        t="$(get_type "$current_subj")"
        desc="$(get_desc "$current_subj")"
        [ -z "$desc" ] && desc="$current_subj"
        entry="- ${desc} $(commit_link)"

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
      current_hash=""
      ;;
    HASH:*)
      current_hash="${line#HASH:}"
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
  entry="- ${desc} $(commit_link)"
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
contributors=$(git shortlog --group=author --group=trailer:co-authored-by -sn "$LOG_REF" 2>/dev/null || true)
contributor_total=$(printf '%s\n' "$contributors" | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')
change_word="changes"; [ "$total" = "1" ] && change_word="change"
contributor_word="contributors"; [ "$contributor_total" = "1" ] && contributor_word="contributor"

# ── Print release notes ──────────────────────────────────────────
echo "# ERD Builder Pro v${VERSION}"
echo ""
echo "_${total} ${change_word} by ${contributor_total} ${contributor_word}_"
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

if [ -n "$contributors" ]; then
  echo "### 👥 Contributors"
  echo ""
  echo "$contributors" | awk '{$1=$1; commits=$1; $1=""; sub(/^ /, ""); suffix="s"; if (commits == 1) suffix=""; printf "- %s (%d commit%s)\n", $0, commits, suffix}'
  echo ""
fi

if [ -n "${GITHUB_REPOSITORY:-}" ]; then
  if [ -n "$RANGE" ]; then
    echo "**Full Changelog**: https://github.com/${GITHUB_REPOSITORY}/compare/${PREV_TAG}...${CURRENT_TAG}"
  else
    echo "**Release history**: https://github.com/${GITHUB_REPOSITORY}/commits/${CURRENT_TAG}"
  fi
fi
