import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { GuidedService } from '../../core/services/guided.service';
import { UiSettingsService } from '../../core/services/ui-settings.service';
import { ProfileStoreService } from '../../core/services/profile-store.service';

/**
 * Fusszeile (renderLegend, Profilierer.html Z.1458-1466). Seit #80 immer genau
 * eine Zeile hoch: links der Zustandstext (Autosave, Versionsstand — aus der
 * Kopfzone hierher verlagert), rechts die Tastaturhilfe, dazwischen der
 * Aufklapper fuer die Farb- und Tag-Erklaerungen.
 */
@Component({
  selector: 'app-legend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legend.html',
})
export class Legend {
  protected readonly state = inject(StateService);
  private readonly guidedSvc = inject(GuidedService);
  private readonly ui = inject(UiSettingsService);

  protected readonly statuses = this.state.statuses;
  /** Tastatur-Hinweis nur im gefuehrten Profil-Modus (nicht Instanz-Modus). */
  protected readonly guided = computed(
    () => this.state.guided() && !this.state.readOnly() && !this.guidedSvc.instanzModus(),
  );
  /** Gefuehrter Durchlauf einer Nachricht: eigene Farben und Tastenbelegung (ADR 0016). */
  protected readonly durchlauf = computed(
    () => this.state.guided() && !this.state.readOnly() && this.guidedSvc.instanzModus(),
  );

  /** Aufgeklappte Erklaerungen ueberleben den Reload (Workshop-Betrieb). */
  protected readonly offen = this.ui.flagge('legendeOffen', false);

  private readonly store = inject(ProfileStoreService);

  /**
   * Gilt die Telemetrie dem geoeffneten Profil? Im Nachrichten- und
   * Erzeugen-Modus nicht: dort haengt der Versionsstand des zuletzt geoeffneten
   * Profils sonst weiter in der Fusszeile.
   */
  private readonly profilStand = computed(
    () => !this.state.isMessageEdit() && !this.state.isMessageCreate(),
  );

  /**
   * Autosave-/Schreibschutz-Meldung. Gilt seit #105 in **jedem** Modus: auch
   * Testnachrichten werden fortlaufend gesichert (TestmessageAutosaveService),
   * und ohne die Anzeige waere dem stillen Mechanismus nicht anzusehen, ob er
   * laeuft. Dass kein Text eines fremden Modus haengen bleibt, sichern die
   * Einstiege selbst, indem sie das Signal beim Sitzungsbeginn raeumen.
   */
  protected readonly zustand = this.state.autosaveInfo;

  /**
   * Entwurfs-Kennzeichen "geändert seit vX": der Arbeitsstand ist in keiner
   * Version eingefroren. Seit #80 Systemtelemetrie in der Fusszeile statt
   * einer Pille zwischen den Knoepfen der Kopfzone.
   */
  protected readonly versionsStand = computed(() => {
    if (!this.profilStand()) return '';
    const id = this.state.activeProfileId();
    const e = id ? this.store.entries().find((x) => x.id === id) : undefined;
    return e?.geaendert && e.letzteVersionNr ? `geändert seit v${e.letzteVersionNr}` : '';
  });

  protected umschalten(): void {
    this.offen.update((v) => !v);
  }
}
