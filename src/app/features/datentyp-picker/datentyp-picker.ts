import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { StateService } from '../../core/services/state.service';
import {
  DatentypEintrag,
  DatentypWahl,
  datentypAnzeige,
  datentypGruppen,
  datentypUnbekannt,
  filterGruppen,
} from '../../core/util/datentyp.util';

/**
 * Typwaehler einer Schema-Erweiterung (#96) — nach dem Vorbild des
 * Nachrichtenwaehlers: Knopf mit dem aktuellen Typ, Klick oeffnet ein Panel mit
 * Suchfeld und gruppierter Liste.
 *
 * Die Liste kommt aus dem geladenen Schema-Index (`core/util/datentyp.util`),
 * damit sie zur aktiven Schemaversion passt. Die Komponente steht an **beiden**
 * Stellen — Anlege-Dialog und Detailpanel —, weil die Auswahlliste vorher an
 * zwei Stellen gepflegt wurde und auseinanderlief.
 */
@Component({
  selector: 'app-datentyp-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './datentyp-picker.html',
  host: { '(document:click)': 'aufAussenklick($event)' },
})
export class DatentypPicker {
  private readonly state = inject(StateService);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Der gespeicherte Typ-Anteil der Erweiterung. */
  readonly wert = input.required<DatentypWahl>();
  /** Neue Wahl; Container meldet beide Felder leer. */
  readonly gewaehlt = output<DatentypWahl>();

  protected readonly offen = signal(false);
  protected readonly filter = signal('');
  /** Index in `flach()` — Ziel von ↑/↓ und Enter. */
  protected readonly hot = signal(0);
  /** „Sonstiger…" gewaehlt: das Freitextfeld steht offen, die Wahl ist noch nicht gefallen. */
  protected readonly freiModus = signal(false);
  /** Vorbelegung des Freitextfelds — uebernimmt den bereits getippten Suchtext. */
  protected readonly freiText = signal('');
  /**
   * Lage des Panels. Anders als der Nachrichtenwaehler haengt der Typwaehler
   * nicht in der Kopfzone, sondern irgendwo in der Detailspalte — steht unter
   * dem Knopf zu wenig Platz, klappt die Liste nach oben auf (`bottom` statt
   * `top`), und ihre Hoehe bleibt auf den verfuegbaren Platz begrenzt.
   */
  protected readonly pos = signal<{
    left: number;
    top: number | null;
    bottom: number | null;
    maxH: number;
  }>({ left: 0, top: 0, bottom: null, maxH: 400 });

  /** Panelbreite; muss zu `.typPanel` in styles.scss passen. */
  private static readonly BREITE = 520;
  /** Darunter lohnt das Aufklappen nach unten nicht mehr. */
  private static readonly MIN_HOEHE = 220;

  private readonly sucheFeld = viewChild<ElementRef<HTMLInputElement>>('suche');
  private readonly freiFeld = viewChild<ElementRef<HTMLInputElement>>('frei');
  /** Die gerenderten Listeneintraege, in derselben Reihenfolge wie `flach()`. */
  private readonly eintragEls = viewChildren<ElementRef<HTMLElement>>('eintrag');

  protected readonly katalog = computed(() => datentypGruppen(this.state.idx()));
  protected readonly gruppen = computed(() => filterGruppen(this.katalog(), this.filter()));
  /** Die sichtbaren Eintraege am Stueck — die Tastatur kennt keine Gruppen. */
  protected readonly flach = computed(() => this.gruppen().flatMap((g) => g.eintraege));

  /**
   * Kein einziger Typ passt — die Meldung darf sich nicht an der Gruppenzahl
   * festmachen, weil „Sonstiger…" jeden Filter ueberlebt.
   */
  protected readonly keineTreffer = computed(() =>
    this.gruppen().every((g) => g.eintraege.every((e) => e.art !== 'typ')),
  );

  protected readonly anzeige = computed(() => datentypAnzeige(this.wert()));
  protected readonly unbekannt = computed(() => datentypUnbekannt(this.wert(), this.katalog()));

  /** Klartext des aktuellen Typs, sofern der Katalog einen kennt. */
  protected readonly info = computed(() => {
    const name = this.wert().datentyp;
    if (!name) return '';
    for (const g of this.katalog())
      for (const e of g.eintraege) if (e.art === 'typ' && e.name === name) return e.info;
    return '';
  });

  constructor() {
    effect(() => {
      if (this.offen()) this.sucheFeld()?.nativeElement.focus();
    });
    effect(() => {
      if (this.freiModus()) this.freiFeld()?.nativeElement.focus();
    });
    // ↑/↓ waehlen aus ~700 Eintraegen; ohne Nachfuehren waere der hot-Eintrag
    // nach wenigen Tastendruecken ausserhalb des Panels.
    effect(() => {
      const i = this.hot();
      if (!this.offen()) return;
      this.eintragEls()[i]?.nativeElement.scrollIntoView({ block: 'nearest' });
    });
  }

  protected toggle(btn: HTMLElement): void {
    if (this.offen()) {
      this.schliesse();
      return;
    }
    this.pos.set(this.lage(btn.getBoundingClientRect()));
    this.filter.set('');
    this.hot.set(0);
    this.freiModus.set(false);
    this.offen.set(true);
  }

  private lage(r: DOMRect): {
    left: number;
    top: number | null;
    bottom: number | null;
    maxH: number;
  } {
    const breite = Math.min(DatentypPicker.BREITE, window.innerWidth * 0.94);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 8 - breite));
    const unten = window.innerHeight - r.bottom - 12;
    const oben = r.top - 12;
    const nachUnten = unten >= DatentypPicker.MIN_HOEHE || unten >= oben;
    return {
      left,
      top: nachUnten ? r.bottom + 4 : null,
      bottom: nachUnten ? null : window.innerHeight - r.top + 4,
      maxH: Math.max(160, nachUnten ? unten : oben),
    };
  }

  protected schliesse(): void {
    this.offen.set(false);
    this.freiModus.set(false);
  }

  /** Klick ausserhalb schliesst — ohne Schirm-Element, das ein Klickziel ohne Tastatur waere. */
  protected aufAussenklick(ev: Event): void {
    if (!this.offen()) return;
    if (this.host.nativeElement.contains(ev.target as Node)) return;
    this.schliesse();
  }

  protected onFilter(ev: Event): void {
    this.filter.set((ev.target as HTMLInputElement).value);
    this.hot.set(0);
  }

  protected onKeydown(ev: KeyboardEvent): void {
    const liste = this.flach();
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!liste.length) return;
      const ziel = this.hot() + (ev.key === 'ArrowDown' ? 1 : -1);
      this.hot.set(Math.max(0, Math.min(liste.length - 1, ziel)));
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const e = liste[this.hot()];
      if (e) this.waehle(e);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      this.schliesse();
    }
  }

  protected istHot(e: DatentypEintrag): boolean {
    return this.flach()[this.hot()] === e;
  }

  protected waehle(e: DatentypEintrag): void {
    if (e.art === 'frei') {
      // Erst der eingetippte Name macht die Wahl vollstaendig. Der Suchtext
      // wandert mit — wer den Namen schon getippt hat, tippt ihn nicht erneut.
      this.freiText.set(this.filter().trim());
      this.freiModus.set(true);
      return;
    }
    this.schliesse();
    this.gewaehlt.emit(
      e.art === 'container'
        ? { datentyp: undefined, datentypQuelle: undefined }
        : { datentyp: e.name, datentypQuelle: e.quelle ?? undefined },
    );
  }

  protected onFrei(ev: Event): void {
    this.uebernimmFrei((ev.target as HTMLInputElement).value);
  }

  /**
   * Tastatur im Freitextfeld. Escape schliesst **nur** den Waehler: ohne
   * `preventDefault` schloesse es im `<dialog>` des Anlege-Dialogs den ganzen
   * Dialog samt eingetragenem Elementnamen.
   */
  protected onFreiKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      this.schliesse();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      this.uebernimmFrei((ev.target as HTMLInputElement).value);
    }
  }

  private uebernimmFrei(roh: string): void {
    const v = roh.trim();
    if (!v) return;
    this.schliesse();
    this.gewaehlt.emit({ datentyp: v, datentypQuelle: 'frei' });
  }
}
