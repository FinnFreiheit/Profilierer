import { Router } from 'express';

/**
 * REST-API des zentralen Testdaten-Speichers. Spiegelt den Vertrag des
 * TestmessageStoreService (Client). Rohes XML wird als Text gehalten; der
 * schlanke Index (ohne xml) fuellt das `entries`-Signal im Frontend. Nachricht
 * und Fachmodul werden clientseitig aus dem Wurzelelement abgeleitet und im
 * Body mitgeliefert (Server bleibt "dumm", wie bei den Profilen).
 */
export function testmessagesRouter(db) {
  const r = Router();

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
  r.patch('/testmessages/:id', (req, res) => {
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
  r.delete('/testmessages/:id', (req, res) => {
    db.tmDelete(req.params.id);
    res.status(204).end();
  });

  return r;
}
