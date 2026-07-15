import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { openDb } from './db.js';
import { profilesRouter } from './routes/profiles.js';
import { testmessagesRouter } from './routes/testmessages.js';

/**
 * Same-origin-Vollstack-Server: liefert die gebaute SPA, die REST-API unter
 * `/api` und proxied `/xrep-api` an XRepository (ersetzt den ng-serve-Dev-Proxy
 * im Produktivbetrieb). Einzelnutzer, keine Auth — Absicherung ueber Netz/
 * Reverse-Proxy.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.XJP_PORT) || 3001;
// Bind-Adresse: hinter einem Reverse-Proxy auf 127.0.0.1 einschraenken,
// damit der Node-Prozess nicht direkt aus dem Netz erreichbar ist.
const HOST = process.env.XJP_HOST || '';
const DB_PATH = process.env.XJP_DB || join(__dirname, 'data', 'profiles.db');
const DIST = join(__dirname, '..', 'dist', 'xjustiz-profilierer', 'browser');

const db = openDb(DB_PATH);
const app = express();

// Grosse Profil-Dokumente: elemente/auspraegungen-Maps sprengen das 100-kB-Default.
app.use(express.json({ limit: '25mb' }));

// Profil-API.
app.use('/api', profilesRouter(db));

// Testdaten-API (zentraler Testnachrichten-Speicher).
app.use('/api', testmessagesRouter(db));

// XRepository-Proxy (same-origin, loest den Produktions-Proxy-Bedarf).
app.use(
  '/xrep-api',
  createProxyMiddleware({
    target: 'https://www.xrepository.de/api',
    changeOrigin: true,
    pathRewrite: { '^/xrep-api': '' },
    headers: { 'User-Agent': 'XJustiz-Profilierer (Server-Proxy)' },
  }),
);

// Statische SPA + SPA-Catch-all (nur wenn gebaut vorhanden).
if (existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/xrep-api')) return next();
    res.sendFile(join(DIST, 'index.html'));
  });
} else {
  console.warn(`[xjp] SPA-Build nicht gefunden unter ${DIST} — nur API/Proxy aktiv (dev).`);
}

const onListen = () => {
  console.log(`[xjp] Server auf http://${HOST || 'localhost'}:${PORT}  (DB: ${DB_PATH})`);
};
if (HOST) app.listen(PORT, HOST, onListen);
else app.listen(PORT, onListen);
