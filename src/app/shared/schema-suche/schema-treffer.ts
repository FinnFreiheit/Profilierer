import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ZentralTreffer } from '../../core/services/search.service';
import { firstLine } from '../../core/util/pretty.util';

/**
 * Die Sektionen „Nachrichten" und „Datentypen" eines Suchpanels — dieselben
 * Zeilen in der Schema-Suche der Bibliothek und in der zentralen Suche des
 * Editors. Panel, Eingabefeld und was ein Treffer ausloest bleiben Sache der
 * jeweiligen Suche; hier steht nur die Trefferdarstellung.
 *
 * Der Host nimmt nicht am Layout teil (`display: contents`).
 */
@Component({
  selector: 'app-schema-treffer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (nachrichten().length) {
      <div class="srGroup">Nachrichten</div>
      @for (m of nachrichten(); track m.name; let i = $index) {
        <div class="srItem" [class.hot]="aktiv() === i" (mousedown)="nachricht.emit(m.name)">
          <div class="sl">
            {{ m.name }}
            <span class="srArt">Nachricht</span>
          </div>
          @if (m.doc) {
            <div class="sd">{{ firstLine(m.doc) }}</div>
          }
        </div>
      }
    }
    @if (typen().length) {
      <div class="srGroup">Datentypen</div>
      @for (t of typen(); track t.name; let i = $index) {
        <div
          class="srItem"
          [class.hot]="aktiv() === nachrichten().length + i"
          (mousedown)="typ.emit(t.name)"
        >
          <div class="sl">
            {{ t.label }}
            <span class="srArt">{{ typArt(t.name) }}</span>
          </div>
          @if (t.info) {
            <div class="sd">{{ t.info }}</div>
          }
        </div>
      }
    }
  `,
})
export class SchemaTreffer {
  readonly nachrichten = input.required<ZentralTreffer['nachrichten']>();
  readonly typen = input.required<ZentralTreffer['typen']>();
  /**
   * Die Zeile, die Enter nimmt — flach ueber beide Sektionen gezaehlt; -1,
   * wenn sie ausserhalb liegt (ein Baumtreffer geht vor).
   */
  readonly aktiv = input(-1);

  readonly nachricht = output<string>();
  readonly typ = output<string>();

  /** Art-Kennzeichen eines Datentyp-Treffers. */
  protected typArt(name: string): string {
    return name.startsWith('Code.') ? 'Codeliste' : 'Datentyp';
  }

  protected readonly firstLine = firstLine;
}
