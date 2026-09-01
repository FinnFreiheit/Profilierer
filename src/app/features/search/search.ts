import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { SearchService, ZentralTreffer } from '../../core/services/search.service';
import { NavService } from '../../core/services/nav.service';
import { PersistenceService } from '../../core/services/persistence.service';
import { firstLine } from '../../core/util/pretty.util';
import { KeinAutofillDirective } from '../../shared/kein-autofill.directive';

const LEER: ZentralTreffer = { baum: [], nachrichten: [], typen: [] };

/**
 * **Zentrale Suche** (Werkzeugleiste; aus der Baum-Suche Profilierer.html
 * Z.223/244/712 hervorgegangen): ein Feld fuer drei Fragen — wo steht das im
 * geladenen Baum, welche Nachricht heisst so, welcher Datentyp heisst so.
 * Aktiv, sobald ein Schema geladen ist; ein Baum ist nur fuer die erste
 * Sektion noetig. Enter nimmt den ersten Treffer in der Reihenfolge der
 * Sektionen.
 */
@Component({
  selector: 'app-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search.html',
  imports: [KeinAutofillDirective],
})
export class Search {
  private readonly state = inject(StateService);
  private readonly search = inject(SearchService);
  private readonly nav = inject(NavService);
  private readonly persistence = inject(PersistenceService);

  protected readonly query = signal('');
  protected readonly focused = signal(false);
  /** Gesucht wird gegen das Schema, nicht gegen den Baum — der darf fehlen. */
  protected readonly hasIdx = computed(() => !!this.state.idx());

  protected readonly treffer = computed<ZentralTreffer>(() => {
    const q = this.query();
    return q.trim() ? this.search.runZentral(q) : LEER;
  });

  protected readonly leer = computed(() => {
    const t = this.treffer();
    return !t.baum.length && !t.nachrichten.length && !t.typen.length;
  });

  protected readonly open = computed(() => this.focused() && this.query().trim().length > 0);

  /** Horizontaler Versatz des Panels, damit es nicht rechts aus dem Viewport ragt. */
  protected readonly panelLeft = signal(0);

  protected onInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.query.set(input.value);
    this.updatePanelPos(input);
  }

  protected onFocus(e: FocusEvent): void {
    this.focused.set(true);
    this.updatePanelPos(e.target as HTMLInputElement);
  }

  private updatePanelPos(input: HTMLInputElement): void {
    const rect = input.getBoundingClientRect();
    // Muss zur Panel-Breite in styles.scss passen (#searchPanel: width 460px, max-width 92vw)
    const panelWidth = Math.min(460, window.innerWidth * 0.92);
    const overhang = rect.left + panelWidth - (window.innerWidth - 8);
    this.panelLeft.set(Math.max(8 - rect.left, Math.min(0, -overhang)));
  }

  protected onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      const t = this.treffer();
      if (t.baum[0]) this.pick(t.baum[0].path);
      else if (t.nachrichten[0]) this.waehleNachricht(t.nachrichten[0].name);
      else if (t.typen[0]) void this.oeffneTyp(t.typen[0].name);
    } else if (e.key === 'Escape') {
      this.close();
      (e.target as HTMLInputElement).blur();
    }
  }

  protected pick(path: string): void {
    this.close();
    this.nav.jumpTo(path);
  }

  /** Nachrichten-Treffer verhaelt sich wie der Nachrichtenwaehler (MessagePicker.select). */
  protected waehleNachricht(name: string): void {
    this.close();
    this.nav.loadMessage(name);
    if (!this.state.schemaView()) this.nav.prefillMandatoryStatus();
  }

  /**
   * Datentyp als Baumwurzel oeffnen. Eine offene Profilierung wird dabei
   * geschlossen — der Stand muss vorher geschrieben sein, weil
   * `oeffneTypAnsicht` das Autosave-Ziel (`activeProfileId`) entfernt.
   */
  protected async oeffneTyp(name: string): Promise<void> {
    this.close();
    if (this.state.activeProfileId()) {
      if (
        !confirm(
          `Datentyp ${name} ansehen?\n\nDie offene Profilierung wird geschlossen; ` +
            `ihr Stand ist gesichert und liegt in der Bibliothek.`,
        )
      )
        return;
      await this.persistence.flushAutosave();
    }
    this.nav.oeffneTypAnsicht(name);
  }

  /** Art-Kennzeichen eines Datentyp-Treffers. */
  protected typArt(name: string): string {
    return name.startsWith('Code.') ? 'Codeliste' : 'Datentyp';
  }

  protected close(): void {
    this.focused.set(false);
  }

  protected readonly firstLine = firstLine;
}
