/**
 * Strukturierte Ergebnisse der Schemavalidierung — Grundlage fuer die
 * Fehler-Markierung im Baum (ValidationMarkerService) und den klickbaren
 * Validierungsbericht (app-validation-dialog).
 */

/** Ein Schemavalidierungs-Fehler mit optionaler Fundstelle. */
export interface ValidierungsFehler {
  /** Lesbare Meldung (wie im Bericht angezeigt, inkl. "Zeile N: …"). */
  text: string;
  /** Zeile in der geprueften XML-Datei (1-basiert), falls libxml2 sie liefert. */
  zeile?: number;
}

/** Eintrag im Validierungsbericht; mit `pfad` klickbar (Sprung in den Baum). */
export interface ReportEintrag {
  text: string;
  /** Voller Baumpfad (inkl. @auspId) des betroffenen Knotens. */
  pfad?: string;
  /**
   * Bekannte Schema-Erweiterung: der Fehler geht auf ein bewusst
   * hinzugefuegtes Nicht-Schema-Element zurueck und blockiert allein nicht.
   */
  erweiterung?: boolean;
}
