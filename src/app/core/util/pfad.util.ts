/**
 * Pfad-Grammatik des Profilierers — das eine Modul fuer die Zeichenregeln der
 * Baumpfade. Ein Pfad ist eine '/'-Segmentkette (`nachricht.x/beteiligung/name`);
 * drei Sonderzeichen tragen Bedeutung:
 *
 * - `@id`  — benanntes Vorkommen (Auspraegung): `…/beteiligung@a1/name` ist der
 *            Pfadraum des Vorkommens a1. Vor dem '@' liegt das Traegerelement.
 * - `#n`   — Namens-Disambiguierung gleichnamiger Geschwister.
 * - `/~id` — Schema-Erweiterung ('~' ist kein NCName-Zeichen, kollidiert also
 *            nie mit Schema-Elementnamen).
 *
 * Vor diesem Modul war die Grammatik Wissen ohne Ort: die Vorfahren-Schleife
 * war wortgleich kopiert, der Praefix-Test existierte achtfach, und zwei
 * Stellen prueften mit nacktem `startsWith` ohne Grenzzeichen — die
 * Fehlerklasse "`…/anlage` trifft `…/anlageArt`" (bzw. id `a1` trifft `a12`)
 * war offen. Die Grenzzeichen '/' und '@' sind jetzt an genau einer Stelle
 * richtig. Die Serverseite haelt bewusst ihre eine Kopie der Praefix-Regel
 * (`server/db.js hinweiseLoeschenUnter`, andere Laufzeit) — mit Verweis.
 */

/**
 * Der Pfad ohne Vorkommen-Segmente (`…/beteiligung@a7/name` → `…/beteiligung/name`)
 * — der generische Schema-Pfad, unter dem eine Profilierung ohne eigene
 * Auspraegungen ihre Aussagen fuehrt.
 */
export function ohneVorkommen(pfad: string): string {
  return pfad.replace(/@[^/]+/g, '');
}

/** Liegt der Pfad in (oder unter) einer Schema-Erweiterung? */
export function istErweiterungsPfad(pfad: string): boolean {
  return pfad.includes('/~');
}

/**
 * Alle echten Vorfahren-Pfade, aufsteigend (kuerzester zuerst). Grenzen sind
 * '/' **und** '@': zu `…/beteiligung@a1/rolle` gehoert auch `…/beteiligung` —
 * das Traegerelement, als dessen Kind das Vorkommen gerendert wird.
 */
export function vorfahren(pfad: string): string[] {
  const r: string[] = [];
  for (let i = 0; i < pfad.length; i++)
    if (pfad[i] === '/' || pfad[i] === '@') r.push(pfad.slice(0, i));
  return r;
}

/**
 * Liegt `pfad` auf oder unter `praefix`? Grenzen sind '/' und '@' — ohne sie
 * faenge `…/anlage` auch `…/anlageArt`, und das Vorkommen `@a1` auch `@a12`.
 * Dieselbe Regel steht serverseitig in `db.hinweiseLoeschenUnter`.
 */
export function unterPfad(pfad: string, praefix: string): boolean {
  return pfad === praefix || pfad.startsWith(praefix + '/') || pfad.startsWith(praefix + '@');
}

/**
 * Alle Pfade, die auf dem Weg zu `pfad` liegen — jedes Segment-Praefix und vor
 * jedem `@` zusaetzlich das Traegerelement. Der Aufklapp-/Inhaltspfad: was
 * hier zurueckkommt, muss offen sein (bzw. traegt Inhalt), damit `pfad`
 * erreichbar ist. Enthaelt `pfad` selbst als letztes Element.
 */
export function segmentKette(pfad: string): string[] {
  const r: string[] = [];
  let cur = '';
  for (const sg of pfad.split('/')) {
    cur = cur ? cur + '/' + sg : sg;
    const at = sg.indexOf('@');
    if (at >= 0) r.push(cur.slice(0, cur.length - (sg.length - at)));
    r.push(cur);
  }
  return r;
}

/**
 * Zerlegung eines Auspraegungs-Pfads (`…/beteiligung@a1`) in Listenpfad und
 * Vorkommens-id — null, wenn das letzte Segment kein Vorkommen ist. Bewusst
 * nur das **letzte** Segment: `…/beteiligung@a1/name` ist ein Element *im*
 * Vorkommen, kein Vorkommen (dafuer `letztesVorkommenPfad`).
 */
export function auspTeile(pfad: string): { listPfad: string; auspId: string } | null {
  const i = pfad.lastIndexOf('@');
  if (i < 0 || pfad.indexOf('/', i) >= 0) return null;
  return { listPfad: pfad.slice(0, i), auspId: pfad.slice(i + 1) };
}

/**
 * Der Pfad des innersten umschliessenden Vorkommens (`…/beteiligung@a1/name` →
 * `…/beteiligung@a1`) — null, wenn der Pfad in keinem Vorkommen liegt.
 */
export function letztesVorkommenPfad(pfad: string): string | null {
  const at = pfad.lastIndexOf('@');
  if (at < 0) return null;
  const ende = pfad.indexOf('/', at);
  return ende < 0 ? pfad : pfad.slice(0, ende);
}

/**
 * Der Elementname des letzten Segments, ohne Vorkommens-id (`@…`) und ohne
 * Namens-Disambiguierung (`#…`) — die Rohform fuer Anzeigenamen (`pretty`).
 */
export function blattName(pfad: string): string {
  return pfad.split('/').at(-1)!.split('@')[0]!.split('#')[0]!;
}
