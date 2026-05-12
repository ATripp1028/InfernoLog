#!/usr/bin/env bash
# Run prettier on files changed on the current branch (vs main), so you can see
# and fix formatting issues before pushing a PR. Prettier respects the
# repo-root .prettierrc and any .prettierignore patterns. Files that prettier
# doesn't know how to handle are skipped via --ignore-unknown.
#
# Usage:
#   scripts/format-branch.sh                 # changed files vs `main` (committed + uncommitted)
#   scripts/format-branch.sh --base develop  # diff against a different base branch
#   scripts/format-branch.sh --all           # every tracked file in the repo
#   scripts/format-branch.sh --check         # report what would change, don't write
#   scripts/format-branch.sh --lint          # also run `eslint --fix` on .ts/.tsx/.js/.jsx under apps/*/src or packages/*/src

set -euo pipefail

BASE="main"
MODE="branch"
WRITE_FLAG="--write"
RUN_LINT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all) MODE="all"; shift ;;
    --base) BASE="$2"; shift 2 ;;
    --check) WRITE_FLAG="--check"; shift ;;
    --lint) RUN_LINT=1; shift ;;
    -h|--help)
      sed -n '1,15p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"

EXT_REGEX='\.(ts|tsx|js|jsx|mjs|cjs|json|md|css|html|yml|yaml)$'

collect_files() {
  if [[ "$MODE" == "all" ]]; then
    git ls-files | grep -E "$EXT_REGEX" || true
  else
    if ! git rev-parse --verify "$BASE" >/dev/null 2>&1; then
      echo "Base branch '$BASE' not found locally. Run \`git fetch\` or pass --base." >&2
      exit 1
    fi
    local merge_base
    merge_base=$(git merge-base "$BASE" HEAD)
    # Committed + uncommitted differences vs the merge base.
    # --diff-filter=ACMR excludes Deleted files. Lock files are skipped
    # explicitly since prettier doesn't own them.
    git diff --name-only --diff-filter=ACMR "$merge_base" \
      -- ':!pnpm-lock.yaml' ':!**/pnpm-lock.yaml' \
      | grep -E "$EXT_REGEX" || true
  fi
}

EXISTING=()
while IFS= read -r f; do
  [[ -n "$f" && -f "$f" ]] && EXISTING+=("$f")
done < <(collect_files)

if [[ ${#EXISTING[@]} -eq 0 ]]; then
  echo "No formattable files to process."
  exit 0
fi

echo "Prettier: ${#EXISTING[@]} file(s) (${WRITE_FLAG})"
pnpm exec prettier "$WRITE_FLAG" --ignore-unknown "${EXISTING[@]}"

if [[ "$RUN_LINT" -eq 1 ]]; then
  LINT_FILES=()
  for f in "${EXISTING[@]}"; do
    if [[ "$f" =~ ^(apps|packages)/[^/]+/src/.+\.(ts|tsx|js|jsx)$ ]]; then
      LINT_FILES+=("$f")
    fi
  done
  if [[ ${#LINT_FILES[@]} -gt 0 ]]; then
    echo "ESLint --fix: ${#LINT_FILES[@]} file(s)"
    pnpm exec eslint --fix "${LINT_FILES[@]}" || true
  else
    echo "ESLint: no in-scope files."
  fi
fi
