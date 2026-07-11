# CLAUDE.md — XJustiz Profilierer

Projekt-Handbuch für die Arbeit mit Claude Code im Terminal. Wird bei jeder Session automatisch geladen.

## Was ist das

Der **XJustiz Profilierer** ist ein Werkzeug zur Visualisierung von XJustiz-Nachrichten und zur Erstellung von Profilierungen (Kommunikationsszenarien) — auch für die gemeinsame Arbeit mit Nicht-Technikern. Fachliche Details zur Bedienung stehen im [README](README.md).

Das Tool war ursprünglich eine einzelne HTML-Datei; es wurde zu einem **Angular-20-Projekt** migriert (standalone Components, Signals, OnPush). Die alte Single-File-Version liegt unter `legacy/Profilierer.html` als Referenz.

## Sprache und Stil

- Antworte immer auf **Deutsch**, außer explizit anders gewünscht.
- Keine Emojis in Dateien oder Antworten, außer verlangt.
- Knapp und direkt. Keine Zusammenfassungen am Ende jeder Antwort.
- Fachterminologie des ERV/XJustiz-Umfelds ist erwünscht und muss nicht erklärt werden.
- Datumsangaben im Format `YY.MM.DD`.

## Struktur

```
xjustiz-profilierer/
├── src/app/
│   ├── models/                Interfaces (node, profile, codelist, diff, xsd-index)
│   ├── core/
│   │   ├── services/          StateService (Signals-Store), XsdParserService, TreeService,
│   │   │                      NavService, ValueService, CodelistService, ExportService,
│   │   │                      DiffService, PersistenceService, ProfileStoreService, MigrationService,
│   │   │                      InstanceImportService, BundledSchemaService, DownloadService, ToastService, SearchService
│   │   ├── util/              xml.util, pretty.util
│   │   ├── refs.ts            Referenz-Metadaten (Type.GDS.Ref.*)
│   │   └── profile-defaults.ts
│   ├── features/              Topbar, Toolbar, Crumbs, Search, MessagePicker, Tree (TreeCanvas +
│   │                          rekursive TreeNode), Detail, Dialoge (Status/Meta/Diff), Legend, Print
│   ├── shared/                Toast, FileDropDirective
│   ├── app.ts / app.html      Shell (Komposition + Tastatur-Nav + Drop-Routing)
│   └── styles.scss            globale Styles (aus der Single-File-Version portiert)
├── public/schemas/           Hinterlegte XJustiz-Schemata (3.6.2, 4.0.0) + index.json (Manifest)
├── server/                    Backend (Node/Express + SQLite): Profil-API /api, liefert prod. SPA + /xrep-api
├── proxy.conf.json            Dev-Proxy /xrep-api → xrepository.de, /api → localhost:3001 (Backend)
├── scripts/test-headless.mjs  Headless-Testlauf (setzt CHROME_BIN via puppeteer)
├── scripts/gen-schema-manifest.mjs  Erzeugt public/schemas/index.json aus den Versionsordnern
├── legacy/                    Profilierer.html + xrep-proxy.py (Referenz)
├── README.md, CLAUDE.md
```

Zentrale Idee der Architektur: `StateService` ist ein **Signals-Store** (ersetzt das alte globale `S`/`S.profile`). Die imperativen Render-Funktionen (`renderBox`/`renderDetail`/`redrawLines`) sind deklarative Komponenten; die SVG-Verbindungslinien werden im `TreeCanvas` aus DOM-Messungen berechnet.

## Dokumentation

Ausführliche Entwickler-/Architekturdokumentation liegt unter [`docs/`](docs/README.md) — Einstieg ist die **Map of Content** ([docs/README.md](docs/README.md)). Von dort zu Architektur (inkl. Mermaid-Diagrammen), Service-/Modell-/Komponenten-Referenz, Glossar, Tests, Deployment und den [Architektur-Entscheidungen (ADRs)](docs/adr/README.md). Bei Fragen zum „Warum" zuerst dort nachsehen.

## Starten / Entwickeln

Node ≥ 22.12 nötig (Angular 20). System-Node ist 22.11 — daher vor npm/ng-Befehlen Node 24 aktivieren:

```
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24
```

- **Dev-Server:** `npm start` (`ng serve`, Port 4200) — inkl. Dev-Proxy für XRepository (`/xrep-api/…`) und Profil-API (`/api` → Backend). Backend separat: `npm run server` (Port 3001) oder beides parallel: `npm run dev`. Einmalig `cd server && npm install`.
- **Backend/DB:** Profilierungen liegen in SQLite (`server/`, Node/Express); der Store spricht `/api` per fetch an. Produktiv `npm run start:prod` (Server liefert SPA + `/api` + `/xrep-api` same-origin). Env `XJP_PORT`/`XJP_DB`. Siehe [ADR 0007](docs/adr/0007-datenbank-backend.md).
- **Build:** `npm run build` (Ausgabe nach `dist/`).
- **Unit-Tests (headless):** `npm run test:ci` — nutzt das per puppeteer installierte Chrome-for-Testing (kein System-Chrome nötig). Einmalig: `npx puppeteer browsers install chrome`.
- **E2E-Prüfung:** Puppeteer-Skript, das XSDs per Drag&Drop-Event lädt (`uploadFile` befüllt `webkitdirectory`-Inputs nicht).
- **Hinterlegte Schemata:** 3.6.2 und 4.0.0 liegen unter `public/schemas/<version>/`; die App lädt 3.6.2 automatisch beim Start (`BundledSchemaService`, Umschalter in der Topbar, Diff-Vergleich per Klick) — Ordner-Upload nur noch für Fremdschemata. Nach dem Ändern der XSDs `npm run schemas:manifest` ausführen.
- Testdaten (Quellen der hinterlegten Kopien): `/Users/finnfreiheit/code/XJustiz_3_6_2_XSD` (3.6.2) und `/Users/finnfreiheit/code/XJustiz_4.0.0_Schemata` (4.0.0, Vergleichsversion für den Diff).

## Konventionen

- **Idiomatisches Angular 20:** standalone Components, `input()`/`output()`/`signal()`/`computed()`, `@if`/`@for`, `ChangeDetectionStrategy.OnPush`. Kein NgModule.
- **Deutschsprachige Bezeichner und Kommentare** beibehalten. Zeilenverweise in Kommentaren beziehen sich auf `legacy/Profilierer.html`.
- Store-Mutationen der pfad-indizierten Maps (`elemente`/`auspraegungen`) müssen neue Referenzen erzeugen; kaskadierende Operationen (`removeAusp`) sind im `StateService` gebündelt und unit-getestet.
- **Keine ungefragten Refactors** über den Auftrag hinaus.
- Bei Änderungen an der XRepository-Logik `proxy.conf.json` und den Pfad `/xrep-api/` beachten (`CodelistService`).
- Hinterlegte Schemata in `public/schemas/` nicht von Hand im Manifest pflegen — nach XSD-Änderungen `npm run schemas:manifest` laufen lassen (`scripts/gen-schema-manifest.mjs`).

## Git

Repository mit `git init` angelegt. Commits knapp und auf Deutsch. Kein Remote gesetzt — bei Bedarf hinzufügen.
