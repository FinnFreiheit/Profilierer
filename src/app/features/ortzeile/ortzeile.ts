import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { MessagePicker } from '../message-picker/message-picker';
import { Search } from '../search/search';
import { StateService } from '../../core/services/state.service';
import { UeberlagerungService } from '../../core/services/ueberlagerung.service';

/**
 * **Ort-Zeile** (Editor v4, Zeile 2 der Kopfzone): wo bin ich, wie finde ich
 * etwas und in welcher Form sehe ich es — Nachrichtentyp links, Suche und das
 * Segment Baum|XML rechts. Bewusst getrennt von der Arbeits-Zeile darunter:
 * die beantwortet "wie arbeite ich" und "wie weit bin ich", das ist eine
 * andere Frage.
 *
 * Der Pfad (`app-crumbs`) steht in der Fusszeile.
 */
@Component({
  selector: 'app-ortzeile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MessagePicker, Search],
  templateUrl: './ortzeile.html',
})
export class Ortzeile {
  private readonly state = inject(StateService);
  private readonly ueberlagerung = inject(UeberlagerungService);

  protected readonly darstellung = this.state.darstellung;

  /**
   * Drei Faelle, in denen es kein einzelnes XML zu zeigen gibt. Der Grund
   * steht als Titel an der Gruppe, nicht an den Knoepfen: ueber einen
   * `disabled`-Knopf kommt kein Tooltip.
   */
  protected readonly sperrGrund = computed(() => {
    if (!this.state.hasRoot()) return 'Erst einen Nachrichtentyp wählen';
    if (this.ueberlagerung.aktiv()) return 'Mehrere Nachrichten überlagert — kein einzelnes XML';
    if (this.state.istTypAnsicht()) return 'Für einen Datentyp gibt es keine Nachricht';
    return '';
  });

  protected readonly gesperrt = computed(() => !!this.sperrGrund());

  constructor() {
    // Solange gesperrt ist, gilt der Baum — sonst zeigte das Segment "XML"
    // als aktiv an, waehrend die Flaeche etwas anderes zeigt. Zurueckgesetzt
    // wird nur hier: ein blosser Wechsel des Nachrichtentyps laesst die
    // gewaehlte Darstellung ausdruecklich stehen.
    effect(() => {
      if (this.gesperrt() && this.state.darstellung() !== 'baum')
        this.state.darstellung.set('baum');
    });
  }

  protected setzeDarstellung(d: 'baum' | 'xml'): void {
    if (this.gesperrt()) return;
    this.state.darstellung.set(d);
  }
}
