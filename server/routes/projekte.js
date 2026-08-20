import { Router } from 'express';

/**
 * REST-API der Projekte (#134): der Behaelter ueber den Profilierungen. Ein
 * Vorhaben buendelt mehrere Kommunikationsszenarien auf derselben Nachricht --
 * GenUVA-Ersuchen an die Gemeinde, an das Gericht, die jeweilige
 * Sachentscheidung -- und die Testnachrichten, die an ihnen haengen.
 *
 * Die Zuordnung selbst wird **nicht** hier gesetzt, sondern an den Eintraegen:
 * `PATCH /api/profiles/:id/ablage` bzw. `PATCH /api/testmessages/:id/ablage`.
 * Sie liegen bewusst in den jeweiligen Routern -- die Ablage gehoert zum
 * Eintrag, nicht zum Projekt.
 *
 * Projekte tragen keine fachliche Aussage und kennen daher keine Abnahme; der
 * AG-Schluessel spielt hier keine Rolle.
 */
export function projekteRouter(db) {
  const r = Router();

  r.get('/projekte', (_req, res) => {
    res.json(db.prjList());
  });

  r.get('/projekte/:id', (req, res) => {
    const entry = db.prjGet(req.params.id);
    if (!entry) return res.status(404).json({ error: 'nicht gefunden' });
    res.json(entry);
  });

  r.post('/projekte', (req, res) => {
    const { name, beschreibung, tags } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim())
      return res.status(400).json({ error: 'kein Name' });
    res.status(201).json(db.prjCreate({ name, beschreibung, tags }));
  });

  r.patch('/projekte/:id', (req, res) => {
    const { name, beschreibung, tags } = req.body ?? {};
    const entry = db.prjUpdate(req.params.id, { name, beschreibung, tags });
    if (!entry) return res.status(404).json({ error: 'nicht gefunden' });
    res.json({ entry });
  });

  // Loeschen entfernt nur die Zuordnungen, nie Inhalte -- die Profilierungen
  // und Testnachrichten bleiben, sie liegen danach in keinem Projekt mehr.
  r.delete('/projekte/:id', (req, res) => {
    db.prjDelete(req.params.id);
    res.status(204).end();
  });

  return r;
}
