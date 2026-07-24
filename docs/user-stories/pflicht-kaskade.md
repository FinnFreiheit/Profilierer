# US-Story: Pflicht-Vorbelegung kaskadiert

Status: spezifiziert (Grilling 26.07.24) · Typ: Änderungs-Spec · Ergänzt: [Profilierung geführt erstellen](profilierung-gefuehrt-erstellen.md)

## Problem

Die geführte Profilierung überspringt 1..1-Elemente bewusst — bei `min≥1` ist
„zwingend" die einzig gültige Antwort, auto-vorbelegte Pflicht gilt als erledigt.
Die Vorbelegung deckt aber nur das durchgehende Pflicht-Rückgrat ab Wurzel ab:
optionale Zwischeneltern und Auswahlen brechen den Abstieg ab. **1..1-Elemente
unterhalb eines aufgenommenen optionalen Elternteils fallen durch beide Raster** —
keine Frage im Durchlauf, keine Markierung im Baum. Für den Anwender entsteht ein
uneinheitliches Bild: gleichartige Pflichtelemente erscheinen mal grün als
„zwingend", mal ohne jede Disposition.

Beim Prüfen der Exportpfade wurde eine zweite, unabhängige Lücke gefunden: das
Excel-Struktursheet rendert die Szenariospalte ungefiltert. Gespeicherte Status
unterhalb eines ausgeschlossenen Elternteils erscheinen dort als aktive
Festlegung — direkt unter einem Elternteil mit „nicht verwendet". Schematron,
Beispiel-XML und Druck behandeln vererbten Ausschluss bereits korrekt.

## Lösung

**Kaskadierende Vorbelegung:** Erhält ein Element eine aufnehmende Disposition
(Wirkung `pflicht` oder `optional`), wird das lokale Pflicht-Rückgrat unterhalb
automatisch als „zwingend" vorbelegt — echte Profildaten, sichtbar,
überschreibbar, exakt wie die bestehende Vorbelegung beim Nachrichtenstart.
Die Kaskade hängt zentral an der Statusänderung (eine Stelle, nicht je
Bedienfläche) und wirkt in allen drei Strukturkontexten: optionale Elemente,
zugelassene Auswahl-Zweige, Ausprägungen.

**Bestandsreparatur:** Der Menüpunkt „Pflicht vorbelegen" steigt zusätzlich in
bereits aufgenommene optionale Teilbäume, zugelassene Auswahl-Zweige und
Ausprägungen ab und holt dort die Vorbelegung nach. Keine stille Migration beim
Öffnen.

**Excel-Fix:** Das Struktursheet behandelt vererbt Ausgeschlossene wie der
Druck — die Zeile bleibt (vollständige Strukturreferenz), die Szenariospalte
zeigt „entfällt", gespeicherter Status, Anmerkung, Werte und Testdaten werden
unterdrückt.

## User Stories

1. Als Profilierender möchte ich, dass beim Setzen von „zwingend" auf einem optionalen Element dessen unbedingte Pflicht-Kinder automatisch als „zwingend" markiert werden, damit der Teilbaum ohne Handarbeit ein einheitliches Bild zeigt.
2. Als Profilierender möchte ich dieselbe Kaskade beim Setzen von „anzugeben, wenn vorhanden", da auch dann die 1..1-Kinder im Vorkommensfall zwingend sind.
3. Als Profilierender möchte ich die Kaskade auch beim Zulassen eines Auswahl-Zweigs, damit das Pflicht-Rückgrat des Zweigs nicht stumm bleibt.
4. Als Profilierender möchte ich die Kaskade auch innerhalb einer Ausprägung (Kontextpfad `…@auspId/…`), damit je Ausprägung dasselbe einheitliche Bild entsteht.
5. Als Profilierender möchte ich, dass eine von mir bewusst geänderte Kind-Disposition bei erneutem Setzen des Elternteils **nicht** überschrieben wird, damit meine Abweichung Bestand hat.
6. Als Profilierender erwarte ich, dass „zu klären" (Wirkung `markierung`) und „nicht verwendet" **keine** Kaskade auslösen — sie sind keine aufnehmenden Dispositionen.
7. Als Profilierender möchte ich per „Pflicht vorbelegen" ein Bestandsprofil nachziehen können, damit auch vor dieser Änderung entstandene Profile einheitlich werden.
8. Als Profilierender möchte ich nach dem Reparatur-Lauf im Toast sehen, wie viele Elemente vorbelegt wurden, damit der Eingriff nachvollziehbar ist.
9. Als Profilierender möchte ich, dass Unter-Entscheidungen beim Ausschluss des Elternteils erhalten bleiben und bei Rücknahme unverändert wieder erscheinen (Kriterium F der Basis-Story), damit versehentliches Ausschließen keine Arbeit vernichtet.
10. Als Empfänger des Excel-Exports möchte ich unterhalb eines Ausschlusses „entfällt" statt schlummernder Status lesen, damit das Blatt keine widersprüchlichen Festlegungen zeigt.
11. Als Empfänger des Excel-Exports möchte ich weiterhin die vollständige Schemastruktur sehen (Zeilen bleiben), damit „entfällt" von „im Schema nicht vorhanden" unterscheidbar ist.
12. Als Profilierender erwarte ich, dass Schematron und Beispiel-XML unverändert nichts aus ausgeschlossenen Teilbäumen emittieren (Regressionsschutz).
13. Als geführter Anwender erwarte ich, dass kaskadiert vorbelegte Elemente **keine** neuen Fragen im Durchlauf erzeugen und der Fortschritt „X von Y" unverändert nur echte Entscheidungen zählt.
14. Als Profilierender akzeptiere ich, dass die Kopfzahl „n Festlegungen" nach Kaskade bzw. Reparatur-Lauf steigt — sie spiegelt dann die tatsächlich getroffenen Festlegungen.

## Implementierungs-Entscheidungen

- **Zentrale Kaskade in der State-Schicht:** ein Auslösepunkt an der
  Statusänderung; Detailpanel, Tastatursteuerung (z/o) und jeder künftige
  Bedienweg laufen durch dieselbe Logik.
- **Rückgrat-Sammlung verallgemeinern:** die bestehende Logik (nur `min≥1`,
  keine optionalen Zwischeneltern, `choice` bricht ab, Schutzgrenzen für Tiefe
  und Rekursion) wird von „ab Wurzel" auf „ab beliebigem Teilbaum-Anker"
  verallgemeinert — einschließlich Ausprägungs-Kontextknoten. Button und
  Kaskade teilen sich diese eine Implementierung.
- **Vorbelegungs-Semantik unverändert:** nie einen vorhandenen Status
  überschreiben; die Zielstufe wird über die Wirkung `pflicht` aufgelöst,
  damit umbenannte Statusstufen greifen.
- **Kein Herkunfts-Kennzeichen im Modell:** kaskadierte Einträge sind normale
  Profildaten; Schutz vor Verlust regelt die bestehende Nicht-Überschreiben-
  Semantik, Schutz vor Wirkung regelt die Ausschluss-Kaskade der Exporte.
- **Excel:** die Zeilensammlung prüft vererbten Ausschluss wie der Druck;
  Szenariospalte „entfällt", unterdrückte Detailspalten. Die
  Codelisten-Sammlung filtert bereits und bleibt unverändert.
- **Keine Migration beim Öffnen**, kein Eingriff in gespeicherte Profil-JSONs;
  die Reparatur ist ausschließlich nutzergesteuert.

## Test-Entscheidungen

- Gute Tests prüfen **äußeres Verhalten über die öffentlichen Service-APIs**
  (Status setzen → welche Pfade tragen danach welchen Status; Zeilen bauen →
  was steht in der Szenariospalte), keine Implementierungsdetails.
- **Nähte:** die State-Schicht (Kaskade, Nicht-Überschreiben, Wirkungs-
  Auflösung, Ausprägungs-Kontext) und der Excel-Zeilenaufbau („entfällt",
  Unterdrückung, Zeile bleibt). Beide haben bestehende Spec-Dateien als
  Vorbild (Muster: `*.spec.ts` neben der Quelle, Fixtures inline).
- Der vertiefte Reparatur-Lauf wird über dieselbe Naht getestet wie die
  Kaskade (gleiche Implementierung, zweiter Auslöser: Rückgabewert = Anzahl).
- Regressionsschutz: Schematron-/Beispiel-XML-Tests für „nichts aus
  ausgeschlossenen Teilbäumen" nur ergänzen, falls nicht bereits vorhanden.

## Außerhalb des Umfangs

- Der geführte Durchlauf fragt Rückgrat-Kinder weiterhin **nicht** ab.
- Kein Herkunfts-/Provenienz-Feld für Statusentstehung.
- Keine automatische Migration oder Bereinigung schlummernder Einträge in der
  Profil-JSON (`pruneP` unverändert).
- Druck und Schematron bleiben unangetastet (bereits korrekt).
- Wert-Einschränkungen, Kardinalität, Codelisten als Teil der Kaskade.
