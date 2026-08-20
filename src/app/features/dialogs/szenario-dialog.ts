import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { TestmessageStoreService } from '../../core/services/testmessage-store.service';
import { ProjektStoreService } from '../../core/services/projekt-store.service';
import { SzenarioZuordnenService } from '../../core/services/szenario-zuordnen.service';
import { ToastService } from '../../core/services/toast.service';
import { LibraryEntry } from '../../models/profile.model';
import { KeinAutofillDirective } from '../../shared/kein-autofill.directive';

/**
 * "Szenario zuordnen" (#141): eine hochgeladene Testnachricht nachtraeglich der
 * Profilierung zuordnen, zu der sie fachlich laengst gehoert.
 *
 * Gesetzt wird nur die **Herkunft**, nicht die eingefrorene Vorgabe — eine
 * hochgeladene Nachricht ist nicht gegen eine Fassung entstanden, und das im
 * Nachhinein zu behaupten waere eine falsche Aussage (der Dialog sagt das auch).
 * Wer die Einhaltung pruefen will, nimmt "Gegen Profilierung pruefen".
 *
 * Vorgeschlagen wird zuerst, was zum Nachrichtentyp passt: bei einem Bestand
 * von zwei Dutzend Profilierungen ist die Auswahl sonst Sucharbeit.
 */
@Component({
  selector: 'app-szenario-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './szenario-dialog.html',
  imports: [KeinAutofillDirective],
})
export class SzenarioDialog {
  private readonly profile = inject(ProfileStoreService);
  private readonly store = inject(TestmessageStoreService);
  private readonly projekte = inject(ProjektStoreService);
  private readonly steuerung = inject(SzenarioZuordnenService);
  private readonly toast = inject(ToastService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly eintrag = this.steuerung.ziel;
  protected readonly gewaehlt = signal('');
  protected readonly suche = signal('');

  /** Nachrichtentyp der Testnachricht — Grundlage der Vorauswahl. */
  private readonly nachrichtentyp = computed(() => this.eintrag()?.nachricht ?? '');

  /**
   * Passende Profilierungen zuerst: gleicher Nachrichtentyp ganz oben, danach
   * gleiches Fachmodul, dann der Rest. Innerhalb jeder Gruppe alphabetisch.
   */
  protected readonly kandidaten = computed<LibraryEntry[]>(() => {
    const typ = this.nachrichtentyp();
    const modul = typ.split('.')[1] ?? '';
    const q = this.suche().trim().toLowerCase();
    const rang = (e: LibraryEntry): number => {
      if (typ && e.nachricht === typ) return 0;
      if (modul && (e.nachricht ?? '').split('.')[1] === modul) return 1;
      return 2;
    };
    return this.profile
      .entries()
      .filter(
        (e) =>
          !q ||
          [e.name, e.nachricht, e.beschreibung].some((v) => (v || '').toLowerCase().includes(q)),
      )
      .sort((a, b) => rang(a) - rang(b) || a.name.localeCompare(b.name, 'de'));
  });

  /** Gibt es Profilierungen mit genau diesem Nachrichtentyp? */
  protected readonly passendeVorhanden = computed(() =>
    this.kandidaten().some((e) => e.nachricht === this.nachrichtentyp()),
  );

  protected passt(e: LibraryEntry): boolean {
    return !!this.nachrichtentyp() && e.nachricht === this.nachrichtentyp();
  }

  /** Projekt, in das die Nachricht durch die Zuordnung wandert. */
  protected projektVon(e: LibraryEntry): string | undefined {
    return this.projekte.name(e.projektId);
  }

  constructor() {
    effect(() => {
      const ziel = this.steuerung.ziel();
      const el = this.dlg().nativeElement;
      if (ziel) {
        this.gewaehlt.set(ziel.profilId ?? '');
        this.suche.set('');
        if (!el.open) el.showModal();
      } else if (el.open) {
        el.close();
      }
    });
  }

  protected schliesse(): void {
    this.steuerung.schliesse();
  }

  protected waehle(id: string): void {
    this.gewaehlt.set(this.gewaehlt() === id ? '' : id);
  }

  protected async uebernimm(): Promise<void> {
    const eintrag = this.eintrag();
    const ziel = this.gewaehlt() || null;
    this.schliesse();
    if (!eintrag) return;
    try {
      await this.store.zuordnen(eintrag.id, ziel);
      // Die Nachricht erbt das Projekt ihrer neuen Profilierung — die
      // abgeleiteten Projekt-Zahlen stimmen sonst nicht mehr.
      await this.projekte.refresh();
      this.toast.show(
        ziel
          ? `„${eintrag.name}" gehört jetzt zu „${this.profile.entries().find((p) => p.id === ziel)?.name ?? 'der Profilierung'}".`
          : `Zuordnung von „${eintrag.name}" aufgehoben.`,
      );
    } catch (err) {
      this.toast.showError(err, 'Zuordnung fehlgeschlagen.');
    }
  }
}
