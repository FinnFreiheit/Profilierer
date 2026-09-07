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
import { NgTemplateOutlet } from '@angular/common';
import { TestmessageStoreService } from '../../core/services/testmessage-store.service';
import { StateService } from '../../core/services/state.service';
import { ToastService } from '../../core/services/toast.service';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { PersistenceService } from '../../core/services/persistence.service';
import { TestnachrichtStartService } from '../../core/services/testnachricht-start.service';
import { TestmessageCreateService } from '../../core/services/testmessage-create.service';
import { TestmessageEditService } from '../../core/services/testmessage-edit.service';
import { DownloadService } from '../../core/services/download.service';
import { XmlValidationService } from '../../core/services/xml-validation.service';
import { ValidationReportService } from '../../core/services/validation-report.service';
import { ProfilPruefungService } from '../../core/services/profil-pruefung.service';
import { PruefberichtExcelService } from '../../core/services/pruefbericht-excel.service';
import { RolleService } from '../../core/services/rolle.service';
import { VergleichService } from '../../core/services/vergleich.service';
import { EinordnenService } from '../../core/services/einordnen.service';
import { TeilenService } from '../../core/services/teilen.service';
import { Bibliothek } from '../../shared/bibliothek/bibliothek';
import { Menu } from '../../shared/menu/menu';
import { TestmessageEntry } from '../../models/testmessage.model';
import { LibraryEntry, ProfilVersion } from '../../models/profile.model';
import { Pruefbericht } from '../../models/pruefbericht.model';
import {
  berichtEintraege,
  berichtKopfzeile,
  berichtTitel,
} from '../../core/util/pruefbericht.util';
import { MessageRef } from '../../models/xsd-index.model';
import { parseTestmessage } from '../../core/util/testmessage.util';
import { nachrichtTeile } from '../../core/util/pretty.util';
import { ERW_SPERRE_GRUND, sperrtPruefartefakte } from '../../core/util/erweiterung-sperre';
import { datumKurz } from '../../core/util/datum.util';
import { firstLine } from '../../core/util/pretty.util';
import { KeinAutofillDirective } from '../../shared/kein-autofill.directive';
import { FileDropDirective } from '../../shared/file-drop.directive';
import { TagEingabe } from '../../shared/tag-eingabe/tag-eingabe';
import { ProjektStoreService } from '../../core/services/projekt-store.service';
import { UiSettingsService } from '../../core/services/ui-settings.service';
import {
  hatAlleTags,
  normalisiereTags,
  schalteTag,
  tagOptionen,
  tagsAlsText,
} from '../../core/util/tags.util';

/**
 * Die Achsen der Filterspalte. Muster und Bezeichner folgen der
 * Profil-Uebersicht (`features/dashboard/dashboard.ts`) — dieselbe Geste soll
 * in beiden Ansichten dasselbe tun.
 */
type AchsenKey = 'modul' | 'projekt' | 'profil' | 'zustand' | 'tag';

/**
 * Kennzeichen einer Testnachricht. Anders als der Zustand einer Profilierung
 * schliessen sie sich **nicht** aus: eine Nachricht kann Entwurf sein und
 * zugleich an einer weiterentwickelten Profilierung haengen. Die Zustands-Achse
 * verknuepft ihre Werte darum mit ODER.
 */
type Kennzeichen = 'entwurf' | 'frei' | 'geaendert' | 'weiterentwickelt' | 'ohneBindung';

const KENNZEICHEN_LABEL: Record<Kennzeichen, string> = {
  entwurf: 'Entwurf',
  frei: 'freigegeben',
  geaendert: 'seit Freigabe geändert',
  weiterentwickelt: 'Profil weiterentwickelt',
  ohneBindung: 'ohne Profilbindung',
};
const KENNZEICHEN_ORDER: readonly Kennzeichen[] = [
  'entwurf',
  'frei',
  'geaendert',
  'weiterentwickelt',
  'ohneBindung',
];

/**
 * Zustandspille der Kachel — **eine** Aussage, die dringlichste zuerst. Die
 * uebrigen Kennzeichen stehen daneben bzw. in der Filterspalte.
 */
type Zustand = 'geaendert' | 'frei' | 'entwurf' | 'leer';

const ZUSTAND: Record<Zustand, { klasse: string; label: string }> = {
  geaendert: { klasse: 'z-geaendert', label: 'seit Freigabe geändert' },
  frei: { klasse: 'z-frei', label: 'freigegeben' },
  entwurf: { klasse: 'z-arbeit', label: 'Entwurf' },
  leer: { klasse: 'z-leer', label: 'valide' },
};

/** Gliederung der Sammlung; `keine` = eine Gruppe ohne Kopf. */
type Gliederung = 'keine' | 'modul' | 'nachricht' | 'profil' | 'projekt';

const GLIEDERUNGEN: readonly { id: Gliederung; label: string }[] = [
  { id: 'keine', label: 'Ohne Gliederung' },
  { id: 'modul', label: 'Nach Fachmodul' },
  { id: 'nachricht', label: 'Nach Nachricht' },
  { id: 'profil', label: 'Nach Profilierung' },
  { id: 'projekt', label: 'Nach Projekt' },
];

type SortKey = 'name' | 'modul' | 'profil' | 'datum';

interface FilterWert {
  id: string;
  label: string;
  /** Treffer, wenn nur dieser Wert (zusaetzlich) gesetzt waere. */
  n: number;
  aktiv: boolean;
}

interface FilterAchse {
  key: AchsenKey;
  label: string;
  /** Werte in Mono setzen (Fachmodul-Kuerzel, Nachrichtennamen). */
  mono: boolean;
  werte: FilterWert[];
  aktiv: boolean;
}

/** Ein gesetzter Filter als Chip ueber der Sammlung. */
interface AktivChip {
  achse: string;
  label: string;
  key: AchsenKey | 'suche';
  id: string;
}

/**
 * Ein Abschnitt der Sammlung — je nach Gliederung Fachmodul, Nachricht,
 * Profilierung oder Projekt. Der Name `gruppen()` bleibt: er ist der
 * eingefuehrte Begriff dieser Ansicht.
 */
interface Gruppe {
  schluessel: string;
  label: string;
  /** Kopf in Mono (Fachmodul, Nachricht) oder in Textschrift. */
  mono: boolean;
  /** Ohne Gliederung gibt es genau eine Gruppe ohne Kopf. */
  zeigeKopf: boolean;
  items: TestmessageEntry[];
}

/**
 * Zentraler Testdaten-Speicher in der Optik der Profil-Uebersicht (Bibliothek
 * v4): links die Filterspalte mit Achsen (Fachmodul, Projekt, Profilierung,
 * Zustand, Schlagworte), rechts Kopf, Werkzeugzeile und die Sammlung als
 * Kacheln oder Liste. Upload nur fuer XJustiz-Nachrichten (Root `nachricht.*`);
 * Nachrichtenname/Fachmodul werden aus dem Wurzelelement abgeleitet
 * (parseTestmessage).
 *
 * Achsen kombinieren mit UND, Werte innerhalb einer Achse mit ODER — nur die
 * Schlagworte fordern alle gewaehlten zugleich (wie bisher). Die Zaehler an den
 * Werten sagen, wie viele Treffer der Klick braechte.
 *
 * Bleibt duenn: CRUD liegt im TestmessageStoreService.
 */
@Component({
  selector: 'app-testdaten',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    Bibliothek,
    Menu,
    KeinAutofillDirective,
    FileDropDirective,
    TagEingabe,
  ],
  templateUrl: './testdaten.html',
})
export class Testdaten {
  protected readonly store = inject(TestmessageStoreService);
  protected readonly state = inject(StateService);
  protected readonly rolle = inject(RolleService);
  private readonly toast = inject(ToastService);
  private readonly profiles = inject(ProfileStoreService);
  protected readonly projekte = inject(ProjektStoreService);
  private readonly persistence = inject(PersistenceService);
  private readonly start = inject(TestnachrichtStartService);
  private readonly creator = inject(TestmessageCreateService);
  private readonly edit = inject(TestmessageEditService);
  private readonly dl = inject(DownloadService);
  private readonly validator = inject(XmlValidationService);
  private readonly report = inject(ValidationReportService);
  private readonly vergleich = inject(VergleichService);
  private readonly einordnen = inject(EinordnenService);
  private readonly teilenService = inject(TeilenService);
  private readonly pruefung = inject(ProfilPruefungService);
  private readonly excel = inject(PruefberichtExcelService);
  private readonly ui = inject(UiSettingsService);

  private readonly uploadDlg = viewChild.required<ElementRef<HTMLDialogElement>>('uploadDlg');
  private readonly abnahmeDlg = viewChild.required<ElementRef<HTMLDialogElement>>('abnahmeDlg');
  private readonly editDlg = viewChild.required<ElementRef<HTMLDialogElement>>('editDlg');
  private readonly createDlg = viewChild.required<ElementRef<HTMLDialogElement>>('createDlg');
  private readonly pruefDlg = viewChild.required<ElementRef<HTMLDialogElement>>('pruefDlg');
  private readonly varianteDlg = viewChild.required<ElementRef<HTMLDialogElement>>('varianteDlg');

  constructor() {
    // Index beim Betreten der Ansicht auffrischen: das Kennzeichen "Profil
    // weiterentwickelt" haengt am serverseitigen Vergleich und veraltet, sobald
    // im Editor an einer gebundenen Profilierung gearbeitet wurde.
    void this.store.refresh().catch(() => {
      /* Backend offline — die vorhandene Liste bleibt stehen. */
    });
  }

  // ── Filter ──────────────────────────────────────────────────────────

  /**
   * Freitextsuche ueber den Speicher. Durchsucht wird, was auf der Kachel
   * steht bzw. sie ordnet: Name, Nachricht, Fachmodul, Notiz, Schlagworte,
   * Profilname.
   */
  protected readonly search = signal('');
  protected readonly fModul = signal<string[]>([]);
  /** Projekt-Ids; der leere String steht fuer „ohne Projekt" (#134). */
  protected readonly fProjekt = signal<string[]>([]);
  /** Ids der gebundenen Profilierungen — „ohne Bindung" ist ein Kennzeichen. */
  protected readonly fProfil = signal<string[]>([]);
  protected readonly fZustand = signal<Kennzeichen[]>([]);
  /**
   * Gewaehlte Schlagworte. Mehrere wirken zusammen (UND) — jeder Klick grenzt
   * weiter ein.
   */
  protected readonly gewaehlteTags = signal<string[]>([]);

  /** Gliederung und Ansicht ueberleben den Reload (Workshop-Betrieb). */
  protected readonly gliederung = this.ui.text('tdGliederung', 'modul');
  protected readonly ansicht = this.ui.text('tdAnsicht', 'kacheln');
  protected readonly gliederungen = GLIEDERUNGEN;
  protected readonly sortKey = signal<SortKey>('datum');
  protected readonly sortDir = signal<'auf' | 'ab'>('ab');

  /**
   * Profilierungen, an die ueberhaupt Testnachrichten gebunden sind. Ohne
   * Haeufigkeit: die Zahl an der Achse kommt aus dem Zaehler der Filterspalte,
   * der die uebrigen Eingrenzungen mitrechnet.
   */
  protected readonly profilFilterOptionen = computed<{ id: string; name: string }[]>(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const e of this.store.entries()) {
      if (!e.profilId || map.has(e.profilId)) continue;
      map.set(e.profilId, { id: e.profilId, name: e.profilName || '(ohne Namen)' });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  });

  /** Profilname nach id — die Gliederung und die Chips fragen je Eintrag danach. */
  private readonly profilNamen = computed(
    () => new Map(this.profilFilterOptionen().map((p) => [p.id, p.name])),
  );

  /** Laufende Generierung (Profil-id) — sperrt Doppelklicks im Dialog. */

  /**
   * Bibliotheksprofile, aus denen sich eine Nachricht erzeugen laesst.
   * Profilierungen mit Schema-Erweiterungen bleiben **gelistet** und werden nur
   * gesperrt (#98) — wer gerade eine Erweiterung angelegt hat, sucht sein
   * Profil hier und darf es nicht spurlos vermissen.
   */
  protected readonly profilKandidaten = computed<LibraryEntry[]>(() =>
    this.profiles.entries().filter((e) => !!e.nachricht),
  );

  /** Begruendung der Sperre im `title` des gesperrten Listeneintrags. */
  protected readonly erwGrund = ERW_SPERRE_GRUND;

  /** Schema-Erweiterungen sperren die Testnachricht-Erstellung (#98). */
  protected erwSperre(e: LibraryEntry): boolean {
    return sperrtPruefartefakte(e.nErw);
  }

  /** Vergebene Schlagworte des Speichers mit Haeufigkeit (Schlagwort-Achse). */
  protected readonly verfuegbareTags = computed(() =>
    tagOptionen(this.store.entries(), (e) => e.tags),
  );

  /**
   * Vorkommende Fachmodule, alphabetisch. **Nicht** in der Reihenfolge des
   * ersten Auftretens: der Index kommt neueste-zuerst, also haetten Achse,
   * Gliederung und Modul-Spaltensortierung sich mit jedem Upload umsortiert.
   */
  private readonly module = computed(() => {
    const set = new Set<string>();
    for (const e of this.store.entries()) set.add(e.fachmodul ?? '');
    return [...set].sort((a, b) => a.localeCompare(b, 'de'));
  });

  /** Vorkommende Nachrichtentypen, alphabetisch (Gliederung „Nach Nachricht"). */
  private readonly nachrichten = computed(() => {
    const set = new Set<string>();
    for (const e of this.store.entries()) set.add(e.nachricht ?? '');
    return [...set].sort((a, b) => a.localeCompare(b, 'de'));
  });

  /** Einordnen (#145): ein Dialog fuer Szenario, Projekt und Schlagworte. */
  protected openAblage(e: TestmessageEntry, ev: Event): void {
    ev.stopPropagation();
    this.einordnen.oeffneTestnachricht(e.id);
  }

  /** Bearbeiten-Dialog: aktive id + Puffer für Name, Beschreibung, Schlagworte. */
  protected readonly editId = signal<string | null>(null);
  protected readonly editName = signal('');
  protected readonly editNote = signal('');
  protected readonly editTags = signal('');

  /** Variante anlegen: Ausgangs-Eintrag, Namensvorschlag, laufende Anfrage. */
  protected readonly varianteEintrag = signal<TestmessageEntry | null>(null);
  protected readonly varianteName = signal('');
  protected readonly varianteLoading = signal(false);

  /**
   * Prueft einen Eintrag gegen alle Filter — bis auf die Achse `ohne`. So
   * zaehlt die Filterspalte je Wert, was ein Klick darauf braechte, statt was
   * er in der aktuellen Auswahl uebrig liesse (Muster: dashboard.ts).
   */
  private passt(e: TestmessageEntry, ohne?: AchsenKey): boolean {
    const q = this.search().trim().toLowerCase();
    if (q && !this.trifft(e, q)) return false;
    if (ohne !== 'modul' && this.fModul().length && !this.fModul().includes(e.fachmodul ?? ''))
      return false;
    if (
      ohne !== 'projekt' &&
      this.fProjekt().length &&
      !this.fProjekt().includes(e.projektId ?? '')
    )
      return false;
    if (ohne !== 'profil' && this.fProfil().length && !this.fProfil().includes(e.profilId ?? ''))
      return false;
    if (ohne !== 'zustand' && this.fZustand().length) {
      // ODER: eine Nachricht kann mehrere Kennzeichen zugleich tragen.
      const k = this.kennzeichenJe(e);
      if (!this.fZustand().some((z) => k.includes(z))) return false;
    }
    if (ohne !== 'tag' && this.gewaehlteTags().length && !hatAlleTags(e.tags, this.gewaehlteTags()))
      return false;
    return true;
  }

  private trifft(e: TestmessageEntry, q: string): boolean {
    return [e.name, e.nachricht, e.fachmodul, e.notiz, e.profilName, ...(e.tags ?? [])].some((v) =>
      (v || '').toLowerCase().includes(q),
    );
  }

  /**
   * Kennzeichen eines Eintrags — Grundlage der Zustands-Achse. Sie schliessen
   * sich nicht aus (Entwurf **und** an einer weiterentwickelten Profilierung).
   */
  protected kennzeichen(e: TestmessageEntry): Kennzeichen[] {
    const out: Kennzeichen[] = [];
    if (e.entwurf) out.push('entwurf');
    if (e.abgenommen) out.push(e.geaendertSeitAbnahme ? 'geaendert' : 'frei');
    if (e.profilWeiterentwickelt) out.push('weiterentwickelt');
    if (!e.profilId) out.push('ohneBindung');
    return out;
  }

  /**
   * Dieselben Kennzeichen, aber **einmal je Eintrag** statt je Filterpruefung:
   * `passt` und die Zustands-Achse fragen sie sonst bei jedem Tastendruck
   * Werte × Eintraege mal ab und legen dabei jedes Mal eine neue Liste an.
   */
  private readonly kennzeichenMap = computed(
    () => new Map(this.store.entries().map((e) => [e.id, this.kennzeichen(e)])),
  );

  private kennzeichenJe(e: TestmessageEntry): readonly Kennzeichen[] {
    return this.kennzeichenMap().get(e.id) ?? this.kennzeichen(e);
  }

  /** Alle Treffer, sortiert — die Grundlage jeder Gruppe. */
  protected readonly treffer = computed(() => {
    const dir = this.sortDir() === 'auf' ? 1 : -1;
    const k = this.sortKey();
    const module = this.module();
    return this.store
      .entries()
      .filter((e) => this.passt(e))
      .sort((a, b) => {
        let r: number;
        if (k === 'name') r = (a.name || '￿').localeCompare(b.name || '￿', 'de');
        else if (k === 'modul')
          r = module.indexOf(a.fachmodul ?? '') - module.indexOf(b.fachmodul ?? '');
        else if (k === 'profil') r = (a.profilName ?? '￿').localeCompare(b.profilName ?? '￿', 'de');
        else r = a.hochgeladen - b.hochgeladen;
        return r * dir;
      });
  });

  /**
   * Die Sammlung in Abschnitten nach der gewaehlten Gliederung. Die Filter
   * greifen davor, sodass nur Gruppen mit Treffern erscheinen — eine leere
   * Gruppenueberschrift waere beim Filtern nur Rauschen.
   */
  protected readonly gruppen = computed<Gruppe[]>(() => {
    const liste = this.treffer();
    const g = this.gliederung() as Gliederung;
    if (g === 'keine') {
      return liste.length
        ? [{ schluessel: '', label: '', mono: false, zeigeKopf: false, items: liste }]
        : [];
    }
    const schluesselVon = (e: TestmessageEntry): string => {
      if (g === 'modul') return e.fachmodul ?? '';
      if (g === 'nachricht') return e.nachricht ?? '';
      if (g === 'profil') return e.profilId ?? '';
      return e.projektId ?? '';
    };
    /**
     * Nur eine **Sortierhilfe**, keine Auswahl: die Gruppen entstehen aus den
     * Schluesseln, die in der gefilterten Liste wirklich vorkommen. Wer die
     * Reihenfolge als Auswahl nahm, verlor jeden Eintrag, dessen Projekt- oder
     * Profil-id der Index nicht (mehr) fuehrt — die Nachricht war dann in der
     * Gliederung unsichtbar, obwohl der Zaehler sie mitzaehlte.
     */
    const rang = new Map<string, number>(
      (g === 'modul'
        ? this.module()
        : g === 'nachricht'
          ? this.nachrichten()
          : g === 'profil'
            ? [...this.profilFilterOptionen().map((p) => p.id), '']
            : [...this.projekte.entries().map((p) => p.id), '']
      ).map((k, i) => [k, i]),
    );
    const labelVon = (k: string): string => {
      if (g === 'modul') return k || 'sonstige';
      if (g === 'nachricht') return k || 'keine Nachricht erkannt';
      if (g === 'profil')
        return k ? this.profilNameVon(k) || 'unbekannte Profilierung' : 'ohne Profilbindung';
      return k ? this.projektName(k) || 'unbekanntes Projekt' : 'ohne Projekt';
    };
    const gruppen = new Map<string, TestmessageEntry[]>();
    for (const e of liste) {
      const k = schluesselVon(e);
      const items = gruppen.get(k);
      if (items) items.push(e);
      else gruppen.set(k, [e]);
    }
    // Unbekanntes ans Ende, dort alphabetisch — es soll auffallen, nicht fehlen.
    const unbekannt = rang.size;
    return [...gruppen.keys()]
      .sort(
        (a, b) =>
          (rang.get(a) ?? unbekannt) - (rang.get(b) ?? unbekannt) ||
          labelVon(a).localeCompare(labelVon(b), 'de'),
      )
      .map((k) => ({
        schluessel: k,
        label: labelVon(k),
        mono: g === 'modul' || g === 'nachricht',
        zeigeKopf: true,
        items: gruppen.get(k) ?? [],
      }));
  });

  /**
   * Die Achsen der Filterspalte mit Zaehlern (Muster: dashboard.ts). Die
   * Grundmenge einer Achse wird **einmal** gefiltert, nicht je Wert erneut —
   * sonst laeuft bei jedem Tastendruck in der Suche Werte × Eintraege durch
   * `passt`.
   *
   * Bei den ODER-Achsen faellt die eigene Achse aus der Grundmenge: der
   * Zaehler sagt, was der Klick braechte. Die Schlagworte wirken dagegen mit
   * UND — dort zaehlt die Schnittmenge aus den bereits gewaehlten und diesem
   * einen, sonst verspraeche der Zaehler Treffer, die der Klick nicht bringt.
   */
  protected readonly achsen = computed<FilterAchse[]>(() => {
    const alle = this.store.entries();
    const achse = (
      key: AchsenKey,
      label: string,
      mono: boolean,
      werte: readonly { id: string; label: string }[],
      gewaehlt: readonly string[],
      trifft: (e: TestmessageEntry, id: string) => boolean,
    ): FilterAchse => {
      const basis = alle.filter((e) => this.passt(e, key === 'tag' ? undefined : key));
      return {
        key,
        label,
        mono,
        aktiv: gewaehlt.length > 0,
        werte: werte.map((w) => ({
          id: w.id,
          label: w.label,
          n: basis.filter((e) => trifft(e, w.id)).length,
          aktiv: gewaehlt.includes(w.id),
        })),
      };
    };
    const tagSchluessel = (t: string): string => t.toLocaleLowerCase('de');
    return [
      achse(
        'modul',
        'Fachmodule',
        true,
        this.module().map((m) => ({ id: m, label: m || 'sonstige' })),
        this.fModul(),
        (e, id) => (e.fachmodul ?? '') === id,
      ),
      achse(
        'projekt',
        'Projekte',
        false,
        [
          ...this.projekte.entries().map((p) => ({ id: p.id, label: p.name })),
          { id: '', label: 'ohne Projekt' },
        ],
        this.fProjekt(),
        (e, id) => (e.projektId ?? '') === id,
      ),
      achse(
        'profil',
        'Profilierungen',
        false,
        this.profilFilterOptionen().map((p) => ({ id: p.id, label: p.name })),
        this.fProfil(),
        (e, id) => e.profilId === id,
      ),
      achse(
        'zustand',
        'Zustand',
        false,
        KENNZEICHEN_ORDER.map((z) => ({ id: z, label: KENNZEICHEN_LABEL[z] })),
        this.fZustand(),
        (e, id) => this.kennzeichenJe(e).includes(id as Kennzeichen),
      ),
      achse(
        'tag',
        'Schlagworte',
        false,
        this.verfuegbareTags().map((t) => ({ id: t.tag, label: t.tag })),
        this.gewaehlteTags(),
        (e, id) => (e.tags ?? []).some((t) => tagSchluessel(t) === tagSchluessel(id)),
      ),
    ].filter((a) => a.werte.length > 0);
  });

  /** Gesetzte Filter als Chips ueber der Sammlung, in Achsenreihenfolge. */
  protected readonly aktiveChips = computed<AktivChip[]>(() => {
    const out: AktivChip[] = [];
    for (const m of this.fModul())
      out.push({ achse: 'Modul', label: m || 'sonstige', key: 'modul', id: m });
    for (const p of this.fProjekt())
      out.push({
        achse: 'Projekt',
        label: this.projektName(p) || 'ohne Projekt',
        key: 'projekt',
        id: p,
      });
    for (const p of this.fProfil())
      out.push({
        achse: 'Profil',
        label: this.profilNameVon(p) || '(ohne Namen)',
        key: 'profil',
        id: p,
      });
    for (const z of this.fZustand())
      out.push({ achse: 'Zustand', label: KENNZEICHEN_LABEL[z], key: 'zustand', id: z });
    for (const t of this.gewaehlteTags()) out.push({ achse: 'Tag', label: t, key: 'tag', id: t });
    const q = this.search().trim();
    if (q) out.push({ achse: 'Suche', label: `„${q}“`, key: 'suche', id: q });
    return out;
  });

  protected readonly hatFilter = computed(() => this.aktiveChips().length > 0);

  /** „12 Einträge" bzw. „4 von 12" — der Zaehler neben der Suche. */
  protected readonly trefferText = computed(() => {
    const n = this.treffer().length;
    const gesamt = this.store.entries().length;
    if (n !== gesamt) return `${n} von ${gesamt}`;
    return gesamt === 1 ? '1 Eintrag' : `${gesamt} Einträge`;
  });

  /** Einen Wert einer Achse an- bzw. abwaehlen. */
  protected schalte(key: AchsenKey, id: string): void {
    if (key === 'tag') {
      this.gewaehlteTags.set(schalteTag(this.gewaehlteTags(), id));
      return;
    }
    if (key === 'zustand') {
      this.fZustand.update((cur) =>
        cur.includes(id as Kennzeichen) ? cur.filter((x) => x !== id) : [...cur, id as Kennzeichen],
      );
      return;
    }
    const sig = key === 'modul' ? this.fModul : key === 'projekt' ? this.fProjekt : this.fProfil;
    sig.update((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  /** Eine Achse leeren (× am Achsenkopf). */
  protected leereAchse(key: AchsenKey): void {
    if (key === 'modul') this.fModul.set([]);
    else if (key === 'projekt') this.fProjekt.set([]);
    else if (key === 'profil') this.fProfil.set([]);
    else if (key === 'zustand') this.fZustand.set([]);
    else this.gewaehlteTags.set([]);
  }

  /** Chip entfernen — derselbe Weg wie der Klick in der Spalte. */
  protected entferneChip(c: AktivChip): void {
    if (c.key === 'suche') this.search.set('');
    else this.schalte(c.key, c.id);
  }

  protected resetAlles(): void {
    this.search.set('');
    this.fModul.set([]);
    this.fProjekt.set([]);
    this.fProfil.set([]);
    this.fZustand.set([]);
    this.gewaehlteTags.set([]);
  }

  /** Spaltenkopf der Liste: Klick sortiert, zweiter Klick dreht um. */
  protected sortiere(key: SortKey): void {
    if (this.sortKey() === key) this.sortDir.update((d) => (d === 'auf' ? 'ab' : 'auf'));
    else {
      this.sortKey.set(key);
      this.sortDir.set(key === 'datum' ? 'ab' : 'auf');
    }
  }

  protected sortPfeil(key: SortKey): string {
    return this.sortKey() === key ? (this.sortDir() === 'auf' ? ' ↑' : ' ↓') : '';
  }

  /** Ist das Schlagwort gerade als Filter gesetzt (Kachel-Chip hervorheben)? */
  protected tagAktiv(tag: string): boolean {
    const schluessel = tag.toLocaleLowerCase('de');
    return this.gewaehlteTags().some((t) => t.toLocaleLowerCase('de') === schluessel);
  }

  /**
   * Klick auf ein Schlagwort der Kachel: dasselbe wie ein Klick in der
   * Filterspalte — an- bzw. abwaehlen. `stopPropagation`, sonst oeffnete der
   * Klick die Nachricht darunter.
   */
  protected filtereNachTag(tag: string, ev: Event): void {
    ev.stopPropagation();
    this.gewaehlteTags.set(schalteTag(this.gewaehlteTags(), tag));
  }

  /** Name eines Projekts (leer, wenn es keines gibt). */
  protected projektName(id: string | undefined): string {
    return id ? (this.projekte.name(id) ?? '') : '';
  }

  /** Name der gebundenen Profilierung aus dem Index (ohne Zusatz-Request). */
  private profilNameVon(id: string): string {
    return id ? (this.profilNamen().get(id) ?? '') : '';
  }

  // ── Neu erstellen (gefuehrt aus Schema oder Profilierung) ───────────

  /**
   * Herkunft der neuen Testnachricht: "aus Schema" (Version + Nachricht waehlen)
   * oder "aus Profilierung" (Profil + zu bindende Fassung; Version und
   * Nachrichtentyp stammen dann aus der Profilierung). null = noch offen.
   */
  protected readonly createQuelle = signal<'schema' | 'profil' | null>(null);

  /** Im Dialog gewaehlte Schemaversion (null = noch keine gewaehlt). */
  protected readonly createVersion = signal<string | null>(null);
  protected readonly createLoading = signal(false);
  protected readonly msgFilter = signal('');

  /** Gewaehlte Profilierung und deren Fassungen (Arbeitsstand + Versionen). */
  protected readonly createProfil = signal<LibraryEntry | null>(null);
  protected readonly fassungen = signal<ProfilVersion[]>([]);
  /** Gewaehlte Fassung: '' = Arbeitsstand, sonst die id der Version. */
  protected readonly fassungWahl = signal('');

  /**
   * Waehlbare Schemata: hinterlegte Versionen, plus das aktuell geladene
   * Fremdschema (Ordner-Upload), falls vorhanden.
   */
  protected readonly versionOptionen = computed<{ id: string; label: string }[]>(() => {
    const opts = this.state
      .bundledVersions()
      .map((v) => ({ id: v.id, label: v.label || 'XJustiz ' + v.id }));
    const cur = this.state.version();
    if (this.state.idx() && !this.state.activeBundle() && cur && !opts.some((o) => o.id === cur)) {
      opts.push({ id: cur, label: `aktuell geladenes Schema (XJustiz ${cur})` });
    }
    return opts;
  });

  /** Nachrichten der gewaehlten Version, nach Filter. */
  protected readonly createMessages = computed<MessageRef[]>(() => {
    if (!this.createVersion()) return [];
    const idx = this.state.idx();
    if (!idx) return [];
    const f = this.msgFilter().toLowerCase();
    return idx.messages.filter(
      (m) => !f || m.name.toLowerCase().includes(f) || m.doc.toLowerCase().includes(f),
    );
  });

  /**
   * Einstieg von der Profil-Kachel (Issue #35): dieselbe Sitzung wie hier —
   * der Dialog oeffnet direkt in Schritt 2 (Fassungswahl) fuer die uebergebene
   * Profilierung. Die Anfrage kann gestellt worden sein, bevor diese Ansicht
   * existierte, darum ein Signal statt eines Aufrufs; sie wirkt genau einmal.
   */
  private readonly startAnfrage = effect(() => {
    const profil = this.start.anfrage();
    if (!profil) return;
    this.start.anfrage.set(null);
    this.openCreate();
    this.createQuelle.set('profil');
    void this.chooseProfil(profil);
  });

  protected openCreate(): void {
    this.createQuelle.set(null);
    this.createVersion.set(null);
    this.createProfil.set(null);
    this.fassungen.set([]);
    this.fassungWahl.set('');
    this.msgFilter.set('');
    void this.profiles
      .refresh()
      .catch(this.toast.fail('Profile konnten nicht geladen werden — Backend nicht erreichbar.'));
    this.createDlg().nativeElement.showModal();
  }

  /** Schritt 0: "aus Schema" oder "aus Profilierung". */
  protected waehleQuelle(q: 'schema' | 'profil'): void {
    this.createQuelle.set(q);
  }

  /**
   * Schritt 1 (aus Profilierung): Profil waehlen und dessen Fassungen laden.
   * Bei abgenommenen Profilierungen ist die Abnahme-Fassung vorbelegt — sonst
   * der Arbeitsstand.
   */
  protected async chooseProfil(e: LibraryEntry): Promise<void> {
    // Sperre bei Schema-Erweiterungen (#98). Der Listeneintrag ist gesperrt —
    // die Regel steht trotzdem hier, weil der Einstieg von der Profil-Kachel
    // (start.anfrage) denselben Weg nimmt.
    if (this.erwSperre(e)) {
      this.toast.show(ERW_SPERRE_GRUND);
      return;
    }
    if (this.createLoading()) return;
    this.createLoading.set(true);
    try {
      const list = await this.profiles.listVersions(e.id);
      this.fassungen.set(list);
      const abnahme = e.abgenommen ? list.find((v) => v.abnahme) : null;
      this.fassungWahl.set(abnahme?.id ?? '');
      this.createProfil.set(e);
    } catch {
      // Ohne Versionsliste bleibt der Arbeitsstand als einzige Fassung. Bei einer
      // abgenommenen Profilierung ist das die falsche Bindung — sonst wuerde
      // stillschweigend ein nicht abgenommener Stand gebunden.
      this.fassungen.set([]);
      this.fassungWahl.set('');
      this.createProfil.set(e);
      this.toast.show(
        e.abgenommen
          ? 'Fassungen nicht ladbar — vorbelegt ist der Arbeitsstand, nicht die freigegebene Fassung.'
          : 'Fassungen nicht ladbar — es steht nur der Arbeitsstand zur Wahl.',
      );
    } finally {
      this.createLoading.set(false);
    }
  }

  /** Beschriftung einer Version im Fassungs-Radio. */
  protected fassungLabel(v: ProfilVersion): string {
    const teile = [`v${v.nr}`];
    if (v.abnahme) teile.push('Freigabe-Fassung');
    if (v.kommentar) teile.push(v.kommentar);
    return teile.join(' · ');
  }

  /** Schritt 2 (aus Profilierung): Durchlauf mit Bindung an die Fassung starten. */
  protected async startAusProfil(): Promise<void> {
    const p = this.createProfil();
    if (!p || this.createLoading()) return;
    this.createLoading.set(true);
    try {
      await this.creator.neuAusProfil(p, this.fassungWahl() || null);
      this.createDlg().nativeElement.close();
    } catch (err) {
      this.toast.showError(err, 'Erstellen fehlgeschlagen.');
    } finally {
      this.createLoading.set(false);
    }
  }

  /** Schritt 1: Version waehlen (laedt bei Bedarf das hinterlegte Schema). */
  protected async chooseVersion(id: string): Promise<void> {
    if (this.createLoading()) return;
    this.createLoading.set(true);
    try {
      await this.persistence.ensureSchema(id);
      this.createVersion.set(id);
    } catch {
      this.toast.show('Schema konnte nicht geladen werden.');
    } finally {
      this.createLoading.set(false);
    }
  }

  /** Schritt 2: Nachricht waehlen — startet die gefuehrte Erstellung im Baum-Editor. */
  protected async chooseMessage(name: string): Promise<void> {
    if (this.createLoading()) return;
    this.createLoading.set(true);
    try {
      await this.creator.neuErstellen(this.createVersion() ?? undefined, name);
      this.createDlg().nativeElement.close();
    } catch (err) {
      this.toast.showError(err, 'Erstellen fehlgeschlagen.');
    } finally {
      this.createLoading.set(false);
    }
  }

  // ── Im Baum öffnen ──────────────────────────────────────────────────

  /**
   * Kachel-Klick: gefuehrt erstellte Nachrichten (gespeicherter
   * Entscheidungsstand) werden gefuehrt fortgesetzt, alle anderen wie bisher
   * zum Betrachten geoeffnet — beides entscheidet `edit.oeffneEintrag`,
   * damit ein geteilter Link dieselbe Tuer nimmt.
   */
  protected async openEntry(e: TestmessageEntry): Promise<void> {
    await this.oeffne(e, 'betrachten');
  }

  /** Kachel und Listenzeile sind per Tastatur erreichbar: Enter oder Leertaste oeffnet. */
  protected oeffneBeiTaste(ev: KeyboardEvent, e: TestmessageEntry): void {
    if (ev.target !== ev.currentTarget) return;
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    void this.openEntry(e);
  }

  /**
   * Kachel-Aktion "Bearbeiten": gefuehrt erstellte Nachrichten werden gefuehrt
   * fortgesetzt — dort ist der gespeicherte Entscheidungsstand die Wahrheit und
   * das Speichern trifft ohnehin denselben Eintrag. Alle anderen oeffnen als
   * editierbare Instanz im Baum.
   */
  protected async bearbeiten(e: TestmessageEntry, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (this.gesperrt(e)) return;
    await this.oeffne(e, 'bearbeiten');
  }

  private async oeffne(e: TestmessageEntry, modus: 'betrachten' | 'bearbeiten'): Promise<void> {
    try {
      await this.edit.oeffneEintrag(e, modus);
    } catch (err) {
      this.toast.showError(err, 'Nachricht konnte nicht geöffnet werden.');
    }
  }

  /**
   * Kachel-Aktion "Variante anlegen" (#133): oeffnet den Benennungs-Dialog.
   * Der Name kommt vor der Kopie — die Variante unterscheidet sich vom
   * Original in genau der Sache, die man beim Anlegen im Kopf hat ("mit zwei
   * Beteiligten"); nachtraeglich benannt hiessen die Kopien reihenweise
   * "… (Variante)".
   *
   * Auch bei freigegebenen Nachrichten erlaubt: die Kopie ruehrt das Original
   * nicht an, und gerade die freigegebenen sind die guten Ausgangspunkte.
   */
  protected variante(e: TestmessageEntry, ev: Event): void {
    ev.stopPropagation();
    this.varianteEintrag.set(e);
    this.varianteName.set(`${e.name || '(ohne Namen)'} (Variante)`);
    this.varianteDlg().nativeElement.showModal();
  }

  /**
   * Variante anlegen und gleich oeffnen: serverseitige Kopie unter dem
   * gewaehlten Namen, gebunden an den aktuellen Stand der Profilierung — danach
   * steht sie im Baum, denn angelegt wird sie, um sie zu aendern.
   *
   * Die Meldung nennt die gebundene Fassung: die Variante kann an einer
   * anderen haengen als ihr Original (dort eine ueberholte oder gar keine), und
   * das entscheidet ueber Ueberlagerung, Fuehrung und Sperren.
   */
  protected async submitVariante(): Promise<void> {
    const e = this.varianteEintrag();
    if (!e || this.varianteLoading()) return;
    this.varianteLoading.set(true);
    try {
      const kopie = await this.store.dupliziere(e.id, this.varianteName().trim());
      const bindung =
        kopie.profilName && kopie.fassung
          ? ` — gebunden an „${kopie.profilName}" (${kopie.fassung}).`
          : '.';
      this.toast.show(`Variante von „${e.name}" angelegt${bindung}`);
      this.varianteDlg().nativeElement.close();
      await this.edit.oeffneEintrag(kopie, 'bearbeiten');
    } catch (err) {
      this.toast.showError(err, 'Variante konnte nicht angelegt werden.');
    } finally {
      this.varianteLoading.set(false);
    }
  }

  /**
   * Kachel-Aktion "Link zum Teilen kopieren": der Link zeigt auf **diesen**
   * Eintrag, nicht auf eine Kopie — wer ihn oeffnet, sieht den jeweils
   * aktuellen Stand der Nachricht.
   */
  protected teilen(e: TestmessageEntry, ev: Event): void {
    ev.stopPropagation();
    void this.teilenService.kopiereTestnachrichtLink(e.id);
  }

  // ── Upload ──────────────────────────────────────────────────────────

  protected openUpload(): void {
    this.uploadDlg().nativeElement.showModal();
  }

  /** Dateien aus dem Auswahlfeld des Upload-Dialogs. */
  protected async onFiles(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.verarbeite(files);
  }

  /** Dateien, die auf der Ablageflaeche des Upload-Dialogs gelandet sind. */
  protected async onDrop(files: File[]): Promise<void> {
    await this.verarbeite(files);
  }

  /**
   * Der eine Weg vom Hochladen zur Nachricht — gleich ob per Auswahlfeld oder
   * Drag&Drop.
   *
   * **Eine** Datei wird direkt im Baum geoeffnet und noch nicht abgelegt: erst
   * beim Verlassen der Baumansicht wird gefragt, ob sie (unter welchem Namen)
   * in den Speicher soll. So sieht man die Nachricht, bevor man sich fuer sie
   * entscheidet. Mehrere Dateien sind ein Stapel-Import — da gibt es nichts zu
   * oeffnen, sie wandern wie bisher direkt in den Speicher.
   */
  private async verarbeite(files: File[]): Promise<void> {
    if (!files.length) return;
    if (files.length === 1) {
      await this.oeffneHochgeladene(files[0]!);
      return;
    }
    await this.legeStapelAb(files);
  }

  /** Einzelne hochgeladene Datei im Baum oeffnen (ohne Eintrag im Speicher). */
  private async oeffneHochgeladene(f: File): Promise<void> {
    try {
      await this.edit.oeffneHochgeladen(await f.text(), f.name);
    } catch (e) {
      this.toast.showError(e, 'Nachricht konnte nicht geöffnet werden.');
      return;
    }
    this.uploadDlg().nativeElement.close();
  }

  /**
   * Stapel-Import: einlesen, pruefen und anlegen. Eine nicht schema-valide
   * Nachricht wird **abgelegt, nicht abgewiesen** — sie bekommt das
   * Entwurfs-Kennzeichen und ihre Fehler in den Bericht. Testdaten sind auch
   * dann etwas wert, wenn sie (noch) nicht valide sind: Negativtests leben
   * davon, und eine abgewiesene Datei war schlicht weg. Abgelehnt wird nur, was
   * gar keine XJustiz-Nachricht ist.
   */
  private async legeStapelAb(files: File[]): Promise<void> {
    let ok = 0;
    let entwuerfe = 0;
    const abgelehnt: string[] = []; // kein XJustiz-XML
    const befunde: string[] = []; // Schemafehler der abgelegten Entwuerfe
    let fehler = 0; // Speichern fehlgeschlagen (Backend)
    for (const f of files) {
      const xml = await f.text();
      const meta = parseTestmessage(xml);
      if (!meta) {
        abgelehnt.push(f.name);
        continue;
      }
      const pruefung = await this.validator.validiere(xml);
      const entwurf = pruefung.status !== 'valide';
      if (entwurf) befunde.push(...pruefung.fehler.map((m) => `${f.name}: ${m}`));
      try {
        await this.store.create({
          name: f.name,
          xml,
          nachricht: meta.nachricht,
          fachmodul: meta.fachmodul,
          xjustizVersion: meta.xjustizVersion,
          groesse: xml.length,
          entwurf,
        });
        ok++;
        if (entwurf) entwuerfe++;
      } catch {
        fehler++;
      }
    }

    const teile: string[] = [];
    if (ok) teile.push(`${ok} hochgeladen`);
    if (entwuerfe) teile.push(`davon ${entwuerfe} als Entwurf (nicht schema-valide)`);
    if (abgelehnt.length) teile.push(`${abgelehnt.length} abgelehnt (keine XJustiz-Nachricht)`);
    if (fehler) teile.push(`${fehler} fehlgeschlagen (Backend nicht erreichbar)`);
    this.toast.show(teile.join(', ') || 'Nichts hochgeladen.');
    if (befunde.length) this.report.zeige('Als Entwurf hochgeladen — nicht schema-valide', befunde);
    if (ok && !abgelehnt.length && !fehler) this.uploadDlg().nativeElement.close();
  }

  // ── Prüfbericht ─────────────────────────────────────────────────────

  /**
   * Schemavalidierung fuer einen gespeicherten Eintrag ausfuehren und den
   * Befund anzeigen — jederzeit abrufbar, insbesondere fuer als Entwurf
   * gekennzeichnete Nachrichten (der Bericht beim Anlegen ist sonst weg).
   */
  protected async pruefe(e: TestmessageEntry, ev: Event): Promise<void> {
    ev.stopPropagation();
    try {
      const xml = await this.store.loadXml(e.id);
      if (xml == null) {
        this.toast.show('Nachricht nicht gefunden.');
        return;
      }
      const pruefung = await this.validator.validiere(xml);
      if (pruefung.status === 'valide') {
        this.toast.show(`„${e.name}" ist schema-valide.`);
      } else {
        const grund =
          pruefung.status === 'invalide' ? 'nicht schema-valide' : 'Validität nicht prüfbar';
        this.report.zeige(`Prüfbericht „${e.name}" — ${grund}`, pruefung.fehler);
      }
    } catch (err) {
      this.toast.showError(err, 'Prüfung fehlgeschlagen.');
    }
  }

  // ── Gegen eine Profilierung prüfen (#107) ───────────────────────────

  /**
   * Die zu prüfende Nachricht — gesetzt, solange der Prüf-Dialog offen ist.
   * Getrennt von `createProfil` & Co.: es ist ein anderer Vorgang, und beide
   * Dialoge dürfen sich nicht gegenseitig den Zustand wegräumen.
   */
  protected readonly pruefEintrag = signal<TestmessageEntry | null>(null);
  protected readonly pruefProfil = signal<LibraryEntry | null>(null);
  protected readonly pruefFassungen = signal<ProfilVersion[]>([]);
  /** Gewählte Fassung: '' = Arbeitsstand, sonst die id der Version. */
  protected readonly pruefFassungWahl = signal('');
  protected readonly pruefLaeuft = signal(false);

  /**
   * Profilierungen, gegen die sich **diese** Nachricht prüfen lässt:
   * gleicher Nachrichtentyp, gleiche XJustiz-Version (fehlende Angabe passt zu
   * allem). Die Regel liegt im Prüfdienst — der Picker zeigt sie nur an.
   */
  protected readonly pruefKandidaten = computed<LibraryEntry[]>(() => {
    const e = this.pruefEintrag();
    if (!e) return [];
    return this.profiles.entries().filter((p) => this.pruefung.passt(e, p));
  });

  protected openPruefung(e: TestmessageEntry, ev: Event): void {
    ev.stopPropagation();
    this.pruefEintrag.set(e);
    this.pruefProfil.set(null);
    this.pruefFassungen.set([]);
    this.pruefFassungWahl.set('');
    void this.profiles
      .refresh()
      .catch(this.toast.fail('Profile konnten nicht geladen werden — Backend nicht erreichbar.'));
    this.pruefDlg().nativeElement.showModal();
  }

  /**
   * Schritt 1: Profilierung wählen und ihre Fassungen laden. Vorbelegt ist die
   * **Abnahme-Fassung**, wo es eine gibt: ein Bericht gegen einen Stand, der
   * sich morgen ändert, taugt nicht als Nachweis.
   */
  protected async waehlePruefProfil(p: LibraryEntry): Promise<void> {
    if (this.pruefLaeuft()) return;
    this.pruefLaeuft.set(true);
    try {
      const list = await this.profiles.listVersions(p.id);
      this.pruefFassungen.set(list);
      const abnahme = p.abgenommen ? list.find((v) => v.abnahme) : null;
      this.pruefFassungWahl.set(abnahme?.id ?? '');
    } catch {
      this.pruefFassungen.set([]);
      this.pruefFassungWahl.set('');
      this.toast.show('Fassungen nicht ladbar — es steht nur der Arbeitsstand zur Wahl.');
    } finally {
      this.pruefLaeuft.set(false);
      this.pruefProfil.set(p);
    }
  }

  /** Schritt 2: prüfen und den Bericht zeigen. */
  protected async starteProfilPruefung(): Promise<void> {
    const eintrag = this.pruefEintrag();
    const profil = this.pruefProfil();
    if (!eintrag || !profil || this.pruefLaeuft()) return;
    this.pruefLaeuft.set(true);
    try {
      const bericht = await this.pruefung.pruefe(eintrag, profil, this.pruefFassungWahl() || null);
      this.pruefDlg().nativeElement.close();
      // Die Fassungswahl festhalten: der Dialog wird gleich zurückgesetzt, der
      // Bericht muss sie aber noch kennen (Klick auf einen Befund bindet sie).
      this.zeigeBericht(bericht, eintrag, profil, this.pruefFassungWahl());
    } catch (err) {
      this.toast.showError(err, 'Prüfung fehlgeschlagen.');
    } finally {
      this.pruefLaeuft.set(false);
    }
  }

  /**
   * Den Bericht in den Validierungs-Dialog geben. Ein Klick auf einen Befund
   * **öffnet** die Nachricht im Editor, bindet die geprüfte Fassung als Vorgabe
   * und springt zum Element — der Sprung allein trüge nicht, weil die Nachricht
   * gar nicht geladen ist.
   */
  private zeigeBericht(
    bericht: Pruefbericht,
    eintrag: TestmessageEntry,
    profil: LibraryEntry,
    wahl: string,
  ): void {
    this.report.zeigeMitPfaden(
      berichtTitel(eintrag.name, bericht),
      berichtEintraege(bericht),
      berichtKopfzeile(bericht.kopf),
      (pfad) => void this.oeffneBefund(eintrag, profil, wahl, pfad),
      {
        label: 'Als Excel herunterladen',
        starte: () =>
          void this.excel
            .exportiere(bericht)
            .catch(this.toast.fail('Excel-Export fehlgeschlagen.')),
      },
    );
  }

  /**
   * Vom Befund zum Element: die Nachricht laden (mit Bindung an die geprüfte
   * Fassung) und dorthin springen. Es ist ein Kontextwechsel — offene,
   * ungespeicherte Arbeit im Editor wird darum vorher erfragt.
   */
  private async oeffneBefund(
    eintrag: TestmessageEntry,
    profil: LibraryEntry,
    wahl: string,
    pfad: string,
  ): Promise<void> {
    try {
      const { doc } = await this.pruefung.ladeFassung(profil, wahl || null);
      await this.edit.oeffneFuerBefund(eintrag, doc, pfad);
    } catch (err) {
      this.toast.showError(err, 'Nachricht konnte nicht geöffnet werden.');
    }
  }

  // ── Umbenennen (Name + Beschreibung) ────────────────────────────────

  protected openEdit(e: TestmessageEntry, ev: Event): void {
    ev.stopPropagation();
    this.editId.set(e.id);
    this.editName.set(e.name || '');
    this.editNote.set(e.notiz || '');
    this.editTags.set(tagsAlsText(e.tags));
    this.editDlg().nativeElement.showModal();
  }

  protected submitEdit(): void {
    const id = this.editId();
    if (id) {
      const name = this.editName().trim();
      void this.store
        // Leerer Name ändert nichts (undefined) — der bestehende bleibt erhalten.
        .updateMeta(id, {
          name: name || undefined,
          notiz: this.editNote(),
          tags: normalisiereTags(this.editTags()),
        })
        .catch(this.toast.fail('Speichern fehlgeschlagen — Backend nicht erreichbar.'));
    }
    this.editDlg().nativeElement.close();
  }

  // ── Download / Löschen ──────────────────────────────────────────────

  /**
   * Die Nachricht als XML herunterladen. **Kein Tor mehr:** frueher blockierte
   * eine gescheiterte Schemapruefung den Download — damit kam man an die eigene
   * Datei nicht mehr heran, gerade bei den Faellen, die man weiterreichen will
   * (Negativtest, Fehlerbeispiel fuer den Hersteller). Ein Entwurf wird nur
   * benannt; was ihm fehlt, sagt der Pruefbericht der Kachel.
   */
  protected async download(e: TestmessageEntry, ev: Event): Promise<void> {
    ev.stopPropagation();
    try {
      const xml = await this.store.loadXml(e.id);
      if (xml == null) return;
      this.dl.download(this.dl.xmlFilename(e.name || (e.nachricht ?? '')), xml, 'application/xml');
      if (e.entwurf)
        this.toast.show('Heruntergeladen — die Nachricht ist als Entwurf gekennzeichnet.');
    } catch {
      this.toast.show('Download fehlgeschlagen — Backend nicht erreichbar.');
    }
  }

  protected remove(e: TestmessageEntry, ev: Event): void {
    ev.stopPropagation();
    const frage = e.abgenommen
      ? `Testnachricht „${e.name}" ist von der BLK-AG FREIGEGEBEN.\nLöschen entfernt den geschützten Stand samt eingefrorener Fassung unwiderruflich. Wirklich löschen?`
      : `Testnachricht „${e.name}" wirklich löschen?`;
    if (confirm(frage))
      void this.store
        .delete(e.id)
        .catch(this.toast.fail('Löschen fehlgeschlagen — Backend nicht erreichbar.'));
  }

  // ── Abnahme (BLK-AG) ────────────────────────────────────────────────

  protected readonly abnId = signal<string | null>(null);
  protected readonly abnKommentar = signal('');
  protected readonly abnEntry = computed(
    () => this.store.entries().find((e) => e.id === this.abnId()) ?? null,
  );

  /** Aktionen, die der Server fuer Externe an abgenommenen Objekten abweist. */
  protected gesperrt(e: TestmessageEntry): boolean {
    return !!e.abgenommen && !this.rolle.agAktiv();
  }

  /**
   * Vergleich gegen die eingefrorene Abnahme-Fassung — vom Kachel-Badge, der
   * Kachel-Aktion und aus dem Abnahme-Dialog. stopPropagation, weil ein Klick
   * auf die Kachel sonst die Nachricht oeffnen wuerde.
   */
  protected zeigeAbnahmeDiff(e: TestmessageEntry, ev: Event): void {
    ev.stopPropagation();
    this.abnahmeDlg().nativeElement.close();
    this.vergleich.oeffneTestnachricht(e.id);
  }

  protected openAbnahme(e: TestmessageEntry, ev: Event): void {
    ev.stopPropagation();
    this.abnId.set(e.id);
    this.abnKommentar.set('');
    this.abnahmeDlg().nativeElement.showModal();
  }

  protected async abnehmen(): Promise<void> {
    const id = this.abnId();
    if (!id) return;
    try {
      await this.store.abnehmen(id, this.abnKommentar().trim() || undefined);
      this.toast.show('Freigegeben — die aktuelle XML-Fassung ist als valide Fassung eingefroren.');
    } catch {
      this.toast.show(
        'Freigabe fehlgeschlagen — Backend nicht erreichbar oder Schlüssel ungültig.',
      );
    }
    this.abnahmeDlg().nativeElement.close();
  }

  protected async abnahmeEntfernen(): Promise<void> {
    const id = this.abnId();
    if (!id) return;
    try {
      await this.store.abnahmeEntfernen(id);
      this.toast.show('Freigabe-Kennzeichen samt eingefrorener Fassung entfernt.');
    } catch {
      this.toast.show(
        'Kennzeichen konnte nicht entfernt werden — Backend nicht erreichbar oder Schlüssel ungültig.',
      );
    }
    this.abnahmeDlg().nativeElement.close();
  }

  /** Die eingefrorene abgenommene Fassung herunterladen (valide Fassung). */
  protected async downloadAbnahme(e: TestmessageEntry, ev: Event): Promise<void> {
    ev.stopPropagation();
    try {
      const xml = await this.store.loadAbnahmeXml(e.id);
      if (xml == null) {
        this.toast.show('Keine freigegebene Fassung vorhanden.');
        return;
      }
      const name = this.dl.xmlFilename(e.name || (e.nachricht ?? ''), '.freigegeben');
      this.dl.download(name, xml, 'application/xml');
    } catch {
      this.toast.show('Download fehlgeschlagen — Backend nicht erreichbar.');
    }
  }

  /** Anzeigedatum der Abnahme (fuer Badge-Tooltip und Dialog). */
  protected abnDatum(e: TestmessageEntry): string {
    return e.abnahmeZeit
      ? new Date(e.abnahmeZeit).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
      : '';
  }

  // ── Profil-Herkunft (gebundene Testnachricht) ───────────────────────

  /** Kachel-Text der Herkunft: "aus Profil „X" (v3)". */
  protected herkunft(e: TestmessageEntry): string {
    return `aus Profil „${e.profilName || '(ohne Namen)'}"${e.fassung ? ` (${e.fassung})` : ''}`;
  }

  /**
   * Badge "Profil weiterentwickelt": zeigt feldgenau, was sich zwischen der
   * gebundenen Fassung und dem aktuellen Stand der Profilierung geaendert hat.
   * Die Testnachricht selbst bleibt unberuehrt — nachgezogen wird nichts.
   */
  protected zeigeVorgabeDiff(e: TestmessageEntry, ev: Event): void {
    ev.stopPropagation();
    if (!e.profilId) return;
    this.vergleich.oeffneVorgabe(e.id, e.profilId);
  }

  /**
   * Sprung in die gebundene Profilierung (Festlegung nachlesen). Die
   * Herkunftsangabe bleibt auch dann stehen, wenn das Profil geloescht wurde —
   * openFromLibrary meldet das dann.
   */
  protected oeffneProfil(e: TestmessageEntry, ev: Event): void {
    ev.stopPropagation();
    if (!e.profilId) return;
    void this.persistence.openFromLibrary(e.profilId);
  }

  // ── Anzeige-Helfer ──────────────────────────────────────────────────

  protected readonly firstLine = firstLine;

  protected groesse(e: TestmessageEntry): string {
    const kb = e.groesse / 1024;
    return kb < 1 ? `${e.groesse} B` : `${kb.toFixed(kb < 10 ? 1 : 0)} kB`;
  }

  /**
   * Datum der Kachel, gleiches Format wie in der Profil-Uebersicht (#91):
   * zweistellig mit fuehrenden Nullen, sonst stuenden "3.8.2026" und
   * "24.07.2026" in derselben Zeile nebeneinander.
   */
  protected datum(e: TestmessageEntry): string {
    return datumKurz(e.hochgeladen);
  }

  /** Nachrichtenname fuer die Mitte-Kuerzung (gemeinsam mit der Profil-Uebersicht). */
  protected msgKopf(e: TestmessageEntry): string {
    return nachrichtTeile(e.nachricht).kopf;
  }

  protected msgEnde(e: TestmessageEntry): string {
    return nachrichtTeile(e.nachricht).ende;
  }

  /** Fachmodul-Pille der Kachel und der Listenzeile. */
  protected modulVon(e: TestmessageEntry): string {
    return e.fachmodul || '—';
  }

  protected modulTitel(e: TestmessageEntry): string {
    return e.fachmodul ? `Fachmodul ${e.fachmodul}` : 'kein Fachmodul erkannt';
  }

  /**
   * Zustandspille der Kachel: die dringlichste Aussage zuerst. „valide" steht
   * fuer alles, was weder Entwurf noch freigegeben ist — es ist schema-valide
   * abgelegt worden.
   */
  protected zustandVon(e: TestmessageEntry): Zustand {
    if (e.abgenommen && e.geaendertSeitAbnahme) return 'geaendert';
    if (e.abgenommen) return 'frei';
    if (e.entwurf) return 'entwurf';
    return 'leer';
  }

  protected zustandKlasse(e: TestmessageEntry): string {
    return ZUSTAND[this.zustandVon(e)].klasse;
  }

  protected zustandLabel(e: TestmessageEntry): string {
    return ZUSTAND[this.zustandVon(e)].label;
  }

  /** Tooltip der Zustandspille — bei Freigabe mit Datum und Kommentar. */
  protected zustandTitel(e: TestmessageEntry): string {
    const z = this.zustandVon(e);
    if (z === 'geaendert')
      return 'Anzeigen, was sich gegenüber der freigegebenen Fassung geändert hat';
    if (z === 'frei')
      return `Von der BLK-AG freigegeben am ${this.abnDatum(e)}${e.abnahmeKommentar ? ' · ' + e.abnahmeKommentar : ''}`;
    if (z === 'entwurf')
      return 'Es sind noch Pflicht-Punkte offen oder die Nachricht ist nicht schema-valide — Details über den Prüfbericht';
    return 'Schema-valide abgelegt';
  }

  /** Schlagworte als Text der Listenspalte. */
  protected tagsText(e: TestmessageEntry): string {
    const t = e.tags ?? [];
    return t.length ? (t.length === 1 ? (t[0] ?? '') : `${t.length} Tags`) : '—';
  }

  /**
   * Stand als Kennzahl-Pille: im gefuehrten Durchlauf die Pflichtangaben, sonst
   * der Umfang der Nachricht — die Dateigroesse ist bei hochgeladenen
   * Nachrichten das Einzige, was sich ueber ihren Stand sagen laesst.
   */
  protected metaText(e: TestmessageEntry): string {
    const f = e.fortschritt;
    return f ? `${f.x} von ${f.y} Pflichtangaben` : this.groesse(e);
  }

  /** Dieselbe Aussage fuer die schmale Listenspalte. */
  protected metaKurz(e: TestmessageEntry): string {
    const f = e.fortschritt;
    return f ? `${f.x}/${f.y}` : this.groesse(e);
  }

  /** Farbgebung der Kennzahl-Pille (`.metaPill.meta-*`). */
  protected metaArt(e: TestmessageEntry): 'offen' | 'voll' | 'alt' {
    if (e.profilWeiterentwickelt) return 'alt';
    const f = e.fortschritt;
    if (!f) return 'alt';
    return f.x === f.y ? 'voll' : 'offen';
  }

  /**
   * Was frueher als eigene Pillen auf der Kachel stand und ihre Hoehe
   * schwanken liess (#91).
   */
  protected fussTitel(e: TestmessageEntry): string {
    const teile: string[] = [];
    // Im gefuehrten Durchlauf zeigt die Kennzahl-Pille die Pflichtangaben; die
    // Dateigroesse haette dann nirgends mehr gestanden.
    if (e.fortschritt) teile.push(`${e.fortschritt.x} von ${e.fortschritt.y} Pflichtangaben`);
    teile.push(this.groesse(e));
    teile.push(e.xjustizVersion ? `XJustiz ${e.xjustizVersion}` : 'Version unbekannt');
    if (e.notiz) teile.push(e.notiz);
    return teile.join(' · ');
  }
}
