# Betriebshandbuch

Stand 26.11.10. Für die Stelle, die den XJustiz Profilierer installiert und betreibt. Vorkenntnisse zum Projekt sind nicht nötig; vorausgesetzt werden Linux, ein Reverse-Proxy und Node.js.

Was im Folgenden als **erprobt** bezeichnet ist, läuft so auf der bisherigen Instanz (Raspberry Pi, Debian arm64, systemd, nginx) oder wurde am 26.11.10 an einem Probestart nachgeprüft. Alles andere ist als **Muster** oder **nicht erprobt** gekennzeichnet.

## 1. Das Wichtigste vorab

- **Ein Prozess, eine Datei.** Die Anwendung ist ein einzelner Node.js-Prozess, der die Weboberfläche, die Programmierschnittstelle und zwei Durchreichen zu externen Diensten ausliefert. Alle Daten liegen in einer SQLite-Datei.
- **Kein Zugriffsschutz in der Anwendung.** Wer die Adresse erreicht, kann sämtliche Inhalte lesen, ändern und löschen. Der Schutz muss davor liegen (Netz, Reverse-Proxy). Einzelheiten in [Abschnitt 7](#7-zugriffsschutz-und-sicherheit).
- **Genau eine Instanz.** Kein Lastverbund, keine zweite Instanz auf derselben Datenbank.
- **Sicherung = die Datenbankdatei.** Eine Automatik dafür bringt das Projekt nicht mit, siehe [Abschnitt 9](#9-sicherung-und-wiederherstellung).
- **Ausgehend braucht der Server zwei Ziele:** `www.xrepository.de` und `xjustiz.justiz.de`, jeweils Port 443.

## 2. Aufbau

```
Browser ── HTTPS ──► Reverse-Proxy (TLS, Zugriffsschutz, Kompression)
                         │
                         ▼
                  Node-Prozess (Vorgabe 127.0.0.1:3001)
                    ├── /            Weboberfläche (statische Dateien)
                    ├── /api         Programmierschnittstelle ──► SQLite-Datei
                    ├── /xrep-api    Durchreiche ──► https://www.xrepository.de/api
                    └── /xjustiz-api Durchreiche ──► https://xjustiz.justiz.de
```

| Teil              | Ort im Repository                 | Technik                                          |
| ----------------- | --------------------------------- | ------------------------------------------------ |
| Weboberfläche     | `src/`, gebaut nach `dist/`       | Angular 20, reine Browser-Anwendung              |
| Server            | `server/`                         | Node.js, Express 4, `better-sqlite3`             |
| Datenbank         | Pfad aus `XJP_DB`                 | SQLite im WAL-Modus                              |
| XJustiz-Schemata  | `public/schemas/` (Teil des Baus) | XSD-Dateien der Versionen 3.6.2 und 4.0.0        |
| Einstieg Server   | `server/index.js`                 | liest die Umgebungsvariablen, startet den Dienst |
| Bisherige Skripte | `deploy/`                         | auf den Raspberry Pi zugeschnitten, siehe 4.3    |

Die Durchreichen gibt es, weil beide Dienste Browser-Abrufe von fremden Seiten nicht zulassen (keine CORS-Freigabe). Die Oberfläche ruft deshalb den eigenen Server, der Server ruft den Dienst.

## 3. Voraussetzungen

### Zielsystem

- **Node.js ≥ 22.12**, empfohlen 24 (die Datei `.nvmrc` nennt 24; die bisherige Instanz läuft damit).
- **Linux mit systemd** ist erprobt (Debian arm64). Andere Linux-Systeme sollten gehen; Windows als Server ist nicht erprobt.
- **`better-sqlite3`** enthält ein natives Modul. Für gängige Plattformen lädt `npm ci` ein fertiges Binärpaket; fehlt es, wird übersetzt, dann braucht das Zielsystem `build-essential` und `python3`. Das Modul muss auf der **Zielarchitektur** installiert werden — `server/node_modules` nicht von einem anderen System herüberkopieren.
- **Arbeitsspeicher:** der Prozess belegt im Leerlauf rund 100 MB (gemessen mit Node 24 und leerer Datenbank).
- **Plattenplatz:** Anwendung rund 11 MB zuzüglich `server/node_modules`; Datenbank siehe [Abschnitt 8](#8-daten).
- **Lokales Dateisystem für die Datenbank.** SQLite im WAL-Modus gehört nicht auf eine Netzfreigabe (NFS, SMB).

### Bau-Rechner

Gebaut wird nicht zwingend auf dem Zielsystem. Nötig sind Node.js ≥ 22.12, npm und Zugriff auf `registry.npmjs.org`. Für die Tests zusätzlich ein einmaliger Download von Chrome for Testing (`npx puppeteer browsers install chrome`).

### Netz

| Richtung               | Ziel                     | Wofür                      | Ohne dieses Ziel                                        |
| ---------------------- | ------------------------ | -------------------------- | ------------------------------------------------------- |
| Server → Internet      | `www.xrepository.de:443` | Codelisten nachschlagen    | Codelisten nur per Datei-Import in der Oberfläche       |
| Server → Internet      | `xjustiz.justiz.de:443`  | neue Schemaversionen holen | es bleiben die mitgelieferten Versionen 3.6.2 und 4.0.0 |
| Browser → Server       | die eigene Adresse       | alles                      | —                                                       |
| Bau-Rechner → Internet | `registry.npmjs.org`     | Abhängigkeiten             | kein Bau möglich                                        |

Ein vorgeschalteter **ausgehender HTTP-Proxy** ist nicht vorgesehen: die Durchreichen werten `HTTP_PROXY`/`HTTPS_PROXY` nicht aus. Muss der Server über einen solchen Proxy ins Internet, ist `server/index.js` anzupassen (nicht erprobt).

Scheitert die Durchreiche zum XRepository, versucht die Oberfläche den Abruf direkt vom Browser aus und bietet danach — nur nach ausdrücklicher Zustimmung der Person am Bildschirm — öffentliche Weiterleitungsdienste an (`codetabs.com`, `corsproxy.io`, `allorigins.win`). Übertragen werden dabei nur Adressen öffentlicher Codelisten. In einem abgeschotteten Netz laufen diese Versuche ins Leere.

## 4. Bauen und installieren

### 4.1 Bauen

```bash
git clone https://github.com/FinnFreiheit/Profilierer.git
cd Profilierer
npm ci
npm ci --prefix server
npm run build
```

Ergebnis: `dist/xjustiz-profilierer/browser/` (statische Dateien, rund 11 MB). Maßgeblich ist der Zweig `main`; er ändert sich nur über Pull Requests mit bestandener Prüfkette. Versionsnummern oder Tags gibt es nicht — ein Stand wird über seinen Commit benannt.

Wer vor dem Ausrollen selbst prüfen will: `npm run check` fährt Lint, Formatprüfung, Tests der Oberfläche, Tests des Servers und den Bau. Dieselbe Kette läuft bei jedem Push in GitHub Actions (`.github/workflows/ci.yml`).

**Betrieb unter einem Unterpfad** (etwa `https://host/profilierer/`): dann mit dem Pfad bauen, sonst findet die Oberfläche ihre Dateien nicht.

```bash
npx ng build --base-href /profilierer/
```

Die Aufrufe der Oberfläche an den Server sind relativ; am Server selbst ist für den Unterpfad nichts einzustellen. Der Reverse-Proxy muss den Pfad entfernen, siehe [Abschnitt 6](#6-reverse-proxy).

### 4.2 Installieren (allgemein)

Der Server sucht die Oberfläche unter `../dist/xjustiz-profilierer/browser`, gesehen von `server/index.js`. Die Verzeichnisstruktur auf dem Zielsystem muss also so aussehen:

```
/opt/xjustiz-profilierer/
├── dist/xjustiz-profilierer/browser/   ← Inhalt des Baus
└── server/                             ← Inhalt von server/, ohne node_modules, data/, *.test.js
/var/lib/xjustiz-profilierer/           ← Datenbank, beschreibbar für den Dienstbenutzer
```

Schritte, wie sie auch das Skript der bisherigen Instanz ausführt:

```bash
# Dienstbenutzer ohne Anmeldung
sudo useradd --system --home-dir /opt/xjustiz-profilierer --shell /usr/sbin/nologin xjp
sudo install -d -o xjp -g xjp -m 0755 /opt/xjustiz-profilierer /var/lib/xjustiz-profilierer
```

```bash
# Dateien übernehmen (vom Bau-Rechner, hier als Muster mit rsync)
rsync -a --delete dist/xjustiz-profilierer/browser/ ziel:/opt/xjustiz-profilierer/dist/xjustiz-profilierer/browser/
rsync -a --delete --exclude node_modules/ --exclude data/ --exclude '*.test.js' server/ ziel:/opt/xjustiz-profilierer/server/
```

```bash
# Abhängigkeiten des Servers auf dem Zielsystem installieren
cd /opt/xjustiz-profilierer/server && sudo -u xjp npm ci --omit=dev --no-audit --no-fund
```

Danach die systemd-Unit einrichten. Vorlage ist `deploy/pi/xjustiz-profilierer.service` (von dort auf das Zielsystem kopieren); sie enthält bereits die Härtung (unprivilegierter Benutzer, `ProtectSystem`, Schreibrecht nur auf `/var/lib/xjustiz-profilierer`) und ist bis auf Pfade unverändert übernehmbar.

```bash
sudo install -o root -g root -m 0644 xjustiz-profilierer.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now xjustiz-profilierer
```

Fehlt die Oberfläche am erwarteten Ort, startet der Server trotzdem und meldet `SPA-Build nicht gefunden unter …` — dann antworten nur `/api` und die Durchreichen.

### 4.3 Die mitgelieferten Skripte

Unter `deploy/` liegt der erprobte Ablauf der bisherigen Instanz:

| Datei                                      | Zweck                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `deploy/deploy.sh <user@host>`             | baut mit `--base-href /profilierer/` und überträgt Bau, Server und Skripte per rsync      |
| `deploy/pi/02-install-app.sh`              | auf dem Zielsystem mit `sudo`: Node, Benutzer, Verzeichnisse, Abhängigkeiten, Unit, nginx |
| `deploy/pi/xjustiz-profilierer.service`    | systemd-Unit                                                                              |
| `deploy/pi/nginx-profilierer-snippet.conf` | nginx-Abschnitt für den Unterpfad                                                         |
| `deploy/db-spiegeln.sh`                    | holt eine Kopie der Datenbank auf einen Entwicklungsrechner (nur lesend)                  |

Das Installationsskript ist wiederholbar und fasst die Datenbank nie an. Für eine andere Umgebung sind anzupassen:

- der Unterpfad `/profilierer/` in `deploy.sh` und im nginx-Abschnitt,
- die Adresse `xjw.freiheits.de` in den Ausgaben und Kommentaren,
- die nginx-Einbindung: das Skript legt nur einen Abschnitt unter `/etc/nginx/snippets/` ab und erwartet, dass eine bestehende Site ihn einbindet (bisher die Site eines Nachbarprojekts),
- die Node-Installation über `deb.nodesource.com`, falls das Zielsystem Node anders bezieht.

Einen **Container** (Dockerfile, Compose) gibt es nicht. Wer einen baut, braucht: Node ≥ 22.12, die Verzeichnisstruktur aus 4.2, `npm ci --omit=dev` in `server/` innerhalb des Abbilds (natives Modul), die Datenbank auf einem dauerhaften Datenträger und die Zeitzone aus Abschnitt 5.

## 5. Konfiguration

Ausschließlich über Umgebungsvariablen; eine Konfigurationsdatei gibt es nicht.

| Variable     | Vorgabe                    | Bedeutung                                                                                                   |
| ------------ | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `XJP_PORT`   | `3001`                     | Port des Dienstes                                                                                           |
| `XJP_HOST`   | leer = alle Schnittstellen | Bindeadresse. Hinter einem Reverse-Proxy auf `127.0.0.1` setzen, sonst ist der Dienst direkt erreichbar.    |
| `XJP_DB`     | `server/data/profiles.db`  | Pfad der SQLite-Datei. Das Verzeichnis wird angelegt, die Datei beim ersten Start erzeugt.                  |
| `XJP_AG_KEY` | leer                       | gemeinsamer Schlüssel der Abnahme-Rolle, siehe [Abschnitt 12](#12-abnahme-rolle-und-ihr-schlüssel). Geheim. |
| `TZ`         | Systemzeitzone             | bestimmt die Tagesgrenzen der Nutzungszahlen; erwartet wird `Europe/Berlin`.                                |

Die Unit setzt Port, Bindeadresse und Datenbankpfad fest. Der Schlüssel gehört nicht in die Unit und nicht ins Repository, sondern in eine eigene Datei, die die Unit optional einliest:

```bash
sudo install -o root -g root -m 0600 /dev/null /etc/default/xjustiz-profilierer
```

Inhalt der Datei (systemd-Format, ohne `export`):

```
XJP_AG_KEY=<langer Zufallswert>
```

Die Datei `.env.local` im Repository-Wurzelverzeichnis gilt nur für den Start auf einem Entwicklungsrechner (`npm run server`) und hat für den Betrieb keine Bedeutung.

## 6. Reverse-Proxy

Der Node-Prozess spricht nur HTTP. TLS, Zugriffsschutz und Kompression gehören in den Reverse-Proxy.

**An der Wurzel einer eigenen Adresse** (Muster, abgeleitet vom erprobten Unterpfad-Abschnitt):

```nginx
server {
    listen 443 ssl;
    server_name profilierer.example.org;
    # ssl_certificate … / ssl_certificate_key …

    client_max_body_size 30m;

    gzip on;
    gzip_proxied any;
    gzip_types text/css application/javascript application/json application/xml text/xml application/wasm;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 30s;
        proxy_read_timeout    120s;
    }
}
```

**Unter einem Unterpfad** (erprobt, `deploy/pi/nginx-profilierer-snippet.conf`): der Schrägstrich am Ende von `proxy_pass` entfernt den Pfad, beim Node-Prozess kommt `/profilierer/api/…` als `/api/…` an.

```nginx
location = /profilierer { return 301 /profilierer/; }
location /profilierer/ {
    proxy_pass http://127.0.0.1:3001/;
    # übrige Zeilen wie oben
}
```

Zu beachten:

- **Größe der Anfragen:** die Schnittstelle nimmt JSON bis 25 MB an, eine einzelne Anlage bis 20 MB. Der Proxy muss mindestens das durchlassen (`client_max_body_size 30m`).
- **Zeitgrenzen:** Abrufe über die Durchreichen können dauern; 120 Sekunden Lesezeit haben sich bewährt.
- **Kompression:** der Node-Prozess komprimiert nicht. Die Oberfläche lädt beim ersten Aufruf rund 1 MB JavaScript; ohne Kompression am Proxy geht das unkomprimiert über die Leitung. Der mitgelieferte nginx-Abschnitt schaltet sie nicht ein.
- **Zwischenspeicherung:** der Node-Prozess liefert alle Dateien mit `Cache-Control: public, max-age=0` und ETag. Die JavaScript- und CSS-Dateien tragen einen Inhalts-Hash im Namen und dürfen am Proxy lange zwischengespeichert werden; `index.html` nicht.
- **Sicherheits-Header** (HSTS, `X-Content-Type-Options` und Ähnliches) setzt die Anwendung nicht; der Prozess sendet zudem `X-Powered-By: Express`. Beides ist am Proxy zu regeln. Eine Content-Security-Policy ist nicht erprobt. Zu erwarten ist, dass sie WebAssembly zulassen muss (die XML-Prüfung im Browser läuft darüber) sowie eingebettete Styles.
- **Unbekannte Pfade** beantwortet der Server mit `index.html` und Status 200. Für eine Überwachung taugt deshalb nur ein Pfad unter `/api`, siehe [Abschnitt 11](#11-überwachung-und-protokolle).

## 7. Zugriffsschutz und Sicherheit

Die Anwendung kennt **keine Anmeldung und keine Benutzer**. Wer die Adresse erreicht, kann ohne weitere Hürde:

- alle Profilierungen, Testnachrichten, Anlagen, Projekte und Hinweise lesen,
- sie ändern und löschen,
- Dateien hochladen (je Testsendung bis 100 MB),
- gespeicherte Schemaversionen ersetzen oder löschen,
- über die Durchreichen beliebige Pfade bei `www.xrepository.de` und `xjustiz.justiz.de` abrufen.

Geschützt sind nur zwei Dinge, und nur wenn `XJP_AG_KEY` gesetzt ist: Änderungen an **abgenommenen** Profilierungen und Testnachrichten sowie die Ansicht **Kennzahlen**.

Die bisherige Instanz ist bewusst ohne Schutz öffentlich erreichbar. Ob das so bleiben soll, ist vor der Inbetriebnahme zu entscheiden. Möglich sind ein internes Netz oder VPN, oder eine Anmeldung am Reverse-Proxy (Basic Auth, SSO-Vorschaltung). Eine Anmeldung am Proxy ist mit dieser Anwendung nicht erprobt.

Weitere Punkte:

- **HTTPS ist Pflicht, sobald der Schlüssel gesetzt ist.** Die Oberfläche legt den eingegebenen Schlüssel im Browser ab (`localStorage`, Eintrag `xjp.agKey`) und schickt ihn bei jeder Anfrage im Kopffeld `x-ag-key` mit.
- **Kein Schutz gegen Durchprobieren.** `POST /api/login` prüft den Schlüssel ohne Verzögerung oder Sperre. Deshalb einen langen Zufallswert wählen (`openssl rand -base64 32`) und am Proxy eine Ratenbegrenzung setzen.
- **Ratenbegrenzung** gibt es in der Anwendung an keiner Stelle, auch nicht für Uploads und Durchreichen.
- **Bindeadresse:** `XJP_HOST=127.0.0.1` setzen, damit der Prozess nicht am Proxy vorbei erreichbar ist.
- **Abhängigkeiten** werden nicht automatisch aktualisiert. Stand prüfen mit `npm audit --omit=dev` im Wurzelverzeichnis und in `server/`.

## 8. Daten

### Datenbank

Eine SQLite-Datei am Pfad `XJP_DB`, im WAL-Modus. Im Betrieb liegen daneben zeitweise `profiles.db-wal` und `profiles.db-shm`; nach einem sauberen Beenden bleibt nur die Hauptdatei.

| Tabellen                                                          | Inhalt                                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| `profiles`, `profile_versions`                                    | Profilierungen und ihre eingefrorenen Fassungen                       |
| `hinweise`                                                        | Rückmeldungen an einzelnen Elementen einer Profilierung               |
| `testmessages`, `testmessage_anlagen`, `testmessage_einbindungen` | Testnachrichten (XML), hochgeladene Anlagen (als BLOB), Verknüpfungen |
| `projekte`                                                        | Projekte als Klammer über Profilierungen                              |
| `schemas`, `schema_files`                                         | von xjustiz.de geholte Schemaversionen                                |
| `nutzung_*` (vier Tabellen)                                       | anonyme Nutzungszahlen, siehe [Abschnitt 13](#13-datenschutz)         |

**Wachstum.** Eine Kopie der bisherigen Instanz vom 26.08.22 war 2,5 MB groß. Treiber sind: Anlagen (bis 20 MB je Datei, 100 MB je Testsendung, dazu eine eingefrorene Kopie bei der Abnahme), gespeicherte Schemaversionen (rund 3 MB je Version) und von Hand angelegte Fassungen (ohne Obergrenze; automatische sind auf zehn je Profilierung begrenzt). Aufgeräumt oder verkleinert wird nichts von selbst.

**Schemaänderungen** führt der Server beim Start selbst aus: fehlende Tabellen und Spalten werden ergänzt, eine einmalige Datenumstellung ist über `PRAGMA user_version` gesteuert. Einen Rückweg gibt es nicht. Ein älterer Programmstand auf einer bereits umgestellten Datenbank ist nicht erprobt — vor jedem Update sichern.

**Mehrere Personen gleichzeitig.** Es gibt kein Sperrkonzept: speichern zwei Personen dieselbe Profilierung, gilt der zuletzt gespeicherte Stand. Hinweise liegen deshalb in einer eigenen Tabelle und gehen dabei nicht verloren.

### Daten im Browser

Einiges liegt nur im Browser der jeweiligen Person (`localStorage`, alle Einträge beginnen mit `xjp.`):

| Eintrag                                    | Inhalt                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `xjp.ui.*`                                 | Anzeige-Einstellungen                                                  |
| `xjp.autor`, `xjp.hinweisAutor`            | zuletzt verwendeter Name                                               |
| `xjp.agKey`                                | eingegebener Schlüssel der Abnahme-Rolle                               |
| `xjp.klientId`                             | Zufallskennung für die Nutzungszahlen                                  |
| `xjp.clcache`, `xjp.corsproxy`             | Zwischenspeicher der Codelisten, Zustimmung zu Weiterleitungsdiensten  |
| `xjp.notfall.*`, `xjp.notfall-nachricht.*` | Notfallkopien von Arbeitsständen, die der Server nicht annehmen konnte |

Diese Einträge hängen an der **Adresse** (Protokoll, Rechnername, Port). Zieht die Anwendung auf eine andere Adresse um, beginnen alle mit leeren Einstellungen; noch nicht übertragene Notfallkopien bleiben unter der alten Adresse zurück.

## 9. Sicherung und Wiederherstellung

Eine Sicherungsautomatik bringt das Projekt nicht mit. Einzurichten ist sie vom Betreiber.

**Sichern im laufenden Betrieb** (erprobt): `sqlite3 .backup` schreibt eine in sich geschlossene Kopie, während der Dienst weiterläuft. Das Kommandozeilenwerkzeug `sqlite3` ist dafür auf dem Zielsystem zu installieren (Debian: Paket `sqlite3`); die Anwendung selbst braucht es nicht.

```bash
sudo sqlite3 /var/lib/xjustiz-profilierer/profiles.db ".backup '/var/backups/xjp/profiles-$(date +%y%m%d-%H%M).db'"
```

Ein bloßes Kopieren der Hauptdatei im Betrieb reicht **nicht**: im WAL-Modus stehen die jüngsten Änderungen noch in `profiles.db-wal`. Wer ohne `sqlite3` sichert, stoppt den Dienst und kopiert dann `profiles.db` samt vorhandener `-wal`- und `-shm`-Datei.

Muster für eine tägliche Sicherung per cron (`/etc/cron.d/xjp-sicherung`); Aufbewahrung und Auslagerung auf ein zweites System sind zu ergänzen:

```
15 2 * * * root sqlite3 /var/lib/xjustiz-profilierer/profiles.db ".backup '/var/backups/xjp/profiles-$(date +\%y\%m\%d).db'"
```

**Sicherung prüfen:**

```bash
sqlite3 /var/backups/xjp/profiles-261110.db "PRAGMA integrity_check; SELECT count(*) FROM profiles;"
```

**Wiederherstellen:**

```bash
sudo systemctl stop xjustiz-profilierer
```

```bash
sudo rm -f /var/lib/xjustiz-profilierer/profiles.db-wal /var/lib/xjustiz-profilierer/profiles.db-shm
```

```bash
sudo install -o xjp -g xjp -m 0644 /var/backups/xjp/profiles-261110.db /var/lib/xjustiz-profilierer/profiles.db
```

```bash
sudo systemctl start xjustiz-profilierer
```

Das Entfernen der alten `-wal`- und `-shm`-Datei ist nötig: SQLite würde deren Inhalt sonst über die eingespielte Datei legen. Eine Wiederherstellung dreht auch die Nutzungszahlen auf den Stand der Sicherung zurück.

**Umzug von der bisherigen Instanz:** dort wie oben sichern, die Datei auf das neue System legen und als `XJP_DB` eintragen. Der neue Server stellt das Schema beim ersten Start selbst nach.

## 10. Update und Rollback

1. Auf dem Bau-Rechner den gewünschten Stand holen und bauen (4.1).
2. Datenbank sichern (9).
3. Dienst stoppen, Bau und `server/` ersetzen (4.2), in `server/` erneut `npm ci --omit=dev`.
4. Dienst starten, Kurzprüfung (11).

Mit den mitgelieferten Skripten sind das zwei Befehle: `./deploy/deploy.sh <user@host>` auf dem Bau-Rechner und `sudo bash pi/02-install-app.sh` auf dem Zielsystem. Der Dienst steht so lange, wie das Übernehmen der Dateien und `npm ci` auf dem Zielsystem brauchen.

**Rollback:** den vorherigen Commit bauen und genauso ausrollen. Hat der neue Stand das Datenbankschema erweitert und macht der alte Stand damit Schwierigkeiten, die Sicherung aus Schritt 2 einspielen — Änderungen seit dem Update gehen dann verloren.

Angemeldete Sitzungen gibt es nicht; ein Neustart wirft niemanden heraus. Offene Browserfenster arbeiten nach dem Update mit der alten Oberfläche weiter, bis sie neu geladen werden; Teile, die die alte Oberfläche erst später nachlädt, findet sie dann unter Umständen nicht mehr. Neu laden behebt das.

## 11. Überwachung und Protokolle

### Kurzprüfung nach Start oder Update

Alle vier Aufrufe wurden am 26.11.10 so nachgeprüft.

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/schemas
```

Erwartet `200`: Server läuft, Datenbank ist lesbar.

```bash
curl -s -X POST -H 'content-type: application/json' -d '{"key":""}' http://127.0.0.1:3001/api/login
```

Erwartet `{"konfiguriert":true,"ok":false}`. Steht dort `"konfiguriert":false`, ist `XJP_AG_KEY` beim Prozess nicht angekommen.

```bash
curl -s -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:3001/xrep-api/codeliste/urn%3Axoev-de%3Axjustiz%3Acodeliste%3Agds.rollenbezeichnung/gueltigeVersion"
```

Erwartet `200`: der Weg zum XRepository steht.

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/xjustiz-api/XJustiz-Versionen/index.php
```

Erwartet `200`: der Weg zu xjustiz.de steht.

Zuletzt die Adresse im Browser öffnen: die Übersicht „Profile" erscheint, und „+ Neues Profil" bietet im ersten Schritt eine XJustiz-Version zur Auswahl an.

### Laufende Überwachung

Einen eigenen Zustands-Endpunkt gibt es nicht. Geeignet ist `GET /api/schemas` (kleine Antwort, liest die Datenbank). Die Startseite eignet sich nicht, weil der Server jeden unbekannten Pfad mit 200 beantwortet. Aufrufe der Überwachung zählen in den Nutzungszahlen mit, als Zugriffe ohne Kennung.

### Protokolle

Der Prozess schreibt nur auf die Standardausgabe; unter systemd landet das im Journal.

```bash
journalctl -u xjustiz-profilierer -f
```

| Zeile                                           | Bedeutung                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `[xjp] Server auf http://…:3001  (DB: …)`       | Start; nennt Bindeadresse, Port und verwendete Datenbank                     |
| `[xjp] 403 PUT /api/profiles/…`                 | jede Antwort mit Status ab 400, eine Zeile                                   |
| `[xjp] FEHLER <Methode> <Pfad>:` mit Stacktrace | unerwarteter Fehler, Antwort war 500                                         |
| `[xjp] SPA-Build nicht gefunden unter …`        | die Oberfläche liegt nicht am erwarteten Ort                                 |
| `DeprecationWarning: The util._extend API …`    | einmalig beim ersten Durchreichen; kommt aus einer Abhängigkeit, unschädlich |

Erfolgreiche Zugriffe werden nicht protokolliert. Wer ein Zugriffsprotokoll braucht, führt es am Reverse-Proxy.

### Beenden

Auf `SIGTERM` und `SIGINT` schreibt der Prozess die gepufferten Nutzungszahlen weg, schließt die Datenbank und endet. Ein `SIGKILL` verliert höchstens fünf Sekunden Nutzungszählung; fachliche Daten sind nicht betroffen, sie werden bei jeder Anfrage sofort geschrieben.

## 12. Abnahme-Rolle und ihr Schlüssel

Fachlich gibt es zwei Rollen: die abnehmende Arbeitsgruppe und alle anderen. Die Arbeitsgruppe weist sich über einen gemeinsamen Schlüssel aus, den sie in der Oberfläche eingibt („AG-Anmeldung…" in der Kopfzeile). Hintergrund: [ADR 0012](adr/0012-abnahme-rollenkonzept.md).

- **Ohne Schlüssel** gibt es die Rolle nicht: keine Abnahmen, keine Kennzahlen.
- **Schlüssel setzen oder wechseln:** Datei `/etc/default/xjustiz-profilierer` ändern, Dienst neu starten. Wer angemeldet war, muss den neuen Schlüssel einmal eingeben.
- **Schlüssel entfernen, obwohl es abgenommene Objekte gibt:** diese Objekte lassen sich dann von niemandem mehr ändern, bis wieder ein Schlüssel gesetzt ist.
- **Weitergabe:** der Schlüssel ist der einzige Schutz der Abnahmen. Er gehört nicht ins Repository, nicht in ein Ticket und nicht in eine unverschlüsselte Mail. Ob die neue Instanz den bisherigen Schlüssel übernimmt oder einen neuen bekommt, ist bei der Übergabe zu klären.

## 13. Datenschutz

Was die Anwendung speichert:

- **Namen als Freitext:** der Autor an Profilierungen, Testnachrichten und Hinweisen. Konten, Mailadressen oder Kennwörter gibt es nicht.
- **Nutzungszahlen:** je Browser eine Zufallskennung, die im Kopffeld `x-klient` mitgeschickt wird. Gespeichert werden Stunden- und Tagessummen je Schnittstellen-Pfad; die Kennungen selbst bleiben höchstens 30 Tage und werden dann zur bloßen Anzahl verdichtet. Keine IP-Adressen, keine Inhalte. Einsehbar nur mit dem Schlüssel der Abnahme-Rolle. Hintergrund: [ADR 0021](adr/0021-nutzungszahlen-als-aggregat.md).
- **IP-Adressen** verarbeitet nur der Reverse-Proxy, soweit er protokolliert.

Die Anwendung enthält weder Impressum noch Datenschutzerklärung.

Zu regeln ist der **Inhalt der Testnachrichten und Anlagen**. Das Werkzeug ist für erfundene Testdaten gedacht, prüft das aber nicht: XJustiz-Nachrichten aus echten Verfahren enthalten personenbezogene Daten und ließen sich genauso hochladen. Solange die Instanz ohne Zugriffsschutz erreichbar ist, wären sie für jeden lesbar. Das ist organisatorisch auszuschließen oder über den Zugriffsschutz aus Abschnitt 7 abzufangen.

## 14. Schemata aktualisieren

Die Versionen 3.6.2 und 4.0.0 sind Teil des Baus. Neue Versionen und Nachlieferungen kommen auf zwei Wegen hinzu:

- **In der Oberfläche:** „Grundlage… → Von xjustiz.de aktualisieren". Die geholten Dateien liegen danach in der Datenbank (rund 3 MB je Version) und stehen allen zur Verfügung. Dafür muss der Server `xjustiz.justiz.de` erreichen. Einen Schlüssel braucht es nicht.
- **Im Repository:** `npm run schemas:fetch` holt die veröffentlichten Pakete nach `public/schemas/` und baut das Verzeichnis `index.json` neu. Wirksam nach Commit, Bau und Ausrollen.

Das ist eine fachliche Aufgabe und liegt in der Regel nicht beim Betrieb. Wissen muss der Betrieb nur, dass die Datenbank dadurch wächst.

## 15. Störungen

| Erscheinung                                                    | Wahrscheinliche Ursache                                       | Abhilfe                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Dienst startet nicht, Fehler zu `better_sqlite3.node`          | natives Modul für andere Architektur oder Node-Version gebaut | in `server/` `node_modules` löschen, `npm ci --omit=dev` auf dem Zielsystem  |
| Dienst startet nicht, `SQLITE_CANTOPEN` oder `EACCES`          | Dienstbenutzer darf das Datenverzeichnis nicht beschreiben    | Besitzer und `ReadWritePaths` der Unit prüfen                                |
| Dienst startet nicht, `EADDRINUSE`                             | Port belegt                                                   | `XJP_PORT` ändern oder den anderen Prozess beenden                           |
| Weiße Seite, im Browser 404 für `.js`-Dateien                  | Unterpfad, aber ohne `--base-href` gebaut (oder umgekehrt)    | passend neu bauen                                                            |
| Oberfläche lädt, zeigt aber keine Einträge                     | `/api` kommt nicht beim Node-Prozess an                       | Proxy-Regel prüfen; beim Unterpfad den Schrägstrich am Ende von `proxy_pass` |
| Speichern großer Profilierungen oder Anlagen scheitert mit 413 | Grenze am Proxy kleiner als die der Anwendung                 | `client_max_body_size 30m`                                                   |
| Codelisten lassen sich nicht nachladen                         | Server erreicht `www.xrepository.de` nicht                    | ausgehende Verbindung freigeben; ersatzweise Datei-Import in der Oberfläche  |
| „Von xjustiz.de aktualisieren" scheitert                       | Server erreicht `xjustiz.justiz.de` nicht                     | ausgehende Verbindung freigeben                                              |
| „AG-Anmeldung…" meldet, die Rolle sei nicht eingerichtet       | `XJP_AG_KEY` kommt beim Prozess nicht an                      | Datei, Rechte und `EnvironmentFile` der Unit prüfen, Dienst neu starten      |
| Kennzahlen zeigen Tage versetzt                                | Prozess läuft in anderer Zeitzone                             | `TZ=Europe/Berlin` in der Unit setzen                                        |
| Nach Wiederherstellung fehlen oder erscheinen Daten unerwartet | alte `-wal`-Datei lag noch neben der eingespielten Datenbank  | Ablauf aus Abschnitt 9 einhalten                                             |

## 16. Was es nicht gibt

Damit niemand danach sucht:

- keine Anmeldung, keine Benutzerverwaltung, keine Berechtigungen außer der Abnahme-Rolle,
- kein Container-Abbild, keine Orchestrierung,
- kein Zustands-Endpunkt, keine Metriken-Schnittstelle,
- keine Sicherungsautomatik, kein Aufräumen alter Daten,
- keine Versionsnummer und keine Anzeige des Programmstands in der Oberfläche,
- kein automatisches Ausrollen aus GitHub; die CI prüft nur,
- keine Lizenzdatei im Repository (der Bau erzeugt `dist/xjustiz-profilierer/3rdpartylicenses.txt` mit den Lizenzen der Abhängigkeiten).

## 17. Übergabe-Checkliste

Was der Betreiber vom bisherigen Verantwortlichen braucht oder mit ihm klären muss:

- [ ] Zugang zum Repository `github.com/FinnFreiheit/Profilierer` (öffentlich lesbar) und die Angabe, welcher Commit auszurollen ist
- [ ] Zieladresse, und ob an der Wurzel oder unter einem Unterpfad
- [ ] Entscheidung zum Zugriffsschutz (Abschnitt 7)
- [ ] Schlüssel der Abnahme-Rolle: übernehmen oder neu vergeben, Weitergabe auf sicherem Weg
- [ ] aktuelle Sicherung der Datenbank der bisherigen Instanz, falls die Daten umziehen
- [ ] Zeitpunkt der Umstellung und Umgang mit der alten Adresse (Abschalten, Weiterleitung); Hinweis an die Nutzenden, dass Einstellungen und Notfallkopien im Browser nicht mitziehen
- [ ] Sicherungskonzept: Häufigkeit, Aufbewahrung, Auslagerung
- [ ] Regelung zum Inhalt von Testnachrichten (Abschnitt 13), Impressum und Datenschutzerklärung der neuen Instanz
- [ ] Nutzungsrechte am Quelltext (es liegt keine Lizenzdatei bei)
- [ ] Ansprechperson für fachliche Fragen und für Fehler in der Anwendung; Meldeweg sind bisher die GitHub Issues des Repositorys

## 18. Weiterführend im Repository

| Datei                                     | Inhalt                                             |
| ----------------------------------------- | -------------------------------------------------- |
| [`deploy/README.md`](../deploy/README.md) | Ablauf der bisherigen Instanz auf dem Raspberry Pi |
| [`server/README.md`](../server/README.md) | Schnittstellen des Servers im Einzelnen            |
| [`docs/deployment.md`](deployment.md)     | Bau und Betrieb aus Sicht der Entwicklung          |
| [`docs/data-model.md`](data-model.md)     | Datenmodell                                        |
| [`docs/adr/`](adr/README.md)              | Begründungen der Architektur-Entscheidungen        |
| [`README.md`](../README.md)               | fachliche Bedienung                                |

Nicht betriebsrelevant sind `scripts/afk-*.sh`, `.claude/`, `design/`, `design-system/` und `legacy/` — Werkzeuge und Belege der Entwicklung.
