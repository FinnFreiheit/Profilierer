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

/**
 * Womit ein Verweis sein Ziel **benennt**. XJustiz kennt dafuer zwei Bauarten:
 *
 * - `nummer` — die laufende Nummer, die das Ziel selbst traegt
 *   (`rollennummer`, `beteiligtennummer`). Sie vergibt das Werkzeug (#30).
 * - `uuid` — die Kennung eines Schriftgutobjekts. `Type.GDS.Ref.SGO` ist ein
 *   UUID-Typ; verwiesen wird auf `identifikation/id` des Dokuments bzw. der
 *   (Teil-)Akte. Die `nummerImUebergeordnetenContainer` daneben ist nur die
 *   Reihenfolge im Container und **kein** zulaessiger Verweiswert.
 */
export type RefSchluessel = 'nummer' | 'uuid';

const REF_SCHLUESSEL: Record<string, RefSchluessel> = { sgo: 'uuid' };

/**
 * Die Schluessel-Bauart einer Verweis-Art. Die Art kommt je nach Fundort in
 * zwei Schreibweisen — am Traeger als Typname (`Type.GDS.Ref.SGO`), am Blatt
 * als Elementname (`ref.sgo`); die Zuordnung fragt darum ohne Ruecksicht auf
 * Gross-/Kleinschreibung. Ohne Eintrag gilt die Nummer.
 */
export function refSchluesselArt(kind: string | null | undefined): RefSchluessel {
  return (kind && REF_SCHLUESSEL[kind.toLowerCase()]) || 'nummer';
}

/**
 * Wo ein Schriftgutobjekt seine Kennung traegt — relativ zum Vorkommen des
 * Dokuments bzw. der (Teil-)Akte. Ein Verweis vom Typ `Type.GDS.Ref.SGO` traegt
 * genau diesen Wert.
 */
export const SGO_KENNUNG = 'identifikation/id';

/**
 * Ist dieser Knoten die Kennung eines Schriftgutobjekts (`identifikation/id`)?
 * Ueber synthetische Gruppen hinweg, die zwischen `identifikation` und dem
 * Blatt liegen koennen — und mit der Frage nach dem Elternnamen, weil `id`
 * allein auch anderswo vorkommt.
 */
export function istSgoKennung(node: TreeNode): boolean {
  const [eltern, blatt] = SGO_KENNUNG.split('/');
  if (node.name !== blatt) return false;
  let p = node.parent;
  while (p?.synthetic) p = p.parent;
  return p?.name === eltern;
}

/** refKindOf (Z.610-615): die Verweis-Art eines Knotens oder null. */
export function refKindOf(node: TreeNode): string | null {
  const t = node.typeName || '';
  if (t.startsWith('Type.GDS.Ref.')) return t.slice(13);
  if (/^ref\./.test(node.name)) return node.name.slice(4);
  return null;
}

/**
 * Der **Traeger** eines Verweises: der Knoten, an dem das Verweisziel haengt.
 * Ein Blatt `ref.rollennummer` traegt nur die Nummer; die Art des Verweises
 * steht im Typ seines Traegers (`Type.GDS.Ref.Rollennummer`), und dort gehoert
 * auch die Zielangabe hin. Ueber synthetische Gruppen (sequence/choice) hinweg,
 * die zwischen Traeger und Blatt liegen koennen. Ist der Knoten selbst der
 * Traeger, gibt die Funktion ihn zurueck; ohne Traeger null.
 */
export function refTraeger(node: TreeNode): TreeNode | null {
  if ((node.typeName || '').startsWith('Type.GDS.Ref.')) return node;
  if (!/^ref\./.test(node.name)) return null;
  let p = node.parent;
  let tiefe = 0;
  while (p && tiefe++ < 4) {
    if ((p.typeName || '').startsWith('Type.GDS.Ref.')) return p;
    if (!p.synthetic) break;
    p = p.parent;
  }
  return null;
}

/**
 * Die Verweis-Art **mit** Blatt-Aufloesung: am Blatt `ref.rollennummer` liefert
 * `refKindOf` die kleingeschriebene Elementbezeichnung, die in `REF_TARGETS`
 * nicht vorkommt — die Zielkandidaten blieben ungefiltert. Hier gewinnt die Art
 * des Traegers (Issue #30).
 */
export function refKindEff(node: TreeNode): string | null {
  const traeger = refTraeger(node);
  return traeger ? refKindOf(traeger) : refKindOf(node);
}
