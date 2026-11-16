import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject } from '@angular/core';
import { UiSettingsService } from './ui-settings.service';

/** Klasse am `<html>`-Element, an der alle Regeln der Darstellung haengen. */
export const BARRIEREFREI_KLASSE = 'barrierefrei';

/**
 * **Barrierefreie Darstellung als Wahlschalter.** Ausgeschaltet bleibt die
 * Oberflaeche exakt, wie sie ist; eingeschaltet legt `styles.scss` (Abschnitt
 * „Barrierefreie Darstellung") eine zweite Schicht darueber: staerkere
 * Kontraste, ein deutlicher Fokusrahmen, unterstrichene Verweise, groessere
 * Klickflaechen, keine Bewegung.
 *
 * Der Zustand gehoert zum Arbeitsplatz (`UiSettingsService`, localStorage),
 * nicht zur Profilierung. Er steht als Klasse am `<html>`-Element, damit die
 * Regeln auch Dialoge und Menues erreichen, die ausserhalb von `app-root`
 * gezeichnet werden.
 */
@Injectable({ providedIn: 'root' })
export class BarrierefreiService {
  private readonly doc = inject(DOCUMENT);

  readonly aktiv = inject(UiSettingsService).flagge('barrierefrei', false);

  constructor() {
    effect(() => {
      this.doc.documentElement.classList.toggle(BARRIEREFREI_KLASSE, this.aktiv());
    });
  }

  schalte(): void {
    this.aktiv.update((an) => !an);
  }

  /** Fuer Spruenge per Skript: weich nur, solange Bewegung erwuenscht ist. */
  scrollVerhalten(): ScrollBehavior {
    return this.aktiv() ? 'auto' : 'smooth';
  }
}
