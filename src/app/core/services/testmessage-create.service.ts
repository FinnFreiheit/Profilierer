import { Injectable, inject } from '@angular/core';
import { TreeNode } from '../../models/node.model';
import { LibraryEntry, ProfileDoc } from '../../models/profile.model';
import { GuidedMessageState, TestmessageEntry } from '../../models/testmessage.model';
import {
  frageTestnachrichtName,
  parseTestmessage,
  testmessageInput,
} from '../util/testmessage.util';
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
   * nicht die inzwischen weiterentwickelte Profilfassung.
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
   * Mindest-Vorkommen (minOccurs >= 2) entlang des Pflicht-Rueckgrats als
   * Auspraegungen anlegen — Teil der "Pflicht wird erzwungen"-Regel. Was die
   * gebundene Profilfassung ausschliesst, bleibt aussen vor (der Ausschluss
   * gewinnt gegen die Schema-Mindestanzahl).
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
        if (c.min === '0' || c.inChoice) continue;
        const min = parseInt(c.min, 10);
        if (min >= 2 && this.tree.isRepeatable(c) && !this.state.auspsOf(c.path)?.length) {
          for (let i = 1; i <= min; i++) this.state.addAusp(c.path, 'Vorkommen ' + i);
        }
        if (!c.recursive) rec(c, depth + 1);
      }
    };
    rec(root, 0);
  }
}
