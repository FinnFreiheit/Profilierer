# Beitragen

Konventionen für die Weiterentwicklung. Ergänzt [CLAUDE.md](../CLAUDE.md) (Session-Handbuch).

## Setup

```
. "$HOME/.nvm/nvm.sh"; nvm use 24   # Angular 20 braucht Node ≥ 22.12
npm install
npm start                           # ng serve (inkl. XRepository-Dev-Proxy)
npm run test:ci                     # headless Unit-Tests
npm run build                       # Produktions-Build
```

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

- Branch für jede Änderung; Basis ist `main` bzw. der aktuelle Arbeitsbranch (`master`).
- Commit-Nachrichten **knapp und auf Deutsch**.
- Commit-Trailer:

  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

- Kein Remote gesetzt — bei Bedarf `git remote add origin …`.

## Architektur-Entscheidungen

Größere Richtungsentscheidungen als [ADR](adr/README.md) festhalten (Kontext · Entscheidung · Konsequenzen · Status), fortlaufend nummeriert.
