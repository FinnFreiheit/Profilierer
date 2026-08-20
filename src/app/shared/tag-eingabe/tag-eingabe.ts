import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { TagOption, normalisiereTags, tagsAlsText } from '../../core/util/tags.util';
import { KeinAutofillDirective } from '../kein-autofill.directive';

/**
 * Eingabefeld fuer Schlagworte: eine Zeile, kommagetrennt, darunter die im
 * Bestand vergebenen Schlagworte zum Anklicken. Bewusst kein `datalist` — das
 * schlaegt nur auf den **ganzen** Feldwert an und traegt bei einer Liste ab dem
 * zweiten Schlagwort nichts mehr bei.
 *
 * Normalisiert wird nicht beim Tippen, sondern beim Uebernehmen im Dialog
 * (`normalisiereTags`) und noch einmal im Server.
 */
@Component({
  selector: 'app-tag-eingabe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tag-eingabe.html',
  imports: [KeinAutofillDirective],
})
export class TagEingabe {
  /** Kommagetrennter Text — zweiweg gebunden an den Dialog. */
  readonly text = model.required<string>();
  /** Im Bestand vergebene Schlagworte (aus `tagOptionen`). */
  readonly vorschlaege = input<TagOption[]>([]);
  /** id des Eingabefeldes, damit das `<label>` des Dialogs darauf zeigen kann. */
  readonly feldId = input('tagFeld');

  /** Nur anbieten, was noch nicht im Feld steht. */
  protected readonly offeneVorschlaege = computed(() => {
    const drin = new Set(normalisiereTags(this.text()).map((t) => t.toLocaleLowerCase('de')));
    return this.vorschlaege().filter((o) => !drin.has(o.tag.toLocaleLowerCase('de')));
  });

  protected uebernimm(tag: string): void {
    this.text.set(tagsAlsText(normalisiereTags([...normalisiereTags(this.text()), tag])));
  }
}
