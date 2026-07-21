# ADR 0008: ExcelJS statt SheetJS für den Excel-Export

- Status: Angenommen (löst den xlsx-Teil von ADR-0006 ab)
- Datum: 26.07.15

## Kontext

Der Excel-Export wurde auf das **NGem-Abstimmungslayout** umgestellt (Vorbild: manuell
gepflegte eNoVA-Abstimmungs-Excel): Zellfüllungen (Kopfband, Gliederungsstreifen,
Szenariospalte), Schriftarten, gemergte Beschreibungszeilen, fixierte Kopfzeilen und
manuell berechnete Zeilenhöhen. Die freie SheetJS-Community-Version (`xlsx` 0.18.x)
schreibt **keine Zellformatierung** (Füllungen/Fonts nur in der Pro-Version) — das
Referenzlayout war damit nicht umsetzbar.

## Entscheidung

Der Excel-Export nutzt **ExcelJS** (npm `exceljs`), das Füllungen, Fonts, Merges,
Spaltenbreiten, Zeilenhöhen und fixierte Zeilen in der freien Version schreibt.
Wie zuvor wird die Bibliothek **dynamisch importiert** (`await import('exceljs')`,
Lazy-Chunk, `allowedCommonJsDependencies`). `xlsx` wurde vollständig entfernt.
Der Export liegt seit dem Service-Split im **`ExcelExportService`**
(`src/app/core/services/excel-export.service.ts`).

## Konsequenzen

- **Positiv:** Referenzgetreues NGem-Layout; weiterhin kein Initial-Bundle-Ballast
  (Lazy-Chunk); ExcelJS kann Arbeitsmappen auch **lesen** (in Specs genutzt: Export
  wird zurückgelesen und inhaltlich geprüft).
- **Negativ:** Größerer Lazy-Chunk als SheetJS (~950 kB roh / ~220 kB übertragen);
  Zeilenhöhen für gemergte Zellen müssen selbst geschätzt werden (ExcelJS/Excel passen
  sie nicht automatisch an).
- Der **JSZip-Teil von ADR-0006** (Codelisten-ZIP) gilt unverändert weiter.
