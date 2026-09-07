import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { PersistenceService } from '../../core/services/persistence.service';
import { ToastService } from '../../core/services/toast.service';
import { StateService } from '../../core/services/state.service';
import { NavService } from '../../core/services/nav.service';
import { RolleService } from '../../core/services/rolle.service';
import { VergleichService } from '../../core/services/vergleich.service';
import { HinweisStoreService } from '../../core/services/hinweis-store.service';
import { TestnachrichtStartService } from '../../core/services/testnachricht-start.service';
import { TeilenService } from '../../core/services/teilen.service';
import { UiSettingsService } from '../../core/services/ui-settings.service';
import { Menu } from '../../shared/menu/menu';
import { LibraryEntry } from '../../models/profile.model';
import { fachmodulOf } from '../../core/util/fachmodul.util';
import { ERW_SPERRE_GRUND, sperrtPruefartefakte } from '../../core/util/erweiterung-sperre';
import { nachrichtTeile } from '../../core/util/pretty.util';
import { KeinAutofillDirective } from '../../shared/kein-autofill.directive';
import { NeuesProfilWizard } from '../dialogs/neues-profil-wizard';
import { Bibliothek } from '../../shared/bibliothek/bibliothek';
import { TagEingabe } from '../../shared/tag-eingabe/tag-eingabe';
import { ProjektStoreService } from '../../core/services/projekt-store.service';
import { EinordnenService } from '../../core/services/einordnen.service';
import {
  hatAlleTags,
  normalisiereTags,
  schalteTag,
  tagOptionen,
  tagsAlsText,
} from '../../core/util/tags.util';
import {
  ZUSTAND_LABEL,
  ZUSTAND_ORDER,
  Zustand,
  zustandVon,
} from '../../core/util/profil-zustand.util';

/** Die Achsen der Filterspalte. `hinweise` hat nur einen Wert (#43). */
type AchsenKey = 'modul' | 'projekt' | 'tag' | 'zustand' | 'hinweise' | 'version';

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
  /** Werte in Mono setzen (Fachmodul-Kuerzel, Versionsnummern). */
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

/** Gliederung der Sammlung; `keine` = eine Gruppe ohne Kopf. */
type Gliederung = 'keine' | 'modul' | 'projekt' | 'zustand' | 'version';

const GLIEDERUNGEN: readonly { id: Gliederung; label: string }[] = [
  { id: 'keine', label: 'Ohne Gliederung' },
  { id: 'modul', label: 'Nach Fachmodul' },
  { id: 'projekt', label: 'Nach Projekt' },
  { id: 'zustand', label: 'Nach Zustand' },
  { id: 'version', label: 'Nach XJustiz-Version' },
];

type SortKey = 'name' | 'modul' | 'projekt' | 'meta' | 'datum';

/** Ein Abschnitt der Sammlung — je nach Gliederung Fachmodul, Projekt, Zustand oder Version. */
interface Sektion {
  schluessel: string;
  label: string;
  /** Kopf in Mono (Fachmodul, Version) oder in Textschrift (Projekt, Zustand). */
  mono: boolean;
  /** Ohne Gliederung gibt es genau eine Sektion ohne Kopf. */
  zeigeKopf: boolean;
  items: LibraryEntry[];
}

/** Stand einer Profilierung als Kennzahl-Pille der Kachel bzw. Listenspalte. */
interface Meta {
  text: string;
  kurz: string;
  titel: string;
  art: 'offen' | 'voll' | 'alt';
}

/**
 * Uebersicht der Profilierungen (Startseite) nach dem v4-Entwurf: links die
 * Filterspalte mit Achsen (Fachmodul, Projekt, Schlagwort, Zustand, Hinweise,
 * Version), rechts Kopf, Werkzeugzeile und die Sammlung als Kacheln oder
 * Liste. Von hier werden Profile geoeffnet, neu angelegt, dupliziert,
 * umbenannt, geloescht sowie als Datei exportiert/importiert.
 *
 * Achsen kombinieren mit UND, Werte innerhalb einer Achse mit ODER — nur die
 * Schlagworte fordern alle gewaehlten zugleich (wie bisher). Die Zaehler an
 * den Werten sagen, wie viele Treffer der Klick brächte.
 *
 * Bleibt duenn: die Bibliotheks-CRUD liegt im ProfileStoreService, die
 * Oeffnen-/Neu-/Import-/Export-Orchestrierung im PersistenceService.
 */
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    Bibliothek,
    Menu,
    KeinAutofillDirective,
    NeuesProfilWizard,
    TagEingabe,
  ],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  protected readonly store = inject(ProfileStoreService);
  protected readonly projekte = inject(ProjektStoreService);
  private readonly einordnen = inject(EinordnenService);
  protected readonly rolle = inject(RolleService);
  private readonly persistence = inject(PersistenceService);
  private readonly toast = inject(ToastService);
  private readonly state = inject(StateService);
  private readonly nav = inject(NavService);
  private readonly vergleich = inject(VergleichService);
  private readonly hinweise = inject(HinweisStoreService);
  private readonly testnachrichtStart = inject(TestnachrichtStartService);
  private readonly teilenService = inject(TeilenService);
  private readonly ui = inject(UiSettingsService);
  private readonly renameDlg = viewChild.required<ElementRef<HTMLDialogElement>>('renameDlg');
  private readonly neuWizard = viewChild.required<NeuesProfilWizard>('neuWizard');
  private readonly abnahmeDlg = viewChild.required<ElementRef<HTMLDialogElement>>('abnahmeDlg');

  // ── Filter ──────────────────────────────────────────────────────────

  /**
   * Freitextsuche ueber die Bibliothek (#92). Durchsucht wird, was auf der
   * Kachel steht bzw. sie ordnet: Name, Nachricht, Fachmodul, Autor,
   * Beschreibung, Schlagworte, Projekt.
   */
  protected readonly search = signal('');
  protected readonly fModul = signal<string[]>([]);
  /** Projekt-Ids; der leere String steht fuer „ohne Projekt" (#134). */
  protected readonly fProjekt = signal<string[]>([]);
  /** Gewaehlte Schlagworte. Mehrere wirken zusammen (UND) — jeder Klick grenzt weiter ein. */
  protected readonly gewaehlteTags = signal<string[]>([]);
  protected readonly fZustand = signal<Zustand[]>([]);
  /** „nur mit offenen Hinweisen" (#43): die AG grenzt ihre Sitzungsvorbereitung ein. */
  protected readonly nurMitHinweisen = signal(false);
  protected readonly fVersion = signal<string[]>([]);

  /** Gliederung und Ansicht ueberleben den Reload (Workshop-Betrieb). */
  protected readonly gliederung = this.ui.text('dashGliederung', 'modul');
  protected readonly ansicht = this.ui.text('dashAnsicht', 'kacheln');
  protected readonly gliederungen = GLIEDERUNGEN;
  protected readonly sortKey = signal<SortKey>('datum');
  protected readonly sortDir = signal<'auf' | 'ab'>('ab');

  /** Vergebene Schlagworte der Bibliothek mit Haeufigkeit. */
  protected readonly verfuegbareTags = computed(() =>
    tagOptionen(this.store.entries(), (e) => e.tags),
  );

  /** Vorkommende Fachmodule in der Reihenfolge ihres ersten Auftretens. */
  private readonly module = computed(() => {
    const out: string[] = [];
    for (const e of this.store.entries()) {
      const m = fachmodulOf(e.nachricht);
      if (!out.includes(m)) out.push(m);
    }
    return out;
  });

  /** Vorkommende XJustiz-Versionen, neueste zuerst. */
  private readonly versionen = computed(() => {
    const set = new Set<string>();
    for (const e of this.store.entries()) if (e.xjustizVersion) set.add(e.xjustizVersion);
    return [...set].sort((a, b) => b.localeCompare(a, 'de', { numeric: true }));
  });

  /**
   * Prueft einen Eintrag gegen alle Filter — bis auf die Achse `ohne`. So
   * zaehlt die Filterspalte je Wert, was ein Klick darauf braechte, statt was
   * er in der aktuellen Auswahl uebrig liesse.
   */
  private passt(e: LibraryEntry, ohne?: AchsenKey): boolean {
    const q = this.search().trim().toLowerCase();
    if (q && !this.trifft(e, q)) return false;
    if (
      ohne !== 'modul' &&
      this.fModul().length &&
      !this.fModul().includes(fachmodulOf(e.nachricht))
    )
      return false;
    if (
      ohne !== 'projekt' &&
      this.fProjekt().length &&
      !this.fProjekt().includes(e.projektId ?? '')
    )
      return false;
    if (ohne !== 'tag' && this.gewaehlteTags().length && !hatAlleTags(e.tags, this.gewaehlteTags()))
      return false;
    if (
      ohne !== 'zustand' &&
      this.fZustand().length &&
      !this.fZustand().includes(this.zustandVon(e))
    )
      return false;
    if (ohne !== 'hinweise' && this.nurMitHinweisen() && !e.nHinweiseOffen) return false;
    if (
      ohne !== 'version' &&
      this.fVersion().length &&
      !this.fVersion().includes(e.xjustizVersion ?? '')
    )
      return false;
    return true;
  }

  /**
   * Sucht in Name, Nachrichtenname, Fachmodul und dem, was auf der Kachel
   * steht (Autor, Beschreibung, Schlagworte, Projekt). Das Fachmodul steckt
   * zwar schon im Nachrichtennamen, wird aber eigens geprueft: wer "enova"
   * tippt, meint die Gruppe.
   */
  private trifft(e: LibraryEntry, q: string): boolean {
    return [
      e.name,
      e.nachricht,
      fachmodulOf(e.nachricht),
      e.autor,
      e.beschreibung,
      this.projektName(e.projektId),
      ...(e.tags ?? []),
    ].some((v) => (v || '').toLowerCase().includes(q));
  }

  /** Alle Treffer, sortiert — die Grundlage jeder Sektion. */
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
          r = module.indexOf(fachmodulOf(a.nachricht)) - module.indexOf(fachmodulOf(b.nachricht));
        else if (k === 'projekt')
          r = this.projektName(a.projektId).localeCompare(this.projektName(b.projektId), 'de');
        else if (k === 'meta') r = (this.anteil(a) ?? -1) - (this.anteil(b) ?? -1);
        else r = this.zeit(a) - this.zeit(b);
        return r * dir;
      });
  });

  /**
   * Die Sammlung in Abschnitten nach der gewaehlten Gliederung. Die Filter
   * greifen davor, sodass nur Gruppen mit Treffern erscheinen — eine leere
   * Gruppenueberschrift waere beim Filtern nur Rauschen.
   */
  protected readonly sektionen = computed<Sektion[]>(() => {
    const liste = this.treffer();
    const g = this.gliederung() as Gliederung;
    if (g === 'keine') {
      return liste.length
        ? [{ schluessel: '', label: '', mono: false, zeigeKopf: false, items: liste }]
        : [];
    }
    const schluesselVon = (e: LibraryEntry): string => {
      if (g === 'modul') return fachmodulOf(e.nachricht);
      if (g === 'projekt') return e.projektId ?? '';
      if (g === 'zustand') return this.zustandVon(e);
      return e.xjustizVersion ?? '';
    };
    const reihenfolge: readonly string[] =
      g === 'modul'
        ? this.module()
        : g === 'projekt'
          ? [...this.projekte.entries().map((p) => p.id), '']
          : g === 'zustand'
            ? ZUSTAND_ORDER
            : [...this.versionen(), ''];
    const labelVon = (k: string): string => {
      if (g === 'modul') return k || 'ohne Nachricht';
      if (g === 'projekt') return this.projektName(k) || 'ohne Projekt';
      if (g === 'zustand') return ZUSTAND_LABEL[k as Zustand];
      return k ? `XJustiz ${k}` : 'ohne Version';
    };
    return reihenfolge
      .map((k) => ({ k, items: liste.filter((e) => schluesselVon(e) === k) }))
      .filter((x) => x.items.length)
      .map((x) => ({
        schluessel: x.k,
        label: labelVon(x.k),
        mono: g === 'modul' || g === 'version',
        zeigeKopf: true,
        items: x.items,
      }));
  });

  /** Die Achsen der Filterspalte mit Zaehlern. */
  protected readonly achsen = computed<FilterAchse[]>(() => {
    const alle = this.store.entries();
    const zaehle = (key: AchsenKey, trifft: (e: LibraryEntry) => boolean): number =>
      alle.filter((e) => this.passt(e, key) && trifft(e)).length;
    const achse = (
      key: AchsenKey,
      label: string,
      mono: boolean,
      werte: readonly { id: string; label: string }[],
      gewaehlt: readonly string[],
      trifft: (e: LibraryEntry, id: string) => boolean,
    ): FilterAchse => ({
      key,
      label,
      mono,
      aktiv: gewaehlt.length > 0,
      werte: werte.map((w) => ({
        id: w.id,
        label: w.label,
        n: zaehle(key, (e) => trifft(e, w.id)),
        aktiv: gewaehlt.includes(w.id),
      })),
    });
    const tagSchluessel = (t: string): string => t.toLocaleLowerCase('de');
    return [
      achse(
        'modul',
        'Fachmodule',
        true,
        this.module().map((m) => ({ id: m, label: m || 'ohne Nachricht' })),
        this.fModul(),
        (e, id) => fachmodulOf(e.nachricht) === id,
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
        'tag',
        'Schlagworte',
        false,
        this.verfuegbareTags().map((t) => ({ id: t.tag, label: t.tag })),
        this.gewaehlteTags(),
        (e, id) => (e.tags ?? []).some((t) => tagSchluessel(t) === tagSchluessel(id)),
      ),
      achse(
        'zustand',
        'Zustand',
        false,
        ZUSTAND_ORDER.map((z) => ({ id: z, label: ZUSTAND_LABEL[z] })),
        this.fZustand(),
        (e, id) => this.zustandVon(e) === id,
      ),
      achse(
        'hinweise',
        'Rückmeldungen',
        false,
        [{ id: 'offen', label: 'mit offenen Hinweisen' }],
        this.nurMitHinweisen() ? ['offen'] : [],
        (e) => !!e.nHinweiseOffen,
      ),
      achse(
        'version',
        'XJustiz-Version',
        true,
        this.versionen().map((v) => ({ id: v, label: v })),
        this.fVersion(),
        (e, id) => e.xjustizVersion === id,
      ),
    ].filter((a) => a.werte.length > 0);
  });

  /** Gesetzte Filter als Chips ueber der Sammlung, in Achsenreihenfolge. */
  protected readonly aktiveChips = computed<AktivChip[]>(() => {
    const out: AktivChip[] = [];
    for (const m of this.fModul())
      out.push({ achse: 'Modul', label: m || 'ohne Nachricht', key: 'modul', id: m });
    for (const p of this.fProjekt())
      out.push({
        achse: 'Projekt',
        label: this.projektName(p) || 'ohne Projekt',
        key: 'projekt',
        id: p,
      });
    for (const t of this.gewaehlteTags()) out.push({ achse: 'Tag', label: t, key: 'tag', id: t });
    for (const z of this.fZustand())
      out.push({ achse: 'Zustand', label: ZUSTAND_LABEL[z], key: 'zustand', id: z });
    if (this.nurMitHinweisen())
      out.push({ achse: 'Hinweise', label: 'offen', key: 'hinweise', id: 'offen' });
    for (const v of this.fVersion())
      out.push({ achse: 'Version', label: v, key: 'version', id: v });
    const q = this.search().trim();
    if (q) out.push({ achse: 'Suche', label: `„${q}“`, key: 'suche', id: q });
    return out;
  });

  protected readonly hatFilter = computed(() => this.aktiveChips().length > 0);

  /** „12 Einträge" bzw. „4 von 12" — der Zaehler neben der Suche. */
  protected readonly trefferText = computed(() => {
    const n = this.treffer().length;
    const gesamt = this.store.entries().length;
    return n === gesamt ? `${gesamt} Einträge` : `${n} von ${gesamt}`;
  });

  /** Einen Wert einer Achse an- bzw. abwaehlen. */
  protected schalte(key: AchsenKey, id: string): void {
    if (key === 'hinweise') {
      this.nurMitHinweisen.update((v) => !v);
      return;
    }
    if (key === 'tag') {
      this.gewaehlteTags.set(schalteTag(this.gewaehlteTags(), id));
      return;
    }
    const sig = key === 'modul' ? this.fModul : key === 'projekt' ? this.fProjekt : this.fVersion;
    if (key === 'zustand') {
      this.fZustand.update((cur) =>
        cur.includes(id as Zustand) ? cur.filter((x) => x !== id) : [...cur, id as Zustand],
      );
      return;
    }
    sig.update((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  /** Eine Achse leeren (× am Achsenkopf). */
  protected leereAchse(key: AchsenKey): void {
    if (key === 'modul') this.fModul.set([]);
    else if (key === 'projekt') this.fProjekt.set([]);
    else if (key === 'tag') this.gewaehlteTags.set([]);
    else if (key === 'zustand') this.fZustand.set([]);
    else if (key === 'hinweise') this.nurMitHinweisen.set(false);
    else this.fVersion.set([]);
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
    this.gewaehlteTags.set([]);
    this.fZustand.set([]);
    this.nurMitHinweisen.set(false);
    this.fVersion.set([]);
  }

  /** Ist das Schlagwort gerade als Filter gesetzt (Kachel-Chip hervorheben)? */
  protected tagAktiv(tag: string): boolean {
    const schluessel = tag.toLocaleLowerCase('de');
    return this.gewaehlteTags().some((t) => t.toLocaleLowerCase('de') === schluessel);
  }

  /**
   * Klick auf ein Schlagwort der Kachel: dasselbe wie ein Klick in der
   * Filterspalte — an- bzw. abwaehlen. `stopPropagation`, sonst oeffnete der
   * Klick die Profilierung darunter.
   */
  protected filtereNachTag(tag: string, ev: Event): void {
    ev.stopPropagation();
    this.gewaehlteTags.set(schalteTag(this.gewaehlteTags(), tag));
  }

  /** Spaltenkopf der Liste: Klick sortiert, zweiter Klick dreht um. */
  protected sortiere(key: SortKey): void {
    if (this.sortKey() === key) this.sortDir.update((d) => (d === 'auf' ? 'ab' : 'auf'));
    else {
      this.sortKey.set(key);
      this.sortDir.set(key === 'datum' || key === 'meta' ? 'ab' : 'auf');
    }
  }

  protected sortPfeil(key: SortKey): string {
    return this.sortKey() === key ? (this.sortDir() === 'auf' ? ' ↑' : ' ↓') : '';
  }

  // ── Anzeige je Eintrag ─────────────────────────────────────────────

  /** Abgeleitet, nicht gespeichert — die Regel steht in `profil-zustand.util`. */
  protected zustandVon(e: LibraryEntry): Zustand {
    return zustandVon(e);
  }

  protected zustandLabel(e: LibraryEntry): string {
    return ZUSTAND_LABEL[this.zustandVon(e)];
  }

  /** Tooltip der Zustandspille — bei Freigabe mit Datum und Kommentar. */
  protected zustandTitel(e: LibraryEntry): string {
    if (!e.abgenommen) return this.zustandLabel(e);
    if (e.geaendertSeitAbnahme)
      return `Anzeigen, was sich gegenüber der freigegebenen Fassung (v${e.abnahmeVersionNr}) geändert hat`;
    return `Von der BLK-AG freigegeben am ${this.abnDatum(e)}${e.abnahmeKommentar ? ' · ' + e.abnahmeKommentar : ''}`;
  }

  protected modulVon(e: LibraryEntry): string {
    return fachmodulOf(e.nachricht) || '—';
  }

  protected modulTitel(e: LibraryEntry): string {
    const m = fachmodulOf(e.nachricht);
    return m ? `Fachmodul ${m}` : 'noch keine Nachricht gewählt';
  }

  protected projektName(id: string | undefined): string {
    return id ? (this.projekte.name(id) ?? '') : '';
  }

  /** Nachrichtenname fuer die Mitte-Kuerzung (gemeinsam mit dem Testdatenspeicher). */
  protected msgKopf(e: LibraryEntry): string {
    return nachrichtTeile(e.nachricht).kopf;
  }

  protected msgEnde(e: LibraryEntry): string {
    return nachrichtTeile(e.nachricht).ende;
  }

  /**
   * Stand als Kennzahl: offene Entscheidungspunkte, „vollständig", oder im
   * Altbestand (kein Nenner) die Festlegungen.
   */
  protected meta(e: LibraryEntry): Meta {
    const a = this.anteil(e);
    if (a === null) {
      // Altbestand ohne Nenner: der Listenspalte reicht die Zahl der Festlegungen.
      const titel = this.fortschritt(e);
      const text = e.nStatus || e.nAusp ? `${e.nStatus} Festlegungen` : titel;
      const kurz = e.nStatus || e.nAusp ? `${e.nStatus} Festl.` : titel;
      return { text, kurz, titel, art: 'alt' };
    }
    const offen = (e.nPunkte ?? 0) - (e.nEntschieden ?? 0);
    if (offen > 0)
      return {
        text: `${offen} offen`,
        kurz: `${offen} off.`,
        titel: `${offen} von ${e.nPunkte} Entscheidungspunkten offen`,
        art: 'offen',
      };
    return {
      text: 'vollständig',
      kurz: 'vollst.',
      titel: `Alle ${e.nPunkte} Entscheidungspunkte entschieden`,
      art: 'voll',
    };
  }

  /**
   * Beschriftung des Rueckmelde-Badges: "3 Hinweise (2 extern)". Ohne externe
   * Rueckmeldungen entfaellt der Klammerzusatz (Issue #43).
   */
  protected hinweisBadge(e: LibraryEntry): string {
    const n = e.nHinweiseOffen ?? 0;
    const extern = e.nHinweiseExtern ?? 0;
    return `${n} ${n === 1 ? 'Hinweis' : 'Hinweise'}${extern ? ` (${extern} extern)` : ''}`;
  }

  /**
   * Was auf der Kachel keinen Platz hat: XJustiz-Version, eingefrorene
   * Staende, Entwurfs-Kennzeichen — im Tooltip des Datums.
   */
  protected fussTitel(e: LibraryEntry): string {
    const teile: string[] = [];
    if (e.xjustizVersion) teile.push(`XJustiz ${e.xjustizVersion}`);
    if (e.nVersionen) teile.push(`${e.nVersionen} Version${e.nVersionen === 1 ? '' : 'en'}`);
    if (e.geaendert && e.letzteVersionNr) teile.push(`geändert seit v${e.letzteVersionNr}`);
    return teile.join(' · ');
  }

  /** Schlagworte als Text der Listenspalte. */
  protected tagsText(e: LibraryEntry): string {
    const t = e.tags ?? [];
    return t.length ? (t.length === 1 ? (t[0] ?? '') : `${t.length} Tags`) : '—';
  }

  /**
   * Klick auf das Badge: Profilierung oeffnen und die Hinweis-Uebersicht
   * gleich mit — der Weg von "wo liegt etwas?" zu "was steht da?" (Issue #43).
   */
  protected zeigeHinweise(id: string, e: Event): void {
    e.stopPropagation();
    this.hinweise.uebersichtAnfrage.set(true);
    this.open(id);
  }

  /** Klick auf die Zustandspille: bei „seit Freigabe geändert" den Diff zeigen. */
  protected zustandKlick(e: LibraryEntry, ev: Event): void {
    if (e.abgenommen && e.geaendertSeitAbnahme) this.zeigeAbnahmeDiff(e.id, ev);
  }

  /**
   * Einstieg an der Profil-Kachel (Issue #35): der gefuehrte Durchlauf mit
   * Fassungswahl — derselbe Ablauf wie im Testdaten-Speicher, kein zweiter
   * Weg. Die Kachel kennt ihn nur; gestartet wird er dort, wo er lebt.
   */
  protected testnachrichtErstellen(e: LibraryEntry, ev: Event): void {
    ev.stopPropagation();
    this.testnachrichtStart.anfrage.set(e);
    this.state.view.set('testdaten');
  }

  /** Schema-Erweiterungen sperren die Testnachricht-Erstellung (#98). */
  protected erwSperre(e: LibraryEntry): boolean {
    return sperrtPruefartefakte(e.nErw);
  }

  /** Der `title` des Menuepunkts erklaert die Sperre, sonst den Ablauf. */
  protected testnachrichtTitel(e: LibraryEntry): string {
    return this.erwSperre(e)
      ? ERW_SPERRE_GRUND
      : 'Testnachricht zu dieser Profilierung erstellen — geführter Durchlauf mit Wahl der zu bindenden Fassung';
  }

  /** US "Schema ansehen": reine Schema-Ansicht ohne Profilierung oeffnen. */
  protected schemaAnsehen(): void {
    this.nav.openSchemaView();
  }

  /** Einordnen (#145): ein Dialog fuer Projekt und Schlagworte, global. */
  protected openAblage(e: LibraryEntry, ev: Event): void {
    ev.stopPropagation();
    this.einordnen.oeffneProfil(e.id);
  }

  /** Metadaten-Dialog der Kachel: aktive id + Puffer der vier Felder. */
  protected readonly renId = signal<string | null>(null);
  protected readonly renName = signal('');
  protected readonly renAutor = signal('');
  protected readonly renBeschr = signal('');
  protected readonly renTags = signal('');

  /** Kachel und Listenzeile sind per Tastatur erreichbar: Enter oder Leertaste oeffnet. */
  protected oeffneBeiTaste(ev: KeyboardEvent, id: string): void {
    if (ev.target !== ev.currentTarget) return;
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    this.open(id);
  }

  protected open(id: string): void {
    // Warnhinweis der AG-Rolle: ein geschuetzter Stand wird nie versehentlich
    // angefasst — Aenderungen erzeugen das Kennzeichen "geaendert seit Freigabe".
    const e = this.store.entries().find((x) => x.id === id);
    if (e?.abgenommen && this.rolle.agAktiv()) {
      const ok = confirm(
        `„${e.name || '(ohne Namen)'}" ist von der BLK-AG freigegeben.\n` +
          'Änderungen betreffen den geschützten Stand und kennzeichnen ihn als „geändert seit Freigabe“.\n' +
          'Trotzdem öffnen und bearbeiten?',
      );
      if (!ok) return;
    }
    void this.persistence.openFromLibrary(id);
  }

  /** Aktionen, die der Server fuer Externe an abgenommenen Objekten abweist. */
  protected gesperrt(e: LibraryEntry): boolean {
    return !!e.abgenommen && !this.rolle.agAktiv();
  }

  /**
   * „Neues Profil": der gefuehrte Anlege-Durchlauf (Version → Nachricht →
   * Angaben). Der Bibliothekseintrag entsteht erst am Ende des Wizards.
   */
  protected createNew(): void {
    this.neuWizard().open();
  }

  protected duplicate(id: string, e: Event): void {
    e.stopPropagation();
    void this.store
      .duplicate(id)
      .catch(this.toast.fail('Duplizieren fehlgeschlagen — Backend nicht erreichbar.'));
  }

  protected remove(id: string, e: Event): void {
    e.stopPropagation();
    const entry = this.store.entries().find((x) => x.id === id);
    const name = entry?.name || '(ohne Namen)';
    const frage = entry?.abgenommen
      ? `Profil „${name}" ist von der BLK-AG FREIGEGEBEN.\nLöschen entfernt den geschützten Stand samt Freigabe-Version unwiderruflich. Wirklich löschen?`
      : `Profil „${name}" wirklich löschen?`;
    if (confirm(frage))
      void this.store
        .delete(id)
        .catch(this.toast.fail('Löschen fehlgeschlagen — Backend nicht erreichbar.'));
  }

  // ── Abnahme (BLK-AG) ────────────────────────────────────────────────

  protected readonly abnId = signal<string | null>(null);
  protected readonly abnKommentar = signal('');
  protected readonly abnEntry = computed(
    () => this.store.entries().find((e) => e.id === this.abnId()) ?? null,
  );

  /**
   * Vergleich gegen die abgenommene Fassung — von der Zustandspille und aus
   * dem Abnahme-Dialog. stopPropagation, weil ein Klick auf die Karte sonst
   * das Profil oeffnen wuerde.
   */
  protected zeigeAbnahmeDiff(id: string, e: Event): void {
    e.stopPropagation();
    this.abnahmeDlg().nativeElement.close();
    this.vergleich.oeffneProfil(id);
  }

  protected openAbnahme(id: string, e: Event): void {
    e.stopPropagation();
    this.abnId.set(id);
    this.abnKommentar.set('');
    this.abnahmeDlg().nativeElement.showModal();
  }

  protected async abnehmen(): Promise<void> {
    const id = this.abnId();
    if (!id) return;
    try {
      const v = await this.store.abnehmen(id, this.abnKommentar().trim() || undefined);
      this.toast.show(`Freigegeben — Stand als Version v${v.nr} eingefroren.`);
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
      this.toast.show('Freigabe-Kennzeichen entfernt — die Freigabe-Version bleibt erhalten.');
    } catch {
      this.toast.show(
        'Kennzeichen konnte nicht entfernt werden — Backend nicht erreichbar oder Schlüssel ungültig.',
      );
    }
    this.abnahmeDlg().nativeElement.close();
  }

  /** Anzeigedatum der Abnahme (fuer Badge-Tooltip). */
  protected abnDatum(e: LibraryEntry): string {
    return e.abnahmeZeit
      ? new Date(e.abnahmeZeit).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
      : '';
  }

  protected async exportEntry(id: string, e: Event): Promise<void> {
    e.stopPropagation();
    try {
      await this.persistence.exportProfil(id);
    } catch {
      this.toast.show('Export fehlgeschlagen — Backend nicht erreichbar.');
    }
  }

  /**
   * Link auf diese Profilierung kopieren. Geteilt wird der Bibliothekseintrag,
   * nicht eine Kopie — der Empfaenger sieht den jeweils aktuellen Stand.
   */
  protected teilen(id: string, e: Event): void {
    e.stopPropagation();
    void this.teilenService.kopiereProfilLink(id);
  }

  /**
   * Metadaten-Dialog der Kachel: Name, Autor, Beschreibung und Schlagworte,
   * ohne die Profilierung zu oeffnen. Derselbe Satz Felder wie „Details…" im
   * Editor — wer nur einsortieren will, muss dafuer kein Schema laden.
   */
  protected openRename(id: string, e: Event): void {
    e.stopPropagation();
    const entry = this.store.entries().find((x) => x.id === id);
    this.renId.set(id);
    this.renName.set(entry?.name || '');
    this.renAutor.set(entry?.autor || '');
    this.renBeschr.set(entry?.beschreibung || '');
    this.renTags.set(tagsAlsText(entry?.tags));
    this.renameDlg().nativeElement.showModal();
  }

  protected submitRename(): void {
    const id = this.renId();
    if (id)
      void this.store
        .patchMeta(id, {
          name: this.renName().trim(),
          autor: this.renAutor().trim(),
          beschreibung: this.renBeschr().trim(),
          tags: normalisiereTags(this.renTags()),
        })
        .catch(this.toast.fail('Speichern fehlgeschlagen — Backend nicht erreichbar.'));
    this.renameDlg().nativeElement.close();
  }

  protected onImport(e: Event): void {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) void this.persistence.loadProfileFile(f);
    input.value = '';
  }

  /**
   * Fortschrittstext. Liegt der Stand der Entscheidungspunkte vor (#93),
   * zeigt er ihn — dieselbe Aussage wie der Editor oben rechts. Im Altbestand
   * (noch kein Autosave seit der Umstellung) bleibt es bei den Festlegungen.
   */
  protected fortschritt(e: LibraryEntry): string {
    const anteil = this.anteil(e);
    if (anteil !== null) return `${e.nEntschieden} von ${e.nPunkte} entschieden`;
    if (!e.nStatus && !e.nAusp) return 'noch leer';
    return `${e.nStatus} Festlegungen${e.nAusp ? ' · ' + e.nAusp + ' Ausprägungen' : ''}`;
  }

  /**
   * Anteil entschiedener Punkte (0-1), oder `null`, wenn er nicht bekannt ist —
   * dann gibt es keine Kennzahl statt einer erfundenen.
   */
  protected anteil(e: LibraryEntry): number | null {
    const { nEntschieden: x, nPunkte: y } = e;
    if (typeof x !== 'number' || typeof y !== 'number' || y <= 0) return null;
    return Math.min(1, Math.max(0, x / y));
  }

  /** Ausgeschriebener Prozentwert (Tooltip der Kennzahl-Pille). */
  protected anteilText(e: LibraryEntry): string {
    const a = this.anteil(e);
    return a === null ? '' : `${Math.round(a * 100)} % entschieden`;
  }

  /** Zeitstempel fuer die Sortierung: fachliches Speicherdatum, sonst letzte Sicherung. */
  private zeit(e: LibraryEntry): number {
    const t = e.gespeichert ? new Date(e.gespeichert).getTime() : e.aktualisiert;
    return Number.isNaN(t) ? e.aktualisiert : t;
  }

  /**
   * Datum der Kachel, einheitlich deutsch formatiert. `meta.gespeichert` liegt
   * als ISO-Datum vor, `aktualisiert` als Zeitstempel — nebeneinander standen
   * auf den Kacheln sonst "2026-07-24" und "3.8.2026" (#88).
   */
  protected datum(e: LibraryEntry): string {
    const roh = e.gespeichert ? new Date(e.gespeichert) : new Date(e.aktualisiert);
    if (Number.isNaN(roh.getTime())) return e.gespeichert ?? '';
    return roh.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
