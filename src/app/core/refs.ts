import { TreeNode } from '../models/node.model';

/**
 * Referenz-Metadaten (Type.GDS.Ref.*). Portiert aus Profilierer.html
 * (Z.606-615). Rein, ohne Zustand.
 */
export const REF_LABELS: Record<string, string> = {
  Rollennummer: 'Rolle/Beteiligung',
  SGO: 'Dokument/Akte',
  Beteiligtennummer: 'Beteiligter',
  Bankverbindung: 'Bankverbindung',
  FremdeNachrichtenID: 'frühere Nachricht',
};

export const REF_TARGETS: Record<string, string[]> = {
  Rollennummer: ['beteiligung'],
  Beteiligtennummer: ['beteiligung', 'beteiligter'],
  SGO: ['dokument', 'akte', 'teilakte'],
  Bankverbindung: ['bankverbindung'],
};

/** refKindOf (Z.610-615): die Verweis-Art eines Knotens oder null. */
export function refKindOf(node: TreeNode): string | null {
  const t = node.typeName || '';
  if (t.startsWith('Type.GDS.Ref.')) return t.slice(13);
  if (/^ref\./.test(node.name)) return node.name.slice(4);
  return null;
}
