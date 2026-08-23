import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { UeberlagerungService } from '../../core/services/ueberlagerung.service';
import { Menu } from '../../shared/menu/menu';

/**
 * Der Filter der Nachrichten-Ueberlagerung (#147): welche Testnachrichten im
 * Baum stehen — und ob nur die Stellen gezeigt werden, an denen sie sich
 * unterscheiden.
 *
 * Steht in der Werkzeugleiste und erscheint nur, solange eine Ueberlagerung
 * laeuft. Die Farbpunkte sind dieselben wie an den Wert-Kaesten; darueber
 * findet die Zuordnung statt, nicht ueber die Reihenfolge.
 */
@Component({
  selector: 'app-ueberlagerung-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Menu],
  templateUrl: './ueberlagerung-menu.html',
})
export class UeberlagerungMenu {
  protected readonly ueberlagerung = inject(UeberlagerungService);

  protected readonly label = computed(() => {
    const alle = this.ueberlagerung.nachrichten().length;
    const n = this.ueberlagerung.gewaehlt().length;
    return n === alle ? `Nachrichten (${alle})` : `Nachrichten (${n}/${alle})`;
  });

  /** Warnung im Menuekopf: ohne gewaehlte Nachricht steht der Baum leer da. */
  protected readonly keineGewaehlt = computed(() => this.ueberlagerung.gewaehlt().length === 0);

  /**
   * Der Filter laeuft, es gibt aber nichts zu filtern. Ohne diesen Hinweis
   * saehe es aus, als tue der Schalter nichts — dabei ist „nichts zu tun"
   * gerade die Antwort.
   */
  protected readonly filterWirkungslos = computed(
    () => this.ueberlagerung.nurAbweichungen() && this.ueberlagerung.abweichungen() === 0,
  );
}
