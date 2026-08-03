import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { NavService } from '../../core/services/nav.service';
import { DispositionService } from '../../core/services/disposition.service';
import { GuidedService } from '../../core/services/guided.service';
import { ToastService } from '../../core/services/toast.service';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { HinweisStoreService } from '../../core/services/hinweis-store.service';
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
  private readonly disposition = inject(DispositionService);
  private readonly guided = inject(GuidedService);
  private readonly toast = inject(ToastService);
  private readonly store = inject(ProfileStoreService);
  protected readonly hinweise = inject(HinweisStoreService);

  readonly metaClick = output<void>();
  readonly statusClick = output<void>();
  readonly versionenClick = output<void>();
  /** Abnahme-Badge: zeigt den Vergleich zur abgenommenen Fassung. */
  readonly abnahmeDiffClick = output<void>();
  readonly hinweiseClick = output<void>();
  readonly saveClick = output<void>();
  readonly excelClick = output<void>();
  readonly schClick = output<void>();
  readonly xmlClick = output<void>();
  readonly printClick = output<void>();
  readonly saveMessageClick = output<void>();
  readonly updateMessageClick = output<void>();
  /** Profilbindung der geoeffneten Nachricht bewusst loesen (#32). */
  readonly bindungLoesenClick = output<void>();
  readonly saveCreateClick = output<void>();
  /** Serie fortsetzen; true = als Kopie der eben gespeicherten Nachricht. */
  readonly weitereTestnachrichtClick = output<boolean>();

  protected readonly hasRoot = this.state.hasRoot;
  protected readonly hasIdxB = computed(() => !!this.state.idxB());
  /** Nachrichten-Bearbeitung (geladene Instanz) statt Profil/Szenario. */
  protected readonly isMessage = this.state.isMessageEdit;
  /** Gefuehrte Testnachricht-Erstellung (US "Testnachricht gefuehrt erstellen"). */
  protected readonly isCreate = this.state.isMessageCreate;
  /** Reine Schema-Ansicht (US "Schema ansehen"): nur betrachten und suchen. */
  protected readonly isSchemaView = this.state.schemaView;
  /**
   * Die geoeffnete Nachricht stammt aus dem Testdaten-Speicher — nur dann laesst
   * sie sich in denselben Eintrag zurueckschreiben. Datei-Upload und Drop haben
   * keine id und kennen weiterhin nur "als neue Nachricht speichern".
   */
  protected readonly hatEintrag = computed(() => !!this.state.messageEdit()?.entryId);

  /**
   * Gebundene Nachricht in der Bearbeitung: die eingefrorene Profilkopie liegt
   * im Durchlauf (#32) — nur dann gibt es etwas zu loesen.
   */
  protected readonly bindungLoesbar = computed(
    () => this.hatEintrag() && this.state.hatVorgabe() && !this.state.abnahmeSchreibschutz(),
  );

  /**
   * "Weitere Testnachricht zu diesem Profil" (Serienerstellung): erst nach dem
   * Speichern und nur im profilgebundenen Durchlauf — ohne Bindung gaebe es
   * keine Fassung, an die die naechste Nachricht gebunden waere, und ohne
   * gespeicherten Eintrag nichts, wovon eine Kopie ausginge.
   */
  protected readonly serieMoeglich = computed(() => {
    const s = this.state.messageCreate();
    return !!s?.profilId && !!s.entryId;
  });

  /**
   * Abnahme-Badge im Editor-Kopf: Kennzeichen des geoeffneten Bibliotheks-
   * eintrags, Warnvariante bei "geaendert seit Abnahme" (der Entry wird nach
   * jedem Autosave vom Server aktualisiert).
   */
  protected readonly abnahme = computed(() => {
    const id = this.state.activeProfileId();
    if (!id) return null;
    const e = this.store.entries().find((x) => x.id === id);
    if (!e?.abgenommen) return null;
    return { warn: !!e.geaendertSeitAbnahme, kommentar: e.abnahmeKommentar };
  });

  protected readonly fortschrittText = computed(() => {
    // Gefuehrter Modus: verbleibende echte Entscheidungen statt Festlegungs-Summe.
    if (this.state.guided() && this.hasRoot()) {
      // Drei getrennte Zahlen (Issue #41): Restarbeit und Klaerungsbedarf sind
      // zweierlei — geparkte Punkte zaehlen zu keiner der beiden Mengen.
      const { x, y, zuKlaeren } = this.guided.fortschritt();
      // Im Durchlauf einer Nachricht zaehlen nur die geschuldeten Angaben
      // (ADR 0016) — "entschieden" waere dort das falsche Wort: Uebergangenes
      // ist keine Entscheidung.
      if (this.guided.instanzModus()) return `${x} von ${y} Pflichtangaben`;
      const offen = y - x - zuKlaeren;
      return zuKlaeren
        ? `${x} von ${y} entschieden · ${offen} offen · ${zuKlaeren} zu klären`
        : `${x} von ${y} entschieden`;
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

  /**
   * "Pflicht vorbelegen" (Ansicht-Menue): vertiefter Lauf inkl.
   * Bestandsreparatur — steigt auch in aufgenommene Teilbaeume und
   * Auspraegungen ab (DispositionService).
   */
  protected prefillMandatory(): void {
    const n = this.disposition.pflichtVorbelegen();
    this.toast.show(n ? n + ' Pflichtelemente vorbelegt' : 'Keine weiteren Pflichtelemente offen');
  }

  /**
   * Betrachten <-> Bearbeiten der geladenen Nachricht. Im Bearbeitungsmodus
   * faellt "nur Werte" weg — der Hinweis erklaert den sonst ueberraschenden
   * Sprung von der schlanken Nachricht auf den vollen Standard.
   */
  protected setModus(bearbeiten: boolean): void {
    if (bearbeiten === !this.state.readOnly()) return;
    this.state.nachrichtBearbeiten(bearbeiten);
    if (bearbeiten)
      this.toast.show(
        'Bearbeiten — es wird der volle Standard gezeigt; leere Elemente lassen sich jetzt befüllen.',
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
