import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/**
 * **Werkzeugzeile ueber einer Sammlung**: Suche und Trefferzahl, dazu —
 * sobald die Ansicht Gliederungen anbietet — die Gliederung und der
 * Umschalter Kacheln/Liste. Der Zustand gehoert der Ansicht (`[(suche)]`,
 * `[(gliederung)]`, `[(ansicht)]`); hier steht nur die Zeile selbst.
 */
@Component({
  selector: 'app-sammlung-werkzeuge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sammlung-werkzeuge.html',
  host: { class: 'dashWerkzeuge' },
})
export class SammlungWerkzeuge {
  readonly suche = model('');
  readonly platzhalter = input.required<string>();
  /** „12 Einträge" bzw. „4 von 12". */
  readonly trefferText = input.required<string>();
  /** Ohne Gliederungen entfallen Auswahl und Umschalter (Projektansicht). */
  readonly gliederungen = input<readonly { id: string; label: string }[]>([]);
  readonly gliederung = model('');
  readonly ansicht = model('kacheln');
}
