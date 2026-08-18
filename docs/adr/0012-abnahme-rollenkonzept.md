# ADR 0012: Abnahme durch die BLK-AG — Zwei-Rollen-Konzept mit gemeinsamem Schlüssel

- Status: Angenommen
- Datum: 26.07.27

## Kontext

ADR 0007 legte fest: Einzelnutzer, keine Auth — Absicherung über Netz/Reverse-Proxy. Der
Profilierer läuft inzwischen öffentlich (xjw.freiheits.de) als Abstimmungswerkzeug mit Externen.
Damit fehlte die Vertrauensbasis: Niemand konnte einer Profilierung oder Testnachricht ansehen, ob
sie verbindlich von der BLK-AG IT-Standards stammt, und nichts hinderte Externe daran, offizielle
Inhalte zu ändern oder zu löschen (GitHub-Issue #16).

## Entscheidung

Ein bewusst minimales Rollenkonzept, das den offenen Charakter erhält:

- **Zwei Rollen, ein gemeinsamer Schlüssel.** `XJP_AG_KEY` (Umgebungsvariable) definiert die
  AG-Rolle; kein Benutzerkonzept, keine Konten. Ohne gesetzte Variable existiert die Rolle nicht
  und das Werkzeug verhält sich exakt wie zuvor (Einzelplatz-/Dev-Betrieb ohne Konfiguration).
- **Serverseitige Durchsetzung.** Der Client schickt den Schlüssel als Header `x-ag-key` mit;
  der Server prüft konstantzeitig (`server/auth.js`) und weist jede Schreiboperation auf
  abgenommene Objekte ohne gültigen Schlüssel mit 403 ab — auch bei direkten API-Aufrufen.
  Unmarkierte Objekte bleiben für alle frei. Das Rollen-Badge im Client ist reine Anzeige.
- **Abnahme dockt an die Versionierung an.** „Abnehmen" friert den Stand als Version mit
  Kennzeichen `abnahme` ein; das Profil referenziert seine Abnahme-Version
  (`profiles.abnahme_version_id`). „Geändert seit Abnahme" ist der doc-Hash-Vergleich zwischen
  Arbeitsstand und Abnahme-Version. Kennzeichen entfernen löscht nur die Referenz; die
  referenzierte Version ist gegen Löschen gesperrt (409).
- **Testnachrichten leichtgewichtig.** Kein Versionsapparat, sondern genau ein eingefrorener
  Abnahme-Stand (`abnahme_xml`/`abnahme_ts`/`abnahme_kommentar`); „geändert seit Abnahme" per
  XML-Vergleich, die eingefrorene Fassung ist über `GET /api/testmessages/:id/abnahme/xml`
  abrufbar.
- **Kennzeichen bleibt Instanz-Aussage.** Exporte (Druck, Excel, Profil-JSON, XML) tragen keinen
  Abnahme-Vermerk; beim Import/Einliefern werden etwaige Abnahme-Felder serverseitig verworfen.
  Duplizieren bleibt für alle erlaubt, die Kopie ist stets unmarkiert.

Da der Schlüssel im Klartext-Header läuft, setzt das Konzept den vorhandenen HTTPS-Betrieb
hinter dem Reverse-Proxy voraus.

## Konsequenzen

- Der offene Einzelnutzer-Charakter (ADR 0007) bleibt für unmarkierte Objekte vollständig
  erhalten; nur abgenommene Objekte sind geschützt.
- Kein Schlüsselwechsel im UI: Rotation = Umgebungsvariable ändern und AG-Mitglieder neu
  anmelden.
- Kein Besitzerkonzept und kein Abnahme-Workflow (Review, Vier-Augen-Prinzip) — bewusst
  ausgeklammert, siehe Out-of-Scope des Issues.
- Der Schutzvertrag ist über die HTTP-Naht getestet (`server/abnahme.test.js`, In-Process-App
  gegen In-Memory-SQLite); der Client-Rollenzustand über Service-Specs (`rolle.service.spec.ts`).

## Nachtrag 26.08.18: In der Oberfläche heißt es „Freigabe"

Auf Wunsch aus der Fachseite spricht die Oberfläche durchgängig von **Freigabe** statt
Abnahme: Badge „✔ BLK-AG freigegeben", Knopf „Freigeben" / „Erneut freigeben", Filter
„nur freigegebene", Warnzeichen „⚠ seit Freigabe geändert", Dialog „Freigabe durch die
BLK-AG". Geändert wurden ausschließlich **sichtbare Texte** (Templates, Toasts,
Dialogtexte, Tooltips, geführte Anleitung, README) sowie der Zusatz im Dateinamen der
heruntergeladenen eingefrorenen Fassung (`….freigegeben.xml`).

**Unverändert bleiben** Code-Bezeichner (`abgenommen`, `abnahme`, `abnahmeSchreibschutz`),
die API-Pfade (`/profiles/:id/abnahme`, `/testmessages/:id/abnahme`), die DB-Spalten und
die Fehlertexte der Serverantworten — sie sind kein Oberflächentext und ihre Umbenennung
wäre ein Bruch am Datenbestand. Die Entwicklerdokumentation (dieser ADR, ADR 0013,
`docs/services.md`) führt den Begriff **Abnahme** darum weiter; gemeint ist dasselbe.

## Nachtrag 26.08.18: „Geändert seit Freigabe" ist eine fachliche Aussage, kein doc-Hash

Der oben festgelegte doc-Hash-Vergleich war zu grob. Der Autosave schreibt nach dem
bloßen Öffnen einer Profilierung abgeleitete Felder nach — vor allem den Punktestand
`fortschritt` (#93), den erst der Client mit geladenem Schema kennt und den die
Abnahme-Version nicht trug. Das änderte die Serialisierung, nicht die Aussage: jede
freigegebene Profilierung trug nach dem ersten Ansehen „⚠ seit Freigabe geändert",
ohne dass jemand etwas entschieden hatte. Der begleitende Vergleich (ADR 0013) wies
folgerichtig keine Unterschiede aus — Badge und Liste widersprachen sich.

Verglichen wird darum jetzt der **Fach-Hash** (`fachHash`, kanonische Serialisierung
ohne `meta.gespeichert` und ohne `fortschritt`) — dieselbe Größe, die „Profil
weiterentwickelt" an gebundenen Testnachrichten entscheidet. `profile_versions` trägt
dafür die Spalte `fach_hash`, beim Anlegen verbatim aus der `profiles`-Zeile kopiert
und für den Altbestand per Backfill nachgezogen; bestehende Schein-Kennzeichen
verschwinden damit beim nächsten Serverstart. Für die **Entprellung** der
Automatik-Versionen und das Kennzeichen `geaendert` bleibt es beim `doc_hash`: dort
ist falsch-positiv harmlos, hier entwertet es die Freigabe.

Auf Client-Seite hört der Autosave gleichzeitig auf, das Feld überhaupt zu verlieren:
`punkteStand()` schrieb es nur, wenn es frisch gezählt werden konnte (geladener Baum,
kein Instanz-Modus, Nenner > 0), und ließ es sonst weg — `profileDoc` führt es nicht,
also verschwand es aus dem Dokument und mit ihm der Balken der Kachel. Der zuletzt
bekannte Stand wird jetzt gemerkt und mitgeschrieben, bis eine eigene Zählung ihn
ersetzt.
