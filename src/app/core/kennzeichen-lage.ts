import { ProfileDoc } from '../models/profile.model';
import { istErweiterungsPfad } from './util/pfad.util';

/**
 * Wo wuerde eine Kennzeichnung die Reichweite heben — und wo taeuscht eine
 * bereits gesetzte (#121)?
 *
 * Die Erfuellbarkeits-Zuordnung (#116) arbeitet ausschliesslich mit
 * Festlegungen, die der Profilierer als **kennzeichnend** markiert hat. Das ist
 * die tragende Entscheidung jener Spec — ohne Erklaerung nichts Belegbares, und
 * geraten wird nie. Die Kehrseite: eine Profilierung ohne Markierung gewinnt
 * gar nichts, und niemand erfaehrt, welcher Handgriff fehlt. Der Pruefbericht
 * nennt die Reichweite als Zahl; **welche** Festlegung sie heben wuerde, stand
 * nirgends.
 *
 * Dieses Modul leitet das aus der **Profilierung allein** ab: welche
 * Werte-Festlegungen unterhalb der benannten Vorkommen trennen die Vorkommen
 * voneinander? Das ist keine Heuristik ueber die Nachricht — es wird nichts
 * geraten und nichts markiert. Die Aussage bleibt beim Profilierer; hier steht
 * nur, wo sie etwas bewirken wuerde.
 *
 * **Einzelne Suffixe, nicht Kombinationen.** Bewertet wird je Festlegung, ob
 * sie fuer sich trennt. Zwei Festlegungen koennen gemeinsam trennen, wo keine
 * es allein tut — solche Paare bleiben unerwaehnt. Lieber ein Vorschlag zu
 * wenig als einer, dessen Wirkung der Leser nicht nachvollziehen kann.
 */

/** Eine Festlegung, die als Kennzeichen taugen wuerde. */
export interface KennzeichenKandidat {
  /** Pfad unterhalb des Vorkommens („rolle/rollenbezeichnung"). */
  suffix: string;
  /**
   * `vollstaendig`: jede Auspraegung hat hier Werte, und keine zwei teilen
   * einen — die Markierung allein macht die ganze Liste zuordenbar.
   * `teilweise`: sie trennt einige Paare, aber nicht alle (`offen` nennt die
   * Auspraegungen, die dann noch ununterscheidbar blieben).
   */
  trennung: 'vollstaendig' | 'teilweise';
  /** Namen der Auspraegungen, die dieser Kandidat nicht auseinanderhaelt. */
  offen: string[];
}

/** Die Lage einer Vorkommensliste der Profilierung. */
export interface ListenLage {
  listPfad: string;
  /** Namen der benannten Vorkommen, in ihrer Reihenfolge. */
  auspNamen: string[];
  /** Bereits als kennzeichnend markierte Festlegungen (Suffixe, sortiert). */
  markiert: string[];
  /**
   * Markierte Kennzeichen, die **nichts** trennen: zwei Auspraegungen teilen
   * dort einen Wert. Sie sind nicht falsch — mehrere Kennzeichen wirken
   * zusammen — aber allein bewirken sie keine Zuordnung, und wer sie gesetzt
   * hat, erwartet Wirkung.
   */
  ohneTrennwirkung: string[];
  /** Vorschlaege, nach Trennschaerfe sortiert (vollstaendige zuerst). */
  kandidaten: KennzeichenKandidat[];
}

/**
 * Die Lage je Vorkommensliste. Listen mit weniger als zwei benannten Vorkommen
 * bleiben aussen vor: dort gibt es nichts auseinanderzuhalten, eine einzelne
 * Auspraegung ist ohne Kennzeichen ein Joker und passt ohnehin.
 */
export function kennzeichenLage(doc: ProfileDoc): ListenLage[] {
  const out: ListenLage[] = [];
  for (const [listPfad, ausps] of Object.entries(doc.auspraegungen)) {
    if (!ausps || ausps.length < 2) continue;

    // Werte je Suffix und Auspraegung einsammeln — nur Blaetter mit Werteliste
    // unterhalb **dieses** Vorkommens (keine tieferen Vorkommen, keine
    // Erweiterungen; dieselbe Abgrenzung wie im Matching).
    const jeSuffix = new Map<string, Map<string, Set<string>>>();
    const markiert = new Set<string>();
    for (const a of ausps) {
      const praefix = `${listPfad}@${a.id}/`;
      for (const [pfad, e] of Object.entries(doc.elemente)) {
        if (!e.werte?.length || !pfad.startsWith(praefix)) continue;
        const suffix = pfad.slice(praefix.length);
        if (suffix.includes('@') || istErweiterungsPfad(pfad)) continue;
        if (!jeSuffix.has(suffix)) jeSuffix.set(suffix, new Map());
        jeSuffix.get(suffix)!.set(a.id, new Set(e.werte));
        if (e.kennzeichnend) markiert.add(suffix);
      }
    }

    const kandidaten: KennzeichenKandidat[] = [];
    const ohneTrennwirkung: string[] = [];
    for (const [suffix, jeAusp] of jeSuffix) {
      const { trennung, offen } = trennschaerfe(ausps, jeAusp);
      if (markiert.has(suffix)) {
        if (trennung === 'keine') ohneTrennwirkung.push(suffix);
        continue; // Markiertes ist kein Vorschlag mehr.
      }
      if (trennung !== 'keine') kandidaten.push({ suffix, trennung, offen });
    }

    // Nichts zu sagen: weder ein Vorschlag noch eine wirkungslose Markierung.
    if (!kandidaten.length && !ohneTrennwirkung.length) continue;

    kandidaten.sort(
      (a, b) =>
        (a.trennung === 'vollstaendig' ? 0 : 1) - (b.trennung === 'vollstaendig' ? 0 : 1) ||
        a.offen.length - b.offen.length ||
        a.suffix.localeCompare(b.suffix),
    );
    out.push({
      listPfad,
      auspNamen: ausps.map((a) => a.name),
      markiert: [...markiert].sort(),
      ohneTrennwirkung: ohneTrennwirkung.sort(),
      kandidaten,
    });
  }
  return out.sort((a, b) => a.listPfad.localeCompare(b.listPfad));
}

/**
 * Wie gut haelt dieser Suffix die Auspraegungen auseinander? Eine Auspraegung
 * **ohne** Werte an dieser Stelle ist von keiner anderen getrennt — sie liesse
 * jeden Wert zu (Joker-Lesart des Matchings).
 */
function trennschaerfe(
  ausps: { id: string; name: string }[],
  jeAusp: Map<string, Set<string>>,
): { trennung: 'vollstaendig' | 'teilweise' | 'keine'; offen: string[] } {
  const ungetrennt = new Set<string>();
  let getrennteP = 0;
  for (let i = 0; i < ausps.length; i++) {
    for (let j = i + 1; j < ausps.length; j++) {
      const a = ausps[i]!;
      const b = ausps[j]!;
      const wa = jeAusp.get(a.id);
      const wb = jeAusp.get(b.id);
      // Ohne Werte ist eine Auspraegung ein Joker — sie liesse jeden Wert zu
      // und ist damit von keiner anderen getrennt.
      if (wa?.size && wb?.size && ![...wa].some((w) => wb.has(w))) {
        getrennteP++;
        continue;
      }
      ungetrennt.add(a.name);
      ungetrennt.add(b.name);
    }
  }
  if (!ungetrennt.size) return { trennung: 'vollstaendig', offen: [] };
  if (!getrennteP) return { trennung: 'keine', offen: [...ungetrennt] };
  return { trennung: 'teilweise', offen: [...ungetrennt] };
}
