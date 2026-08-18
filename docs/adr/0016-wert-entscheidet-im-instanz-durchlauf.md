# ADR 0016: Im Instanz-Durchlauf entscheidet der Wert, nicht eine zweite Aussage

- Status: Angenommen
- Datum: 26.08.03

## Kontext

Der geführte Durchlauf für Testnachrichten ist als Zwilling der geführten Profilierung
entstanden: derselbe `GuidedService`, dieselbe Punkte-Mechanik, dieselbe Bedienung im
Detailbereich. Übernommen wurde damit auch die Grundform der Profilierung — **zu jedem
Punkt eine ausdrückliche Aussage**. Im Instanz-Modus hieß das an jedem optionalen Element
„aufnehmen" (Wirkung `pflicht`) oder „weglassen" (`ausgeschlossen`); unbeantwortet zählte
als **offen**, erst die Aufnahme ließ den Walk absteigen und den Export emittieren.

In einer konkreten Nachricht ist diese Aussage am Wertfeld doppelt: ein eingetragener Wert
sagt bereits, dass das Element vorkommt, ein leeres Feld, dass es fehlt. Die Folge war eine
Führung, die etwas verlangte, was die Nachricht nicht braucht:

- Dutzende „offen"-Marken an Elementen, die für die Vollständigkeit belanglos sind.
- Der Eindruck, man müsse — wie beim Profilieren — jedes Feld einzeln bescheiden, bevor
  man weiterdarf; „Nächster offener" führte immer wieder in dieselben Fragen zurück.
- Eine Rückfrage beim Speichern („N offene Entscheidungen zu optionalen Elementen"), die
  nichts über die Nachricht aussagte.

Nicht doppelt ist die Aussage am **Container**: er trägt keinen Wert. Ob unter
`beteiligter` etwas stehen soll, kann nur eine Handlung sagen — sonst müsste der Durchlauf
entweder jeden optionalen Ast des Schemas ausrollen oder ihn nie zeigen.

## Entscheidung

**Der Wert entscheidet.** Der Instanz-Durchlauf kennt Stationen, aber nur wenige davon
schulden eine Antwort:

| Station                        | Bedienung                                                        | offen?                          |
| ------------------------------ | ---------------------------------------------------------------- | ------------------------------- |
| Pflichtwert                    | Wert eintragen                                                   | ja, bis typkonform              |
| freier Wert (optionales Blatt) | Wert eintragen **oder** weiterblättern — keine Knöpfe            | nur bei typwidrigem Wert        |
| Container (optional)           | „angeben" (↓) betritt den Ast · „nicht angeben" (→) übergeht ihn | nie                             |
| Auswahl (`choice`)             | genau ein Zweig                                                  | ja, wenn sie belegt werden muss |

Daraus folgt:

- **Übergehen merkt sich nichts.** `→` speichert keine Aussage; an einem angegebenen
  Container nimmt „nicht angeben" die Angabe zurück. Ein `ausgeschlossen` schreibt der
  Neu-Durchlauf nur noch bei der Zweigwahl (`waehleZweig`) — als Aussage über die
  Geschwister, nicht über eine Absicht.
- **Ein befüllter Ast bleibt.** `angabeSperre` verweigert die Rücknahme, solange darunter
  Werte stehen: sonst wäre die Angabe stärker als der Wert, den sie beschreiben soll. Wer
  den Ast loswerden will, löscht die Werte oder entfernt die Angabe im Baum (`✕`).
- **Gezählt wird nur Geschuldetes.** `fortschritt()` liefert im Instanz-Modus „X von Y
  Pflichtangaben" (`zaehltZurPflicht`); ein freies Feld zählt erst mit, sobald ein Wert
  darin steht — was angegeben ist, muss auch stimmen. Die Speicher-Rückfrage entfällt
  ersatzlos.
- **Ein einzig befüllter Zweig gilt als gewählt** (`gewaehlterZweig`). Führung und
  Serialisierung lesen dieselbe Regel, damit im XML der Zweig steht, den der Durchlauf
  anzeigt; bei mehreren befüllten Zweigen bleibt die Auswahl offen, statt einen zu raten.
- **Eine Profil-Mindestanzahl ≥ 1 wird zur Pflicht.** Ohne Weglassen-Entscheidung gibt es
  keine Abwahl mehr, an der `kardSperreWeglassen` greifen könnte (ADR 0015): die
  Untergrenze macht das Element deshalb zum Pflicht-Rückgrat. Die Sperre selbst bleibt für
  Baum und Bearbeitungs-Modus bestehen.
- **Blättern ist die Grundbewegung.** Senkrecht läuft die Spur (`↓` zur nächsten Station —
  zugleich das Übergehen einer freien —, `↑` zurück), waagerecht die Tiefe (`←` gibt einen
  Container an und geht hinein, `→` wieder heraus). Die beiden Knöpfe am Container sind der
  Mausweg zu `←` und `↓`. Die **Zweig-Radios** der Auswahl geben die Pfeiltasten an die
  Führung ab (`App.onKeydown`/`istZweigWahl`): sonst blieben sie nach einem Klick auf einen
  Zweig im Radio hängen, wo der Browser-Standard den Zweig weiterschaltet, statt den
  Durchlauf fortzusetzen. Per Tab erreichbar und mit Leertaste bedienbar bleiben sie.
- **Die Hand bleibt auf der Tastatur.** Was zu wählen ist, trägt eine Ziffer: die Zweige einer
  Auswahl und die Ziele eines Verweises stehen als **eine** nummerierte Liste
  (`GuidedService.optionen`, `waehleOption`), aus der Anzeige und Taste dieselbe Nummer
  beziehen — zwei getrennte Nummerierungen liefen unweigerlich auseinander. Mehr als neun
  Optionen bekommen keine Nummer mehr (die Tastatur hat nur `1`…`9`); sie bleiben über Liste
  und Auswahlfeld erreichbar. `Enter` springt zur nächsten **offenen** Angabe (mit Umlauf),
  `↓` bleibt die Station-für-Station-Bewegung — Lücken schließen und durchblättern sind zwei
  verschiedene Absichten. Im Wert-Feld übernimmt `Enter` zugleich den Wert; einen Absatz macht
  dort `Shift+Enter`.
- **Pflichtangaben lassen sich nicht übergehen.** `ueberspringSperre` hält `↓`, `Enter` und
  „Weiter ›" an einer offenen Pflichtangabe oder einer unbelegten Pflicht-Auswahl fest und
  nennt den Grund. Festgehalten wird nur die Weiter-Bewegung: zurück, hinein/heraus, „Nächster
  offener" und jeder Klick im Baum bleiben frei — sonst wäre der Durchlauf an einer Stelle
  gefangen, die sich vielleicht erst später beantworten lässt.
- **Ein Verweis ohne Ziel wartet, statt zu blockieren.** Verweist die Nachricht auf ein
  Vorkommen, das es noch nicht gibt, ist die Station nicht zu beantworten: `verweisOhneZiel`
  nimmt ihr die Sperre, lässt sie aber **offen**. Weil „nächster offener" am Ende umläuft,
  kommt der Durchlauf von selbst dorthin zurück, sobald das Ziel angelegt ist. Die Alternative
  — festhalten, bis der Anwender den Durchlauf verlässt und das Ziel von Hand anlegt — machte
  genau den Fall unbedienbar, für den die Führung gedacht ist.
- **Die Verbindlichkeit ist sichtbar.** `stationArt(path)` ordnet jede Station ein und färbt
  sie in den Farben der Profilierung ein (`profile-defaults`): grün `#1D9E75`, wo die
  Nachricht die Angabe verlangt, orange `#BA7517`, wo sie frei ist. Getragen wird das im Baum
  vom Statusstreifen (auch im Mini-Kasten sichtbar) und von den Tags `t-mand`/`t-frei`, im
  Detailbereich vom Abzeichen neben „Geführte Angabe". Ein befülltes freies Feld bleibt
  orange — es ist weiterhin löschbar; die Einordnung ist strukturell, nicht Zustand.

Die Elternabhängigkeit bleibt unangetastet und trägt das Ganze: in einen optionalen Ast
steigt der Walk nur ab, wenn er angegeben ist oder Inhalt trägt. Was der Durchlauf nicht
betritt, verlangt er auch nicht — auch dann nicht, wenn die gebundene Fassung darunter
etwas zwingend setzt.

## Konsequenzen

- Der geführte Neu-Durchlauf lässt sich vollständig mit `→` durchblättern; er erzeugt dann
  eine Nachricht mit dem Pflicht-Rückgrat und nichts sonst. Genau das war vorher nur über
  Dutzende „weglassen"-Klicks erreichbar.
- „Bewusst weggelassen" ist im gespeicherten Entscheidungsstand nicht mehr von „nicht
  angegeben" unterscheidbar. Das ist der bewusste Preis: in der Nachricht sind beide
  dasselbe, und die Unterscheidung gehört in die Profilierung, wo sie eine Statusstufe hat.
- **Altstände bleiben lesbar.** Entwürfe von vorher tragen an optionalen Elementen
  `pflicht` (= angegeben) oder `ausgeschlossen` (= schneidet den Ast ab); beide wirken
  unverändert in Walk und Export. Keine Migration.
- Die Story-Texte sind nachgezogen (`testnachricht-gefuehrt-erstellen.md` AK C/G/H,
  `testnachricht-aus-profilierung.md` Wirkungs-Tabelle); ADR 0015 gilt fort, seine
  Durchsetzung der Untergrenze läuft im Durchlauf jetzt über die Pflicht statt über die
  Aufnahme-Entscheidung.
- Abgesichert in `guided.service.spec.ts` (freies Feld nie offen, typwidriger Wert offen,
  Angabe/Rücknahme am Container, Elternabhängigkeit, Zweig aus Wert, Altstand),
  `export.service.spec.ts` (einzig befüllter Zweig wird serialisiert) und
  `testmessage-create.service.spec.ts` (keine Rückfrage mehr).
