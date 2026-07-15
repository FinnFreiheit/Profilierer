import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { Topbar } from './features/topbar/topbar';
import { Toolbar } from './features/toolbar/toolbar';
import { Crumbs } from './features/crumbs/crumbs';
import { TreeCanvas } from './features/tree/tree-canvas';
import { DetailPanel } from './features/detail/detail-panel';
import { StatusDialog } from './features/dialogs/status-dialog';
import { MetaDialog } from './features/dialogs/meta-dialog';
import { DiffDialog } from './features/dialogs/diff-dialog';
import { Legend } from './features/legend/legend';
import { PrintDoc } from './features/print/print-doc';
import { Toast } from './shared/toast/toast';
import { FileDropDirective } from './shared/file-drop.directive';
import { Dashboard } from './features/dashboard/dashboard';
import { Testdaten } from './features/testdaten/testdaten';
import { PersistenceService } from './core/services/persistence.service';
import { CodelistService } from './core/services/codelist.service';
import { ExportService } from './core/services/export.service';
import { DiffService } from './core/services/diff.service';
import { NavService } from './core/services/nav.service';
import { InstanceImportService } from './core/services/instance-import.service';
import { InstanceExportService } from './core/services/instance-export.service';
import { TestmessageCreateService } from './core/services/testmessage-create.service';
import { TestmessageStoreService } from './core/services/testmessage-store.service';
import { ToastService } from './core/services/toast.service';
import { StateService } from './core/services/state.service';
import { BundledSchemaService } from './core/services/bundled-schema.service';
import { MigrationService } from './core/services/migration.service';
import { parseTestmessage } from './core/util/testmessage.util';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKeydown($event)' },
  imports: [
    Topbar,
    Toolbar,
    Crumbs,
    TreeCanvas,
    DetailPanel,
    StatusDialog,
    MetaDialog,
    DiffDialog,
    Legend,
    PrintDoc,
    Toast,
    FileDropDirective,
    Dashboard,
    Testdaten,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected readonly persistence = inject(PersistenceService);
  protected readonly codelists = inject(CodelistService);
  protected readonly exporter = inject(ExportService);
  protected readonly diff = inject(DiffService);
  private readonly nav = inject(NavService);
  private readonly instanceImport = inject(InstanceImportService);
  private readonly instanceExport = inject(InstanceExportService);
  private readonly testmessageCreate = inject(TestmessageCreateService);
  private readonly testmessages = inject(TestmessageStoreService);
  private readonly toast = inject(ToastService);
  private readonly state = inject(StateService);
  private readonly bundled = inject(BundledSchemaService);
  private readonly migration = inject(MigrationService);

  protected readonly hasRoot = computed(() => !!this.state.root());
  /** Dashboard (Bibliothek) vs. Baum-Editor. */
  protected readonly view = computed(() => this.state.view());

  /** Zurueck zur Uebersicht (Topbar-Button). */
  protected goDashboard(): void {
    this.state.view.set('dashboard');
  }

  /**
   * Beim Start das Manifest der hinterlegten Schemata laden und die
   * Standardversion (3.6.2) automatisch aktivieren — kein XSD-Ordner-Upload
   * mehr noetig. Ist bereits ein Schema geladen (z. B. durch einen sehr
   * frueh geladenen Autosave), wird nicht ueberschrieben.
   */
  async ngOnInit(): Promise<void> {
    // Einmalige Migration der frueher im localStorage gehaltenen Profil-Bibliothek
    // ins DB-Backend (idempotent, nur bei leerem Backend).
    await this.migration.runOnce();
    try {
      const versions = await this.bundled.manifest();
      this.state.bundledVersions.set(versions);
      if (!this.state.idx()) {
        const def = versions.find((v) => v.default) ?? versions[0];
        if (def) await this.loadBundled(def.dir);
      }
    } catch (e) {
      this.toast.show(
        'Hinterlegte Schemata konnten nicht geladen werden: ' +
          (e instanceof Error ? e.message : e),
      );
    }
  }

  /**
   * Eine hinterlegte Schemaversion als Primaerschema laden (Versions-Umschalter
   * und Auto-Load beim Start). Eine bereits geladene Nachricht wird — sofern in
   * der Zielversion vorhanden — unter dem neuen Schema neu aufgebaut.
   */
  async loadBundled(dir: string): Promise<void> {
    const v = this.state.bundledVersions().find((x) => x.dir === dir);
    if (!v) return;
    const prevMsg = this.state.msgName();
    try {
      const files = await this.bundled.files(v);
      await this.persistence.loadXsdFiles(files);
      this.state.activeBundle.set(dir);
      if (prevMsg) {
        if (this.state.idx()?.el[prevMsg]) this.nav.loadMessage(prevMsg, true);
        else this.toast.show(`Nachricht ${prevMsg} ist in XJustiz ${v.label} nicht enthalten.`);
      }
      this.toast.show(`XJustiz ${v.label} geladen (${files.length} Schemata).`);
    } catch (e) {
      this.toast.show(
        `XJustiz ${v.label} konnte nicht geladen werden: ` + (e instanceof Error ? e.message : e),
      );
    }
  }

  /** Pfeiltasten-Navigation im Baum (Z.2443-2463). */
  onKeydown(e: KeyboardEvent): void {
    if (!e.key.startsWith('Arrow')) return;
    const t = e.target as HTMLElement | null;
    if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
    if (document.querySelector('dialog[open]')) return;
    if (this.nav.arrowNavigate(e.key)) e.preventDefault();
  }

  async onXsdFiles(files: FileList | File[]): Promise<void> {
    try {
      const n = await this.persistence.loadXsdFiles(files);
      this.state.activeBundle.set(null);
      this.toast.show(`${n} Schemadateien geladen.`);
    } catch (e) {
      this.toast.show(e instanceof Error ? e.message : 'Laden fehlgeschlagen.');
    }
  }

  onCodelistFiles(files: FileList | File[]): void {
    this.codelists.loadCodelistFiles(files);
  }

  /** Bestehende XJustiz-Nachricht (XML-Instanz) laden und als Testnachricht anzeigen. */
  async onInstanceFile(file: File): Promise<void> {
    this.importInstanceText(await file.text(), file.name);
  }

  private importInstanceText(text: string, quellName?: string): void {
    try {
      this.instanceImport.importXml(text, quellName);
    } catch (e) {
      this.toast.show(e instanceof Error ? e.message : 'Nachricht konnte nicht geladen werden.');
    }
  }

  /**
   * Bearbeitete Nachricht als *neue* Testnachricht ablegen: getreu serialisieren
   * (Original-DOM + Modell-Änderungen), Metadaten aus dem Ergebnis ableiten und
   * im zentralen Testdaten-Speicher anlegen.
   */
  async onSaveMessage(): Promise<void> {
    const session = this.state.messageEdit();
    if (!session) return;
    const vorschlag = this.msgNameVorschlag(session.quellName);
    const eingabe = prompt('Name der neuen Testnachricht:', vorschlag);
    if (eingabe == null) return; // abgebrochen
    try {
      const xml = this.instanceExport.buildInstanceXml(session);
      const meta = parseTestmessage(xml);
      if (!meta) {
        this.toast.show('Die erzeugte Nachricht ist nicht lesbar — bitte prüfen.');
        return;
      }
      await this.testmessages.create({
        name: eingabe.trim() || vorschlag,
        xml,
        nachricht: meta.nachricht,
        fachmodul: meta.fachmodul,
        xjustizVersion: meta.xjustizVersion,
        groesse: xml.length,
      });
      this.toast.show('Als neue Testnachricht gespeichert.');
      this.state.view.set('testdaten');
    } catch (e) {
      this.toast.show(e instanceof Error ? e.message : 'Speichern fehlgeschlagen — Backend nicht erreichbar.');
    }
  }

  /** Vorschlag „<Quelle> (bearbeitet).xml" aus dem Quellnamen. */
  private msgNameVorschlag(quellName: string): string {
    const base = quellName.replace(/\.xml$/i, '');
    return `${base} (bearbeitet).xml`;
  }

  /**
   * Gefuehrte Testnachricht-Erstellung speichern: erstes Mal anlegen
   * (Namensabfrage im Service), danach denselben Eintrag aktualisieren.
   */
  async onSaveCreate(): Promise<void> {
    try {
      await this.testmessageCreate.speichern();
    } catch (e) {
      this.toast.show(e instanceof Error ? e.message : 'Speichern fehlgeschlagen — Backend nicht erreichbar.');
    }
  }

  onXrep(): void {
    this.codelists.loadFromXRepository();
  }

  /**
   * btnDiff (Z.2378): Dialog immer oeffnen — die Auswahl der Vergleichsversion
   * (hinterlegte Version oder eigener Ordner) erfolgt im Dialog.
   */
  onDiff(diffDlg: DiffDialog, _xsdBInput: HTMLInputElement): void {
    diffDlg.open();
  }

  async onXsdB(e: Event, diffDlg: DiffDialog): Promise<void> {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length) {
      const ok = await this.diff.loadXsdB(input.files);
      if (ok) diffDlg.open();
    }
    input.value = '';
  }

  /** Drag&Drop-Routing (Z.2436-2440), erweitert um XJustiz-Nachrichten (XML). */
  async onDropped(files: File[]): Promise<void> {
    if (files.length === 1 && files[0]!.name.endsWith('.json')) {
      this.persistence.loadProfileFile(files[0]!);
      return;
    }
    if (files.some((x) => x.name.toLowerCase().endsWith('.xsd'))) {
      this.onXsdFiles(files);
      return;
    }
    // Einzelne .xml: XJustiz-Nachricht (nachricht.*) vs. Genericode-Codeliste unterscheiden.
    if (files.length === 1 && /\.xml$/i.test(files[0]!.name)) {
      const text = await files[0]!.text();
      if (InstanceImportService.rootMessageName(text)) this.importInstanceText(text, files[0]!.name);
      else this.onCodelistFiles(files);
      return;
    }
    if (files.some((x) => /\.(xml|zip)$/i.test(x.name))) this.onCodelistFiles(files);
  }
}
