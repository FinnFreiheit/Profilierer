import { EnvironmentInjector, Injectable, inject } from '@angular/core';
import { XsdIndex } from '../../models/xsd-index.model';
import { StateService } from './state.service';
import { TreeService, baumOhneProfil } from './tree.service';
import { NavService } from './nav.service';
import { ToastService } from './toast.service';
import { CodelistService } from './codelist.service';
import { XmlValidationService } from './xml-validation.service';
import { ValidationReportService } from './validation-report.service';
import { RohVerweis, extrahiereInstanz } from '../instanz-extrakt';
import { InstanzModell } from '../vorgabe-sicht';
import { refKindEff } from '../refs';

/**
 * Importiert eine bestehende XJustiz-Nachricht (XML-Instanz) und bildet sie
 * gegen das geladene Schema zurück ins Profil-Modell ab — die Umkehrung von
 * `ExportService.genBeispielXml`. Ergebnis: der Baum sieht aus wie eine von
 * Hand gebaute Testnachricht (Blatt-Testwerte, Codelisten-Werte, Ausprägungen
 * für mehrfach vorkommende Elemente).
 *
 * Der **Walk** selbst liegt zustandslos in `core/instanz-extrakt.ts`; dieser
 * Dienst ist der Teil, der dabei Zustand anfasst: er baut den Baum, überträgt
 * das Ergebnis in den Store, öffnet die Nachricht im Editor und löst die
 * Verweise auf. `modellAus` geht denselben Weg **ohne** Store — für
 * Auswertungen, die den geöffneten Editor nicht anfassen dürfen.
 *
 * Regeln (mit dem Nutzer abgestimmt) stehen beim Walk.
 */
@Injectable({ providedIn: 'root' })
export class InstanceImportService {
  private readonly state = inject(StateService);
  private readonly tree = inject(TreeService);
  private readonly nav = inject(NavService);
  private readonly toast = inject(ToastService);
  private readonly codelists = inject(CodelistService);
  private readonly validator = inject(XmlValidationService);
  private readonly report = inject(ValidationReportService);
  private readonly injector = inject(EnvironmentInjector);

  /** Prüft, ob ein XML-Text eine XJustiz-Nachricht (kein Genericode o. ä.) ist. */
  static rootMessageName(xmlText: string): string | null {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return null;
    const name = doc.documentElement?.localName ?? '';
    return /^nachricht\./.test(name) ? name : null;
  }

  /**
   * Das Instanz-Modell einer Nachricht gegen einen Schema-Index — **ohne**
   * Store, ohne Baumwechsel im Editor, ohne Sitzung. Der Weg für Auswertungen
   * (Konformitäts-Abgleich einer hochgeladenen Nachricht): sie laufen über
   * einen eigenen Baum (`baumOhneProfil`), weil `buildRoot` Index und Caches
   * seiner Instanz austauscht.
   *
   * Wirft, wenn das XML nicht lesbar ist oder der Index die Nachricht nicht
   * kennt — dieselben Vorbedingungen wie `importXml`, nur ohne Nebenwirkung.
   */
  modellAus(xmlText: string, idx: XsdIndex): { msgName: string; modell: InstanzModell } {
    const rootEl = this.wurzel(xmlText);
    const msgName = rootEl.localName;
    if (!idx.el[msgName]) throw new Error(`Kein passendes Schema für <${msgName}>.`);
    const baum = baumOhneProfil(this.injector);
    const extrakt = extrahiereInstanz(baum, baum.buildRoot(msgName, idx), rootEl);
    return { msgName, modell: extrakt.modell };
  }

  /** Wurzelelement einer XJustiz-Instanz; wirft mit sprechendem Grund. */
  private wurzel(xmlText: string): Element {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length)
      throw new Error('XML nicht lesbar (Parserfehler).');
    const rootEl = doc.documentElement;
    if (!rootEl) throw new Error('Leeres XML.');
    return rootEl;
  }

  /**
   * Importiert die XML-Instanz und lädt sie als aktuelles Profil. `quellName`
   * (Dateiname/Testnachrichten-Name) fliesst in die Bearbeitungs-Session als
   * Vorschlag fuer das spaetere „als neue Nachricht speichern".
   */
  importXml(xmlText: string, quellName?: string): void {
    const rootEl = this.wurzel(xmlText);
    const doc = rootEl.ownerDocument;
    const msgName = rootEl.localName;
    const idx = this.state.idx();
    if (!idx) throw new Error('Bitte zuerst den passenden XSD-Ordner laden.');
    if (!idx.el[msgName]) throw new Error(`Kein passendes Schema für <${msgName}> geladen.`);

    this.nav.loadMessage(msgName); // setzt Profil zurück (readOnly/onlyValues aus, messageEdit null), baut den Baum
    // Kein Bibliothekseintrag: die Bearbeitung einer Nachricht darf nicht per
    // Autosave in ein (evtl. offenes) Profil geschrieben werden.
    this.state.activeProfileId.set(null);
    const root = this.state.root()!;
    // Derselbe Walk wie im zustandslosen Weg — aber über den Baum **des
    // Editors**, damit die gesammelten Verweis-Träger dieselben Knoten sind,
    // gegen die `zielMitKennung` gleich auflöst.
    const extrakt = extrahiereInstanz(this.tree, root, rootEl);
    // Die Maps am Stück setzen: der Walk führt die Ausprägungs-ids selbst, und
    // `addAusp` vergäbe eigene. Neue Referenzen — Vertrag des Stores.
    this.state.elemente.set(extrakt.modell.elemente);
    this.state.auspraegungen.set(extrakt.modell.auspraegungen);
    this.verweiseAufloesen(extrakt.verweise);
    this.state.open.set(extrakt.offen);
    this.state.selItem.set({ kind: 'el', node: root });
    // Bearbeitungs-Session merken: Quell-DOM + Pfad-Zuordnung fuer den treuen
    // Re-Export. Nach loadMessage setzen (das leert messageEdit).
    this.state.messageEdit.set({
      msgName,
      quellName: quellName || msgName,
      xjustizVersion: this.leseVersion(rootEl) || this.state.version() || undefined,
      // Der Importer bedient auch Datei-Upload und Drop und kennt den
      // Testspeicher nicht — die id setzt der TestmessageEditService nach.
      entryId: null,
      sourceDoc: doc,
      quelle: extrakt.quelle,
      vorkommenIndex: extrakt.vorkommenIndex,
    });
    // Nachricht inspizieren: gesperrte Ansicht, die sofort nur den belegten
    // Inhalt zeigt. Nach dem Reset in loadMessage setzen, damit die Flags stehen.
    this.state.readOnly.set(true);
    this.state.onlyValues.set(true);
    this.state.guided.set(false); // Nachrichten-Modus: keine gefuehrte Profilierung
    this.toast.show(`Nachricht ${msgName} geladen.`);
    // Codelisten im Hintergrund nachladen, damit belegte Codes zu Klartext
    // aufgelöst werden (Story 4). Best-effort, blockiert das Betrachten nicht.
    void this.codelists.ensureUsedCodelists();
    // Schemavalidierung im Hintergrund: invalide Nachrichten duerfen betrachtet
    // und repariert werden (Speichern/Export sind hart gesperrt), aber der
    // Befund wird sofort gemeldet.
    void this.validator.validiere(xmlText).then((p) => {
      if (p.status === 'invalide')
        this.report.zeige(`Hinweis: „${quellName || msgName}" ist nicht schema-valide`, p.fehler);
    });
  }

  /** XJustiz-Version aus dem `xjustizVersion`-Attribut (Wurzel oder Nachrichtenkopf). */
  private leseVersion(rootEl: Element): string | null {
    const vom = (el: Element | null | undefined): string | null =>
      el?.getAttribute('xjustizVersion')?.trim() || null;
    return vom(rootEl) ?? vom(rootEl.getElementsByTagNameNS('*', 'nachrichtenkopf')[0]);
  }

  /**
   * Die Verweise der geladenen Nachricht auf ihre Ziele zurueckfuehren. Im XML
   * steht nur der Wert (Rollennummer, UUID eines Schriftgutobjekts); welches
   * Vorkommen damit gemeint ist, sagt erst der Abgleich mit den Kennungen der
   * moeglichen Ziele (`StateService.zielMitKennung`). Ohne diesen Schritt zeigte
   * die geoeffnete Nachricht "kein Ziel festgelegt", obwohl der Verweis steht —
   * und der Baum zoege keine Verbindungslinie.
   *
   * Kein Ziel gefunden heisst: nur der Wert bleibt (er wird beim Speichern
   * unveraendert zurueckgeschrieben). Das ist der Fall, wenn das Ziel gar nicht
   * in der Nachricht steht — oder wenn es nur einmal vorkommt und darum keine
   * Auspraegung traegt, auf die verwiesen werden koennte.
   */
  private verweiseAufloesen(verweise: RohVerweis[]): void {
    for (const { traeger, wert } of verweise) {
      const kind = refKindEff(traeger);
      if (!kind) continue;
      const ziel = this.state.zielMitKennung(kind, wert);
      if (ziel) this.state.setElementProfile(traeger.path, { refZiel: ziel });
    }
  }
}
