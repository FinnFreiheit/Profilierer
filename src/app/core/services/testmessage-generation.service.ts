import { Injectable, inject } from '@angular/core';
import { ProfileDoc } from '../../models/profile.model';
import { TreeItem, TreeNode } from '../../models/node.model';
import { XsdDoc, XsdIndex } from '../../models/xsd-index.model';
import { MessageEditSession } from '../../models/testmessage.model';
import { StateService } from './state.service';
import { NavService } from './nav.service';
import { ExportService } from './export.service';
import { ProfileStoreService } from './profile-store.service';
import { TestmessageStoreService } from './testmessage-store.service';
import { BundledSchemaService } from './bundled-schema.service';
import { PersistenceService } from './persistence.service';
import { XmlValidationService } from './xml-validation.service';
import { ValidationReportService } from './validation-report.service';
import { ValidationMarkerService } from './validation-marker.service';

/** Vollstaendiger Editor-Stand fuer den temporaeren Profil-Swap. */
interface EditorStand {
  docs: XsdDoc[];
  idx: XsdIndex | null;
  version: string;
  standardKennung: string;
  activeBundle: string | null;
  msgName: string | null;
  root: TreeNode | null;
  selItem: TreeItem | null;
  open: ReadonlySet<string>;
  readOnly: boolean;
  onlyValues: boolean;
  messageEdit: MessageEditSession | null;
  profil: ProfileDoc;
  activeProfileId: string | null;
}

/**
 * Testnachricht aus einer Bibliotheks-Profilierung erzeugen und im
 * Testdatenspeicher ablegen. Nutzt den bestehenden Beispiel-XML-Generator
 * (ExportService.buildBeispielXml), der den globalen Editor-Zustand liest —
 * das Profil wird daher temporaer in den State geladen und der vorherige
 * Stand in jedem Fall (finally) wiederhergestellt.
 */
@Injectable({ providedIn: 'root' })
export class TestmessageGenerationService {
  private readonly state = inject(StateService);
  private readonly nav = inject(NavService);
  private readonly exporter = inject(ExportService);
  private readonly profiles = inject(ProfileStoreService);
  private readonly testdaten = inject(TestmessageStoreService);
  private readonly bundled = inject(BundledSchemaService);
  private readonly persistence = inject(PersistenceService);
  private readonly validator = inject(XmlValidationService);
  private readonly report = inject(ValidationReportService);
  private readonly marker = inject(ValidationMarkerService);

  // `erzeugeAusProfil` ist mit Issue #35 entfallen: es gibt genau **einen** Weg
  // von der Profilierung zur Testnachricht — den gefuehrten Durchlauf mit
  // Bindung (`TestmessageCreateService.neuAusProfil`). Der Ein-Klick-Erzeuger
  // legte Zufallswerte ab, die niemand geprueft hatte. Geblieben ist der
  // gemeinsame Baustein `ensureSchema`, den der gefuehrte Weg mitnutzt.

  /**
   * Die zum Profil passende hinterlegte XJustiz-Version laden (falls noetig).
   * Best effort: ohne Angabe bzw. ohne hinterlegte Version bleibt das aktuelle
   * Schema — der idx.el-Check des Aufrufers faengt den Fehlerfall ab.
   * Auch von Testdaten.openInTree genutzt.
   */
  async ensureSchema(version?: string): Promise<void> {
    if (!version || this.state.version() === version) return;
    const v = this.state.bundledVersions().find((x) => x.id === version);
    if (!v) return;
    await this.persistence.loadBundle(v);
  }

  private snapshot(): EditorStand {
    return {
      docs: this.state.docs(),
      idx: this.state.idx(),
      version: this.state.version(),
      standardKennung: this.state.standardKennung(),
      activeBundle: this.state.activeBundle(),
      msgName: this.state.msgName(),
      root: this.state.root(),
      selItem: this.state.selItem(),
      open: this.state.open(),
      readOnly: this.state.readOnly(),
      onlyValues: this.state.onlyValues(),
      messageEdit: this.state.messageEdit(),
      profil: this.state.profileDoc(),
      activeProfileId: this.state.activeProfileId(),
    };
  }

  /**
   * Signal-Referenzen direkt zuruecksetzen (kein Re-Parse der XSDs; traegt auch
   * den Fall Fremdschema per Ordner-Upload, activeBundle = null). loadProfile
   * nullt selItem/open/readOnly/onlyValues/messageEdit — daher danach setzen;
   * activeProfileId zuletzt, damit der Autosave erst auf den fertigen Stand
   * wieder scharf wird.
   */
  private restore(s: EditorStand): void {
    this.state.docs.set(s.docs);
    this.state.idx.set(s.idx);
    this.state.version.set(s.version);
    this.state.standardKennung.set(s.standardKennung);
    this.state.activeBundle.set(s.activeBundle);
    this.state.loadProfile(s.profil);
    this.state.msgName.set(s.msgName);
    this.state.root.set(s.root);
    this.state.selItem.set(s.selItem);
    this.state.open.set(s.open);
    this.state.readOnly.set(s.readOnly);
    this.state.onlyValues.set(s.onlyValues);
    this.state.messageEdit.set(s.messageEdit);
    this.state.activeProfileId.set(s.activeProfileId);
  }
}
