#!/usr/bin/env bash
#
# 02-install-app.sh — Installiert oder aktualisiert den XJustiz Profilierer
# auf dem Raspberry Pi (Unterpfad https://xjw.freiheits.de/profilierer).
#
# Erwartet im Staging-Root (eine Ebene ueber diesem Skript, siehe deploy.sh):
#   dist/     — gebaute SPA (base-href /profilierer/)
#   server/   — Express-Backend (ohne node_modules, ohne data/)
#   pi/xjustiz-profilierer.service, pi/nginx-profilierer-snippet.conf
#
# Idempotent: kann fuer Updates erneut laufen. Die Produktions-DB unter
# /var/lib/xjustiz-profilierer/ wird nie angefasst.
#
# Aufruf auf dem Pi:
#   sudo bash pi/02-install-app.sh

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Bitte mit sudo ausfuehren." >&2
  exit 1
fi

# --- Pfade ---------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGING_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

APP_DIR="/opt/xjustiz-profilierer"
LIB_DIR="/var/lib/xjustiz-profilierer"
SERVICE_NAME="xjustiz-profilierer.service"
SNIPPET="/etc/nginx/snippets/xjp-profilierer.conf"

# --- Vorbedingungen ------------------------------------------------------
if [[ ! -d "${STAGING_ROOT}/dist" || ! -d "${STAGING_ROOT}/server" ]]; then
  echo "dist/ oder server/ fehlt in ${STAGING_ROOT} — erst deploy.sh vom Laptop ausfuehren." >&2
  exit 1
fi

# --- Node 24 sicherstellen (nodesource, arm64) ----------------------------
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]]; then
  echo "==> Node 24 installieren (nodesource)"
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
echo "==> Node: $(node -v)"

# Build-Werkzeuge als Fallback, falls better-sqlite3 kein arm64-Prebuilt hat.
if ! command -v make >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
  echo "==> Build-Werkzeuge installieren (better-sqlite3-Fallback)"
  apt-get install -y build-essential python3
fi

# --- Service-User ---------------------------------------------------------
if ! id -u xjp >/dev/null 2>&1; then
  echo "==> Service-User 'xjp' anlegen"
  useradd --system --home-dir "${APP_DIR}" --shell /usr/sbin/nologin xjp
fi

# --- Verzeichnisse --------------------------------------------------------
echo "==> Verzeichnisse vorbereiten"
install -d -o xjp -g xjp -m 0755 "${APP_DIR}"
install -d -o xjp -g xjp -m 0755 "${LIB_DIR}"

# --- Service ggf. stoppen -------------------------------------------------
if systemctl is-active --quiet "${SERVICE_NAME}"; then
  echo "==> Laufenden Service stoppen"
  systemctl stop "${SERVICE_NAME}"
fi

# --- App uebernehmen -------------------------------------------------------
# Der Server erwartet die SPA unter ../dist/xjustiz-profilierer/browser
# (relativ zu server/index.js). rsync legt verschachtelte Zielpfade nicht an.
echo "==> SPA und Server uebernehmen"
install -d -o xjp -g xjp -m 0755 \
  "${APP_DIR}/dist" "${APP_DIR}/dist/xjustiz-profilierer" \
  "${APP_DIR}/dist/xjustiz-profilierer/browser" "${APP_DIR}/server"
rsync -a --delete --chown=xjp:xjp \
  "${STAGING_ROOT}/dist/" "${APP_DIR}/dist/xjustiz-profilierer/browser/"
rsync -a --delete --chown=xjp:xjp \
  --exclude='node_modules/' --exclude='data/' \
  "${STAGING_ROOT}/server/" "${APP_DIR}/server/"

echo "==> Server-Abhaengigkeiten installieren (better-sqlite3 fuer arm64)"
cd "${APP_DIR}/server"
sudo -u xjp npm ci --omit=dev --no-audit --no-fund

# --- systemd-Unit ----------------------------------------------------------
echo "==> systemd-Unit installieren"
install -o root -g root -m 0644 \
  "${SCRIPT_DIR}/${SERVICE_NAME}" \
  "/etc/systemd/system/${SERVICE_NAME}"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"

# --- nginx-Snippet ----------------------------------------------------------
# Der Include-Glob dafuer liegt in der XJW-Site (nginx-xjustiz.conf):
#   include /etc/nginx/snippets/xjp-profilierer*.conf;
echo "==> nginx-Snippet installieren"
install -d -o root -g root -m 0755 /etc/nginx/snippets
install -o root -g root -m 0644 \
  "${SCRIPT_DIR}/nginx-profilierer-snippet.conf" \
  "${SNIPPET}"
if ! grep -rqs 'xjp-profilierer' /etc/nginx/sites-enabled/; then
  echo "WARNUNG: Kein Include fuer ${SNIPPET} in den aktiven nginx-Sites gefunden." >&2
  echo "         In der XJW-Site (sites-available/xjustiz, 443-Block) muss stehen:" >&2
  echo "           include /etc/nginx/snippets/xjp-profilierer*.conf;" >&2
  echo "         (XJW-Repo: deploy/pi/nginx-xjustiz.conf, dann XJW neu ausrollen.)" >&2
fi
nginx -t
systemctl reload nginx || systemctl restart nginx

# --- Service starten --------------------------------------------------------
echo "==> Service starten"
systemctl restart "${SERVICE_NAME}"

sleep 2
systemctl --no-pager --full status "${SERVICE_NAME}" || true

echo
echo "Fertig."
echo "  - Logs:              journalctl -u ${SERVICE_NAME} -f"
echo "  - Test (lokal):      curl -s http://127.0.0.1:3001/api/profiles"
echo "  - Test (oeffentlich): https://xjw.freiheits.de/profilierer/"
echo "  - Backup:            ${LIB_DIR}/profiles.db (+ -wal/-shm)"
