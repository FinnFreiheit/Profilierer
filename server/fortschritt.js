import { normalisiereTags } from './tags.js';

/**
 * Leitet die Fortschrittszaehler eines Profils ab — maßgebliche Server-Quelle
 * fuer die Index-Spalten (n_status/n_ausp). Spiegelt `zaehleFortschritt` aus
 * src/app/core/services/profile-store.service.ts bzw. `StateService.fortschritt`.
 */
export function zaehleFortschritt(doc) {
  const elemente = doc?.elemente ?? {};
  const auspraegungen = doc?.auspraegungen ?? {};
  const erweiterungen = doc?.erweiterungen ?? {};
  const nStatus = Object.values(elemente).filter((p) => p && p.status).length;
  const nAusp = Object.values(auspraegungen).reduce(
    (s, l) => s + (Array.isArray(l) ? l.length : 0),
    0,
  );
  const nErw = Object.values(erweiterungen).reduce(
    (s, l) => s + (Array.isArray(l) ? l.length : 0),
    0,
  );
  return { nStatus, nAusp, nErw };
}

/**
 * Stand der Entscheidungspunkte, den der Client mitschreibt (#93). Der Server
 * kann ihn nicht selbst ableiten — dazu braeuchte er das XJustiz-Schema. Fehlt
 * er (Altbestand, Import ohne geladenes Schema), bleiben beide Spalten leer und
 * die Kachel zeigt keinen Balken.
 */
export function lesePunkte(doc) {
  const f = doc?.fortschritt;
  if (!f || typeof f.x !== 'number' || typeof f.y !== 'number' || f.y <= 0) {
    return { nEntschieden: null, nPunkte: null };
  }
  // Gegen fehlerhafte Eingaben absichern: x nie groesser als y.
  return { nEntschieden: Math.max(0, Math.min(f.x, f.y)), nPunkte: f.y };
}

/**
 * Baut einen schlanken LibraryEntry (Index-Zeile) aus id, Dokument und
 * Zeitstempel. Spiegelt die Ableitung in `ProfileStoreService.upsert`.
 */
export function toEntry(id, doc, aktualisiert) {
  const meta = doc?.meta ?? {};
  const { nStatus, nAusp, nErw } = zaehleFortschritt(doc);
  const { nEntschieden, nPunkte } = lesePunkte(doc);
  const tags = normalisiereTags(meta.tags);
  return {
    id,
    name: (meta.name || '').trim(),
    // Autor und Beschreibung stehen auf der Kachel — sie kommen aus den
    // Profil-Details und liegen darum schon im Dokument; der Index spart der
    // Uebersicht das Nachladen der grossen doc-Maps.
    autor: (meta.autor || '').trim() || undefined,
    beschreibung: (meta.beschreibung || '').trim() || undefined,
    tags: tags.length ? tags : undefined,
    nachricht: meta.nachricht ?? null,
    xjustizVersion: meta.xjustizVersion,
    nStatus,
    nAusp,
    nErw,
    nEntschieden,
    nPunkte,
    gespeichert: meta.gespeichert,
    aktualisiert,
  };
}
