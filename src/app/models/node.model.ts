import { Auspraegung, Erweiterung } from './profile.model';
import { CodelistInfo } from './codelist.model';

/** Strukturmodell des XSD-Partikels (sequence/choice/all). */
export type NodeModel = 'sequence' | 'choice' | 'all' | null;

/**
 * Ein Knoten im aufgeloesten Element-Baum. Entspricht `makeNode` aus
 * Profilierer.html (Z.460-465). `children === null` bedeutet "noch nicht
 * expandiert" (Lazy-Cache), ein leeres Array bedeutet "keine Kinder".
 */
export interface TreeNode {
  id: number;
  path: string;
  name: string;
  min: string;
  max: string;
  doc: string;
  typeName: string | null;
  /** Das XSD-Element (bzw. bei Referenzen das aufgeloeste Zielelement). */
  xsdEl: Element | null;
  model: NodeModel;
  children: TreeNode[] | null;
  parent: TreeNode | null;
  depth: number;
  /** Synthetischer Knoten fuer eine choice-/sequence-Gruppe. */
  synthetic: boolean;
  /** Das Gruppen-Element bei synthetischen Knoten. */
  groupEl?: Element;
  recursive: boolean;
  codelist: CodelistInfo | null;
  typeStack: string[];
  inChoice: boolean;
  /** Gesetzt bei synthetisierten Knoten einer Schema-Erweiterung. */
  erweiterung?: Erweiterung;
}

/**
 * Ein anzeigbares Item im Baum: entweder ein Element-Knoten oder eine
 * konkrete Auspraegung eines wiederholbaren Elements (eigener Pfad-Raum).
 * Entspricht dem Kommentar in Profilierer.html Z.1038.
 */
export type TreeItem =
  | { kind: 'el'; node: TreeNode }
  | { kind: 'ausp'; parentNode: TreeNode; ausp: Auspraegung; path: string };

/** Der Pfad-String eines Items (Z.1039). */
export function itemPath(it: TreeItem): string {
  return it.kind === 'el' ? it.node.path : it.path;
}

/**
 * Liegt der Pfad in (oder unter) einer Schema-Erweiterung? `~` ist kein
 * NCName-Zeichen und kann daher nicht mit Schema-Elementnamen kollidieren.
 */
export function istErweiterungsPfad(pfad: string): boolean {
  return pfad.includes('/~');
}
