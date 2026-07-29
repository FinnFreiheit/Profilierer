import { Injectable, inject } from '@angular/core';
import { TestmessageEntry } from '../../models/testmessage.model';
import {
  frageTestnachrichtName,
  parseTestmessage,
  testmessageInput,
} from '../util/testmessage.util';
import { StateService } from './state.service';
import { InstanceImportService } from './instance-import.service';
import { InstanceExportService } from './instance-export.service';
import { TestmessageStoreService } from './testmessage-store.service';
import { TestmessageGenerationService } from './testmessage-generation.service';
import { PersistenceService } from './persistence.service';
import { RolleService } from './rolle.service';
import { ToastService } from './toast.service';
import { XmlValidationService } from './xml-validation.service';
import { ValidationReportService } from './validation-report.service';

/**
 * Eine gespeicherte Testnachricht oeffnen und bearbeiten (US "Testnachricht
 * bearbeiten"): Werte aendern, Angaben hinzufuegen oder entfernen, Vorkommen
 * anlegen oder loeschen — und das Ergebnis entweder in **denselben** Eintrag
 * zurueckschreiben oder als neue Testnachricht ablegen.
 *
 * Gegenstueck zum TestmessageCreateService (gefuehrtes Neu-Erstellen). Beide
 * Wege teilen sich den Testspeicher, unterscheiden sich aber in der Quelle der
 * Wahrheit: hier ist es das Quell-DOM der Nachricht (treuer Re-Export ueber den
 * InstanceExportService), dort der gespeicherte Entscheidungsstand.
 */
@Injectable({ providedIn: 'root' })
export class TestmessageEditService {
  private readonly state = inject(StateService);
  private readonly instanceImport = inject(InstanceImportService);
  private readonly instanceExport = inject(InstanceExportService);
  private readonly store = inject(TestmessageStoreService);
  private readonly generator = inject(TestmessageGenerationService);
  private readonly persistence = inject(PersistenceService);
  private readonly rolle = inject(RolleService);
  private readonly toast = inject(ToastService);
  private readonly validator = inject(XmlValidationService);
  private readonly report = inject(ValidationReportService);

  /**
   * Testnachricht im Baum oeffnen — betrachtend (gesperrt, nur belegte Aeste)
   * oder gleich bearbeitend. Wirft Error mit Nutzertext.
   *
   * Die Reihenfolge ist bindend: `importXml` laeuft ueber `nav.loadMessage` ->
   * `loadProfile` und setzt dabei Sessions und Ansichts-Flags zurueck. Alles,
   * was die Bearbeitung ausmacht, wird deshalb erst danach gesetzt.
   */
  async oeffnen(entry: TestmessageEntry, modus: 'betrachten' | 'bearbeiten'): Promise<void> {
    await this.persistence.flushAutosave();
    const xml = await this.store.loadXml(entry.id);
    if (xml == null) throw new Error('Nachricht nicht gefunden.');
    await this.generator.ensureSchema(entry.xjustizVersion);
    // Kein Bibliothekseintrag: die Bearbeitung einer Nachricht darf nicht per
    // Autosave in ein (evtl. offenes) Profil geschrieben werden.
    this.state.activeProfileId.set(null);
    this.instanceImport.importXml(xml, entry.name);
    this.state.messageEdit.update((s) => (s ? { ...s, entryId: entry.id } : s));

    // Immer explizit setzen, also auch loesen: der Schutz haengt an der zuletzt
    // geoeffneten Nachricht, nicht an einem Profil (activeProfileId ist null).
    const schutz = !!entry.abgenommen && !this.rolle.agAktiv();
    this.state.abnahmeSchreibschutz.set(schutz);
    if (modus === 'bearbeiten') {
      if (schutz)
        this.toast.show('Von der BLK-AG abgenommen — nur betrachten (AG-Schlüssel nötig).');
      else this.state.nachrichtBearbeiten(true);
    }
    this.state.view.set('editor');
  }

  /**
   * Aenderungen in denselben Testspeicher-Eintrag zurueckschreiben. Anders als
   * beim Anlegen einer neuen Nachricht ist eine invalide Nachricht hier kein
   * hartes Aus: fuer Nachrichten gibt es kein Autosave, ein Speicher-Verbot
   * wuerde also Arbeit vernichten. Nach Rueckfrage landet der Stand als
   * gekennzeichneter Entwurf. Gibt true zurueck, wenn gespeichert wurde.
   */
  async speichern(): Promise<boolean> {
    const session = this.state.messageEdit();
    if (!session?.entryId) return false;
    if (this.state.abnahmeSchreibschutz()) {
      this.toast.show('Von der BLK-AG abgenommen — Speichern nur mit AG-Schlüssel.');
      return false;
    }
    const eintrag = this.store.entries().find((e) => e.id === session.entryId);
    if (
      eintrag?.gefuehrt &&
      !confirm(
        'Diese Nachricht wurde geführt erstellt. Der gespeicherte Entscheidungsstand passt nach dem Speichern nicht mehr zum XML. Trotzdem speichern?',
      )
    )
      return false;

    // Kopfdaten unangetastet: es ist dieselbe Nachricht, keine neue.
    const xml = this.instanceExport.buildInstanceXml(session, false);
    const meta = parseTestmessage(xml);
    if (!meta) throw new Error('Die erzeugte Nachricht ist nicht lesbar — bitte prüfen.');

    const pruefung = await this.validator.validiere(xml);
    let entwurf = false;
    if (pruefung.status !== 'valide') {
      if (
        !confirm(
          'Die Nachricht ist nicht schema-valide. Änderungen trotzdem als Entwurf speichern?',
        )
      ) {
        this.report.zeige(
          'Nicht gespeichert — die Nachricht ist nicht schema-valide',
          pruefung.fehler,
        );
        return false;
      }
      entwurf = true;
    }
    // entwurf immer mitsenden: eine reparierte Nachricht verliert so ihr
    // Entwurfs-Kennzeichen wieder.
    await this.store.updateMeta(session.entryId, { xml, entwurf });
    if (entwurf) {
      this.toast.show('Als Entwurf gespeichert — die Nachricht ist nicht schema-valide.');
      this.report.zeige('Als Entwurf gespeichert — Nachricht nicht schema-valide', pruefung.fehler);
    } else {
      this.toast.show('Änderungen gespeichert.');
    }
    return true;
  }

  /**
   * Die (bearbeitete) Nachricht als *neuen* Testspeicher-Eintrag ablegen:
   * getreu serialisieren (Original-DOM + Modell-Aenderungen), mit frischen
   * Kopfdaten. Anders als beim Zurueckspeichern muss das Ergebnis schema-valide
   * sein — neue Eintraege durchlaufen dasselbe Tor wie der Upload.
   */
  async alsNeueSpeichern(): Promise<boolean> {
    const session = this.state.messageEdit();
    if (!session) return false;
    const name = frageTestnachrichtName(this.msgNameVorschlag(session.quellName));
    if (name == null) return false; // abgebrochen

    const xml = this.instanceExport.buildInstanceXml(session);
    const meta = parseTestmessage(xml);
    if (!meta) {
      this.toast.show('Die erzeugte Nachricht ist nicht lesbar — bitte prüfen.');
      return false;
    }
    const pruefung = await this.validator.validiere(xml);
    if (pruefung.status !== 'valide') {
      this.report.zeige(
        'Nicht gespeichert — die Nachricht ist nicht schema-valide',
        pruefung.fehler,
      );
      return false;
    }
    await this.store.create(testmessageInput(name, xml, meta));
    this.toast.show('Als neue Testnachricht gespeichert.');
    this.state.view.set('testdaten');
    return true;
  }

  /** Vorschlag „<Quelle> (bearbeitet).xml" aus dem Quellnamen. */
  private msgNameVorschlag(quellName: string): string {
    const base = quellName.replace(/\.xml$/i, '');
    return `${base} (bearbeitet).xml`;
  }
}
