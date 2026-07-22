# US: Schema-Erweiterung — fehlende Elemente nachbeauftragen

Status: umgesetzt (26.07.21) · Typ: einzelne Story

## Story

> **Als** Profilierender **möchte ich** auf jeder Ebene des Baums ein Element hinzufügen
> können (Name, Beschreibung, Kardinalität, Datentyp), wenn in der Zusammenarbeit
> auffällt, dass Elemente im XJustiz-Schema fehlen und nachbeauftragt werden müssen —
> **damit** die Nachbeauftragung direkt im Profil dokumentiert ist und in allen
> Artefakten sichtbar wird.

Solche Elemente sind eine **Erweiterung des Schemas** und müssen überall visuell klar
als solche hervorgehoben sein — im Baum, im Detailbereich, in den Exporten und auf der
Übersichtsseite (Dashboard).

## Geklärte Entscheidungen (Refinement)

1. Erweiterungen sind **verschachtelbar** — eine Erweiterung kann Container sein und
   eigene Erweiterungs-Kinder tragen.
2. Datentyp: **Auswahl gängiger xs:-Basistypen + Freitext** für Sonderfälle;
   Option „Container" (kein Datentyp).
3. Übersichtsseite = **Dashboard**: Badge mit Anzahl auf der Profil-Karte.
4. Generierte Testnachrichten/Beispiel-XML enthalten Erweiterungen **immer**. Die
   dadurch entstehenden XSD-Fehler werden bewusst in Kauf genommen — die
   Validierungs-Sperre (invalide → Entwurf/Download blockiert) greift dafür nicht:
   erweiterungs-bedingte Fehler erscheinen im Bericht als „bekannte
   Schema-Erweiterung" und blockieren allein nicht.

## Akzeptanzkriterien

- An jedem aufklappbaren Container (Element wie Ausprägung, auch Erweiterungs-Container)
  erscheint die gestrichelte Box **„+ Element (Erweiterung)"**; sie öffnet einen Dialog
  mit Name (NCName-Prüfung, Kollisionswarnung bei gleichnamigen Kindern), Beschreibung,
  Kardinalität und Datentyp.
- Erweiterungs-Kästen sind **violett gestrichelt** und tragen den Tag
  **„Schema-Erweiterung"**; die Legende erklärt die Kennzeichnung.
- Im **Detailbereich** lassen sich Name/Beschreibung/Kardinalität/Datentyp nachträglich
  ändern; „+ Unterelement" legt Kind-Erweiterungen an, „Erweiterung löschen" entfernt
  den Teilbaum samt Unter-Profilierung (Kaskade).
- Status, Anmerkung und Beispielwert sind für Erweiterungen wie für Schema-Elemente
  profilierbar (generisches `ElementProfile` am Erweiterungs-Pfad).
- **Exporte:** Beispiel-XML/Testnachrichten enthalten Erweiterungen immer (typkonformer
  Platzhalter bzw. erfasster Wert); Excel kennzeichnet mit Typ `[Erweiterung] …`,
  die Druckansicht mit `[Schema-Erweiterung]`; das Schematron dokumentiert je
  Erweiterung einen Kommentar (keine Asserts gegen Nicht-Schema-Pfade).
- **Validierung:** Fehler, die nur auf Erweiterungen zurückgehen, machen Testnachrichten
  **nicht** zum Entwurf und sperren den Beispiel-XML-Download nicht; im Bericht sind sie
  als „bekannte Schema-Erweiterung" gekennzeichnet und werden getrennt gezählt. Echte
  Fehler blockieren weiterhin.
- **Dashboard:** Profil-Karten mit Erweiterungen zeigen das Badge
  „N Schema-Erweiterung(en)".
- Erweiterungen überleben Speichern/Laden (Backend-JSON, Profildatei `formatVersion 3`)
  und werden von Duplizieren/Kopieren (`duplicateElement`/`copyAusp`) mitgenommen.

## Umsetzung (Orientierung)

- Datenmodell: `Erweiterung` + `ProfileDoc.erweiterungen` (indexiert am Elternpfad),
  eigener Knoten-Pfad `elternPfad/~id` — siehe [Datenmodell](../data-model.md) und
  [ADR 0010](../adr/0010-schema-erweiterungen-profil-overlay.md).
- Store: `StateService.addErweiterung/updateErweiterung/removeErweiterung` (Kaskade),
  `fortschritt().nErw`; Baum-Injektion über `TreeService.kinder()`.
- UI: `ErweiterungDialog` (+ `ErweiterungDialogService`), extBox/`t-ext` in `TreeNode`,
  Editier-Abschnitt im `DetailPanel`, Badge im Dashboard (`LibraryEntry.nErw`,
  Server-Spalte `n_erw`).
- Validierung: Klassifikation im `ValidationMarkerService`
  (`erweiterung`-Flag, `nurErweiterungsFehler`), gelockerte Tore in
  `ExportService.genBeispielXml`, `TestmessageGenerationService`,
  `TestmessageCreateService.speichern`.
- Tests: `state.service.spec`, `tree.service.spec`, `export.service.spec`,
  `validation-marker.service.spec`, `testmessage-*.spec`, `excel-export.service.spec`,
  `persistence.service.spec`, `server/profiles.test.js`.

## Bekannte Einschränkungen

- Diff, geführter Modus und Instanz-Import bleiben schema- bzw. instanzgetrieben —
  Erweiterungen erscheinen dort bewusst nicht.
- Der Duplizieren-Button ist an Erweiterungs-Kästen ausgeblendet (bewusst kleiner
  Scope; wiederholte Vorkommen über die Kardinalität dokumentieren).
