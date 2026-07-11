# ADR 0005: Node 24 via nvm + Chrome-for-Testing für Headless-Tests

- Status: Angenommen
- Datum: 26.07.10

## Kontext

Angular 20 (CLI 20.3) verlangt Node `^20.19 || ^22.12 || >=24`. Das System-Node ist 22.11 — knapp darunter, `ng` verweigert den Start. Zudem ist kein System-Chrome installiert, den Karma für Unit-Tests bräuchte.

## Entscheidung

- **Node:** Über `nvm` wird **Node 24** bereitgestellt; vor npm/ng-Befehlen `. "$HOME/.nvm/nvm.sh"; nvm use 24`.
- **Tests:** `puppeteer` als Dev-Abhängigkeit liefert „Chrome for Testing". `scripts/test-headless.mjs` ermittelt dessen Pfad und setzt `CHROME_BIN`, dann `ng test --watch=false --browsers=ChromeHeadless`. Aufruf über `npm run test:ci`. Kein eigenes `karma.conf.js` (das würde die Jasmine-Frameworks des `@angular/build:karma`-Builders verdrängen).

## Konsequenzen

- **Positiv:** Reproduzierbare Headless-Tests ohne System-Chrome; keine Node-Systeminstallation nötig.
- **Negativ:** `nvm use 24` muss vor jedem Terminal-Befehl gesourct werden (Shell-Zustand persistiert nicht über Tool-Aufrufe). Einmalig ggf. `npx puppeteer browsers install chrome`.
