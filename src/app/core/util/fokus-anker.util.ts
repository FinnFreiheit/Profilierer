/** Bildschirmlage eines Kastens: Abstand zur oberen/linken Kante des Ausschnitts. */
export interface Lage {
  top: number;
  left: number;
}

/** Unterhalb dieser Abweichung (px) wird nicht nachgefuehrt — Mess-Rauschen. */
const TOLERANZ = 1;

/**
 * Merker fuer den Kasten, an dem der Blick haengt (der ausgewaehlte, also der
 * gerade bearbeitete). Er beantwortet eine einzige Frage: Steht der Kasten nach
 * einem Umbau des Baums noch da, wo er stand — und wenn nicht, um wieviel muss
 * die Ansicht nachgezogen werden?
 *
 * Gehalten wird die **Lage des Kastens**, nicht der Scroll-Stand: bei einem
 * Moduswechsel (gefuehrt <-> bearbeiten) erscheinen oder verschwinden Kaesten
 * oberhalb des bearbeiteten Elements, der Scroll-Stand bleibt dabei
 * zahlenmaessig stehen und der Inhalt verrutscht darunter weg.
 *
 * Reine Rechnung ohne DOM — das Messen liegt beim TreeCanvas.
 */
export class FokusAnker {
  private pfad: string | null = null;
  private lage: Lage | null = null;

  /** Was der Anwender zuletzt gesehen hat: diese Lage wird gehalten. */
  merke(pfad: string, lage: Lage): void {
    this.pfad = pfad;
    this.lage = lage;
  }

  /**
   * Anker aufgeben — nach einem gewollten Sprung und immer dann, wenn der
   * Anwender bewusst woanders hinscrollt, waehrend der Kasten gar nicht steht.
   */
  loesen(): void {
    this.pfad = null;
    this.lage = null;
  }

  /**
   * Nach einem Umbau: Differenz, um die die Ansicht nachzuziehen ist, oder
   * `null`, wenn nichts zu tun ist. Ein Wechsel der Auswahl fuehrt nie nach —
   * dann uebernimmt der Anker die neue Lage und haelt ab jetzt sie.
   */
  nachfuehren(pfad: string, lage: Lage): Lage | null {
    if (this.pfad === pfad && this.lage) {
      const d = { top: lage.top - this.lage.top, left: lage.left - this.lage.left };
      // Der Anker bleibt stehen: die Ansicht folgt ihm, nicht umgekehrt.
      if (Math.abs(d.top) > TOLERANZ || Math.abs(d.left) > TOLERANZ) return d;
      return null;
    }
    this.merke(pfad, lage);
    return null;
  }
}
