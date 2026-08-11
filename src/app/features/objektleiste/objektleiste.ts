import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { DispositionService } from '../../core/services/disposition.service';
import { GuidedService } from '../../core/services/guided.service';
import { ToastService } from '../../core/services/toast.service';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { HinweisStoreService } from '../../core/services/hinweis-store.service';
import { Menu } from '../../shared/menu/menu';
import { RolleBadge } from '../../shared/rolle-badge/rolle-badge';
import { ERW_SPERRE_GRUND } from '../../core/util/erweiterung-sperre';
import { KeinAutofillDirective } from '../../shared/kein-autofill.directive';

/**
 * Zeile 1 der Kopfzone: das Dokument (Issue #80). Feste Zonen, wechselnder
 * Inhalt — die Primaeraktion sitzt in jedem Modus an derselben Stelle, damit
 * der Moduswechsel die Knoepfe nicht wandern laesst.
 *
 * `Laden` und `Speichern` desselben Objekts liegen hier zusammen; die
 * Schema-/Codelisten-Quellen sind in die Werkzeugleiste gezogen (Datenbasis).
 */
@Component({
  selector: 'app-objektleiste',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Menu, RolleBadge, KeinAutofillDirective],
  templateUrl: './objektleiste.html',
})
export class Objektleiste {
  protected readonly state = inject(StateService);
  private readonly disposition = inject(DispositionService);
  private readonly guided = inject(GuidedService);
  private readonly toast = inject(ToastService);
  private readonly store = inject(ProfileStoreService);
  protected readonly hinweise = inject(HinweisStoreService);

  /** Zurueck zur Dashboard-Uebersicht. */
  readonly homeClick = output<void>();
  readonly profileFile = output<File>();
  readonly instanceFile = output<File>();
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
  /** Link auf die offene Profilierung in die Zwischenablage legen. */
  readonly teilenClick = output<void>();
  /** Link auf die offene Testnachricht in die Zwischenablage legen. */
  readonly teilenNachrichtClick = output<void>();
  readonly saveMessageClick = output<void>();
  readonly updateMessageClick = output<void>();
  /** Profilbindung der geoeffneten Nachricht bewusst loesen (#32). */
  readonly bindungLoesenClick = output<void>();
  readonly saveCreateClick = output<void>();
  /** Serie fortsetzen; true = als Kopie der eben gespeicherten Nachricht. */
  readonly weitereTestnachrichtClick = output<boolean>();

  protected readonly hasRoot = this.state.hasRoot;
  /**
   * Begruendung der Schematron-Sperre (#98). Der Knopf bleibt sichtbar und
   * gesperrt — Excel, Beispiel-XML und Druck daneben bleiben frei.
   */
  protected readonly erwGrund = ERW_SPERRE_GRUND;
  protected readonly isMessage = this.state.isMessageEdit;
  protected readonly isCreate = this.state.isMessageCreate;
  protected readonly isSchemaView = this.state.schemaView;

  /** Profil-Modus im engeren Sinn: eine Profilierung wird bearbeitet. */
  protected readonly isProfil = computed(
    () => !this.isMessage() && !this.isCreate() && !this.isSchemaView(),
  );

  /**
   * Die geoeffnete Nachricht stammt aus dem Testdaten-Speicher — nur dann laesst
   * sie sich in denselben Eintrag zurueckschreiben.
   */
  protected readonly hatEintrag = computed(() => !!this.state.messageEdit()?.entryId);

  /** Gebundene Nachricht in der Bearbeitung: nur dann gibt es etwas zu loesen (#32). */
  protected readonly bindungLoesbar = computed(
    () => this.hatEintrag() && this.state.hatVorgabe() && !this.state.abnahmeSchreibschutz(),
  );

  /** Serienerstellung: erst nach dem Speichern und nur im profilgebundenen Durchlauf. */
  protected readonly serieMoeglich = computed(() => {
    const s = this.state.messageCreate();
    return !!s?.profilId && !!s.entryId;
  });

  /** Name des bearbeiteten Objekts in der Identitaets-Zone (statt des Szenario-Feldes). */
  protected readonly objektName = computed(() => {
    if (this.isCreate()) return this.state.messageCreate()?.name || 'Neue Testnachricht';
    if (this.isMessage()) return this.state.messageEdit()?.quellName || 'Testnachricht';
    return '';
  });

  /**
   * Abnahme-Badge: Kennzeichen des geoeffneten Bibliothekseintrags,
   * Warnvariante bei "geaendert seit Abnahme".
   */
  protected readonly abnahme = computed(() => {
    const id = this.state.activeProfileId();
    if (!id) return null;
    const e = this.store.entries().find((x) => x.id === id);
    if (!e?.abgenommen) return null;
    return { warn: !!e.geaendertSeitAbnahme, kommentar: e.abnahmeKommentar };
  });

  /**
   * Beschriftung der Primaeraktion. Der Knopf steht in jedem Modus an
   * derselben Stelle; nur sein Text und sein Ziel wechseln.
   */
  protected readonly primaerLabel = computed(() => {
    if (this.isCreate() || (this.isMessage() && this.hatEintrag())) return 'Speichern';
    if (this.isMessage()) return 'Als Nachricht speichern';
    if (this.isProfil() && !this.state.readOnly()) return 'Speichern';
    return 'Drucken';
  });

  protected readonly primaerTitel = computed(() => {
    if (this.state.abnahmeSchreibschutz() && this.primaerLabel() === 'Speichern')
      return 'Von der BLK-AG abgenommen — Speichern nur mit AG-Schlüssel';
    if (this.isCreate())
      return 'Stand im Testdaten-Speicher sichern — unvollständige Nachrichten werden als Entwurf gekennzeichnet';
    if (this.isMessage() && this.hatEintrag())
      return 'Änderungen in denselben Testdaten-Eintrag zurückschreiben';
    if (this.isMessage())
      return 'Die (bearbeitete) Nachricht als neue Testnachricht im Testdaten-Speicher ablegen';
    return '';
  });

  protected readonly primaerGesperrt = computed(
    () =>
      !this.hasRoot() ||
      (this.state.abnahmeSchreibschutz() &&
        this.primaerLabel() === 'Speichern' &&
        this.hatEintrag()),
  );

  /** Beschriftung des Ueberlauf-/Weiteres-Menues. */
  protected readonly weiteresLabel = computed(() => (this.isProfil() ? 'Profil' : 'Mehr'));

  protected pick(input: HTMLInputElement): void {
    input.click();
  }

  protected onProfile(e: Event): void {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) this.profileFile.emit(f);
    input.value = '';
  }

  protected onInstance(e: Event): void {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) this.instanceFile.emit(f);
    input.value = '';
  }

  protected onName(e: Event): void {
    this.state.patchMeta({ name: (e.target as HTMLInputElement).value.trim() });
  }

  /** Die Primaeraktion loest je nach Modus einen anderen Ausgang aus. */
  protected primaer(): void {
    if (this.isCreate()) return this.saveCreateClick.emit();
    if (this.isMessage())
      return this.hatEintrag() ? this.updateMessageClick.emit() : this.saveMessageClick.emit();
    if (this.isProfil() && !this.state.readOnly()) return this.saveClick.emit();
    this.printClick.emit();
  }

  /**
   * "Pflicht vorbelegen": vertiefter Lauf inkl. Bestandsreparatur. Seit #80
   * eine Objekt-Werkzeug-Aktion statt eines Eintrags im Ansichtsmenue — sie
   * aendert das Profil, sie stellt nichts anders dar.
   */
  protected prefillMandatory(): void {
    const n = this.disposition.pflichtVorbelegen();
    this.toast.show(n ? n + ' Pflichtelemente vorbelegt' : 'Keine weiteren Pflichtelemente offen');
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
