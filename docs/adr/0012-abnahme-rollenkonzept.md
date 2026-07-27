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
