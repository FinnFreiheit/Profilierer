# US-Story: Hochgeladene Testnachricht bearbeiten

Status: umgesetzt (26.07.29) · Typ: Story · Oberthema: Testdaten-Speicher

## Ausgangslage

Eine hochgeladene Testnachricht ließ sich nur **betrachten**. Die Bausteine für
das Bearbeiten waren zwar alle da — der Baum-Editor bindet die Instanz gegen das
Schema (`InstanceImportService`), der Re-Export ist getreu
(`InstanceExportService`) —, aber der Weg dorthin war verstellt:

- Der Kachel-Klick öffnete gesperrt (`readOnly`), umschalten ging nur über ein
  Häkchen im **Ansicht-Menü**. Dort sucht das niemand.
- `onlyValues` versteckte alles Unbelegte. Neue Angaben ließen sich also nicht
  einmal finden, geschweige denn eintragen.
- Speichern legte **immer einen neuen Eintrag** an — jedes Speichern erzeugte ein
  Duplikat, weil die `MessageEditSession` den Testspeicher-Eintrag nicht kannte.
- Ein geleerter Wert entfernte nichts: der Export ließ das Original stehen,
  wenn im Modell kein Wert stand.

## Story

> **Als** Anwender, der eine Testnachricht im Testdaten-Speicher liegen hat,
> **möchte ich** sie bearbeiten — vorhandene Angaben ändern, neue hinzufügen,
> überflüssige entfernen und Vorkommen anlegen oder löschen —,
> **damit ich** Testdaten weiterentwickeln kann, ohne bei jedem Zwischenstand eine
> neue Nachricht anzulegen oder außerhalb des Werkzeugs im XML zu arbeiten.

## Entscheidungen

- **Zwei Speicherwege statt einem.** „Speichern" schreibt in denselben Eintrag
  zurück; „Als neue Nachricht speichern" bleibt als Zweitweg, um eine Variante aus
  einer Vorlage abzuleiten. Der erste Button erscheint nur, wenn die Nachricht aus
  dem Testspeicher stammt — Datei-Upload und Drag&Drop haben keine id und kennen
  weiterhin nur den zweiten.
- **Betrachten bleibt der Default.** Der Kachel-Klick öffnet unverändert gesperrt
  (abgestimmt in [xjustiz-nachricht-inspizieren](xjustiz-nachricht-inspizieren.md));
  eine eigene Kachel-Aktion „Bearbeiten" öffnet direkt editierbar.
- **Bearbeiten schaltet „nur Werte" ab.** Sonst blieben unbelegte Elemente
  unsichtbar und ließen sich nicht befüllen. Die Regel ist bewusst grob und
  vorhersagbar: _Betrachten = die Nachricht, Bearbeiten = der Standard mit den
  Werten der Nachricht._ Ein Zwischenmodell („belegt + eine Ebene") wäre eine
  Sackgasse, weil ein in der Instanz komplett fehlender Container nie als
  „belegt" gilt.
- **Geführt erstellte Nachrichten werden geführt fortgesetzt.** Dort ist der
  gespeicherte Entscheidungsstand die Wahrheit; die Instanz-Bearbeitung würde ihn
  veralten lassen. Die Kachel-Aktion routet entsprechend.
- **Entfernen nutzt die vorhandene Ausschluss-Mechanik.** Kein neues Modellfeld —
  nur eine andere Beschriftung, weil „ausgeschlossen im Szenario" in einer Instanz
  nichts aussagt.

## Akzeptanzkriterien

- Die Testdaten-Kachel hat eine Aktion **„Bearbeiten"**, die die Nachricht direkt
  im Bearbeitungsmodus öffnet. Die bisherige gleichnamige Aktion (Name und
  Beschreibung) heißt jetzt **„Umbenennen…"**.
- In der Toolbar steht ein sichtbarer Umschalter **Betrachten | Bearbeiten**; er
  wechselt ohne Neuladen. Das frühere Häkchen „Nur betrachten" entfällt im
  Nachrichten-Modus.
- Im Bearbeitungsmodus lassen sich:
  - **Werte ändern** — inline im Baum oder im Detailpanel, mit Typprüfung gegen
    die XSD-Facetten und Codelisten-Auswahl,
  - **Angaben hinzufügen** — ein Wert in einem bislang leeren Blatt; der Export
    erzeugt das Element an schema-korrekter Position inklusive Pflichtkindern,
  - **Angaben entfernen** — `✕` am Knoten bzw. „Angabe entfernen" im Detailpanel;
    auch ein geleerter Wert entfernt die Angabe,
  - **Vorkommen anlegen, kopieren und löschen** — `⧉`, „+ Vorkommen", `✕`.
- **„Speichern"** schreibt in denselben Eintrag zurück: `eigeneNachrichtenID` und
  `erstellungszeitpunkt` bleiben unangetastet (es ist dieselbe Nachricht), Größe
  und Änderungszeitpunkt pflegt das Backend. Es entsteht **kein** zweiter Eintrag.
- Ist das Ergebnis nicht schema-valide, bietet eine Rückfrage das Speichern als
  gekennzeichneten **Entwurf** an und zeigt den Prüfbericht. Eine reparierte
  Nachricht verliert das Kennzeichen wieder. **„Als neue Nachricht speichern"**
  bleibt dagegen hart gesperrt — neue Einträge durchlaufen dasselbe Tor wie der
  Upload.
- Bei einer von der BLK-AG **abgenommenen** Nachricht ist für Externe die
  Kachel-Aktion gesperrt, der Umschalter deaktiviert und „Speichern" gesperrt
  (der Server wiese den PATCH ohnehin mit 403 ab). Mit AG-Schlüssel ist alles
  offen. Der Schutz wird beim Öffnen jeder Nachricht **neu gesetzt**, also auch
  gelöst.
- Der Baum spricht im Nachrichten-Modus Instanz-Sprache: „Angabe entfernen" statt
  „Ausblenden", „Vorkommen" statt „Ausprägung", Status-/Kardinalitäts-Profilierung
  und Review-Notizen sind ausgeblendet.

## Akzeptierte Einschränkungen

- Wird eine **geführt erstellte** Nachricht über die Instanz-Bearbeitung
  gespeichert (Fallback, wenn ihr Entscheidungsstand nicht ladbar ist), bleibt der
  gespeicherte Stand serverseitig stehen und passt dann nicht mehr zum XML. Eine
  `confirm`-Rückfrage weist darauf hin; ein Zurücksetzen wäre eine API-Erweiterung
  (`tmUpdate` kennt nur „unverändert").
- Wechselt der Anwender bei offener abgenommener Nachricht die Rolle, bleibt der
  Schreibschutz stehen, bis die Kachel neu geöffnet wird — bewusst konservativ.
- Ein Pflichtelement zu leeren entfernt es und macht die Nachricht invalide. Das
  ist beabsichtigt und wird über Entwurfs-Kennzeichen plus Prüfbericht sichtbar.

## Betroffene Bausteine

- Session/Export: `src/app/models/testmessage.model.ts` (`entryId`,
  `vorkommenIndex`), `src/app/core/services/instance-import.service.ts`,
  `instance-export.service.ts`
- Modus: `src/app/core/services/state.service.ts` (`nachrichtBearbeiten`)
- Ablauf: `src/app/core/services/testmessage-edit.service.ts` (neu),
  `src/app/app.ts`
- UI: `src/app/features/toolbar/`, `src/app/features/testdaten/`,
  `src/app/features/tree/`, `src/app/features/detail/`
