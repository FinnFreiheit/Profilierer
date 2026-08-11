import { Injectable, inject } from '@angular/core';
import { TreeNode } from '../../models/node.model';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { NavService } from './nav.service';
import { ToastService } from './toast.service';
import { CodelistService } from './codelist.service';
import { XmlValidationService } from './xml-validation.service';
import { ValidationReportService } from './validation-report.service';
import { byName, leafValue } from '../util/xml.util';
import { REF_TARGETS, SGO_KENNUNG, refKindEff, refKindOf, refTraeger } from '../refs';

/** Elementarten, die Verweisziel sein koennen — die Werte aus `REF_TARGETS`. */
const ZIEL_NAMEN = new Set(Object.values(REF_TARGETS).flat());
const [SGO_ELTERN, SGO_BLATT] = SGO_KENNUNG.split('/') as [string, string];

/**
 * Importiert eine bestehende XJustiz-Nachricht (XML-Instanz) und bildet sie
 * gegen das geladene Schema zurück ins Profil-Modell ab — die Umkehrung von
 * `ExportService.genBeispielXml`. Ergebnis: der Baum sieht aus wie eine von
 * Hand gebaute Testnachricht (Blatt-Testwerte, Codelisten-Werte, Ausprägungen
 * für mehrfach vorkommende Elemente).
 *
 * Regeln (mit dem Nutzer abgestimmt):
 * - Das passende XSD muss geladen sein (Root-Element bestimmt die `nachricht.*`).
 * - Genau 1 Vorkommen eines wiederholbaren Elements → Werte direkt gefüllt.
 * - Ab 2 Vorkommen → je eine Auspraegung „Vorkommen N".
 * - Kein Status wird gesetzt; nur Testwerte und Ausprägungen.
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

  /**
   * Waehrend eines Imports gefuellte Zuordnung Modell-Pfad -> Quell-Element.
   * Transient (importXml laeuft synchron); wird am Ende in die Bearbeitungs-
   * Session uebergeben und dort fuer den treuen Re-Export gehalten.
   */
  private quelle: Map<string, Element> | null = null;

  /**
   * Waehrend eines Imports gefuellte Zuordnung Auspraegungs-Pfad -> Index des
   * Quell-Vorkommens. Transient wie `quelle`; wandert in die Bearbeitungs-Session
   * und haelt dort die Vorkommen stabil, auch wenn welche geloescht werden.
   */
  private vorkommen: Map<string, number> | null = null;

  /**
   * Waehrend eines Imports gesammelte Verweise: der Traeger und der Wert, der
   * am `ref.*`-Blatt darunter steht. Erst nach dem vollstaendigen Durchlauf
   * aufloesbar — das Ziel kann in der Nachricht hinter dem Verweis stehen und
   * seine Vorkommen entstehen dann erst spaeter.
   */
  private verweise: { traeger: TreeNode; wert: string }[] | null = null;

  /** Werte der `ref.*`-Blaetter der laufenden Quelle (siehe `verwieseneWerte`). */
  private refWerte = new Set<string>();

  /** Prüft, ob ein XML-Text eine XJustiz-Nachricht (kein Genericode o. ä.) ist. */
  static rootMessageName(xmlText: string): string | null {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return null;
    const name = doc.documentElement?.localName ?? '';
    return /^nachricht\./.test(name) ? name : null;
  }

  /**
   * Importiert die XML-Instanz und lädt sie als aktuelles Profil. `quellName`
   * (Dateiname/Testnachrichten-Name) fliesst in die Bearbeitungs-Session als
   * Vorschlag fuer das spaetere „als neue Nachricht speichern".
   */
  importXml(xmlText: string, quellName?: string): void {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length)
      throw new Error('XML nicht lesbar (Parserfehler).');
    const rootEl = doc.documentElement;
    if (!rootEl) throw new Error('Leeres XML.');
    const msgName = rootEl.localName;
    const idx = this.state.idx();
    if (!idx) throw new Error('Bitte zuerst den passenden XSD-Ordner laden.');
    if (!idx.el[msgName]) throw new Error(`Kein passendes Schema für <${msgName}> geladen.`);

    this.nav.loadMessage(msgName); // setzt Profil zurück (readOnly/onlyValues aus, messageEdit null), baut den Baum
    // Kein Bibliothekseintrag: die Bearbeitung einer Nachricht darf nicht per
    // Autosave in ein (evtl. offenes) Profil geschrieben werden.
    this.state.activeProfileId.set(null);
    const root = this.state.root()!;
    const opened = new Set<string>([root.path]);
    this.quelle = new Map<string, Element>();
    this.vorkommen = new Map<string, number>();
    this.verweise = [];
    this.refWerte = this.verwieseneWerte(rootEl);
    this.bindChildren(root, rootEl, opened, 0);
    this.verweiseAufloesen();
    this.verweise = null;
    this.refWerte = new Set();
    this.state.open.set(opened);
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
      quelle: this.quelle,
      vorkommenIndex: this.vorkommen,
    });
    this.quelle = null;
    this.vorkommen = null;
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

  /** Bindet die Schema-Kinder von `node` an die XML-Kinder von `xmlEl`. */
  private bindChildren(node: TreeNode, xmlEl: Element, opened: Set<string>, depth: number): void {
    if (depth > 40) return;
    this.tree.expandNode(node);
    const done = new Set<string>();
    for (const child of node.children ?? []) {
      if (child.synthetic) {
        // choice/sequence-Gruppe: ihre Element-Kinder liegen direkt unter xmlEl
        opened.add(child.path);
        this.bindChildren(child, xmlEl, opened, depth + 1);
        continue;
      }
      if (done.has(child.name)) continue; // gleicher Basisname nur einmal
      done.add(child.name);
      const matches = byName(xmlEl, child.name);
      if (!matches.length) continue;
      this.bindElement(child, matches, opened, depth);
    }
  }

  private bindElement(
    child: TreeNode,
    matches: Element[],
    opened: Set<string>,
    depth: number,
  ): void {
    // Ein einzelnes Vorkommen bleibt in der Regel ohne Auspraegung — es sei
    // denn, ein Verweis der Nachricht zeigt darauf: ein Verweisziel *ist* ein
    // Vorkommen, ohne Auspraegung gaebe es nichts, worauf `refZiel` zeigen
    // koennte, und die Zielangabe ginge beim Oeffnen verloren.
    if (
      this.tree.isRepeatable(child) &&
      (matches.length >= 2 || this.istVerwiesen(child.name, matches[0]!))
    ) {
      opened.add(child.path);
      matches.forEach((m, i) => {
        const auspId = this.state.addAusp(child.path, 'Vorkommen ' + (i + 1));
        const cn = this.tree.ctxNode(child, auspId);
        this.vorkommen?.set(cn.path, i);
        opened.add(cn.path);
        this.bindNode(cn, m, opened, depth + 1);
      });
    } else {
      // genau 1 Vorkommen (oder ungültig mehrfach bei nicht-wiederholbar → erstes)
      this.bindNode(child, matches[0]!, opened, depth);
    }
  }

  private bindNode(node: TreeNode, xmlEl: Element, opened: Set<string>, depth: number): void {
    if (node.recursive) return;
    // Quell-Element fuer den treuen Re-Export merken (auch Container, damit
    // unveraenderte Teilbaeume 1:1 uebernommen werden koennen).
    this.quelle?.set(node.path, xmlEl);
    if (this.tree.isLeaf(node)) {
      const val = leafValue(xmlEl, !!node.codelist);
      if (val) {
        this.state.setElementProfile(node.path, { beispiel: val });
        // Der Verweis haengt am Traeger, nicht am Nummern-Blatt darunter —
        // dieselbe Ableitung wie im Detailbereich (#30). Ohne Traeger (Typ per
        // xs:extension) traegt das Blatt die Zielangabe selbst.
        const traeger = refTraeger(node) ?? (refKindOf(node) ? node : null);
        if (traeger) this.verweise?.push({ traeger, wert: val });
      }
      return;
    }
    opened.add(node.path);
    this.bindChildren(node, xmlEl, opened, depth + 1);
  }

  /**
   * Alle Werte, auf die in der Quelle verwiesen wird — der Inhalt jedes
   * `ref.*`-Blatts. Einmal vorab erhoben, weil beim Binden eines moeglichen
   * Ziels feststehen muss, ob es ein Vorkommen braucht; der zugehoerige Verweis
   * kann in der Nachricht weit dahinter stehen.
   */
  private verwieseneWerte(rootEl: Element): Set<string> {
    const out = new Set<string>();
    for (const el of Array.from(rootEl.getElementsByTagName('*'))) {
      if (!/^ref\./.test(el.localName)) continue;
      const t = el.textContent?.trim();
      if (t) out.add(t);
    }
    return out;
  }

  /**
   * Zeigt ein Verweis der Nachricht auf dieses Vorkommen? Gefragt wird nur bei
   * Elementarten, die ueberhaupt Verweisziel sein koennen (`REF_TARGETS`), und
   * beantwortet ueber die Kennung darunter: die laufende Nummer oder die
   * Identifikation eines Schriftgutobjekts. Traegt sie einen Wert, auf den
   * verwiesen wird, ist dieses Vorkommen gemeint.
   */
  private istVerwiesen(elName: string, xmlEl: Element): boolean {
    if (!ZIEL_NAMEN.has(elName) || !this.refWerte.size) return false;
    for (const k of Array.from(xmlEl.getElementsByTagName('*'))) {
      const t = k.textContent?.trim();
      if (!t || !this.refWerte.has(t)) continue;
      if (k.localName === 'rollennummer' || k.localName === 'beteiligtennummer') return true;
      if (k.localName === SGO_BLATT && k.parentElement?.localName === SGO_ELTERN) return true;
    }
    return false;
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
  private verweiseAufloesen(): void {
    for (const { traeger, wert } of this.verweise ?? []) {
      const kind = refKindEff(traeger);
      if (!kind) continue;
      const ziel = this.state.zielMitKennung(kind, wert);
      if (ziel) this.state.setElementProfile(traeger.path, { refZiel: ziel });
    }
  }
}
