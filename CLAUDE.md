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
│   │   │                      DiffService, PersistenceService, DownloadService, ToastService,
│   │   │                      SearchService
│   │   ├── util/              xml.util, pretty.util
│   │   ├── refs.ts            Referenz-Metadaten (Type.GDS.Ref.*)
│   │   └── profile-defaults.ts
│   ├── features/              Topbar, Toolbar, Crumbs, Search, MessagePicker, Tree (TreeCanvas +
│   │                          rekursive TreeNode), Detail, Dialoge (Status/Meta/Diff), Legend, Print
│   ├── shared/                Toast, FileDropDirective
│   ├── app.ts / app.html      Shell (Komposition + Tastatur-Nav + Drop-Routing)
│   └── styles.scss            globale Styles (aus der Single-File-Version portiert)
├── proxy.conf.json            Dev-Proxy /xrep-api → xrepository.de (ersetzt legacy/xrep-proxy.py)
├── scripts/test-headless.mjs  Headless-Testlauf (setzt CHROME_BIN via puppeteer)
├── legacy/                    Profilierer.html + xrep-proxy.py (Referenz)
├── README.md, CLAUDE.md
```

Zentrale Idee der Architektur: `StateService` ist ein **Signals-Store** (ersetzt das alte globale `S`/`S.profile`). Die imperativen Render-Funktionen (`renderBox`/`renderDetail`/`redrawLines`) sind deklarative Komponenten; die SVG-Verbindungslinien werden im `TreeCanvas` aus DOM-Messungen berechnet.

## Starten / Entwickeln

Node ≥ 22.12 nötig (Angular 20). System-Node ist 22.11 — daher vor npm/ng-Befehlen Node 24 aktivieren:

```
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24
```

- **Dev-Server:** `npm start` (`ng serve`, Port 4200) — inkl. Dev-Proxy für XRepository (`/xrep-api/…`).
- **Build:** `npm run build` (Ausgabe nach `dist/`).
- **Unit-Tests (headless):** `npm run test:ci` — nutzt das per puppeteer installierte Chrome-for-Testing (kein System-Chrome nötig). Einmalig: `npx puppeteer browsers install chrome`.
- **E2E-Prüfung:** Puppeteer-Skript, das XSDs per Drag&Drop-Event lädt (`uploadFile` befüllt `webkitdirectory`-Inputs nicht).
- Testdaten: `/Users/finnfreiheit/code/XJustiz_3_6_2_XSD` (3.6.2) und `/Users/finnfreiheit/code/XJustiz_4.0.0_Schemata` (Vergleichsversion für den Diff).

## Konventionen

- **Idiomatisches Angular 20:** standalone Components, `input()`/`output()`/`signal()`/`computed()`, `@if`/`@for`, `ChangeDetectionStrategy.OnPush`. Kein NgModule.
- **Deutschsprachige Bezeichner und Kommentare** beibehalten. Zeilenverweise in Kommentaren beziehen sich auf `legacy/Profilierer.html`.
- Store-Mutationen der pfad-indizierten Maps (`elemente`/`auspraegungen`) müssen neue Referenzen erzeugen; kaskadierende Operationen (`removeAusp`) sind im `StateService` gebündelt und unit-getestet.
- **Keine ungefragten Refactors** über den Auftrag hinaus.
- Bei Änderungen an der XRepository-Logik `proxy.conf.json` und den Pfad `/xrep-api/` beachten (`CodelistService`).

## Git

Repository mit `git init` angelegt. Commits knapp und auf Deutsch. Kein Remote gesetzt — bei Bedarf hinzufügen.
