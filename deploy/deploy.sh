#!/usr/bin/env bash
#
# deploy.sh — Baut die SPA (base-href /profilierer/) und synchronisiert
# Build + Server per rsync auf den Raspberry Pi.
#
# Auf dem Pi landet alles in ~/profilierer-staging/ (anpassbar).
# Anschliessend dort fortfahren:
#   ssh <pi>
#   cd ~/profilierer-staging
#   sudo bash pi/02-install-app.sh    # immer beim Update
#
# Aufruf (lokal, im deploy-Ordner):
#   ./deploy.sh pi@pi.local
#   ./deploy.sh pi@pi.local /home/pi/profilierer-staging
#
# Voraussetzung auf dem Laptop: Node >= 22.12 (nvm use 24, siehe CLAUDE.md).

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Aufruf: $0 <user@host> [<remote-staging-dir>]" >&2
  echo "Beispiel: $0 pi@pi.local" >&2
  exit 1
fi

REMOTE="$1"
REMOTE_DIR="${2:-profilierer-staging}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# --- Node 24 aktivieren (Angular 20 braucht >= 22.12; System-Node ist aelter) ---
if [[ -s "${HOME}/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  export NVM_DIR="${HOME}/.nvm"; . "${NVM_DIR}/nvm.sh"; nvm use 24 >/dev/null
fi
echo "==> Node: $(node -v)"

# --- Build mit Unterpfad-base-href ---------------------------------------
echo "==> SPA bauen (base-href /profilierer/)"
cd "${REPO_DIR}"
npx ng build --base-href /profilierer/

# --- Hochladen ------------------------------------------------------------
# server/ ohne node_modules (better-sqlite3 wird auf dem Pi fuer arm64 gebaut)
# und ohne data/ (die Produktions-DB darf nie ueberschrieben werden).
echo "==> Synchronisiere nach ${REMOTE}:${REMOTE_DIR}/"
ssh "${REMOTE}" "mkdir -p '${REMOTE_DIR}/dist' '${REMOTE_DIR}/server' '${REMOTE_DIR}/pi'"
rsync -avh --delete \
  --exclude='.DS_Store' \
  --exclude='node_modules/' \
  --exclude='data/' \
  --exclude='*.log' \
  "${REPO_DIR}/dist/xjustiz-profilierer/browser/" \
  "${REMOTE}:${REMOTE_DIR}/dist/"

rsync -avh --delete \
  --exclude='.DS_Store' \
  --exclude='node_modules/' \
  --exclude='data/' \
  --exclude='*.log' \
  --exclude='*.test.js' \
  "${REPO_DIR}/server/" \
  "${REMOTE}:${REMOTE_DIR}/server/"

rsync -avh --delete \
  --exclude='.DS_Store' \
  "${SCRIPT_DIR}/pi/" \
  "${REMOTE}:${REMOTE_DIR}/pi/"

echo
echo "Fertig hochgeladen. Naechster Schritt auf dem Pi:"
echo "  ssh ${REMOTE}"
echo "  cd ~/${REMOTE_DIR}"
echo "  sudo bash pi/02-install-app.sh"
