import express, { Router } from 'express';
import { ANLAGE_MAX } from '../db.js';
import { bauen, planen } from '../sendung/bau.js';
import { zaehle } from '../sendung/pruefung.js';

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

  // Index: schlanke Liste ohne xml, sortiert. `?profil=<id>` grenzt auf die an
  // eine Profilierung gebundenen Nachrichten ein.
  r.get('/testmessages', (req, res) => {
    const profil = typeof req.query.profil === 'string' ? req.query.profil : undefined;
    res.json(db.tmList({ profil }));
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

  // Bezeichnungen der benannten Vorkommen (JSON) — Beiwerk zum XML, das die
  // Nachricht selbst nicht tragen kann. Fehlen sie, greifen beim Oeffnen die
  // generischen Namen aus dem Import; 404 ist daher der Normalfall.
  r.get('/testmessages/:id/bezeichnungen', (req, res) => {
    const bez = db.tmLoadBezeichnungen(req.params.id);
    if (bez == null) return res.status(404).json({ error: 'keine Bezeichnungen' });
    res.json(bez);
  });

  // Eingefrorene Kopie der gebundenen Profilfassung (Vorgabe des Durchlaufs).
  r.get('/testmessages/:id/vorgabe', (req, res) => {
    const vorgabe = db.tmLoadVorgabe(req.params.id);
    if (vorgabe == null) return res.status(404).json({ error: 'keine Profil-Bindung' });
    res.json(vorgabe);
  });

  // Profilbindung loesen (#32): die eingefrorene Kopie faellt weg, die Herkunft
  // bleibt als Historie stehen. Bewusst ein eigener Endpunkt und nicht Teil des
  // PATCH — die Kopie entsteht nur beim Anlegen und darf sonst unberuehrt sein.
  r.delete('/testmessages/:id/vorgabe', schutz, (req, res) => {
    const entry = db.tmBindungLoesen(req.params.id);
    if (!entry) return res.status(404).json({ error: 'nicht gefunden' });
    res.json({ entry });
  });

  // Anlegen: id serverseitig. Der Autor ist **Pflicht** -- eine Testnachricht
  // ohne Ersteller ist in der AG nicht nachzuhalten (wer hat sie gebaut, wen
  // fragt man bei einem Befund?). Erzwungen wird sie hier und nicht in der
  // Spalte: Altbestaende tragen keinen Autor und bleiben aenderbar.
  r.post('/testmessages', (req, res) => {
    const b = req.body;
    if (!b || typeof b !== 'object' || typeof b.xml !== 'string' || !b.xml.trim())
      return res.status(400).json({ error: 'kein XML' });
    if (typeof b.autor !== 'string' || !b.autor.trim())
      return res.status(400).json({ error: 'Autor erforderlich' });
    res.status(201).json(db.tmCreate(b));
  });

  // Variante anlegen (#133): Kopie mit derselben Profil-Bindung, aus der die
  // naechste Auspraegung entsteht. Bewusst ohne `schutz` — aus einer
  // freigegebenen Nachricht eine Variante abzuleiten ruehrt das Original nicht
  // an, und gerade die freigegebenen sind die guten Ausgangspunkte.
  r.post('/testmessages/:id/duplicate', (req, res) => {
    const { name, autor } = req.body ?? {};
    if (name !== undefined && typeof name !== 'string')
      return res.status(400).json({ error: 'kein Name' });
    if (autor !== undefined && typeof autor !== 'string')
      return res.status(400).json({ error: 'kein Autor' });
    // Ohne Angabe bleibt der Autor des Originals stehen -- anders als beim
    // Anlegen wird hier nichts erzwungen: die Kopie eines Altbestands soll
    // nicht daran scheitern, dass das Original keinen Autor traegt.
    const out = db.tmDuplicate(req.params.id, undefined, name, autor);
    if (!out) return res.status(404).json({ error: 'nicht gefunden' });
    res.status(201).json(out);
  });

  // Felder ändern (Notiz/Name/Schlagworte; beim Bearbeiten zusätzlich XML,
  // Entwurfs-Kennzeichen, Fortschritt, Entscheidungsstand, Bezeichnungen).
  // Profil-Bindung und eingefrorene Kopie bleiben unberuehrt — sie entstehen
  // nur beim Anlegen.
  r.patch('/testmessages/:id', schutz, (req, res) => {
    const { notiz, name, autor, tags, xml, entwurf, fortschritt, entscheidungen, bezeichnungen } =
      req.body ?? {};
    if (xml !== undefined && (typeof xml !== 'string' || !xml.trim()))
      return res.status(400).json({ error: 'kein XML' });
    // Der Autor laesst sich berichtigen, aber nicht wegnehmen: was einmal einen
    // Ersteller hat, behaelt ihn (dieselbe Aussage wie die Pflicht am POST).
    if (autor !== undefined && (typeof autor !== 'string' || !autor.trim()))
      return res.status(400).json({ error: 'Autor erforderlich' });
    const entry = db.tmUpdate(req.params.id, {
      notiz,
      name,
      autor,
      tags,
      xml,
      entwurf,
      fortschritt,
      entscheidungen,
      bezeichnungen,
    });
    if (!entry) return res.status(404).json({ error: 'nicht gefunden' });
    res.json({ entry });
  });

  // Nachtraeglich einem Kommunikationsszenario zuordnen (#141) -- der Weg fuer
  // hochgeladene Nachrichten, die fachlich laengst zu einem Szenario gehoeren.
  // Gesetzt wird nur die Herkunft, nicht die eingefrorene Vorgabe (siehe
  // db.tmZuordnen).
  //
  // Bewusst OHNE `schutz`, wie die Ablage-Endpunkte (ADR 0019): die Zuordnung
  // ruehrt weder das XML noch den Abnahme-Stand noch die Konformitaet an -- sie
  // sagt, wohin die Nachricht gehoert, nicht was in ihr steht. Mit Schutz liefe
  // die Funktion genau fuer den Bestand ins Leere, fuer den sie gedacht ist:
  // die freigegebenen Beispielnachrichten, die als Datei hereinkamen.
  r.put('/testmessages/:id/profil', (req, res) => {
    const { profilId } = req.body ?? {};
    if (profilId !== null && typeof profilId !== 'string')
      return res.status(400).json({ error: 'profilId fehlt' });
    const out = db.tmZuordnen(req.params.id, { profilId });
    if (!out) return res.status(404).json({ error: 'nicht gefunden' });
    if (out.fehler === 'gebunden')
      return res.status(409).json({
        error: 'an eine Profilfassung gebunden — erst die Bindung lösen, dann neu zuordnen',
      });
    if (out.fehler === 'unbekanntes-profil')
      return res.status(400).json({ error: 'Profilierung nicht gefunden' });
    res.json({ entry: out.entry });
  });

  // Einsortieren (#134): Schlagworte immer, das Projekt nur bei ungebundenen
  // Nachrichten -- gebundene erben es von ihrer Profilierung, ein zweiter
  // Pflegeort erzeugte nur Widersprueche. Ohne `schutz`, aus demselben Grund
  // wie bei den Profilierungen: Ablage ist keine fachliche Aussage.
  r.patch('/testmessages/:id/ablage', (req, res) => {
    const { projektId, tags } = req.body ?? {};
    const out = db.tmEinsortieren(req.params.id, { projektId, tags });
    if (!out) return res.status(404).json({ error: 'nicht gefunden' });
    if (out.fehler === 'gebunden')
      return res.status(409).json({
        error: 'an eine Profilierung gebunden — das Projekt folgt der Profilierung',
      });
    res.json({ entry: out.entry });
  });

  // Löschen.
  r.delete('/testmessages/:id', schutz, (req, res) => {
    db.tmDelete(req.params.id);
    res.status(204).end();
  });

  // ── Anlagen (Testsendung, ADR 0024) ──────────────────────────────────
  //
  // Schluessel ist der exakte `dateiname` aus dem datei-Element der XML; er
  // steht URL-kodiert im Pfad. Der Upload kommt roh (kein JSON, kein
  // multipart), der Autor als URL-kodierter Header `x-autor`.

  r.get('/testmessages/:id/anlagen', (req, res) => {
    const liste = db.anlList(req.params.id);
    if (liste == null) return res.status(404).json({ error: 'nicht gefunden' });
    res.json(liste);
  });

  r.get('/testmessages/:id/anlagen/:dateiname', (req, res) => {
    const a = db.anlLaden(req.params.id, req.params.dateiname);
    if (!a) return res.status(404).json({ error: 'keine Anlage' });
    res
      .type(a.mime || 'application/octet-stream')
      .attachment(a.dateiname)
      .send(a.daten);
  });

  // Ablegen oder ersetzen. Die 413 der Einzelgrenze wirft schon der
  // Body-Parser (express.raw), die der Summe die Ablage.
  r.put(
    '/testmessages/:id/anlagen/:dateiname',
    schutz,
    express.raw({ type: () => true, limit: ANLAGE_MAX }),
    (req, res) => {
      const daten = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!daten.length) return res.status(400).json({ error: 'leere Datei' });
      const out = db.anlAblegen(req.params.id, {
        dateiname: req.params.dateiname,
        mime: req.get('content-type'),
        daten,
        autor: decodeURIComponent(req.get('x-autor') ?? ''),
      });
      if (out.fehler === 'unbekannt') return res.status(404).json({ error: 'nicht gefunden' });
      if (out.fehler === 'datei-zu-gross')
        return res.status(413).json({ error: 'Datei größer als 20 MB' });
      if (out.fehler === 'sendung-zu-gross')
        return res.status(413).json({ error: 'Anlagen der Sendung zusammen größer als 100 MB' });
      res.status(201).json(out.anlage);
    },
  );

  r.delete('/testmessages/:id/anlagen/:dateiname', schutz, (req, res) => {
    if (!db.anlEntfernen(req.params.id, req.params.dateiname))
      return res.status(404).json({ error: 'keine Anlage' });
    res.status(204).end();
  });

  // ── Testsendung (ADR 0024) ───────────────────────────────────────────

  const laden = (id) => db.sendungQuelle(id);

  // Plan und Befunde ohne Bau (Sendungs-Ansicht, Kachel): je Datei die Quelle,
  // eingebundene Nachrichten rekursiv (`herkunft`).
  r.get('/testmessages/:id/sendung/pruefung', (req, res) => {
    const quelle = laden(req.params.id);
    if (!quelle) return res.status(404).json({ error: 'nicht gefunden' });
    const plan = planen(quelle, laden);
    res.json({
      plaetze: plan.plaetze,
      dateien: plan.dateien.map((d) => ({
        dateiname: d.dateiname,
        quelle: d.quelle,
        herkunft: d.herkunft,
        zielId: d.zielId,
      })),
      befunde: plan.befunde,
    });
  });

  // Das Paket (ZIP). Befunde sperren nicht — die Zahlen stehen im Header, die
  // Rueckfrage "trotzdem herunterladen" stellt der Client.
  r.get('/testmessages/:id/sendung', async (req, res, next) => {
    try {
      const quelle = laden(req.params.id);
      if (!quelle) return res.status(404).json({ error: 'nicht gefunden' });
      const { zip, plan } = await bauen(quelle, laden);
      const { fehler, hinweise } = zaehle(plan.befunde);
      const basis = quelle.name.replace(/\.xml$/i, '');
      res
        .set('x-sendung-fehler', String(fehler))
        .set('x-sendung-hinweise', String(hinweise))
        .type('application/zip')
        .attachment(`${basis}_sendung.zip`)
        .send(zip);
    } catch (e) {
      next(e);
    }
  });

  // ── Eingebundene Testnachrichten (Testsendung S5) ────────────────────

  r.get('/testmessages/:id/einbindungen', (req, res) => {
    const liste = db.einbList(req.params.id);
    if (liste == null) return res.status(404).json({ error: 'nicht gefunden' });
    res.json(liste);
  });

  // Welche Ziele einen Zyklus schloessen (Auswahl graut sie aus).
  r.get('/testmessages/:id/vorfahren', (req, res) => {
    res.json(db.tmVorfahren(req.params.id));
  });

  r.put('/testmessages/:id/einbindungen/:dateiname', schutz, (req, res) => {
    const { zielId, autor } = req.body ?? {};
    if (typeof zielId !== 'string' || !zielId)
      return res.status(400).json({ error: 'zielId fehlt' });
    const out = db.einbSetzen(req.params.id, {
      dateiname: req.params.dateiname,
      zielId,
      autor: typeof autor === 'string' ? autor : undefined,
    });
    if (out.fehler === 'unbekannt') return res.status(404).json({ error: 'nicht gefunden' });
    if (out.fehler === 'ziel-unbekannt')
      return res.status(400).json({ error: 'Testnachricht zum Einbinden nicht gefunden' });
    if (out.fehler === 'zyklus')
      return res
        .status(409)
        .json({ error: 'Zyklus — die gewählte Nachricht bindet diese (mittelbar) ein' });
    res.status(201).json(out.einbindung);
  });

  r.delete('/testmessages/:id/einbindungen/:dateiname', schutz, (req, res) => {
    if (!db.einbEntfernen(req.params.id, req.params.dateiname))
      return res.status(404).json({ error: 'keine Einbindung' });
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
