#!/usr/bin/env bash
set -euo pipefail
release_source_sha="${LUNARIS_BUILD_SHA:-${GITHUB_SHA:-}}"

if [[ "$#" -ne 5 ]]; then
  echo "Usage: publish-homebrew.sh <cli|desktop> <version> <signed|adhoc> <dist-directory> <tap-directory>" >&2
  exit 1
fi

component="$1"
version="$2"
signing_mode="$3"
dist_directory="$4"
tap_directory="$5"
tap_repository="${HOMEBREW_TAP_REPOSITORY:-LunarisApp/homebrew-tap}"

for command in bun gh git; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command not found: $command" >&2
    exit 1
  fi
done

for variable in GH_TOKEN release_source_sha; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Required environment variable is empty: $variable" >&2
    exit 1
  fi
done

if [[ ! -d "$tap_directory/.git" ]]; then
  echo "Homebrew tap checkout is missing: $tap_directory" >&2
  exit 1
fi

case "$component" in
  cli)
    definition_path="Formula/lunaris.rb"
    component_title="CLI"
    ;;
  desktop)
    definition_path="Casks/lunaris.rb"
    component_title="Desktop"
    ;;
  *)
    echo "Unsupported Homebrew component: $component" >&2
    exit 1
    ;;
esac

branch="release/${component}-${version}"
git -C "$tap_directory" fetch origin main
remote_branch_sha="$(
  git -C "$tap_directory" ls-remote --heads origin "refs/heads/$branch" |
    awk 'NR == 1 { print $1 }'
)"
git -C "$tap_directory" checkout -B "$branch" origin/main

bun tooling/release/homebrew.ts \
  "$component" \
  "$version" \
  "$signing_mode" \
  "$dist_directory" \
  "$tap_directory"

git -C "$tap_directory" add "$definition_path"
if git -C "$tap_directory" diff --cached --quiet; then
  echo "Homebrew tap already contains $component $version"
  exit 0
fi

git -C "$tap_directory" config user.name "lunaris-release[bot]"
git -C "$tap_directory" config user.email "lunaris-release[bot]@users.noreply.github.com"
git -C "$tap_directory" commit \
  -m "chore: update Lunaris $component_title to $version"
head_sha="$(git -C "$tap_directory" rev-parse HEAD)"

if [[ -n "$remote_branch_sha" ]]; then
  git -C "$tap_directory" push \
    --force-with-lease="refs/heads/$branch:$remote_branch_sha" \
    origin "HEAD:refs/heads/$branch"
else
  git -C "$tap_directory" push origin "HEAD:refs/heads/$branch"
fi

pr_number="$(
  gh pr list \
    --repo "$tap_repository" \
    --head "$branch" \
    --base main \
    --state open \
    --json number \
    --jq '.[0].number // empty'
)"
if [[ -z "$pr_number" ]]; then
  pr_url="$(
    gh pr create \
      --repo "$tap_repository" \
      --head "$branch" \
      --base main \
      --title "Lunaris $component_title $version" \
      --body "Automated Homebrew update for Lunaris $component_title $version from LunarisApp/lunaris@$release_source_sha."
  )"
  pr_number="${pr_url##*/}"
fi

test_bot_checks=0
for _attempt in $(seq 1 60); do
  test_bot_checks="$(
    gh pr checks "$pr_number" \
      --repo "$tap_repository" \
      --json name \
      --jq '[.[] | select(.name | startswith("test-bot ("))] | length' \
      2>/dev/null || true
  )"
  if [[ "$test_bot_checks" -ge 3 ]]; then
    break
  fi
  sleep 5
done
if [[ "$test_bot_checks" -lt 3 ]]; then
  echo "Homebrew tap CI did not start for $head_sha" >&2
  exit 1
fi

gh pr checks "$pr_number" \
  --repo "$tap_repository" \
  --watch \
  --fail-fast \
  --interval 10
failed_checks="$(
  gh pr checks "$pr_number" \
    --repo "$tap_repository" \
    --json bucket \
    --jq '[.[] | select(.bucket != "pass" and .bucket != "skipping")] | length'
)"
if [[ "$failed_checks" -ne 0 ]]; then
  echo "Homebrew tap CI did not succeed" >&2
  exit 1
fi

pr_head="$(
  gh pr view "$pr_number" \
    --repo "$tap_repository" \
    --json headRefOid \
    --jq .headRefOid
)"
if [[ "$pr_head" != "$head_sha" ]]; then
  echo "Homebrew PR head changed during validation" >&2
  exit 1
fi

gh pr merge "$pr_number" \
  --repo "$tap_repository" \
  --squash \
  --match-head-commit "$head_sha" \
  --delete-branch
