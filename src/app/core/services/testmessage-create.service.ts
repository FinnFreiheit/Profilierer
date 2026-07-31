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
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { NavService } from './nav.service';
import { GuidedService } from './guided.service';
import { ExportService } from './export.service';
import { TestmessageStoreService } from './testmessage-store.service';
import { TestmessageGenerationService } from './testmessage-generation.service';
import { ProfileStoreService } from './profile-store.service';
import { PersistenceService } from './persistence.service';
import { ToastService } from './toast.service';
import { XmlValidationService } from './xml-validation.service';
import { ValidationReportService } from './validation-report.service';
import { ValidationMarkerService } from './validation-marker.service';
import { ValueService } from './value.service';
import { ReportEintrag } from '../../models/validation.model';

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
  private readonly profiles = inject(ProfileStoreService);
  private readonly generator = inject(TestmessageGenerationService);
  private readonly persistence = inject(PersistenceService);
  private readonly toast = inject(ToastService);
  private readonly validator = inject(XmlValidationService);
  private readonly report = inject(ValidationReportService);
  private readonly marker = inject(ValidationMarkerService);
  /** Nur fuer die Codelisten-Deckung in `meldeWidersprueche`. */
  private readonly values = inject(ValueService);

  /**
   * Neue Sitzung: Schema der Version sicherstellen, Nachricht laden (leerer
   * Baum, keine Vorbelegung von Werten), Mindest-Vorkommen anlegen und die
   * Fuehrung starten. Wirft Error mit Nutzertext.
   */
  async neuErstellen(version: string | undefined, msgName: string): Promise<void> {
    await this.persistence.flushAutosave();
    this.state.activeProfileId.set(null);
    // Schutz einer zuvor geoeffneten abgenommenen Nachricht loesen: er haengt
    // nicht am Profil (activeProfileId ist hier null) und bliebe sonst stehen.
    this.state.abnahmeSchreibschutz.set(false);
    await this.generator.ensureSchema(version);
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
    this.guided.gotoNextOpen();
  }

  /**
   * Neue Sitzung mit **Profil-Bindung** (US "Testnachricht aus einer
   * Profilierung"): die gewaehlte Fassung — Arbeitsstand oder eine nummerierte
   * Version — wird geladen und als eingefrorene Vorgabe in den Durchlauf
   * gelegt. Version und Nachrichtentyp werden nicht abgefragt; sie stammen aus
   * der Profilierung. Wirft Error mit Nutzertext.
   */
  async neuAusProfil(profil: LibraryEntry, versionId: string | null): Promise<void> {
    const { doc, fassung } = await this.ladeFassung(profil, versionId);
    const msgName = doc.meta?.nachricht || profil.nachricht;
    if (!msgName)
      throw new Error('Die Profilierung nennt keinen Nachrichtentyp — zuerst dort festlegen.');

    await this.persistence.flushAutosave();
    this.state.activeProfileId.set(null);
    this.state.abnahmeSchreibschutz.set(false); // siehe neuErstellen
    await this.generator.ensureSchema(doc.meta?.xjustizVersion ?? profil.xjustizVersion);
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
    this.guided.gotoNextOpen();
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
    /** Praefixe an '/' UND '@' — wie StateService.vorfahrenPfade. */
    const vorfahren = (pfad: string): string[] => {
      const r: string[] = [];
      for (let i = 0; i < pfad.length; i++)
        if (pfad[i] === '/' || pfad[i] === '@') r.push(pfad.slice(0, i));
      return r;
    };
    /** Die ausschliessende Stufe an diesem Pfad — null, wenn er nichts ausschliesst. */
    const schliesstAus = (pfad: string): Status | null => {
      const id = doc.elemente[pfad]?.status;
      if (!id) return null;
      const stufe = doc.statuses.find((s) => s.id === id);
      return stufe?.wirkung === 'ausgeschlossen' ? stufe : null;
    };
    const kurz = (pfad: string): string => pretty(pfad.split('/').at(-1)!.split('@')[0]!);

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

    if (!eintraege.length) return;
    this.report.zeigeMitPfaden(
      'Widersprüche in der Profilierung',
      eintraege,
      'Die gebundene Fassung schließt Elemente aus, die sie zugleich verlangt. Der Ausschluss gilt; ein Klick springt zum betroffenen Element.',
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
    await this.persistence.flushAutosave();
    this.state.activeProfileId.set(null);
    this.state.abnahmeSchreibschutz.set(false); // siehe neuErstellen
    await this.generator.ensureSchema(stand.xjustizVersion ?? entry.xjustizVersion);
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
    this.guided.gotoNextOpen();
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
    this.guided.gotoNextOpen();
  }

  /**
   * Stand speichern: erstes Mal anlegen (Namensabfrage), danach denselben
   * Eintrag aktualisieren. Offene *optionale* Entscheidungen warnen nur, wenn
   * die Nachricht ansonsten vollstaendig waere (weiche Fuehrung); offene
   * Pflicht-Punkte machen den Eintrag zum gekennzeichneten Entwurf.
   * Gibt true zurueck, wenn gespeichert wurde.
   */
  async speichern(): Promise<boolean> {
    const session = this.state.messageCreate();
    if (!session) return false;

    const { x, y } = this.guided.fortschritt();
    const kritisch = this.guided.offenePflicht();
    const optionalOffen = y - x - kritisch;
    if (!kritisch && optionalOffen > 0) {
      const w = confirm(
        `Noch ${optionalOffen} offene Entscheidung${optionalOffen === 1 ? '' : 'en'} zu optionalen Elementen — trotzdem speichern?`,
      );
      if (!w) {
        this.guided.gotoNextOpen();
        return false;
      }
    }

    const res = this.exporter.buildBeispielXmlMitPfaden({ instanz: true });
    if (res == null) throw new Error('Nachricht konnte nicht erzeugt werden.');
    const xml = res.xml;
    const meta = parseTestmessage(xml);
    if (!meta) throw new Error('Erzeugte Nachricht ist keine XJustiz-Nachricht.');

    // Anforderung: Testnachrichten muessen schema-valide sein. Eine fertige,
    // aber invalide Nachricht wird als Entwurf gekennzeichnet (Arbeit bleibt
    // erhalten, Download bleibt gesperrt) und der Befund gemeldet.
    // Ausnahme: Fehler nur durch bekannte Schema-Erweiterungen (bewusste
    // XSD-Abweichung) — kein Entwurf, nur Hinweis.
    let entwurf = kritisch > 0;
    let fehlerEintraege: ReportEintrag[] | null = null;
    let nurErweiterungen = false;
    if (!entwurf) {
      const pruefung = await this.validator.validiere(xml);
      if (pruefung.status !== 'valide') {
        const eintraege = this.marker.markiere(pruefung.fehlerDetails, res.zeilenPfade);
        if (pruefung.status === 'invalide' && this.marker.nurErweiterungsFehler(eintraege)) {
          nurErweiterungen = true;
        } else {
          entwurf = true;
          fehlerEintraege = eintraege;
        }
      } else {
        this.marker.loesche();
      }
    }
    const entscheidungen: GuidedMessageState = {
      msgName: session.msgName,
      xjustizVersion: session.xjustizVersion,
      profil: this.state.profileDoc(),
    };

    if (session.entryId) {
      await this.store.updateMeta(session.entryId, {
        xml,
        entwurf,
        fortschritt: { x, y },
        entscheidungen,
      });
    } else {
      const name = frageTestnachrichtName(`${session.msgName} — Testnachricht.xml`);
      if (name == null) return false; // abgebrochen
      const id = await this.store.create({
        ...testmessageInput(name, xml, meta),
        // Session-Version gewinnt: sie traegt die tatsaechlich gewaehlte
        // Schemaversion, auch wenn die Instanz (noch) kein Attribut traegt.
        xjustizVersion: session.xjustizVersion,
        entwurf,
        fortschritt: { x, y },
        entscheidungen,
        // Profil-Bindung: Herkunft und die eingefrorene Kopie der gebundenen
        // Fassung — nur beim Anlegen, danach unveraenderlich.
        profilId: session.profilId,
        profilName: session.profilName,
        fassung: session.fassung,
        vorgabe: this.state.vorgabe() ?? undefined,
      });
      this.state.messageCreate.set({ ...session, entryId: id, name });
    }
    const marker = this.markerHinweis();
    if (fehlerEintraege) {
      this.toast.show('Als Entwurf gespeichert — die Nachricht ist nicht schema-valide.' + marker);
      this.report.zeigeMitPfaden(
        'Als Entwurf gespeichert — Nachricht nicht schema-valide',
        fehlerEintraege,
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
    const rec = (n: TreeNode, depth: number): void => {
      if (depth > 25) return;
      this.tree.expandNode(n);
      for (const c of n.children ?? []) {
        if (this.state.vorgabeSchliesstAus(c.path)) continue;
        if (c.synthetic) {
          // choice bricht das Rueckgrat, optionale Gruppen ebenso.
          if (c.model === 'choice' || c.min === '0') continue;
          rec(c, depth + 1);
          continue;
        }
        if (c.inChoice) continue;
        const min = parseInt(this.state.effKard(c).min, 10) || 0;
        // Das Rueckgrat traegt, was die Kardinalitaet verlangt oder die
        // gebundene Fassung zwingend setzt.
        if (min === 0 && this.state.profilWirkung(c.path) !== 'pflicht') continue;
        if (min >= 2 && this.tree.isRepeatable(c) && !this.state.auspsOf(c.path)?.length) {
          for (let i = 1; i <= min; i++) this.state.addAusp(c.path, 'Vorkommen ' + i);
        }
        if (c.recursive) continue;
        // Traegt das Element benannte Vorkommen — eigene oder aus der gebundenen
        // Fassung —, dann rendert der Baum dort nicht die generischen Kinder,
        // sondern je Vorkommen einen eigenen Pfadraum (`ctxNode`). Der Abstieg
        // muss diesen Weg nehmen, sonst materialisiert der Walk unter dem
        // generischen Pfad, den niemand rendert: der Durchlauf meldete dann
        // "verlangt mindestens 2 Vorkommen" und zeigte null (Issue #28).
        const vorkommen = this.state.auspsOf(c.path);
        if (vorkommen?.length)
          for (const a of vorkommen) rec(this.tree.ctxNode(c, a.id), depth + 1);
        else rec(c, depth + 1);
      }
    };
    rec(root, 0);
  }
}
