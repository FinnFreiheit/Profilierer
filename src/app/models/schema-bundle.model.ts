/**
 * Eine waehlbare XJustiz-Schemaversion. Zwei Quellen:
 * - hinterlegt (`public/schemas/<dir>/`, aus dem Manifest index.json),
 * - abgerufen von xjustiz.de (`zipUrl` gesetzt, Dateien kommen aus dem ZIP).
 * Ersetzt den manuellen XSD-Ordner-Upload: die Dateien werden per fetch geladen.
 */
export interface BundledVersion {
  /** Stabile Kennung (= Version), z. B. "3.6.2". */
  id: string;
  /** Anzeigename im Versions-Umschalter. */
  label: string;
  /** Eindeutiger Schluessel: Unterordner unter public/schemas/ bzw. "xjustiz.de/<version>". */
  dir: string;
  /** Beim Start automatisch geladene Version. */
  default?: boolean;
  /** Liste der XSD-Dateinamen in diesem Ordner (aus dem Manifest; remote leer bis geladen). */
  files: string[];
  /** Nur bei Abruf von xjustiz.de: Pfad des Schema-ZIPs (relativ zu xjustiz.justiz.de). */
  zipUrl?: string;
  /** Nur bei Abruf von xjustiz.de: Beschriftung des Links auf der Versionsseite. */
  hinweis?: string;
}
