import { Router } from 'express';

/**
 * REST-API der Profil-Bibliothek. Spiegelt den 8-Methoden-Vertrag des
 * ProfileStoreService (Client). Schreibende Endpunkte geben den abgeleiteten
 * LibraryEntry zurueck, damit der Client sein `entries`-Signal ohne Extra-GET
 * aktualisieren kann.
 *
 * Abnahme-Schutz (auth aus auth.js): abgenommene Profile sind gegen jede
 * Schreiboperation ohne gueltigen AG-Schluessel gesperrt; unmarkierte bleiben
 * fuer alle frei. Abnehmen/Kennzeichen entfernen ist immer AG-exklusiv.
 */
export function profilesRouter(db, auth) {
  const r = Router();

  // Schreiboperationen auf abgenommene Profile nur mit gueltigem AG-Schluessel.
  const schutz = (req, res, next) => {
    if (db.abgenommen(req.params.id) && !auth.istAg(req))
      return res
        .status(403)
        .json({ error: 'von der BLK-AG abgenommen — Aenderung nur mit AG-Schluessel' });
    next();
  };

  // AG-exklusive Endpunkte (Abnahme setzen/entfernen).
  const nurAg = (req, res, next) => {
    if (!auth.konfiguriert)
      return res.status(403).json({ error: 'AG-Rolle auf dieser Instanz nicht konfiguriert' });
    if (!auth.istAg(req))
      return res.status(403).json({ error: 'gueltiger AG-Schluessel erforderlich' });
    next();
  };

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
  r.put('/profiles/:id', schutz, (req, res) => {
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
  r.patch('/profiles/:id', schutz, (req, res) => {
    const name = req.body?.name;
    const entry = db.rename(req.params.id, name ?? '');
    if (!entry) return res.status(404).json({ error: 'nicht gefunden' });
    res.json({ entry });
  });

  // delete.
  r.delete('/profiles/:id', schutz, (req, res) => {
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
  r.post('/profiles/:id/versions', schutz, (req, res) => {
    const { kommentar, automatisch } = req.body ?? {};
    const out = db.versionCreate(req.params.id, { kommentar, automatisch });
    if (!out) return res.status(404).json({ error: 'nicht gefunden' });
    res.status(out.skipped ? 200 : 201).json(out);
  });

  // Version wiederherstellen; sichert den Arbeitsstand vorher automatisch.
  r.post('/profiles/:id/versions/:vid/restore', schutz, (req, res) => {
    const out = db.versionRestore(req.params.id, req.params.vid);
    if (!out) return res.status(404).json({ error: 'nicht gefunden' });
    res.json(out);
  });

  // Version loeschen (idempotent); die referenzierte Abnahme-Version ist gesperrt.
  r.delete('/profiles/:id/versions/:vid', schutz, (req, res) => {
    const out = db.versionDelete(req.params.id, req.params.vid);
    if (out === 'abnahme')
      return res
        .status(409)
        .json({ error: 'Abnahme-Version — zuerst das Abnahme-Kennzeichen entfernen' });
    res.status(204).end();
  });

  // ── Abnahme (BLK-AG) ─────────────────────────────────────────────────

  // Abnehmen: friert den aktuellen Stand als Abnahme-Version ein.
  r.post('/profiles/:id/abnahme', nurAg, (req, res) => {
    const out = db.abnahmeSetzen(req.params.id, { kommentar: req.body?.kommentar });
    if (!out) return res.status(404).json({ error: 'nicht gefunden' });
    res.status(201).json(out);
  });

  // Kennzeichen entfernen (Referenz weg, Version bleibt).
  r.delete('/profiles/:id/abnahme', nurAg, (req, res) => {
    const entry = db.abnahmeEntfernen(req.params.id);
    if (!entry) return res.status(404).json({ error: 'nicht gefunden' });
    res.json({ entry });
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
