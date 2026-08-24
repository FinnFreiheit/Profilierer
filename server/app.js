import express from 'express';
import { agAuth } from './auth.js';
import { profilesRouter } from './routes/profiles.js';
import { testmessagesRouter } from './routes/testmessages.js';
import { projekteRouter } from './routes/projekte.js';
import { schemasRouter } from './routes/schemas.js';
import { errorMiddleware } from './log.js';

/**
 * Montiert die komplette REST-API (Profil-Bibliothek, Testdaten-Speicher,
 * Projekte, Schemaquellen, Login-Pruefung) unter /api in eine Express-App — von index.js (Produktions-
 * server mit SPA/Proxy) und den HTTP-Tests gemeinsam genutzt.
 */
export function createApp(db, { agKey } = {}) {
  const auth = agAuth(agKey);
  const app = express();

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

  // Zentrale Error-Middleware (Stack auf die Konsole, JSON-Antwort).
  app.use(errorMiddleware);
  return app;
}
