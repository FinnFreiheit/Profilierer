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
import { RolleBadge } from '../../shared/rolle-badge/rolle-badge';
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
import { firstLine } from '../../core/util/pretty.util';
import { KeinAutofillDirective } from '../../shared/kein-autofill.directive';
import { TagFilter } from '../../shared/tag-filter/tag-filter';
import { TagEingabe } from '../../shared/tag-eingabe/tag-eingabe';
import { ProjektStoreService } from '../../core/services/projekt-store.service';
import {
  hatAlleTags,
  normalisiereTags,
  schalteTag,
  tagOptionen,
  tagsAlsText,
} from '../../core/util/tags.util';

/** Eine Fachmodul-Gruppe fuer die Kachel-Ansicht. */
interface Gruppe {
  fachmodul: string;
  items: TestmessageEntry[];
}

/**
 * Zentraler Testdaten-Speicher: hochgeladene XJustiz-Instanzen als Kachel-Grid,
 * nach Fachmodul gruppiert. Upload nur fuer XJustiz-Nachrichten (Root
 * `nachricht.*`); Nachrichtenname/Fachmodul werden aus dem Wurzelelement
 * abgeleitet (parseTestmessage). Notizen und Download je Kachel.
 *
 * Bleibt duenn: CRUD liegt im TestmessageStoreService.
 */
@Component({
  selector: 'app-testdaten',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RolleBadge, Menu, KeinAutofillDirective, TagFilter, TagEingabe],
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

  private readonly uploadDlg = viewChild.required<ElementRef<HTMLDialogElement>>('uploadDlg');
  private readonly abnahmeDlg = viewChild.required<ElementRef<HTMLDialogElement>>('abnahmeDlg');
  private readonly editDlg = viewChild.required<ElementRef<HTMLDialogElement>>('editDlg');
  private readonly createDlg = viewChild.required<ElementRef<HTMLDialogElement>>('createDlg');
  private readonly pruefDlg = viewChild.required<ElementRef<HTMLDialogElement>>('pruefDlg');

  constructor() {
    // Index beim Betreten der Ansicht auffrischen: das Kennzeichen "Profil
    // weiterentwickelt" haengt am serverseitigen Vergleich und veraltet, sobald
    // im Editor an einer gebundenen Profilierung gearbeitet wurde.
    void this.store.refresh().catch(() => {
      /* Backend offline — die vorhandene Liste bleibt stehen. */
    });
  }

  protected readonly search = signal('');

  /** Filter "nur abgenommene" (valide Testdaten der BLK-AG schnell finden). */
  protected readonly nurAbgenommene = signal(false);

  /**
   * Filter nach Profilierung: id der gebundenen Profilierung, '' = alle.
   * Arbeitet auf dem geladenen Index (die Herkunft steht dort bereits) — kein
   * Zusatz-Request, und die Auswahlliste bleibt vollstaendig.
   */
  protected readonly nurProfil = signal('');

  /** Profilierungen, an die ueberhaupt Testnachrichten gebunden sind. */
  protected readonly profilFilterOptionen = computed<{ id: string; name: string; n: number }[]>(
    () => {
      const map = new Map<string, { id: string; name: string; n: number }>();
      for (const e of this.store.entries()) {
        if (!e.profilId) continue;
        const t = map.get(e.profilId);
        if (t) t.n++;
        else map.set(e.profilId, { id: e.profilId, name: e.profilName || '(ohne Namen)', n: 1 });
      }
      return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    },
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

  /**
   * Gewaehlte Schlagworte der Filterleiste. Mehrere wirken zusammen (UND) —
   * jeder Klick grenzt weiter ein.
   */
  protected readonly gewaehlteTags = signal<string[]>([]);

  /** Filter "nur ein Projekt" (#134) — neben dem Filter nach Profilierung. */
  protected readonly nurProjekt = signal('');

  /** Vergebene Schlagworte des Speichers mit Haeufigkeit (Filterleiste). */
  protected readonly verfuegbareTags = computed(() =>
    tagOptionen(this.store.entries(), (e) => e.tags),
  );

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

  /** Gefiltert (Suche) und nach Fachmodul → Nachricht gruppiert. */
  protected readonly gruppen = computed<Gruppe[]>(() => {
    const q = this.search().trim().toLowerCase();
    const profil = this.nurProfil();
    const list = this.store
      .entries()
      .filter(
        (e) =>
          this.matches(e, q) &&
          (!this.nurAbgenommene() || e.abgenommen) &&
          (!profil || e.profilId === profil) &&
          (!this.nurProjekt() || e.projektId === this.nurProjekt()) &&
          hatAlleTags(e.tags, this.gewaehlteTags()),
      );
    const map = new Map<string, TestmessageEntry[]>();
    for (const e of list) {
      const key = e.fachmodul || 'sonstige';
      (map.get(key) ?? map.set(key, []).get(key)!).push(e);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'de'))
      .map(([fachmodul, items]) => ({
        fachmodul,
        items: items.sort(
          (a, b) =>
            (a.nachricht || '').localeCompare(b.nachricht || '', 'de') ||
            a.name.localeCompare(b.name, 'de'),
        ),
      }));
  });

  private matches(e: TestmessageEntry, q: string): boolean {
    if (!q) return true;
    return [e.name, e.nachricht, e.fachmodul, e.notiz, ...(e.tags ?? [])].some((v) =>
      (v || '').toLowerCase().includes(q),
    );
  }

  /** Ist das Schlagwort gerade als Filter gesetzt (Kachel-Chip hervorheben)? */
  protected tagAktiv(tag: string): boolean {
    const schluessel = tag.toLocaleLowerCase('de');
    return this.gewaehlteTags().some((t) => t.toLocaleLowerCase('de') === schluessel);
  }

  /**
   * Klick auf ein Schlagwort der Kachel: dasselbe wie in der Filterleiste.
   * `stopPropagation`, sonst oeffnete der Klick die Nachricht darunter.
   */
  protected filtereNachTag(tag: string, ev: Event): void {
    ev.stopPropagation();
    this.gewaehlteTags.set(schalteTag(this.gewaehlteTags(), tag));
  }

  /** Zur Projektansicht (#135) — Vorhaben mit ihren Kommunikationsszenarien. */
  protected goProjekte(): void {
    this.state.view.set('projekte');
  }

  /** Zurueck zur Profil-Bibliothek. */
  protected goDashboard(): void {
    this.state.view.set('dashboard');
  }

  /** Zur bebilderten Anleitung wechseln. */
  protected goHowto(): void {
    this.state.view.set('howto');
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
   * Kachel-Aktion "Variante anlegen" (#133): serverseitige Kopie mit derselben
   * Profil-Bindung. Der Weg zur naechsten Auspraegung eines Szenarios — einmal
   * mit einem Beteiligten, einmal mit zweien — ohne den gefuehrten Durchlauf
   * von vorn zu fahren.
   *
   * Auch bei freigegebenen Nachrichten erlaubt: die Kopie ruehrt das Original
   * nicht an, und gerade die freigegebenen sind die guten Ausgangspunkte.
   */
  protected async variante(e: TestmessageEntry, ev: Event): Promise<void> {
    ev.stopPropagation();
    try {
      await this.store.dupliziere(e.id);
      this.toast.show(`Variante von „${e.name}" angelegt.`);
    } catch (err) {
      this.toast.showError(err, 'Variante konnte nicht angelegt werden.');
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

  /**
   * Ausgewaehlte Dateien einlesen, validieren und anlegen. Anforderung: nur
   * schema-valide Nachrichten kommen in den Testdatenspeicher — invalide (und
   * nicht pruefbare) Uploads werden mit Fehlerbericht abgelehnt.
   */
  protected async onFiles(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;

    let ok = 0;
    const abgelehnt: string[] = []; // kein XJustiz-XML
    const invalide: string[] = []; // Schemavalidierung fehlgeschlagen (mit Bericht)
    let fehler = 0; // Speichern fehlgeschlagen (Backend)
    for (const f of files) {
      const xml = await f.text();
      const meta = parseTestmessage(xml);
      if (!meta) {
        abgelehnt.push(f.name);
        continue;
      }
      const pruefung = await this.validator.validiere(xml);
      if (pruefung.status !== 'valide') {
        invalide.push(...pruefung.fehler.map((m) => `${f.name}: ${m}`));
        continue;
      }
      try {
        await this.store.create({
          name: f.name,
          xml,
          nachricht: meta.nachricht,
          fachmodul: meta.fachmodul,
          xjustizVersion: meta.xjustizVersion,
          groesse: xml.length,
        });
        ok++;
      } catch {
        fehler++;
      }
    }

    const teile: string[] = [];
    if (ok) teile.push(`${ok} hochgeladen`);
    if (abgelehnt.length) teile.push(`${abgelehnt.length} abgelehnt (keine XJustiz-Nachricht)`);
    if (invalide.length) teile.push('nicht valide Nachrichten abgelehnt');
    if (fehler) teile.push(`${fehler} fehlgeschlagen (Backend nicht erreichbar)`);
    this.toast.show(teile.join(', ') || 'Nichts hochgeladen.');
    if (invalide.length)
      this.report.zeige('Upload abgelehnt — Nachricht nicht schema-valide', invalide);
    if (ok && !abgelehnt.length && !invalide.length && !fehler)
      this.uploadDlg().nativeElement.close();
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

  /** Export-Tor: nur schema-valide Nachrichten verlassen den Speicher. */
  protected async download(e: TestmessageEntry, ev: Event): Promise<void> {
    ev.stopPropagation();
    try {
      const xml = await this.store.loadXml(e.id);
      if (xml == null) return;
      const pruefung = await this.validator.validiere(xml);
      if (pruefung.status !== 'valide') {
        this.report.zeige(
          `Download blockiert — „${e.name}" ist nicht schema-valide`,
          pruefung.fehler,
        );
        return;
      }
      this.dl.download(this.dl.xmlFilename(e.name || (e.nachricht ?? '')), xml, 'application/xml');
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
    return new Date(e.hochgeladen).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  /** Nachrichtenname fuer die Mitte-Kuerzung (gemeinsam mit der Profil-Uebersicht). */
  protected msgKopf(e: TestmessageEntry): string {
    return nachrichtTeile(e.nachricht).kopf;
  }

  protected msgEnde(e: TestmessageEntry): string {
    return nachrichtTeile(e.nachricht).ende;
  }

  /**
   * Fusszeile links: Umfang der Nachricht. Im gefuehrten Durchlauf steht der
   * Stand der Pflichtangaben davor — er sagt mehr als die Dateigroesse.
   */
  protected fussText(e: TestmessageEntry): string {
    const f = e.fortschritt;
    const groesse = this.groesse(e);
    return f ? `${f.x} von ${f.y} Pflichtangaben · ${groesse}` : groesse;
  }

  /**
   * Was frueher als eigene Pillen auf der Kachel stand und ihre Hoehe
   * schwanken liess (#91).
   */
  protected fussTitel(e: TestmessageEntry): string {
    const teile: string[] = [];
    teile.push(e.xjustizVersion ? `XJustiz ${e.xjustizVersion}` : 'Version unbekannt');
    if (e.notiz) teile.push(e.notiz);
    return teile.join(' · ');
  }
}
