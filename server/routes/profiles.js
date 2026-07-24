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

  // ── Versionen (Snapshots) ─────────────────────────────────────────────

  // Versionsliste (ohne doc).
  r.get('/profiles/:id/versions', (req, res) => {
    const liste = db.versionsList(req.params.id);
    if (!liste) return res.status(404).json({ error: 'nicht gefunden' });
    res.json(liste);
  });

  // Version anlegen (Snapshot des serverseitig gespeicherten Stands).
  // Entprellte Automatik-Versionen antworten mit { skipped: true, entry }.
  r.post('/profiles/:id/versions', (req, res) => {
    const { kommentar, automatisch } = req.body ?? {};
    const out = db.versionCreate(req.params.id, { kommentar, automatisch });
    if (!out) return res.status(404).json({ error: 'nicht gefunden' });
    res.status(out.skipped ? 200 : 201).json(out);
  });

  // Version wiederherstellen; sichert den Arbeitsstand vorher automatisch.
  r.post('/profiles/:id/versions/:vid/restore', (req, res) => {
    const out = db.versionRestore(req.params.id, req.params.vid);
    if (!out) return res.status(404).json({ error: 'nicht gefunden' });
    res.json(out);
  });

  // Version loeschen (idempotent).
  r.delete('/profiles/:id/versions/:vid', (req, res) => {
    db.versionDelete(req.params.id, req.params.vid);
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
