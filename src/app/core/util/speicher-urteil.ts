import { ReportEintrag } from '../../models/validation.model';
import { Verstoss } from '../services/konformitaet.service';

/**
 * Die gesammelten Befunde eines Speicherwegs — was auch immer der Weg selbst
 * erhoben hat. Die Wege unterscheiden sich in der **Erhebung** (das gefuehrte
 * Erstellen ueberspringt die XSD-Pruefung, wenn der Entwurf schon feststeht;
 * das Bearbeiten fragt bei Invaliditaet zurueck, bevor es speichert) — das
 * **Urteil** darueber ist dasselbe und faellt hier.
 */
export interface SpeicherBefunde {
  /** Abweichungen von der gebundenen Profilfassung (Konformitaets-Abgleich). */
  verstoesse: Verstoss[];
  /**
   * Blockierende Schemafehler — null/undefined, wenn valide oder nicht
   * geprueft. Ein **leeres Array zaehlt als Befund** (unpruefbare Nachricht:
   * blockiert, auch ohne Detailzeilen).
   */
  schemaEintraege?: ReportEintrag[] | null;
  /** Offene Pflichtpunkte des gefuehrten Durchlaufs (nur beim Erstellen erhoben). */
  kritischOffen?: number;
}

/** Die vorrangige Meldung — null, wenn der Aufrufer selbst meldet (ok/Rest). */
export type SpeicherMeldung =
  | {
      art: 'verstoesse';
      toast: string;
      titel: string;
      untertitel: string;
      eintraege: ReportEintrag[];
    }
  | { art: 'schemafehler'; toast: string; titel: string; eintraege: ReportEintrag[] };

/**
 * Das **Speicher-Urteil**: Entwurfs-Kennzeichen und vorrangige Meldung aus den
 * Befunden — ein Ergebnis, keine Nebenwirkung. Vorher fiel dasselbe Urteil
 * zweimal (gefuehrtes Erstellen und Bearbeiten), mit wortgleichem
 * Meldungs-Block; die Prioritaetsregel war nur ueber zwei TestBed-Aufbauten
 * pruefbar.
 *
 * Prioritaet der Meldung: **Verstoesse vor Schemafehlern** — der
 * Konformitaets-Befund sagt, dass die Nachricht das Szenario verlaesst, und
 * geht damit der Schemafrage vor. Alles Uebrige (offene Pflichtpunkte,
 * Erweiterungs-Hinweis, Erfolg) meldet der Aufrufer selbst: die Texte sind
 * je Weg verschieden, das Kennzeichen nicht.
 */
export function speicherUrteil(b: SpeicherBefunde): {
  entwurf: boolean;
  meldung: SpeicherMeldung | null;
} {
  const entwurf =
    b.verstoesse.length > 0 || b.schemaEintraege != null || (b.kritischOffen ?? 0) > 0;
  if (b.verstoesse.length) {
    const n = b.verstoesse.length;
    return {
      entwurf,
      meldung: {
        art: 'verstoesse',
        toast: `Als Entwurf gespeichert — ${n} Abweichung${n === 1 ? '' : 'en'} von der Profilierung.`,
        titel: 'Als Entwurf gespeichert — nicht profilkonform',
        untertitel:
          'Die Nachricht weicht von der gebundenen Profilfassung ab. Ein Klick springt zum betroffenen Element.',
        eintraege: b.verstoesse.map((v) => ({ pfad: v.pfad, text: v.text })),
      },
    };
  }
  if (b.schemaEintraege != null) {
    return {
      entwurf,
      meldung: {
        art: 'schemafehler',
        toast: 'Als Entwurf gespeichert — die Nachricht ist nicht schema-valide.',
        titel: 'Als Entwurf gespeichert — Nachricht nicht schema-valide',
        eintraege: b.schemaEintraege,
      },
    };
  }
  return { entwurf, meldung: null };
}
