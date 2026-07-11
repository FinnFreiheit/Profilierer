/**
 * Eine im Projekt hinterlegte XJustiz-Schemaversion (public/schemas/<dir>/).
 * Ersetzt den manuellen XSD-Ordner-Upload: die Dateien werden per fetch geladen.
 */
export interface BundledVersion {
  /** Stabile Kennung (= Version), z. B. "3.6.2". */
  id: string;
  /** Anzeigename im Versions-Umschalter. */
  label: string;
  /** Unterordner unter public/schemas/. */
  dir: string;
  /** Beim Start automatisch geladene Version. */
  default?: boolean;
  /** Liste der XSD-Dateinamen in diesem Ordner (aus dem Manifest). */
  files: string[];
}
