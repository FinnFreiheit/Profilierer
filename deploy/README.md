# Deployment: Raspberry Pi, https://xjw.freiheits.de/profilierer

Der Profilierer läuft auf demselben Pi wie die XJustiz-Tools (XJW), als
eigener Node-Service (`127.0.0.1:3001`) hinter dem vorhandenen nginx-vhost
`xjw.freiheits.de` — unter dem Unterpfad `/profilierer`, **ohne Login**
(XJWs Cookie-Login gilt für `/profilierer` bewusst nicht).

## Architektur

```
Browser ── https://xjw.freiheits.de ──► nginx (Pi)
   ├── /profilierer/…  ─► 127.0.0.1:3001  Node (SPA + /api + /xrep-api, SQLite)
   └── alles andere    ─► Cookie-Login ─► 127.0.0.1:8888  XJW (Spring Boot)
```

- nginx strippt den Präfix (`proxy_pass …:3001/` mit Slash); der Node-Server
  läuft intern an der Wurzel. Die SPA ist mit `--base-href /profilierer/`
  gebaut, die API-Aufrufe sind relativ (`api/…`).
- Einbindung in die XJW-Site über einen Include-Glob im 443-Block
  (`XJW/deploy/pi/nginx-xjustiz.conf`):
  `include /etc/nginx/snippets/xjp-profilierer*.conf;` — Glob, damit die
  XJW-Config auch ohne installierten Profilierer gültig bleibt.
- TLS kommt vom bestehenden certbot-Zertifikat des vhosts; kein eigenes nötig.

## Erstinstallation / Update

```bash
# Laptop (in diesem Ordner):
./deploy.sh pi@pi.local

# Pi:
ssh pi@pi.local
cd ~/profilierer-staging
sudo bash pi/02-install-app.sh
```

Das Install-Skript ist idempotent: installiert bei Bedarf Node 24
(nodesource) und Build-Werkzeuge, legt den Systemnutzer `xjp` an, kopiert
App nach `/opt/xjustiz-profilierer/`, baut `better-sqlite3` für arm64
(`npm ci --omit=dev`), installiert systemd-Unit und nginx-Snippet.

**Einmalig** muss die Include-Zeile in der XJW-Site stehen — sie liegt in
`XJW/deploy/pi/nginx-xjustiz.conf` und wird über den XJW-eigenen Ablauf
ausgerollt (`XJW/deploy/deploy.sh` + `sudo bash pi/02-install-app.sh`).

## Betrieb

- Status/Logs: `systemctl status xjustiz-profilierer`,
  `journalctl -u xjustiz-profilierer -f`
- Daten: `/var/lib/xjustiz-profilierer/profiles.db` (WAL —
  **Backup = profiles.db + profiles.db-wal + profiles.db-shm**).
  Deploys fassen die DB nie an.
- Ports: 3001 nur auf `127.0.0.1` (`XJP_HOST`), XJW bleibt auf 8888.

## Rollback / Deinstallation

```bash
sudo systemctl disable --now xjustiz-profilierer
sudo rm /etc/nginx/snippets/xjp-profilierer.conf   # Glob-Include toleriert das
sudo nginx -t && sudo systemctl reload nginx
# optional: sudo rm -r /opt/xjustiz-profilierer    (DB unter /var/lib bleibt)
```

XJW ist von alldem unberührt (eigener Service, eigener Port, eigene Site —
nur der Include-Glob steht zusätzlich in dessen 443-Block).
