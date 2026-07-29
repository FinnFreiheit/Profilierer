# ADR 0013: „Seit Abnahme geändert" sichtbar machen — struktureller Vergleich statt Zeilendiff

- Status: Angenommen
- Datum: 26.07.29

## Kontext

ADR 0012 führte das Abnahme-Konzept ein. Sichtbar war davon bislang nur ein Boolean: Profile
tragen `geaendertSeitAbnahme` aus dem SHA1-Vergleich `profiles.doc_hash` gegen die referenzierte
Abnahme-Version, Testnachrichten aus `xml != abnahme_xml`. Wer das Warn-Badge sah, konnte nicht
feststellen, **was** abweicht — für die Abstimmung mit der BLK-AG und für Externe der eigentlich
interessante Teil.

Zwei Hindernisse standen dem im Weg: Der eingefrorene Abnahme-`doc` lag zwar in
`profile_versions.doc`, war vom Client aber nur über `restore` (destruktiv) erreichbar. Und der
vorhandene `DiffService` vergleicht zwei XJustiz-**Schemata**, nicht zwei Profile — er taugt als
Vorbild für Modell und Optik, nicht als Baustein.

## Entscheidung

- **Zwei getrennte Vergleichs-Services, beide reine Funktionen.** `ProfilDiffService` vergleicht
  zwei `ProfileDoc` feldgenau (Metadaten, Statusstufen, Elemente, Ausprägungen, Erweiterungen),
  `XmlDiffService` zwei XML-Instanzen. Beide ohne State-Zugriff und damit vollständig
  unit-getestet; die Dialoge bleiben dünn.
- **Status wird über die aufgelöste Stufe verglichen, nicht über die id.** Status-ids sind pro
  Dokument vergeben: dieselbe id kann in beiden Fassungen auf unterschiedliche Stufen zeigen, und
  eine umbenannte Stufe ändert die Bedeutung jedes Elements, das auf sie zeigt. Verglichen wird
  daher `"<Name> (<Wirkung>)"`. Verwaiste ids erscheinen als `unbekannte Statusstufe (sN)`.
- **`meta.gespeichert` bleibt außen vor.** Das Feld wird bei jedem Speichern neu gesetzt und
  würde jeden Vergleich mit einer Schein-Änderung eröffnen.
- **XML strukturell, nicht zeilenbasiert.** `abnahme_xml` wird verbatim aus der hochgeladenen
  Datei eingefroren (fremde Einrückung, fremde Präfixe), der Arbeitsstand wird nach jeder
  Bearbeitung durch `serializePretty()` neu geschrieben. Ein Zeilendiff meldete bei einer
  geänderten Postleitzahl die halbe Datei — der gesuchte Fall wäre unsichtbar. Verglichen werden
  daher Elementpfade, Attribute und Blattwerte. Wiederholungen werden über einen fachlichen
  Schlüssel zugeordnet (`id`-Attribut oder ein Kind aus `SCHLUESSEL_KINDER`), sonst positionsweise;
  einseitige Teilbäume ergeben **einen** Eintrag mit Nachfahren-Zahl statt einer Zeile je Element.
- **Versions-`doc` ist ohne Schlüssel lesbar.** `GET /api/profiles/:id/versions/:vid` und
  `GET /api/profiles/:id/abnahme` liefern Metadaten plus Dokument, bewusst ohne `schutz`:
  `GET /profiles/:id` gibt das Arbeitsdokument ohnehin ungeprüft heraus, der Abnahme-Schutz ist
  ausschließlich ein Schreibschutz, und Transparenz ist der fachliche Zweck der Funktion.
  Präzedenzfall ist `GET /testmessages/:id/abnahme/xml` aus ADR 0012.
- **Der Vergleich ist generisch, die Abnahme nur der prominente Einstieg.** Der Profil-Dialog
  vergleicht den Arbeitsstand gegen jede Version; vorausgewählt ist die referenzierte
  Abnahme-Version. Damit ist auch „geändert seit vX" beantwortbar.
- **Steuerung über einen Service, nicht über Outputs.** Die Einstiege liegen in Toolbar,
  Versions-Dialog, Dashboard und Testdaten; ein Durchreichen als Output (Muster `versionenClick`)
  scheidet aus, weil Dashboard und Testdaten keine haben. Beide Dialoge hängen global in der Shell
  und reagieren auf `VergleichService.ziel()` — Muster `ValidationDialog`.

## Konsequenzen

- Die Abnahme-Badges sind jetzt Schaltflächen (`<button class="pill pillBtn">`), nicht
  `<span (click)>` — sonst wären neue a11y-Warnungen entstanden (ADR 0011).
- Reine Umsortierungen gleichnamiger XML-Geschwister ohne fachlichen Schlüssel erscheinen als
  Wertänderungen. Ohne Schlüssel ist „verschoben" von „geändert" nicht unterscheidbar; die
  Schlüsselkandidaten-Liste ist erweiterbar.
- `SCHLUESSEL_KINDER` ist eine Heuristik über XJustiz-Namenskonventionen, keine Schema-Auswertung.
  Ein späterer Ausbau könnte die Schlüssel aus dem XSD ableiten.
- „Alles kopieren" liefert die gefilterte Liste als Text — der eigentliche Nutzen für CR- und
  Abstimmungs-Mails.
- Die Vergleichslogik ist über `profil-diff.service.spec.ts` und `xml-diff.service.spec.ts`
  abgesichert, der Lesezugriff über `server/versions.test.js` (DB) und `server/abnahme.test.js`
  (HTTP, inklusive „ohne AG-Schlüssel lesbar").
