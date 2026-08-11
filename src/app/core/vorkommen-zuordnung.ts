import { ProfileDoc } from '../models/profile.model';
import { AuspBezeichnungen } from '../models/testmessage.model';
import { bezeichnungenAnwenden } from './util/ausp-bezeichnung.util';
import { InstanzModell, VorgabeSicht } from './vorgabe-sicht';

/**
 * Die benannten Vorkommen einer aus XML gewonnenen Nachricht auf die der
 * Profilierung zurueckfuehren.
 *
 * Das Problem steht im Testnachrichten-Modell: ein Vorkommen ist im XJustiz-XML
 * nur ein weiteres Element und kann keinen Namen tragen. Der Bind-Walk vergibt
 * darum frische ids und generische Namen („Vorkommen 1") — und dann trifft
 * **keine** id der Vorgabe zu. Der Abgleich meldete so jedes zwingend gesetzte
 * benannte Vorkommen als fehlend.
 *
 * Wo die Nachricht aus dem Werkzeug stammt, liegen die vergebenen Namen
 * allerdings **neben** dem XML (`AuspBezeichnungen`, positionsstabil). Mit
 * ihnen laesst sich die Zuordnung herstellen: gleicher Name = dasselbe
 * Vorkommen. Eingetragen wird sie als `vonId` — genau das Feld, das die
 * Herkunft einer Kopie fuehrt; damit greift auch die Unter-Profilierung des
 * Vorkommens (`VorgabeSicht.quellPfad`), nicht nur die Existenzpruefung.
 *
 * **Von aussen nach innen**, weil ein innerer Listenpfad die ids der aeusseren
 * enthaelt: `m/bet@v1/adr` ist der Vorgabe nur bekannt, wenn `v1` schon auf
 * seine Quelle zeigt. Nach Segmentzahl sortiert ist das erledigt, bevor es
 * gebraucht wird.
 */
export function ordneVorkommenZu(
  modell: InstanzModell,
  vorgabe: ProfileDoc,
  bezeichnungen: AuspBezeichnungen | null,
): { modell: InstanzModell; zuordenbar: (listPfad: string) => boolean } {
  const listen = Object.entries(modell.auspraegungen).map(
    ([pfad, list]) => [pfad, list.map((a) => ({ ...a }))] as const,
  );
  const auspraegungen: InstanzModell['auspraegungen'] = {};
  for (const [pfad, list] of listen) auspraegungen[pfad] = list;
  const neu: InstanzModell = { elemente: modell.elemente, auspraegungen };

  // Namen zurueckholen, wo sie neben dem XML liegen.
  if (bezeichnungen) {
    for (const u of bezeichnungenAnwenden(listen, bezeichnungen)) {
      const treffer = auspraegungen[u.pfad]?.find((a) => a.id === u.id);
      if (treffer) treffer.name = u.name;
    }
  }

  const sicht = new VorgabeSicht(vorgabe, neu);
  const benannt = new Set<string>();
  for (const pfad of Object.keys(auspraegungen).sort(
    (a, b) => a.split('/').length - b.split('/').length,
  )) {
    const vorgabeListe = sicht.ausps(pfad);
    if (!vorgabeListe?.length) continue;
    let getroffen = false;
    for (const a of auspraegungen[pfad]!) {
      const quelle = vorgabeListe.find((q) => q.name === a.name);
      if (!quelle) continue;
      a.vonId = quelle.id;
      getroffen = true;
    }
    if (getroffen) benannt.add(pfad);
  }
  return { modell: neu, zuordenbar: (listPfad) => benannt.has(listPfad) };
}
