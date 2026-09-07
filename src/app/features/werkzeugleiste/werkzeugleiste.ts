import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { NavService } from '../../core/services/nav.service';
import { TreeService } from '../../core/services/tree.service';
import { GuidedService } from '../../core/services/guided.service';
import { AstStand, StandAnsicht } from '../../core/ansicht/stand-ansicht';
import { ToastService } from '../../core/services/toast.service';
import { TestmessageEditService } from '../../core/services/testmessage-edit.service';
import { Menu } from '../../shared/menu/menu';
import { UeberlagerungService } from '../../core/services/ueberlagerung.service';
import { UeberlagerungMenu } from '../ueberlagerung/ueberlagerung-menu';

/** Die drei Arbeitsweisen des Segments. */
export type Arbeitsmodus = 'betrachten' | 'bearbeiten' | 'gefuehrt';

/**
 * **Arbeits-Zeile** (Editor v4, Zeile 3 der Kopfzone; aus der Werkzeugleiste
 * zu #80 hervorgegangen): wie arbeite ich — Modus-Segment —, wie weit bin ich
 * — Stand und Ast-Chips —, was zeigt die Ansicht, und wo geht es weiter.
 *
 * Ort und Suche stehen seit Editor v4 eine Zeile hoeher (`app-ortzeile`), die
 * Datenbasis im Dialog `app-grundlage-dialog` („Grundlage…" im ⋯-Menue der
 * Kopfzeile). Der Pfad (`app-crumbs`) steht seit E3 in der Fusszeile.
 *
 * Die Leiste bricht nie um: sie ist bei jeder Fensterbreite genau eine Zeile
 * hoch. Was nicht mehr passt, weicht per Breakpoint — die Ast-Chips ab 1240px
 * in ein Menue, die Stand-Beschriftung ab 1040px auf „x / y".
 */
@Component({
  selector: 'app-werkzeugleiste',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Menu, UeberlagerungMenu],
  templateUrl: './werkzeugleiste.html',
})
export class Werkzeugleiste {
  protected readonly state = inject(StateService);
  private readonly nav = inject(NavService);
  private readonly tree = inject(TreeService);
  protected readonly guided = inject(GuidedService);
  private readonly standAnsicht = inject(StandAnsicht);
  private readonly toast = inject(ToastService);
  private readonly edit = inject(TestmessageEditService);
  /** Laeuft eine Nachrichten-Ueberlagerung (#147)? Dann steht ihr Filter hier. */
  protected readonly ueberlagerung = inject(UeberlagerungService);

  protected readonly hasRoot = this.state.hasRoot;
  protected readonly hasIdxB = computed(() => !!this.state.idxB());
  protected readonly isMessage = this.state.isMessageEdit;
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

  // ── Stand ─────────────────────────────────────────────────

  /**
   * Der Stand steht in jeder Arbeitsweise, nicht nur im gefuehrten Lauf: die
   * Frage „wie weit bin ich" haengt nicht daran, wie man arbeitet. In der
   * Schema-Ansicht gibt es nichts zu beantworten — dort entfaellt er.
   */
  protected readonly zeigeStand = computed(() => this.hasRoot() && !this.isSchemaView());

  protected readonly stand = this.standAnsicht.gesamt;

  /** Im Durchlauf einer Nachricht zaehlen nur die geschuldeten Angaben (ADR 0016). */
  protected readonly standWort = computed(() =>
    this.guided.instanzModus() ? 'Pflichtangaben' : 'eigens beantwortet',
  );

  protected readonly standTitel = computed(() => {
    const { zuKlaeren } = this.stand();
    const basis = 'Bei den übrigen Feldern gilt die Regel des Standards';
    return zuKlaeren ? `${basis} · ${zuKlaeren} zu klären` : basis;
  });

  /** Anteil beantworteter Punkte in Prozent — die Breite des Mini-Balkens. */
  protected readonly standAnteil = computed(() => {
    const { x, y } = this.stand();
    return y > 0 ? Math.min(100, (x / y) * 100) : 0;
  });

  /** Die Aeste der Nachricht als Chips bzw. als Menue (StandAnsicht). */
  protected readonly aeste = this.standAnsicht.aeste;

  /** Zaehler der drei Hervorhebungen im Ansicht-Menue. */
  protected readonly zaehler = this.standAnsicht.hervorhebungZaehler;

  protected anteil(a: AstStand): number {
    return a.gesamt > 0 ? (a.entschieden / a.gesamt) * 100 : 0;
  }

  protected astTitel(a: AstStand): string {
    if (!this.zeigeStand()) return a.name;
    return (
      `${a.entschieden} von ${a.gesamt} Feldern mit eigener Antwort — ` +
      'bei den übrigen gilt der Standard'
    );
  }

  protected springe(path: string): void {
    this.nav.jumpTo(path);
  }

  /** Farbige Umrandung im Baum um- und abschalten (Auswertung in E4). */
  protected setzeHervorhebung(key: 'offen' | 'beantwortet' | 'notiz', on: boolean): void {
    this.state.hervorhebung.update((h) => ({ ...h, [key]: on }));
  }

  /**
   * Zurueck an den Anfang: alles zuklappen und die Wurzel auswaehlen — sonst
   * bliebe die Auswahl an einem Kasten stehen, den niemand mehr sieht.
   */
  protected zumAnfang(): void {
    this.nav.collapseTree();
    this.state.selItem.set(this.tree.rootItem());
  }

  /** „Nächstes offenes Feld": nichts mehr offen → Rueckmeldung statt Stille. */
  protected naechstesOffenes(): void {
    if (!this.guided.gotoNextOpen()) this.toast.show('Alle Felder beantwortet');
  }

  protected checked(e: Event): boolean {
    return (e.target as HTMLInputElement).checked;
  }

  protected expand(): void {
    this.nav.expandAllTree();
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
