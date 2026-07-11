# ADR 0007: Profil-Persistenz über ein self-hosted Node/SQLite-Backend

- Status: Angenommen
- Datum: 26.07.11

## Kontext

Die Profil-Bibliothek lag bisher ausschließlich im `localStorage` des Browsers (gekapselt im `ProfileStoreService`). Damit waren Profilierungen an einen einzelnen Browser gebunden, nicht geräteübergreifend nutzbar und durch das localStorage-Quota begrenzt. Ziel: die erstellten Profilierungen zentral persistieren.

Randbedingungen (mit dem Nutzer abgestimmt): eigenes, **self-hosted** Backend (kein Managed Cloud — ERV-/Justiz-Datenkontext), **Einzelnutzer ohne Login**, bestehende localStorage-Profile werden **einmalig migriert**.

## Entscheidung

Ein **Node/Express-Backend mit SQLite** (`server/`) übernimmt die Profil-Persistenz als **Same-origin-Vollstack**: derselbe Prozess liefert im Produktivbetrieb die gebaute SPA, stellt die REST-API unter `/api` bereit und proxied `/xrep-api` an XRepository — das löst zugleich den in [ADR 0004](0004-dev-proxy-xrepository.md) offen gelassenen Produktions-Proxy-Punkt.

- **DB:** eine Tabelle `profiles` — das komplette `ProfileDoc` als JSON-Spalte `doc`, daneben die abgeleiteten Index-Spalten (Name/Nachricht/Version/Fortschritt/Zeitstempel). Aus den Index-Spalten wird die schlanke `LibraryEntry`-Liste (`GET /api/profiles`) ohne Deserialisierung der großen `elemente`/`auspraegungen`-Maps gerendert. Bibliothek: `better-sqlite3` (synchrone API; `node:sqlite` als Fallback).
- **Client:** `ProfileStoreService` bleibt die einzige Persistenz-Kapsel, spricht das Backend aber per **nativem fetch** an (konsistent mit `BundledSchemaService`/`CodelistService`; kein `provideHttpClient`, keine `environments/`). Sein 8-Methoden-Vertrag wird von synchron auf `Promise` umgestellt; das reaktive `entries`-Signal bleibt als Fassade und wird nach jedem Schreib-Call mit dem vom Server gelieferten `LibraryEntry` gepflegt (kein Voll-Reload pro Autosave).
- **Migration:** ein `MigrationService` übernimmt die localStorage-Bibliothek einmalig und idempotent ins Backend (nur wenn das Backend leer ist; Marker `xjp.migrated`; localStorage bleibt als Sicherheitskopie erhalten).
- **Kein Auth:** Absicherung erfolgt über Netz/Reverse-Proxy (internes Netz/VPN).

## Konsequenzen

- **Positiv:** Profile zentral, geräteübergreifend, teamfähig persistiert; ein einziges Werkzeug (`npm run start:prod`) liefert SPA + API + XRepository-Proxy same-origin (kein CORS, löst ADR-0004-Offenpunkt); Index/Doc-Trennung bleibt sauber auf Spalten einer Zeile abgebildet.
- **Negativ / Folgeaufgaben:** neuer Betriebs-Baustein (Node-Prozess + SQLite-Datei sichern; Env `XJP_PORT`/`XJP_DB`); der synchron→async-Umbau betrifft `PersistenceService` (Autosave mit In-Flight-Reschedule, Fehler-Toasts) und die Dashboard-Handler; bei Backend-Ausfall bleibt der Editor-Zustand erhalten, wird aber nicht persistiert (Toast). Kein Mehrbenutzer-/Auth-Modell — bewusst offen gelassen, bis ein solcher Bedarf entsteht.
