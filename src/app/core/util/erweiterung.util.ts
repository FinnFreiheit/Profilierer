/**
 * Die Klartexte einer Schema-Erweiterung (#97) — an einer Stelle, weil sie an
 * mehreren erscheinen: Rueckfragen stehen im Baum **und** im Detailpanel, die
 * Warnung zum fehlenden Typ am Kasten **und** im Detailpanel. Zwei Kopien
 * derselben Frage liefen bisher schon einmal auseinander.
 */

/** "1 Festlegung" / "n Festlegungen" — die Zahl, die eine Rueckfrage begruendet. */
export function festlegungen(n: number): string {
  return n + (n === 1 ? ' Festlegung' : ' Festlegungen');
}

/**
 * Rueckfrage vor dem Loeschen einer Erweiterung. Die Zahl der mitfallenden
 * Festlegungen steht dabei, damit die Kaskade nicht ueberrascht.
 */
export function erwLoeschFrage(name: string, betroffen: number): string {
  const zusatz = betroffen ? ` Dabei entfallen ${festlegungen(betroffen)} darunter.` : '';
  return `Schema-Erweiterung „${name}" samt Unterelementen löschen?${zusatz}`;
}

/** Rueckfrage vor einem Typwechsel, unter dem bereits Festlegungen liegen. */
export function erwTypwechselFrage(name: string, betroffen: number): string {
  return `Der Typwechsel entfernt ${festlegungen(betroffen)} unter „${name}". Fortfahren?`;
}

/**
 * Klartext zum Schema-Typ, den das aktive Schema nicht (mehr) kennt. Das Profil
 * wird dabei ausdruecklich **nicht** angefasst — die Meldung sagt genau das,
 * damit niemand die Festlegungen fuer verloren haelt.
 */
export function erwTypFehltText(typ: string, version: string | null | undefined): string {
  return (
    `Typ „${typ}" ist in XJustiz ${version || '(unbekannte Version)'} nicht enthalten — ` +
    'Unterelemente werden nicht angezeigt; die Profilierung darunter bleibt gespeichert.'
  );
}
