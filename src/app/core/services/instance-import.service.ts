import { EnvironmentInjector, Injectable, inject } from '@angular/core';
import { XsdIndex } from '../../models/xsd-index.model';
import { TreeNode } from '../../models/node.model';
import { StateService } from './state.service';
import { TreeService, eigenerBaum } from './tree.service';
import { NavService } from './nav.service';
import { ToastService } from './toast.service';
import { CodelistService } from './codelist.service';
import { XmlValidationService } from './xml-validation.service';
import { ValidationReportService } from './validation-report.service';
import { ExtraktOptionen, RohVerweis, extrahiereInstanz } from '../instanz-extrakt';
import { InstanzModell } from '../vorgabe-sicht';
import { KonformitaetsUmgebung } from './konformitaet.service';
import { refKindEff } from '../refs';

/**
 * Eine ausgewertete Instanz: das Modell plus die Antworten, die der
 * Konformitäts-Abgleich aus seiner Umgebung braucht. Sie **ist** die
 * `KonformitaetsUmgebung` — Anwesenheit und Blatt-Eigenschaft stehen im
 * Schema, nicht in den beiden Dokumenten.
 */
export interface InstanzAuswertung extends KonformitaetsUmgebung {
  msgName: string;
  modell: InstanzModell;
  istEnthalten: (pfad: string) => boolean | null;
  istBlatt: (pfad: string) => boolean;
}

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
   * Wertet eine Nachricht gegen einen Schema-Index aus — **ohne** Store, ohne
   * Baumwechsel im Editor, ohne Sitzung. Der Weg für den Konformitäts-Abgleich
   * einer hochgeladenen Nachricht: er läuft über einen eigenen Baum
   * (`eigenerBaum`), weil `buildRoot` Index und Caches seiner Instanz
   * austauscht.
   *
   * Zurück kommt nicht nur das Modell, sondern die vollständige
   * **Prüf-Umgebung**: Anwesenheit und Blatt-Eigenschaft sind Fragen ans
   * Schema, und nur hier steht der Baum, der sie beantworten kann.
   *
   * Wirft, wenn das XML nicht lesbar ist oder der Index die Nachricht nicht
   * kennt — dieselben Vorbedingungen wie `importXml`, nur ohne Nebenwirkung.
   */
  auswerten(xmlText: string, idx: XsdIndex, optionen: ExtraktOptionen = {}): InstanzAuswertung {
    const rootEl = this.wurzel(xmlText);
    const msgName = rootEl.localName;
    if (!idx.el[msgName]) throw new Error(`Kein passendes Schema für <${msgName}>.`);

    // Die Überlagerung zeigt auf die Vorkommen, die der Walk gleich anlegt —
    // sie existieren beim Bauen des Baums noch nicht, werden vom Walk selbst
    // aber auch nicht gelesen (er erzeugt seine Kontext-Knoten direkt). Erst
    // die Pfadsuche danach braucht sie, damit `@id`-Pfade auffindbar sind.
    let modell: InstanzModell = { elemente: {}, auspraegungen: {} };
    const baum = eigenerBaum(this.injector, {
      auspsOf: (pfad) => modell.auspraegungen[pfad] ?? null,
      erweiterungenOf: () => null,
      root: () => root,
    });
    const root = baum.buildRoot(msgName, idx);
    const extrakt = extrahiereInstanz(baum, root, rootEl, optionen);
    modell = extrakt.modell;

    const knoten = (pfad: string): TreeNode | null => {
      const it = baum.itemByPath({ kind: 'el', node: root }, pfad);
      if (!it) return null;
      return it.kind === 'el' ? it.node : baum.ctxNode(it.parentNode, it.ausp.id);
    };
    return {
      msgName,
      modell,
      // Additiv: die Nachricht trägt genau, was der Walk gebunden hat. Anders
      // als im geführten Durchlauf gibt es hier nichts zu erschließen — was
      // nicht im XML steht, existiert nicht (ADR 0016/0018).
      //
      // Der **Trägerpfad** benannter Vorkommen muss dabei mitzählen: ab zwei
      // Vorkommen bindet der Walk die Quell-Elemente unter `…@v1`/`…@v2` und
      // legt für den Träger selbst keinen Eintrag in `quelle` an. Allein danach
      // gefragt, galt ein Element mit **zwei** Vorkommen als nicht enthalten —
      // eine Nachricht mit zwei `ersuchenSachentscheidung` bekam „die
      // Profilierung setzt das Element zwingend, die Nachricht enthält es
      // nicht". Bei genau einem Vorkommen fiel es nicht auf, weil dort der
      // generische Pfad gebunden wird.
      istEnthalten: (pfad) => {
        if (extrakt.quelle.has(pfad)) return true;
        if (extrakt.modell.auspraegungen[pfad]?.length) return true;
        // Synthetische Gruppen und Auswahlen sind **keine** Elemente der
        // Nachricht (ihre Kinder liegen direkt unter dem Elternelement) — ueber
        // ihre Anwesenheit gibt es nichts zu sagen. „Nein" waere hier falsch:
        // die Vorfahren-Regel des Abgleichs wuerde damit jeden Befund unter
        // einer Gruppe unterdruecken.
        return knoten(pfad)?.synthetic ? null : false;
      },
      istBlatt: (pfad) => {
        const node = knoten(pfad);
        return node ? baum.isLeaf(node) : false;
      },
    };
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
   *
   * `schemaHinweis` (Standard: an) meldet eine nicht schema-valide Nachricht im
   * Berichts-Dialog. Wer aus einem **anderen** Bericht heraus öffnet, schaltet
   * das ab: der Berichts-Dialog ist ein gemeinsamer Store, die Meldung würde
   * den Bericht nicht überlagern, sondern ersetzen — und ihr Inhalt steht dort
   * ohnehin schon (Kopfzeile und eigener Abschnitt, #107).
   */
  importXml(xmlText: string, quellName?: string, schemaHinweis = true): void {
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
    // Befund wird sofort gemeldet — ausser der Aufrufer bringt seinen eigenen
    // Bericht mit, der ihn schon nennt.
    if (schemaHinweis)
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
