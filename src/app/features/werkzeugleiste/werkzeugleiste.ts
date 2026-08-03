import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { NavService } from '../../core/services/nav.service';
import { GuidedService } from '../../core/services/guided.service';
import { ToastService } from '../../core/services/toast.service';
import { MessagePicker } from '../message-picker/message-picker';
import { Search } from '../search/search';
import { Crumbs } from '../crumbs/crumbs';
import { Menu } from '../../shared/menu/menu';

/** Die drei Arbeitsweisen des Segments. */
export type Arbeitsmodus = 'betrachten' | 'bearbeiten' | 'gefuehrt';

/**
 * Zeile 2 der Kopfzone: die Arbeit am Baum (Issue #80). Nachrichtenwahl und
 * Pfad gehoeren fachlich zusammen ("welche Nachricht, wo darin"), daneben
 * Arbeitsmodus, Suche, Anzeigeschalter, Datenbasis und Fortschritt.
 *
 * Die Leiste bricht nie um: sie ist bei jeder Fensterbreite genau eine Zeile
 * hoch. Was nicht mehr passt, verliert per Breakpoint seine Beschriftung
 * (~1280px) oder weicht in das Ueberlauf-Menue (~1050px, `.overflow-only`).
 */
@Component({
  selector: 'app-werkzeugleiste',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MessagePicker, Search, Crumbs, Menu],
  templateUrl: './werkzeugleiste.html',
})
export class Werkzeugleiste {
  protected readonly state = inject(StateService);
  private readonly nav = inject(NavService);
  private readonly guided = inject(GuidedService);
  private readonly toast = inject(ToastService);

  readonly xsdFiles = output<FileList>();
  readonly codelistFiles = output<FileList>();
  readonly xrepClick = output<void>();
  readonly diffClick = output<void>();
  /** Wechsel auf eine hinterlegte Schemaversion (dir aus dem Manifest). */
  readonly bundledPick = output<string>();
  /** Versionsliste von xjustiz.de abrufen/aktualisieren. */
  readonly remoteSchemaClick = output<void>();
  /** Fehlerprotokoll (LoggerService-Ringpuffer) als Datei speichern. */
  readonly logExportClick = output<void>();

  protected readonly hasRoot = this.state.hasRoot;
  protected readonly hasIdx = computed(() => !!this.state.idx());
  protected readonly hasIdxB = computed(() => !!this.state.idxB());
  protected readonly isMessage = this.state.isMessageEdit;
  protected readonly isCreate = this.state.isMessageCreate;
  protected readonly isSchemaView = this.state.schemaView;

  protected readonly bundledVersions = computed(() => this.state.bundledVersions());
  protected readonly activeBundle = computed(() => this.state.activeBundle());

  /** Stammt die aktive Version aus dem Abruf von xjustiz.de? */
  private readonly ausXjustizDe = computed(() => {
    const dir = this.state.activeBundle();
    return !!dir && !!this.state.bundledVersions().find((v) => v.dir === dir)?.zipUrl;
  });

  /**
   * Sichtbare Beschriftung des Datenbasis-Menues. Der frueher danebenstehende
   * verInfo-Text (~350px) ist zum Tooltip geworden (Issue #80) — die Version
   * stand dort ohnehin doppelt.
   */
  protected readonly datenbasisLabel = computed(() =>
    this.state.idx() ? `XJustiz ${this.state.version() || '?'}` : 'Schemata',
  );

  /** verInfo (Z.980-984): jetzt Tooltip des Datenbasis-Menues statt eigener Pille. */
  protected readonly verInfo = computed(() => {
    const idx = this.state.idx();
    if (!idx) return 'keine Schemata geladen';
    const ncl = Object.keys(this.state.codelists()).length;
    return (
      `XJustiz ${this.state.version() || '?'}${this.ausXjustizDe() ? ' (xjustiz.de)' : ''} · ` +
      `${this.state.docs().length} Schemata · ` +
      `${idx.messages.length} Nachrichten${ncl ? ' · ' + ncl + ' Codelisten' : ''}`
    );
  });

  protected readonly diffLabel = computed(() => {
    const b = this.state.idxB();
    return b ? `Diff ${this.state.version() || '?'} ↔ ${b.version || '?'}` : 'Version vergleichen…';
  });

  /**
   * Der Arbeitsmodus ist abgeleitet, nicht gespeichert: `readOnly` und `guided`
   * sind im Segment gegenseitig ausschliessend (Entscheidung zu #80).
   * Fuehrung heisst Entscheidungen treffen, Betrachten heisst keine treffen —
   * die Legende macht diese Annahme ohnehin schon (legend.ts).
   */
  protected readonly modus = computed<Arbeitsmodus>(() => {
    // Der Abnahme-Schreibschutz zaehlt wie Betrachten, auch wenn `readOnly`
    // ihm gerade nicht folgt: beim Oeffnen eines abgenommenen Profils setzen
    // `loadProfile` (readOnly=false) und der Schreibschutz-Effekt in der
    // PersistenceService (readOnly=true) nacheinander dasselbe Signal. Ohne
    // diese Klammer zeigte das Segment je nach Ausgang des Wettlaufs
    // "Bearbeiten" an einem Profil, an dem nichts zu bearbeiten ist.
    if (this.state.abnahmeSchreibschutz() || this.state.readOnly()) return 'betrachten';
    return this.state.guided() ? 'gefuehrt' : 'bearbeiten';
  });

  /** In der Schema-Ansicht gibt es nichts zu entscheiden — die Zone bleibt trotzdem belegt. */
  protected readonly modusGesperrt = computed(
    () => !this.hasRoot() || this.isSchemaView() || this.state.abnahmeSchreibschutz(),
  );

  protected readonly modusTitel = computed(() => {
    if (this.isSchemaView())
      return 'Schema-Ansicht — es wird nichts entschieden und nichts gespeichert';
    if (this.state.abnahmeSchreibschutz())
      return 'Von der BLK-AG abgenommen — Bearbeiten nur mit AG-Schlüssel';
    return '';
  });

  /**
   * Fortschritt als eigene Zone rechts: der Text wechselt seine Breite und
   * wuerde sonst seine Nachbarn verschieben (Befund 3 zu #80).
   */
  protected readonly fortschrittText = computed(() => {
    if (this.state.guided() && this.hasRoot()) {
      const { x, y, zuKlaeren } = this.guided.fortschritt();
      // Im Durchlauf einer Nachricht zaehlen nur die geschuldeten Angaben (ADR 0016).
      if (this.guided.instanzModus()) return `${x} von ${y} Pflichtangaben`;
      const offen = y - x - zuKlaeren;
      return zuKlaeren
        ? `${x} von ${y} entschieden · ${offen} offen · ${zuKlaeren} zu klären`
        : `${x} von ${y} entschieden`;
    }
    const { nStatus, nAusp } = this.state.fortschritt();
    return nStatus ? `${nStatus} Festlegungen${nAusp ? ' · ' + nAusp + ' Ausprägungen' : ''}` : '';
  });

  /** Anteil erledigter Stationen (0-1) fuer den Balken; nur im gefuehrten Lauf. */
  protected readonly fortschrittAnteil = computed(() => {
    if (!this.state.guided() || !this.hasRoot()) return null;
    const { x, y } = this.guided.fortschritt();
    return y > 0 ? Math.min(1, x / y) : null;
  });

  protected pick(input: HTMLInputElement): void {
    input.click();
  }

  protected onXsd(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length) this.xsdFiles.emit(input.files);
    input.value = '';
  }

  protected onCodelist(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length) this.codelistFiles.emit(input.files);
    input.value = '';
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
   * Modus-Segment. Bei geladener Nachricht laeuft der Wechsel ueber
   * `nachrichtBearbeiten` — dort haengt "nur Werte" mit dran, sonst blieben
   * unbelegte Elemente unsichtbar und liessen sich nicht befuellen.
   */
  protected setzeModus(m: Arbeitsmodus): void {
    if (m === this.modus() || this.modusGesperrt()) return;
    if (this.isMessage()) {
      this.state.nachrichtBearbeiten(m !== 'betrachten');
      // nachrichtBearbeiten kann den Wechsel verweigern (Abnahme-Schreibschutz);
      // die Fuehrung darf dann nicht trotzdem anspringen.
      if (m !== 'betrachten' && this.state.readOnly()) return;
      this.state.guided.set(m === 'gefuehrt');
      if (m === 'bearbeiten')
        this.toast.show(
          'Bearbeiten — es wird der volle Standard gezeigt; leere Elemente lassen sich jetzt befüllen.',
        );
      return;
    }
    this.state.readOnly.set(m === 'betrachten');
    this.state.guided.set(m === 'gefuehrt');
  }
}
