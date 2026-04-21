#!/usr/bin/env bash
set -euo pipefail

# ~/.aiclone/ を初期化するスクリプト。
# fork 先の ai-clone リポジトリ直下から実行する想定。

AICLONE_HOME="${AICLONE_HOME:-$HOME/.aiclone}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES="$SCRIPT_DIR/../templates"

echo "Initializing $AICLONE_HOME"
mkdir -p "$AICLONE_HOME/logs" "$AICLONE_HOME/sockets" "$AICLONE_HOME/inbox"
chmod 700 "$AICLONE_HOME"

copy_if_missing() {
  local src="$1"
  local dst="$2"
  if [ -e "$dst" ]; then
    echo "  skip: $dst (already exists)"
  else
    cp "$src" "$dst"
    echo "  created: $dst"
  fi
}

copy_if_missing "$TEMPLATES/persona.md"  "$AICLONE_HOME/persona.md"
copy_if_missing "$TEMPLATES/working.md"  "$AICLONE_HOME/working.md"
copy_if_missing "$TEMPLATES/config.json" "$AICLONE_HOME/config.json"

if ! fdesetup status 2>/dev/null | grep -q "FileVault is On"; then
  echo ""
  echo "WARNING: FileVault appears to be disabled."
  echo "  The aiclone DB lives at $AICLONE_HOME/memory.db without app-level encryption."
  echo "  Enable FileVault: System Settings -> Privacy & Security -> FileVault."
fi

echo "Done."
