#!/bin/bash
# Backup mirror automation for private repository.
# Usage: bash scripts/backup-to-mirror.sh [commit-ish]   (default: HEAD)
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

BACKUP_URL="https://github.com/itsjohn9-cell/backupdashboard.git"
REPO="$(git rev-parse --show-toplevel)"
GIT_DIR_ABS="$(git rev-parse --absolute-git-dir)"
MIRROR="$GIT_DIR_ABS/backup-mirror"
SHA="$(git rev-parse "${1:-HEAD}")"
SUBJECT="$(git log -1 --pretty=%s "$SHA")"

# Authenticate as the account that owns the backup repo, independent of the keychain used for origin.
gitb() { git -c credential.helper= -c credential.helper='!gh auth git-credential' "$@"; }

if [ ! -d "$MIRROR/.git" ]; then
  gitb clone --quiet "$BACKUP_URL" "$MIRROR"
fi

cd "$MIRROR"
gitb fetch --quiet origin main
git checkout --quiet main
git reset --quiet --hard origin/main

# Replace mirror contents with exactly the commit being published.
find "$MIRROR" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
git -C "$REPO" archive "$SHA" | tar -x -C "$MIRROR"

# Keep including .env.local like the previous backup did (private repo).
if [ -f "$REPO/.env.local" ]; then
  cp -f "$REPO/.env.local" "$MIRROR/.env.local"
fi

git add -A
git add -f .env.local 2>/dev/null || true

if git diff --cached --quiet; then
  echo "[backup] No changes to back up (commit ${SHA:0:7})."
  exit 0
fi

git commit --quiet -m "Backup: $(date '+%Y-%m-%d %H:%M:%S') - ${SHA:0:7} $SUBJECT"
gitb push --quiet origin main
echo "[backup] Pushed ${SHA:0:7} to itsjohn9-cell/backupdashboard"
