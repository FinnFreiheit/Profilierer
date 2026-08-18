# ADR 0018: „Ist in der Nachricht enthalten" ist eine Regel (ergänzt 0015)

- Status: Angenommen
- Datum: 26.08.11

## Kontext

Die Frage „enthält die Nachricht dieses Element?" wurde an zwei Stellen unabhängig
beantwortet — und die Antworten widersprachen sich.

**Beim Schreiben** entschied `ExportService.include`:

- Die Kardinalität las es roh aus eigener Schicht plus Schema
  (`elemente()[path]?.min || node.min`) statt über `state.effKard` — die **Mindestanzahl
  der gebundenen Fassung blieb unbeachtet**. Jeder andere Konsument der Kardinalität
  (Baum, Druck, `GuidedService.zwingend`, die Kardinalitäts-Sperren) ging über `effKard`;
  `include` war der einzige Ausreißer.
- Die Wirkung las es über `wirkungOf` → `statusOf`, das die Vorgabe **pfadgenau** greift.
  Ohne `ohneVorkommen`-Rückfall wirkte eine generisch gesetzte Vorgabe-Pflicht im
  Vorkommen (`…@a1`) nicht — derselbe Fehler, den [#59](https://github.com/FinnFreiheit/Profilierer/issues/59)
  an anderen Stellen behoben hat.

**Beim Lesen** entschied `VorgabeSicht.vorkommenAnzahl` nach der Zählkonvention aus
ADR 0015: kein Eintrag und kein Ausschluss ⇒ **ein** Vorkommen — unabhängig davon, ob der
Export das Element überhaupt schreibt.

Der Widerspruch war erreichbar: Die Profilierung grenzt ein im Schema optionales Element
auf `min = 1` ein, ohne Statusstufe; der Durchlauf trägt nichts ein. Der Abgleich beim
Speichern zählte 1 und meldete nichts, das erzeugte XML enthielt das Element nicht — die
gespeicherte Nachricht **verletzte die Vorgabe und galt als konform**. Abgemildert
(nicht beseitigt) durch `GuidedService.zwingend`, das eine Vorgabe-Untergrenze zum
Pflicht-Rückgrat macht; offen blieb es bei Containern ohne befüllte Kinder, in Vorkommen
und bei als Entwurf gespeicherten Nachrichten.

Aufgefallen ist das bei der Vorarbeit zu „Testnachricht gegen eine Profilierung prüfen"
([#107](https://github.com/FinnFreiheit/Profilierer/issues/107)): dort wird dieselbe
Nachricht ein zweites Mal geprüft, und zwei Berichte über dieselbe Nachricht hätten
Verschiedenes gesagt.

## Entscheidung

**Eine Regel, ein Ort.** `core/enthalten.ts` formuliert sie als reine Funktion über vier
Angaben (`EnthaltenLage`): Wirkung, effektive Mindestanzahl, eigener Inhalt, Inhalt
darunter. Reihenfolge der Gründe: ausgeschlossen ⇒ nein; zwingend ⇒ ja; Mindestanzahl
≥ 1 (Schema **oder** Profilierung) ⇒ ja; sonst entscheidet der Inhalt — die Fortsetzung
von ADR 0016 („der Wert entscheidet").

**Eine Auflösung, ein Ort.** `StateService.enthaltenLage` löst die vier Angaben auf —
genau dort waren die Kopien auseinandergelaufen. Wirkung: eigene Entscheidung pfadgenau,
sonst Vorgabe **mit Vorkommen-Erbe**. Kardinalität: über `effKard`, also inklusive
Vorgabe. Inhalt: allein aus der Entscheidungsschicht — ein Beispielwert der Vorgabe wird
angeboten, nicht gesetzt (#29) und ist darum kein Inhalt.

**Die Leseseite fragt statt zu raten.** `VorgabeSicht.vorkommenAnzahl` nimmt die Antwort
über die Umgebung entgegen (`KonformitaetsUmgebung.istEnthalten`, nach dem Muster von
`istBlatt`). Der Sitzungs-Adapter beantwortet sie aus derselben Regel; `null` heißt
„keine Auskunft" (der Baum kennt den Pfad nicht — ein Pfad aus einer alten Fassung soll
keinen Verstoß erfinden, dieselbe Entscheidung wie `GuidedService.kardLage`, #49). Ohne
Umgebung gilt weiterhin die Zählkonvention aus ADR 0015.

**Bewusst außerhalb der Regel:** Schema-Erweiterungen und erzwungene Verweis-Kennungen
(`forced`) — das sind Gründe des Serialisierers, keine Aussage der Profilierung über das
Element. Ebenso `gruppeAktiv`: eine synthetische Gruppe ist kein Element der Nachricht,
dort wird nur über den Abstieg entschieden.

## Konsequenzen

- ADR 0015 gilt fort, aber die Zählkonvention ist jetzt der **Rückfall**, nicht die
  einzige Lesart. Wer das Schema hat, bekommt die belastbare Zahl; wer es nicht hat,
  bekommt eine ehrlich begründete schwächere.
- **Verhaltensänderung:** Eine Vorgabe-Mindestanzahl an einem schema-optionalen Element
  bringt es jetzt ins erzeugte XML, und der Abgleich meldet ihre Verletzung durch
  Abwesenheit. Nachrichten, die vorher als konform galten, können als Entwurf gespeichert
  werden — das ist die Korrektur, nicht ein Nebeneffekt.
- Das Beispiel-XML der Profilierung (`instanz: false`) bleibt unverändert: ohne gebundene
  Vorgabe liest die neue Auflösung dieselben Werte wie die alte.
- `hasProfilBelow` ist als `StateService.inhaltDarunter` aus der Export-Closure heraus und
  damit einzeln prüfbar; es nutzt `unterPfad` aus `pfad.util` statt eigener
  `startsWith`-Vergleiche.
- Abgesichert in `enthalten.spec.ts` (die Regel), `state.service.spec.ts` (die
  Auflösung: Vorgabe-Kardinalität, Vorkommen-Erbe, Vorgabe-Beispiel ist kein Inhalt),
  `export.service.spec.ts` (die Untergrenze bringt das Element ins XML),
  `vorgabe-sicht.spec.ts` und `konformitaet.service.spec.ts` (Auskunft schlägt Rückfall,
  `null` fällt zurück).

## Nachtrag 26.08.18: Auswahl-Zweige tragen keine Mindestanzahl

Am laufenden System gemeldet: eine aus einer Profilierung erstellte Testnachricht wurde
beim Speichern als „nicht profilkonform" abgewiesen, weil in **nicht gewählten** Zweigen
einer Auswahl Werte fehlten, die die Profilierung dort zwingend setzt.

Ursache war die dritte Regelstufe. Ein Zweig einer `xs:choice` trägt im Schema
`minOccurs="1"` (der Vorgabewert) — gemeint ist „einer der Zweige", nicht „dieser Zweig".
Die Regel las das als „enthalten" und antwortete für **jeden** Zweig mit ja. Die
Serialisierung merkte davon nichts (sie fragt an dieser Stelle gar nicht, sondern wählt
den Zweig über `GuidedService.gewaehlterZweig`); der Konformitäts-Abgleich fragt jedoch
über die Vorfahrenkette, und weil kein Vorfahr mehr „nein" sagte, griff die
Elternabhängigkeit aus ADR 0016 nicht: jede zwingende Festlegung unter einem übergangenen
Zweig wurde als fehlender Wert gemeldet. In XJustiz ist `auswahl_*` der Regelfall, der
Befund also kein Randfall — es ist derselbe Fehlerbild, den der Abgleich für die
Vorfahrenkette bereits kannte, nur eine Ebene tiefer.

**Entscheidung:** `EnthaltenLage` trägt zusätzlich `inAuswahl` (aufgelöst aus
`TreeNode.inChoice`); die Mindestanzahl begründet das Enthaltensein **nicht**, solange der
Pfad ein Auswahl-Zweig ist. Über die Aufnahme entscheidet dort allein die Wahl —
ausdrücklich (die Führung setzt `pflicht` am gewählten Zweig, `ausgeschlossen` an den
Geschwistern) oder über den Inhalt (ADR 0016). Dieselbe Lesart hat die Kardinalitäts-Sperre
`kardSperreZweigwechsel` schon vorher vertreten: der schema-eigene `min=1` eines Zweigs
zählt nicht mit, sonst wäre jede Auswahl unveränderlich.

**Konsequenzen:** Die Serialisierung ändert sich nicht (sie fragt für Zweige nicht).
Eine **Mindestanzahl der Profilierung** an einem Zweig wirkt weiterhin — sie ist eine
Aussage über genau diesen Zweig und wird jetzt auch als Verstoß gemeldet, wenn die
Nachricht einen anderen Zweig wählt. Abgesichert in `enthalten.spec.ts` (die Regel) und
`konformitaet-sitzung.spec.ts` (der Sitzungs-Adapter am **echten** Baum — dort fällt die
Auskunft, die `konformitaet.service.spec.ts` nur simuliert; genau deshalb blieb die Lücke
unentdeckt).
