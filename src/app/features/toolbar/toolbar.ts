import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { NavService } from '../../core/services/nav.service';
import { GuidedService } from '../../core/services/guided.service';
import { ToastService } from '../../core/services/toast.service';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { MessagePicker } from '../message-picker/message-picker';
import { Search } from '../search/search';
import { Menu } from '../../shared/menu/menu';

/**
 * Werkzeugleiste (Profilierer.html Z.211-241). Ansichts-Umschalter binden
 * direkt an die Store-Signals; Dialog-/Export-Aktionen werden als Events
 * gemeldet (Verdrahtung in P4/P7).
 */
@Component({
  selector: 'app-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MessagePicker, Search, Menu],
  templateUrl: './toolbar.html',
})
export class Toolbar {
  protected readonly state = inject(StateService);
  private readonly nav = inject(NavService);
  private readonly guided = inject(GuidedService);
  private readonly toast = inject(ToastService);
  private readonly store = inject(ProfileStoreService);

  readonly metaClick = output<void>();
  readonly statusClick = output<void>();
  readonly versionenClick = output<void>();
  readonly hinweiseClick = output<void>();
  readonly saveClick = output<void>();
  readonly excelClick = output<void>();
  readonly schClick = output<void>();
  readonly xmlClick = output<void>();
  readonly printClick = output<void>();
  readonly saveMessageClick = output<void>();
  readonly saveCreateClick = output<void>();

  protected readonly hasRoot = this.state.hasRoot;
  protected readonly hasIdxB = computed(() => !!this.state.idxB());
  /** Nachrichten-Bearbeitung (geladene Instanz) statt Profil/Szenario. */
  protected readonly isMessage = this.state.isMessageEdit;
  /** Gefuehrte Testnachricht-Erstellung (US "Testnachricht gefuehrt erstellen"). */
  protected readonly isCreate = this.state.isMessageCreate;
  /** Reine Schema-Ansicht (US "Schema ansehen"): nur betrachten und suchen. */
  protected readonly isSchemaView = this.state.schemaView;

  protected readonly fortschrittText = computed(() => {
    // Gefuehrter Modus: verbleibende echte Entscheidungen statt Festlegungs-Summe.
    if (this.state.guided() && this.hasRoot()) {
      const { x, y } = this.guided.fortschritt();
      return `${x} von ${y} entschieden`;
    }
    const { nStatus, nAusp } = this.state.fortschritt();
    return nStatus ? `${nStatus} Festlegungen${nAusp ? ' · ' + nAusp + ' Ausprägungen' : ''}` : '';
  });

  /**
   * Entwurfs-Kennzeichen "geändert seit vX": der Arbeitsstand ist in keiner
   * Version eingefroren. Reaktiv aus dem Bibliotheks-Index — jeder Autosave
   * liefert den frischen Entry (inkl. geaendert-Flag) vom Server zurueck.
   */
  protected readonly versionsStand = computed(() => {
    const id = this.state.activeProfileId();
    const e = id ? this.store.entries().find((x) => x.id === id) : undefined;
    return e?.geaendert && e.letzteVersionNr ? `geändert seit v${e.letzteVersionNr}` : '';
  });

  protected onName(e: Event): void {
    this.state.patchMeta({ name: (e.target as HTMLInputElement).value.trim() });
  }

  protected checked(e: Event): boolean {
    return (e.target as HTMLInputElement).checked;
  }

  protected expand(): void {
    this.nav.expandAllTree();
  }

  protected collapse(): void {
    this.nav.collapseTree();
  }

  /**
   * "nur Werte" umschalten; beim Aktivieren zusätzlich die belegten Äste
   * aufklappen, sonst wirkt der Filter nur in bereits geöffneten Ästen.
   */
  protected toggleOnlyValues(on: boolean): void {
    this.state.onlyValues.set(on);
    if (on) this.state.expandValueBranches();
  }

  protected prefillMandatory(): void {
    const n = this.nav.prefillMandatoryStatus();
    this.toast.show(
      n ? n + ' Pflichtelemente vorbelegt' : 'Keine weiteren Pflichtelemente offen',
    );
  }

  /** Nachrichten-Modus: alle offenen Pflichtwerte typkonform mit Dummys befuellen. */
  protected fillPflicht(): void {
    const n = this.guided.fuellePflichtfelder();
    this.toast.show(
      n
        ? `${n} Pflichtfeld${n === 1 ? '' : 'er'} mit Dummy-Werten befüllt — fachlich prüfen.`
        : 'Keine offenen Pflichtfelder.',
    );
  }
}
