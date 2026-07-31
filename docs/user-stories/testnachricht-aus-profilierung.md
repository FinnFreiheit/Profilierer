# US-Story: Testnachricht geführt aus einer Profilierung erstellen

Status: verfeinert (Refinement 26.07.30) · Typ: Story mit Vollständigkeits-Anspruch · Oberthema: Testdaten-Speicher

## Ausgangslage

Der Testdaten-Speicher kennt heute drei Quellen für Testnachrichten:

1. **Upload** bestehender XJustiz-Instanzen (Root `nachricht.*`),
2. **„Aus Profilierung erzeugen"** — Beispielnachricht mit Platzhalter-/Zufallswerten
   aus einer gespeicherten Profilierung, ein Klick
   (`TestmessageGenerationService.erzeugeAusProfil`), und
3. **geführt aus dem Schema**
   ([testnachricht-gefuehrt-erstellen](testnachricht-gefuehrt-erstellen.md)) —
   Knoten für Knoten, jedes Pflichtfeld aktiv befüllt, mit Entwurfs-Kennzeichen
   und Fortsetzen (`TestmessageCreateService`, `GuidedService` im Instanz-Modus).

Was fehlt, ist die Verbindung von 2 und 3: eine Testnachricht **zu einer
Profilierung** geführt zu erstellen — schemakonform **und**
profilierungskonform. Der Ein-Klick-Weg liefert Zufallswerte, die fachlich
nichts aussagen; der geführte Schema-Weg kennt die Festlegungen des Szenarios
nicht und bietet dem Anwender Elemente an, die das Profil ausgeschlossen hat.

Genau dieser Fall wurde in der Schema-Story bewusst herausgehalten
(„Profilierungs-Bezug … eigene Story"). Er wird hier eingelöst — und ersetzt
dabei den bisherigen Ein-Klick-Weg (siehe Refinement-Entscheidungen).

Bereits vorhanden und wiederverwendbar:

- **Führung im Instanz-Modus:** `GuidedService` (Entscheidungspunkte in
  Dokumentreihenfolge, Pflicht-Blätter als Wert-Punkte, aufnehmen/weglassen,
  `choice` = genau ein Zweig, Vorkommen, Fortschritt „X von Y", nächster offener
  Punkt, Würfel je Feld und global).
- **Sitzung, Speichern, Fortsetzen:** `TestmessageCreateService`,
  `MessageCreateSession`, `GuidedMessageState` (XML + Entscheidungsstand am
  Testspeicher-Eintrag), Entwurfs-Kennzeichen und Fortschritt.
- **Profil-Modell:** `ProfileDoc` mit Wirkungen (`pflicht`/`optional`/
  `ausgeschlossen`/`markierung`), Kardinalitäts-Overrides, Ausprägungen samt
  Unter-Profilierung, Codelisten-Einschränkung `werte`, Beispielwert,
  Anmerkung, Verweisziel `refZiel`, Schema-Erweiterungen.
- **Profil-Versionen und Abnahme:** nummerierte Snapshots, eingefrorene
  Abnahme-Fassung, `ProfilDiffService` (Vergleich zweier Profil-Stände).
- **Schema-Bezug:** `TestmessageGenerationService.ensureSchema`,
  `BundledSchemaService`; XSD-Prüfung über `XmlValidationService` /
  `ValidationReportService` / `ValidationMarkerService`.
- **Ausblenden von Ausgeschlossenem:** Schalter „nur Profil".

## Refinement-Entscheidungen

**Verhältnis zum bisherigen Ein-Klick-Weg**

- Die geführte Erstellung **ersetzt** „Aus Profilierung erzeugen" in seiner
  heutigen Form. Es gibt künftig genau einen Weg von der Profilierung zur
  Testnachricht, und der führt über bewusste Werte.
- Der Schnellfall bleibt erreichbar, ohne eine zweite Semantik einzuführen:
  Durchlauf starten → „alle offenen Pflichtfelder füllen" → speichern. Der
  Unterschied zu früher ist sichtbar und gewollt — wer zufällig befüllt, hat es
  selbst getan.

**Einstieg und Bindung**

- **Zwei Einsprungpunkte, ein Ablauf:** die Profil-Kachel im Dashboard (der
  heutige Knopf startet künftig die Führung) und der Testspeicher-Dialog „Neue
  Testnachricht erstellen…", der oben die Wahl **„aus Schema" / „aus
  Profilierung"** bekommt. Bei „aus Profilierung" entfällt die Auswahl von
  Version und Nachricht — beides ergibt sich aus dem Profil.
- **Gebundene Fassung wird beim Start gewählt:** Arbeitsstand oder eine
  nummerierte Version. Bei abgenommenen Profilen ist die **Abnahme-Fassung**
  vorbelegt — Testdaten zu einem abgenommenen Szenario dürfen nicht gegen einen
  Stand entstehen, den es so nie gab.
- **Eingefrorene Kopie statt Referenz:** Die gewählte Fassung wird als Kopie am
  Testnachrichten-Eintrag abgelegt. Nur so gibt es auch bei Bindung an den
  Arbeitsstand eine stabile Bezugsgröße, und der Eintrag bleibt auswertbar,
  wenn das Profil später verändert oder gelöscht wird.
- **Zwei Schichten:** Die eingefrorene Profilkopie ist unveränderliche Vorgabe;
  die Entscheidungen des Anwenders liegen als eigene Schicht darüber. Vorgabe
  und Nutzerentscheidung bleiben damit unterscheidbar — Voraussetzung für den
  Konformitätsabgleich und für das Fortsetzen von Entwürfen.

**Wirkung des Profils auf den Durchlauf**

Maßgeblich ist die **Wirkung** der Statusstufe, nicht ihr Name (Stufen sind je
Profil frei konfigurierbar):

| Wirkung im Profil          | Verhalten beim Erstellen                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ausgeschlossen`           | nicht befüllbar, kein Entscheidungspunkt, erscheint nie in der Instanz                                                 |
| `pflicht`                  | vorhanden und **muss** befüllt werden — kein „weglassen", auch bei Schema-`min=0`                                      |
| `optional`                 | Entscheidungspunkt **aufnehmen / weglassen**                                                                           |
| `markierung` („zu klären") | wie `optional`, zusätzlich sichtbarer Hinweis am Element; beim Speichern Sammelmeldung „N ungeklärte Elemente berührt" |

- **Offene Welt bei Schweigen des Profils:** Elemente ohne Festlegung folgen der
  Schema-Semantik (Pflicht bleibt Pflicht, Optionales wird Entscheidungspunkt),
  tragen aber den neutralen Marker **„nicht profiliert"**; ihre Zahl nennt der
  Speicherdialog. Eine geschlossene Welt („nicht profiliert = nicht verwendet")
  würde bei jedem unvollständigen Profil Schema-Pflichtfelder unterschlagen und
  damit die Schemakonformität brechen. Bei vollständig durchentschiedenen
  Profilen fallen beide Lesarten ohnehin zusammen.
- **Ausgeschlossenes ist standardmäßig ausgeblendet**, über den vorhandenen
  Schalter **„nur Profil"** sichtbar zu machen (dann ausgegraut/durchgestrichen
  ohne Eingabefeld). Kein zweites Ausblendkonzept neben dem bestehenden.

**Kardinalität**

- **Hart:** Profil-`min` wird automatisch als Vorkommen angelegt und ist nicht
  entfernbar; bei erreichtem Profil-`max` ist „+ weiteres Vorkommen" gesperrt,
  mit Begründung am Knopf. Kardinalität wird später als Schematron-Regel scharf
  geschaltet — eine Testnachricht, die dagegen verstößt, würde die Prüfung des
  eigenen Profils nicht bestehen.
- **Konfliktregel:** Trägt ein Element `ausgeschlossen` **und** `min ≥ 1`,
  gewinnt der Ausschluss; der Widerspruch wird beim Start des Durchlaufs als
  Profil-Mangel gemeldet (mit Sprung zum Element im Profil-Editor), statt eine
  der beiden Aussagen stillschweigend zu unterschlagen.

**Ausprägungen**

- **Materialisierung nach Wirkung:** Ausprägungen mit Wirkung `pflicht` werden
  automatisch als Vorkommen angelegt, tragen ihren Namen sichtbar und sind
  nicht entfernbar; `optional` erscheint als Entscheidungspunkt
  aufnehmen/weglassen; ausgeschlossene tauchen nicht auf. Innerhalb jedes
  Vorkommens gilt die jeweilige **Unter-Profilierung**.
- **Keine freien Vorkommen:** Definiert das Profil Ausprägungen, entsteht jedes
  weitere Vorkommen als **Kopie einer vorhandenen Ausprägung** (Auswahl
  welcher) — nicht als leeres, unprofiliertes Vorkommen. Dieselbe Ausprägung
  darf beliebig oft vorkommen, soweit Schema- bzw. Profil-`max` es zulassen.

**Werte, Codelisten, Verweise**

- **Beispielwert des Profils wird vorgeschlagen, nicht vorbelegt:** kursiv mit
  „übernehmen"; der Punkt bleibt offen, bis der Anwender übernimmt oder etwas
  anderes einträgt. Vorbelegte Felder werden nicht mehr angesehen — das ist
  genau der Zustand, den die Führung vermeiden soll.
- Dasselbe gilt für eine auf **genau einen Wert** eingeschränkte Codeliste: sie
  wird vorgeschlagen, nicht gesetzt.
- **Codelisten-Einschränkung ist hart:** auswählbar sind ausschließlich die im
  Profil freigegebenen Werte, keine freie Eingabe.
- **Anmerkung des Profils** erscheint als Hilfetext am Entscheidungspunkt — sie
  ist oft die Begründung, warum das Feld so aussehen muss.
- **Verweise:** Der Entscheidungspunkt fragt nach dem **Ziel-Vorkommen**
  („welcher Beteiligte?"), nicht nach der Nummer; die Nummer vergibt das
  Werkzeug an beiden Enden konsistent. Existiert genau ein zulässiges Ziel, ist
  der Punkt automatisch erledigt. Das Profil-`refZiel` schränkt die
  Zielauswahl auf die dort festgelegte Ausprägung ein.

**Schema-Erweiterungen**

- Erweiterungen des Profils ([ADR 0010](../adr/0010-schema-erweiterungen-profil-overlay.md))
  werden **mit abgefragt**. Die entstehende Nachricht ist bewusst
  schema-abweichend und trägt — wie heute schon — den Hinweis statt des
  Entwurfs-Kennzeichens (`ValidationMarkerService.nurErweiterungsFehler`). Sie
  ohne die Erweiterungen zu erzeugen wäre nicht profilkonform, denn zwingend
  gesetzte Elemente fehlten.

**Prüfung, Speichern, Kennzeichnung**

- **Zwei Prüfungen beim Speichern:** XSD-Validierung wie bisher **und** ein
  Modell-Abgleich Instanz ↔ eingefrorene Profilkopie (belegte ausgeschlossene
  Pfade, verletzte Kardinalitäten, Werte außerhalb der Codelisten-Auswahl,
  fehlende zwingende Ausprägungen). Verstöße erzeugen einen Bericht und machen
  die Nachricht zum **Entwurf**. Reines „by construction" trägt nicht, weil eine
  Nachricht später bearbeitet oder gegen eine geänderte Fassung fortgesetzt
  werden kann.
- **Kachel:** Herkunftszeile „aus Profil _X_ (v3)" als Sprungmarke ins Profil;
  Badges **nur bei Abweichung** — „Profil weiterentwickelt" (gebundene Fassung
  ist nicht mehr die aktuelle, Vergleich über `ProfilDiffService`) und „nicht
  profilkonform". Kein positives „profilkonform"-Badge: es hinge an jeder Kachel
  und verdrängte die Badges mit Aussage.
- **Kein automatisches Nachziehen** bei Profiländerung. Ein Nachziehen könnte
  Werte löschen oder Pflichtfelder aufreißen — an Testdaten, die gerade in einem
  Test verwendet werden.

**Leben nach dem Speichern**

- **Bearbeiten hält die Bindung aktiv:** Beim Öffnen über „Testnachricht
  bearbeiten" wird die eingefrorene Profilkopie mitgeladen; Sperren, Führung und
  Abgleich gelten weiter.
- **„Profilbindung lösen"** ist der bewusste Ausstieg — für Negativtests („was
  passiert, wenn ein ausgeschlossenes Element doch kommt?"). Die Nachricht
  verliert Badge und Sperren, behält die Herkunftsangabe als Historie.
- **Serie:** Nach dem Speichern „**Weitere Testnachricht zu diesem Profil**" —
  neuer Durchlauf mit derselben Bindung, wahlweise leer oder als **Kopie** der
  eben gespeicherten (Werte stehen drin, werden angepasst). Der typische Fall
  ist „dieselbe Nachricht, ein Feld anders".

## Story

> **Als** Anwender, der Testdaten zu einem abgestimmten Kommunikationsszenario
> braucht,
> **möchte ich** zu einer Profilierung eine oder mehrere Testnachrichten geführt
> erstellen — die Profilfassung wählen und dann Knoten für Knoten die Werte
> selbst setzen, wobei das Werkzeug alles ausblendet und sperrt, was das Profil
> ausschließt, zwingende Elemente und Ausprägungen von sich aus anlegt,
> Beispielwerte und zulässige Codelisten-Werte vorschlägt und Verweise über die
> Wahl des Ziel-Vorkommens auflöst,
> **damit ich** Testnachrichten erhalte, die zugleich **schemakonform** und
> **profilierungskonform** sind, die fachlich sinnvolle Werte tragen statt
> Zufallsdaten, und bei denen jederzeit nachvollziehbar bleibt, gegen welche
> Fassung welchen Profils sie entstanden sind.

## Akzeptanzkriterien

### A. Einstieg und Bindung

- Der Weg startet an der Profil-Kachel im Dashboard **und** im Testspeicher über
  „Neue Testnachricht erstellen…" mit der Wahl „aus Schema" / „aus
  Profilierung"; beide führen in denselben Ablauf.
- Bei „aus Profilierung" werden Version und Nachricht **nicht** abgefragt — sie
  stammen aus dem Profil; fehlt die passende Schemaversion, bricht der Start mit
  verständlicher Meldung ab.
- Vor dem Durchlauf wird die zu bindende Fassung gewählt (Arbeitsstand oder
  nummerierte Version); bei abgenommenen Profilen ist die Abnahme-Fassung
  vorbelegt.
- Die gewählte Fassung wird als **eingefrorene Kopie** am Testnachrichten-Eintrag
  gespeichert; sie bleibt auswertbar, auch wenn das Profil später geändert oder
  gelöscht wird.
- Widersprüche im Profil (`ausgeschlossen` bei `min ≥ 1`) werden beim Start
  gemeldet, mit Sprung zum betroffenen Element.

### B. Ausgeschlossenes ist nicht befüllbar

- Elemente mit Wirkung `ausgeschlossen` sind kein Entscheidungspunkt, tragen
  kein Eingabefeld und erscheinen nie in der erzeugten Instanz.
- Standardmäßig sind sie ausgeblendet; über „nur Profil" werden sie sichtbar —
  ausgegraut, gesperrt, mit Begründung im Tooltip.
- Der Ausschluss vererbt sich auf den Teilbaum (wie im Profil-Editor).

### C. Pflicht aus dem Profil

- Elemente mit Wirkung `pflicht` sind vorhanden, nicht abwählbar und müssen
  typkonform befüllt werden — auch dort, wo das Schema `min=0` erlaubt.
- Elemente mit Wirkung `optional` bleiben Entscheidungspunkt
  aufnehmen/weglassen; unbeantwortet zählt als offen.
- Elemente mit Wirkung `markierung` verhalten sich wie `optional`, tragen einen
  „zu klären"-Hinweis, und ihre Zahl erscheint beim Speichern.
- Elemente ohne Festlegung folgen der Schema-Semantik, tragen den Marker „nicht
  profiliert", und ihre Zahl erscheint beim Speichern.

### D. Kardinalität

- Profil-`min` wird automatisch angelegt und lässt sich nicht entfernen.
- Bei erreichtem Profil-`max` ist „+ weiteres Vorkommen" gesperrt und nennt den
  Grund.

### E. Ausprägungen

- Zwingende Ausprägungen des Profils sind als benannte Vorkommen vorhanden und
  nicht entfernbar; optionale erscheinen als Entscheidungspunkt; ausgeschlossene
  gar nicht.
- Innerhalb eines Vorkommens gelten die Festlegungen der jeweiligen
  Unter-Profilierung (Status, Kardinalität, Werte, Beispielwerte).
- „+ weiteres Vorkommen" legt eine **Kopie einer profilierten Ausprägung** an
  (Auswahl welcher); ein leeres, unprofiliertes Vorkommen ist nicht möglich,
  solange das Profil für das Element Ausprägungen definiert.

### F. Werte

- Ein Beispielwert des Profils erscheint als Vorschlag mit „übernehmen"; das
  Feld gilt erst nach Übernahme oder eigener Eingabe als erledigt.
- Bei eingeschränkter Codeliste sind ausschließlich die freigegebenen Werte
  auswählbar (mit Beschreibung); freie Eingabe ist gesperrt. Auch ein einzelner
  freigegebener Wert wird nur vorgeschlagen.
- Die Anmerkung des Profils erscheint als Hilfetext am Entscheidungspunkt.
- Würfel je Feld und „alle offenen Pflichtfelder füllen" bleiben verfügbar und
  erzeugen **profilkonforme** Werte (nur freigegebene Codelisten-Werte;
  Beispielwert des Profils hat Vorrang vor einem Zufallswert).

### G. Verweise

- Verweis-Elemente fragen das Ziel-Vorkommen ab, nicht die Nummer; die Nummern
  werden an beiden Enden konsistent vergeben.
- Legt das Profil ein `refZiel` fest, ist die Zielauswahl auf Vorkommen dieser
  Ausprägung eingeschränkt.
- Gibt es genau ein zulässiges Ziel, ist der Punkt ohne Zutun erledigt.

### H. Erweiterungen

- Schema-Erweiterungen des Profils sind reguläre Entscheidungspunkte.
- Eine Nachricht, deren XSD-Fehler ausschließlich aus Erweiterungen stammen,
  gilt nicht als Entwurf, sondern trägt den entsprechenden Hinweis.

### I. Speichern und Prüfung

- Beim Speichern laufen XSD-Validierung **und** Profil-Abgleich gegen die
  eingefrorene Kopie; der Bericht nennt je Verstoß Element, Pfad und die
  verletzte Festlegung und springt in den Baum.
- Verstöße gegen das Profil machen den Eintrag zum Entwurf; offene rein
  optionale Entscheidungen lösen nur die bestehende Rückfrage aus.
- Der Eintrag speichert XML, Entscheidungsstand, Profil-Referenz (Name, ID,
  Fassung) und die eingefrorene Profilkopie.

### J. Kennzeichnung und Nachverfolgbarkeit

- Die Kachel nennt „aus Profil _X_ (v3)"; ein Klick springt ins Profil.
- Badges erscheinen nur bei Abweichung: „Profil weiterentwickelt" (gebundene
  Fassung ≠ aktueller Stand) und „nicht profilkonform".
- Der Testspeicher lässt nach Profil filtern.
- Ein automatisches Nachziehen auf eine neue Profilfassung findet nicht statt.

### K. Bearbeiten, Ausstieg, Serie

- Beim Öffnen einer profilgebundenen Nachricht über „Testnachricht bearbeiten"
  bleibt die Bindung aktiv (Sperren, Führung, Abgleich).
- „Profilbindung lösen" entfernt Sperren und Badge, behält die Herkunftsangabe;
  danach ist die Nachricht eine freie Instanz (Negativtests).
- Nach dem Speichern bietet der Durchlauf „Weitere Testnachricht zu diesem
  Profil" — leer oder als Kopie der eben gespeicherten, mit derselben Bindung.

### L. Ablösung des Ein-Klick-Wegs

- „Aus Profilierung erzeugen" in seiner heutigen Form (sofortige Erzeugung mit
  Platzhalterwerten) entfällt; der Knopf startet den geführten Durchlauf.
- Bestehende Einträge, die auf dem alten Weg entstanden sind, bleiben
  unverändert nutzbar (kein Datenmigrationsbedarf: sie haben keine Bindung).

## Bewusst außerhalb dieser Story

- **Varianten-Generator:** n Testnachrichten in einem Zug, systematisch variiert
  (je Ausprägungs-Kombination oder je Auswahl-Zweig eine). Eigene Story mit
  eigener Frage nach Kombinationskriterium und Explosionsschutz; diese Story
  legt mit der Bindung die Grundlage.
- **Echte Schematron-Prüfung** der erzeugten Nachricht (Engine im Browser; heute
  gibt es Schematron nur als Export). Eigene Story — dann auch für hochgeladene
  Fremdnachrichten.
- **Vorhandene Nachricht gegen ein Profil prüfen** („passen die Testdaten des
  Verfahrensherstellers zu unserem Szenario?"). Setzt auf dem Abgleich dieser
  Story auf, bringt aber eigene Fragen mit (Zuordnung fremder Vorkommen zu
  Ausprägungen, abweichende Nachrichtenversion).
- **Automatisches Nachziehen** einer Testnachricht auf eine neue Profilfassung.

## Betroffene Bausteine (Orientierung, kein Auftrag)

- Einstieg/Oberfläche: `src/app/features/dashboard/` (Profil-Kachel, Wahl der
  Fassung), `src/app/features/testdaten/` (Dialog „aus Schema / aus
  Profilierung", Herkunftszeile, Badges, Filter nach Profil, „weitere
  Testnachricht")
- Bindung/Sitzung: `src/app/core/services/testmessage-create.service.ts`
  (Profil-Variante des Starts, eingefrorene Kopie, Serie),
  `src/app/models/testmessage.model.ts` (`MessageCreateSession` um Profil-Bezug
  und Vorgabe-Schicht erweitern)
- Führung: `src/app/core/services/guided.service.ts` (Vorgabe-Schicht im Walk:
  Wirkungen, Kardinalität, Ausprägungs-Materialisierung, „nicht profiliert",
  Verweisziel als Entscheidungspunkt), `src/app/features/detail/detail-panel.ts`
  (Vorschlag „übernehmen", Hilfetext, Zielauswahl, Sperren mit Begründung),
  `src/app/features/tree/` (Ausblenden über „nur Profil", Marker)
- Abgleich: neuer Dienst „Profilkonformität" (Instanz ↔ Profilkopie),
  Berichtsdarstellung über `ValidationReportService` /
  `ValidationMarkerService`
- Werte: `src/app/core/services/value.service.ts` (profilkonforme Dummy-Werte),
  `src/app/core/services/codelist.service.ts` (eingeschränkte Auswahl)
- Vergleich der Fassungen: `src/app/core/services/profil-diff.service.ts`
- Ablösung: `src/app/core/services/testmessage-generation.service.ts`
  (Ein-Klick-Weg entfällt; `ensureSchema` bleibt als gemeinsamer Baustein)
- Persistenz: `src/app/core/services/testmessage-store.service.ts`,
  `server/db.js` + `server/routes/` (Felder Profil-Bezug, gebundene Fassung,
  eingefrorene Profilkopie, Konformitäts-Kennzeichen an `testmessages`)
