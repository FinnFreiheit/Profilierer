/**
 * Leitet die Fortschrittszaehler eines Profils ab — maßgebliche Server-Quelle
 * fuer die Index-Spalten (n_status/n_ausp). Spiegelt `zaehleFortschritt` aus
 * src/app/core/services/profile-store.service.ts bzw. `StateService.fortschritt`.
 */
export function zaehleFortschritt(doc) {
  const elemente = doc?.elemente ?? {};
  const auspraegungen = doc?.auspraegungen ?? {};
  const nStatus = Object.values(elemente).filter((p) => p && p.status).length;
  const nAusp = Object.values(auspraegungen).reduce(
    (s, l) => s + (Array.isArray(l) ? l.length : 0),
    0,
  );
  return { nStatus, nAusp };
}

/**
 * Baut einen schlanken LibraryEntry (Index-Zeile) aus id, Dokument und
 * Zeitstempel. Spiegelt die Ableitung in `ProfileStoreService.upsert`.
 */
export function toEntry(id, doc, aktualisiert) {
  const meta = doc?.meta ?? {};
  const { nStatus, nAusp } = zaehleFortschritt(doc);
  return {
    id,
    name: (meta.name || '').trim(),
    nachricht: meta.nachricht ?? null,
    xjustizVersion: meta.xjustizVersion,
    nStatus,
    nAusp,
    gespeichert: meta.gespeichert,
    aktualisiert,
  };
}
