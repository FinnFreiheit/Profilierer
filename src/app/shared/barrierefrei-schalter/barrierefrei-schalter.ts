import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { BarrierefreiService } from '../../core/services/barrierefrei.service';

/**
 * Wahlschalter der barrierefreien Darstellung: steht in jeder Kopfzeile neben
 * Beta- und Rollen-Badge (Uebersichten und Editor), damit er aus jeder Ansicht
 * erreichbar ist. Ein echter Schalter (`role="switch"`), kein Menuepunkt —
 * wer ihn braucht, soll ihn nicht suchen muessen.
 */
@Component({
  selector: 'app-barrierefrei-schalter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button
    type="button"
    class="bfSchalter"
    role="switch"
    aria-label="Barrierefreie Darstellung"
    [attr.aria-checked]="bf.aktiv()"
    [class.an]="bf.aktiv()"
    title="Barrierefreie Darstellung: stärkere Kontraste, deutlicher Fokusrahmen, größere Klickflächen, keine Animationen"
    (click)="bf.schalte()"
  >
    <span class="bfSpur" aria-hidden="true"><span class="bfKnopf"></span></span>
    <span class="bfText">Barrierefrei</span>
  </button>`,
})
export class BarrierefreiSchalter {
  protected readonly bf = inject(BarrierefreiService);
}
