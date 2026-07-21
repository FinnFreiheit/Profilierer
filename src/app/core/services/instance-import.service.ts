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
    if (doc.getElementsByTagName('parsererror').length) throw new Error('XML nicht lesbar (Parserfehler).');
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
    this.bindChildren(root, rootEl, opened, 0);
    this.state.open.set(opened);
    this.state.selItem.set({ kind: 'el', node: root });
    // Bearbeitungs-Session merken: Quell-DOM + Pfad-Zuordnung fuer den treuen
    // Re-Export. Nach loadMessage setzen (das leert messageEdit).
    this.state.messageEdit.set({
      msgName,
      quellName: quellName || msgName,
      xjustizVersion: this.leseVersion(rootEl) || this.state.version() || undefined,
      sourceDoc: doc,
      quelle: this.quelle,
    });
    this.quelle = null;
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
    const vom = (el: Element | null | undefined): string | null => el?.getAttribute('xjustizVersion')?.trim() || null;
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

  private bindElement(child: TreeNode, matches: Element[], opened: Set<string>, depth: number): void {
    if (matches.length >= 2 && this.tree.isRepeatable(child)) {
      opened.add(child.path);
      matches.forEach((m, i) => {
        const auspId = this.state.addAusp(child.path, 'Vorkommen ' + (i + 1));
        const cn = this.tree.ctxNode(child, auspId);
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
      if (val) this.state.setElementProfile(node.path, { beispiel: val });
      return;
    }
    opened.add(node.path);
    this.bindChildren(node, xmlEl, opened, depth + 1);
  }
}
