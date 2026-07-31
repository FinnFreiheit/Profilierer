import { Hinweis, ProfileDoc } from '../../models/profile.model';

/** Ein Hinweis, wie er in einer exportierten Profildatei steht (ohne Server-id). */
export type HinweisEingabe = Omit<Hinweis, 'id'>;

/**
 * Liegt `pfad` auf oder unter `praefix`? Grenzen sind '/' und '@' wie in der
 * Vorfahren-Logik des Stores — ohne sie faenge `…/anlage` auch `…/anlageArt`.
 * Grundlage der Kaskade "Element weg, Hinweise weg"; dieselbe Regel steht
 * serverseitig in `db.hinweiseLoeschenUnter`.
 */
export function unterPfad(pfad: string, praefix: string): boolean {
  return pfad === praefix || pfad.startsWith(praefix + '/') || pfad.startsWith(praefix + '@');
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
