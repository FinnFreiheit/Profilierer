# Tests

Wie Unit-Tests und End-to-End-Prüfungen laufen. Voraussetzung: Node ≥ 22.12 (Angular 20) — vorher `. "$HOME/.nvm/nvm.sh"; nvm use 24` (siehe [ADR 0005](adr/0005-node24-headless-tests.md)).

## Unit-Tests (headless)

```
npm run test:ci
```

- Ruft `scripts/test-headless.mjs`, das das per **puppeteer** installierte „Chrome for Testing" als `CHROME_BIN` setzt und `ng test --watch=false --browsers=ChromeHeadless` startet. So ist keine System-Chrome-Installation nötig.
- Einmalige Vorbereitung, falls der Browser fehlt: `npx puppeteer browsers install chrome`.
- Direkt (mit gesetztem `CHROME_BIN`): `npx ng test --watch=false --browsers=ChromeHeadless`.

**Abgedeckt** (Spec-Dateien neben den Quellen):
- `StateService` — `setElementProfile`/`pruneP`, Status-Zugriff, `effKard`, `addAusp`, **`removeAusp`-Kaskade**, `toggleOpen`, `fortschritt`.
- `XsdParserService` — `buildIndexFrom`, `particlesOfCT` (inkl. Vererbung), `enumsOfST`, `codelistOf`, `valueKind` gegen ein Inline-XSD-Fixture.
- `TreeService` — Aufbau/Expansion, `isLeaf`/`isRepeatable`, Ausprägungs-Kontext.
- `PersistenceService.loadXsdFiles` — End-to-End mit echten `File`-Objekten.
- `CodelistService` — `parseGenericode`, `mergeCodelist` (Versionsvergleich).
- `pretty.util` — `pretty`/`kardText`/`fmtKard`.

## End-to-End (Browser)

Für Integrationsprüfungen dienen kurze Puppeteer-Skripte gegen den laufenden Dev-Server (`npm start`, z. B. Port 4288). Zwei Besonderheiten:

- **Laden per Drag&Drop-Event:** Puppeteers `uploadFile` befüllt `webkitdirectory`-Inputs **nicht**. Stattdessen im Browser echte `File`-Objekte bauen und ein `drop`-Event auf `#main` auslösen — das trifft die `FileDropDirective` und den Lade-Pfad zugleich.

  ```js
  await page.evaluate((files) => {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(new File([f.text], f.name, { type: 'application/xml' }));
    document.querySelector('#main').dispatchEvent(
      new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }),
    );
  }, files);
  ```

- **Vergleichsordner (Diff):** Der versteckte `webkitdirectory`-Input lässt sich per `input.files = dt.files` + `dispatchEvent(new Event('change'))` befüllen.

Geprüfte Abläufe (Beispiele): Laden → Baum (943 Kästen), Profilieren + Autosave, SVG-Linien (Anzahl/Highlight), Export-Downloads (Schematron/XML/Excel), Diff 3.6.2 ↔ 4.0.0 (Dialog + Baum-Markierungen + Phantom-Kästen), Pfeiltasten-Navigation.

## Testdaten

- Version A: `/Users/finnfreiheit/code/XJustiz_3_6_2_XSD` (3.6.2, 74 Schemata, 151 Nachrichten).
- Vergleichsversion: `/Users/finnfreiheit/code/XJustiz_4.0.0_Schemata` (4.0.0).

## Nicht automatisiert geprüft

Der **reale XRepository-Netzabruf** (externer Dienst) ist treu portiert, aber nicht E2E-getestet; der Datei-/ZIP-Import und der Dev-Proxy-Pfad sind abgedeckt.
