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
import { StateService } from '../../core/services/state.service';
import { NavService } from '../../core/services/nav.service';
import { ToastService } from '../../core/services/toast.service';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { TestmessageStoreService } from '../../core/services/testmessage-store.service';
import { ProfilDiffService } from '../../core/services/profil-diff.service';
import { VergleichService } from '../../core/services/vergleich.service';
import { ProfileDoc, ProfilVersion } from '../../models/profile.model';
import {
  ProfilDiffBereich,
  ProfilDiffEintrag,
  ProfilDiffResult,
} from '../../models/profil-diff.model';
import { DIFF_FARBEN, DIFF_SYM } from '../../core/util/diff-anzeige.util';
import { KeinAutofillDirective } from '../../shared/kein-autofill.directive';

/** Anzeigenamen der Filter-Chips. */
const BEREICH_LABEL: Record<ProfilDiffBereich, string> = {
  meta: 'Metadaten',
  status: 'Statusstufen',
  element: 'Elemente',
  auspraegung: 'Ausprägungen',
  erweiterung: 'Erweiterungen',
};

/** Zeilen-Deckel wie im Schema-Diff — lange Listen wuerden den Dialog lahmlegen. */
const MAX_ZEILEN = 800;

/**
 * Zeigt feldgenau, was sich zwischen einer eingefrorenen Fassung und dem
 * Arbeitsstand geaendert hat (US "Was hat sich seit der Abnahme geaendert?").
 * Vorausgewaehlt ist die Abnahme-Version; ueber die Auswahl laesst sich jede
 * andere Version als Basis nehmen.
 *
 * Zweiter Modus (`vorgabe`): die an einer Testnachricht eingefrorene
 * Profilkopie gegen den aktuellen Stand derselben Profilierung — der Einstieg
 * aus dem Badge "Profil weiterentwickelt". Die Basis ist dort die Kopie am
 * Eintrag und keine Version, also entfaellt die Basis-Auswahl.
 *
 * Gesteuert vom VergleichService (Muster ValidationDialog) — die Einstiege
 * liegen in Toolbar, Versions-Dialog, Dashboard und Testdatenspeicher.
 */
@Component({
  selector: 'app-profil-diff-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profil-diff-dialog.html',
  imports: [KeinAutofillDirective],
})
export class ProfilDiffDialog {
  private readonly state = inject(StateService);
  private readonly nav = inject(NavService);
  private readonly toast = inject(ToastService);
  private readonly store = inject(ProfileStoreService);
  private readonly testdaten = inject(TestmessageStoreService);
  private readonly diff = inject(ProfilDiffService);
  private readonly vergleich = inject(VergleichService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly farben = DIFF_FARBEN;
  protected readonly sym = DIFF_SYM;
  protected readonly bereichLabel = BEREICH_LABEL;

  protected readonly laedt = signal(false);
  protected readonly fehler = signal('');
  /** Versionsliste des Profils (Basis-Auswahl). */
  protected readonly versionen = signal<ProfilVersion[]>([]);
  /** id der gewaehlten Basis-Version. */
  protected readonly basisId = signal<string | null>(null);
  protected readonly profilName = signal('');
  /**
   * `version` = eingefrorene Version ↔ Arbeitsstand (Basis waehlbar);
   * `vorgabe` = gebundene Kopie einer Testnachricht ↔ aktueller Stand.
   */
  protected readonly modus = signal<'version' | 'vorgabe'>('version');
  /** Nur im Modus `vorgabe`: Fassungsbezeichnung der Bindung ("v3"). */
  private readonly vorgabeFassung = signal('');
  private readonly basisDoc = signal<ProfileDoc | null>(null);
  private readonly standDoc = signal<ProfileDoc | null>(null);
  /** Die verglichene Fassung gehoert zum gerade offenen Profil (Sprung moeglich). */
  private readonly imEditor = signal(false);

  protected readonly nurBereich = signal<ProfilDiffBereich | null>(null);
  protected readonly filter = signal('');

  protected readonly result = computed<ProfilDiffResult | null>(() => {
    const a = this.basisDoc();
    const b = this.standDoc();
    return a && b ? this.diff.vergleiche(a, b) : null;
  });

  /** Chips nur fuer Bereiche, in denen es tatsaechlich Unterschiede gibt. */
  protected readonly bereiche = computed(() => {
    const r = this.result();
    if (!r) return [];
    return (Object.keys(BEREICH_LABEL) as ProfilDiffBereich[])
      .filter((b) => r.proBereich[b] > 0)
      .map((b) => ({ bereich: b, label: BEREICH_LABEL[b], n: r.proBereich[b] }));
  });

  private readonly gefiltert = computed(() => {
    const r = this.result();
    if (!r) return [];
    const b = this.nurBereich();
    const f = this.filter().trim().toLowerCase();
    return r.eintraege.filter(
      (e) =>
        (!b || e.bereich === b) &&
        (!f || `${e.titel} ${e.pfadKlartext} ${e.pfad}`.toLowerCase().includes(f)),
    );
  });

  protected readonly zeilen = computed(() => this.gefiltert().slice(0, MAX_ZEILEN));
  protected readonly weitere = computed(() => Math.max(0, this.gefiltert().length - MAX_ZEILEN));

  /** Beschriftung der gewaehlten Basis fuer die Kopfzeile. */
  protected readonly basisText = computed(() => {
    if (this.modus() === 'vorgabe')
      return `gebundene Fassung${this.vorgabeFassung() ? ` (${this.vorgabeFassung()})` : ''}`;
    const v = this.versionen().find((x) => x.id === this.basisId());
    return v ? this.versionLabel(v) : '—';
  });

  constructor() {
    effect(() => {
      const ziel = this.vergleich.ziel();
      const el = this.dlg().nativeElement;
      if (ziel?.art === 'profil') {
        if (!el.open) el.showModal();
        void this.lade(ziel.profilId, ziel.versionId);
      } else if (ziel?.art === 'vorgabe') {
        if (!el.open) el.showModal();
        void this.ladeVorgabe(ziel.testmessageId, ziel.profilId);
      } else if (el.open) {
        el.close();
      }
    });
  }

  protected schliesse(): void {
    this.vergleich.schliesse();
  }

  /** Zustand fuer einen neuen Vergleich leeren. */
  private beginne(modus: 'version' | 'vorgabe'): void {
    this.laedt.set(true);
    this.fehler.set('');
    this.nurBereich.set(null);
    this.filter.set('');
    this.basisDoc.set(null);
    this.standDoc.set(null);
    this.modus.set(modus);
  }

  /** Basis und Arbeitsstand beschaffen und den Vergleich aufbauen. */
  private async lade(profilId: string, versionId?: string): Promise<void> {
    this.beginne('version');
    try {
      const eintrag = this.store.entries().find((e) => e.id === profilId);
      this.profilName.set(eintrag?.name ?? 'Profilierung');

      // Arbeitsstand: das offene Profil kommt aus dem Store-Signal — immer
      // aktuell, ohne auf den Autosave zu warten.
      const offen = this.state.activeProfileId() === profilId;
      this.imEditor.set(offen);
      const stand = offen ? this.state.profileDoc() : await this.store.load(profilId);
      if (!stand) {
        this.fehler.set('Die Profilierung wurde nicht gefunden.');
        return;
      }
      this.standDoc.set(stand);

      this.versionen.set(await this.store.listVersions(profilId));
      const basis = versionId
        ? await this.store.loadVersion(profilId, versionId)
        : await this.store.loadAbnahmeDoc(profilId);
      if (!basis) {
        this.fehler.set(
          versionId
            ? 'Die Version wurde nicht gefunden.'
            : 'Diese Profilierung ist nicht freigegeben — es gibt keinen eingefrorenen Vergleichsstand.',
        );
        return;
      }
      this.basisId.set(basis.id);
      this.basisDoc.set(basis.doc);
    } catch {
      this.fehler.set('Vergleich nicht möglich — Backend nicht erreichbar.');
    } finally {
      this.laedt.set(false);
    }
  }

  /**
   * Modus `vorgabe`: die am Testspeicher-Eintrag eingefrorene Profilkopie gegen
   * den aktuellen Stand der Profilierung. Basis ist die Kopie — sie liegt am
   * Eintrag und ueberlebt Aenderung und Loeschung der Profilierung; die
   * Testnachricht selbst wird davon nicht beruehrt.
   */
  private async ladeVorgabe(testmessageId: string, profilId: string): Promise<void> {
    this.beginne('vorgabe');
    this.versionen.set([]);
    const eintrag = this.testdaten.entries().find((e) => e.id === testmessageId);
    this.vorgabeFassung.set(eintrag?.fassung ?? '');
    try {
      const bib = this.store.entries().find((e) => e.id === profilId);
      this.profilName.set(bib?.name || eintrag?.profilName || 'Profilierung');

      const offen = this.state.activeProfileId() === profilId;
      this.imEditor.set(offen);
      const stand = offen ? this.state.profileDoc() : await this.store.load(profilId);
      if (!stand) {
        this.fehler.set('Die Profilierung wurde nicht gefunden — es gibt keinen aktuellen Stand.');
        return;
      }
      const kopie = await this.testdaten.loadVorgabe(testmessageId);
      if (!kopie) {
        this.fehler.set('Zu dieser Testnachricht ist keine Profilfassung gebunden.');
        return;
      }
      this.basisId.set(null);
      this.basisDoc.set(kopie);
      this.standDoc.set(stand);
    } catch {
      this.fehler.set('Vergleich nicht möglich — Backend nicht erreichbar.');
    } finally {
      this.laedt.set(false);
    }
  }

  /** Andere Version als Basis waehlen (Arbeitsstand bleibt die rechte Seite). */
  protected async waehleBasis(ev: Event): Promise<void> {
    const id = (ev.target as HTMLSelectElement).value;
    const profilId = this.vergleichProfilId();
    if (!id || !profilId) return;
    this.laedt.set(true);
    this.fehler.set('');
    try {
      const basis = await this.store.loadVersion(profilId, id);
      if (!basis) {
        this.fehler.set('Die Version wurde nicht gefunden.');
        return;
      }
      this.basisId.set(basis.id);
      this.basisDoc.set(basis.doc);
    } catch {
      this.fehler.set('Version konnte nicht geladen werden — Backend nicht erreichbar.');
    } finally {
      this.laedt.set(false);
    }
  }

  private vergleichProfilId(): string | null {
    const z = this.vergleich.ziel();
    return z?.art === 'profil' ? z.profilId : null;
  }

  protected versionLabel(v: ProfilVersion): string {
    const datum = new Date(v.erstellt).toLocaleDateString('de-DE', { dateStyle: 'short' });
    const teile = [`v${v.nr}`, datum];
    if (v.abnahme) teile.push('✔ Freigabe');
    if (v.automatisch) teile.push('automatisch');
    if (v.kommentar) teile.push(v.kommentar);
    return teile.join(' · ');
  }

  protected toggleBereich(b: ProfilDiffBereich): void {
    this.nurBereich.update((cur) => (cur === b ? null : b));
  }

  protected onFilter(ev: Event): void {
    this.filter.set((ev.target as HTMLInputElement).value);
  }

  /**
   * Sprung zum betroffenen Knoten — nur sinnvoll, wenn genau dieses Profil im
   * Editor offen ist und der Baum die passende Nachricht zeigt.
   */
  protected springbar(e: ProfilDiffEintrag): boolean {
    return (
      e.springbar &&
      this.imEditor() &&
      this.state.hasRoot() &&
      e.pfad.startsWith((this.state.msgName() ?? '') + '/')
    );
  }

  protected springe(e: ProfilDiffEintrag): void {
    if (!this.springbar(e)) return;
    this.schliesse();
    this.nav.jumpTo(e.pfad);
  }

  /** Eine Zeile als Text (fuer Rueckfragen und CR-Mails). */
  private alsText(e: ProfilDiffEintrag): string {
    const felder = e.felder
      .map(
        (f) =>
          `  ${f.label}: ${f.vorher ?? '—'} → ${f.nachher ?? '—'}${f.delta ? ` (${f.delta})` : ''}`,
      )
      .join('\n');
    const kopf = `${e.art.toUpperCase()} — ${e.titel}${e.pfadKlartext ? `\n  ${e.pfadKlartext}` : ''}`;
    return `${kopf}\n${felder}`;
  }

  protected kopiere(e: ProfilDiffEintrag, ev: Event): void {
    ev.stopPropagation();
    this.inZwischenablage(this.alsText(e), e.titel);
  }

  /** Die gefilterte Liste als Ganzes — der eigentliche Nutzen fuer Abstimmungen. */
  protected kopiereAlles(): void {
    const r = this.result();
    if (!r) return;
    const kopf = `Änderungen der Profilierung „${this.profilName()}" gegenüber ${this.basisText()}`;
    const text = [kopf, '', ...this.gefiltert().map((e) => this.alsText(e))].join('\n');
    this.inZwischenablage(text, `${this.gefiltert().length} Änderungen`);
  }

  private inZwischenablage(text: string, was: string): void {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(() => this.toast.show('Kopiert: ' + was))
      .catch(() => prompt('Zum Kopieren (Strg+C):', text));
  }
}
