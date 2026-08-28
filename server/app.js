import express from 'express';
import { agAuth } from './auth.js';
import { profilesRouter } from './routes/profiles.js';
import { testmessagesRouter } from './routes/testmessages.js';
import { projekteRouter } from './routes/projekte.js';
import { schemasRouter } from './routes/schemas.js';
import { kennzahlenRouter } from './routes/kennzahlen.js';
import { errorMiddleware } from './log.js';
import { nutzungZaehler } from './nutzung.js';

/**
 * Montiert die komplette REST-API (Profil-Bibliothek, Testdaten-Speicher,
 * Projekte, Schemaquellen, Kennzahlen, Login-Pruefung) unter /api in eine Express-App — von index.js
 * (Produktionsserver mit SPA/Proxy) und den HTTP-Tests gemeinsam genutzt.
 *
 * `nutzung: false` schaltet die Zaehlung ab (Tests, die keine Zeilen erzeugen
 * sollen). Sie haengt hier und nicht in index.js, damit die HTTP-Tests sie
 * ueberhaupt erreichen; der Zaehler liegt danach als app.locals.nutzung bereit
 * (flush() macht Tests deterministisch, ohne auf den Timer zu warten).
 */
export function createApp(db, { agKey, nutzung = true } = {}) {
  const auth = agAuth(agKey);
  const app = express();

  // Vor express.json: so zaehlen Parse-Fehler (400) mit, und die gemessene
  // Dauer enthaelt das Einlesen des Bodys.
  const zaehler = nutzung ? nutzungZaehler(db) : null;
  if (zaehler) app.use(zaehler.middleware);
  app.locals.nutzung = zaehler;

  // Grosse Profil-Dokumente: elemente/auspraegungen-Maps sprengen das 100-kB-Default.
  app.use(express.json({ limit: '25mb' }));

  // Login-Pruefung: validiert den Schluessel und meldet, ob die AG-Rolle auf
  // dieser Instanz ueberhaupt konfiguriert ist (Tippfehler vs. Konfiguration).
  app.post('/api/login', (req, res) => {
    res.json({ konfiguriert: auth.konfiguriert, ok: auth.pruefe(req.body?.key ?? '') });
  });

  app.use('/api', profilesRouter(db, auth));
  app.use('/api', testmessagesRouter(db, auth));
  app.use('/api', projekteRouter(db));
  app.use('/api', schemasRouter(db));
  app.use('/api', kennzahlenRouter(db, auth));

  // Zentrale Error-Middleware (Stack auf die Konsole, JSON-Antwort).
  app.use(errorMiddleware);
  return app;
}
