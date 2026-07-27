import { Router } from 'express';

/**
 * REST-API des zentralen Testdaten-Speichers. Spiegelt den Vertrag des
 * TestmessageStoreService (Client). Rohes XML wird als Text gehalten; der
 * schlanke Index (ohne xml) fuellt das `entries`-Signal im Frontend. Nachricht
 * und Fachmodul werden clientseitig aus dem Wurzelelement abgeleitet und im
 * Body mitgeliefert (Server bleibt "dumm", wie bei den Profilen).
 */
export function testmessagesRouter(db, auth) {
  const r = Router();

  // Schreiboperationen auf abgenommene Testnachrichten nur mit AG-Schluessel.
  const schutz = (req, res, next) => {
    if (db.tmAbgenommen(req.params.id) && !auth.istAg(req))
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

  // Index: schlanke Liste ohne xml, sortiert.
  r.get('/testmessages', (_req, res) => {
    res.json(db.tmList());
  });

  // Roh-XML einer Testnachricht (Download/Vorschau).
  r.get('/testmessages/:id/xml', (req, res) => {
    const xml = db.tmLoadXml(req.params.id);
    if (xml == null) return res.status(404).json({ error: 'nicht gefunden' });
    res.type('application/xml').send(xml);
  });

  // Entscheidungsstand einer gefuehrt erstellten Testnachricht (JSON).
  r.get('/testmessages/:id/entscheidungen', (req, res) => {
    const stand = db.tmLoadEntscheidungen(req.params.id);
    if (stand == null) return res.status(404).json({ error: 'kein Entscheidungsstand' });
    res.json(stand);
  });

  // Anlegen: id serverseitig.
  r.post('/testmessages', (req, res) => {
    const b = req.body;
    if (!b || typeof b !== 'object' || typeof b.xml !== 'string' || !b.xml.trim())
      return res.status(400).json({ error: 'kein XML' });
    res.status(201).json(db.tmCreate(b));
  });

  // Felder ändern (Notiz/Name; gefuehrte Erstellung zusätzlich XML,
  // Entwurfs-Kennzeichen, Fortschritt, Entscheidungsstand).
  r.patch('/testmessages/:id', schutz, (req, res) => {
    const { notiz, name, xml, entwurf, fortschritt, entscheidungen } = req.body ?? {};
    if (xml !== undefined && (typeof xml !== 'string' || !xml.trim()))
      return res.status(400).json({ error: 'kein XML' });
    const entry = db.tmUpdate(req.params.id, {
      notiz,
      name,
      xml,
      entwurf,
      fortschritt,
      entscheidungen,
    });
    if (!entry) return res.status(404).json({ error: 'nicht gefunden' });
    res.json({ entry });
  });

  // Löschen.
  r.delete('/testmessages/:id', schutz, (req, res) => {
    db.tmDelete(req.params.id);
    res.status(204).end();
  });

  // ── Abnahme (BLK-AG) ─────────────────────────────────────────────────

  // Eingefrorene Abnahme-Fassung (Anzeige/Download) — fuer alle lesbar.
  r.get('/testmessages/:id/abnahme/xml', (req, res) => {
    const xml = db.tmLoadAbnahmeXml(req.params.id);
    if (xml == null) return res.status(404).json({ error: 'nicht abgenommen' });
    res.type('application/xml').send(xml);
  });

  // Abnehmen: friert die aktuelle XML-Fassung ein; Neuabnahme ersetzt sie.
  r.post('/testmessages/:id/abnahme', nurAg, (req, res) => {
    const entry = db.tmAbnahmeSetzen(req.params.id, { kommentar: req.body?.kommentar });
    if (!entry) return res.status(404).json({ error: 'nicht gefunden' });
    res.status(201).json({ entry });
  });

  // Kennzeichen samt eingefrorener Fassung entfernen.
  r.delete('/testmessages/:id/abnahme', nurAg, (req, res) => {
    const entry = db.tmAbnahmeEntfernen(req.params.id);
    if (!entry) return res.status(404).json({ error: 'nicht gefunden' });
    res.json({ entry });
  });

  return r;
}
