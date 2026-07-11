# ADR 0004: Angular-Dev-Proxy für XRepository statt Python-Helfer

- Status: Angenommen
- Datum: 26.07.10

## Kontext

Das XRepository sendet keine CORS-Freigabe; ein Direktabruf aus dem Browser scheitert. Die Alt-App löste das über einen mitgelieferten Python-Start-Helfer (`xrep-proxy.py`), der die App servierte und `/xrep-api/…` same-origin durchreichte. Mit dem Wechsel zu Angular gibt es bereits einen Dev-Server (`ng serve`).

## Entscheidung

Im Entwicklungsbetrieb übernimmt der **Angular-Dev-Proxy** (`proxy.conf.json`) die Durchreichung von `/xrep-api/` an `https://www.xrepository.de/api/`. `CodelistService.xrepFetch` ruft weiterhin die relative URL `xrep-api/…` (same-origin). Der Fallback über öffentliche CORS-Weiterleiter (nur mit Nutzer-Zustimmung) bleibt erhalten. `xrep-proxy.py` bleibt als Referenz unter `legacy/`.

## Konsequenzen

- **Positiv:** Kein zusätzlicher Python-Prozess im Dev-Betrieb; ein Werkzeug (`npm start`).
- **Negativ / offen:** `proxy.conf.json` gilt **nur für `ng serve`**, nicht für das gebaute Artefakt. Der Produktivbetrieb braucht einen Reverse-Proxy (Nginx-Beispiel in [Deployment](../deployment.md)), sonst greifen nur CORS-Fallback oder Datei-Import. Diese Entscheidung ist bewusst offen gelassen, bis das Zielhosting feststeht.
