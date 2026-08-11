import { TreeNode } from '../models/node.model';
import { InstanzModell } from './vorgabe-sicht';
import { byName, leafValue } from './util/xml.util';
import { REF_TARGETS, SGO_KENNUNG, refKindOf, refTraeger } from './refs';

/**
 * Der Bind-Walk: eine XJustiz-Instanz gegen einen Schema-Baum auslesen — die
 * Umkehrung von `ExportService.genBeispielXml`.
 *
 * **Zustandslos.** Der Walk schreibt nirgends hin; er bekommt einen Baum und
 * ein Quell-Dokument und gibt zurueck, was er gefunden hat. Der Aufrufer
 * entscheidet, was damit geschieht: `InstanceImportService` uebertraegt das
 * Ergebnis in den Store und oeffnet die Nachricht im Editor, eine Auswertung
 * ohne Sitzung liest nur das Modell.
 *
 * Warum ueberhaupt ein Baum: die Pfad-Sprache der Profilierung ist
 * **schema-abgeleitet** — sie enthaelt synthetische Segmente (`_auswahl`,
 * `_gruppe`) und Disambiguierungen gleichnamiger Geschwister (`#1`). Aus dem
 * XML allein laesst sich kein Modell-Pfad bilden.
 */

/** Elementarten, die Verweisziel sein koennen — die Werte aus `REF_TARGETS`. */
const ZIEL_NAMEN = new Set(Object.values(REF_TARGETS).flat());
const [SGO_ELTERN, SGO_BLATT] = SGO_KENNUNG.split('/') as [string, string];

/**
 * Die Baum-Operationen, die der Walk braucht — der schmale Seam zum
 * `TreeService`. Bewusst als Interface statt als Import des Dienstes: der Walk
 * liegt in `core/` und zeigt nicht auf die Service-Schicht (dieselbe Richtung
 * wie bei `KonformitaetsUmgebung`).
 */
export interface ExtraktBaum {
  expandNode(n: TreeNode): void;
  isLeaf(n: TreeNode): boolean;
  isRepeatable(n: TreeNode): boolean;
  ctxNode(parentNode: TreeNode, auspId: string): TreeNode;
}

/** Ein Verweis der Nachricht: der Traeger und der Wert am `ref.*`-Blatt darunter. */
export interface RohVerweis {
  traeger: TreeNode;
  wert: string;
}

/** Was der Walk aus einer Instanz herausliest. */
export interface InstanzExtrakt {
  /** Blattwerte und benannte Vorkommen — das Modell fuer den Abgleich. */
  modell: InstanzModell;
  /**
   * Modell-Pfad → Quell-Element. Basis des **treuen** Re-Exports: unveraenderte
   * Teile stammen 1:1 aus dem Original (auch Container, damit ganze Teilbaeume
   * uebernommen werden koennen).
   */
  quelle: Map<string, Element>;
  /**
   * Auspraegungs-Pfad (`pfad@auspId`) → Index des Vorkommens im Quell-DOM.
   * Ohne diese Zuordnung waere der Re-Export auf die Position in der
   * Auspraegungsliste angewiesen — nach dem Loeschen eines Vorkommens wuerden
   * die Werte des geloeschten auf das nachrueckende uebertragen.
   */
  vorkommenIndex: Map<string, number>;
  /** Pfade, die offen sein muessen, damit der belegte Inhalt sichtbar ist. */
  offen: Set<string>;
  /**
   * Gesammelte Verweise, **unaufgeloest**: welches Vorkommen ein Wert meint,
   * sagt erst der Abgleich mit den Kennungen der moeglichen Ziele — und der
   * braucht das fertige Modell. Der Aufrufer loest sie auf, wenn er eines hat.
   */
  verweise: RohVerweis[];
}

/**
 * Liest die Instanz aus. `root` muss der Wurzelknoten zur Nachricht sein,
 * `rootEl` das Wurzelelement des Quell-Dokuments.
 *
 * Regeln (mit dem Nutzer abgestimmt, aus `InstanceImportService` uebernommen):
 * - Genau 1 Vorkommen eines wiederholbaren Elements → Werte direkt gefuellt.
 * - Ab 2 Vorkommen → je eine Auspraegung „Vorkommen N".
 * - Kein Status wird gesetzt; nur Testwerte und Auspraegungen.
 *
 * Die Auspraegungs-ids entstehen hier und tragen das Praefix `v`, damit sie
 * nicht mit denen des Stores (`a…`) kollidieren. Sie sind **neu**: welches
 * benannte Vorkommen einer Profilierung gemeint ist, kann eine XML-Instanz
 * nicht sagen (siehe `AuspBezeichnungen` im Testnachrichten-Modell).
 */
export function extrahiereInstanz(
  baum: ExtraktBaum,
  root: TreeNode,
  rootEl: Element,
): InstanzExtrakt {
  const elemente: InstanzModell['elemente'] = {};
  const auspraegungen: InstanzModell['auspraegungen'] = {};
  const quelle = new Map<string, Element>();
  const vorkommenIndex = new Map<string, number>();
  const offen = new Set<string>([root.path]);
  const verweise: RohVerweis[] = [];
  const refWerte = verwieseneWerte(rootEl);
  let auspN = 0;

  /** Bindet die Schema-Kinder von `node` an die XML-Kinder von `xmlEl`. */
  const bindChildren = (node: TreeNode, xmlEl: Element, depth: number): void => {
    if (depth > 40) return;
    baum.expandNode(node);
    const done = new Set<string>();
    for (const child of node.children ?? []) {
      if (child.synthetic) {
        // choice/sequence-Gruppe: ihre Element-Kinder liegen direkt unter xmlEl.
        offen.add(child.path);
        bindChildren(child, xmlEl, depth + 1);
        continue;
      }
      if (done.has(child.name)) continue; // gleicher Basisname nur einmal
      done.add(child.name);
      const matches = byName(xmlEl, child.name);
      if (!matches.length) continue;
      bindElement(child, matches, depth);
    }
  };

  const bindElement = (child: TreeNode, matches: Element[], depth: number): void => {
    // Ein einzelnes Vorkommen bleibt in der Regel ohne Auspraegung — es sei
    // denn, ein Verweis der Nachricht zeigt darauf: ein Verweisziel *ist* ein
    // Vorkommen, ohne Auspraegung gaebe es nichts, worauf `refZiel` zeigen
    // koennte, und die Zielangabe ginge beim Oeffnen verloren.
    if (
      baum.isRepeatable(child) &&
      (matches.length >= 2 || istVerwiesen(refWerte, child.name, matches[0]!))
    ) {
      offen.add(child.path);
      const liste = (auspraegungen[child.path] ??= []);
      matches.forEach((m, i) => {
        const auspId = 'v' + ++auspN;
        liste.push({ id: auspId, name: 'Vorkommen ' + (i + 1) });
        const cn = baum.ctxNode(child, auspId);
        vorkommenIndex.set(cn.path, i);
        offen.add(cn.path);
        bindNode(cn, m, depth + 1);
      });
    } else {
      // genau 1 Vorkommen (oder ungueltig mehrfach bei nicht-wiederholbar → erstes)
      bindNode(child, matches[0]!, depth);
    }
  };

  const bindNode = (node: TreeNode, xmlEl: Element, depth: number): void => {
    if (node.recursive) return;
    quelle.set(node.path, xmlEl);
    if (baum.isLeaf(node)) {
      const val = leafValue(xmlEl, !!node.codelist);
      if (val) {
        elemente[node.path] = { ...elemente[node.path], beispiel: val };
        // Der Verweis haengt am Traeger, nicht am Nummern-Blatt darunter —
        // dieselbe Ableitung wie im Detailbereich (#30). Ohne Traeger (Typ per
        // xs:extension) traegt das Blatt die Zielangabe selbst.
        const traeger = refTraeger(node) ?? (refKindOf(node) ? node : null);
        if (traeger) verweise.push({ traeger, wert: val });
      }
      return;
    }
    offen.add(node.path);
    bindChildren(node, xmlEl, depth + 1);
  };

  // Die Wurzel gehoert in die Zuordnung: sie **ist** die Nachricht. Ohne diesen
  // Eintrag galt sie als nicht enthalten, und eine Profilierung, die den
  // Wurzelknoten zwingend setzt, bekam „die Nachricht enthaelt es nicht".
  quelle.set(root.path, rootEl);
  bindChildren(root, rootEl, 0);
  return { modell: { elemente, auspraegungen }, quelle, vorkommenIndex, offen, verweise };
}

/**
 * Alle Werte, auf die in der Quelle verwiesen wird — der Inhalt jedes
 * `ref.*`-Blatts. Einmal vorab erhoben, weil beim Binden eines moeglichen
 * Ziels feststehen muss, ob es ein Vorkommen braucht; der zugehoerige Verweis
 * kann in der Nachricht weit dahinter stehen.
 */
function verwieseneWerte(rootEl: Element): Set<string> {
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
function istVerwiesen(refWerte: Set<string>, elName: string, xmlEl: Element): boolean {
  if (!ZIEL_NAMEN.has(elName) || !refWerte.size) return false;
  for (const k of Array.from(xmlEl.getElementsByTagName('*'))) {
    const t = k.textContent?.trim();
    if (!t || !refWerte.has(t)) continue;
    if (k.localName === 'rollennummer' || k.localName === 'beteiligtennummer') return true;
    if (k.localName === SGO_BLATT && k.parentElement?.localName === SGO_ELTERN) return true;
  }
  return false;
}
