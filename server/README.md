# Backend (Profil-Bibliothek)

Node/Express + SQLite. Liefert same-origin die REST-API (`/api`), im Produktivbetrieb
zusätzlich die gebaute SPA und den XRepository-Proxy (`/xrep-api`). Einzelnutzer,
keine Auth — Absicherung über Netz/Reverse-Proxy. Siehe [ADR 0007](../docs/adr/0007-datenbank-backend.md).

## Start

```
cd server && npm install     # einmalig (better-sqlite3, express, http-proxy-middleware)
node index.js                # oder aus dem Root: npm run server
```

Produktiv (SPA bauen + ausliefern): im Root `npm run start:prod`.
Entwicklung (ng serve + Backend parallel): im Root `npm run dev`.

## Konfiguration (Env)

| Variable | Default | Zweck |
|---|---|---|
| `XJP_PORT` | `3001` | HTTP-Port |
| `XJP_DB` | `server/data/profiles.db` | SQLite-Datei (WAL-Modus) |

## API

`GET /api/profiles` · `GET /api/profiles/:id` · `POST /api/profiles` ·
`PUT /api/profiles/:id` · `POST /api/profiles/:id/duplicate` ·
`PATCH /api/profiles/:id` · `DELETE /api/profiles/:id` · `POST /api/import` (Migration).

Datenmodell (Tabelle `profiles`, Index/Doc-Spaltentrennung): [docs/data-model.md](../docs/data-model.md).

## Backup

Die SQLite-Datei aus `XJP_DB` sichern (bei WAL zusätzlich `*-wal`/`*-shm`).

## Tests

```
cd server && node --test
```

## Hinweis: SQLite-Treiber

`better-sqlite3` bringt ein natives Binary mit. Blockiert die Umgebung dessen
Install-Skript, greift Node 24s eingebautes `node:sqlite` als Fallback
(gleiche synchrone API-Idee, `DatabaseSync`).
