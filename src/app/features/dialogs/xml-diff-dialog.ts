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
import { ToastService } from '../../core/services/toast.service';
import { TestmessageStoreService } from '../../core/services/testmessage-store.service';
import { XmlDiffService } from '../../core/services/xml-diff.service';
import { VergleichService } from '../../core/services/vergleich.service';
import { XmlDiffEintrag, XmlDiffResult } from '../../models/xml-diff.model';
import { DIFF_FARBEN, DIFF_SYM } from '../../core/util/diff-anzeige.util';
import { KeinAutofillDirective } from '../../shared/kein-autofill.directive';

/** Zeilen-Deckel wie in den anderen Vergleichsansichten. */
const MAX_ZEILEN = 800;

/**
 * Zeigt, was sich an einer abgenommenen Testnachricht gegenueber der
 * eingefrorenen Abnahme-Fassung geaendert hat. Verglichen wird die Struktur,
 * nicht der Text (ADR 0013) — angezeigt werden also Felder mit alt/neu statt
 * Zeilen-Hunks.
 *
 * Gesteuert vom VergleichService; Einstiege liegen im Testdaten-Bereich.
 */
@Component({
  selector: 'app-xml-diff-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './xml-diff-dialog.html',
  imports: [KeinAutofillDirective],
})
export class XmlDiffDialog {
  private readonly store = inject(TestmessageStoreService);
  private readonly diff = inject(XmlDiffService);
  private readonly toast = inject(ToastService);
  private readonly vergleich = inject(VergleichService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly farben = DIFF_FARBEN;
  protected readonly sym = DIFF_SYM;

  protected readonly laedt = signal(false);
  protected readonly fehler = signal('');
  protected readonly result = signal<XmlDiffResult | null>(null);
  protected readonly nachrichtName = signal('');
  protected readonly abnahmeDatum = signal('');
  protected readonly filter = signal('');

  private readonly gefiltert = computed(() => {
    const r = this.result();
    if (!r) return [];
    const f = this.filter().trim().toLowerCase();
    return f
      ? r.eintraege.filter((e) =>
          `${e.pfad} ${e.attribut ?? ''} ${e.vorher ?? ''} ${e.nachher ?? ''}`
            .toLowerCase()
            .includes(f),
        )
      : r.eintraege;
  });

  protected readonly zeilen = computed(() => this.gefiltert().slice(0, MAX_ZEILEN));
  protected readonly weitere = computed(() => Math.max(0, this.gefiltert().length - MAX_ZEILEN));

  constructor() {
    effect(() => {
      const ziel = this.vergleich.ziel();
      const el = this.dlg().nativeElement;
      if (ziel?.art === 'xml') {
        if (!el.open) el.showModal();
        void this.lade(ziel.testmessageId);
      } else if (el.open) {
        el.close();
      }
    });
  }

  protected schliesse(): void {
    this.vergleich.schliesse();
  }

  private async lade(id: string): Promise<void> {
    this.laedt.set(true);
    this.fehler.set('');
    this.filter.set('');
    this.result.set(null);
    try {
      const eintrag = this.store.entries().find((e) => e.id === id);
      this.nachrichtName.set(eintrag?.name ?? 'Testnachricht');
      this.abnahmeDatum.set(
        eintrag?.abnahmeZeit
          ? new Date(eintrag.abnahmeZeit).toLocaleString('de-DE', {
              dateStyle: 'short',
              timeStyle: 'short',
            })
          : '',
      );

      const [abnahme, aktuell] = await Promise.all([
        this.store.loadAbnahmeXml(id),
        this.store.loadXml(id),
      ]);
      if (!abnahme) {
        this.fehler.set(
          'Diese Testnachricht ist nicht abgenommen — es gibt keine eingefrorene Vergleichsfassung.',
        );
        return;
      }
      if (!aktuell) {
        this.fehler.set('Die Testnachricht wurde nicht gefunden.');
        return;
      }
      this.result.set(this.diff.vergleiche(abnahme, aktuell));
    } catch (e) {
      this.fehler.set(
        e instanceof Error && e.message.includes('nicht lesbar')
          ? e.message
          : 'Vergleich nicht möglich — Backend nicht erreichbar.',
      );
    } finally {
      this.laedt.set(false);
    }
  }

  protected onFilter(ev: Event): void {
    this.filter.set((ev.target as HTMLInputElement).value);
  }

  /** Eine Zeile als Text (fuer Rueckfragen und CR-Mails). */
  private alsText(e: XmlDiffEintrag): string {
    const ziel = e.pfad + (e.attribut ? `/@${e.attribut}` : '');
    if (e.unterElemente !== undefined && !e.vorher && !e.nachher)
      return `${e.art.toUpperCase()} — ${ziel} (${e.unterElemente} weitere Angaben)`;
    return `${e.art.toUpperCase()} — ${ziel}: ${e.vorher ?? '—'} → ${e.nachher ?? '—'}`;
  }

  protected kopiere(e: XmlDiffEintrag, ev: Event): void {
    ev.stopPropagation();
    this.inZwischenablage(this.alsText(e), e.name);
  }

  protected kopiereAlles(): void {
    if (!this.result()) return;
    const kopf = `Änderungen der Testnachricht „${this.nachrichtName()}" gegenüber der abgenommenen Fassung${this.abnahmeDatum() ? ' vom ' + this.abnahmeDatum() : ''}`;
    const text = [kopf, '', ...this.gefiltert().map((e) => this.alsText(e))].join('\n');
    this.inZwischenablage(text, `${this.gefiltert().length} Änderungen`);
  }

  private inZwischenablage(text: string, was: string): void {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(() => this.toast.show('Kopiert: ' + was))
      .catch(() => prompt('Zum Kopieren (Strg+C):', text));
  }
}
