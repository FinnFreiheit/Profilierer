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
import { RolleBadge } from '../../shared/rolle-badge/rolle-badge';
import { BetaBadge } from '../../shared/beta-badge/beta-badge';
import { Menu } from '../../shared/menu/menu';
import { KeinAutofillDirective } from '../../shared/kein-autofill.directive';
import { TagEingabe } from '../../shared/tag-eingabe/tag-eingabe';
import { normalisiereTags, tagOptionen, tagsAlsText } from '../../core/util/tags.util';

/**
 * Eine Zeile der Projektseite: eine Profilierung = ein Kommunikationsszenario,
 * darunter die Testnachrichten, die an ihr haengen.
 */
interface Szenario {
  profil: LibraryEntry;
  nachrichten: TestmessageEntry[];
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
  imports: [BetaBadge, RolleBadge, Menu, KeinAutofillDirective, TagEingabe],
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

  /** Freitextsuche der Projektuebersicht: Name, Beschreibung, Schlagworte. */
  protected readonly search = signal('');

  protected readonly gefiltert = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.store.entries();
    return this.store
      .entries()
      .filter((p) =>
        [p.name, p.beschreibung, ...(p.tags ?? [])].some((v) =>
          (v || '').toLowerCase().includes(q),
        ),
      );
  });

  /** Vergebene Schlagworte aller Projekte (Vorschlaege im Dialog). */
  protected readonly verfuegbareTags = computed(() =>
    tagOptionen(this.store.entries(), (p) => p.tags),
  );

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

  protected goDashboard(): void {
    this.state.view.set('dashboard');
  }

  protected goTestdaten(): void {
    this.state.view.set('testdaten');
  }

  protected goHowto(): void {
    this.state.view.set('howto');
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

  /** Kurzform des Nachrichtentyps fuer die Szenario-Zeile. */
  protected nachrichtKurz(e: LibraryEntry): string {
    return e.nachricht || '(keine Nachricht)';
  }
}
