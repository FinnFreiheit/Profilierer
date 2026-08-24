import { Injectable, signal } from '@angular/core';

/** Antwort der Rueckfrage beim Verlassen der Baumansicht. */
export type SpeichernAntwort =
  /** Ablegen — unter diesem (moeglicherweise angepassten) Namen. */
  | { art: 'speichern'; name: string }
  /** Nicht ablegen; die Nachricht bleibt eine bloss geoeffnete Datei. */
  | { art: 'verwerfen' }
  /** Doch nicht verlassen — die Baumansicht bleibt stehen. */
  | { art: 'abbrechen' };

/** Anfrage an den Dialog: fragen, ob die offene Nachricht abgelegt werden soll. */
export interface SpeichernAnfrage {
  /** Namensvorschlag (Dateiname der hochgeladenen Nachricht). */
  vorschlag: string;
  /** Laufende Nummer, damit eine erneute Frage mit gleichem Vorschlag feuert. */
  seq: number;
}

/**
 * Rueckfrage „Testnachricht speichern?" beim Verlassen der Baumansicht — der
 * eine Ort, an dem eine **hochgeladene** Nachricht in den Testdaten-Speicher
 * kommt. Sie traegt bis dahin keinen Eintrag (und damit auch kein Autosave),
 * darum ist der Rueckweg der letzte Moment, in dem sie zu retten ist.
 *
 * Der Dialog ist einmal in der App-Shell gemountet (Muster
 * ErweiterungDialogService); die Antwort kommt als Promise zurueck, weil der
 * Aufrufer auf ihr weiterlaeuft (Ansicht wechseln oder eben nicht).
 */
@Injectable({ providedIn: 'root' })
export class NachrichtSpeichernService {
  private readonly _anfrage = signal<SpeichernAnfrage | null>(null);
  readonly anfrage = this._anfrage.asReadonly();
  private seq = 0;
  /** Aufloeser der offenen Frage; null = es steht gerade keine an. */
  private aufloesen: ((a: SpeichernAntwort) => void) | null = null;

  /** Fragen und auf die Antwort warten. */
  frage(vorschlag: string): Promise<SpeichernAntwort> {
    // Eine noch offene Frage kann es nur geben, wenn der Dialog uebergangen
    // wurde; sie faellt still auf "abbrechen" — sonst bliebe ihr Promise ewig.
    this.aufloesen?.({ art: 'abbrechen' });
    this._anfrage.set({ vorschlag, seq: ++this.seq });
    return new Promise((res) => (this.aufloesen = res));
  }

  /** Antwort des Dialogs; weitere Aufrufe zur selben Frage laufen ins Leere. */
  antworte(a: SpeichernAntwort): void {
    this._anfrage.set(null);
    const res = this.aufloesen;
    this.aufloesen = null;
    res?.(a);
  }
}
