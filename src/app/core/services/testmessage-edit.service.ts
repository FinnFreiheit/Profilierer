import { Injectable, inject } from '@angular/core';
import { TestmessageEntry } from '../../models/testmessage.model';
import {
  frageTestnachrichtName,
  parseTestmessage,
  testmessageInput,
} from '../util/testmessage.util';
import { StateService } from './state.service';
import { NavService } from './nav.service';
import { InstanceImportService } from './instance-import.service';
import { InstanceExportService } from './instance-export.service';
import { TestmessageStoreService } from './testmessage-store.service';
import { TestmessageAutosaveService } from './testmessage-autosave.service';
import { TestmessageCreateService } from './testmessage-create.service';
import { PersistenceService } from './persistence.service';
import { RolleService } from './rolle.service';
import { ToastService } from './toast.service';
import { XmlValidationService } from './xml-validation.service';
import { ValidationReportService } from './validation-report.service';
import { SitzungsAbgleichService } from './konformitaet.service';
import { speicherUrteil } from '../util/speicher-urteil';
import { bezeichnungenAnwenden, bezeichnungenAus } from '../util/ausp-bezeichnung.util';
import { ReportEintrag } from '../../models/validation.model';
import { ProfileDoc } from '../../models/profile.model';

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
  private readonly autosave = inject(TestmessageAutosaveService);
  private readonly persistence = inject(PersistenceService);
  private readonly rolle = inject(RolleService);
  private readonly toast = inject(ToastService);
  private readonly validator = inject(XmlValidationService);
  private readonly report = inject(ValidationReportService);
  private readonly abgleich = inject(SitzungsAbgleichService);
  private readonly nav = inject(NavService);
  private readonly create = inject(TestmessageCreateService);

  /**
   * Einen Eintrag so oeffnen, wie es der Klick auf seine Kachel tut — der eine
   * Weg zu einer gespeicherten Testnachricht, gleich ob er aus dem Kachel-Grid
   * kommt oder aus einem geteilten Link (`?testnachricht=<id>`).
   *
   * Gefuehrt erstellte Nachrichten werden gefuehrt fortgesetzt: dort ist der
   * gespeicherte Entscheidungsstand die Wahrheit. Ist der Stand nicht ladbar
   * (Backend/Schema), faellt es auf das gewoehnliche Oeffnen im Baum zurueck.
   * Fuer Externe an abgenommenen Nachrichten entfaellt die Fuehrung — sie
   * schriebe in den gesperrten Eintrag.
   */
  async oeffneEintrag(
    entry: TestmessageEntry,
    modus: 'betrachten' | 'bearbeiten' = 'betrachten',
  ): Promise<void> {
    if (entry.gefuehrt && !this.gesperrt(entry)) {
      try {
        await this.create.fortsetzen(entry);
        return;
      } catch {
        // Stand nicht ladbar — auf das normale Oeffnen zurueckfallen.
      }
    }
    await this.oeffnen(entry, modus);
  }

  /** Abnahme-Schreibschutz: abgenommen und ohne AG-Schluessel. */
  gesperrt(entry: TestmessageEntry): boolean {
    return !!entry.abgenommen && !this.rolle.agAktiv();
  }

  /**
   * Testnachricht im Baum oeffnen — betrachtend (gesperrt, nur belegte Aeste)
   * oder gleich bearbeitend. Wirft Error mit Nutzertext.
   *
   * Die Reihenfolge ist bindend: `importXml` laeuft ueber `nav.loadMessage` ->
   * `loadProfile` und setzt dabei Sessions und Ansichts-Flags zurueck. Alles,
   * was die Bearbeitung ausmacht, wird deshalb erst danach gesetzt.
   */
  async oeffnen(
    entry: TestmessageEntry,
    modus: 'betrachten' | 'bearbeiten',
    opts: { schemaHinweis?: boolean } = {},
  ): Promise<void> {
    // Haengende Aenderungen der zuvor offenen Nachricht erst sichern — sonst
    // liefe die Entprellung gegen den alten Eintrag ins Leere (#105).
    await this.autosave.flush();
    await this.persistence.flushAutosave();
    this.gefragtFuer = null;
    const xml = await this.store.loadXml(entry.id);
    if (xml == null) throw new Error('Nachricht nicht gefunden.');
    await this.persistence.ensureSchema(entry.xjustizVersion);
    // Kein Bibliothekseintrag: die Bearbeitung einer Nachricht darf nicht per
    // Autosave in ein (evtl. offenes) Profil geschrieben werden.
    this.state.activeProfileId.set(null);
    this.instanceImport.importXml(xml, entry.name, opts.schemaHinweis ?? true);
    this.state.messageEdit.update((s) => (s ? { ...s, entryId: entry.id } : s));

    // Profil-Bindung ueberlebt das Bearbeiten (#32): die eingefrorene Kopie
    // wird mitgeladen, damit Sperren, Fuehrung und Abgleich weitergelten — eine
    // schnelle Wertkorrektur soll die Konformitaet nicht unbemerkt zerstoeren.
    // Erst nach `importXml`, das ueber `loadProfile` jede Vorgabe raeumt. Ohne
    // Bindung (oder nach bewusstem Loesen) liefert der Server 404 und alles
    // bleibt wie bisher.
    const vorgabe = entry.profilId ? await this.store.loadVorgabe(entry.id) : null;
    if (vorgabe) {
      this.state.setVorgabe(vorgabe);
      this.state.guided.set(true);
    }

    // Vergebene Namen der Vorkommen zurueckholen. Erst hier, nach `setVorgabe`:
    // mit Bindung liefert `alleAuspListen` die Sicht der gebundenen Fassung —
    // dieselbe Grundlage, aus der `speichern` die Namen wieder einsammelt.
    const bez = await this.store.loadBezeichnungen(entry.id).catch(() => null);
    if (bez)
      for (const u of bezeichnungenAnwenden(this.state.alleAuspListen(), bez))
        this.state.renameAusp(u.pfad, u.id, u.name);

    // Immer explizit setzen, also auch loesen: der Schutz haengt an der zuletzt
    // geoeffneten Nachricht, nicht an einem Profil (activeProfileId ist null).
    this.state.abnahmeSchreibschutz.set(this.gesperrt(entry));
    if (modus === 'bearbeiten') this.bearbeitenAnfordern();
    this.state.view.set('editor');
    // Der geladene Stand kommt aus dem Speicher — er ist bereits gesichert.
    // Ohne diese Marke schriebe der Autosave die Nachricht sofort nach dem
    // Oeffnen unveraendert zurueck und schoebe sie in der Uebersicht nach oben.
    this.autosave.sitzungBeginnt();
  }

  /**
   * Die Nachricht zu einem Befund des Profil-Pruefberichts oeffnen (#107) und
   * zum betroffenen Element springen.
   *
   * Gebunden wird die **geprueefte** Fassung, nicht die Bindung des Eintrags:
   * der Bericht handelt von jener Fassung, und der Baum soll ihre Sperren und
   * Marker zeigen. Eine hochgeladene Nachricht hat ueberhaupt keine Bindung —
   * ohne dieses Setzen stuende der Befund im Bericht, im Baum aber nichts.
   *
   * `oeffnen` sichert vorher haengende Aenderungen (Autosave-Flush), darum ist
   * der Wechsel kein Verlust: es ist derselbe Weg, den jedes Oeffnen aus dem
   * Testdaten-Speicher geht.
   */
  async oeffneFuerBefund(
    entry: TestmessageEntry,
    vorgabe: ProfileDoc,
    pfad: string,
  ): Promise<void> {
    // Ohne den Schema-Hinweis: er wuerde den Pruefbericht im gemeinsamen
    // Berichts-Store ersetzen, und sein Inhalt steht dort schon.
    await this.oeffnen(entry, 'betrachten', { schemaHinweis: false });
    this.state.setVorgabe(vorgabe);
    this.state.guided.set(true);
    this.nav.jumpTo(pfad, true);
  }

  /**
   * Die Nachricht, fuer die die Rueckfrage unten schon gestellt wurde. Sie
   * gehoert zur Sitzung, nicht zum Vorgang: einmal beantwortet, arbeitet man
   * weiter, ohne bei jedem Moduswechsel erneut gefragt zu werden.
   */
  private gefragtFuer: string | null = null;

  /**
   * In den Bearbeitungsmodus schalten — der eine Ort, an dem das entschieden
   * wird (Kachel-Aktion "Bearbeiten" wie Modus-Segment der Werkzeugleiste).
   * Gibt false zurueck, wenn es beim Betrachten bleibt.
   *
   * Hier sitzt seit #105 auch die Rueckfrage zu gefuehrt erstellten
   * Nachrichten. Sie stand frueher im Speichern — mit Autosave kaeme sie dort
   * nie mehr zum Zug, und das ist ohnehin die spaetere Stelle: der gespeicherte
   * Entscheidungsstand passt schon nach der **ersten Aenderung** nicht mehr zum
   * XML, nicht erst beim Zurueckschreiben.
   */
  bearbeitenAnfordern(): boolean {
    if (this.state.abnahmeSchreibschutz()) {
      this.toast.show('Von der BLK-AG freigegeben — nur betrachten (AG-Schlüssel nötig).');
      return false;
    }
    const id = this.state.messageEdit()?.entryId ?? null;
    const eintrag = id ? this.store.entries().find((e) => e.id === id) : undefined;
    if (eintrag?.gefuehrt && this.gefragtFuer !== id) {
      if (
        !confirm(
          'Diese Nachricht wurde geführt erstellt. Beim Bearbeiten passt der gespeicherte Entscheidungsstand nicht mehr zum XML — „Entwurf fortsetzen" führt danach auf einen veralteten Stand. Trotzdem bearbeiten?',
        )
      ) {
        this.toast.show('Es bleibt beim Betrachten — der Entscheidungsstand bleibt unberührt.');
        return false;
      }
      this.gefragtFuer = id;
    }
    this.state.nachrichtBearbeiten(true);
    return true;
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
      this.toast.show('Von der BLK-AG freigegeben — Speichern nur mit AG-Schlüssel.');
      return false;
    }
    // Die Rueckfrage zu gefuehrt erstellten Nachrichten steht seit #105 am
    // Beginn der Bearbeitung (bearbeitenAnfordern) — hier kaeme sie mit
    // laufendem Autosave zu spaet.

    // Kopfdaten unangetastet: es ist dieselbe Nachricht, keine neue.
    const xml = this.instanceExport.buildInstanceXml(session, false);
    const meta = parseTestmessage(xml);
    if (!meta) throw new Error('Die erzeugte Nachricht ist nicht lesbar — bitte prüfen.');

    // Befunde erheben — derselbe Konformitaets-Abgleich wie im Durchlauf
    // (#31/#32, er ist der Grund, warum die Bindung das Bearbeiten ueberlebt);
    // bei Invaliditaet fragt dieser Weg zurueck, bevor er speichert. Das
    // **Urteil** darueber faellt einmal, im Speicher-Urteil.
    const verstoesse = this.abgleich.pruefe();

    const pruefung = await this.validator.validiere(xml);
    let schemaEintraege: ReportEintrag[] | null = null;
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
      schemaEintraege = pruefung.fehler.map((text) => ({ text }));
    }

    const urteil = speicherUrteil({ verstoesse, schemaEintraege });
    // entwurf immer mitsenden: eine reparierte Nachricht verliert so ihr
    // Entwurfs-Kennzeichen wieder. bezeichnungen ebenso — sonst ueberlebte ein
    // geloeschtes Vorkommen als verwaister Name den naechsten Speichervorgang.
    await this.store.updateMeta(session.entryId, {
      xml,
      entwurf: urteil.entwurf,
      bezeichnungen: bezeichnungenAus(this.state.alleAuspListen()),
    });
    this.autosave.explizitGespeichert();
    const m = urteil.meldung;
    if (m) {
      this.toast.show(m.toast);
      this.report.zeigeMitPfaden(
        m.titel,
        m.eintraege,
        m.art === 'verstoesse' ? m.untertitel : undefined,
      );
    } else {
      this.toast.show('Änderungen gespeichert.');
    }
    return true;
  }

  /**
   * Profilbindung bewusst loesen (#32) — der Ausstieg fuer Negativtests: die
   * eingefrorene Kopie faellt am Eintrag weg, Sperren und Fuehrung enden
   * sofort, das Kennzeichen "Profil weiterentwickelt" verschwindet. Die
   * **Herkunft** bleibt am Eintrag stehen und auf der Kachel sichtbar: sie ist
   * Historie, keine Bindung. Gibt true zurueck, wenn geloest wurde.
   */
  async loeseBindung(): Promise<boolean> {
    const session = this.state.messageEdit();
    if (!session?.entryId || !this.state.hatVorgabe()) return false;
    if (
      !confirm(
        'Profilbindung lösen? Sperren und Führung enden, die Nachricht verhält sich danach wie eine freie Instanz. Die Herkunftsangabe bleibt erhalten.',
      )
    )
      return false;
    await this.store.loeseBindung(session.entryId);
    this.state.clearVorgabe();
    this.state.guided.set(false);
    this.toast.show('Profilbindung gelöst — die Nachricht ist jetzt eine freie Instanz.');
    return true;
  }

  /**
   * Die (bearbeitete) Nachricht als *neuen* Testspeicher-Eintrag ablegen:
   * getreu serialisieren (Original-DOM + Modell-Aenderungen), mit frischen
   * Kopfdaten. Anders als beim Zurueckspeichern muss das Ergebnis schema-valide
   * sein — neue Eintraege durchlaufen dasselbe Tor wie der Upload.
   *
   * Seit dem Autosave (#105) ist das kein Weg mehr, den Ausgangseintrag
   * unberuehrt zu lassen: die Aenderungen davor sind dort laengst gesichert.
   * Der Ausstieg heisst hier "abzweigen", nicht "verwerfen".
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
    await this.store.create({
      ...testmessageInput(name, xml, meta),
      bezeichnungen: bezeichnungenAus(this.state.alleAuspListen()),
    });
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
