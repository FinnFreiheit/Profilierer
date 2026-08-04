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
2. Datentyp: Auswahl aus dem **geladenen Schema** (#96) — kuratierte xs:-Basistypen,
   DIN 91379, fachliche `Type.*` je Fachmodul, Codelisten `Code.*` — plus Freitext für
   Typen, die es noch nicht gibt; Option „Container" (kein Datentyp).
   Ein aus dem Schema gewählter **komplexer** Typ bringt seine Unterelemente in den
   Baum (#97, [ADR 0017](../adr/0017-erweiterungstyp-lebende-referenz.md)).
3. Übersichtsseite = **Dashboard**: Badge mit Anzahl auf der Profil-Karte.
4. Generierte Testnachrichten/Beispiel-XML enthalten Erweiterungen **immer**. Die
   dadurch entstehenden XSD-Fehler werden bewusst in Kauf genommen — die
   Validierungs-Sperre (invalide → Entwurf/Download blockiert) greift dafür nicht:
   erweiterungs-bedingte Fehler erscheinen im Bericht als „bekannte
   Schema-Erweiterung" und blockieren allein nicht.
5. **Maschinelle Prüfartefakte sind gesperrt** (#98, 26.08.04): aus einer Profilierung
   mit Erweiterungen entstehen **keine** Testnachricht und **kein** Schematron — beide
   würden Gültigkeit gegen eine XSD behaupten, die das nachbeauftragte Element per
   Definition nicht kennt. Sperrkriterium ist grob gehalten: **jede** Erweiterung sperrt
   (`nErw > 0`), unabhängig vom Status und von der zu bindenden Fassung. Excel, Druck,
   Profil-Export und Beispiel-XML bleiben frei — das sind Kommunikationsmittel für die
   AG, die den Zielzustand zeigen dürfen.

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
- **Komplexer Datentyp (#97):** eine Erweiterung vom Typ `Type.GDS.Akte` klappt
  `identifikation`, `auswahl_vertraulichkeit`, `laufzeit`, … auf; die Kinder tragen Doku
  und Kardinalität aus dem Schema und sind profilierbar. Ein `Code.*`-Typ ist ein
  Codelisten-Blatt mit Werteauswahl. Rekursion (`Type.GDS.Akte` innerhalb eines
  Akten-Teilbaums) bricht über `recursive` ab. Fehlt der Typ im aktiven Schema
  (Versionswechsel, Fremdschema), wird der Knoten zum Blatt und trägt eine **rote**
  Warnung — das Profil bleibt unangetastet. Ein Typwechsel mit Festlegungen darunter
  fragt mit Zahl zurück; sinngemäß nennt die Löschfrage die betroffene Zahl.
- **Exporte:** Beispiel-XML enthält Erweiterungen immer (typkonformer Platzhalter) und
  trägt bei Erweiterungen einen Warnkommentar im Kopf („gegen XJustiz `<version>` nicht
  gültig"); Excel kennzeichnet mit Typ `[Erweiterung] …`, die Druckansicht mit
  `[Schema-Erweiterung]`.
- **Gesperrt bei Erweiterungen (#98):** „Testnachricht erstellen…" im Kachelmenü des
  Dashboards, der Listeneintrag im Testdaten-Speicher („aus Profilierung") und der
  Schematron-Export. Die Bedienelemente bleiben **sichtbar und gesperrt**, mit der
  Begründung im `title` (am Wrapper, nicht am Knopf — über `disabled`-Controls feuert
  kein Mausereignis) und einer Zeile im Menüpunkt, die den Grund ohne Hover nennt —
  ein verschwundener Eintrag wäre ein Rätsel für den, der gerade eine Erweiterung
  angelegt hat.
- **Validierung:** Fehler, die nur auf Erweiterungen zurückgehen, sperren den
  Beispiel-XML-Download nicht; im Bericht sind sie
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
- Sperre (#98): `core/util/erweiterung-sperre.ts` (`sperrtPruefartefakte`,
  `ERW_SPERRE_GRUND`, `erweiterungsWarnung`), Signal `StateService.hatErweiterungen`;
  Bindung in `Dashboard`, `Testdaten`, `Objektleiste` und als Guard in
  `ExportService.exportSchematron` / `Testdaten.chooseProfil`.
- Tests: `erweiterung-sperre.spec`, `testdaten.spec`, `dashboard.spec`,
  `state.service.spec`, `tree.service.spec`, `export.service.spec`,
  `validation-marker.service.spec`, `testmessage-*.spec`, `excel-export.service.spec`,
  `persistence.service.spec`, `server/profiles.test.js`.

## Bekannte Einschränkungen

- Diff und Instanz-Import bleiben schema- bzw. instanzgetrieben — Erweiterungen
  erscheinen dort bewusst nicht. Der geführte Durchlauf steigt seit #97 im
  **Profilierungsmodus** in den Teilbaum einer typisierten Erweiterung ab; bestehende
  Profile mit Erweiterungen verschieben dadurch ihren gespeicherten `fortschritt` beim
  nächsten Speichern (kein Teil des Fach-Hashes).
- Der Duplizieren-Button ist an Erweiterungs-Kästen ausgeblendet (bewusst kleiner
  Scope; wiederholte Vorkommen über die Kardinalität dokumentieren).
