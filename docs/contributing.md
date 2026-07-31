# Beitragen

Konventionen für die Weiterentwicklung. Ergänzt [CLAUDE.md](../CLAUDE.md) (Session-Handbuch).

## Setup

```
nvm use                             # liest .nvmrc (24); Angular 20 braucht Node ≥ 22.12
npm install
npm start                           # ng serve (inkl. XRepository-Dev-Proxy)
npm run test:ci                     # headless Unit-Tests
npm run build                       # Produktions-Build
npm run schemas:manifest            # public/schemas/index.json neu erzeugen
npm run schemas:fetch               # hinterlegte Schemata aus xjustiz.de aktualisieren (-- --dry: nur Abgleich)
npm run check                       # volle Pruefkette (das faehrt auch CI)
```

## Prüfkette

`npm run check` fährt in dieser Reihenfolge: Lint, Formatprüfung, Frontend-Tests headless, Backend-Tests, Build. Dieselbe Kette läuft in GitHub Actions (`.github/workflows/ci.yml`) bei Push auf `main` und bei jedem Pull Request. Vor dem Push einmal lokal durchlaufen lassen — dann ist CI keine Überraschung.

| Befehl                 | Zweck                                                         |
| ---------------------- | ------------------------------------------------------------- |
| `npm run lint`         | ESLint 9 Flat Config (`eslint.config.mjs`, angular-eslint 20) |
| `npm run lint:fix`     | dasselbe mit `--fix`                                          |
| `npm run format`       | Prettier über den Bestand schreiben                           |
| `npm run format:check` | nur prüfen, nichts schreiben                                  |

**Formatierung macht ausschließlich Prettier**, nicht ESLint — `eslint-config-prettier` schaltet die kollidierenden Stilregeln ab. Die Prettier-Konfiguration (`printWidth: 100`, `singleQuote`) steht in der `package.json`, Ausnahmen in `.prettierignore`.

**Barrierefreiheit:** Die drei Template-Regeln `click-events-have-key-events`, `interactive-supports-focus` und `label-has-associated-control` stehen auf `warn` — 68 Treffer aus dem Altbestand, die eigene Arbeit sind. Keine neuen dazu produzieren; Details in [ADR 0011](adr/0011-lint-format-ci.md).

## Hinterlegte Schemata

Die XJustiz-Schemata beider Versionen liegen im Projekt unter `public/schemas/<version>/` (3.6.2, 4.0.0) und werden beim Start automatisch geladen — ein XSD-Ordner-Upload ist nur noch für Fremdschemata nötig (Details: [BundledSchemaService](services.md#bundledschemaservice)). Das Manifest `public/schemas/index.json` steuert Versionen, Anzeigenamen und die Standardversion.

**Beim Hinzufügen/Austauschen von XSDs:** Dateien in den jeweiligen Ordner legen (neue Version = neuer Unterordner) und `npm run schemas:manifest` ausführen. Das Skript baut die Dateilisten neu auf und übernimmt vorhandene `label`/`default`/Reihenfolge; die Standardversion in `index.json` (`"default": true`) bei Bedarf von Hand umsetzen.

**Aktuellen Stand von xjustiz.de übernehmen:** `npm run schemas:fetch` lädt die veröffentlichten XSD-ZIPs, entpackt sie nach `public/schemas/<version>/`, berichtet neue/geänderte/entfallene Dateien und ruft anschließend `schemas:manifest` auf. `npm run schemas:fetch -- --dry` zeigt nur den Abgleich, `-- 3.6.2` beschränkt auf eine Version. Vor Releases laufen lassen — Nachlieferungen ändern eine Version auch nachträglich (so kamen z. B. `xjustiz_2600_zwangsvollstreckung_3_6` und `xjustiz_2900_dabag_3_3` in 3.6.2).

## Code-Konventionen

- **Idiomatisches Angular 20:** standalone Components, `signal()`/`computed()`/`effect()`, `input()`/`output()`, neue Control-Flow-Syntax (`@if`/`@for`), `ChangeDetectionStrategy.OnPush`. Kein NgModule.
- **Deutschsprachige Bezeichner und Kommentare** beibehalten. Code-Kommentare verweisen mit Zeilennummern auf `legacy/Profilierer.html` — bei fachlichen Änderungen den Bezug pflegen.
- **Store-Mutationen** (`elemente`/`auspraegungen`) müssen **neue Referenzen** erzeugen, sonst feuert das Signal nicht. Kaskaden (`removeAusp`) und Aufräumen (`pruneP`) bleiben im `StateService` gebündelt und getestet.
- **TypeScript strict** inkl. `noUncheckedIndexedAccess` — Index-Zugriffe absichern.
- **SVG-Linien:** Die CSS-Klassen `.ntree/.nkids/.box/.addBox` und die `data-*`-Attribute nicht umbenennen — `TreeCanvas` vermisst darüber die Geometrie.
- **Keine ungefragten Refactors** oder neues Tooling über den Auftrag hinaus.

## Tests

Neue Logik in Services mit Unit-Tests absichern (Muster: `*.spec.ts` neben der Quelle, Fixtures inline). Reine UI-Änderungen bei Bedarf per Puppeteer-E2E gegen den Dev-Server prüfen (siehe [Tests](testing.md)).

## Git

- Branch für jede Änderung; Basis ist `main`.
- Commit-Nachrichten **knapp und auf Deutsch**, mit Präfix (`Feature:`, `Bugfix:`, `Doku:`, `Tests:`, `UI:`).
- Commit-Trailer:

  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```

- Remote `origin` zeigt auf `github.com:FinnFreiheit/Profilierer` (Push nach Absprache).
- Vor dem Push `npm run check` — CI prüft dieselbe Kette.

## Architektur-Entscheidungen

Größere Richtungsentscheidungen als [ADR](adr/README.md) festhalten (Kontext · Entscheidung · Konsequenzen · Status), fortlaufend nummeriert.
