# ADR 0006: SheetJS/JSZip als npm-Pakete, dynamisch geladen

- Status: Teilweise abgelöst durch [ADR-0008](0008-exceljs-excel-export.md) — der Excel-Export nutzt inzwischen ExcelJS statt `xlsx`/SheetJS; der JSZip-Teil gilt weiter
- Datum: 26.07.10

## Kontext

Die Alt-App band SheetJS (Excel-Export) und JSZip (Codelisten-ZIP entpacken) per CDN-`<script>` ein — global verfügbar, aber Internet-abhängig und außerhalb des Modulsystems. Beide Bibliotheken sind groß (SheetJS ~430 kB), werden aber nur selten und nutzergetriggert gebraucht.

## Entscheidung

`xlsx` und `jszip` werden als **npm-Pakete** eingebunden und **dynamisch importiert** (`await import(...)`) — SheetJS erst in `ExportService.exportExcel`, JSZip erst in `CodelistService.importCodelistZip`. In `angular.json` sind sie als `allowedCommonJsDependencies` geführt.

## Konsequenzen

- **Positiv:** Kein CDN, offline nutzbar; die Bibliotheken landen in **Lazy-Chunks** und belasten den initialen Bundle nicht; klare Modulgrenzen und Typen.
- **Negativ:** Beim ersten Excel-Export/ZIP-Import wird der jeweilige Chunk nachgeladen (einmalige kurze Verzögerung). Der `xlsx`-npm-Stand (0.18.x) ist etwas älter als der aktuelle SheetJS-Vertrieb — für den Export-Umfang ausreichend.
