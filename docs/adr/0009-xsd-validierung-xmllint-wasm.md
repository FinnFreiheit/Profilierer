# ADR 0009: XSD-Validierung im Browser mit xmllint-wasm

- Status: Angenommen
- Datum: 26.07.21

## Kontext

Anforderung: Es dürfen nur **schema-valide** XJustiz-Nachrichten exportiert werden;
alle Testnachrichten im Testdatenspeicher müssen valide sein — auch hochgeladene.
Browser bieten keine native XSD-Validierung, und die Schemata liegen zur Laufzeit
nur clientseitig vor: Neben den hinterlegten Versionen (`public/schemas/`) können
Nutzer eigene XSD-Ordner laden, die der Server nie sieht. Eine serverseitige
Validierung hätte diese Fälle nicht abgedeckt.

## Entscheidung

Die Validierung läuft **im Browser** über **xmllint-wasm** (libxml2 als
WebAssembly, läuft in einem Web Worker). Der `XmlValidationService` bestimmt aus
dem Wurzelelement Nachricht und Version, wählt die Schemaquelle (geladener Stand
aus `state.docs()`, re-serialisiert per `XMLSerializer`, sonst passende
hinterlegte Version per fetch) und übergibt die deklarierende Schemadatei als
Hauptschema plus alle übrigen als `preload` — libxml2 löst `xs:import`/`xs:include`
darüber auf.

**Packaging:** esbuild bündelt den `new Worker(...)`-Aufruf innerhalb von
node_modules nicht mit. Daher werden `index-browser.mjs`, `xmllint-browser.mjs`
und `xmllint.wasm` als **statische Assets** nach `xmllint/` kopiert (angular.json)
und zur Laufzeit per dynamischem `import()` mit Laufzeit-URL geladen — Worker und
.wasm lösen sich dann relativ zum Modul auf.

Tore (Ergebnis `valide`/`invalide`/`unpruefbar`; nicht prüfbar wird an Toren wie
invalide behandelt): Upload in den Testdatenspeicher (Ablehnung), Download aus dem
Speicher (Blockade), „Als neue Nachricht speichern" (Blockade), Beispiel-XML-Export
(Blockade), geführte Erstellung und Profil-Generierung (invalide ⇒ Entwurf).
„Nachricht laden" in den Baum warnt nur — invalide Nachrichten dürfen betrachtet
und repariert werden. Befunde zeigt der `ValidationReportService` im
`app-validation-dialog`.

## Konsequenzen

- **Positiv:** Präzise libxml2-Fehlermeldungen (Zeile + erwartete Elemente);
  funktioniert offline und für eigene XSD-Ordner; kein Initial-Bundle-Ballast
  (Assets laden erst bei der ersten Validierung); in Karma real testbar.
- **Negativ:** ~1,5 MB Assets (v. a. `xmllint.wasm`); Schemata werden je
  Validierung an den Worker übergeben (gecacht je `docs()`-Referenz bzw.
  Versions-id); Entwürfe der geführten Erstellung sind naturgemäß invalide und
  bleiben deshalb vom Download ausgeschlossen.
