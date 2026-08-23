/**
 * Modell der Nachrichten-Ueberlagerung (#147): alle Testnachrichten eines
 * Kommunikationsszenarios **gleichzeitig** im Baum — je Wert-Blatt ein
 * zusaetzlicher Kasten pro Nachricht.
 *
 * Die Merkmals-Matrix (#136) beantwortet dieselbe Frage als Tabelle und zeigt
 * nur die Abweichungen. Die Ueberlagerung zeigt sie **am Ort**: wo in der
 * Nachricht der Wert steht, welche Nachricht dort ueberhaupt etwas sagt und
 * welche abweicht. Beide teilen die Zaehlkonvention der Vorkommen
 * (positionsweise, siehe ADR 0015) und die Liste der technischen Kopfangaben.
 */

/** Eine ueberlagerte Testnachricht (Spalte der Ueberlagerung). */
export interface UeberlagerteNachricht {
  id: string;
  name: string;
  /**
   * Kurzform „N1", „N2", … — die Beschriftung am Wert-Kasten. Der volle Name
   * stuende an jedem der hunderten Blaetter, waere dort abgeschnitten und
   * verdraengte das, weswegen man hinsieht: den Wert. Aufgeloest wird das
   * Kuerzel dort, wo Platz dafuer ist — im Filter, in der Legende, im Tooltip.
   */
  kuerzel: string;
  /** Feste Farbe der Nachricht — dieselbe im Filter und an jedem Wert-Kasten. */
  farbe: string;
  /** Vom Filter abgewaehlt: bleibt in der Liste, faellt aus der Anzeige. */
  aktiv: boolean;
}

/** Ein Wert-Kasten unter einem Blatt: was **eine** Nachricht dort sagt. */
export interface Wertblatt {
  id: string;
  name: string;
  kuerzel: string;
  farbe: string;
  /** Der Wert; null = die Nachricht hat an dieser Stelle keine Angabe. */
  wert: string | null;
  /** Klartext zum Code, wenn das Blatt an einer Codeliste haengt. */
  label: string | null;
  /**
   * Weicht ab (fehlende Angabe eingeschlossen). Markiert wird gegen den
   * **eindeutig haeufigsten** Wert; gibt es keinen — zwei Nachrichten mit zwei
   * Werten, drei mit drei —, weicht jeder vom anderen ab und alle tragen die
   * Marke. Sonst truege bei genau zwei Nachrichten immer die zweite das ≠, als
   * waere sie die Abweichlerin. Bei technischen Kopfangaben immer false: sie
   * unterscheiden sich zwangslaeufig.
   */
  abweichend: boolean;
}

/** Kurzfassung am Blatt selbst — die Aussage auch im zugeklappten Ast. */
export interface Wertbilanz {
  /** Nachrichten mit einer Angabe an dieser Stelle. */
  belegt: number;
  /** Gewaehlte Nachrichten insgesamt. */
  gesamt: number;
  /** Verschiedene Werte (ohne die fehlenden). */
  verschieden: number;
  /** Mindestens eine Abweichung (fehlende Angabe eingeschlossen). */
  abweichend: boolean;
  /**
   * Traegt die Bilanz ueberhaupt eine Aussage? „2×" an einem Blatt, an dem alle
   * dasselbe sagen, steht sonst an jedem zweiten Kasten und ist reines
   * Rauschen. Gezeigt wird sie nur bei einer Luecke oder Verschiedenheit.
   */
  sagend: boolean;
}

/**
 * Identitaetsfarben der Nachrichten. Bewusst **nicht** die Marken-Palette
 * (Preussischblau/Orange tragen Struktur und Signal, siehe styles.scss) und
 * bewusst dieselben Farbwerte wie die waehlbaren Statusfarben: eine zweite
 * Farbwelt im selben Baum waere unlesbar. Die Bedeutung ist hier eine andere —
 * die Farbe steht fuer die Nachricht, nicht fuer eine Wirkung —, und weil im
 * Betrachtungsmodus der Ueberlagerung keine Statusfarben vorkommen, kollidiert
 * das nicht.
 *
 * Kein Rot: es liest sich im Baum als Fehler (Schemafehler tragen es), und
 * eine Nachricht ist nicht falsch, nur weil sie die siebte ist.
 *
 * Bei mehr Nachrichten als Farben wird zyklisch weitergezaehlt; ab dann
 * unterscheidet das Kuerzel.
 */
export const NACHRICHT_FARBEN: readonly string[] = [
  '#378ADD', // Blau
  '#1D9E75', // Grün
  '#BA7517', // Bernstein
  '#7F77DD', // Violett
  '#D4537E', // Rosa
  '#0F6E56', // Petrol
  '#8A6D3B', // Ocker
  '#5B6B7A', // Schiefer
];

/** Die Farbe der n-ten Nachricht (zyklisch). */
export function nachrichtFarbe(i: number): string {
  return NACHRICHT_FARBEN[i % NACHRICHT_FARBEN.length]!;
}
