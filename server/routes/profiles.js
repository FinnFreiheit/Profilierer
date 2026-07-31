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

  // Eine Version inkl. eingefrorenem Dokument (Vergleich "seit vX geaendert").
  // Bewusst ohne Schutz: GET /profiles/:id liefert das Arbeitsdokument ebenfalls
  // ungeprueft, der Abnahme-Schutz ist ausschliesslich ein Schreibschutz — und
  // die Transparenz ist hier der fachliche Zweck (vgl. /testmessages/:id/abnahme/xml).
  r.get('/profiles/:id/versions/:vid', (req, res) => {
    const ver = db.versionGet(req.params.id, req.params.vid);
    if (!ver) return res.status(404).json({ error: 'nicht gefunden' });
    res.json(ver);
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

  // ── Hinweise (eigene Ressource unterhalb der Profilierung) ───────────
  // Bewusst NICHT ueber PUT /profiles/:id: ein Volldokument-Schreiben (Autosave
  // eines anderen Bearbeiters) darf fremde Hinweise nicht loeschen. Der
  // Abnahme-Schutz gilt hier wie ueberall — abgenommene Profile sind fuer
  // Externe auch bei Hinweisen gesperrt.

  // Liste (fuer alle lesbar, wie das Dokument selbst).
  r.get('/profiles/:id/hinweise', (req, res) => {
    const liste = db.hinweiseList(req.params.id);
    if (!liste) return res.status(404).json({ error: 'nicht gefunden' });
    res.json(liste);
  });

  // Anlegen; Zeitpunkt und Rolle stempelt der Server (Issue #40). Der Name ist
  // Selbstauskunft und kommt aus dem Body; die Rolle leitet sich allein aus dem
  // mitgeschickten AG-Schluessel ab — nur so bleibt sie belastbar. Ein vom
  // Client gesetztes `rolle`/`zeit` wird nicht durchgereicht.
  //
  // **Ohne `schutz`** (Issue #42): an einer abgenommenen Profilierung darf
  // jeder einen Hinweis anlegen — genau dort entsteht der meiste
  // Rueckmeldebedarf. Das Profil-Dokument bleibt unberuehrt, das
  // Abnahme-Kennzeichen ebenso; der Schreibschutz auf allen uebrigen
  // Endpunkten gilt unveraendert.
  r.post('/profiles/:id/hinweise', (req, res) => {
    const { pfad, text, autor } = req.body ?? {};
    if (!String(text ?? '').trim()) return res.status(400).json({ error: 'kein Text' });
    const hinweis = db.hinweisAnlegen(
      req.params.id,
      { pfad, text, autor },
      undefined,
      auth.istAg(req) ? 'ag' : 'extern',
    );
    if (!hinweis) return res.status(404).json({ error: 'nicht gefunden' });
    res.status(201).json({ hinweis });
  });

  // Volltausch (JSON-Import einer Profildatei) — ersetzt, fuehrt nicht zusammen.
  r.put('/profiles/:id/hinweise', schutz, (req, res) => {
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Array erwartet' });
    const liste = db.hinweiseErsetzen(req.params.id, req.body);
    if (!liste) return res.status(404).json({ error: 'nicht gefunden' });
    res.json(liste);
  });

  // Aendern, Loeschen und Erledigt-Setzen sind an einer abgenommenen
  // Profilierung der AG vorbehalten (Issue #42) — sonst raeumte ein Externer
  // fremde Rueckmeldungen weg. **Einzige Ausnahme:** der Urheber darf seinen
  // eigenen, gerade angelegten Eintrag noch korrigieren oder zuruecknehmen; er
  // weist sich mit dem Geheimnis aus, das er beim Anlegen zurueckbekommen hat
  // (Header `x-hinweis-token`). Die id taugt dafuer nicht — die Liste ist fuer
  // alle lesbar.
  const hinweisSchutz = (req, res, next) => {
    if (!db.abgenommen(req.params.id) || auth.istAg(req)) return next();
    if (db.hinweisIstUrheber(req.params.id, req.params.hid, req.get('x-hinweis-token') ?? ''))
      return next();
    return res.status(403).json({
      error: 'von der BLK-AG abgenommen — fremde Hinweise ändern nur mit AG-Schluessel',
    });
  };

  // Text aendern und/oder abhaken.
  r.patch('/profiles/:id/hinweise/:hid', hinweisSchutz, (req, res) => {
    const { text, erledigt } = req.body ?? {};
    const hinweis = db.hinweisAendern(req.params.id, req.params.hid, { text, erledigt });
    if (hinweis === 'leer') return res.status(400).json({ error: 'kein Text' });
    if (!hinweis) return res.status(404).json({ error: 'nicht gefunden' });
    res.json({ hinweis });
  });

  // Loeschen.
  r.delete('/profiles/:id/hinweise/:hid', hinweisSchutz, (req, res) => {
    if (!db.hinweisLoeschen(req.params.id, req.params.hid))
      return res.status(404).json({ error: 'nicht gefunden' });
    res.status(204).end();
  });

  // Teilbaum loeschen (`?praefix=<pfad>`): der Client raeumt damit die Hinweise
  // einer entfernten Auspraegung oder Schema-Erweiterung mit ab. Kein Treffer
  // ist kein Fehler — der Aufrufer weiss nicht, ob im Ast Hinweise hingen.
  r.delete('/profiles/:id/hinweise', schutz, (req, res) => {
    const praefix = typeof req.query.praefix === 'string' ? req.query.praefix : '';
    if (!praefix) return res.status(400).json({ error: 'praefix fehlt' });
    if (!db.hinweiseList(req.params.id)) return res.status(404).json({ error: 'nicht gefunden' });
    res.json({ entfernt: db.hinweiseLoeschenUnter(req.params.id, praefix) });
  });

  // ── Abnahme (BLK-AG) ─────────────────────────────────────────────────

  // Die eingefrorene Abnahme-Fassung inkl. Dokument (Direkteinstieg fuer den
  // Vergleich, ohne die Versionsliste zu durchsuchen). Wie oben: fuer alle lesbar.
  r.get('/profiles/:id/abnahme', (req, res) => {
    const ver = db.abnahmeVersion(req.params.id);
    if (!ver) return res.status(404).json({ error: 'nicht abgenommen' });
    res.json(ver);
  });

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
