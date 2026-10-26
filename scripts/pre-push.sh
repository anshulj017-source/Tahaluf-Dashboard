#!/bin/bash
# Pre-push git hook: whenever main is pushed to live repo (origin), mirror to backup repo.
REMOTE_NAME="$1"
[ "$REMOTE_NAME" = "origin" ] || exit 0

REPO="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO/scripts/backup-to-mirror.sh"
[ -x "$SCRIPT" ] || SCRIPT="$(git rev-parse --absolute-git-dir)/backup-to-mirror.sh"
[ -x "$SCRIPT" ] || exit 0

while read -r LOCAL_REF LOCAL_SHA REMOTE_REF REMOTE_SHA; do
  if [ "$REMOTE_REF" = "refs/heads/main" ] && [ "$LOCAL_SHA" != "0000000000000000000000000000000000000000" ]; then
    if ! "$SCRIPT" "$LOCAL_SHA"; then
      echo "[backup] WARNING: backup to itsjohn9-cell/backupdashboard FAILED (live push will continue)." >&2
    fi
  fi
done
exit 0
