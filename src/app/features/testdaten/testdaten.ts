import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TestmessageStoreService } from '../../core/services/testmessage-store.service';
import { StateService } from '../../core/services/state.service';
import { ToastService } from '../../core/services/toast.service';
import { InstanceImportService } from '../../core/services/instance-import.service';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { TestmessageGenerationService } from '../../core/services/testmessage-generation.service';
import { TestmessageCreateService } from '../../core/services/testmessage-create.service';
import { DownloadService } from '../../core/services/download.service';
import { XmlValidationService } from '../../core/services/xml-validation.service';
import { ValidationReportService } from '../../core/services/validation-report.service';
import { TestmessageEntry } from '../../models/testmessage.model';
import { LibraryEntry } from '../../models/profile.model';
import { MessageRef } from '../../models/xsd-index.model';
import { parseTestmessage } from '../../core/util/testmessage.util';
import { firstLine } from '../../core/util/pretty.util';

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
  templateUrl: './testdaten.html',
})
export class Testdaten {
  protected readonly store = inject(TestmessageStoreService);
  protected readonly state = inject(StateService);
  private readonly toast = inject(ToastService);
  private readonly instanceImport = inject(InstanceImportService);
  private readonly profiles = inject(ProfileStoreService);
  private readonly generator = inject(TestmessageGenerationService);
  private readonly creator = inject(TestmessageCreateService);
  private readonly dl = inject(DownloadService);
  private readonly validator = inject(XmlValidationService);
  private readonly report = inject(ValidationReportService);

  private readonly uploadDlg = viewChild.required<ElementRef<HTMLDialogElement>>('uploadDlg');
  private readonly editDlg = viewChild.required<ElementRef<HTMLDialogElement>>('editDlg');
  private readonly genDlg = viewChild.required<ElementRef<HTMLDialogElement>>('genDlg');
  private readonly createDlg = viewChild.required<ElementRef<HTMLDialogElement>>('createDlg');

  protected readonly search = signal('');

  /** Laufende Generierung (Profil-id) — sperrt Doppelklicks im Dialog. */
  protected readonly generating = signal<string | null>(null);

  /** Bibliotheksprofile, aus denen sich eine Nachricht erzeugen laesst. */
  protected readonly profilKandidaten = computed<LibraryEntry[]>(() =>
    this.profiles.entries().filter((e) => !!e.nachricht),
  );

  /** Bearbeiten-Dialog: aktive id + Puffer für Name und Beschreibung. */
  protected readonly editId = signal<string | null>(null);
  protected readonly editName = signal('');
  protected readonly editNote = signal('');

  /** Gefiltert (Suche) und nach Fachmodul → Nachricht gruppiert. */
  protected readonly gruppen = computed<Gruppe[]>(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.store.entries().filter((e) => this.matches(e, q));
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
    return [e.name, e.nachricht, e.fachmodul, e.notiz]
      .some((v) => (v || '').toLowerCase().includes(q));
  }

  /** Zurueck zur Profil-Bibliothek. */
  protected goDashboard(): void {
    this.state.view.set('dashboard');
  }

  // ── Neu erstellen (gefuehrt aus einem Schema) ───────────────────────

  /** Im Dialog gewaehlte Schemaversion (null = noch keine gewaehlt). */
  protected readonly createVersion = signal<string | null>(null);
  protected readonly createLoading = signal(false);
  protected readonly msgFilter = signal('');

  /**
   * Waehlbare Schemata: hinterlegte Versionen, plus das aktuell geladene
   * Fremdschema (Ordner-Upload), falls vorhanden.
   */
  protected readonly versionOptionen = computed<{ id: string; label: string }[]>(() => {
    const opts = this.state.bundledVersions().map((v) => ({ id: v.id, label: v.label || 'XJustiz ' + v.id }));
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

  protected openCreate(): void {
    this.createVersion.set(null);
    this.msgFilter.set('');
    this.createDlg().nativeElement.showModal();
  }

  /** Schritt 1: Version waehlen (laedt bei Bedarf das hinterlegte Schema). */
  protected async chooseVersion(id: string): Promise<void> {
    if (this.createLoading()) return;
    this.createLoading.set(true);
    try {
      await this.generator.ensureSchema(id);
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
   * zum Betrachten/Bearbeiten geoeffnet.
   */
  protected async openEntry(e: TestmessageEntry): Promise<void> {
    if (e.gefuehrt) {
      try {
        await this.creator.fortsetzen(e);
        return;
      } catch {
        // Stand nicht ladbar (Backend/Schema) — auf das normale Oeffnen zurueckfallen.
      }
    }
    await this.openInTree(e);
  }

  /**
   * Testnachricht wie eine Profilierung im Baum-Editor oeffnen: passendes
   * Schema sicherstellen, XML gegen das Schema einlesen (Testwerte an die
   * Blaetter) und zur Editor-Ansicht wechseln.
   */
  protected async openInTree(e: TestmessageEntry): Promise<void> {
    try {
      const xml = await this.store.loadXml(e.id);
      if (xml == null) {
        this.toast.show('Nachricht nicht gefunden.');
        return;
      }
      await this.ensureSchema(e.xjustizVersion);
      // Kein Bibliothekseintrag: verhindert, dass der Autosave die Testnachricht
      // in ein (evtl. zuvor geoeffnetes) Profil schreibt.
      this.state.activeProfileId.set(null);
      this.instanceImport.importXml(xml, e.name); // wirft bei fehlendem/falschem Schema
      this.state.view.set('editor');
    } catch (err) {
      this.toast.showError(err, 'Nachricht konnte nicht geöffnet werden.');
    }
  }

  /** Die zur Testnachricht passende hinterlegte XJustiz-Version laden (falls noetig). */
  private async ensureSchema(version?: string): Promise<void> {
    await this.generator.ensureSchema(version);
  }

  // ── Aus Profilierung erzeugen ───────────────────────────────────────

  protected openGenerate(): void {
    void this.profiles.refresh().catch(this.toast.fail('Profile konnten nicht geladen werden — Backend nicht erreichbar.'));
    this.genDlg().nativeElement.showModal();
  }

  /** Ist die XJustiz-Version des Profils verfuegbar (aktuell geladen oder hinterlegt)? */
  protected versionVerfuegbar(e: LibraryEntry): boolean {
    return (
      !e.xjustizVersion ||
      e.xjustizVersion === this.state.version() ||
      this.state.bundledVersions().some((v) => v.id === e.xjustizVersion)
    );
  }

  protected async generateFrom(e: LibraryEntry): Promise<void> {
    if (this.generating()) return;
    this.generating.set(e.id);
    try {
      await this.generator.erzeugeAusProfil(e);
      this.genDlg().nativeElement.close();
      this.toast.show('Testnachricht erzeugt — Platzhalterwerte fachlich prüfen.');
    } catch (err) {
      this.toast.showError(err, 'Erzeugen fehlgeschlagen.');
    } finally {
      this.generating.set(null);
    }
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
    if (ok && !abgelehnt.length && !invalide.length && !fehler) this.uploadDlg().nativeElement.close();
  }

  // ── Bearbeiten (Name + Beschreibung) ────────────────────────────────

  protected openEdit(e: TestmessageEntry, ev: Event): void {
    ev.stopPropagation();
    this.editId.set(e.id);
    this.editName.set(e.name || '');
    this.editNote.set(e.notiz || '');
    this.editDlg().nativeElement.showModal();
  }

  protected submitEdit(): void {
    const id = this.editId();
    if (id) {
      const name = this.editName().trim();
      void this.store
        // Leerer Name ändert nichts (undefined) — der bestehende bleibt erhalten.
        .updateMeta(id, { name: name || undefined, notiz: this.editNote() })
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
        this.report.zeige(`Download blockiert — „${e.name}" ist nicht schema-valide`, pruefung.fehler);
        return;
      }
      this.dl.download(e.name || (e.nachricht ?? 'testnachricht') + '.xml', xml, 'application/xml');
    } catch {
      this.toast.show('Download fehlgeschlagen — Backend nicht erreichbar.');
    }
  }

  protected remove(e: TestmessageEntry, ev: Event): void {
    ev.stopPropagation();
    if (confirm(`Testnachricht „${e.name}" wirklich löschen?`))
      void this.store.delete(e.id).catch(this.toast.fail('Löschen fehlgeschlagen — Backend nicht erreichbar.'));
  }

  // ── Anzeige-Helfer ──────────────────────────────────────────────────

  protected readonly firstLine = firstLine;

  protected groesse(e: TestmessageEntry): string {
    const kb = e.groesse / 1024;
    return kb < 1 ? `${e.groesse} B` : `${kb.toFixed(kb < 10 ? 1 : 0)} kB`;
  }

  protected datum(e: TestmessageEntry): string {
    return new Date(e.hochgeladen).toLocaleDateString('de-DE');
  }
}
