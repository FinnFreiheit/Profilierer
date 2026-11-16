import { Router } from 'express';

/**
 * Kennzahlen der Instanz: anonyme Nutzungszahlen (server/nutzung.js) und der
 * Bestand aus den Fachtabellen.
 *
 * AG-exklusiv: wie stark das Werkzeug genutzt wird, geht die externen
 * Betrachter der offen erreichbaren Instanz nichts an. Ohne konfigurierten
 * Schluessel existiert die Rolle nicht — dann antwortet der Endpunkt immer 403
 * (gleiche Unterscheidung wie beim Abnehmen: Konfiguration vs. Tippfehler).
 */
export function kennzahlenRouter(db, auth) {
  const r = Router();

  const { nurAg } = auth;

  r.get('/kennzahlen', nurAg, (req, res) => {
    const tage = Number.parseInt(req.query.tage ?? '', 10);
    res.json(db.kennzahlen({ tage: Number.isFinite(tage) ? tage : 30 }));
  });

  return r;
}
