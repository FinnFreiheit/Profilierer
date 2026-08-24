# ADR 0020: Von xjustiz.de geholte Schemaversionen liegen im Backend

- Status: Angenommen
- Datum: 26.08.24

## Kontext

Neben den im Projekt hinterlegten Schemata (`public/schemas/`, Manifest `index.json`) kann die Anwendung die auf [xjustiz.de](https://xjustiz.justiz.de) veröffentlichten Versionen abrufen (`RemoteSchemaService`, Proxy `/xjustiz-api`). Die abgerufenen Einträge landeten bisher ausschließlich im Signal `StateService.bundledVersions`, die entpackten ZIPs in einer Map des Dienstes — beides **nur im Speicher der laufenden Sitzung**.

Folge im Betrieb: Wer XJustiz 4.1.0 holte, fand sie nach dem nächsten Neuladen der Seite nicht mehr im Datenbasis-Umschalter. Die Version war „vergessen"; eine Profilierung oder Testnachricht dieser Version fand ihr Schema nicht (`Version nicht hinterlegt: 4.1.0`), und der Start setzte kommentarlos wieder die hinterlegte Standardversion (3.6.2). Der Nutzer formulierte die Erwartung am Vorbild der Codelisten: einmal geholt, bleibt es liegen — geändert wird nur auf Zuruf.

Randbedingungen: ein XSD-Paket wiegt ~3 MB (~120 Dateien). Der `localStorage` (~5 MB, dort liegt bereits der Codelisten-Cache) scheidet damit aus. Zur Wahl standen IndexedDB im Browser und das bestehende Backend.

## Entscheidung

Geholte Versionen liegen im **Backend** (SQLite, [ADR 0007](0007-datenbank-backend.md)) — nicht im Browser.

- **Ablage:** Tabelle `schemas` (`id` = Versionsnummer, `label`, `hinweis`, `zip_url`, `geholt`) plus `schema_files` (`schema_id`, `name`, `text`). REST unter `/api/schemas` (Liste · Dateien · PUT zum Ablegen/Ersetzen · DELETE). Ohne AG-Schlüssel: ein Schema trägt keine fachliche Aussage und kennt daher keine Abnahme (wie die Projekte).
- **Entpackt wird im Client.** Er holt das ZIP über denselben Proxy, mit dem er die Versionsseite liest, und liefert die XSD-Dateien fertig ab. Das erspart dem Server eine ZIP-Abhängigkeit und hält den Abrufweg an einer Stelle.
- **Eine Naht:** `BundledSchemaService.files(v)` entscheidet — hinterlegt (public/schemas) / gespeichert (Backend) / frisch von xjustiz.de. Gespeichertes wird bevorzugt gelesen; was fehlt, wird geholt und dabei abgelegt. `files(v, { erneuern: true })` übergeht die Ablage.
- **Nichts veraltet von selbst.** Der einzige Weg, an dem sich etwas ändert, ist „Von xjustiz.de aktualisieren": Versionsliste neu holen, dann die bereits **gespeicherten** Versionen ersetzen. Eine nur gelistete Version wird erst geholt, wenn jemand sie im Umschalter wählt — der Speicher wächst nicht ungefragt.
- **Die zuletzt aktive Datenbasis wird gemerkt** (`UiSettingsService`, localStorage): sie gehört zum Arbeitsplatz, nicht zum Bestand. Der Start kommt dorthin zurück und fällt bei einem Fehlschlag mit Hinweis auf die hinterlegte Standardversion zurück.

Verworfen: **IndexedDB** — pro Browser und beim Leeren der Website-Daten weg. Das Schema ist keine Arbeitsplatz-Einstellung, sondern die Grundlage, auf der alle an derselben Instanz arbeiten; eine geholte Version soll für jeden da sein, der die Instanz benutzt. Ebenso verworfen: **nur den Eintrag merken** und das ZIP bei jeder Nutzung neu ziehen — das wäre bei jedem Versionswechsel ein Netzzugriff, und ohne Proxy/Netz stünde die Version im Menü, ließe sich aber nicht laden.

## Konsequenzen

- **Positiv:** Eine einmal geholte Version bleibt wählbar — über Neuladen, Browserwechsel und Geräte hinweg, und für alle an derselben Instanz. Das Laden kommt danach aus dem Backend (schnell, ohne xjustiz.de). Profilierungen und Testnachrichten einer solchen Version finden ihr Schema wieder. Der Abruf bleibt eine bewusste Handlung, mit sichtbarem Abrufdatum im Tooltip des Umschalters.
- **Negativ / Folgeaufgaben:** Die DB wächst je gespeicherter Version um ~3 MB (Backup beachten). Ohne Backend gibt es keine gespeicherten Versionen — die hinterlegten Kopien bleiben davon unberührt und tragen den Betrieb weiter. Ein Löschen gespeicherter Versionen ist in der API vorgesehen (`DELETE /api/schemas/:id`), in der Oberfläche bisher nicht angeboten.
