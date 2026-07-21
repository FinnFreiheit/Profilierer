# Architektur-Entscheidungen (ADRs)

Architecture Decision Records halten wesentliche Richtungsentscheidungen mit Begründung fest, damit spätere Entwickler (und Claude) das „Warum" nachvollziehen können. Format je Datei: **Kontext · Entscheidung · Konsequenzen · Status**. Fortlaufend nummeriert, nicht rückwirkend ändern — stattdessen eine neue ADR ergänzen, die eine alte ablöst.

## Index

| Nr. | Titel | Status |
|---|---|---|
| [0001](0001-angular-migration.md) | Migration von Single-File-HTML zu Angular 20 | Angenommen |
| [0002](0002-signals-store.md) | Signals-Store statt globalem Zustand | Angenommen |
| [0003](0003-svg-verbindungslinien.md) | SVG-Verbindungslinien deklarativ mit DOM-Messung | Angenommen |
| [0004](0004-dev-proxy-xrepository.md) | Angular-Dev-Proxy für XRepository statt Python-Helfer | Angenommen |
| [0005](0005-node24-headless-tests.md) | Node 24 via nvm + Chrome-for-Testing für Headless-Tests | Angenommen |
| [0006](0006-lazy-xlsx-jszip.md) | SheetJS/JSZip als npm-Pakete, dynamisch geladen | Teilweise abgelöst durch 0008 |
| [0007](0007-datenbank-backend.md) | Profil-Persistenz über ein self-hosted Node/SQLite-Backend | Angenommen |
| [0008](0008-exceljs-excel-export.md) | ExcelJS statt SheetJS für den Excel-Export | Angenommen |
| [0009](0009-xsd-validierung-xmllint-wasm.md) | XSD-Validierung im Browser mit xmllint-wasm | Angenommen |

## Vorlage

```markdown
# ADR NNNN: Titel

- Status: Vorgeschlagen | Angenommen | Abgelöst durch ADR-XXXX
- Datum: YY.MM.DD

## Kontext
Welches Problem, welche Randbedingungen?

## Entscheidung
Was wurde beschlossen?

## Konsequenzen
Positiv / negativ / Folgeaufgaben.
```
