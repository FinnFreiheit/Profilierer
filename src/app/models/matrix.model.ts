/**
 * Modell der Merkmals-Matrix (#136): worin unterscheiden sich die
 * Testnachrichten eines Kommunikationsszenarios?
 *
 * Bei fuenf Auspraegungen sind es zehn Paarvergleiche, bis man das weiss. Die
 * Matrix stellt stattdessen alle nebeneinander: Spalten sind die Nachrichten,
 * Zeilen sind **nur** die Stellen, an denen mindestens zwei voneinander
 * abweichen.
 */

/** Eine Spalte: eine Testnachricht des Szenarios. */
export interface MatrixSpalte {
  id: string;
  name: string;
}

/**
 * Art einer Zeile. `anzahl` steht oben und traegt die Aussage, um die es beim
 * Auspraegungs-Testen meist geht ("einmal ein Beteiligter, einmal zwei");
 * `wert` sind Wertunterschiede in Vorkommen, die alle Nachrichten haben.
 */
export type MatrixZeilenArt = 'anzahl' | 'wert';

export interface MatrixZeile {
  art: MatrixZeilenArt;
  /**
   * Fachlicher Bereich der Nachricht, in dem der Unterschied liegt
   * (Nachrichtenkopf, Grunddaten, Fachdaten …) — das 2. Pfadsegment, lesbar
   * gemacht. Die Matrix gliedert danach: die erste Frage beim Vergleich lautet
   * *wo* sich die Nachrichten unterscheiden, nicht *wie*.
   */
  bereich: string;
  /** Vollstaendiger Instanzpfad (Tooltip, Sortierung). */
  pfad: string;
  /** Lesbare Kurzform fuer die erste Spalte. */
  label: string;
  /**
   * Der Wert je Spalte, in der Reihenfolge von `spalten`. `undefined` heisst
   * "nicht vorhanden" und wird als Gedankenstrich angezeigt — bei
   * Anzahl-Zeilen steht dort die Zahl als Text.
   */
  werte: (string | undefined)[];
  /**
   * Listenpfad, unter dessen Anzahl-Zeile diese Zeile eingeklappt liegt.
   * Gesetzt fuer Werte in Vorkommen, die **nicht** alle Nachrichten haben:
   * ein zusaetzlicher Beteiligter ist ein Anzahl-Unterschied, nicht fuenfzig
   * fehlende Pfade. Sein Inhalt erscheint erst beim Aufklappen.
   */
  unterhalb?: string;
  /**
   * Technische Kopfangabe (Erstellungszeitpunkt, Nachrichten-UUID). Standard-
   * maessig ausgeblendet: zwischen gefuehrt erstellten Nachrichten weichen sie
   * **immer** ab und stuenden als Rauschen ganz oben, wo der Blick zuerst
   * hinfaellt.
   */
  technisch?: boolean;
}

/** Ein Bereich mit der Anzahl seiner Unterschiede (Kopfzeile der Matrix). */
export interface MatrixBereich {
  name: string;
  n: number;
}

export interface MatrixResult {
  spalten: MatrixSpalte[];
  zeilen: MatrixZeile[];
  /**
   * Die Bereiche in Pfadreihenfolge mit ihren Zaehlern — die Verteilung ist
   * die eigentliche Uebersicht: 31 in den Grunddaten und 1 in den
   * Schriftgutobjekten ist eine andere Aussage als "53 Unterschiede".
   */
  bereiche: MatrixBereich[];
  /**
   * Anzahl der Zeilen, die der Deckel verworfen hat — ausgewiesen, statt still
   * abzuschneiden.
   */
  abgeschnitten?: number;
}
