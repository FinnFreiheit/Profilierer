import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { SearchService } from '../../core/services/search.service';
import { NavService } from '../../core/services/nav.service';
import { PersistenceService } from '../../core/services/persistence.service';
import { firstLine } from '../../core/util/pretty.util';
import { KeinAutofillDirective } from '../../shared/kein-autofill.directive';

/** Ein Treffer der Dashboard-Suche, flach ueber beide Sektionen — fuer ↑/↓. */
interface SchemaTreffer {
  art: 'nachricht' | 'typ';
  /** Technischer Name; das, was `loadMessage` bzw. `oeffneTypAnsicht` bekommt. */
  name: string;
  info: string;
}

/**
 * **Schema-Suche auf dem Dashboard**: Nachricht oder Datentyp nachschlagen,
 * ohne vorher in die Baumansicht zu wechseln. Rankt und filtert nicht selbst —
 * das macht `SearchService.runZentral`, dasselbe wie in der Werkzeugleiste; die
 * Sektion „Im Baum" faellt hier weg, weil auf dem Dashboard kein Baum steht.
 *
 * Bewusst eine eigene, schlanke Komponente statt eines Schalters an der
 * Werkzeugleisten-Suche: Panel-Positionierung (dort am Eingabefeld ausgerichtet),
 * Trefferdarstellung und Treffer-Verhalten (hier immer Schema-Ansicht) sind
 * verschieden — geteilt wird die Logik im Dienst, nicht die Huelle.
 */
@Component({
  selector: 'app-schema-suche',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './schema-suche.html',
  imports: [KeinAutofillDirective],
})
export class SchemaSuche {
  private readonly state = inject(StateService);
  private readonly search = inject(SearchService);
  private readonly nav = inject(NavService);
  private readonly persistence = inject(PersistenceService);

  protected readonly query = signal('');
  protected readonly focused = signal(false);
  /** Zeilenauswahl der Tastaturbedienung, flach ueber beide Sektionen. */
  protected readonly aktiv = signal(0);

  /** Das hinterlegte 3.6.2 laedt beim Start; bis dahin gibt es nichts zu durchsuchen. */
  protected readonly hasIdx = computed(() => !!this.state.idx());

  /** `baum` bleibt hier ohne Wurzel leer und wird gar nicht erst gezeigt. */
  private readonly treffer = computed(() => this.search.runZentral(this.query()));

  protected readonly nachrichten = computed(() => this.treffer().nachrichten);
  protected readonly typen = computed(() => this.treffer().typen);

  /** Beide Sektionen hintereinander — die Reihenfolge, der ↑/↓ und Enter folgen. */
  protected readonly alle = computed<SchemaTreffer[]>(() => [
    ...this.nachrichten().map((m) => ({ art: 'nachricht' as const, name: m.name, info: m.doc })),
    ...this.typen().map((t) => ({ art: 'typ' as const, name: t.name, info: t.info })),
  ]);

  protected readonly open = computed(() => this.focused() && this.query().trim().length > 0);

  /** Ist die Zeile die, die Enter nimmt? `versatz` ist der Beginn der Sektion. */
  protected istAktiv(versatz: number, i: number): boolean {
    return this.aktiv() === versatz + i;
  }

  protected onInput(e: Event): void {
    this.query.set((e.target as HTMLInputElement).value);
    this.aktiv.set(0);
  }

  protected onKeydown(e: KeyboardEvent): void {
    const n = this.alle().length;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      this.aktiv.set(Math.min(this.aktiv() + 1, n - 1));
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      this.aktiv.set(Math.max(this.aktiv() - 1, 0));
    } else if (e.key === 'Enter') {
      const t = this.alle()[this.aktiv()];
      if (t) void this.oeffne(t.art, t.name);
    } else if (e.key === 'Escape') {
      this.close();
      (e.target as HTMLInputElement).blur();
    }
  }

  /**
   * Beide Wege enden in der reinen Schema-Ansicht — vom Dashboard aus wird
   * nichts profiliert. Vorher wird der Stand einer noch aktiven Profilierung
   * geschrieben: die Uebersicht laesst `activeProfileId` stehen (app.ts
   * `zurUebersicht`), und beide Ziele raeumen es weg. Ein `confirm` braucht es
   * dabei nicht — wie beim Oeffnen aus der Bibliothek geht nichts verloren,
   * der Stand liegt danach dort.
   */
  protected async oeffne(art: SchemaTreffer['art'], name: string): Promise<void> {
    this.close();
    if (this.state.activeProfileId()) await this.persistence.flushAutosave();
    if (art === 'typ') {
      this.nav.oeffneTypAnsicht(name);
      return;
    }
    // Reihenfolge: erst die Ansicht aufmachen, dann laden — loadMessage haelt
    // eine bestehende Schema-Ansicht, legt aber selbst keine an.
    this.nav.openSchemaView();
    this.nav.loadMessage(name);
  }

  protected typArt(name: string): string {
    return name.startsWith('Code.') ? 'Codeliste' : 'Datentyp';
  }

  protected close(): void {
    this.focused.set(false);
  }

  protected readonly firstLine = firstLine;
}
