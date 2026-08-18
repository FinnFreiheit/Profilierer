import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { PersistenceService } from '../../core/services/persistence.service';
import { ToastService } from '../../core/services/toast.service';
import { MessageRef } from '../../models/xsd-index.model';
import { firstLine } from '../../core/util/pretty.util';
import { nachFachmodul } from '../../core/util/fachmodul.util';
import { KeinAutofillDirective } from '../../shared/kein-autofill.directive';

/** Browser-Storage-Schluessel des zuletzt genannten Autors (Vorbelegung). */
export const AUTOR_STORAGE = 'xjp.autor';

/** Die drei Schritte des Anlege-Durchlaufs. */
type Schritt = 'version' | 'nachricht' | 'angaben';

/** Nachrichten einer Fachmodul-Gruppe (wie im MessagePicker). */
interface MsgGroup {
  modul: string;
  dateien: string;
  messages: MessageRef[];
}

/**
 * Wizard „Neue Profilierung": vor dem Anlegen wird beantwortet, worauf sich das
 * Kommunikationsszenario bezieht — **XJustiz-Version**, **Nachricht**, dann die
 * Angaben zur Profilierung (Titel, Autor, optional Beschreibung).
 *
 * Vorher startete `createNew()` in einen leeren Editor, in dem die Nachricht
 * ueber die Werkzeugleiste zu waehlen war und die Profil-Details nachtraeglich
 * ueber den Meta-Dialog kamen — die Bibliothek fuellte sich mit namenlosen
 * Eintraegen ohne Nachrichtenbezug. Der Eintrag entsteht deshalb erst am Ende:
 * ein abgebrochener Durchlauf hinterlaesst nichts.
 *
 * Die Versionswahl laedt das Schema sofort (`PersistenceService.loadBundle`) —
 * die Nachrichtenliste des zweiten Schritts ist der Index genau dieser Version.
 */
@Component({
  selector: 'app-neues-profil-wizard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './neues-profil-wizard.html',
  imports: [KeinAutofillDirective],
})
export class NeuesProfilWizard {
  private readonly state = inject(StateService);
  private readonly persistence = inject(PersistenceService);
  private readonly toast = inject(ToastService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly schritt = signal<Schritt>('version');
  /** Laufende Schemaladung (Schritt 1 → 2) — sperrt die Knoepfe. */
  protected readonly laedt = signal(false);

  /** Gewaehlte Datenbasis (Schluessel ist `dir`, wie im Versions-Umschalter). */
  protected readonly verDir = signal<string | null>(null);
  protected readonly nachricht = signal<string | null>(null);
  protected readonly filter = signal('');
  protected readonly titel = signal('');
  protected readonly autor = signal('');
  protected readonly beschreibung = signal('');

  protected readonly versionen = this.state.bundledVersions;

  /** Beschriftung der gewaehlten Version fuer die Kopfzeile der Folgeschritte. */
  protected readonly verLabel = computed(() => {
    const v = this.versionen().find((x) => x.dir === this.verDir());
    return v ? v.label : this.state.version();
  });

  /** Nachrichten der geladenen Version, nach Fachmodul gruppiert und gefiltert. */
  protected readonly groups = computed<MsgGroup[]>(() => {
    const idx = this.state.idx();
    if (!idx) return [];
    const f = this.filter().trim().toLowerCase();
    const treffer = idx.messages.filter(
      (m) => !f || m.name.toLowerCase().includes(f) || m.doc.toLowerCase().includes(f),
    );
    return nachFachmodul(treffer, (m) => m.name).map((g) => ({
      modul: g.modul,
      dateien: [...new Set(g.items.map((m) => m.file))].sort().join(' · '),
      messages: g.items,
    }));
  });

  /** Titel und Autor sind Pflicht — ohne sie ist der Eintrag nicht zuzuordnen. */
  protected readonly angabenOk = computed(() => !!this.titel().trim() && !!this.autor().trim());

  /** Ohne Manifest (Schemata nicht ladbar) faellt Schritt 1 auf das Geladene zurueck. */
  protected readonly weiterOk = computed(() => !!this.verDir() || !!this.state.idx());

  open(): void {
    this.schritt.set('version');
    this.laedt.set(false);
    this.filter.set('');
    this.nachricht.set(null);
    this.titel.set('');
    this.beschreibung.set('');
    this.autor.set(localStorage.getItem(AUTOR_STORAGE) ?? '');
    const vs = this.versionen();
    const aktiv = this.state.activeBundle();
    const vor = vs.find((v) => v.dir === aktiv) ?? vs.find((v) => v.default) ?? vs[0];
    this.verDir.set(vor?.dir ?? null);
    this.dlg().nativeElement.showModal();
  }

  protected modulTitel(modul: string): string {
    return modul || 'weitere Nachrichten';
  }

  /**
   * Schritt 1 → 2: die gewaehlte Version wird zur Datenbasis. Ist sie bereits
   * geladen, kostet der Schritt nichts; sonst wird sie hier geholt, damit die
   * Nachrichtenliste die dieser Version ist.
   */
  protected async weiterZuNachricht(): Promise<void> {
    const dir = this.verDir();
    const v = this.versionen().find((x) => x.dir === dir);
    if (v && this.state.activeBundle() !== dir) {
      this.laedt.set(true);
      try {
        await this.persistence.loadBundle(v);
      } catch (e) {
        this.toast.showError(e, `XJustiz ${v.label} konnte nicht geladen werden.`);
        this.laedt.set(false);
        return;
      }
      this.laedt.set(false);
    }
    if (!this.state.idx()) {
      this.toast.show('Kein Schema geladen — die Nachrichtenauswahl bleibt leer.');
      return;
    }
    this.nachricht.set(null);
    this.filter.set('');
    this.schritt.set('nachricht');
  }

  protected waehleNachricht(name: string): void {
    this.nachricht.set(name);
    this.schritt.set('angaben');
  }

  protected zurueck(ziel: Schritt): void {
    this.schritt.set(ziel);
  }

  protected onFilter(e: Event): void {
    this.filter.set((e.target as HTMLInputElement).value);
  }

  protected abbrechen(): void {
    this.dlg().nativeElement.close();
  }

  /**
   * Abschluss: erst hier entsteht der Bibliothekseintrag — mit Nachricht,
   * Version und Angaben, sodass die Kachel von Anfang an vollstaendig ist.
   */
  protected async anlegen(): Promise<void> {
    const nachricht = this.nachricht();
    if (!nachricht || !this.angabenOk()) return;
    const autor = this.autor().trim();
    localStorage.setItem(AUTOR_STORAGE, autor);
    this.dlg().nativeElement.close();
    await this.persistence.createNew({
      nachricht,
      name: this.titel().trim(),
      autor,
      beschreibung: this.beschreibung().trim() || undefined,
    });
  }

  protected readonly firstLine = firstLine;
}
