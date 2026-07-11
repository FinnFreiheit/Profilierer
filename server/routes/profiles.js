import { Router } from 'express';

/**
 * REST-API der Profil-Bibliothek. Spiegelt den 8-Methoden-Vertrag des
 * ProfileStoreService (Client). Schreibende Endpunkte geben den abgeleiteten
 * LibraryEntry zurueck, damit der Client sein `entries`-Signal ohne Extra-GET
 * aktualisieren kann.
 */
export function profilesRouter(db) {
  const r = Router();

  // entries: schlanker Index, ohne doc, sortiert.
  r.get('/profiles', (_req, res) => {
    res.json(db.list());
  });

  // load: komplettes Dokument.
  r.get('/profiles/:id', (req, res) => {
    const doc = db.load(req.params.id);
    if (!doc) return res.status(404).json({ error: 'nicht gefunden' });
    res.json(doc);
  });

  // create: neues Profil, id serverseitig.
  r.post('/profiles', (req, res) => {
    const doc = req.body;
    if (!doc || typeof doc !== 'object') return res.status(400).json({ error: 'kein Dokument' });
    res.status(201).json(db.create(doc));
  });

  // upsert: Dokument unter fester id schreiben.
  r.put('/profiles/:id', (req, res) => {
    const doc = req.body;
    if (!doc || typeof doc !== 'object') return res.status(400).json({ error: 'kein Dokument' });
    res.json({ entry: db.upsert(req.params.id, doc) });
  });

  // duplicate.
  r.post('/profiles/:id/duplicate', (req, res) => {
    const out = db.duplicate(req.params.id);
    if (!out) return res.status(404).json({ error: 'nicht gefunden' });
    res.status(201).json(out);
  });

  // rename.
  r.patch('/profiles/:id', (req, res) => {
    const name = req.body?.name;
    const entry = db.rename(req.params.id, name ?? '');
    if (!entry) return res.status(404).json({ error: 'nicht gefunden' });
    res.json({ entry });
  });

  // delete.
  r.delete('/profiles/:id', (req, res) => {
    db.delete(req.params.id);
    res.status(204).end();
  });

  // Migration: Bulk-Import (erhaelt id + aktualisiert).
  r.post('/import', (req, res) => {
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Array erwartet' });
    const n = db.importAll(items);
    res.json({ imported: n });
  });

  return r;
}
