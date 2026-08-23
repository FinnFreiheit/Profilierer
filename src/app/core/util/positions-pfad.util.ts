import { Auspraegung } from '../../models/profile.model';

/**
 * Der **Positionspfad**: ein Baumpfad, in dem jedes Vorkommen statt seiner id
 * seine Stellung traegt (`…/beteiligung@v7/name` → `…/beteiligung[2]/name`).
 *
 * Er ist die gemeinsame Adresse mehrerer Nachrichten. Vorkommen-ids sind je
 * Dokument neu vergeben — die `@v1` der einen Nachricht hat mit der `@v1` der
 * anderen nichts zu tun. Verglichen wird deshalb positionsweise, genau wie in
 * der Merkmals-Matrix und nach derselben Zaehlkonvention (ADR 0015): das n-te
 * Vorkommen der einen Nachricht steht dem n-ten der anderen gegenueber.
 *
 * Die Schreibweise mit `[n]` ist die der Matrix — und sie kann mit keinem
 * Baumpfad kollidieren ('[' ist kein NCName-Zeichen).
 */

/** Vorkommen-Listen, indiziert am Traegerpfad (wie `ProfileDoc.auspraegungen`). */
export type Vorkommenlisten = Readonly<Record<string, readonly Auspraegung[]>>;

/**
 * Baumpfad → Positionspfad. `listen` muss die Vorkommen-Listen **desselben**
 * Dokuments sein, aus dem der Pfad stammt. Eine id, die in ihrer Liste nicht
 * vorkommt, wird als `[?]` ausgewiesen statt still zu verschwinden — sonst
 * traefe der Pfad auf einen fremden.
 */
export function positionsPfad(pfad: string, listen: Vorkommenlisten): string {
  if (!pfad.includes('@')) return pfad;
  let original = '';
  let position = '';
  for (const segment of pfad.split('/')) {
    const at = segment.indexOf('@');
    const name = at < 0 ? segment : segment.slice(0, at);
    // Der Traegerpfad steht im **Originalraum**: innere Listen sind an Pfaden
    // indiziert, die die ids ihrer aeusseren Vorkommen tragen.
    const traeger = original ? original + '/' + name : name;
    original = original ? original + '/' + segment : segment;
    position = position ? position + '/' + name : name;
    if (at < 0) continue;
    const id = segment.slice(at + 1);
    const i = (listen[traeger] ?? []).findIndex((a) => a.id === id);
    position += i < 0 ? '[?]' : `[${i + 1}]`;
  }
  return position;
}

/**
 * Positionspfad → Baumpfad. Umkehrung von `positionsPfad` gegen die Listen des
 * **Zielbaums**: `[1]` an einer Stelle ohne gefuehrte Vorkommen faellt weg (ein
 * einzelnes Vorkommen wird ohne Auspraegung gerendert), jede hoehere Stelle
 * ohne Liste ist nicht abbildbar → null.
 */
export function konkreterPfad(position: string, listen: Vorkommenlisten): string | null {
  if (!position.includes('[')) return position;
  let pfad = '';
  for (const segment of position.split('/')) {
    const treffer = /^(.*)\[(\d+|\?)\]$/.exec(segment);
    const name = treffer ? treffer[1]! : segment;
    pfad = pfad ? pfad + '/' + name : name;
    if (!treffer) continue;
    if (treffer[2] === '?') return null;
    const n = Number(treffer[2]);
    const liste = listen[pfad];
    if (!liste?.length) {
      // Ohne gefuehrte Vorkommen gibt es genau einen Kasten — das ist die
      // erste Stelle. Alles darueber hat im Zielbaum keinen Ort.
      if (n !== 1) return null;
      continue;
    }
    const ausp = liste[n - 1];
    if (!ausp) return null;
    pfad += '@' + ausp.id;
  }
  return pfad;
}

/**
 * Der Traeger-Positionspfad einer Stelle (`…/beteiligung[2]` → `…/beteiligung`)
 * samt Stellenzahl — null, wenn das letzte Segment keine Stelle traegt.
 */
export function stellenTeile(position: string): { listenPfad: string; n: number } | null {
  const treffer = /^(.*)\[(\d+)\]$/.exec(position);
  if (!treffer) return null;
  return { listenPfad: treffer[1]!, n: Number(treffer[2]) };
}

/**
 * Alle Praefixe eines Positionspfads (jedes Segment und vor jeder Stelle
 * zusaetzlich der Traeger), inklusive des Pfads selbst — das Gegenstueck zu
 * `segmentKette` im Positionsraum.
 */
export function positionsKette(position: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const segment of position.split('/')) {
    const treffer = /^(.*)(\[(?:\d+|\?)\])$/.exec(segment);
    const name = treffer ? treffer[1]! : segment;
    cur = cur ? cur + '/' + name : name;
    out.push(cur);
    if (treffer) {
      cur += treffer[2]!;
      out.push(cur);
    }
  }
  return out;
}
