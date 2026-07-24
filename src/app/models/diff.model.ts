/** Art eines Versionsunterschieds (computeDiff, Z.2193-2220). */
export type DiffArt = 'neu' | 'entfernt' | 'geändert';

/**
 * Ein Versionsunterschied. Der relative Pfad (`rel`) ist zugleich der Map-Key
 * in `Map<string, DiffEntry>` (computeDiffMap, Z.2227).
 */
export interface DiffEntry {
  art: DiffArt;
  /** Relativer Pfad ab dem Nachrichtennamen. */
  rel: string;
  /** Detail wie "Kardinalität 0..1 → 1". */
  info: string;
  /** Technischer Typ in der jeweiligen Version. */
  typ: string;
  /** Von der aktuellen Profilierung betroffen. */
  prof: boolean;
}

/** Vorfahren-Zaehler: Unterschiede im Teilbaum (diffAnc, Z.2229-2239). */
export interface DiffAnc {
  neu: number;
  entfernt: number;
  geändert: number;
}

/** Ergebnis des Vergleichs zweier Schema-Versionen (computeDiff). */
export interface DiffResult {
  msgOnlyA: string[];
  msgOnlyB: string[];
  rows: DiffEntry[];
  msgInB: boolean;
}
