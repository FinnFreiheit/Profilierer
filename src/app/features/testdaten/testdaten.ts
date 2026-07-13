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
import { BundledSchemaService } from '../../core/services/bundled-schema.service';
import { PersistenceService } from '../../core/services/persistence.service';
import { TestmessageEntry } from '../../models/testmessage.model';
import { parseTestmessage } from '../../core/util/testmessage.util';

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
  private readonly state = inject(StateService);
  private readonly toast = inject(ToastService);
  private readonly instanceImport = inject(InstanceImportService);
  private readonly bundled = inject(BundledSchemaService);
  private readonly persistence = inject(PersistenceService);

  private readonly uploadDlg = viewChild.required<ElementRef<HTMLDialogElement>>('uploadDlg');
  private readonly noteDlg = viewChild.required<ElementRef<HTMLDialogElement>>('noteDlg');
  private readonly viewDlg = viewChild.required<ElementRef<HTMLDialogElement>>('viewDlg');

  protected readonly search = signal('');

  /** Viewer-Dialog: Titel + XML-Inhalt der aktuell angesehenen Nachricht. */
  protected readonly viewTitle = signal('');
  protected readonly viewXml = signal('');

  /** Notiz-Dialog: aktive id + Textpuffer. */
  protected readonly noteId = signal<string | null>(null);
  protected readonly noteText = signal('');

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

  private fail(msg: string): (e: unknown) => void {
    return () => this.toast.show(msg);
  }

  // ── Im Baum öffnen ──────────────────────────────────────────────────

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
      this.instanceImport.importXml(xml); // wirft bei fehlendem/falschem Schema
      this.state.view.set('editor');
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Nachricht konnte nicht geöffnet werden.');
    }
  }

  /** Die zur Testnachricht passende hinterlegte XJustiz-Version laden (falls noetig). */
  private async ensureSchema(version?: string): Promise<void> {
    if (!version || this.state.version() === version) return; // best effort: aktuelles Schema nutzen
    const v = this.state.bundledVersions().find((x) => x.id === version);
    if (!v) return; // keine hinterlegte Version — importXml meldet ggf. fehlendes Schema
    const files = await this.bundled.files(v);
    await this.persistence.loadXsdFiles(files);
    this.state.activeBundle.set(v.dir);
  }

  // ── Upload ──────────────────────────────────────────────────────────

  protected openUpload(): void {
    this.uploadDlg().nativeElement.showModal();
  }

  /** Ausgewaehlte Dateien einlesen, validieren und anlegen. */
  protected async onFiles(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;

    let ok = 0;
    const abgelehnt: string[] = []; // kein XJustiz-XML
    let fehler = 0; // Speichern fehlgeschlagen (Backend)
    for (const f of files) {
      const xml = await f.text();
      const meta = parseTestmessage(xml);
      if (!meta) {
        abgelehnt.push(f.name);
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
    if (fehler) teile.push(`${fehler} fehlgeschlagen (Backend nicht erreichbar)`);
    this.toast.show(teile.join(', ') || 'Nichts hochgeladen.');
    if (ok && !abgelehnt.length && !fehler) this.uploadDlg().nativeElement.close();
  }

  // ── Notiz ───────────────────────────────────────────────────────────

  protected openNote(e: TestmessageEntry, ev: Event): void {
    ev.stopPropagation();
    this.noteId.set(e.id);
    this.noteText.set(e.notiz || '');
    this.noteDlg().nativeElement.showModal();
  }

  protected submitNote(): void {
    const id = this.noteId();
    if (id)
      void this.store
        .updateNote(id, this.noteText())
        .catch(this.fail('Notiz speichern fehlgeschlagen — Backend nicht erreichbar.'));
    this.noteDlg().nativeElement.close();
  }

  // ── Ansehen ─────────────────────────────────────────────────────────

  protected async openView(e: TestmessageEntry, ev: Event): Promise<void> {
    ev.stopPropagation();
    try {
      const xml = await this.store.loadXml(e.id);
      if (xml == null) return;
      this.viewTitle.set(e.name);
      this.viewXml.set(xml);
      this.viewDlg().nativeElement.showModal();
    } catch {
      this.toast.show('Nachricht konnte nicht geladen werden — Backend nicht erreichbar.');
    }
  }

  // ── Download / Löschen ──────────────────────────────────────────────

  protected async download(e: TestmessageEntry, ev: Event): Promise<void> {
    ev.stopPropagation();
    try {
      const xml = await this.store.loadXml(e.id);
      if (xml == null) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
      a.download = e.name || (e.nachricht ?? 'testnachricht') + '.xml';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      this.toast.show('Download fehlgeschlagen — Backend nicht erreichbar.');
    }
  }

  protected remove(e: TestmessageEntry, ev: Event): void {
    ev.stopPropagation();
    if (confirm(`Testnachricht „${e.name}" wirklich löschen?`))
      void this.store.delete(e.id).catch(this.fail('Löschen fehlgeschlagen — Backend nicht erreichbar.'));
  }

  // ── Anzeige-Helfer ──────────────────────────────────────────────────

  protected groesse(e: TestmessageEntry): string {
    const kb = e.groesse / 1024;
    return kb < 1 ? `${e.groesse} B` : `${kb.toFixed(kb < 10 ? 1 : 0)} kB`;
  }

  protected datum(e: TestmessageEntry): string {
    return new Date(e.hochgeladen).toLocaleDateString('de-DE');
  }
}
