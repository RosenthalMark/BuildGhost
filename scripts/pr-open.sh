#!/usr/bin/env bash
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "[pr-open] GitHub CLI (gh) is required."
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[pr-open] Run this inside a git repository."
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" == "HEAD" || -z "$branch" ]]; then
  echo "[pr-open] Could not determine current branch."
  exit 1
fi

if [[ "$branch" == "main" ]]; then
  echo "[pr-open] Current branch is 'main'. Create a feature branch first."
  exit 1
fi

no_prompt=0
base="main"
for arg in "$@"; do
  case "$arg" in
    --no-prompt) no_prompt=1 ;;
    *) base="$arg" ;;
  esac
done

echo "[pr-open] Creating PR: $branch -> $base"
gh pr create --base "$base" --head "$branch" --fill

url="$(gh pr view --json url -q .url)"
echo "[pr-open] PR created: $url"
if [[ "$no_prompt" -ne 1 ]]; then
  read -r -p "Press Enter to open in browser (or Ctrl+C to cancel)... " _
fi

if command -v open >/dev/null 2>&1; then
  open "$url"
else
  gh pr view --web
fi
