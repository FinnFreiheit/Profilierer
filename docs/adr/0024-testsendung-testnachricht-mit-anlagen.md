# ADR 0024: Testsendung — die Testnachricht mit Anlagen, die XML führt

- Status: Angenommen
- Datum: 26.10.25

## Kontext

Testnachrichten waren bislang genau eine XML-Instanz. In der Praxis kommt beim Empfänger eine **Sendung** an: `xjustiz_nachricht.xml` plus die Dateien, die ihr Schriftgutobjekt nennt — PDF, abgesetzte Signaturdatei (`….pdf.pkcs7`), XML-Repräsentate und als Original eingebundene XJustiz-Nachrichten (etwa Bescheid oder Unbedenklichkeitsbescheinigung im DABAG-Antrag). Das Schema beschreibt die Zuordnung bereits: `dokument/…/datei` mit `dateiname`, `bestandteil` und `dateiname.bezugsdatei`, samt Namensregeln in der Dokumentation von `dateiname`.

Epic #167, Entscheidungen aus dem Grilling vom 26.10.25.

## Entscheidung

1. **Keine eigene Entität.** Eine Testsendung ist eine Testnachricht mit **Anlagen**. Abnahme, Profil-Bindung, Projekt, Tags und Autor gelten unverändert; „Paket (ZIP) herunterladen" ist ein weiterer Export derselben Testnachricht.
2. **Die XML führt.** Die **Plätze** der Sendung leiten sich aus den `datei`-Elementen ab; eine Anlage ist über den exakten `dateiname` an ihren Platz gebunden. Aktionen, die neue Plätze schaffen, ändern die XML.
3. **Quellen einer Anlage:** Upload (gespeichert), eingebundene Testnachricht (lebender Verweis), Platzhalter-PDF und erzeugte Signatur (beide nicht gespeichert, beim Export erzeugt).
4. **Gebaut wird auf dem Server** (`GET /api/testmessages/:id/sendung`). Die **Paketprüfung** ist ein reines Modul ohne Framework- und Schema-Abhängigkeit (`server/sendung/pruefung.js`), das Server und Browser teilen.
5. **Prüfen warnt, sperrt nicht** — Testdaten dürfen absichtlich fehlerhaft sein.
6. **Signaturen:** abgesetzte CMS/CAdES-Signatur über die tatsächlich beigelegten Bytes, pro Export ein frischer, selbst signierter Schlüssel. Keine feste Test-CA.
7. **Ablage:** Uploads als Blob in SQLite (`testmessage_anlagen`), 20 MB pro Datei, 100 MB pro Sendung.
8. **Abnahme** friert das fertige ZIP ein; „geändert seit Abnahme" vergleicht fachlich.

Verworfen: **eigene Entität „Testsendung"** — Bindung, Projekt, Abnahme doppelt, und Nachricht und Paket könnten auseinanderlaufen. Verworfen: **das Paket führt** (Dateien bestimmen die XML) — zwei Wahrheiten. Verworfen: **Bau im Browser** — nicht per URL abrufbar, und die Abnahme müsste einen Blob durch den Browser reichen.

## Konsequenzen

- Positiv: Nachricht und Paket können nicht auseinanderlaufen; Befunde wie eine ins Leere zeigende Bezugsdatei werden sichtbar.
- Negativ: erzeugte Signaturen verifizieren mathematisch, enden aber bei „Zertifikat unbekannt". Der Server bekommt Abhängigkeiten für PDF, CMS und ZIP.
- Folgeaufgaben: Anlagen-Profilierung (eigenes Epic), Import ganzer ZIP-Pakete.
