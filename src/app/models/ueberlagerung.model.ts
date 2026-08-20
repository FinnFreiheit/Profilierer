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
  /** Feste Farbe der Nachricht — dieselbe im Filter und an jedem Wert-Kasten. */
  farbe: string;
  /** Vom Filter abgewaehlt: bleibt in der Liste, faellt aus der Anzeige. */
  aktiv: boolean;
}

/** Ein Wert-Kasten unter einem Blatt: was **eine** Nachricht dort sagt. */
export interface Wertblatt {
  id: string;
  name: string;
  farbe: string;
  /** Der Wert; null = die Nachricht hat an dieser Stelle keine Angabe. */
  wert: string | null;
  /** Klartext zum Code, wenn das Blatt an einer Codeliste haengt. */
  label: string | null;
  /**
   * Weicht von mindestens einer anderen **gewaehlten** Nachricht ab (fehlende
   * Angabe zaehlt als Abweichung). Bei technischen Kopfangaben immer false —
   * sie unterscheiden sich zwangslaeufig.
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
 * Bei mehr Nachrichten als Farben wird zyklisch weitergezaehlt; ab dann
 * unterscheidet der Name.
 */
export const NACHRICHT_FARBEN: readonly string[] = [
  '#378ADD', // Blau
  '#1D9E75', // Grün
  '#BA7517', // Bernstein
  '#7F77DD', // Violett
  '#D4537E', // Rosa
  '#0F6E56', // Petrol
  '#E24B4A', // Rot
  '#888780', // Grau
];

/** Die Farbe der n-ten Nachricht (zyklisch). */
export function nachrichtFarbe(i: number): string {
  return NACHRICHT_FARBEN[i % NACHRICHT_FARBEN.length]!;
}
