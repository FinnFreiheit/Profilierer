/**
 * Die Reihenfolge der Index-Listen von Profil-Bibliothek und Testdaten-Speicher:
 * zuletzt geschrieben zuerst. Beide Stores fuehrten dieselbe Regel wortgleich
 * (`putEntry`) — sie gehoert an eine Stelle, damit die beiden Kachel-Ansichten
 * nicht auseinanderlaufen koennen.
 */
interface IndexEintrag {
  id: string;
  aktualisiert: number;
}

/** Die Liste nach letzter Schreibung absteigend (Kopie, neue Referenz). */
export function neuesteZuerst<T extends IndexEintrag>(liste: readonly T[]): T[] {
  return [...liste].sort((a, b) => b.aktualisiert - a.aktualisiert);
}

/**
 * Einen vom Server gelieferten Eintrag uebernehmen: ersetzt den vorhandenen
 * gleicher id bzw. haengt ihn an, danach wieder neueste zuerst. Kein
 * Voll-Reload je Schreibvorgang — wichtig fuer den 800-ms-Autosave.
 */
export function mitEintrag<T extends IndexEintrag>(liste: readonly T[], eintrag: T): T[] {
  return neuesteZuerst([...liste.filter((e) => e.id !== eintrag.id), eintrag]);
}

/** Den Eintrag einer id entfernen. */
export function ohneEintrag<T extends IndexEintrag>(liste: readonly T[], id: string): T[] {
  return liste.filter((e) => e.id !== id);
}
