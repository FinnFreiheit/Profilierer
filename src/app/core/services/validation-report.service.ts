import { Injectable, signal } from '@angular/core';

/**
 * Zustand des Validierungsbericht-Dialogs (app-validation-dialog): Services
 * und Komponenten melden hierueber blockierte Exporte/Uploads mit der
 * Fehlerliste der Schemavalidierung.
 */
@Injectable({ providedIn: 'root' })
export class ValidationReportService {
  private readonly _titel = signal('');
  private readonly _fehler = signal<string[]>([]);
  private readonly _offen = signal(false);

  readonly titel = this._titel.asReadonly();
  readonly fehler = this._fehler.asReadonly();
  readonly offen = this._offen.asReadonly();

  zeige(titel: string, fehler: string[]): void {
    this._titel.set(titel);
    this._fehler.set(fehler);
    this._offen.set(true);
  }

  schliesse(): void {
    this._offen.set(false);
  }
}
