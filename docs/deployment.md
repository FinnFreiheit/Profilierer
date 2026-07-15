# Betrieb / Deployment

Wie die App gebaut und betrieben wird. Seit [ADR 0007](adr/0007-datenbank-backend.md) gibt es ein Backend (`server/`), das im Produktivbetrieb zugleich SPA, API und XRepository-Proxy same-origin ausliefert.

## Build

```
. "$HOME/.nvm/nvm.sh"; nvm use 24
npm ci        # oder: npm install
npm run build # → dist/xjustiz-profilierer/
```

Ergebnis ist eine statische Single-Page-App (Angular `@angular/build:application`).

**Bundle:** Initial ~230–280 kB; SheetJS (Excel) und JSZip (Codelisten-ZIP) sind **Lazy-Chunks** und werden erst beim jeweiligen Export/Import geladen ([ADR 0006](adr/0006-lazy-xlsx-jszip.md)).

## Backend + Produktivbetrieb

Das Backend (`server/`, Node/Express + SQLite) liefert dieselbe Origin: die gebaute SPA (`dist/xjustiz-profilierer/browser`), die Profil-API unter `/api` und den XRepository-Proxy unter `/xrep-api`. Damit ist der früher offene Produktions-Proxy-Punkt aus [ADR 0004](adr/0004-dev-proxy-xrepository.md) gelöst.

```
cd server && npm install       # einmalig (better-sqlite3, express, http-proxy-middleware)
cd .. && npm run start:prod     # baut die SPA und startet den Server
# oder getrennt: npm run build  &&  npm run server
```

- **Env:** `XJP_PORT` (Default 3001), `XJP_HOST` (Bind-Adresse, Default alle Interfaces — hinter Reverse-Proxy `127.0.0.1` setzen), `XJP_DB` (Default `server/data/profiles.db`, WAL-Modus).
- **Entwicklung:** `npm run dev` startet `ng serve` (Port 4200) und das Backend (3001) parallel; `proxy.conf.json` reicht `/api` und `/xrep-api` an ihre Ziele weiter.
- **Absicherung:** Einzelnutzer ohne Auth — vor die App gehört ein Reverse-Proxy/internes Netz (TLS, Zugriffsschutz). Alternativ bleiben für Codelisten der CORS-Fallback in `CodelistService.xrepFetch` (mit Nutzer-Zustimmung) und der Datei-Import („Codelisten: Datei…") ohne Netzabruf.

Die frühere Python-Variante liegt als Referenz unter `legacy/xrep-proxy.py`.

## Raspberry Pi (xjw.freiheits.de/profilierer)

Produktiv läuft der Profilierer auf dem Raspberry Pi neben den XJustiz-Tools (XJW): eigener systemd-Service (`xjustiz-profilierer`, Node auf `127.0.0.1:3001`), eingebunden als Unterpfad `/profilierer` in den bestehenden nginx-vhost `xjw.freiheits.de` (Snippet-Include; TLS vom vorhandenen certbot-Zertifikat). Die SPA wird dafür mit `--base-href /profilierer/` gebaut; nginx strippt den Präfix, der Server läuft intern an der Wurzel. Die API-Aufrufe der Stores sind deshalb **relativ** (`api/…` statt `/api/…`).

Ablauf, Skripte und Rollback: [`deploy/README.md`](../deploy/README.md) (`deploy/deploy.sh` → rsync auf den Pi → `sudo bash pi/02-install-app.sh`). Die DB liegt auf dem Pi unter `/var/lib/xjustiz-profilierer/profiles.db`; Deploys fassen sie nie an. **Achtung:** bewusst ohne Zugriffsschutz — die Profil-API ist öffentlich les- und schreibbar.

## Datenhaltung

Profilierungen liegen in der SQLite-DB des Backends (`XJP_DB`) — **Backup = diese Datei** (bei WAL zusätzlich `*-wal`/`*-shm`) sichern. Der Codelisten-Cache und einige UI-Flags bleiben clientseitig im `localStorage` (`xjp.clcache`, `xjp.corsproxy`, Migrations-Marker `xjp.migrated`). Profile lassen sich weiterhin als JSON exportieren/importieren. Datenmodell und Migration: [data-model.md](data-model.md).
