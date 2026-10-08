#!/usr/bin/env bash
#
# db-spiegeln.sh — Holt die Produktiv-Datenbank vom Pi und macht sie zur
# lokalen Datenbank. Einbahnstrasse: es wird ausschliesslich **gelesen**;
# auf dem Pi entsteht nur eine temporaere Kopie, die danach wieder weg ist.
#
# Warum eine Sicherungskopie und kein blosses scp: die Produktiv-DB laeuft im
# WAL-Modus. Eine kopierte `profiles.db` ohne ihr `-wal` ist der Stand vor dem
# letzten Checkpoint — je nach Zeitpunkt fehlen die juengsten Aenderungen.
# `sqlite3 .backup` (bzw. der node-Ersatz) schreibt eine in sich geschlossene,
# konsistente Datei, waehrend der Dienst weiterlaeuft.
#
# Aufruf (aus dem Repo-Wurzelverzeichnis oder diesem Ordner):
#   ./deploy/db-spiegeln.sh                      # pi@pi.local, Standardpfade
#   ./deploy/db-spiegeln.sh pi@raspi             # anderes Ziel
#   ./deploy/db-spiegeln.sh pi@raspi /var/lib/xjustiz-profilierer/profiles.db
#   ./deploy/db-spiegeln.sh --von-datei ~/prod.db   # aus vorhandener Kopie
#   npm run db:spiegeln -- pi@raspi
#
# Optionen:
#   --von-datei <pfad>  Kein SSH: eine bereits vorliegende DB-Datei einspielen.
#   --force             Auch bei laufendem lokalen Backend spiegeln.
#
# Env: XJP_PI (Standard-Ziel), XJP_DB (lokale DB, Standard server/data/profiles.db)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

REMOTE_DB_STD='/var/lib/xjustiz-profilierer/profiles.db'
LOKAL_DB="${XJP_DB:-${REPO_DIR}/server/data/profiles.db}"
VON_DATEI=''
FORCE=0
ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --von-datei)
      VON_DATEI="${2:-}"
      [[ -n "${VON_DATEI}" ]] || { echo "--von-datei braucht einen Pfad" >&2; exit 1; }
      shift 2
      ;;
    --force) FORCE=1; shift ;;
    -h|--help) sed -n '3,28p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "Unbekannte Option: $1" >&2; exit 1 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done

REMOTE="${ARGS[0]:-${XJP_PI:-pi@pi.local}}"
REMOTE_DB="${ARGS[1]:-${REMOTE_DB_STD}}"

# --- Node fuer die spaeteren Pruefungen (better-sqlite3 aus server/) --------
if [[ -s "${HOME}/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  export NVM_DIR="${HOME}/.nvm"; . "${NVM_DIR}/nvm.sh"; nvm use 24 >/dev/null 2>&1 || true
fi
if [[ ! -d "${REPO_DIR}/server/node_modules/better-sqlite3" ]]; then
  echo "server/node_modules fehlt — einmalig 'cd server && npm install'." >&2
  exit 1
fi

# --- Haelt ein Prozess genau diese Datenbank offen? ------------------------
# Die Datei unter einem offenen SQLite-Handle auszutauschen fuehrt zu einem
# Prozess, der weiter in die alte (geloeschte) Datei schreibt: die Spiegelung
# waere gleich wieder ueberholt. Gefragt wird nach der **Zieldatei**, nicht nach
# dem Prozessnamen — ein Backend auf einer anderen DB stoert nicht.
if [[ ${FORCE} -eq 0 && -f "${LOKAL_DB}" ]] && command -v lsof >/dev/null 2>&1; then
  if lsof -t -- "${LOKAL_DB}" >/dev/null 2>&1; then
    echo "Diese Datenbank ist gerade in Benutzung: ${LOKAL_DB}" >&2
    echo "Erst das Backend stoppen (npm run dev / npm run server beenden)," >&2
    echo "dann erneut aufrufen — oder --force." >&2
    exit 1
  fi
fi

TMP_DIR="$(mktemp -d)"
KOPIE="${TMP_DIR}/spiegel.db"
trap 'rm -rf "${TMP_DIR}"' EXIT

# --- 1) Konsistente Kopie beschaffen ---------------------------------------
if [[ -n "${VON_DATEI}" ]]; then
  echo "==> Aus vorhandener Datei: ${VON_DATEI}"
  [[ -f "${VON_DATEI}" ]] || { echo "Datei nicht gefunden: ${VON_DATEI}" >&2; exit 1; }
  cp "${VON_DATEI}" "${KOPIE}"
else
  echo "==> Sicherungskopie auf ${REMOTE} erzeugen (${REMOTE_DB})"
  FERN_TMP='/tmp/xjp-spiegel.db'
  # Auf dem Pi: erst sqlite3-CLI, sonst das better-sqlite3 der Installation.
  # `sudo -n` bricht ohne Rueckfrage ab, wenn ein Passwort noetig waere; ohne
  # sudo laeuft es, wenn die Datei ohnehin lesbar ist.
  # shellcheck disable=SC2029  # Die Pfade sollen fern expandiert werden.
  ssh "${REMOTE}" "
    set -e
    rm -f '${FERN_TMP}'
    SUDO=''
    [ -r '${REMOTE_DB}' ] || SUDO='sudo -n'
    if command -v sqlite3 >/dev/null 2>&1; then
      \$SUDO sqlite3 '${REMOTE_DB}' \".backup '${FERN_TMP}'\"
    elif [ -d /opt/xjustiz-profilierer/node_modules/better-sqlite3 ]; then
      \$SUDO node -e \"
        const D = require('/opt/xjustiz-profilierer/node_modules/better-sqlite3');
        const db = new D('${REMOTE_DB}', { readonly: true, fileMustExist: true });
        db.backup('${FERN_TMP}').then(() => db.close());
      \"
    else
      echo 'Weder sqlite3 noch better-sqlite3 auf dem Server gefunden.' >&2
      exit 1
    fi
    \$SUDO chmod a+r '${FERN_TMP}'
  "
  echo "==> Kopie holen"
  scp -q "${REMOTE}:${FERN_TMP}" "${KOPIE}"
  ssh "${REMOTE}" "rm -f '${FERN_TMP}'"
fi

# --- 2) Kopie pruefen, bevor irgendetwas ersetzt wird ----------------------
echo "==> Kopie pruefen"
if ! node -e '
  const D = require(process.argv[2] + "/server/node_modules/better-sqlite3");
  let db;
  try {
    db = new D(process.argv[1], { readonly: true, fileMustExist: true });
    const ok = db.pragma("integrity_check", { simple: true });
    if (ok !== "ok") throw new Error("integrity_check: " + ok);
    const n = (t) => {
      try { return db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n; } catch { return "—"; }
    };
    console.log(
      `    Profilierungen ${n("profiles")} · Versionen ${n("profile_versions")} · ` +
      `Testnachrichten ${n("testmessages")} · Projekte ${n("projekte")} · Hinweise ${n("hinweise")}`,
    );
  } catch (e) {
    console.error("    " + (e && e.message ? e.message : e));
    process.exit(1);
  }
' "${KOPIE}" "${REPO_DIR}"; then
  # Abbruch **vor** dem Sichern und Ersetzen: die lokale DB bleibt, wie sie ist.
  echo "Die geholte Kopie ist unbrauchbar — es wurde nichts ersetzt." >&2
  exit 1
fi

# --- 3) Lokalen Stand sichern ---------------------------------------------
mkdir -p "$(dirname "${LOKAL_DB}")"
if [[ -f "${LOKAL_DB}" ]]; then
  STAND="$(date +%y%m%d-%H%M)"
  SICHERUNG="${LOKAL_DB}.vor-prod-kopie-${STAND}"
  echo "==> Lokalen Stand sichern: $(basename "${SICHERUNG}")"
  cp "${LOKAL_DB}" "${SICHERUNG}"
  # WAL/SHM mitsichern, sonst waere die Sicherung derselbe halbe Stand, den
  # ein blosses scp der Produktiv-DB liefern wuerde.
  [[ -f "${LOKAL_DB}-wal" ]] && cp "${LOKAL_DB}-wal" "${SICHERUNG}-wal"
  [[ -f "${LOKAL_DB}-shm" ]] && cp "${LOKAL_DB}-shm" "${SICHERUNG}-shm"
fi

# --- 4) Einsetzen ----------------------------------------------------------
echo "==> Einsetzen: ${LOKAL_DB}"
cp "${KOPIE}" "${LOKAL_DB}"
# Die alten Journaldateien gehoeren zur ersetzten Datei; blieben sie liegen,
# legte SQLite deren Inhalt ueber den frischen Spiegel.
rm -f "${LOKAL_DB}-wal" "${LOKAL_DB}-shm"

echo
echo "Fertig. Die lokale Datenbank ist jetzt der Produktivstand."
echo "Backend starten: npm run dev   (bzw. npm run server)"
