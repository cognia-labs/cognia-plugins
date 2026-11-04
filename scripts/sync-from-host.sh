#!/usr/bin/env bash
# Import new plugin history from the main Cognia repository (the Host), which
# remains the source of truth for plugin code.
#
#   scripts/sync-from-host.sh <host checkout or clone URL> [ref]
#
# Filters the Host's <ref> (default: host-sync.json's ref) with the paths in
# host-sync-paths.txt, exactly as the first import did. git filter-repo is
# deterministic, so the previous filtered head (host-sync.json) must be an
# ancestor of the new one; anything else means the path list, the filter-repo
# behaviour or the Host's history changed, and the script stops. On success it
# merges the new filtered history into the current branch and records the new
# revisions in host-sync.json. Files this repository owns (its root config,
# scripts/*.mjs, docs) are outside the path list, so the merge cannot touch them;
# plugin files are not edited in this repository, so it cannot conflict either.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source="${1:?usage: scripts/sync-from-host.sh <host checkout or clone URL> [ref]}"
ref="${2:-$(node -p 'require(process.argv[1]).ref' "$repo/host-sync.json")}"
previous="$(node -p 'require(process.argv[1]).filteredHead' "$repo/host-sync.json")"

command -v git-filter-repo >/dev/null || { echo "git filter-repo is required" >&2; exit 1; }
if [ -n "$(git -C "$repo" status --porcelain)" ]; then
  echo "sync-from-host: commit or discard local changes first" >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
git clone --quiet --single-branch --branch "$ref" --no-tags "$source" "$work/host"
host_revision="$(git -C "$work/host" rev-parse HEAD)"
grep -v '^#' "$repo/host-sync-paths.txt" | sed '/^$/d' > "$work/paths"
git -C "$work/host" filter-repo --quiet --force --paths-from-file "$work/paths"
filtered="$(git -C "$work/host" rev-parse HEAD)"

git -C "$repo" fetch --quiet --no-tags "$work/host" "HEAD:refs/heads/host-sync"
if ! git -C "$repo" merge-base --is-ancestor "$previous" "$filtered"; then
  echo "sync-from-host: $filtered does not descend from the last import $previous;" >&2
  echo "the filtered history diverged, so nothing was merged (branch host-sync kept for inspection)" >&2
  exit 1
fi
if [ "$filtered" = "$previous" ]; then
  echo "sync-from-host: no new plugin history at $ref ($host_revision)"
  git -C "$repo" branch --quiet -D host-sync
  exit 0
fi
count="$(git -C "$repo" rev-list --count "$previous..$filtered")"
git -C "$repo" merge --quiet --no-ff --no-edit -m "chore(sync): import plugin history from $ref at ${host_revision:0:10}" "$filtered"
node -e '
  const fs = require("node:fs")
  const [file, hostRevision, filteredHead] = process.argv.slice(1)
  const state = JSON.parse(fs.readFileSync(file, "utf8"))
  fs.writeFileSync(file, JSON.stringify({ ...state, hostRevision, filteredHead }, null, 2) + "\n")
' "$repo/host-sync.json" "$host_revision" "$filtered"
git -C "$repo" commit --quiet --amend --no-edit -- host-sync.json
git -C "$repo" branch --quiet -D host-sync
echo "sync-from-host: merged $count commit(s) from $ref at $host_revision"
