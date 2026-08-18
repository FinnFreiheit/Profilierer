import { Luecke, Reichweite, Verstoss } from '../core/services/konformitaet.service';
import { ListenZuordnung } from '../core/vorkommen-matching';
import { ListenLage } from '../core/kennzeichen-lage';

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
  /** Bezeichnung der geprüften Fassung („Arbeitsstand", „v3", „v4 (Freigabe)"). */
  fassung: string;
  xjustizVersion?: string;
  /** ms-Timestamp der Prüfung — ein Nachweis ohne Datum ist keiner. */
  zeitpunkt: number;
  schema: SchemaUrteil;
  /** Meldungen der Schemavalidierung (leer bei „valide"). */
  schemaFehler: string[];
  /**
   * Entscheidungsstand der Profilierung („x von y"). Fehlt bei Altbestand, bei
   * Import ohne Schema — und bei **jeder eingefrorenen Version**, denn der
   * Snapshot führt das Feld nicht mit. Dann bleibt `festlegungen` als
   * schwächere, aber immer verfügbare Angabe.
   */
  fortschritt?: { x: number; y: number };
  /**
   * Elemente der geprüften Fassung mit Statusstufe. Aus dem Dokument selbst
   * zählbar und darum immer da — der Nenner fehlt, aber „236 Festlegungen"
   * sagt mehr über die Belastbarkeit des Lücken-Teils als gar nichts.
   */
  festlegungen: number;
  /**
   * Reichweite des Abgleichs: wie viele durchsetzbare Festlegungen es gab und
   * wie viele davon nicht zuordenbar blieben. Ohne diese Zahl liest sich „keine
   * Abweichungen" als Unbedenklichkeitsbescheinigung.
   */
  reichweite: Reichweite;
  /**
   * Befunde an nachbeauftragten Elementen (Schema-Erweiterungen). Sie stehen im
   * Bericht, zählen aber nicht gegen die Nachricht: das Element gibt es im
   * Schema nicht (#98).
   */
  nErweiterung: number;
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
  /**
   * Ausweis der Erfuellbarkeits-Zuordnung (#116): welches anonyme Vorkommen der
   * Nachricht wurde ueber welche kennzeichnenden Festlegungen als welche
   * Auspraegung gelesen — der Leser prueft die Zuordnung, statt ihr glauben zu
   * muessen. Leer, wo die Profilierung keine Kennzeichen fuehrt.
   */
  zuordnung: ListenZuordnung[];
  /**
   * Wo eine Kennzeichnung die Reichweite heben wuerde (#121) — abgeleitet aus
   * der Profilierung allein, ohne die Nachricht zu befragen. Ohne diesen
   * Abschnitt nennt der Bericht zwar die ungeprueften Festlegungen, aber nicht
   * den Handgriff, der sie pruefbar machte.
   */
  kennzeichenLage: ListenLage[];
}
