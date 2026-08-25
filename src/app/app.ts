import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Objektleiste } from './features/objektleiste/objektleiste';
import { Werkzeugleiste } from './features/werkzeugleiste/werkzeugleiste';
import { TreeCanvas } from './features/tree/tree-canvas';
import { DetailPanel } from './features/detail/detail-panel';
import { StatusDialog } from './features/dialogs/status-dialog';
import { MetaDialog } from './features/dialogs/meta-dialog';
import { HinweiseDialog } from './features/dialogs/hinweise-dialog';
import { VersionsDialog } from './features/dialogs/versions-dialog';
import { DiffDialog } from './features/dialogs/diff-dialog';
import { Legend } from './features/legend/legend';
import { PrintDoc } from './features/print/print-doc';
import { Toast } from './shared/toast/toast';
import { FileDropDirective } from './shared/file-drop.directive';
import { Dashboard } from './features/dashboard/dashboard';
import { Testdaten } from './features/testdaten/testdaten';
import { Howto } from './features/howto/howto';
import { Projekte } from './features/projekte/projekte';
import { PersistenceService } from './core/services/persistence.service';
import { CodelistService } from './core/services/codelist.service';
import { ExportService } from './core/services/export.service';
import { ExcelExportService } from './core/services/excel-export.service';
import { DiffService } from './core/services/diff.service';
import { NavService } from './core/services/nav.service';
import { InstanceImportService } from './core/services/instance-import.service';
import { TestmessageCreateService } from './core/services/testmessage-create.service';
import { TestmessageEditService } from './core/services/testmessage-edit.service';
import { TestmessageStoreService } from './core/services/testmessage-store.service';
import { ToastService } from './core/services/toast.service';
import { StateService } from './core/services/state.service';
import { GuidedService } from './core/services/guided.service';
import { BundledSchemaService } from './core/services/bundled-schema.service';
import { SchemaStoreService } from './core/services/schema-store.service';
import { RemoteSchemaService } from './core/services/remote-schema.service';
import { MigrationService } from './core/services/migration.service';
import { LoggerService } from './core/services/logger.service';
import { DownloadService } from './core/services/download.service';
import { ValidationDialog } from './features/dialogs/validation-dialog';
import { ProfilDiffDialog } from './features/dialogs/profil-diff-dialog';
import { XmlDiffDialog } from './features/dialogs/xml-diff-dialog';
import { MatrixDialog } from './features/dialogs/matrix-dialog';
import { EinordnenDialog } from './features/dialogs/einordnen-dialog';
import { VergleichService } from './core/services/vergleich.service';
import { TeilenService } from './core/services/teilen.service';
import { UeberlagerungService } from './core/services/ueberlagerung.service';
import { ErweiterungDialog } from './features/dialogs/erweiterung-dialog';
import { BundledVersion } from './models/schema-bundle.model';
import { vereineVersionen } from './core/util/schema-quellen.util';
import { NachrichtSpeichernDialog } from './features/dialogs/nachricht-speichern-dialog';

/**
 * Ist das Ziel ein **Zweig-Radio** der gefuehrten Auswahl? Solche Knoepfe geben
 * die Tastatur an die Fuehrung ab (siehe `App.onKeydown`). Radios ausserhalb —
 * die Fassungswahl im Erstellen-Dialog — sind davon nicht betroffen: bei
 * offenem Dialog steigt `onKeydown` ohnehin vorher aus.
 */
function istZweigWahl(el: HTMLElement): boolean {
  return el instanceof HTMLInputElement && el.type === 'radio';
}

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKeydown($event)' },
  imports: [
    Objektleiste,
    Werkzeugleiste,
    TreeCanvas,
    DetailPanel,
    StatusDialog,
    MetaDialog,
    HinweiseDialog,
    VersionsDialog,
    DiffDialog,
    Legend,
    PrintDoc,
    Toast,
    FileDropDirective,
    Dashboard,
    Testdaten,
    Howto,
    Projekte,
    ValidationDialog,
    ProfilDiffDialog,
    XmlDiffDialog,
    MatrixDialog,
    EinordnenDialog,
    ErweiterungDialog,
    NachrichtSpeichernDialog,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected readonly persistence = inject(PersistenceService);
  protected readonly codelists = inject(CodelistService);
  protected readonly exporter = inject(ExportService);
  protected readonly excel = inject(ExcelExportService);
  protected readonly diff = inject(DiffService);
  private readonly nav = inject(NavService);
  private readonly instanceImport = inject(InstanceImportService);
  private readonly testmessageCreate = inject(TestmessageCreateService);
  private readonly testmessageEdit = inject(TestmessageEditService);
  private readonly testmessages = inject(TestmessageStoreService);
  private readonly toast = inject(ToastService);
  private readonly state = inject(StateService);
  private readonly guided = inject(GuidedService);
  private readonly bundled = inject(BundledSchemaService);
  private readonly schemas = inject(SchemaStoreService);
  private readonly remoteSchemas = inject(RemoteSchemaService);
  private readonly migration = inject(MigrationService);
  private readonly logger = inject(LoggerService);
  private readonly download = inject(DownloadService);
  private readonly vergleich = inject(VergleichService);
  private readonly teilen = inject(TeilenService);
  private readonly ueberlagerung = inject(UeberlagerungService);

  protected readonly hasRoot = this.state.hasRoot;
  /** Dashboard (Bibliothek) vs. Baum-Editor. */
  protected readonly view = this.state.view;
  /** Reine Schema-Ansicht (US "Schema ansehen") — eigener Empty-State-Text. */
  protected readonly schemaView = this.state.schemaView;

  /**
   * Zurueck zur Uebersicht (Topbar-Button). Wohin, entscheidet das offene
   * Objekt: eine Testnachricht — geoeffnet oder gefuehrt erstellt — gehoert in
   * den Testdatenspeicher, alles andere in die Profil-Bibliothek. Sonst landet
   * der Rueckweg in einer Liste, in der das eben Bearbeitete gar nicht steht.
   */
  protected async zurUebersicht(): Promise<void> {
    // Die Nachrichten-Ueberlagerung (#147) kommt aus einem Projekt und gehoert
    // dorthin zurueck — in der Bibliothek stuende keines der ueberlagerten
    // Objekte. Sie endet dabei: der Baum daneben ist ohne sie nur ein Schema.
    if (this.ueberlagerung.aktiv()) {
      this.ueberlagerung.beende();
      this.state.view.set('projekte');
      return;
    }
    // Eine hochgeladene Nachricht traegt keinen Eintrag im Testdaten-Speicher
    // und damit auch kein Autosave — hier ist der Moment, sie zu behalten.
    // „Abbrechen" (und eine gescheiterte Schemapruefung) haelt die Ansicht.
    if (!(await this.testmessageEdit.frageVorVerlassen())) return;
    this.state.view.set(this.state.msgMode() ? 'testdaten' : 'dashboard');
  }

  /** Fehlerprotokoll (Logger-Ringpuffer) als Textdatei herunterladen. */
  protected exportLog(): void {
    const stempel = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    this.download.download(
      `xjp-log_${stempel}.txt`,
      this.logger.exportText(),
      'text/plain;charset=utf-8',
    );
  }

  /**
   * Beim Start das Manifest der hinterlegten Schemata laden und die
   * Standardversion (3.6.2) automatisch aktivieren — kein XSD-Ordner-Upload
   * mehr noetig. Ist bereits ein Schema geladen (z. B. durch einen sehr
   * frueh geladenen Autosave), wird nicht ueberschrieben.
   *
   * Danach ein etwaiger Teilen-Link (`?profil=<id>` bzw.
   * `?testnachricht=<id>`): erst nach dem Schema, damit die Nachricht sofort
   * aufgebaut werden kann (eine abweichende XJustiz-Version laedt das Oeffnen
   * selbst nach).
   */
  async ngOnInit(): Promise<void> {
    // Einmalige Migration der frueher im localStorage gehaltenen Profil-Bibliothek
    // ins DB-Backend (idempotent, nur bei leerem Backend).
    await this.migration.runOnce();
    // Vor dem Schema-Laden auslesen: der Parameter soll auch dann aus der
    // Adresszeile verschwinden, wenn das Manifest scheitert.
    const geteilt = this.teilen.startZiel();
    try {
      const versionen = await this.versionenZusammenstellen();
      this.state.bundledVersions.set(versionen);
      if (!this.state.idx()) await this.starteDatenbasis(versionen);
    } catch (e) {
      this.toast.show(
        'Hinterlegte Schemata konnten nicht geladen werden: ' +
          (e instanceof Error ? e.message : e),
      );
    }
    if (geteilt?.art === 'profil') await this.persistence.openFromLibrary(geteilt.id);
    if (geteilt?.art === 'testnachricht') await this.oeffneGeteilteNachricht(geteilt.id);
  }

  /**
   * Verfuegbare Schemaversionen zusammenstellen: die im Projekt hinterlegten
   * aus dem Manifest, dazu die im Backend **gespeicherten** von xjustiz.de.
   *
   * Ohne den zweiten Teil war eine dort geholte Version nach dem Neuladen
   * wieder verschwunden — sie lebte nur im Speicher dieser Sitzung. Ist das
   * Backend nicht erreichbar, bleibt es bei den hinterlegten Kopien.
   */
  private async versionenZusammenstellen(): Promise<BundledVersion[]> {
    const hinterlegt = await this.bundled.manifest();
    try {
      await this.schemas.refresh();
    } catch (e) {
      this.logger.warn(
        'Schema-Speicher',
        'Gespeicherte Versionen nicht ladbar (Backend offline?)',
        e,
      );
    }
    return vereineVersionen(hinterlegt, this.schemas.entries()).liste;
  }

  /**
   * Die Datenbasis des Starts: die **zuletzt gewaehlte** Version, sonst die
   * Standardversion des Manifests. Laesst sie sich nicht laden (Backend oder
   * xjustiz.de weg), faellt es mit Hinweis auf den Standard zurueck — ohne
   * Schema bliebe die Anwendung leer.
   */
  private async starteDatenbasis(versionen: BundledVersion[]): Promise<void> {
    const standard = versionen.find((v) => v.default) ?? versionen[0];
    const gemerkt = this.persistence.zuletztAktiveDatenbasis();
    const gewuenscht = versionen.find((v) => v.dir === gemerkt) ?? standard;
    if (!gewuenscht) return;
    if (await this.loadBundled(gewuenscht.dir)) return;
    if (standard && standard.dir !== gewuenscht.dir) {
      this.toast.show(
        `XJustiz ${gewuenscht.label} nicht ladbar — es gilt die hinterlegte Version.`,
      );
      await this.loadBundled(standard.dir);
    }
  }

  /**
   * Geteilte Testnachricht oeffnen. Der Index kommt frisch vom Server: der
   * Start-Abruf des Speichers kann noch laufen, und der Link zeigt womoeglich
   * auf eine Nachricht, die erst nach dem letzten Abruf entstanden ist.
   */
  private async oeffneGeteilteNachricht(id: string): Promise<void> {
    try {
      await this.testmessages.refresh();
    } catch (e) {
      this.logger.warn('Teilen', 'Testdaten-Index nicht ladbar', e);
    }
    const entry = this.testmessages.entries().find((e) => e.id === id);
    if (!entry) {
      this.toast.show('Geteilte Testnachricht nicht gefunden.');
      this.state.view.set('testdaten');
      return;
    }
    try {
      await this.testmessageEdit.oeffneEintrag(entry);
    } catch (err) {
      this.toast.showError(err, 'Geteilte Testnachricht konnte nicht geöffnet werden.');
    }
  }

  /** „Link zum Teilen kopieren" aus der Objektleiste (offene Profilierung). */
  protected teileAktivesProfil(): void {
    const id = this.state.activeProfileId();
    if (id) void this.teilen.kopiereProfilLink(id);
  }

  /** „Link zum Teilen kopieren" aus der Objektleiste (offene Testnachricht). */
  protected teileAktiveNachricht(): void {
    const id = this.state.messageEdit()?.entryId;
    if (id) void this.teilen.kopiereTestnachrichtLink(id);
  }

  /**
   * Eine Schemaversion als Primaerschema laden (Versions-Umschalter und Start).
   * Eine bereits geladene Nachricht wird — sofern in der Zielversion vorhanden —
   * unter dem neuen Schema neu aufgebaut.
   *
   * Woher die Dateien kommen, entscheidet der `BundledSchemaService`:
   * hinterlegt, aus dem Schema-Speicher oder frisch von xjustiz.de. Nur der
   * letzte Fall wird angekuendigt — er dauert. `erneuern` erzwingt ihn.
   *
   * Gibt zurueck, ob geladen wurde; der Start braucht die Auskunft fuer den
   * Rueckfall auf die hinterlegte Standardversion.
   */
  async loadBundled(dir: string, opts: { erneuern?: boolean } = {}): Promise<boolean> {
    const v = this.state.bundledVersions().find((x) => x.dir === dir);
    if (!v) return false;
    const prevMsg = this.state.msgName();
    // Gespeicherte Versionen kommen aus dem Backend; nur was wirklich geholt
    // werden muss, wird als Abruf angekuendigt.
    const holt = !!v.zipUrl && (opts.erneuern || !this.schemas.hatDateien(v.id));
    const quelle = v.zipUrl ? ' von xjustiz.de' : '';
    try {
      if (holt) this.toast.show(`Lade XJustiz ${v.label} von xjustiz.de…`);
      const n = await this.persistence.loadBundle(v, opts);
      if (prevMsg) {
        if (this.state.idx()?.el[prevMsg]) this.nav.loadMessage(prevMsg, true);
        else this.toast.show(`Nachricht ${prevMsg} ist in XJustiz ${v.label} nicht enthalten.`);
      }
      this.toast.show(`XJustiz ${v.label}${quelle} geladen (${n} Schemata).`);
      return true;
    } catch (e) {
      this.toast.show(
        `XJustiz ${v.label}${quelle} konnte nicht geladen werden: ` +
          (e instanceof Error ? e.message : e),
      );
      return false;
    }
  }

  /**
   * Schemata von xjustiz.de holen und den Speicher aktualisieren (Menue
   * „Von xjustiz.de aktualisieren"): die dort veroeffentlichten Versionen
   * **ersetzen** die im Projekt hinterlegten Eintraege gleicher Versionsnummer
   * — keine Doppelauswahl im Umschalter, xjustiz.de ist die fuehrende Quelle.
   * Nur dort neu erschienene Versionen kommen hinzu.
   *
   * Der Abruf ist bewusst **manuell** und die einzige Stelle, an der sich am
   * Bestand etwas aendert: er verwirft den Sitzungs-Cache, holt die
   * Versionsliste neu und bringt anschliessend die bereits **gespeicherten**
   * Versionen auf den veroeffentlichten Stand (so kommt auch eine neu
   * veroeffentlichte Voll-ZIP einer bestehenden Version an). Von selbst
   * veraltet nichts — und von selbst waechst der Speicher auch nicht: eine nur
   * gelistete Version wird erst geholt, wenn jemand sie im Umschalter waehlt.
   *
   * **Nachlieferungen** (Teilpakete zu einer Version) werden nur gemeldet:
   * sie enthalten allein die geaenderten Fachmodule und wuerden das
   * vollstaendige Schema durch ein Bruchstueck ersetzen — das Einspielen bleibt
   * ein bewusster Schritt ueber „Eigener XSD-Ordner…".
   */
  async loadRemoteVersions(): Promise<void> {
    this.toast.show('Rufe die Schema-Versionen von xjustiz.de ab…');
    try {
      const { versionen: remote, nachlieferungen } = await this.remoteSchemas.versionen(true);
      const { liste, neu } = vereineVersionen(this.state.bundledVersions(), remote);
      this.state.bundledVersions.set(liste);
      // Wer die Liste bloss abruft, soll sie behalten: die Bezugsquellen wandern
      // sofort in den Speicher, das ZIP holt erst das Waehlen. Ohne diesen
      // Schritt ueberlebte nur, was auch tatsaechlich geladen wurde — und der
      // Umschalter zeigte nach dem Neuladen wieder nur die hinterlegten Versionen.
      await this.schemas.merkeQuellen(remote);
      this.toast.show(
        `Schemata von xjustiz.de übernommen: ${remote.map((v) => v.label).join(', ')}` +
          (neu.length ? ` (davon neu: ${neu.map((v) => v.label).join(', ')})` : ''),
      );
      if (nachlieferungen.length)
        this.toast.show(
          `Hinweis: zu XJustiz ${nachlieferungen.join(', ')} liegt auf xjustiz.de eine ` +
            'Nachlieferung (Teilpaket). Sie ersetzt das Schema nicht und wird nicht geladen — ' +
            'bei Bedarf über „Eigener XSD-Ordner…" einspielen.',
        );
      await this.aktualisiereGespeicherte(liste);
    } catch (e) {
      this.toast.show(
        'Schemata von xjustiz.de nicht abrufbar: ' + (e instanceof Error ? e.message : e),
      );
    }
  }

  /**
   * Die bereits **gespeicherten** Versionen neu holen — genau die, die jemand
   * einmal bewusst geladen hat. Die aktive laeuft ueber `loadBundled`, damit
   * der Baum den neuen Stand zeigt und nicht den alten; die uebrigen werden
   * still im Speicher ersetzt. Ein Fehlschlag laesst die gespeicherte Fassung
   * stehen: eine alte Version ist besser als keine.
   */
  private async aktualisiereGespeicherte(versionen: BundledVersion[]): Promise<void> {
    // Nur Versionen, deren **Dateien** schon im Speicher liegen — eine bloss
    // gemerkte Bezugsquelle wird nicht ungefragt heruntergeladen.
    const faellig = versionen.filter((v) => v.zipUrl && this.schemas.hatDateien(v.id));
    if (!faellig.length) return;
    const aktiv = this.state.activeBundle();
    let ok = 0;
    for (const v of faellig) {
      try {
        if (v.dir === aktiv) {
          if (await this.loadBundled(v.dir, { erneuern: true })) ok++;
        } else {
          await this.bundled.files(v, { erneuern: true });
          ok++;
        }
      } catch (e) {
        this.logger.warn('Schema-Speicher', `XJustiz ${v.label} nicht aktualisierbar`, e);
      }
    }
    // Der Speicher traegt jetzt neue Abrufzeitpunkte — sie stehen im Tooltip
    // des Umschalters und beantworten dort, wie alt ein Stand ist.
    this.state.bundledVersions.set(
      vereineVersionen(this.state.bundledVersions(), this.schemas.entries()).liste,
    );
    this.toast.show(
      ok === faellig.length
        ? `Gespeicherte Schemata aktualisiert: ${faellig.map((v) => v.label).join(', ')}.`
        : `${ok} von ${faellig.length} gespeicherten Schemata aktualisiert — der Rest bleibt auf dem bisherigen Stand.`,
    );
  }

  /**
   * Tastatur-Navigation (Z.2443-2463): Pfeiltasten im Baum; im gefuehrten
   * Profil-Modus zusaetzlich Links/Rechts = Spur (vorheriger Punkt / naechster
   * offener) und z/o/n = Disposition mit Auto-Sprung.
   *
   * Im gefuehrten **Instanz**-Durchlauf blaettert man statt zu entscheiden
   * (ADR 0016): **senkrecht die Spur** (↓ zur naechsten Station — zugleich das
   * Uebergehen einer freien Station —, ↑ zurueck), **waagerecht die Tiefe** (←
   * gibt den ausgewaehlten Container an und geht hinein, → verlaesst ihn).
   * Pflichtangaben halten das Uebergehen fest (`ueberspringSperre`); zurueck,
   * hinein/heraus und jeder Klick im Baum bleiben frei. Wo keine Station passt,
   * greift die gewohnte Baum-Navigation.
   *
   * Eingabefelder behalten die Tastatur — die **Zweig-Radios** der Auswahl
   * nicht: dort haben Pfeiltasten keine Eingabebedeutung, und nach einem Klick
   * auf einen Zweig blieben sie im Radio haengen (Browser-Standard: Pfeil
   * schaltet den Zweig weiter), statt den Durchlauf fortzusetzen. Die Radios
   * bleiben per Tab erreichbar und mit Leertaste bedienbar.
   */
  onKeydown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !istZweigWahl(t)) return;
    if (document.querySelector('dialog[open]')) return;

    // Auswahl aufheben (#82). Beim Oeffnen einer Nachricht waehlt der
    // NavService sofort die Wurzel; ohne diesen Ausstieg gaebe es keinen
    // Zustand "nichts ausgewaehlt" und die Liste der offenen Punkte im
    // Detailbereich waere nicht erreichbar.
    if (e.key === 'Escape' && this.state.selItem()) {
      this.state.selItem.set(null);
      e.preventDefault();
      return;
    }

    if (
      this.state.guided() &&
      !this.state.readOnly() &&
      this.guided.instanzModus() &&
      this.state.selItem()
    ) {
      // Hoch/Runter gehoeren der Spur — auch am Ende der Nachricht, wo es keine
      // naechste Station gibt: der Ruecksprung der Baum-Navigation warf den
      // Durchlauf sonst an den Anfang zurueck.
      if (e.key === 'ArrowDown') {
        const grund = this.guided.ueberspringSperre();
        if (grund) this.toast.show(grund);
        else this.guided.gotoNext();
        e.preventDefault();
        return;
      }
      // Enter springt zur naechsten **offenen** Angabe (Umlauf am Ende) —
      // dieselbe Bewegung wie Enter im Wert-Feld, damit der Durchlauf ohne
      // Maus und ohne Tastenwechsel laeuft.
      if (e.key === 'Enter') {
        this.zumNaechstenOffenen();
        e.preventDefault();
        return;
      }
      // Ziffer waehlt die Option der Station (Auswahl-Zweig, Verweisziel).
      if (/^[1-9]$/.test(e.key)) {
        const grund = this.guided.waehleOption(Number(e.key));
        if (grund !== undefined) {
          if (grund) this.toast.show(grund);
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'ArrowUp') {
        this.guided.gotoPrev();
        e.preventDefault();
        return;
      }
      // Waagerecht die Tiefe: hinein (links) und heraus (rechts). Bewusst ohne
      // Rueckfall auf die Baum-Navigation — die laeuft genau andersherum
      // (← Eltern, → Kind) und schickte den Durchlauf sonst dorthin, wo die
      // Taste ihn gerade nicht hinbringen soll.
      if (e.key === 'ArrowLeft') {
        this.guided.betreteStation();
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowRight') {
        this.guided.gotoUebergeordnet();
        e.preventDefault();
        return;
      }
    }

    // Gefuehrter Profil-Modus (gleiche Bedingung wie gv im Detail-Panel).
    if (
      this.state.guided() &&
      !this.state.readOnly() &&
      !this.guided.instanzModus() &&
      this.state.selItem()
    ) {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 'ArrowLeft') {
        this.guided.gotoPrev();
        e.preventDefault();
        return;
      }
      if (key === 'ArrowRight') {
        this.guided.gotoNextOpen();
        e.preventDefault();
        return;
      }
      // k = „zu klären": parkt den Punkt sichtbar (#41).
      const wirkung =
        key === 'z'
          ? 'pflicht'
          : key === 'o'
            ? 'optional'
            : key === 'n'
              ? 'ausgeschlossen'
              : key === 'k'
                ? 'markierung'
                : null;
      if (wirkung) {
        if (this.guided.setzeDisposition(wirkung)) e.preventDefault();
        return;
      }
    }

    if (!e.key.startsWith('Arrow')) return;
    if (this.nav.arrowNavigate(e.key)) e.preventDefault();
  }

  /**
   * Enter im Instanz-Durchlauf: zur naechsten offenen Angabe. Eine offene
   * **Pflicht**angabe haelt fest (derselbe Grund wie bei ↓) — sonst bliebe ein
   * typwidriger Wert unbemerkt liegen. Ein Verweis ohne vorhandenes Ziel haelt
   * nicht fest; er kommt am Ende noch einmal.
   */
  private zumNaechstenOffenen(): void {
    const grund = this.guided.ueberspringSperre();
    if (grund) {
      this.toast.show(grund);
      return;
    }
    if (!this.guided.gotoNextOpen())
      this.toast.show('Keine offene Angabe mehr in dieser Nachricht.');
  }

  async onXsdFiles(files: FileList | File[]): Promise<void> {
    try {
      const n = await this.persistence.loadXsdFiles(files);
      this.state.activeBundle.set(null);
      // Einen eigenen Ordner kann der naechste Start nicht wiederholen — die
      // gemerkte Datenbasis waere danach eine Behauptung.
      this.persistence.zuletztAktiveDatenbasis.set('');
      this.toast.show(`${n} Schemadateien geladen.`);
    } catch (e) {
      this.toast.showError(e, 'Laden fehlgeschlagen.');
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
      this.toast.showError(e, 'Nachricht konnte nicht geladen werden.');
    }
  }

  /** Bearbeitete Nachricht als *neue* Testnachricht ablegen. */
  async onSaveMessage(): Promise<void> {
    try {
      await this.testmessageEdit.alsNeueSpeichern();
    } catch (e) {
      this.toast.showError(e, 'Speichern fehlgeschlagen — Backend nicht erreichbar.');
    }
  }

  /** Aenderungen an einer geoeffneten Testnachricht in denselben Eintrag zurueckschreiben. */
  async onUpdateMessage(): Promise<void> {
    try {
      await this.testmessageEdit.speichern();
    } catch (e) {
      this.toast.showError(e, 'Speichern fehlgeschlagen — Backend nicht erreichbar.');
    }
  }

  /** Profilbindung einer geoeffneten Testnachricht bewusst loesen (#32). */
  async onBindungLoesen(): Promise<void> {
    try {
      await this.testmessageEdit.loeseBindung();
    } catch (e) {
      this.toast.showError(e, 'Bindung lösen fehlgeschlagen — Backend nicht erreichbar.');
    }
  }

  /**
   * Gefuehrte Testnachricht-Erstellung speichern: erstes Mal anlegen
   * (Namensabfrage im Service), danach denselben Eintrag aktualisieren.
   */
  async onSaveCreate(): Promise<void> {
    try {
      await this.testmessageCreate.speichern();
    } catch (e) {
      this.toast.showError(e, 'Speichern fehlgeschlagen — Backend nicht erreichbar.');
    }
  }

  /**
   * "Weitere Testnachricht zu diesem Profil": neue Sitzung mit derselben
   * gebundenen Fassung — leer oder als Kopie der eben gespeicherten.
   */
  async onWeitereTestnachricht(alsKopie: boolean): Promise<void> {
    try {
      await this.testmessageCreate.weitereTestnachricht(alsKopie);
      this.toast.show(
        alsKopie
          ? 'Weitere Testnachricht — Werte übernommen; das Speichern legt einen eigenen Eintrag an.'
          : 'Weitere Testnachricht zu derselben Profilfassung — leer begonnen.',
      );
    } catch (e) {
      this.toast.showError(e, 'Weitere Testnachricht konnte nicht begonnen werden.');
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

  /**
   * Abnahme-Badge im Editor-Kopf: zeigt feldgenau, was sich gegenueber der
   * abgenommenen Fassung geaendert hat. Der Arbeitsstand kommt aus dem Store —
   * ein Autosave-Flush ist nicht noetig.
   */
  onAbnahmeDiff(): void {
    const id = this.state.activeProfileId();
    if (id) this.vergleich.oeffneProfil(id);
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
      if (InstanceImportService.rootMessageName(text))
        this.importInstanceText(text, files[0]!.name);
      else this.onCodelistFiles(files);
      return;
    }
    if (files.some((x) => /\.(xml|zip)$/i.test(x.name))) this.onCodelistFiles(files);
  }
}
