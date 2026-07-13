/**
 * Datenmodelle des zentralen Testdaten-Speichers. Eine Testnachricht ist eine
 * hochgeladene XJustiz-XML-Instanz (Root `nachricht.*`), abgelegt mit
 * abgeleiteten Metainfos (Nachrichtenname, Fachmodul) und optionaler Notiz.
 */

/** Schlanke Index-Zeile (ohne das XML) fuer die Kachel-Ansicht. */
export interface TestmessageEntry {
  id: string;
  /** Dateiname/Anzeigename beim Upload. */
  name: string;
  /** Voller Nachrichtenname, z. B. `nachricht.dabag.antrag.2900001`. */
  nachricht?: string;
  /** Cluster-Segment (2. Namenssegment), z. B. `dabag`. */
  fachmodul?: string;
  /** Best-effort ermittelte XJustiz-Version. */
  xjustizVersion?: string;
  /** Byte-Länge des XML. */
  groesse: number;
  notiz?: string;
  /** ms-Timestamp des Uploads. */
  hochgeladen: number;
  /** ms-Timestamp der letzten Änderung (Sortierschlüssel). */
  aktualisiert: number;
}

/** Upload-Nutzlast (POST /api/testmessages). */
export interface TestmessageInput {
  name: string;
  xml: string;
  nachricht: string;
  fachmodul: string;
  xjustizVersion?: string;
  groesse: number;
}
