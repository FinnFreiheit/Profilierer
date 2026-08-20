/**
 * Ein Projekt (#134): der Behaelter ueber den Profilierungen. Ein Vorhaben
 * buendelt mehrere Kommunikationsszenarien auf derselben Nachricht — ein
 * GenUVA-Ersuchen an die Gemeinde, eines an das Gericht, die jeweilige
 * Sachentscheidung — und die Testnachrichten, die an ihnen haengen.
 *
 * Optional und additiv: die Gruppierung nach Fachmodul bleibt, wer nichts
 * zuordnet, merkt nichts. Die Zugehoerigkeit traegt **nur die Profilierung**
 * (`LibraryEntry.projektId`); eine gebundene Testnachricht erbt sie ueber ihre
 * `profilId` — kein zweiter Pflegeort, keine widerspruechlichen Zustaende. Nur
 * ungebundene Nachrichten (Uploads) tragen eine eigene Zuordnung.
 */
export interface Projekt {
  id: string;
  name: string;
  beschreibung?: string;
  /** Schlagworte der Ablage — dieselbe Mechanik wie an Profil und Nachricht. */
  tags?: string[];
  /** ms-Timestamp des Anlegens. */
  angelegt: number;
  /** ms-Timestamp der letzten Aenderung (Sortierung der Uebersicht). */
  aktualisiert: number;
  /** Zugeordnete Profilierungen = Kommunikationsszenarien des Vorhabens. */
  nProfile: number;
  /** Testnachrichten mit eigener **oder** geerbter Zuordnung. */
  nTestnachrichten: number;
}

/** Aenderbare Felder eines Projekts; nur gesetzte wirken. */
export interface ProjektPatch {
  name?: string;
  beschreibung?: string;
  tags?: string[];
}

/**
 * Einsortieren eines Eintrags: Projekt und/oder Schlagworte — die **Ablage**,
 * nicht die fachliche Aussage. Getrennt von den uebrigen Metadaten, weil
 * dieser Weg auch bei freigegebenen Eintraegen offen steht.
 *
 * `projektId: null` loest die Zuordnung.
 */
export interface AblagePatch {
  projektId?: string | null;
  tags?: string[];
}
