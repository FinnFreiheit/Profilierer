import { Wirkung } from '../models/profile.model';

/**
 * „Ist das Element in der Nachricht enthalten?" — die **eine** Formulierung,
 * aus der Serialisierung und Konformitaets-Abgleich dieselbe Antwort ziehen.
 *
 * Vorher war die Frage zweimal beantwortet, und die Antworten widersprachen
 * sich an einer erreichbaren Stelle:
 *
 * - **Geschrieben** hat `ExportService.include`: die Kardinalitaet roh aus der
 *   eigenen Schicht plus Schema (`elemente()[path]?.min || node.min`) statt
 *   ueber `effKard` — die **Vorgabe-Kardinalitaet blieb unbeachtet**; die
 *   Wirkung pfadgenau ueber `wirkungOf` statt mit Vorkommen-Erbe — eine
 *   generisch gesetzte Vorgabe-Pflicht wirkte im Vorkommen (`…@a1`) **nicht**
 *   (derselbe Fehler, den #59 anderswo behoben hat).
 * - **Gelesen** hat `VorgabeSicht.vorkommenAnzahl`: kein Eintrag und kein
 *   Ausschluss ⇒ ein Vorkommen — unabhaengig davon, ob der Export das Element
 *   ueberhaupt schreibt.
 *
 * Der Widerspruch war erreichbar: setzt die Vorgabe an einem im Schema
 * optionalen Element `min = 1` ohne Statusstufe und traegt der Durchlauf nichts
 * ein, meldete der Abgleich beim Speichern nichts (gezaehlt: 1), waehrend das
 * erzeugte XML das Element nicht enthielt — die gespeicherte Nachricht verletzte
 * die Vorgabe und galt als konform.
 *
 * Die Regel folgt ADR 0016 („der Wert entscheidet"): in der Nachricht sind
 * „bewusst weggelassen" und „nicht angegeben" dasselbe.
 */

/**
 * Die vier Angaben, aus denen sich die Antwort ergibt — aufgeloest von der
 * Schicht, die Schema und Profil kennt (`StateService.enthaltenLage`). Bewusst
 * ein Datensatz statt vier Aufrufe: die **Aufloesung** ist der Ort, an dem die
 * beiden Kopien auseinandergelaufen sind, und ein benannter Typ macht sie
 * einzeln pruefbar.
 */
export interface EnthaltenLage {
  /**
   * Die massgebliche Wirkung: eigene Entscheidung (pfadgenau), sonst die
   * Vorgabe **mit Vorkommen-Erbe** — was generisch festgelegt ist, gilt in
   * jedem Vorkommen.
   */
  wirkung: Wirkung | null;
  /** Effektive Mindestanzahl: Entscheidung → Vorgabe (geerbt) → Schema. */
  min: number;
  /** Traegt der Pfad selbst Inhalt — Beispielwert oder Werte-Einschraenkung? */
  eigenerInhalt: boolean;
  /** Liegt **unter** dem Pfad Inhalt (Eintraege oder benannte Vorkommen)? */
  inhaltDarunter: boolean;
}

/**
 * Enthaelt die Nachricht dieses Element? Reihenfolge der Gruende:
 *
 * 1. ausgeschlossen — nein, unabhaengig von allem Uebrigen;
 * 2. zwingend — ja;
 * 3. Mindestanzahl >= 1 — ja (Schema **oder** Profilierung, siehe `min`);
 * 4. sonst entscheidet der Inhalt: am Element selbst oder darunter.
 *
 * Schema-Erweiterungen und erzwungene Verweis-Kennungen stehen bewusst
 * **ausserhalb** dieser Regel: sie sind Zusatzgruende des Serialisierers, keine
 * Aussage der Profilierung ueber das Element.
 */
export function istEnthalten(l: EnthaltenLage): boolean {
  if (l.wirkung === 'ausgeschlossen') return false;
  if (l.wirkung === 'pflicht') return true;
  if (l.min >= 1) return true;
  return l.eigenerInhalt || l.inhaltDarunter;
}
