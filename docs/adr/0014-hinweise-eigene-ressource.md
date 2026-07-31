# ADR 0014: Hinweise als eigene Ressource neben der Profilierung

- Status: Angenommen
- Datum: 26.07.31

## Kontext

Ein Hinweis war bisher **ein Freitextfeld je Element** im Profil-Dokument (`ElementProfile.hinweis`
plus `hinweisErledigt`). Das trug, solange Hinweise ein privater Merkzettel des einen Profilierers
waren. Mit der Abnahme durch die BLK-AG ([ADR 0012](0012-abnahme-rollenkonzept.md)) werden sie zum
**Rückmeldekanal**: Länder, Hersteller und Fachverfahrensbetreiber lesen einen abgenommenen Stand und
haben Anmerkungen am konkreten Element.

Als Feld im Dokument scheitert das an drei Stellen:

- **Verlust durch Autosave.** Der Editor schreibt das Volldokument (`PUT /api/profiles/:id`) im
  800-ms-Takt. Wer mit einem älteren Browser-Stand speichert, löscht fremde Hinweise lautlos — ohne
  Konflikt, ohne Meldung.
- **Ein Feld, ein Autor.** Zwei Rückmeldende am selben Element überschreiben einander.
- **Falsches Warnzeichen.** „Geändert seit Abnahme" hängt am SHA1 über `profiles.doc`
  ([ADR 0013](0013-vergleich-seit-abnahme.md)). Eine reine Notiz setzte damit das Badge, das
  inhaltliche Abweichungen melden soll.

Die naheliegende Alternative — Hinweise im Dokument lassen und den Abnahme-Schutz für sie
aufbohren — hätte den Schutz zu einer Ausnahmeliste gemacht und keines der drei Probleme gelöst.

## Entscheidung

- **Eigene Ablage.** Tabelle `hinweise(id, profil_id, pfad, text, autor, rolle, zeit, erledigt)`
  neben `profiles`, für **alle** Profile (nicht nur abgenommene). Ein Element trägt beliebig viele
  Hinweise; jeder ist einzeln abhakbar und löschbar.
- **Eigene Endpunkte** unterhalb der Profil-Ressource: `GET/POST /api/profiles/:id/hinweise`,
  `PATCH/DELETE /api/profiles/:id/hinweise/:hid`, `PUT …/hinweise` (Volltausch für den
  Datei-Import). Hinweise laufen **nie** über den Autosave und nie über `PUT /api/profiles/:id`.
- **Der Server verwirft Hinweisfelder in eingelieferten Dokumenten** — dieselbe Regel wie für
  Abnahme-Felder. Ein alter Client-Stand findet damit keinen Weg zurück ins Dokument.
- **Rechte bleiben unverändert.** Der Abnahme-Schutz greift auf den Hinweis-Endpunkten wie überall
  sonst: unmarkierte Profile frei, abgenommene für Externe gesperrt. `autor` und `rolle` existieren
  als Spalten, bleiben aber leer — Autorschaft und ein gelockertes Schreibrecht für Externe sind
  eigene Schritte.
- **Client-seitig ein eigener Store.** `HinweisStoreService` hält die Hinweise des offenen Profils
  in einem eigenen Signal (samt abgeleiteter Sichten: Übersicht, Zähler, je Pfad, Vorfahren-Aggregat)
  — nicht in der pfad-indizierten `elemente`-Map des `StateService`. Geladen und geleert wird er vom
  `PersistenceService` entlang `state.activeProfileId`.
- **Lebenszyklus.** Duplizieren übernimmt die Hinweise (mit neuen ids); Versionen frieren sie nicht
  ein, Wiederherstellen lässt sie unberührt; Löschen eines Profils kaskadiert.
- **Dateiaustausch.** Der JSON-Export legt sie unter einen eigenen Top-Level-Schlüssel `hinweise`
  neben `elemente`/`auspraegungen` (Dateiformat 4) und erhält `zeit`, `autor` und `rolle`. Import in
  ein bestehendes Profil **ersetzt** die Hinweise — kein Zusammenführen, keine Konfliktlogik im
  Dateiaustausch.
- **Einmalige Migration beim Serverstart** (`db.migriereHinweise`, idempotent): jedes vorhandene
  `hinweis`-Feld wird ein Listeneintrag (Autor und Rolle leer, Zeitpunkt = letzte Änderung des
  Profils, Erledigt-Zustand übernommen), danach sind die Felder aus dem Dokument entfernt. Mit
  umgestellt werden die eingefrorenen Dokumente (Versionen, an Testnachrichten gebundene Kopien)
  samt ihrer Hashes — sonst meldete nach der Umstellung jede abgenommene Profilierung „geändert seit
  Abnahme" und jede gebundene Testnachricht „Profil weiterentwickelt", ohne dass sich fachlich etwas
  geändert hätte. Der Import einer alten Datei macht dieselbe Umformung im Client
  (`hinweiseAusAltformat`), damit es nur **eine** Regel gibt. Kein Rückwärtspfad.

## Konsequenzen

**Positiv**

- Kein Datenverlust mehr durch fremde Autosaves; mehrere Rückmeldungen am selben Element stehen
  nebeneinander.
- „Geändert seit Abnahme" und der Profil-Vergleich melden wieder ausschließlich inhaltliche
  Abweichungen — `hinweis`/`hinweisErledigt` fallen aus dem Feldvergleich des `ProfilDiffService`.
- Der Abnahme-Schutz bleibt ein einfacher Schreibschutz auf die Profilierung; das spätere Recht
  „Externe dürfen an abgenommenen Ständen Hinweise anlegen" ist eine Lockerung an genau einem
  Endpunkt, keine Ausnahme im Dokumentschutz.

**Negativ / Folgeaufgaben**

- Ein zweiter Speicherort und ein zweiter Ladevorgang beim Öffnen: das Dokument allein ist nicht
  mehr der vollständige Stand einer Profilierung. Export und Import müssen beides zusammenführen.
- Hinweise sind nicht mehr Teil der Versionierung — eine Version friert die fachliche Aussage ein,
  nicht die Diskussion darüber. Das ist gewollt, überrascht aber, wer Versionen als Vollsicherung
  liest.
- Das Duplizieren eines Elements (`duplicateElement`) nimmt die Hinweise des Quellpfads nicht mehr
  mit — sie hängen am Pfad, nicht am Elementprofil.
- Offen für Folge-Tickets: Autor und serverseitiges Rollenkennzeichen, Anlegerecht für Externe an
  abgenommenen Ständen, Zähler auf der Dashboard-Karte.
