import { Injectable, signal } from '@angular/core';
import { ReportEintrag } from '../../models/validation.model';

/** Ein Knopf, der den Bericht als Datei ausleitet. */
export interface BerichtsAusleitung {
  /** Beschriftung des Knopfes. */
  label: string;
  starte: () => void;
}

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

  zeigeMitPfaden(
    titel: string,
    eintraege: ReportEintrag[],
    untertitel?: string,
    oeffne?: (pfad: string) => void,
    ausleitung?: BerichtsAusleitung,
  ): void {
    this._titel.set(titel);
    this._untertitel.set(untertitel ?? null);
    this._eintraege.set(eintraege);
    this._oeffne.set(oeffne ?? null);
    this._ausleitung.set(ausleitung ?? null);
    this._offen.set(true);
  }

  /**
   * Ausleitung des Berichts als Datei — null, wo es keine gibt. Die
   * Schemavalidierungs-Berichte bieten keine an: sie entstehen als Rueckmeldung
   * an einem blockierten Vorgang und sind kein Papier, das jemand weiterreicht.
   * Der Profil-Pruefbericht ist genau das (#108).
   */
  private readonly _ausleitung = signal<BerichtsAusleitung | null>(null);
  readonly ausleitung = this._ausleitung.asReadonly();

  /**
   * Wie ein Befund geoeffnet wird. Standard (null) ist der Sprung im **bereits
   * geladenen** Baum — das trifft jeden Bericht, der aus der laufenden Sitzung
   * entsteht. Ein Bericht ueber eine Nachricht, die gar nicht offen ist
   * (Profil-Pruefung, #107), setzt hier seinen eigenen Weg: erst laden, dann
   * springen.
   */
  private readonly _oeffne = signal<((pfad: string) => void) | null>(null);
  readonly oeffne = this._oeffne.asReadonly();

  schliesse(): void {
    this._offen.set(false);
  }
}
