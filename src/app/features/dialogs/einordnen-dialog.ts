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
import { EinordnenService } from '../../core/services/einordnen.service';
import { ToastService } from '../../core/services/toast.service';
import { LibraryEntry } from '../../models/profile.model';
import { TestmessageEntry } from '../../models/testmessage.model';
import { normalisiereTags, tagOptionen, tagsAlsText } from '../../core/util/tags.util';
import { TagEingabe } from '../../shared/tag-eingabe/tag-eingabe';
import { KeinAutofillDirective } from '../../shared/kein-autofill.directive';

/** Auswahlwert des Projektfeldes, der ein neues Projekt meint. */
export const PROJEKT_NEU = '~neu';

/**
 * Der eine Dialog "Einordnen" (#145): wohin gehoert dieser Eintrag?
 *
 * Er beantwortet die Frage einmal statt dreimal — vorher lagen "Einsortieren…"
 * (Projekt/Schlagworte) und "Szenario zuordnen…" (Profilierung) als getrennte
 * Menuepunkte nebeneinander, fuer einen Anwender nicht unterscheidbar.
 *
 * Was hier steht, ist **Ablage**, keine fachliche Aussage: der Fach-Hash laesst
 * Projekt und Schlagworte aussen vor, und die Szenario-Zuordnung setzt nur die
 * Herkunft, keine gebundene Fassung. Deshalb steht der Dialog auch bei
 * freigegebenen Eintraegen offen — anders als "Metadaten bearbeiten…", das den
 * Eintrag benennt und den AG-Schutz traegt.
 */
@Component({
  selector: 'app-einordnen-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './einordnen-dialog.html',
  imports: [TagEingabe, KeinAutofillDirective],
})
export class EinordnenDialog {
  private readonly profile = inject(ProfileStoreService);
  private readonly testmessages = inject(TestmessageStoreService);
  protected readonly projekte = inject(ProjektStoreService);
  private readonly steuerung = inject(EinordnenService);
  private readonly toast = inject(ToastService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly ziel = this.steuerung.ziel;

  /** Der Eintrag, um den es geht — je nach Art aus dem einen oder anderen Store. */
  protected readonly profilEintrag = computed<LibraryEntry | undefined>(() => {
    const z = this.ziel();
    return z?.art === 'profil' ? this.profile.entries().find((e) => e.id === z.id) : undefined;
  });

  protected readonly nachrichtEintrag = computed<TestmessageEntry | undefined>(() => {
    const z = this.ziel();
    return z?.art === 'testnachricht'
      ? this.testmessages.entries().find((e) => e.id === z.id)
      : undefined;
  });

  protected readonly name = computed(
    () => this.profilEintrag()?.name ?? this.nachrichtEintrag()?.name ?? '',
  );

  // ── Eingabefelder ────────────────────────────────────────────────────

  protected readonly projektId = signal('');
  protected readonly neuerName = signal('');
  protected readonly szenarioId = signal('');
  protected readonly tags = signal('');

  protected readonly legtNeuesAn = computed(() => this.projektId() === PROJEKT_NEU);
  protected readonly neu = PROJEKT_NEU;

  /**
   * Erbt die Nachricht ihr Projekt von einer Profilierung? Dann entfaellt das
   * Projektfeld: ein zweiter Pflegeort erzeugte nur Widersprueche. Massgeblich
   * ist das **gewaehlte** Szenario, nicht das gespeicherte — wer hier eine
   * Profilierung waehlt, sieht sofort, dass das Projekt ihr folgt.
   */
  protected readonly erbtVon = computed<string | undefined>(() => {
    if (!this.nachrichtEintrag()) return undefined;
    const gewaehlt = this.szenarioId();
    if (!gewaehlt) return undefined;
    return this.profile.entries().find((p) => p.id === gewaehlt)?.name;
  });

  /** Eine gebundene Fassung friert das Szenario ein — dann ist es nicht waehlbar. */
  protected readonly szenarioGebunden = computed(() => !!this.nachrichtEintrag()?.fassung);

  /** Nachrichtentyp der Testnachricht — Grundlage der Vorauswahl. */
  private readonly nachrichtentyp = computed(() => this.nachrichtEintrag()?.nachricht ?? '');

  protected readonly szenarioSuche = signal('');

  /**
   * Passende Profilierungen zuerst: gleicher Nachrichtentyp, dann gleiches
   * Fachmodul, dann der Rest. Bei zwei Dutzend Profilierungen ist eine
   * unsortierte Liste Sucharbeit.
   */
  protected readonly szenarien = computed<LibraryEntry[]>(() => {
    const typ = this.nachrichtentyp();
    const modul = typ.split('.')[1] ?? '';
    const q = this.szenarioSuche().trim().toLowerCase();
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

  protected passt(e: LibraryEntry): boolean {
    return !!this.nachrichtentyp() && e.nachricht === this.nachrichtentyp();
  }

  protected readonly verfuegbareTags = computed(() =>
    tagOptionen(
      [...this.profile.entries(), ...this.testmessages.entries()],
      (e: { tags?: string[] }) => e.tags,
    ),
  );

  constructor() {
    effect(() => {
      const z = this.steuerung.ziel();
      const el = this.dlg().nativeElement;
      if (!z) {
        if (el.open) el.close();
        return;
      }
      const eintrag = this.profilEintrag() ?? this.nachrichtEintrag();
      this.projektId.set(eintrag?.projektId ?? '');
      this.neuerName.set('');
      this.szenarioSuche.set('');
      this.szenarioId.set(this.nachrichtEintrag()?.profilId ?? '');
      this.tags.set(tagsAlsText(eintrag?.tags));
      if (!el.open) el.showModal();
    });
  }

  protected schliesse(): void {
    this.steuerung.schliesse();
  }

  protected waehleSzenario(id: string): void {
    this.szenarioId.set(this.szenarioId() === id ? '' : id);
  }

  /**
   * Uebernehmen: ggf. das neue Projekt anlegen, dann Szenario und Ablage
   * schreiben. Reihenfolge zaehlt — erst das Szenario, denn eine gebundene
   * Nachricht erbt danach ihr Projekt von der Profilierung.
   */
  protected async uebernimm(): Promise<void> {
    const z = this.ziel();
    const nachricht = this.nachrichtEintrag();
    const erbt = !!this.erbtVon();
    this.schliesse();
    if (!z) return;
    try {
      let projektId: string | null | undefined = this.projektId() || null;
      if (projektId === PROJEKT_NEU) {
        const name = this.neuerName().trim();
        projektId = name ? await this.projekte.create({ name }) : null;
      }
      const tags = normalisiereTags(this.tags());

      if (z.art === 'profil') {
        await this.profile.einsortieren(z.id, { projektId, tags });
      } else {
        // Szenario nur schreiben, wenn es sich geaendert hat und nicht gebunden
        // ist — sonst wiese der Server die Nachricht mit 409 ab.
        if (!this.szenarioGebunden() && (this.szenarioId() || '') !== (nachricht?.profilId ?? ''))
          await this.testmessages.zuordnen(z.id, this.szenarioId() || null);
        // Bei geerbtem Projekt keine eigene Zuordnung mitschicken.
        await this.testmessages.einsortieren(z.id, {
          projektId: erbt ? undefined : projektId,
          tags,
        });
      }
      await this.projekte.refresh();
    } catch (err) {
      this.toast.showError(err, 'Einordnen fehlgeschlagen.');
    }
  }
}
