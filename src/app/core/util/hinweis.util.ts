import { Hinweis, ProfileDoc } from '../../models/profile.model';

/** Ein Hinweis, wie er in einer exportierten Profildatei steht (ohne Server-id). */
export type HinweisEingabe = Omit<Hinweis, 'id'>;

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
