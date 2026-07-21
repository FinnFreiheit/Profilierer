import { Injectable, signal } from '@angular/core';

/** Anfrage an den Erweiterungs-Dialog: neues Element unter `parentPath` anlegen. */
export interface ErweiterungAnfrage {
  parentPath: string;
  /** Namen der vorhandenen Kinder (Schema + Erweiterungen) fuer die Kollisionswarnung. */
  vorhandeneNamen: string[];
  /** Laufende Nummer, damit ein erneutes Oeffnen mit gleichem Pfad feuert. */
  seq: number;
}

/**
 * Zustand des Erweiterungs-Dialogs (app-erweiterung-dialog): Baumknoten und
 * Detailpanel melden hierueber die Anlage einer Schema-Erweiterung an — der
 * Dialog ist einmal in der App-Shell gemountet (Muster ValidationReportService).
 */
@Injectable({ providedIn: 'root' })
export class ErweiterungDialogService {
  private readonly _anfrage = signal<ErweiterungAnfrage | null>(null);
  readonly anfrage = this._anfrage.asReadonly();
  private seq = 0;

  oeffneNeu(parentPath: string, vorhandeneNamen: string[]): void {
    this._anfrage.set({ parentPath, vorhandeneNamen, seq: ++this.seq });
  }

  schliesse(): void {
    this._anfrage.set(null);
  }
}
