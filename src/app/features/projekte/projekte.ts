import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ProjektStoreService } from '../../core/services/projekt-store.service';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { TestmessageStoreService } from '../../core/services/testmessage-store.service';
import { StateService } from '../../core/services/state.service';
import { ToastService } from '../../core/services/toast.service';
import { VergleichService } from '../../core/services/vergleich.service';
import { UeberlagerungService } from '../../core/services/ueberlagerung.service';
import { EinordnenService } from '../../core/services/einordnen.service';
import { PersistenceService } from '../../core/services/persistence.service';
import { TestmessageEditService } from '../../core/services/testmessage-edit.service';
import { TestnachrichtStartService } from '../../core/services/testnachricht-start.service';
import { LibraryEntry } from '../../models/profile.model';
import { TestmessageEntry } from '../../models/testmessage.model';
import { Projekt } from '../../models/projekt.model';
import { Bibliothek } from '../../shared/bibliothek/bibliothek';
import { Menu } from '../../shared/menu/menu';
import { KeinAutofillDirective } from '../../shared/kein-autofill.directive';
import { TagEingabe } from '../../shared/tag-eingabe/tag-eingabe';
import { normalisiereTags, schalteTag, tagOptionen, tagsAlsText } from '../../core/util/tags.util';
import { ZUSTAND_LABEL, zustandVon } from '../../core/util/profil-zustand.util';
import { fachmodulOf } from '../../core/util/fachmodul.util';

/**
 * Die Achsen der Filterspalte der Uebersicht. Muster und Bezeichner folgen der
 * Profil-Uebersicht (`features/dashboard/dashboard.ts`) und dem Testdaten-
 * Speicher — dieselbe Geste soll in allen drei Ansichten dasselbe tun.
 */
type AchsenKey = 'tag' | 'inhalt';

/**
 * Was ein Projekt enthaelt. Ein leeres Vorhaben zu finden ist so haeufig wie
 * das Gegenteil: es ist das, an dem noch zu arbeiten ist.
 */
type InhaltKey = 'mitSzenarien' | 'ohneSzenarien' | 'mitTestnachrichten';

const INHALT_LABEL: Record<InhaltKey, string> = {
  mitSzenarien: 'mit Szenarien',
  ohneSzenarien: 'ohne Szenarien',
  mitTestnachrichten: 'mit Testnachrichten',
};
const INHALT_ORDER: readonly InhaltKey[] = ['mitSzenarien', 'ohneSzenarien', 'mitTestnachrichten'];

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
 * Eine Zeile der Projektseite: eine Profilierung = ein Kommunikationsszenario,
 * darunter die Testnachrichten, die an ihr haengen.
 */
interface Szenario {
  profil: LibraryEntry;
  nachrichten: TestmessageEntry[];
}

/**
 * Ein Eintrag der Sprungliste links auf der Projektseite. Sie ersetzt dort die
 * Filterspalte: bei acht Szenarien ist die Frage nicht "welche zeigen?",
 * sondern "wo steht das eine, das ich suche?".
 */
interface Sprung {
  id: string;
  name: string;
  /** Fortschritt in Prozent; null, solange es keine Punkte gibt. */
  anteil: number | null;
  nTest: number;
  titel: string;
}

/**
 * Die Projektansicht (#135): Uebersicht der Projekte und — nach dem Klick auf
 * eine Kachel — die Projektseite mit ihren Szenarien.
 *
 * Zweistufig: Projekt → Profilierung (= Kommunikationsszenario) →
 * Testnachrichten. Eine Ablauf-Ebene gibt es bewusst nicht; Ersuchen und
 * Sachentscheidung sind zwei Zeilen, nicht ein Vorgang. Der Hin-/Rueckweg-Bezug
 * bleibt implizit ueber die Reihenfolge auf der Seite.
 *
 * Der eigentliche Zusammenhang, den diese Seite sichtbar macht, ist der, den
 * das Datenmodell schon kennt: `TestmessageEntry.profilId`. Die beiden
 * Kachelwaende zeigten ihn bisher nirgends.
 */
@Component({
  selector: 'app-projekte',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Bibliothek, Menu, KeinAutofillDirective, TagEingabe],
  templateUrl: './projekte.html',
})
export class Projekte {
  protected readonly store = inject(ProjektStoreService);
  private readonly profile = inject(ProfileStoreService);
  private readonly testmessages = inject(TestmessageStoreService);
  private readonly state = inject(StateService);
  private readonly toast = inject(ToastService);
  private readonly vergleich = inject(VergleichService);
  protected readonly ueberlagerung = inject(UeberlagerungService);
  private readonly einordnen = inject(EinordnenService);
  private readonly persistence = inject(PersistenceService);
  private readonly edit = inject(TestmessageEditService);
  private readonly testnachrichtStart = inject(TestnachrichtStartService);
  private readonly bearbeitenDlg =
    viewChild.required<ElementRef<HTMLDialogElement>>('bearbeitenDlg');
  /** Eigener Wirt: die Sprungliste sucht ihre Bloecke nur im eigenen Baum. */
  private readonly host = inject(ElementRef<HTMLElement>);

  constructor() {
    // Beim Betreten der Ansicht den Index frisch holen: die Zahlen am Projekt
    // (Szenarien/Testnachrichten) leitet der Server aus den Zuordnungen ab, und
    // die koennen sich seit dem letzten Laden in jeder anderen Ansicht geaendert
    // haben — die Komponente entsteht bei jedem Wechsel neu (@if in app.html).
    void this.store.refresh().catch(() => {
      /* Der Store hat den Fehler bereits geloggt; die Ansicht zeigt den letzten Stand. */
    });
  }

  /** Geoeffnetes Projekt (null = Uebersicht). */
  protected readonly offenesId = this.state.offenesProjekt;

  protected readonly offenes = computed<Projekt | null>(
    () => this.store.entries().find((p) => p.id === this.offenesId()) ?? null,
  );

  // ── Filter der Uebersicht ────────────────────────────────────────────

  /** Freitextsuche der Projektuebersicht: Name, Beschreibung, Schlagworte. */
  protected readonly search = signal('');
  /** Gewaehlte Schlagworte; innerhalb der Achse wirken sie mit ODER. */
  protected readonly gewaehlteTags = signal<string[]>([]);
  protected readonly fInhalt = signal<InhaltKey[]>([]);

  /** Vergebene Schlagworte aller Projekte (Achse und Vorschlaege im Dialog). */
  protected readonly verfuegbareTags = computed(() =>
    tagOptionen(this.store.entries(), (p) => p.tags),
  );

  /**
   * Prueft ein Projekt gegen alle Filter — bis auf die Achse `ohne`. So zaehlt
   * die Filterspalte je Wert, was ein Klick darauf braechte, statt was er in
   * der aktuellen Auswahl uebrig liesse (Muster: dashboard.ts).
   */
  private passt(p: Projekt, ohne?: AchsenKey): boolean {
    const q = this.search().trim().toLowerCase();
    if (
      q &&
      ![p.name, p.beschreibung, ...(p.tags ?? [])].some((v) => (v || '').toLowerCase().includes(q))
    )
      return false;
    if (ohne !== 'tag' && this.gewaehlteTags().length) {
      const vorhanden = new Set((p.tags ?? []).map((t) => t.toLocaleLowerCase('de')));
      if (!this.gewaehlteTags().some((t) => vorhanden.has(t.toLocaleLowerCase('de')))) return false;
    }
    if (ohne !== 'inhalt' && this.fInhalt().length) {
      if (!this.fInhalt().some((i) => this.hatInhalt(p, i))) return false;
    }
    return true;
  }

  /** Die drei Inhalts-Aussagen; `ohneSzenarien` ist das Gegenstueck, kein Rest. */
  private hatInhalt(p: Projekt, i: InhaltKey): boolean {
    if (i === 'mitSzenarien') return p.nProfile > 0;
    if (i === 'ohneSzenarien') return p.nProfile === 0;
    return p.nTestnachrichten > 0;
  }

  /** Die Treffer der Uebersicht — der Name bleibt, er ist eingefuehrt. */
  protected readonly gefiltert = computed(() => this.store.entries().filter((p) => this.passt(p)));

  /** Die Achsen der Filterspalte mit Zaehlern (Muster: dashboard.ts). */
  protected readonly achsen = computed<FilterAchse[]>(() => {
    const alle = this.store.entries();
    const zaehle = (key: AchsenKey, trifft: (p: Projekt) => boolean): number =>
      alle.filter((p) => this.passt(p, key) && trifft(p)).length;
    const schluessel = (t: string): string => t.toLocaleLowerCase('de');
    return [
      {
        key: 'tag' as const,
        label: 'Schlagworte',
        aktiv: this.gewaehlteTags().length > 0,
        werte: this.verfuegbareTags().map((t) => ({
          id: t.tag,
          label: t.tag,
          n: zaehle('tag', (p) => (p.tags ?? []).some((x) => schluessel(x) === schluessel(t.tag))),
          aktiv: this.tagAktiv(t.tag),
        })),
      },
      {
        key: 'inhalt' as const,
        label: 'Inhalt',
        aktiv: this.fInhalt().length > 0,
        werte: INHALT_ORDER.map((i) => ({
          id: i,
          label: INHALT_LABEL[i],
          n: zaehle('inhalt', (p) => this.hatInhalt(p, i)),
          aktiv: this.fInhalt().includes(i),
        })),
      },
    ].filter((a) => a.werte.length > 0);
  });

  /** Gesetzte Filter als Chips ueber der Sammlung, in Achsenreihenfolge. */
  protected readonly aktiveChips = computed<AktivChip[]>(() => {
    const out: AktivChip[] = [];
    for (const t of this.gewaehlteTags()) out.push({ achse: 'Tag', label: t, key: 'tag', id: t });
    for (const i of this.fInhalt())
      out.push({ achse: 'Inhalt', label: INHALT_LABEL[i], key: 'inhalt', id: i });
    const q = this.search().trim();
    if (q) out.push({ achse: 'Suche', label: `„${q}“`, key: 'suche', id: q });
    return out;
  });

  protected readonly hatFilter = computed(() => this.aktiveChips().length > 0);

  /** „12 Projekte" bzw. „4 von 12" — der Zaehler neben der Suche. */
  protected readonly trefferText = computed(() => {
    const n = this.gefiltert().length;
    const gesamt = this.store.entries().length;
    if (n !== gesamt) return `${n} von ${gesamt}`;
    return gesamt === 1 ? '1 Projekt' : `${gesamt} Projekte`;
  });

  /** Einen Wert einer Achse an- bzw. abwaehlen. */
  protected schalte(key: AchsenKey, id: string): void {
    if (key === 'tag') {
      this.gewaehlteTags.set(schalteTag(this.gewaehlteTags(), id));
      return;
    }
    this.fInhalt.update((cur) =>
      cur.includes(id as InhaltKey) ? cur.filter((x) => x !== id) : [...cur, id as InhaltKey],
    );
  }

  /** Eine Achse leeren (× am Achsenkopf). */
  protected leereAchse(key: AchsenKey): void {
    if (key === 'tag') this.gewaehlteTags.set([]);
    else this.fInhalt.set([]);
  }

  /** Chip entfernen — derselbe Weg wie der Klick in der Spalte. */
  protected entferneChip(c: AktivChip): void {
    if (c.key === 'suche') this.search.set('');
    else this.schalte(c.key, c.id);
  }

  protected resetAlles(): void {
    this.search.set('');
    this.gewaehlteTags.set([]);
    this.fInhalt.set([]);
  }

  /** Ist das Schlagwort gerade als Filter gesetzt (Kachel-Chip hervorheben)? */
  protected tagAktiv(tag: string): boolean {
    const schluessel = tag.toLocaleLowerCase('de');
    return this.gewaehlteTags().some((t) => t.toLocaleLowerCase('de') === schluessel);
  }

  /**
   * Klick auf ein Schlagwort der Kachel: dasselbe wie ein Klick in der
   * Filterspalte. `stopPropagation`, sonst oeffnete der Klick das Projekt
   * darunter.
   */
  protected filtereNachTag(tag: string, ev: Event): void {
    ev.stopPropagation();
    this.gewaehlteTags.set(schalteTag(this.gewaehlteTags(), tag));
  }

  /**
   * Die Szenarien des offenen Projekts: je zugeordneter Profilierung eine
   * Zeile, darunter ihre Testnachrichten. Sortiert nach Nachrichtentyp, damit
   * die Szenarien derselben Nachricht beieinanderstehen — bei GenUVA also die
   * beiden Ersuchen, dann die Sachentscheidungen.
   */
  protected readonly szenarien = computed<Szenario[]>(() => {
    const id = this.offenesId();
    if (!id) return [];
    const nachrichten = this.testmessages.entries().filter((t) => t.projektId === id);
    return this.profile
      .entries()
      .filter((p) => p.projektId === id)
      .sort(
        (a, b) =>
          (a.nachricht || '').localeCompare(b.nachricht || '', 'de') ||
          a.name.localeCompare(b.name, 'de'),
      )
      .map((profil) => ({
        profil,
        nachrichten: nachrichten
          .filter((t) => t.profilId === profil.id)
          .sort((a, b) => a.name.localeCompare(b.name, 'de')),
      }));
  });

  /**
   * Testnachrichten des Projekts, die an keiner zugeordneten Profilierung
   * haengen: Uploads mit eigener Zuordnung und Nachrichten, deren Profilierung
   * geloescht wurde. Sie stehen in einer Sammelzeile, statt unsichtbar zu sein
   * — sonst zaehlte die Kachel mehr, als die Seite auflistet.
   */
  protected readonly ohneSzenario = computed<TestmessageEntry[]>(() => {
    const id = this.offenesId();
    if (!id) return [];
    const profilIds = new Set(this.szenarien().map((s) => s.profil.id));
    return this.testmessages
      .entries()
      .filter((t) => t.projektId === id && !(t.profilId && profilIds.has(t.profilId)))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  });

  /**
   * Die Sprungliste links: ein Eintrag je Szenario, mit dem Anteil als Zahl.
   * Sie beantwortet dieselbe Frage wie die Filterspalte der Uebersicht — "wo
   * ist das eine, das ich suche?" —, nur ohne etwas auszublenden: auf der
   * Projektseite gehoert alles zusammen, was da steht.
   */
  protected readonly sprungliste = computed<Sprung[]>(() =>
    this.szenarien().map((s) => {
      const a = this.anteil(s.profil);
      const entschieden = s.profil.nEntschieden ?? 0;
      const punkte = s.profil.nPunkte ?? 0;
      return {
        id: s.profil.id,
        name: s.profil.name || '(ohne Namen)',
        anteil: a,
        nTest: s.nachrichten.length,
        titel:
          (punkte ? `${entschieden} von ${punkte} entschieden` : 'noch nichts entschieden') +
          ' · ' +
          this.zaehlText(s.nachrichten.length),
      };
    }),
  );

  /**
   * Zum Block eines Szenarios rollen. Gerollt wird `.dashMain` — Kopfleiste,
   * Sprungliste und Seitenkopf bleiben stehen, weil der Rahmen der Bibliothek
   * der Scroll-Container ist.
   */
  protected springe(id: string): void {
    const wirt = this.host.nativeElement as HTMLElement;
    wirt
      .querySelector('#szenario-' + CSS.escape(id))
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // ── Navigation ───────────────────────────────────────────────────────

  protected oeffne(id: string): void {
    this.offenesId.set(id);
  }

  /**
   * Tastatur-Auslöser der Kachel. Der Zielvergleich haelt Enter/Leertaste im
   * ⋯-Menue der Kachel zurueck — sonst oeffnete jede Menue-Bedienung zugleich
   * das Projekt.
   */
  protected oeffnePerTaste(id: string, ev: Event): void {
    if (ev.target !== ev.currentTarget) return;
    ev.preventDefault();
    this.oeffne(id);
  }

  protected zurUebersicht(): void {
    this.offenesId.set(null);
  }

  /** Eine Profilierung des Projekts oeffnen (wie ein Klick auf ihre Kachel). */
  protected oeffneProfil(e: LibraryEntry): void {
    void this.persistence.openFromLibrary(e.id);
  }

  /**
   * Eine Testnachricht oeffnen — betrachtend bzw. gefuehrt fortsetzen, genau
   * wie ein Klick auf ihre Kachel im Testdaten-Speicher.
   */
  protected async oeffneNachricht(e: TestmessageEntry): Promise<void> {
    try {
      await this.edit.oeffneEintrag(e);
    } catch (err) {
      this.toast.showError(err, 'Nachricht konnte nicht geöffnet werden.');
    }
  }

  /**
   * Eine Nachricht der Sammelzeile nachtraeglich einem Szenario zuordnen
   * (#141) — hier faellt die Luecke auf, also gehoert der Weg hierher.
   */
  protected zuordne(e: TestmessageEntry, ev: Event): void {
    ev.stopPropagation();
    this.einordnen.oeffneTestnachricht(e.id);
  }

  /**
   * Merkmals-Matrix (#136): alle Testnachrichten dieses Szenarios
   * nebeneinander. Der Knopf erscheint erst ab zwei Nachrichten — mit einer
   * gibt es nichts zu vergleichen.
   */
  protected vergleiche(e: LibraryEntry, ev: Event): void {
    ev.stopPropagation();
    this.vergleich.oeffneMatrix(e.id);
  }

  /**
   * Nachrichten-Ueberlagerung (#147): alle Testnachrichten dieses Szenarios
   * gemeinsam im Baum — je Blatt ein Wert-Kasten pro Nachricht. Die Matrix
   * daneben beantwortet dieselbe Frage als Tabelle; hier steht die Antwort am
   * Ort, an dem die Werte in der Nachricht stehen.
   */
  protected async ueberlagere(e: LibraryEntry, ev: Event): Promise<void> {
    ev.stopPropagation();
    try {
      await this.ueberlagerung.starteFuerProfil(e.id);
    } catch (err) {
      this.toast.showError(err, 'Die Testnachrichten konnten nicht überlagert werden.');
    }
  }

  /**
   * Weitere Testnachricht zu diesem Szenario: derselbe Einstieg wie an der
   * Profil-Kachel — der gefuehrte Durchlauf mit Bindung. Von hier ist er einen
   * Klick entfernt, statt erst die Bibliothek zu suchen.
   */
  protected neueTestnachricht(e: LibraryEntry, ev: Event): void {
    ev.stopPropagation();
    this.testnachrichtStart.anfrage.set(e);
    this.state.view.set('testdaten');
  }

  // ── Szenarien hinzufuegen (#145) ─────────────────────────────────────

  /**
   * Ohne diesen Weg war die Projektseite eine Sackgasse: sie zeigte, was
   * zugeordnet ist, liess aber nichts herein — zuordnen ging nur im ⋯-Menue
   * einer Kachel in der Profil-Uebersicht. Ein leeres Projekt konnte sich
   * selbst nicht fuellen.
   */
  private readonly hinzuDlg = viewChild.required<ElementRef<HTMLDialogElement>>('hinzuDlg');
  protected readonly hinzuSuche = signal('');
  protected readonly hinzuGewaehlt = signal<string[]>([]);
  protected readonly hinzuLaeuft = signal(false);

  /**
   * Waehlbar ist, was noch nicht in **diesem** Projekt liegt. Profilierungen
   * aus einem anderen Projekt bleiben in der Liste — sie umzuhaengen ist ein
   * gueltiger Wunsch —, tragen aber den Hinweis, wo sie herkommen.
   */
  protected readonly hinzuKandidaten = computed<LibraryEntry[]>(() => {
    const id = this.offenesId();
    const q = this.hinzuSuche().trim().toLowerCase();
    return this.profile
      .entries()
      .filter((e) => e.projektId !== id)
      .filter(
        (e) =>
          !q ||
          [e.name, e.nachricht, e.beschreibung].some((v) => (v || '').toLowerCase().includes(q)),
      )
      .sort(
        (a, b) =>
          (a.nachricht || '').localeCompare(b.nachricht || '', 'de') ||
          a.name.localeCompare(b.name, 'de'),
      );
  });

  /** Projektname einer Profilierung, die bereits woanders liegt. */
  protected fremdesProjekt(e: LibraryEntry): string | undefined {
    return e.projektId ? this.store.name(e.projektId) : undefined;
  }

  protected hinzuAktiv(id: string): boolean {
    return this.hinzuGewaehlt().includes(id);
  }

  protected hinzuSchalte(id: string): void {
    const g = this.hinzuGewaehlt();
    this.hinzuGewaehlt.set(g.includes(id) ? g.filter((x) => x !== id) : [...g, id]);
  }

  protected openHinzu(): void {
    this.hinzuSuche.set('');
    this.hinzuGewaehlt.set([]);
    this.hinzuDlg().nativeElement.showModal();
  }

  /**
   * Mehrere auf einmal: ein Vorhaben bringt selten genau ein Szenario mit, und
   * ein Dialog je Profilierung waere genau die Klickerei, die den Weg vorher
   * unbrauchbar machte.
   */
  protected async submitHinzu(): Promise<void> {
    const projektId = this.offenesId();
    const ids = this.hinzuGewaehlt();
    this.hinzuDlg().nativeElement.close();
    if (!projektId || !ids.length) return;
    this.hinzuLaeuft.set(true);
    try {
      for (const id of ids) await this.profile.einsortieren(id, { projektId });
      await this.store.refresh();
      this.toast.show(
        ids.length === 1 ? 'Szenario hinzugefügt.' : `${ids.length} Szenarien hinzugefügt.`,
      );
    } catch (err) {
      this.toast.showError(err, 'Hinzufügen fehlgeschlagen.');
    } finally {
      this.hinzuLaeuft.set(false);
    }
  }

  /** Ein Szenario aus dem Projekt nehmen (die Profilierung bleibt bestehen). */
  protected async entferneSzenario(e: LibraryEntry, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (
      !confirm(`„${e.name}" aus diesem Projekt nehmen?\n\nDie Profilierung selbst bleibt erhalten.`)
    )
      return;
    try {
      await this.profile.einsortieren(e.id, { projektId: null });
      await this.store.refresh();
    } catch (err) {
      this.toast.showError(err, 'Entfernen fehlgeschlagen.');
    }
  }

  // ── Projekt anlegen und pflegen ──────────────────────────────────────

  /** Bearbeiten-Dialog: aktive id (null = neues Projekt) + Puffer der Felder. */
  protected readonly bearbId = signal<string | null>(null);
  protected readonly bearbName = signal('');
  protected readonly bearbBeschr = signal('');
  protected readonly bearbTags = signal('');

  protected openNeu(): void {
    this.bearbId.set(null);
    this.bearbName.set('');
    this.bearbBeschr.set('');
    this.bearbTags.set('');
    this.bearbeitenDlg().nativeElement.showModal();
  }

  /** Das offene Projekt bearbeiten — von der Projektseite aus. */
  protected openBearbeitenOffenes(ev: Event): void {
    const p = this.offenes();
    if (p) this.openBearbeiten(p, ev);
  }

  protected openBearbeiten(p: Projekt, ev: Event): void {
    ev.stopPropagation();
    this.bearbId.set(p.id);
    this.bearbName.set(p.name);
    this.bearbBeschr.set(p.beschreibung ?? '');
    this.bearbTags.set(tagsAlsText(p.tags));
    this.bearbeitenDlg().nativeElement.showModal();
  }

  protected async submitBearbeiten(): Promise<void> {
    const id = this.bearbId();
    const name = this.bearbName().trim();
    this.bearbeitenDlg().nativeElement.close();
    if (!name) return;
    const patch = {
      name,
      beschreibung: this.bearbBeschr().trim(),
      tags: normalisiereTags(this.bearbTags()),
    };
    try {
      if (id) await this.store.update(id, patch);
      else this.offenesId.set(await this.store.create(patch));
    } catch (err) {
      this.toast.showError(err, 'Projekt konnte nicht gespeichert werden.');
    }
  }

  /**
   * Projekt loeschen: entfernt **nur die Zuordnungen**, nie Inhalte. Die beiden
   * anderen Indizes tragen danach eine veraltete `projektId` und werden neu
   * geladen — der ProjektStore kennt sie bewusst nicht.
   */
  protected async loesche(p: Projekt, ev: Event): Promise<void> {
    ev.stopPropagation();
    const zahl = p.nProfile + p.nTestnachrichten;
    if (
      !confirm(
        `Projekt „${p.name}" löschen?\n\n` +
          (zahl
            ? `Die ${p.nProfile} Profilierung(en) und ${p.nTestnachrichten} Testnachricht(en) bleiben erhalten — sie liegen danach in keinem Projekt mehr.`
            : 'Das Projekt ist leer.'),
      )
    )
      return;
    try {
      await this.store.delete(p.id);
      if (this.offenesId() === p.id) this.offenesId.set(null);
      await Promise.all([this.profile.refresh(), this.testmessages.refresh()]);
    } catch (err) {
      this.toast.showError(err, 'Projekt konnte nicht gelöscht werden.');
    }
  }

  // ── Anzeige ──────────────────────────────────────────────────────────

  /** Fortschritt einer Profilierung als Anteil (wie auf der Profil-Kachel). */
  protected anteil(e: LibraryEntry): number | null {
    if (!e.nPunkte) return null;
    return Math.round(((e.nEntschieden ?? 0) / e.nPunkte) * 100);
  }

  /**
   * "3 Testnachrichten" am Kopf der Zeile — die Zahl findet sich so, ohne
   * Eintraege zu zaehlen. Bei null uebernimmt der Leerzustand die Aussage.
   */
  protected zaehlText(n: number): string {
    return n === 1 ? '1 Testnachricht' : `${n} Testnachrichten`;
  }

  /** Datum der letzten Aenderung im Kachelfuss. */
  protected datum(p: Projekt): string {
    const roh = new Date(p.aktualisiert);
    if (Number.isNaN(roh.getTime())) return '';
    return roh.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  /** Fachmodul-Kuerzel der Szenario-Zeile (wie auf der Profil-Kachel). */
  protected modulVon(e: LibraryEntry): string {
    return fachmodulOf(e.nachricht) || '—';
  }

  protected modulTitel(e: LibraryEntry): string {
    const m = fachmodulOf(e.nachricht);
    return m ? `Fachmodul ${m}` : 'noch keine Nachricht gewählt';
  }

  /** Kurzform des Nachrichtentyps fuer die Szenario-Zeile. */
  protected nachrichtKurz(e: LibraryEntry): string {
    return e.nachricht || '(keine Nachricht)';
  }

  /**
   * Zustandspille des Szenarios — dieselbe Ableitung wie auf der Profil-Kachel
   * (`core/util/profil-zustand.util`), damit dasselbe Profil in beiden
   * Ansichten dasselbe sagt.
   */
  protected zustandKlasse(e: LibraryEntry): string {
    return 'z-' + zustandVon(e);
  }

  protected zustandLabel(e: LibraryEntry): string {
    return ZUSTAND_LABEL[zustandVon(e)];
  }
}
