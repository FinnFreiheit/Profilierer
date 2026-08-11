import { Luecke, Verstoss } from '../core/services/konformitaet.service';

/**
 * Der Prüfbericht „Testnachricht gegen eine Profilierung" (#107).
 *
 * Zwei Arten von Befund, **getrennt** gehalten: Verstöße sagen, was die
 * Nachricht nicht einhält; Lücken sagen, worüber die Profilierung nie
 * entschieden hat. Die zweite Art ist ein Mangel der Profilierung — sie in
 * dieselbe Liste zu werfen, schöbe dem Absender die eigene Unvollständigkeit
 * zu.
 */

/** Urteil der vorgeschalteten Schemavalidierung. */
export type SchemaUrteil = 'valide' | 'invalide' | 'unpruefbar';

/** Der Kopf: wogegen wurde geprüft, und wie belastbar ist das Ergebnis. */
export interface PruefberichtKopf {
  /** Anzeigename der geprüften Testnachricht. */
  name: string;
  /** Voller Nachrichtenname (`nachricht.*`). */
  msgName: string;
  profilName: string;
  /** Bezeichnung der geprüften Fassung („Arbeitsstand", „v3", „v4 (Abnahme)"). */
  fassung: string;
  xjustizVersion?: string;
  schema: SchemaUrteil;
  /** Meldungen der Schemavalidierung (leer bei „valide"). */
  schemaFehler: string[];
  /**
   * Entscheidungsstand der Profilierung („x von y"). Fehlt bei Altbestand und
   * bei Import ohne Schema — dann bleibt die Belastbarkeit des Lücken-Teils
   * offen und der Bericht sagt das.
   */
  fortschritt?: { x: number; y: number };
  /**
   * Die benannten Vorkommen der Profilierung ließen sich **nicht** zuordnen:
   * ein XJustiz-XML kann keine Vorkommen-Namen tragen. Dann wird nur die
   * Anzahl geprüft, nicht die Zuordnung — der Bericht sagt es im Kopf.
   */
  vorkommenUnzuordenbar: boolean;
}

export interface Pruefbericht {
  kopf: PruefberichtKopf;
  verstoesse: Verstoss[];
  luecken: Luecke[];
}
