#!/usr/bin/env bash
# Tauri downloads installer tools from GitHub; retry transient HTTP failures only.
set -euo pipefail
log="$(mktemp)"
trap 'rm -f "$log"' EXIT
for attempt in 1 2 3; do
  status=0
  "$@" 2>&1 | tee "$log" || status=$?
  if [ "$status" -eq 0 ]; then
    exit 0
  fi
  if [ "$attempt" -eq 3 ] || ! grep -Eq 'failed to bundle project:.*http status: (429|5[0-9]{2})' "$log"; then
    exit "$status"
  fi
  echo "::warning::Installer download failed; retrying build (attempt $((attempt + 1))/3)"
  sleep "$((attempt * 10))"
done
