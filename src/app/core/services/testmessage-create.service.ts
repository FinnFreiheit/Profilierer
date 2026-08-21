import { Injectable, inject } from '@angular/core';
import { TreeNode } from '../../models/node.model';
import { LibraryEntry, ProfileDoc, Status } from '../../models/profile.model';
import { GuidedMessageState, TestmessageEntry } from '../../models/testmessage.model';
import {
  frageTestnachrichtName,
  parseTestmessage,
  testmessageInput,
} from '../util/testmessage.util';
import { pretty } from '../util/pretty.util';
import { blattName, unterPfad, vorfahren } from '../util/pfad.util';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { NavService } from './nav.service';
import { GuidedService } from './guided.service';
import { ExportService } from './export.service';
import { TestmessageStoreService } from './testmessage-store.service';
import { TestmessageAutosaveService } from './testmessage-autosave.service';
import { ProfileStoreService } from './profile-store.service';
import { PersistenceService } from './persistence.service';
import { ToastService } from './toast.service';
import { XmlValidationService } from './xml-validation.service';
import { ValidationReportService } from './validation-report.service';
import { ValidationMarkerService } from './validation-marker.service';
import { ValueService } from './value.service';
import { CodelistService } from './codelist.service';
import { SitzungsAbgleichService } from './konformitaet.service';
import { speicherUrteil } from '../util/speicher-urteil';
import { bezeichnungenAus } from '../util/ausp-bezeichnung.util';
import { ReportEintrag } from '../../models/validation.model';
import { ERW_SPERRE_GRUND, sperrtPruefartefakte } from '../util/erweiterung-sperre';

/**
 * Testnachricht gefuehrt aus einem Schema erstellen (US "Testnachricht
 * gefuehrt erstellen"): startet die Sitzung im Baum-Editor (leerer Baum,
 * Fuehrung an), setzt gespeicherte Entwuerfe fort und speichert den Stand als
 * Testspeicher-Eintrag — beim ersten Mal anlegen, danach denselben Eintrag
 * aktualisieren. Gespeichert werden XML (Instanz-Zwischenstand), das
 * Entwurfs-Kennzeichen ("valide" = keine offenen Pflicht-Punkte), der
 * Fortschritt und der Entscheidungsstand (Profil-Modell als JSON).
 */
@Injectable({ providedIn: 'root' })
export class TestmessageCreateService {
  private readonly state = inject(StateService);
  private readonly tree = inject(TreeService);
  private readonly nav = inject(NavService);
  private readonly guided = inject(GuidedService);
  private readonly exporter = inject(ExportService);
  private readonly store = inject(TestmessageStoreService);
  private readonly autosave = inject(TestmessageAutosaveService);
  private readonly profiles = inject(ProfileStoreService);
  private readonly persistence = inject(PersistenceService);
  private readonly toast = inject(ToastService);
  private readonly validator = inject(XmlValidationService);
  private readonly report = inject(ValidationReportService);
  private readonly marker = inject(ValidationMarkerService);
  /** Nur fuer die Codelisten-Deckung in `meldeWidersprueche`. */
  private readonly values = inject(ValueService);
  private readonly codelists = inject(CodelistService);
  private readonly abgleich = inject(SitzungsAbgleichService);

  /**
   * Neue Sitzung: Schema der Version sicherstellen, Nachricht laden (leerer
   * Baum, keine Vorbelegung von Werten), Mindest-Vorkommen anlegen und die
   * Fuehrung starten. Wirft Error mit Nutzertext.
   */
  async neuErstellen(version: string | undefined, msgName: string): Promise<void> {
    await this.autosave.flush();
    await this.persistence.flushAutosave();
    this.state.activeProfileId.set(null);
    // Schutz einer zuvor geoeffneten abgenommenen Nachricht loesen: er haengt
    // nicht am Profil (activeProfileId ist hier null) und bliebe sonst stehen.
    this.state.abnahmeSchreibschutz.set(false);
    await this.persistence.ensureSchema(version);
    if (!this.state.idx()?.el[msgName])
      throw new Error('Nachricht nicht im geladenen Schema gefunden: ' + msgName);
    this.nav.loadMessage(msgName); // setzt Profil zurueck, leert die Sessions
    this.legeMindestVorkommenAn(this.state.root()!);
    this.state.messageCreate.set({
      msgName,
      xjustizVersion: version || this.state.version() || undefined,
      entryId: null,
      name: null,
    });
    this.state.guided.set(true);
    this.state.view.set('editor');
    this.codelistenBereitstellen();
    this.guided.loeseEindeutigeVerweise();
    this.guided.gotoNextOpen();
    // Der Durchlauf beginnt mit dem, was ohnehin im Speicher steht bzw. noch
    // nichts enthaelt — der Autosave wird erst mit der ersten Aenderung faellig.
    this.autosave.sitzungBeginnt();
  }

  /**
   * Codelisten des Standards still nachladen — dieselbe Best-effort-Abholung,
   * die der Instanz-Import macht (`InstanceImportService`). Ohne sie bleibt ein
   * belegter Code im Durchlauf ein nackter Schluessel ("252") und die
   * Auswahlliste am Feld leer: die Bedeutung steht allein in der Codeliste.
   * Idempotent (der Dienst merkt sich Standard und Version), Fehler blockieren
   * nicht — dann bleibt es eben beim rohen Code.
   */
  private codelistenBereitstellen(): void {
    void this.codelists.ensureUsedCodelists();
  }

  /**
   * Neue Sitzung mit **Profil-Bindung** (US "Testnachricht aus einer
   * Profilierung"): die gewaehlte Fassung — Arbeitsstand oder eine nummerierte
   * Version — wird geladen und als eingefrorene Vorgabe in den Durchlauf
   * gelegt. Version und Nachrichtentyp werden nicht abgefragt; sie stammen aus
   * der Profilierung. Wirft Error mit Nutzertext.
   */
  async neuAusProfil(profil: LibraryEntry, versionId: string | null): Promise<void> {
    // Sperre bei Schema-Erweiterungen (#98) — dieselbe Begruendung wie bei
    // `exportSchematron`: die Regel gehoert an die Naht, nicht nur an die
    // Komponente, damit kein zweiter Aufrufer an ihr vorbei eine Testnachricht
    // erzeugt, in der genau das nachbeauftragte Element fehlt.
    if (sperrtPruefartefakte(profil.nErw)) throw new Error(ERW_SPERRE_GRUND);
    const { doc, fassung } = await this.ladeFassung(profil, versionId);
    const msgName = doc.meta?.nachricht || profil.nachricht;
    if (!msgName)
      throw new Error('Die Profilierung nennt keinen Nachrichtentyp — zuerst dort festlegen.');

    await this.autosave.flush();
    await this.persistence.flushAutosave();
    this.state.activeProfileId.set(null);
    this.state.abnahmeSchreibschutz.set(false); // siehe neuErstellen
    await this.persistence.ensureSchema(doc.meta?.xjustizVersion ?? profil.xjustizVersion);
    if (!this.state.idx()?.el[msgName])
      throw new Error('Nachricht nicht im geladenen Schema gefunden: ' + msgName);

    this.nav.loadMessage(msgName); // setzt Profil zurueck, leert Sessions und Vorgabe
    // Danach binden: jeder Profil-Einstieg raeumt die Vorgabe (loadProfile).
    this.state.setVorgabe(doc);
    this.legeMindestVorkommenAn(this.state.root()!);
    this.state.messageCreate.set({
      msgName,
      xjustizVersion: doc.meta?.xjustizVersion ?? profil.xjustizVersion ?? undefined,
      entryId: null,
      name: null,
      profilId: profil.id,
      profilName: doc.meta?.name || profil.name,
      fassung,
    });
    this.state.guided.set(true);
    this.state.view.set('editor');
    this.codelistenBereitstellen();
    // Verweise mit genau einem zulaessigen Ziel sind ohne Zutun erledigt (#30) —
    // vor dem Sprung auf den ersten offenen Punkt, damit er sie ueberspringt.
    this.guided.loeseEindeutigeVerweise();
    this.guided.gotoNextOpen();
    // Der Durchlauf beginnt mit dem, was ohnehin im Speicher steht bzw. noch
    // nichts enthaelt — der Autosave wird erst mit der ersten Aenderung faellig.
    this.autosave.sitzungBeginnt();
    this.meldeWidersprueche(doc);
  }

  /**
   * Widersprueche der gebundenen Fassung als Profil-Mangel melden: ein Element,
   * das zugleich ausgeschlossen ist und eine Mindestanzahl >= 1 verlangt, kann
   * der Durchlauf nicht beides erfuellen. Der Ausschluss gewinnt (das Element
   * bleibt leer); die Meldung fuehrt per Klick zum betroffenen Element, damit
   * der Widerspruch in der Profilierung geklaert werden kann — statt einer
   * stillschweigend halbierten Vorgabe.
   *
   * Gemeint ist die Mindestanzahl **der Profilierung**: die Schema-Mindestanzahl
   * ausgeschlossener Elemente ist kein Widerspruch der Profilierung, sondern ein
   * Schemaverstoss — den meldet die XSD-Pruefung beim Speichern.
   *
   * Der Ausschluss zaehlt dabei **vererbt**: `legeMindestVorkommenAn` laesst den
   * ganzen Teilbaum eines ausgeschlossenen Knotens aus, also wird auch die
   * Mindestanzahl eines Nachfahren still halbiert. Massgeblich ist durchweg das
   * Dokument der gebundenen Fassung, nicht `vorgabeGesperrt`: die Meldung
   * beschreibt die Aussage der Profilierung und darf nicht verschwinden, weil
   * der Durchlauf am Pfad inzwischen selbst entschieden hat (Fortsetzen).
   */
  private meldeWidersprueche(doc: ProfileDoc): void {
    /** Die ausschliessende Stufe an diesem Pfad — null, wenn er nichts ausschliesst. */
    const schliesstAus = (pfad: string): Status | null => {
      const id = doc.elemente[pfad]?.status;
      if (!id) return null;
      const stufe = doc.statuses.find((s) => s.id === id);
      return stufe?.wirkung === 'ausgeschlossen' ? stufe : null;
    };
    const kurz = (pfad: string): string => pretty(blattName(pfad));

    const eintraege: ReportEintrag[] = [];
    for (const [pfad, p] of Object.entries(doc.elemente)) {
      if (!p.min) continue;
      const min = parseInt(p.min, 10) || 0;
      if (min < 1) continue;
      const name = kurz(pfad);
      const selbst = schliesstAus(pfad);
      if (selbst) {
        eintraege.push({
          pfad,
          text: `${name} (${pfad}): „${selbst.name}" und zugleich Mindestanzahl ${min} — der Ausschluss gilt, das Element bleibt leer.`,
        });
        continue;
      }
      // Vererbt: der naechstgelegene ausgeschlossene Vorfahr nimmt den Ast mit.
      const anc = vorfahren(pfad)
        .reverse()
        .find((a) => schliesstAus(a));
      if (!anc) continue;
      eintraege.push({
        pfad,
        text: `${name} (${pfad}): Mindestanzahl ${min}, aber „${schliesstAus(anc)!.name}" an ${kurz(anc)} (${anc}) — der Ausschluss gilt für den ganzen Teilbaum, das Element bleibt leer.`,
      });
    }

    // Zweiter Widerspruch: die Profilierung gibt Codes frei, die die geladene
    // Codeliste nicht (mehr) fuehrt. Deckt sie *keinen* der freigegebenen Codes,
    // ist der Durchlauf dort in einer Sackgasse — die Werteliste zeigt keine
    // Zeile, die freie Eingabe ist gesperrt, und der Zaehler behauptet weiter
    // "n von m zugelassen". Ohne geladene Liste (extern gepflegt) greift
    // stattdessen der synthetische Ausweg, das ist kein Widerspruch.
    for (const [pfad, p] of Object.entries(doc.elemente)) {
      if (!p.werte?.length) continue;
      const it = this.nav.findItemByPath(pfad);
      const cl = it?.kind === 'el' ? it.node.codelist : null;
      if (!cl) continue;
      const eff = this.values.clWerte(cl);
      const fehlen = this.values.codesOhneDeckung(eff, p.werte);
      if (!fehlen.length || fehlen.length < p.werte.length) continue;
      eintraege.push({
        pfad,
        text: `${kurz(pfad)} (${pfad}): Die Profilierung gibt nur ${fehlen.map((c) => `„${c}"`).join(', ')} frei — die geladene Codeliste ${cl.kennung} führt davon keinen Code. Kein Wert ist auswählbar; zu klären, ob die Profilierung eine andere Listenfassung meint.`,
      });
    }

    // Dritter Widerspruch (#71, entschieden 26.08.03): ein zwingend gesetzter
    // Container, unter dem nichts zwingend ist — alle Kinder schema-optional
    // und keines von der Profilierung selbst zwingend gesetzt. "Diese
    // Konstellation sollte in einer Profilierung nicht vorkommen": die
    // Festlegung erzwingt keinen Inhalt, der Durchlauf kann jeden Ast
    // weglassen und gilt trotzdem als vollstaendig. Statt einer neuen
    // Walk-Semantik (Vollstaendigkeits-Punkt am Container) wird der Fall wie
    // die anderen Profil-Maengel beim Start gemeldet und gehoert in der
    // Profilierung geklaert.
    const wirkungVon = (id: string | undefined): string | undefined =>
      id ? doc.statuses.find((s) => s.id === id)?.wirkung : undefined;

    /**
     * Fuehrt der Durchlauf hier ueberhaupt zwingend hin? Gefragt wird nach dem
     * **Weg**, nicht nach dem Element selbst: dass der Pfad optional ist, ist
     * gerade die Aussage der Profilierung („dieser Ast muss vorkommen"). Liegt
     * aber schon ein Vorfahre in einem Ast, den das Szenario nicht verlangt —
     * ein nicht gewaehlter `auswahl_*`-Zweig, ein optionales Element ohne
     * Festlegung —, dann ist die Festlegung darunter **bedingt**: kommt der Ast
     * vor, gilt sie; verlangt ist er nicht.
     *
     * Massgeblich ist dieselbe Regel wie in `collectMandatoryPaths`: unbedingte
     * Schema-Pflicht (min >= 1, nicht in einer Auswahl) oder eine zwingende
     * Festlegung der Profilierung. Ein unbekannter Pfad gilt als erreichbar —
     * eine Meldung stillschweigend zu schlucken waere der schlechtere Fehler.
     */
    const zwingendErreicht = (pfad: string): boolean =>
      vorfahren(pfad).every((a) => {
        if (wirkungVon(doc.elemente[a]?.status) === 'pflicht') return true;
        const it = this.nav.findItemByPath(a);
        if (!it) return true;
        if (it.kind === 'ausp') return true; // Vorkommen: der Traeger entscheidet
        const n = it.node;
        return n.synthetic
          ? !(n.model === 'choice' || n.min === '0' || n.inChoice)
          : n.min !== '0' && !n.inChoice;
      });

    for (const [pfad, p] of Object.entries(doc.elemente)) {
      if (wirkungVon(p.status) !== 'pflicht') continue;
      const it = this.nav.findItemByPath(pfad);
      if (!it || it.kind !== 'el' || this.tree.isLeaf(it.node)) continue;
      // Erzwingt der Container etwas? Schema-Rueckgrat darunter …
      if (this.tree.collectMandatoryPaths(it.node).length) continue;
      // … eine Auswahl, die einen Zweig verlangt, ohne ihn zu benennen
      // (Nachtrag 26.08.03: `auswahl_*` ist in XJustiz der Regelfall, nicht die
      // Ausnahme — ohne diese Frage meldete der Start jeden zwingend gesetzten
      // Auswahl-Container als Mangel) …
      if (this.tree.verlangtAuswahl(it.node)) continue;
      // … oder eine eigene zwingende Festlegung der Profilierung darunter.
      const zwingendesKind = Object.entries(doc.elemente).some(
        ([k, kp]) => k !== pfad && unterPfad(k, pfad) && wirkungVon(kp.status) === 'pflicht',
      );
      if (zwingendesKind) continue;
      // … und zuletzt: liegt der Container ueberhaupt auf einem Weg, den das
      // Szenario verlangt? Sonst ist „erzwingt nichts" trivial wahr — der
      // Durchlauf betritt den Ast gar nicht erst —, und der Bericht schickte
      // zum Klaeren in einen Zweig, den die Profilierung nie gewaehlt hat.
      // (Gemeldeter Fall: ein zwingend gesetztes `sondereigentum` unter dem
      // nicht verlangten `auswahl_*`-Zweig `wegEinheit`.) Anders als beim
      // vierten Widerspruch, der eine Unmoeglichkeit beschreibt und darum auch
      // im bedingten Ast eine Aussage traegt, geht es hier um Wirkungslosigkeit.
      if (!zwingendErreicht(pfad)) continue;
      eintraege.push({
        pfad,
        text: `${kurz(pfad)} (${pfad}): „zwingend" erzwingt hier nichts — alle Kinder sind schema-optional und keines ist selbst zwingend gesetzt. Der Durchlauf kann den Teilbaum leer lassen; in der Profilierung klären, welches Kind das Szenario verlangt.`,
      });
    }

    // Vierter Widerspruch (Nachtrag 26.08.03): eine Auswahl, die belegt werden
    // muss, deren Zweige die Profilierung aber samt und sonders ausschliesst.
    // Anders als der dritte Fall erzwingt das Schema hier etwas — nur laesst
    // die Profilierung keine zulaessige Wahl uebrig, und der Durchlauf steht
    // vor einer leeren Auswahl. Geprueft wird, wohin der Durchlauf zwingend
    // muss: das Pflicht-Rueckgrat der Nachricht, jeder zwingend gesetzte
    // Container und dessen eigenes Rueckgrat.
    const root = this.state.root();
    const zwingend = new Set<string>(root ? this.tree.collectMandatoryPaths(root) : []);
    for (const [pfad, p] of Object.entries(doc.elemente)) {
      if (wirkungVon(p.status) !== 'pflicht') continue;
      zwingend.add(pfad);
      const it = this.nav.findItemByPath(pfad);
      if (it?.kind === 'el')
        for (const k of this.tree.collectMandatoryPaths(it.node)) zwingend.add(k);
    }
    for (const pfad of zwingend) {
      // Ein ausgeschlossener Ast wird gar nicht erst erzeugt — dort ist die
      // leere Auswahl kein Widerspruch, und der Ausschluss selbst ist oben
      // schon gemeldet, wo die Profilierung ihn zugleich verlangt.
      if (schliesstAus(pfad) || vorfahren(pfad).some((a) => schliesstAus(a))) continue;
      const it = this.nav.findItemByPath(pfad);
      if (!it || it.kind !== 'el') continue;
      for (const zweige of this.tree.auswahlZweige(it.node)) {
        if (!zweige.length) continue;
        // Eine Gruppen-Alternative (synthetisch) traegt keine Festlegung und
        // bleibt darum immer waehlbar — nur benannte Zweige kann die
        // Profilierung ausschliessen.
        const offen = zweige.filter((z) => z.synthetic || !schliesstAus(z.path));
        if (offen.length) continue;
        eintraege.push({
          pfad,
          text: `${kurz(pfad)} (${pfad}): Die Auswahl muss belegt werden, aber ${zweige.map((z) => `„${kurz(z.path)}"`).join(', ')} ${zweige.length > 1 ? 'sind' : 'ist'} ausgeschlossen — dem Durchlauf bleibt kein zulässiger Zweig. In der Profilierung klären, welcher Zweig das Szenario trägt.`,
        });
        break; // eine blockierte Auswahl je Container genuegt als Meldung
      }
    }

    if (!eintraege.length) return;
    this.report.zeigeMitPfaden(
      'Widersprüche in der Profilierung',
      eintraege,
      'Die gebundene Fassung enthält Festlegungen, die der Durchlauf nicht einlösen kann. Ein Klick springt zum betroffenen Element.',
    );
  }

  /**
   * Die zu bindende Fassung samt Bezeichnung: `null` = Arbeitsstand ("Arbeitsstand
   * vom …"), sonst die nummerierte Version ("v3"). Die Bezeichnung wird am
   * Eintrag mitgefuehrt und bleibt lesbar, wenn die Profilierung spaeter
   * geaendert oder geloescht wird.
   */
  private async ladeFassung(
    profil: LibraryEntry,
    versionId: string | null,
  ): Promise<{ doc: ProfileDoc; fassung: string }> {
    if (versionId) {
      const ver = await this.profiles.loadVersion(profil.id, versionId);
      if (!ver) throw new Error('Fassung der Profilierung nicht gefunden.');
      return { doc: ver.doc, fassung: 'v' + ver.nr };
    }
    const doc = await this.profiles.load(profil.id);
    if (!doc) throw new Error('Profilierung nicht gefunden.');
    const datum = new Date(profil.aktualisiert).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    return { doc, fassung: 'Arbeitsstand vom ' + datum };
  }

  /**
   * Entwurf fortsetzen: Entscheidungsstand laden, Schema/Nachricht
   * wiederherstellen und am naechsten offenen Punkt weitermachen. Bei einer
   * profilgebundenen Nachricht wird die **eingefrorene Kopie** mitgeladen —
   * nicht die inzwischen weiterentwickelte Profilfassung. Ihre Widersprueche
   * meldet auch dieser Start: es ist dieselbe Fassung mit derselben still
   * halbierten Vorgabe, und wer einen Entwurf fortsetzt, saehe den Mangel sonst
   * nie.
   */
  async fortsetzen(entry: TestmessageEntry): Promise<void> {
    const stand = await this.store.loadEntscheidungen(entry.id);
    if (!stand)
      throw new Error('Kein Entscheidungsstand gespeichert — Nachricht wird nur geöffnet.');
    const vorgabe = entry.profilId ? await this.store.loadVorgabe(entry.id) : null;
    await this.autosave.flush();
    await this.persistence.flushAutosave();
    this.state.activeProfileId.set(null);
    this.state.abnahmeSchreibschutz.set(false); // siehe neuErstellen
    await this.persistence.ensureSchema(stand.xjustizVersion ?? entry.xjustizVersion);
    if (!this.state.idx()?.el[stand.msgName])
      throw new Error('Nachricht nicht im geladenen Schema gefunden: ' + stand.msgName);
    this.state.loadProfile(stand.profil); // leert Sessions, readOnly aus, Vorgabe raus
    this.nav.loadMessage(stand.msgName, true);
    if (vorgabe) this.state.setVorgabe(vorgabe);
    this.state.messageCreate.set({
      msgName: stand.msgName,
      xjustizVersion: stand.xjustizVersion ?? entry.xjustizVersion,
      entryId: entry.id,
      name: entry.name || null,
      profilId: entry.profilId,
      profilName: entry.profilName,
      fassung: entry.fassung,
    });
    this.state.guided.set(true);
    this.state.view.set('editor');
    this.codelistenBereitstellen();
    this.guided.gotoNextOpen();
    // Der Durchlauf beginnt mit dem, was ohnehin im Speicher steht bzw. noch
    // nichts enthaelt — der Autosave wird erst mit der ersten Aenderung faellig.
    this.autosave.sitzungBeginnt();
    if (vorgabe) this.meldeWidersprueche(vorgabe);
  }

  /**
   * "Weitere Testnachricht zu diesem Profil" (US "Testnachricht aus einer
   * Profilierung"): neue Sitzung mit **derselben Bindung** — die eingefrorene
   * Kopie wird nicht neu geladen, sondern weitergereicht; eine inzwischen
   * weiterentwickelte Profilfassung wirkt also nicht in die Serie hinein.
   * `alsKopie` uebernimmt Werte und Entscheidungsstand der eben gespeicherten
   * Nachricht ("dieselbe Nachricht, ein Feld anders"), sonst beginnt der
   * Durchlauf leer. Wirft Error mit Nutzertext.
   */
  async weitereTestnachricht(alsKopie: boolean): Promise<void> {
    // Die Sitzung wird gleich auf einen neuen Eintrag umgehaengt — was noch
    // aussteht, gehoert in den alten (#105).
    await this.autosave.flush();
    const session = this.state.messageCreate();
    if (!session?.profilId)
      throw new Error('Die laufende Sitzung ist an keine Profilierung gebunden.');
    if (!session.entryId)
      throw new Error('Zuerst die aktuelle Testnachricht speichern, dann die nächste beginnen.');
    const vorgabe = this.state.vorgabe();
    if (!vorgabe) throw new Error('Die gebundene Fassung ist nicht mehr geladen.');
    // Vor dem Zuruecksetzen sichern: der Entscheidungsstand der Vorlage. Kopiert,
    // damit die neue Sitzung keine Struktur mit der gespeicherten Nachricht teilt.
    const stand = alsKopie ? structuredClone(this.state.profileDoc()) : null;

    this.report.schliesse(); // der Bericht gehoert zur eben gespeicherten Nachricht
    if (stand) {
      this.state.loadProfile(stand); // leert Sessions und Vorgabe, Werte bleiben
      this.nav.loadMessage(session.msgName, true);
    } else {
      this.nav.loadMessage(session.msgName); // leerer Entscheidungsstand, Vorgabe raus
    }
    this.state.setVorgabe(vorgabe);
    // Die Kopie bringt die Vorkommen der Vorlage mit; leer entstehen sie neu.
    if (!stand) this.legeMindestVorkommenAn(this.state.root()!);
    // entryId zurueck auf null: das erste Speichern fragt einen Namen ab und
    // legt einen eigenen Eintrag an — der Ausgangseintrag bleibt unberuehrt.
    this.state.messageCreate.set({ ...session, entryId: null, name: null });
    this.state.guided.set(true);
    this.state.view.set('editor');
    this.guided.loeseEindeutigeVerweise();
    this.guided.gotoNextOpen();
    // Der Durchlauf beginnt mit dem, was ohnehin im Speicher steht bzw. noch
    // nichts enthaelt — der Autosave wird erst mit der ersten Aenderung faellig.
    this.autosave.sitzungBeginnt();
  }

  /**
   * Stand speichern: erstes Mal anlegen (Namensabfrage), danach denselben
   * Eintrag aktualisieren. Offene Pflicht-Punkte machen den Eintrag zum
   * gekennzeichneten Entwurf. Gibt true zurueck, wenn gespeichert wurde.
   */
  async speichern(): Promise<boolean> {
    const session = this.state.messageCreate();
    if (!session) return false;

    // Gezaehlt werden nur die geschuldeten Angaben (ADR 0016) — Optionales, das
    // der Durchlauf uebergangen hat, ist keine offene Entscheidung und loest
    // darum auch keine Rueckfrage mehr aus.
    const { x, y } = this.guided.fortschritt();
    const kritisch = this.guided.offenePflicht();

    const res = this.exporter.buildBeispielXmlMitPfaden({ instanz: true });
    if (res == null) throw new Error('Nachricht konnte nicht erzeugt werden.');
    const xml = res.xml;
    const meta = parseTestmessage(xml);
    if (!meta) throw new Error('Erzeugte Nachricht ist keine XJustiz-Nachricht.');

    // Befunde erheben — die Erhebung ist Sache dieses Wegs (die XSD-Pruefung
    // entfaellt, wenn der Entwurf schon feststeht; Fehler, die nur auf bekannte
    // Schema-Erweiterungen zurueckgehen, sind eine bewusste XSD-Abweichung und
    // kein Entwurf). Das **Urteil** darueber faellt einmal, im Speicher-Urteil.
    let fehlerEintraege: ReportEintrag[] | null = null;
    let nurErweiterungen = false;

    // Profilkonformitaet wird geprueft, nicht behauptet (#31): der Abgleich
    // laeuft **neben** der Schemavalidierung und aus demselben Grund — eine
    // Nachricht kann spaeter bearbeitet oder gegen eine geaenderte Fassung
    // fortgesetzt werden, das Erzwingen im Durchlauf traegt dann nicht mehr.
    const verstoesse = this.abgleich.pruefe();

    if (!verstoesse.length && kritisch === 0) {
      const pruefung = await this.validator.validiere(xml);
      if (pruefung.status !== 'valide') {
        const eintraege = this.marker.markiere(pruefung.fehlerDetails, res.zeilenPfade);
        if (pruefung.status === 'invalide' && this.marker.nurErweiterungsFehler(eintraege)) {
          nurErweiterungen = true;
        } else {
          fehlerEintraege = eintraege;
        }
      } else {
        this.marker.loesche();
      }
    }

    const urteil = speicherUrteil({
      verstoesse,
      schemaEintraege: fehlerEintraege,
      kritischOffen: kritisch,
    });
    const entwurf = urteil.entwurf;
    const entscheidungen: GuidedMessageState = {
      msgName: session.msgName,
      xjustizVersion: session.xjustizVersion,
      profil: this.state.profileDoc(),
    };
    // Zusaetzlich zum Entscheidungsstand: der gefuehrte Durchlauf ist nicht der
    // einzige Weg zurueck in diese Nachricht — wird sie spaeter *bearbeitet*,
    // entsteht das Modell aus dem XML, und nur diese Ablage kennt die Namen.
    const bezeichnungen = bezeichnungenAus(this.state.alleAuspListen());

    // Die Namensabfrage haengt am **Namen**, nicht am Eintrag: seit #105 kann
    // der Autosave den Eintrag still angelegt haben (generischer Vorschlag,
    // `session.name` bleibt dabei null). Das erste bewusste Speichern fragt den
    // Namen dann nach und benennt um.
    let name = session.name;
    if (name == null) {
      name = frageTestnachrichtName(`${session.msgName} — Testnachricht.xml`);
      if (name == null) return false; // abgebrochen
    }

    if (session.entryId) {
      await this.store.updateMeta(session.entryId, {
        ...(session.name == null ? { name } : {}),
        xml,
        entwurf,
        fortschritt: { x, y },
        entscheidungen,
        bezeichnungen,
      });
      if (session.name == null) this.state.messageCreate.set({ ...session, name });
    } else {
      const id = await this.store.create({
        ...testmessageInput(name, xml, meta),
        // Session-Version gewinnt: sie traegt die tatsaechlich gewaehlte
        // Schemaversion, auch wenn die Instanz (noch) kein Attribut traegt.
        xjustizVersion: session.xjustizVersion,
        entwurf,
        fortschritt: { x, y },
        entscheidungen,
        bezeichnungen,
        // Profil-Bindung: Herkunft und die eingefrorene Kopie der gebundenen
        // Fassung — nur beim Anlegen, danach unveraenderlich.
        profilId: session.profilId,
        profilName: session.profilName,
        fassung: session.fassung,
        vorgabe: this.state.vorgabe() ?? undefined,
      });
      this.state.messageCreate.set({ ...session, entryId: id, name });
    }
    this.autosave.explizitGespeichert();
    const marker = this.markerHinweis();
    const m = urteil.meldung;
    if (m) {
      // Prioritaet und Wortlaut kommen aus dem Speicher-Urteil — dieselben wie
      // beim Zurueckschreiben aus der Bearbeitung.
      this.toast.show(m.toast + marker);
      this.report.zeigeMitPfaden(
        m.titel,
        m.eintraege,
        m.art === 'verstoesse' ? m.untertitel : undefined,
      );
    } else {
      this.toast.show(
        (entwurf
          ? `Als Entwurf gespeichert — noch ${kritisch} Pflichtpunkt${kritisch === 1 ? '' : 'e'} offen.`
          : nurErweiterungen
            ? 'Testnachricht gespeichert — enthält Schema-Erweiterungen (bewusste XSD-Abweichung).'
            : 'Testnachricht gespeichert.') + marker,
      );
    }
    return true;
  }

  /**
   * Sammelmeldung des gebundenen Durchlaufs: wie viele beruehrte Elemente die
   * Profilierung offen laesst ("zu klaeren") und zu wie vielen sie gar nichts
   * sagt ("nicht profiliert"). Beides ist kein Fehler, sondern eine Aussage
   * darueber, wie belastbar die Testnachricht ist und wo die Profilierung noch
   * eine Festlegung braucht. Leer ohne Bindung und ohne markierte Elemente.
   */
  private markerHinweis(): string {
    const { ungeklaert, nichtProfiliert } = this.guided.markerZaehlung();
    if (!ungeklaert && !nichtProfiliert) return '';
    return ` Berührte Elemente: ${ungeklaert} ungeklärt, ${nichtProfiliert} nicht profiliert.`;
  }

  /**
   * Mindest-Vorkommen (Mindestanzahl >= 2) entlang des Pflicht-Rueckgrats als
   * Auspraegungen anlegen — Teil der "Pflicht wird erzwungen"-Regel. Massgeblich
   * ist die **effektive** Kardinalitaet: was die gebundene Profilfassung
   * eingrenzt, wird hart durchgesetzt und beim Start materialisiert; ohne
   * Eingrenzung gilt unveraendert die des Schemas (Spec "Testnachricht aus einer
   * Profilierung"). Was die Profilfassung ausschliesst, bleibt aussen vor (der
   * Ausschluss gewinnt gegen die Mindestanzahl — der Widerspruch wird beim Start
   * gemeldet, siehe meldeWidersprueche).
   */
  private legeMindestVorkommenAn(root: TreeNode): void {
    // Der Abstieg selbst — Vorkommen-Ersetzung, Rekursion, Tiefe — gehoert dem
    // TreeService (`walkProfil`): genau der Nachbau dieser Regel ging hier
    // einmal schief und materialisierte am generischen Pfad vorbei am
    // gerenderten Baum (Issue #28 Teil 1). Ein per `addAusp` frisch
    // materialisiertes Element wird anschliessend als Vorkommen abgestiegen,
    // weil walkProfil die Abstiegsziele erst nach dem Besuch bestimmt.
    this.tree.walkProfil(root, ({ node: c, ausp }) => {
      if (ausp) return true; // Vorkommen-Kontext: Kinder dort weiter
      if (c.erweiterung) return false; // wie bisher: nur Schema-Kinder
      if (this.state.vorgabeSchliesstAus(c.path)) return false;
      if (c.synthetic) {
        // choice bricht das Rueckgrat, optionale Gruppen ebenso.
        return !(c.model === 'choice' || c.min === '0');
      }
      if (c.inChoice) return false;
      const min = parseInt(this.state.effKard(c).min, 10) || 0;
      // Das Rueckgrat traegt, was die Kardinalitaet verlangt oder die
      // gebundene Fassung zwingend setzt.
      if (min === 0 && this.state.profilWirkung(c.path) !== 'pflicht') return false;
      if (min >= 2 && this.tree.isRepeatable(c) && !this.state.auspsOf(c.path)?.length) {
        for (let i = 1; i <= min; i++) this.state.addAusp(c.path, 'Vorkommen ' + i);
      }
      return true;
    });
  }
}
