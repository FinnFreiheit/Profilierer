import { Hinweis, ProfileDoc } from '../../models/profile.model';

/** Ein Hinweis, wie er in einer exportierten Profildatei steht (ohne Server-id). */
export type HinweisEingabe = Omit<Hinweis, 'id'>;

/** Datum eines Hinweises im Projektformat YY.MM.DD. */
export function hinweisDatum(zeit: number): string {
  const d = new Date(zeit);
  const zwei = (n: number): string => String(n).padStart(2, '0');
  return `${zwei(d.getFullYear() % 100)}.${zwei(d.getMonth() + 1)}.${zwei(d.getDate())}`;
}

/**
 * Herkunftszeile eines Hinweises: „Müller (BLK-AG), 26.07.30" (Issue #40).
 * Der Name ist Selbstauskunft, das Rollenkennzeichen stammt vom Server.
 * **Ohne Autor** bleibt nur das Datum — migrierte Altbestaende tragen keinen
 * Namens- und Rollenzusatz, und ein erfundener waere schlimmer als keiner.
 */
export function hinweisHerkunft(h: Pick<Hinweis, 'autor' | 'rolle' | 'zeit'>): string {
  const datum = hinweisDatum(h.zeit);
  const name = h.autor?.trim();
  if (!name) return datum;
  const rolle = h.rolle === 'ag' ? ' (BLK-AG)' : h.rolle === 'extern' ? ' (extern)' : '';
  return `${name}${rolle}, ${datum}`;
}

/**
 * Nutzertext zu einem gescheiterten Hinweis-Schreibvorgang. Der Status wird
 * bewusst per Duck-Typing gelesen (`HinweisFehler` traegt ihn), damit dieses
 * Util nicht auf den Store zurueckzeigt.
 *
 * 403 ist kein Ausfall, sondern der Abnahme-Schutz: an einer abgenommenen
 * Profilierung schreibt nur die BLK-AG. "Backend nicht erreichbar" waere dort
 * eine falsche Ursache und schickte den Nutzer auf die Suche nach einem
 * Serverproblem, das es nicht gibt.
 */
export function hinweisFehlerText(e: unknown): string {
  const status = (e as { status?: number } | null | undefined)?.status;
  if (status === 403) return 'Von der BLK-AG abgenommen — Hinweise ändern nur mit AG-Schlüssel.';
  if (status === 404) return 'Der Hinweis ist nicht mehr vorhanden — Ansicht neu laden.';
  return 'Hinweis konnte nicht gespeichert werden — Backend nicht erreichbar.';
}

/**
 * Die alten Hinweisfelder (`hinweis`/`hinweisErledigt` am Elementprofil) aus
 * einem eingelesenen Profil-Dokument herausloesen — in-place. Gegenstueck zur
 * einmaligen Server-Migration (`db.migriereHinweise`): damit es nur *eine*
 * Regel gibt, macht der Import einer alten Datei im Client dieselbe Umformung.
 * Autor und Rolle bleiben leer, der Zeitpunkt kommt vom Aufrufer.
 * Eintraege, die dadurch leer werden, fallen weg (pruneP-Aequivalent).
 */
export function hinweiseAusAltformat(doc: ProfileDoc, zeit: number): HinweisEingabe[] {
  const raus: HinweisEingabe[] = [];
  const elemente = doc.elemente as Record<
    string,
    (Record<string, unknown> & { hinweis?: string; hinweisErledigt?: boolean }) | undefined
  >;
  for (const [pfad, p] of Object.entries(elemente)) {
    if (!p || (!('hinweis' in p) && !('hinweisErledigt' in p))) continue;
    const text = typeof p.hinweis === 'string' ? p.hinweis.trim() : '';
    const erledigt = !!p.hinweisErledigt;
    delete p.hinweis;
    delete p.hinweisErledigt;
    if (text) raus.push({ pfad, text, zeit, erledigt: erledigt || undefined });
    if (!Object.keys(p).length) delete elemente[pfad];
  }
  return raus;
}

/**
 * Hinweise aus einer Profildatei lesen: bevorzugt der eigene Top-Level-Schluessel
 * `hinweise` (aktuelles Format), sonst die Altfelder im Dokument. Der Zeitpunkt
 * dient als Ersatz, wo die Datei keinen mitbringt.
 */
export function hinweiseAusDatei(
  daten: { hinweise?: unknown },
  doc: ProfileDoc,
  zeit: number,
): HinweisEingabe[] {
  const alt = hinweiseAusAltformat(doc, zeit);
  if (!Array.isArray(daten.hinweise)) return alt;
  const liste = (daten.hinweise as Partial<Hinweis>[])
    .filter((h) => typeof h?.text === 'string' && h.text.trim())
    .map((h) => ({
      pfad: String(h.pfad ?? ''),
      text: String(h.text).trim(),
      autor: h.autor || undefined,
      rolle: h.rolle === 'ag' || h.rolle === 'extern' ? h.rolle : undefined,
      zeit: typeof h.zeit === 'number' ? h.zeit : zeit,
      erledigt: h.erledigt || undefined,
    }));
  // Eine Datei kann beides tragen (von Hand zusammengesetzt) — dann gilt beides.
  return [...liste, ...alt];
}
