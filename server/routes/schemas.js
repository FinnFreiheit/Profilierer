import { Router } from 'express';

/** Obergrenze je Version — ein XJustiz-Paket liegt bei ~3 MB / ~120 Dateien. */
const MAX_DATEIEN = 2000;

/**
 * REST-API der von xjustiz.de geholten Schemaversionen. Sie lagen bisher nur im
 * Speicher des Browsers: nach dem Neuladen war eine frisch abgerufene Version
 * (z. B. 4.1.0) wieder aus dem Umschalter verschwunden, und eine daran haengende
 * Profilierung fand ihr Schema nicht mehr. Hier bleiben sie liegen -- neben den
 * im Projekt hinterlegten Kopien (public/schemas/) -- bis sie auf Zuruf
 * aktualisiert werden.
 *
 * **Entpackt wird im Client**: er holt das ZIP ueber denselben Proxy, mit dem er
 * die Versionsseite liest, und liefert die XSD-Dateien fertig hier ab (PUT). Das
 * spart dem Server eine ZIP-Abhaengigkeit und haelt den Abrufweg an einer
 * Stelle. Der Server ist reine Ablage und faellt kein Urteil ueber den Inhalt.
 *
 * Schemata tragen keine fachliche Aussage und kennen daher keine Abnahme; der
 * AG-Schluessel spielt hier keine Rolle (wie bei den Projekten).
 */
export function schemasRouter(db) {
  const r = Router();

  r.get('/schemas', (_req, res) => {
    res.json(db.schemaList());
  });

  r.get('/schemas/:id/files', (req, res) => {
    const dateien = db.schemaDateien(req.params.id);
    if (!dateien.length) return res.status(404).json({ error: 'nicht gespeichert' });
    res.json(dateien);
  });

  /** Ablegen oder ersetzen (Aktualisieren) -- id ist die Versionsnummer. */
  r.put('/schemas/:id', (req, res) => {
    const { label, hinweis, zipUrl, files } = req.body ?? {};
    if (!Array.isArray(files) || !files.length)
      return res.status(400).json({ error: 'keine Dateien' });
    if (files.length > MAX_DATEIEN) return res.status(400).json({ error: 'zu viele Dateien' });
    const sauber = [];
    for (const f of files) {
      const name = String(f?.name ?? '').trim();
      const text = f?.text;
      if (!name || typeof text !== 'string')
        return res.status(400).json({ error: 'Datei ohne Namen oder Inhalt' });
      sauber.push({ name, text });
    }
    res.json({
      entry: db.schemaSpeichern({ id: req.params.id, label, hinweis, zipUrl, files: sauber }),
    });
  });

  r.delete('/schemas/:id', (req, res) => {
    db.schemaLoeschen(req.params.id);
    res.status(204).end();
  });

  return r;
}
