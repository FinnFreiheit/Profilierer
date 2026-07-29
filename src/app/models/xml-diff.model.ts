/**
 * Modell des XML-Vergleichs abgenommener Testnachrichten (aktueller Stand
 * gegen die eingefrorene Abnahme-Fassung).
 *
 * Verglichen wird die Struktur, nicht der Text: die Abnahme-Fassung wird
 * verbatim aus der hochgeladenen Datei eingefroren, der Arbeitsstand nach
 * jeder Bearbeitung neu serialisiert. Ein Zeilendiff wuerde deshalb fast
 * ausschliesslich Formatierungsrauschen melden — siehe ADR 0013.
 */

export type XmlDiffArt = 'neu' | 'entfernt' | 'geändert';

export interface XmlDiffEintrag {
  art: XmlDiffArt;
  /** Instanzpfad mit Vorkommens-Kennung: `…/beteiligung{id=B-1}/…` bzw. `dokument[3]`. */
  pfad: string;
  /** Letztes Pfadsegment (Ueberschrift). */
  name: string;
  vorher?: string;
  nachher?: string;
  /** Gesetzt, wenn ein Attribut betroffen ist (Anzeige `@aktenzeichen`). */
  attribut?: string;
  /** Bei komplett neuen/entfallenen Teilbaeumen: Anzahl der Nachfahren-Elemente. */
  unterElemente?: number;
}

export interface XmlDiffResult {
  eintraege: XmlDiffEintrag[];
  zaehler: Record<XmlDiffArt, number>;
  /** Die Wurzelelemente wichen ab — ein Detailvergleich waere sinnlos. */
  wurzelUnterschied?: { vorher: string; nachher: string };
}
