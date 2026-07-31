import { Injectable, signal } from '@angular/core';
import { ReportEintrag } from '../../models/validation.model';

/**
 * Zustand des Validierungsbericht-Dialogs (app-validation-dialog): Services
 * und Komponenten melden hierueber blockierte Exporte/Uploads mit der
 * Fehlerliste der Schemavalidierung. Eintraege mit Pfad (zeigeMitPfaden)
 * sind im Dialog klickbar und springen zum betroffenen Baumknoten.
 */
@Injectable({ providedIn: 'root' })
export class ValidationReportService {
  private readonly _titel = signal('');
  private readonly _untertitel = signal<string | null>(null);
  private readonly _eintraege = signal<ReportEintrag[]>([]);
  private readonly _offen = signal(false);

  readonly titel = this._titel.asReadonly();
  /**
   * Erlaeuterung unter dem Titel; null = die Standardzeile zur
   * Schemavalidierung. Gesetzt von Berichten anderer Art — etwa den
   * Widersprüchen der gebundenen Profilfassung.
   */
  readonly untertitel = this._untertitel.asReadonly();
  readonly eintraege = this._eintraege.asReadonly();
  readonly offen = this._offen.asReadonly();

  zeige(titel: string, fehler: string[]): void {
    this.zeigeMitPfaden(
      titel,
      fehler.map((text) => ({ text })),
    );
  }

  zeigeMitPfaden(titel: string, eintraege: ReportEintrag[], untertitel?: string): void {
    this._titel.set(titel);
    this._untertitel.set(untertitel ?? null);
    this._eintraege.set(eintraege);
    this._offen.set(true);
  }

  schliesse(): void {
    this._offen.set(false);
  }
}
