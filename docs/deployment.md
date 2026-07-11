# Betrieb / Deployment

Wie die App gebaut und betrieben wird — und die offene Frage zum XRepository-Proxy im Produktivbetrieb.

## Build

```
. "$HOME/.nvm/nvm.sh"; nvm use 24
npm ci        # oder: npm install
npm run build # → dist/xjustiz-profilierer/
```

Ergebnis ist eine statische Single-Page-App (Angular `@angular/build:application`). Ausliefern über einen beliebigen Static-Host/Webserver (Nginx, Caddy, Object-Storage + CDN, …). `index.html` mit `<base href="/">` — bei Unterpfad-Hosting `--base-href` anpassen.

**Bundle:** Initial ~230–280 kB; SheetJS (Excel) und JSZip (Codelisten-ZIP) sind **Lazy-Chunks** und werden erst beim jeweiligen Export/Import geladen ([ADR 0006](adr/0006-lazy-xlsx-jszip.md)).

## XRepository im Produktivbetrieb (offen)

Der Codelisten-Abruf spricht denselben Origin unter `/xrep-api/…` an. Im Entwicklungsbetrieb übernimmt das `proxy.conf.json` von `ng serve`. **Dieser Proxy gilt nicht für das gebaute Artefakt.** Für Produktion gibt es drei Wege:

1. **Reverse-Proxy** vor der App, der `/xrep-api/` an `https://www.xrepository.de/api/` weiterreicht — empfohlen. Nginx-Skizze:

   ```nginx
   location /xrep-api/ {
     proxy_pass https://www.xrepository.de/api/;
     proxy_set_header Host www.xrepository.de;
   }
   location / { try_files $uri /index.html; }
   ```

2. **Öffentliche CORS-Weiterleiter** — der bestehende Fallback in `CodelistService.xrepFetch` (nur mit Nutzer-Zustimmung; unzuverlässig).
3. **Datei-Import** — ZIP/Genericode über „Codelisten: Datei…" ganz ohne Netzabruf.

Siehe [ADR 0004](adr/0004-dev-proxy-xrepository.md). Die frühere Python-Variante liegt als Referenz unter `legacy/xrep-proxy.py`.

## Datenhaltung

Rein clientseitig: Autosave und Codelisten-Cache liegen in `localStorage` (`xjp.autosave`, `xjp.clcache`, `xjp.corsproxy`). Profile werden als JSON heruntergeladen/geladen. Keine Server-Persistenz.
