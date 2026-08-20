import { Injectable, signal } from '@angular/core';
import { TestmessageEntry } from '../../models/testmessage.model';

/**
 * Steuert den Dialog "Szenario zuordnen" (#141). Bewusst schlank: nur die
 * Nachricht, um die es geht — Laden und Schreiben macht der Dialog selbst.
 *
 * Muster wie VergleichService: der Dialog haengt global in der Shell und
 * reagiert per effect. Ein Durchreichen als Output waere untauglich, weil die
 * Einstiege in zwei Ansichten liegen — im Testdaten-Speicher an der Kachel und
 * auf der Projektseite in der Sammelzeile "ohne Szenario", wo die Luecke
 * ueberhaupt erst auffaellt.
 */
@Injectable({ providedIn: 'root' })
export class SzenarioZuordnenService {
  readonly ziel = signal<TestmessageEntry | null>(null);

  oeffne(eintrag: TestmessageEntry): void {
    this.ziel.set(eintrag);
  }

  schliesse(): void {
    this.ziel.set(null);
  }
}
