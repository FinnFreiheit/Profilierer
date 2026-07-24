# XJustiz Profilierer

Werkzeug zur Visualisierung von XJustiz-Nachrichten und zur Erstellung von Profilierungen (Kommunikationsszenarien) — auch für die gemeinsame Arbeit mit Nicht-Technikern.

**Starten:** Angular-Projekt — Node ≥ 22.12 nötig (`.nvmrc` liegt bei, notfalls `nvm use`), dann `npm install` und `npm start` (öffnet `http://localhost:4200`, inkl. XRepository-Dev-Proxy). Die frühere Single-File-Version liegt zur Referenz unter `legacy/Profilierer.html`.

## Grundidee

Die Nachricht wird als **Kasten-Baum von links nach rechts** dargestellt, mit Verbindungslinien zwischen Eltern und Kindern. Jeder Ast lässt sich unabhängig auf- und zuklappen (+/− am Kasten) — mehrere Äste können gleichzeitig offen sein, „Alles ausklappen"/„Zuklappen" wirken auf den ganzen Baum. Wert-Elemente (weiß, grüner „Wert:"-Chip mit Wertart) sind von Elternelementen (grau hinterlegt) auf einen Blick unterscheidbar. Kardinalitäten stehen als Klartext an den Kästen; technische Namen und Typen sind über den Schalter „Technik" zuschaltbar.

## Bedienung

1. **XSD-Ordner laden** — Ordner mit den XJustiz-Schemadateien wählen (z. B. `XJustiz_3_6_2_XSD`), alternativ Dateien per Drag & Drop.
2. **Nachricht wählen** — durchsuchbare Liste aller `nachricht.*`-Elemente, gruppiert nach Fachmodul.
3. **Profilieren** — Kasten anklicken, rechts im Detailbereich entscheiden:
   - **Status** — Stufen sind je Profil frei konfigurierbar (Knopf „Status…": Name, Farbe und _Wirkung_). Vorbelegung: zwingend / anzugeben, wenn vorhanden / nicht verwendet / zu klären. Die Wirkung (Pflicht, optional, ausgeschlossen, nur Markierung) steuert Schematron und Beispiel-XML.
   - **Kardinalität** im Szenario eingrenzen (z. B. beliebig viele → genau 1).
   - **Ausprägungen** — wiederholbare Elemente bekommen benannte Fälle mit je eigener Unter-Profilierung, z. B. `beteiligung` → „Notar/in", „Betroffene Person". Jede Ausprägung erscheint als eigener Kasten und wird separat durchprofiliert. Der ⧉-Knopf **dupliziert**: ein wiederholbares Element wird in „Fall 1"/„Fall 2" aufgeteilt (bestehende Festlegungen wandern in Fall 1), eine Ausprägung wird samt Unter-Profilierung kopiert — praktisch für strukturgleiche Dokumentblöcke.
   - **Ausblenden** — ✕ am Kasten setzt das Element direkt auf „nicht verwendet" (ausgegraut, ↺ zum Zurückholen).
   - **Referenzen** — Verweis-Elemente (`Type.GDS.Ref.*`: Rollennummer, SGO, Beteiligtennummer …) tragen einen rosa „Verweis"-Chip. Im Detailbereich lässt sich das Verweisziel als konkrete Ausprägung festlegen (z. B. urkundsperson → Beteiligung „Notar/in"); der Verweis wird als gestrichelte rosa Linie mit Pfeil quer durch den Baum gezeichnet, „→ Ziel" springt hin. Auch ohne Zuordnung zeigen dezente punktierte Linien die Schema-Beziehung (z. B. urkundsperson ⇢ beteiligung), abschaltbar über den Schalter „Verweise"; ist der Zielast zugeklappt, endet die Linie am nächsten sichtbaren Vorfahren. Klick auf den Verweis-Chip springt direkt zum Ziel. Die Beispiel-XML vergibt an beiden Enden konsistente Nummern (`ref.rollennummer` ↔ `rollennummer` der Ziel-Ausprägung).
   - **Codelisten-Werte** einschränken (inline gepflegte Listen per Checkbox). Für externe Listen (Code-Typ 3) gibt es drei Wege: **„Codelisten: XRepository"** ruft per REST-Schnittstelle alle vom Standard genutzten Listen ab (`/version_standard/…/genutzteAktuelleCodelisten`, Typ 3 in aktuell gültiger Version); im Detailbereich lässt sich eine **einzelne Liste** nachladen; oder **„Codelisten: Datei…"** liest Genericode-XML/ZIP aus lokalen Dateien. Geladene Listen werden gemäß XRepository-Nutzungsbedingungen im Browser **gecacht** und stehen beim nächsten Start sofort bereit. Hinweis: Das XRepository sendet keine CORS-Freigabe, daher scheitert der Direktabruf im Browser. **Zuverlässigste Lösung:** das Tool über den Angular-Dev-Server betreiben (`npm start`) — dessen Dev-Proxy (`proxy.conf.json`) reicht die XRepository-Aufrufe unter `/xrep-api/…` same-origin durch. Ohne Proxy versucht das Tool — einmalig mit Zustimmung — öffentliche Weiterleitungsdienste (codetabs.com, corsproxy.io, allorigins.win; nicht immer verfügbar). Es bleibt außerdem der ZIP-Download-Link plus „Codelisten: Datei…". Werte sind einsehbar, ankreuzbar, filterbar und fließen in die Beispiel-XML ein (inkl. `listVersionID`).
   - **Anmerkung** und **Beispielwert** je Element.
4. **Exportieren**:
   - **Speichern** — Profil als JSON, wieder ladbar (v1-Profile werden migriert; Versionswechsel wird gemeldet).
   - **Excel** — Struktur mit Status-, Kardinalitäts-, Werte-Spalten; Deckblatt mit Statuslegende; Codelisten-Blatt.
   - **Schematron** — `.sch`-Regeln zusätzlich zur XSD-Validierung. Zwingende Ausprägungen werden als Mindest-Anzahlen geprüft; Festlegungen _innerhalb_ einzelner Ausprägungen sind instanzspezifisch und werden bewusst nicht als Regeln erzeugt.
   - **Beispiel-XML** — Entwurf einer Beispielnachricht aus dem Profil: Ausprägungen als Instanzen, Beispielwerte bzw. typgerechte Platzhalter, Codelisten-Werte. Platzhalter und `listURI`/`listVersionID` sind fachlich zu prüfen.
   - **Drucken** — Dokumentansicht der Profilierung (auch als PDF), respektiert „nur Profil".

## Navigation

Die **Pfadleiste** über dem Baum zeigt den Weg zum ausgewählten Element als klickbare Kette (inkl. Ausprägungen) — ein Klick springt direkt auf die jeweilige Ebene zurück. Zusätzlich **Pfeiltasten**: ← Elternelement, → erstes Kind, ↑/↓ Geschwister; die Ansicht scrollt automatisch mit.

## Testnachrichten

Jedes Wert-Blatt trägt direkt im Kasten ein **Testwert-Eingabefeld** (grün, Monospace): Was dort steht, landet in der Beispiel-XML. Leer gelassene Felder zeigen den automatischen Platzhalter kursiv an — man sieht also immer, was generiert würde. Bei Codelisten schlägt das Feld die zulässigen Werte vor (eingeschränkt auf die Szenario-Auswahl, mit Beschreibung). Auch in der Kompakt-Chip-Ansicht des Fokus-Modus bleibt der Wert rechts im Chip sichtbar — der Baum ist damit zugleich eine Live-Vorschau der Testnachricht. Referenz-Blätter zeigen die automatisch vergebene Nummer der Ziel-Ausprägung.

Der **Fokus-Modus** (Schalter „Fokus", standardmäßig an) hält den aktiven Pfad und dessen direkte Kinder in voller Größe; alle übrigen Kästen schrumpfen zu einzeiligen Kompakt-Chips mit Statusfarbe — die Struktur bleibt sichtbar, ohne zu erschlagen. Ein Klick auf einen Chip wählt ihn aus und bringt ihn (samt Umgebung) wieder in volle Größe.

Die **Suche** in der Werkzeugleiste findet Elemente nach Anzeigename, technischem Namen, Beschreibung und Ausprägungs-Namen; ein Klick (oder Enter für den ersten Treffer) klappt den Ast auf, springt hin und lässt den Kasten kurz aufblinken.

## Bestehende Nachricht laden

Über **„Nachricht laden…"** wird eine vorhandene XJustiz-Nachricht (XML-Instanz) eingelesen und im Baum als **Testnachricht** dargestellt: Blatt-Werte erscheinen als Testwerte, Codelisten-Werte werden übernommen, und mehrfach vorkommende Elemente werden als Ausprägungen („Vorkommen 1/2…") angelegt — genau so, als hätte man die Testnachricht von Hand aufgebaut. Voraussetzung ist der passende, zuvor geladene XSD-Ordner (das Wurzelelement bestimmt die Nachricht). Alternativ per Drag & Drop der XML-Datei; eine `nachricht.*`-Datei wird automatisch als Nachricht erkannt (Genericode-XML weiterhin als Codeliste).

## Schemavalidierung

Alle XML-Nachrichten werden **gegen das XJustiz-Schema validiert** (direkt im Browser, auch für eigene XSD-Ordner). Es gilt: Nur valide Nachrichten verlassen das Tool und nur valide Nachrichten kommen in den Testdatenspeicher. Konkret: Uploads in den Testdatenspeicher werden bei Schemaverstößen mit einem Fehlerbericht abgelehnt; Download, „Als neue Nachricht speichern" und der Beispiel-XML-Export sind für invalide Nachrichten gesperrt; geführt erstellte oder aus Profilierungen erzeugte Nachrichten, die (noch) nicht valide sind, bleiben als **Entwurf** gekennzeichnet. Eine invalide Nachricht lässt sich weiterhin über „Nachricht laden…" öffnen, ansehen und reparieren — dabei erscheint nur ein Hinweis mit der Fehlerliste. Der Bericht nennt je Fehler die Zeile und die vom Schema erwarteten Elemente.

## Autosave

Der Arbeitsstand wird bei jeder Änderung automatisch im Browser gesichert (Anzeige „automatisch gesichert HH:MM" in der Werkzeugleiste). Nach dem nächsten Laden des XSD-Ordners bietet das Tool die Wiederherstellung an — Schutz gegen versehentliches Schließen oder Abstürze. Das ersetzt nicht das bewusste „Speichern" als Profil-Datei (JSON), die weitergegeben und archiviert werden kann.

## Versionsvergleich (Diff)

Über **„Version vergleichen…"** wird ein zweiter XSD-Ordner (z. B. XJustiz 4.0.0) geladen. Der Diff-Viewer zeigt für die aktuell geladene Nachricht alle Unterschiede der aufgelösten Struktur: **neu** (grün), **entfernt** (rot), **geändert** (gelb, mit Detail wie „Kardinalität 0..1 → 1" oder Typ-/Codelistenwechsel). Änderungen, die von der aktuellen Profilierung betroffen sind, tragen die Markierung **„profiliert"** und lassen sich separat filtern — so sieht man sofort, welche Festlegungen beim Versionswechsel nachgezogen werden müssen. Die Liste führt jeden Unterschied mit dem **exakten Spezifikations-Namen** (technischer Elementname in Monospace, Typ, vollständiger Pfad); der Klartextname steht nur ergänzend daneben. Der ⎘-Knopf kopiert Name, Typ, Pfad und Änderung in die Zwischenablage — direkt verwendbar in CRs und Abstimmungsunterlagen. Klick auf einen Eintrag springt zum Element im Baum. Zusätzlich ein Überblick, welche Nachrichten in der neuen Version hinzugekommen oder entfallen sind.

Die Unterschiede werden auch **direkt im Baum** markiert (Schalter „Diff", nach Laden der Vergleichsversion aktiv): betroffene Kästen tragen rote „entfällt in …"- bzw. gelbe „geändert in …"-Badges (Detail im Tooltip), und Elemente, die es erst in der neuen Version gibt, erscheinen als grün gestrichelte Phantom-Kästen an ihrer künftigen Position — mit Kardinalität und Typ aus der neuen Version. Elternelemente mit Unterschieden im Teilbaum tragen ein „Δ n"-Badge (Aufschlüsselung im Tooltip), in der Kompakt-Chip-Ansicht ein kleines Δ am Namen — so findet man alle Änderungen auch bei zugeklappten Ästen durch Hineinklicken.

## Hinweise

- „nur Profil" blendet Ausgeschlossenes aus — für die Abstimmung mit Fachexperten.
- Ausschluss vererbt sich auf Unterelemente (durchgestrichen/abgeblendet).
- Rekursive Strukturen werden markiert und nicht weiter expandiert.
- Der Fortschrittszähler in der Werkzeugleiste zeigt die Zahl der Festlegungen.
- SheetJS (Excel) und JSZip (Codelisten-ZIP) sind als npm-Pakete gebündelt und werden nur bei Bedarf nachgeladen; die App läuft ansonsten offline (außer XRepository-Abruf).
