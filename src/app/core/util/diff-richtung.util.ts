/**
 * Beschriftung der Diff-Kennzeichen abhaengig von der **Richtung** des
 * Vergleichs.
 *
 * Der Diff stellt die geladene Datenbasis (A) einer Vergleichsversion (B)
 * gegenueber. Bis hierher nannten alle Kennzeichen starr die Vergleichsversion
 * — „neu in <B>", „entfaellt in <B>", „geaendert in <B>". Das stimmt nur, wenn
 * B die **neuere** Version ist. Waehlt man umgekehrt die aeltere Version als
 * Vergleich (4.1.0 geladen, 4.0.0 verglichen), stand an einem Element, das es
 * nur in der alten Fassung gibt, „neu in 4.0.0" — gelesen wird das als „mit
 * 4.0.0 eingefuehrt", gemeint war „in 4.0.0 noch vorhanden". Genau andersherum.
 *
 * Deshalb richtet sich die Wortwahl jetzt nach der Reihenfolge der Versionen:
 * Bei einem Rueckblick (B aelter als A) wird die Aussage auf A bezogen und
 * umgedreht. Sind die Versionen nicht vergleichbar (Fremdordner ohne
 * Versionsangabe), bleibt es beim bisherigen Vorwaerts-Wortlaut.
 *
 * Die Version der Datenbasis kommt aus `StateService.version`, **nicht** aus
 * `idx.version`: seit 4.1.0 traegt der mitgelieferte Grunddatensatz
 * unveraendert `version="4.0.0"`, und nur `loadBundle` setzt die fuehrende
 * Paketversion (siehe `PersistenceService.loadBundle`).
 */

/** Ein Kennzeichen-Wortlaut samt Erklaerung fuer den Titel. */
export interface DiffWort {
  text: string;
  title: string;
}

export interface DiffWorte {
  /** Element gibt es nur in der Vergleichsversion (Phantomkasten). */
  nurInVergleich: DiffWort;
  /** Element gibt es nur in der geladenen Datenbasis. */
  nurInBasis: DiffWort;
  /** Element gibt es in beiden, aber unterschiedlich. */
  geaendert: DiffWort;
}

/** Reine Zahlenversion wie `4.1.0` — nur solche lassen sich ordnen. */
function istZahlversion(v: string): boolean {
  return /^\d+(\.\d+)*$/.test(v);
}

/**
 * -1 = a aelter, 1 = a neuer, 0 = gleich, null = nicht vergleichbar.
 * Segmentweiser Zahlenvergleich; fehlende Segmente zaehlen als 0, damit
 * `4.1` und `4.1.0` gleich sind.
 */
export function vergleicheVersionen(a: string, b: string): number | null {
  if (!istZahlversion(a) || !istZahlversion(b)) return null;
  const sa = a.split('.').map(Number);
  const sb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    const x = sa[i] ?? 0;
    const y = sb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Wortlaut der drei Diff-Kennzeichen fuer die geladene Version `vA` und die
 * Vergleichsversion `vB`. `vB` ist im Zweifel unbekannt — dann steht wie bisher
 * ein Platzhalter.
 */
export function diffWorte(vA: string | undefined, vB: string | undefined): DiffWorte {
  const basis = (vA || '').trim();
  const vergleich = (vB || '').trim();
  const ord = basis && vergleich ? vergleicheVersionen(basis, vergleich) : null;
  // Rueckblick: die Vergleichsversion ist aelter als die geladene. Nur dann
  // wird die Aussage umgedreht und auf die geladene Version bezogen.
  const rueckblick = ord === 1 && !!basis;

  if (rueckblick) {
    return {
      nurInVergleich: {
        text: `entfällt in ${basis}`,
        title: `Element ist in Version ${vergleich} noch enthalten, in ${basis} nicht mehr`,
      },
      nurInBasis: {
        text: `neu in ${basis}`,
        title: `Element ist erst mit Version ${basis} hinzugekommen (in ${vergleich} nicht enthalten)`,
      },
      geaendert: {
        text: `geändert in ${basis}`,
        title: `Element hat sich gegenüber Version ${vergleich} geändert`,
      },
    };
  }

  // Ohne benannte Vergleichsversion (Fremdordner-Upload) bleibt die
  // Versionsangabe weg — „neu in ?" sagt weniger als „neu".
  const in_ = vergleich ? ` in ${vergleich}` : '';
  const der = vergleich ? `Version ${vergleich}` : 'der Vergleichsversion';
  return {
    nurInVergleich: {
      text: `neu${in_}`,
      title: `Element kommt erst in ${der} hinzu`,
    },
    nurInBasis: {
      text: `entfällt${in_}`,
      title: `Element ist in ${der} nicht mehr enthalten`,
    },
    geaendert: {
      text: `geändert${in_}`,
      title: `Element ändert sich in ${der}`,
    },
  };
}
