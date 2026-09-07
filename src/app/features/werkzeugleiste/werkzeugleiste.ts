import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { NavService } from '../../core/services/nav.service';
import { GuidedService } from '../../core/services/guided.service';
import { ToastService } from '../../core/services/toast.service';
import { TestmessageEditService } from '../../core/services/testmessage-edit.service';
import { MessagePicker } from '../message-picker/message-picker';
import { Search } from '../search/search';
import { Crumbs } from '../crumbs/crumbs';
import { Menu } from '../../shared/menu/menu';
import { UeberlagerungService } from '../../core/services/ueberlagerung.service';
import { UeberlagerungMenu } from '../ueberlagerung/ueberlagerung-menu';

/** Die drei Arbeitsweisen des Segments. */
export type Arbeitsmodus = 'betrachten' | 'bearbeiten' | 'gefuehrt';

/**
 * Zeile 2 der Kopfzone: die Arbeit am Baum (Issue #80). Nachrichtenwahl und
 * Pfad gehoeren fachlich zusammen ("welche Nachricht, wo darin"), daneben
 * Arbeitsmodus, Suche, Anzeigeschalter und Fortschritt.
 *
 * Die Datenbasis (Schemaversionen, Codelisten, Versionsvergleich) ist seit
 * Editor v4 der Dialog `app-grundlage-dialog`, erreichbar ueber „Grundlage…"
 * im ⋯-Menue der Kopfzeile.
 *
 * Die Leiste bricht nie um: sie ist bei jeder Fensterbreite genau eine Zeile
 * hoch. Was nicht mehr passt, verliert per Breakpoint seine Beschriftung
 * (~1280px).
 */
@Component({
  selector: 'app-werkzeugleiste',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MessagePicker, Search, Crumbs, Menu, UeberlagerungMenu],
  templateUrl: './werkzeugleiste.html',
})
export class Werkzeugleiste {
  protected readonly state = inject(StateService);
  private readonly nav = inject(NavService);
  private readonly guided = inject(GuidedService);
  private readonly toast = inject(ToastService);
  private readonly edit = inject(TestmessageEditService);
  /** Laeuft eine Nachrichten-Ueberlagerung (#147)? Dann steht ihr Filter hier. */
  protected readonly ueberlagerung = inject(UeberlagerungService);

  protected readonly hasRoot = this.state.hasRoot;
  protected readonly hasIdxB = computed(() => !!this.state.idxB());
  protected readonly isMessage = this.state.isMessageEdit;
  protected readonly isCreate = this.state.isMessageCreate;
  protected readonly isSchemaView = this.state.schemaView;

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
      return 'Von der BLK-AG freigegeben — Bearbeiten nur mit AG-Schlüssel';
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
      // Der Weg in die Bearbeitung laeuft ueber den TestmessageEditService: dort
      // haengt die Rueckfrage zu gefuehrt erstellten Nachrichten (#105). Er kann
      // den Wechsel verweigern (Schreibschutz, abgelehnte Rueckfrage) — die
      // Fuehrung darf dann nicht trotzdem anspringen.
      if (m === 'betrachten') this.state.nachrichtBearbeiten(false);
      else if (!this.edit.bearbeitenAnfordern()) return;
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
