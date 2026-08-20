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
import { TestmessageStoreService } from '../../core/services/testmessage-store.service';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { VergleichService } from '../../core/services/vergleich.service';
import { MatrixService, MatrixQuelle } from '../../core/services/matrix.service';
import { UeberlagerungService } from '../../core/services/ueberlagerung.service';
import { ToastService } from '../../core/services/toast.service';
import { MatrixResult, MatrixZeile } from '../../models/matrix.model';
import { KeinAutofillDirective } from '../../shared/kein-autofill.directive';

/**
 * Die Merkmals-Matrix (#136): alle Testnachrichten eines
 * Kommunikationsszenarios nebeneinander, Zeilen nur dort, wo sie voneinander
 * abweichen.
 *
 * Bei fuenf Auspraegungen waeren es zehn Paarvergleiche, bis man weiss, worin
 * sie sich unterscheiden. Die Matrix beantwortet das auf einen Blick; fuer ein
 * einzelnes Paar bleibt der bestehende Detail-Diff der genauere Weg.
 *
 * Gesteuert vom VergleichService wie die uebrigen Vergleichsansichten; der
 * Einstieg liegt in der Szenario-Zeile der Projektseite.
 */
@Component({
  selector: 'app-matrix-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './matrix-dialog.html',
  imports: [KeinAutofillDirective],
})
export class MatrixDialog {
  private readonly store = inject(TestmessageStoreService);
  private readonly profile = inject(ProfileStoreService);
  private readonly matrix = inject(MatrixService);
  private readonly vergleich = inject(VergleichService);
  private readonly ueberlagerung = inject(UeberlagerungService);
  private readonly toast = inject(ToastService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly laedt = signal(false);
  protected readonly fehler = signal('');
  protected readonly result = signal<MatrixResult | null>(null);
  protected readonly szenarioName = signal('');
  /** Die geladenen Nachrichten — Grundlage des Wechsels in die Ueberlagerung. */
  private readonly quellen = signal<MatrixQuelle[]>([]);

  /**
   * Technische Kopfangaben einblenden. Standardmaessig aus: zwischen gefuehrt
   * erstellten Nachrichten weichen Erstellungszeitpunkt und Nachrichten-UUID
   * **immer** ab und stuenden als Rauschen ganz oben.
   */
  protected readonly zeigeTechnisch = signal(false);

  /** Aufgeklappte Anzahl-Zeilen (Pfad des Listenpfads). */
  private readonly aufgeklappt = signal<string[]>([]);

  /** Textfilter ueber Merkmal und Werte — wie im XML-Vergleich. */
  protected readonly filter = signal('');

  /** Zugeklappte Bereiche. */
  private readonly zu = signal<string[]>([]);

  /**
   * Ab wie vielen Unterschieden die Bereiche zunaechst zugeklappt sind. Bis
   * dahin ist die Liste selbst noch die Uebersicht; darueber ist es die
   * Verteilung auf die Bereiche.
   */
  private static readonly ZUGEKLAPPT_AB = 20;

  /**
   * Die sichtbaren Zeilen: Anzahl-Unterschiede und die Werte gemeinsamer
   * Vorkommen; die Angaben ueberzaehliger Vorkommen erst, wenn ihre Anzahl-
   * Zeile aufgeklappt ist.
   */
  protected readonly zeilen = computed<MatrixZeile[]>(() => {
    const r = this.result();
    if (!r) return [];
    const offen = new Set(this.aufgeklappt());
    const f = this.filter().trim().toLowerCase();
    return r.zeilen.filter(
      (z) =>
        (!z.technisch || this.zeigeTechnisch()) &&
        (!z.unterhalb || offen.has(z.unterhalb)) &&
        (!f || `${z.label} ${z.pfad} ${z.werte.join(' ')}`.toLowerCase().includes(f)),
    );
  });

  /**
   * Die sichtbaren Zeilen nach Bereich gebuendelt — die Gliederung, die die
   * Frage "wo unterscheiden sie sich?" vor der Frage "wie?" beantwortet.
   */
  protected readonly gruppen = computed<{ name: string; zeilen: MatrixZeile[] }[]>(() => {
    const out: { name: string; zeilen: MatrixZeile[] }[] = [];
    for (const z of this.zeilen()) {
      const treffer = out.find((g) => g.name === z.bereich);
      if (treffer) treffer.zeilen.push(z);
      else out.push({ name: z.bereich, zeilen: [z] });
    }
    return out;
  });

  /**
   * Ein Bereich ist offen, wenn er nicht zugeklappt wurde — und bei einem
   * laufenden Filter immer: wer sucht, will die Treffer sehen, nicht erst
   * Gruppen oeffnen.
   */
  protected bereichOffen(name: string): boolean {
    return !!this.filter().trim() || !this.zu().includes(name);
  }

  protected klappeBereich(name: string): void {
    const zu = this.zu();
    this.zu.set(zu.includes(name) ? zu.filter((n) => n !== name) : [...zu, name]);
  }

  /** Anzahl der Zeilen, die hinter einer Anzahl-Zeile eingeklappt liegen. */
  protected verborgen(zeile: MatrixZeile): number {
    if (zeile.art !== 'anzahl') return 0;
    return (this.result()?.zeilen ?? []).filter((z) => z.unterhalb === zeile.pfad).length;
  }

  protected istOffen(zeile: MatrixZeile): boolean {
    return this.aufgeklappt().includes(zeile.pfad);
  }

  protected klappe(zeile: MatrixZeile): void {
    const offen = this.aufgeklappt();
    this.aufgeklappt.set(
      offen.includes(zeile.pfad) ? offen.filter((p) => p !== zeile.pfad) : [...offen, zeile.pfad],
    );
  }

  /** Nur technische Unterschiede — die Nachrichten sind fachlich gleich. */
  protected readonly nurTechnisch = computed(() => {
    const r = this.result();
    return !!r && r.zeilen.length > 0 && r.zeilen.every((z) => z.technisch);
  });

  constructor() {
    effect(() => {
      const ziel = this.vergleich.ziel();
      const el = this.dlg().nativeElement;
      if (ziel?.art === 'matrix') {
        if (!el.open) el.showModal();
        void this.lade(ziel.profilId);
      } else if (el.open) {
        el.close();
      }
    });
  }

  protected schliesse(): void {
    this.vergleich.schliesse();
  }

  /**
   * Dieselbe Frage, andere Darstellung (#147): die geladenen Nachrichten im
   * Baum ueberlagern. Die XMLs liegen hier schon — sie noch einmal zu holen
   * waere ein Rundgang zum Server fuer Daten, die im Dialog stehen.
   */
  protected imBaum(): void {
    const quellen = this.quellen();
    this.vergleich.schliesse();
    try {
      this.ueberlagerung.baue(quellen, this.szenarioName());
    } catch (e) {
      this.toast.showError(e, 'Die Testnachrichten konnten nicht überlagert werden.');
    }
  }

  protected readonly imBaumMoeglich = computed(() => this.quellen().length > 1);

  /**
   * Spalten sind alle Testnachrichten mit dieser `profilId` — sie wurden gegen
   * dieselbe Vorgabe gebaut, ihre Unterschiede sind also echte Auspraegungen.
   * Das XML wird je Nachricht einzeln geladen (der Index traegt es nicht).
   */
  private async lade(profilId: string): Promise<void> {
    this.laedt.set(true);
    this.fehler.set('');
    this.result.set(null);
    this.quellen.set([]);
    this.aufgeklappt.set([]);
    this.zeigeTechnisch.set(false);
    this.filter.set('');
    this.zu.set([]);
    try {
      this.szenarioName.set(
        this.profile.entries().find((p) => p.id === profilId)?.name ?? 'Kommunikationsszenario',
      );
      const eintraege = this.store.entries().filter((e) => e.profilId === profilId);
      if (eintraege.length < 2) {
        this.fehler.set(
          eintraege.length === 1
            ? 'Zu diesem Szenario gibt es erst eine Testnachricht — zum Vergleichen braucht es mindestens zwei.'
            : 'Zu diesem Szenario gibt es noch keine Testnachrichten.',
        );
        return;
      }
      const quellen: MatrixQuelle[] = [];
      for (const e of eintraege) {
        const xml = await this.store.loadXml(e.id);
        if (xml) quellen.push({ id: e.id, name: e.name, xml });
      }
      this.quellen.set(quellen);
      const ergebnis = this.matrix.vergleiche(quellen);
      this.result.set(ergebnis);
      // Bei vielen Unterschieden sind die Gruppen zunaechst zu: die Uebersicht
      // ist dann die Verteilung auf die Bereiche, nicht die Zeilenwueste.
      const sichtbar = ergebnis.bereiche.reduce((n, b) => n + b.n, 0);
      this.zu.set(
        sichtbar > MatrixDialog.ZUGEKLAPPT_AB ? ergebnis.bereiche.map((b) => b.name) : [],
      );
    } catch (e) {
      this.fehler.set(
        'Die Testnachrichten konnten nicht geladen werden: ' +
          (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      this.laedt.set(false);
    }
  }
}
