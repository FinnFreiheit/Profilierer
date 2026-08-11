# Architektur-Entscheidungen (ADRs)

Architecture Decision Records halten wesentliche Richtungsentscheidungen mit Begründung fest, damit spätere Entwickler (und Claude) das „Warum" nachvollziehen können. Format je Datei: **Kontext · Entscheidung · Konsequenzen · Status**. Fortlaufend nummeriert, nicht rückwirkend ändern — stattdessen eine neue ADR ergänzen, die eine alte ablöst.

## Index

| Nr.                                                   | Titel                                                             | Status                        |
| ----------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------- |
| [0001](0001-angular-migration.md)                     | Migration von Single-File-HTML zu Angular 20                      | Angenommen                    |
| [0002](0002-signals-store.md)                         | Signals-Store statt globalem Zustand                              | Angenommen                    |
| [0003](0003-svg-verbindungslinien.md)                 | SVG-Verbindungslinien deklarativ mit DOM-Messung                  | Angenommen                    |
| [0004](0004-dev-proxy-xrepository.md)                 | Angular-Dev-Proxy für XRepository statt Python-Helfer             | Angenommen                    |
| [0005](0005-node24-headless-tests.md)                 | Node 24 via nvm + Chrome-for-Testing für Headless-Tests           | Teilweise abgelöst durch 0011 |
| [0006](0006-lazy-xlsx-jszip.md)                       | SheetJS/JSZip als npm-Pakete, dynamisch geladen                   | Teilweise abgelöst durch 0008 |
| [0007](0007-datenbank-backend.md)                     | Profil-Persistenz über ein self-hosted Node/SQLite-Backend        | Angenommen                    |
| [0008](0008-exceljs-excel-export.md)                  | ExcelJS statt SheetJS für den Excel-Export                        | Angenommen                    |
| [0009](0009-xsd-validierung-xmllint-wasm.md)          | XSD-Validierung im Browser mit xmllint-wasm                       | Angenommen                    |
| [0010](0010-schema-erweiterungen-profil-overlay.md)   | Schema-Erweiterungen als Profil-Overlay statt Schema-Manipulation | Angenommen                    |
| [0011](0011-lint-format-ci.md)                        | Node-Pinning, ESLint/Prettier und CI als Qualitäts-Tor            | Angenommen                    |
| [0012](0012-abnahme-rollenkonzept.md)                 | Abnahme durch die BLK-AG — Zwei-Rollen-Konzept (ergänzt 0007)     | Angenommen                    |
| [0013](0013-vergleich-seit-abnahme.md)                | „Seit Abnahme geändert" sichtbar — struktureller Vergleich        | Angenommen                    |
| [0014](0014-hinweise-eigene-ressource.md)             | Hinweise als eigene Ressource neben der Profilierung              | Angenommen                    |
| [0015](0015-vorkommen-zaehlkonvention.md)             | Vorkommen zählen statt Mindestanzahl 1 zu materialisieren         | Angenommen                    |
| [0016](0016-wert-entscheidet-im-instanz-durchlauf.md) | Im Instanz-Durchlauf entscheidet der Wert (ergänzt 0015)          | Angenommen                    |
| [0017](0017-erweiterungstyp-lebende-referenz.md)      | Erweiterungs-Datentyp als lebende Referenz (ergänzt 0010)         | Angenommen                    |
| [0018](0018-enthalten-eine-regel.md)                  | „Ist in der Nachricht enthalten" ist eine Regel (ergänzt 0015)    | Angenommen                    |

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
