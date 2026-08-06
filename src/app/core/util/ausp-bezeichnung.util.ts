import { Auspraegung } from '../../models/profile.model';
import { AuspBezeichnungen } from '../../models/testmessage.model';

/**
 * Bezeichnungen benannter Vorkommen ueber Speicher-/Ladezyklen einer
 * Testnachricht hinweg festhalten.
 *
 * Das Problem: Der Name einer Auspraegung lebt nur im Modell — im XJustiz-XML
 * ist ein Vorkommen bloss ein weiteres Element. Beim Oeffnen baut der
 * InstanceImportService das Modell aus dem XML neu auf und benennt stur
 * „Vorkommen N" durch; alles, was der Bearbeiter vergeben hat, waere weg.
 *
 * Der Haken bei der naiven Ablage „Pfad -> Namen": Auspraegungs-ids werden bei
 * jedem Import neu vergeben (`StateService.addAusp`), und Pfade unterhalb eines
 * Vorkommens enthalten diese ids (`pfad@aXY/kind`). Ein roher Pfad taugt daher
 * nicht als Schluessel. Deshalb wird jede `@<auspId>`-Komponente durch die
 * **Position** des Vorkommens in seiner Liste ersetzt (`@#0`) — und die ist
 * stabil, weil der InstanceExportService die Vorkommen in Listenreihenfolge ins
 * XML schreibt (`reconcileAusps`) und der Import sie in Dokumentreihenfolge
 * wieder aufbaut.
 */

/** Alle Auspraegungs-Listen als Paare, wie sie `StateService.alleAuspListen` liefert. */
export type AuspListen = readonly (readonly [string, readonly Auspraegung[]])[];

/**
 * Normalisiert einen Listen-Pfad zum stabilen Schluessel: jede `@<auspId>`-
 * Komponente wird zu `@#<Position>`. null, wenn eine id unbekannt ist — dann
 * gehoert der Pfad nicht zum aktuellen Stand und wird uebergangen.
 */
export function auspSchluessel(
  pfad: string,
  indexVon: (auspId: string) => number | undefined,
): string | null {
  let vollstaendig = true;
  const key = pfad.replace(/@([^/@]+)/g, (_treffer, id: string) => {
    const i = indexVon(id);
    if (i === undefined) {
      vollstaendig = false;
      return '@';
    }
    return '@#' + i;
  });
  return vollstaendig ? key : null;
}

/** Auspraegungs-id -> Position in ihrer Liste, ueber alle Listen hinweg. */
function positionen(listen: AuspListen): Map<string, number> {
  const m = new Map<string, number>();
  for (const [, list] of listen) list.forEach((a, i) => m.set(a.id, i));
  return m;
}

/** Bezeichnungen aus dem aktuellen Modellstand einsammeln (Speichern). */
export function bezeichnungenAus(listen: AuspListen): AuspBezeichnungen {
  const pos = positionen(listen);
  const out: AuspBezeichnungen = {};
  for (const [pfad, list] of listen) {
    if (!list.length) continue;
    const key = auspSchluessel(pfad, (id) => pos.get(id));
    if (key != null) out[key] = list.map((a) => a.name);
  }
  return out;
}

/**
 * Die beim Oeffnen faelligen Umbenennungen ermitteln: gleicher Schluessel,
 * gleiche Position. Ueberzaehlige Namen (Vorkommen inzwischen geloescht) fallen
 * weg, fehlende lassen das generische „Vorkommen N" stehen. Gibt nur die
 * tatsaechlichen Abweichungen zurueck, damit der Aufrufer nicht jede
 * Auspraegung sinnlos durch `renameAusp` schickt.
 */
export function bezeichnungenAnwenden(
  listen: AuspListen,
  bez: AuspBezeichnungen,
): { pfad: string; id: string; name: string }[] {
  const pos = positionen(listen);
  const out: { pfad: string; id: string; name: string }[] = [];
  for (const [pfad, list] of listen) {
    const key = auspSchluessel(pfad, (id) => pos.get(id));
    const namen = key != null ? bez[key] : undefined;
    if (!namen) continue;
    list.forEach((a, i) => {
      const name = namen[i];
      if (name && name !== a.name) out.push({ pfad, id: a.id, name });
    });
  }
  return out;
}
