# US-Story: Testnachricht geführt aus einem Schema erstellen

Status: verfeinert (Refinement 26.07.15) · Typ: Story mit Vollständigkeits-Anspruch · Oberthema: Testdaten-Speicher

## Ausgangslage

Der zentrale **Testdaten-Speicher** kennt heute zwei Quellen für Testnachrichten:

1. **Upload** bestehender XJustiz-Instanzen (Root `nachricht.*`), und
2. **„Aus Profilierung erzeugen"** — eine Beispielnachricht mit Platzhalterwerten
   aus einer gespeicherten Profilierung (`TestmessageGenerationService`).

Was fehlt: eine Testnachricht **direkt aus einem Schema** zu erstellen — ohne
vorherige Profilierung und ohne vorhandene Instanz —, und zwar mit einer
**Führung** analog zur geführten Profilierung
([profilierung-gefuehrt-erstellen](profilierung-gefuehrt-erstellen.md)): Schritt
für Schritt durch die Nachricht, zu jedem Punkt eine bewusste Aussage, nichts
übersehen.

Der Unterschied zur Profilierung: Dort sind die Entscheidungen **Dispositionen**
(zwingend / anzugeben wenn vorhanden / nicht verwendet); bei einer Instanz sind
es **Instanz-Angaben** — welcher Wert in jedem Blatt, welcher `choice`-Zweig, wie
viele Wiederholungen, und welche optionalen Teilbäume die Nachricht überhaupt
füllt. _Nachgezogen ([ADR 0016](../adr/0016-wert-entscheidet-im-instanz-durchlauf.md)):_
ein „aufnehmen / weglassen" je Element gibt es nicht mehr — am Blatt entscheidet
der Wert, nur der Container wird angegeben oder übergangen.

Bereits vorhanden und wiederverwendbar:

- **Baum-Editor für Instanzen:** geladene Testnachrichten werden als
  `MessageEditSession` im Baum bearbeitet (`InstanceImportService`) und getreu
  wieder serialisiert (`InstanceExportService`, „Als Testnachricht speichern").
- **Geführte Profilierung:** `GuidedService` (Entscheidungspunkte in
  Dokumentreihenfolge, Fortschritt „X von Y", nächster offener Punkt,
  Umschalter in der Toolbar, Bedienung im Detailpanel).
- **Typkonforme Beispielwerte:** `ValueService`/`placeholderFor` liefert
  schema-konforme Werte (UUID, Datumsangaben, Pattern-Facetten, Codelisten) —
  inklusive Prüfung eingegebener Werte gegen den Datentyp.
- **Ausprägungs-Mechanik:** `addAusp`/`duplicateElement`, Pfad-Raum `pfad@id`.
- **Nachrichtenauswahl:** hinterlegte Versionen (3.6.2, 4.0.0) und
  Message-Picker (`BundledSchemaService`).

## Refinement-Entscheidungen

**Grundform und Einstieg**

- **Baum-Editor mit Führungsschicht**, kein separater Wizard — dieselbe
  Entscheidung wie bei der geführten Profilierung, gleiche Bedienlogik und
  Wiedererkennung.
- **Einstieg im Testspeicher:** Button „Neue Testnachricht erstellen…"; im
  Dialog zweistufig **XJustiz-Version** (hinterlegte 3.6.2/4.0.0, plus „aktuell
  geladenes Schema" falls ein Fremdschema geladen ist) und dann die
  **Nachricht** (durchsuchbar). Danach direkt im Baum-Editor mit aktiver
  Führung.
  _Nachgezogen (Spec „Testnachricht geführt aus einer Profilierung"):_ Der
  Dialog fragt inzwischen zuerst die **Herkunft** — „aus Schema" (dieser Weg)
  oder „aus Profilierung". Bei „aus Profilierung" entfallen Versions- und
  Nachrichtenwahl; stattdessen werden Profil und zu bindende Fassung gewählt,
  und der Durchlauf läuft gegen die eingefrorene Kopie dieser Fassung.
- **Startzustand: leerer Baum.** Keine Vorbelegung mit Platzhalterwerten.
  Pflichtstrukturen (`min≥1`) sind automatisch _vorhanden_ (bei `min≥2`
  entsprechend mehrfach), aber **jedes Pflichtfeld muss aktiv befüllt werden**.

**Entscheidungstypen des Durchlaufs**

- **Pflicht-Blatt:** Wert eingeben — offen, bis ein **typkonformer** Wert
  vorliegt (die vorhandene Datentyp-/Pattern-Prüfung zählt ein falsch
  formatiertes Feld als offen).
- **Optionales Blatt (`min=0`):** _Nachgezogen ([ADR 0016](../adr/0016-wert-entscheidet-im-instanz-durchlauf.md), 26.08.03):_
  **keine** Entscheidung mehr — der Wert entscheidet. Eingetragen heißt vorhanden,
  leer heißt nicht vorhanden; die Station ist nie offen. Nur ein eingetragener,
  **typwidriger** Wert zählt als offen.
- **Optionaler Container (`min=0`):** trägt keinen Wert und bleibt darum eine
  Station mit zwei Wegen: **angeben** (Taste ← — der Teilbaum wird betreten und
  weiter durchlaufen) oder **übergehen** (Taste ↓, der Teilbaum entfällt samt
  Inhalt). Übergehen hält nichts fest und ist jederzeit nachholbar; eine Angabe
  lässt sich zurücknehmen, solange darunter keine Werte stehen.
- **Auswahl (`choice`):** genau **ein** Zweig je Vorkommen (Entweder-oder) —
  anders als bei der Profilierung, die mehrere Alternativen zulässt; das Schema
  erzwingt in der Instanz einen Zweig. Zweigwechsel ist nicht-destruktiv
  (verworfene Zweige werden erst beim Serialisieren weggelassen). Verschiedene
  Zweige über mehrere Vorkommen einer wiederholbaren `choice` laufen über die
  normale Wiederholungs-Mechanik.
- **Wiederholung (`max>1`): iterativ.** Das erste Vorkommen wird durchlaufen
  und befüllt; am Element steht jederzeit „+ weiteres Vorkommen anlegen", auf
  Wunsch als **Kopie** des vorigen (`duplicateElement`) mit anschließender
  Anpassung. Jedes Vorkommen wird voll durchlaufen und zählt zur
  Vollständigkeit.

**Dummy-Werte (Zufalls-Generator)**

- **Je Feld:** „Würfel"-Button im Detailpanel neben der Wert-Eingabe — befüllt
  genau dieses Feld typkonform (UUID, Datum, Pattern, Codelisten-Wert, …).
- **Global:** Toolbar-Aktion „Alle offenen Pflichtfelder mit Dummy-Daten
  füllen" — macht den Rest der Nachricht mit einem Klick valide.
- Beide Aktionen stehen im Nachrichten-Modus **generell** zur Verfügung, auch
  beim Bearbeiten vorhandener (hochgeladener) Nachrichten.

**Vollständigkeit, „valide", Speichern**

- **„Valide" = Modell-Vollständigkeit:** alle Pflichtblätter typkonform
  befüllt, alle Pflicht-`choice` aufgelöst, Mindest-Wiederholungen erfüllt.
  **Keine echte XSD-Validierung** der erzeugten Datei (späterer Ausbau, eigene
  Story — dann auch für hochgeladene Nachrichten). Die Kennzeichnung
  formuliert ehrlich „Entwurf — unvollständig", nicht „invalide laut Schema".
- ~~Offene **optionale** Entscheidungen lösen beim Speichern eine Warnung mit
  Rückfrage aus.~~ _Entfallen ([ADR 0016](../adr/0016-wert-entscheidet-im-instanz-durchlauf.md)):_
  Übergangenes Optionales ist keine offene Entscheidung — es gibt nichts, worüber
  zu warnen wäre. Offene **Pflichtangaben** halten stattdessen schon im
  Durchlauf die Spur fest.
- **Explizites Speichern** (kein Autosave): Der Speicherpunkt ist zugleich der
  Moment, in dem das Entwurfs-Kennzeichen neu berechnet wird.
- **Anlegen, dann aktualisieren:** Das erste Speichern fragt den Namen ab
  (Vorschlag „_Nachrichtenname_ — Testnachricht.xml") und legt den Eintrag an;
  jedes weitere Speichern derselben Sitzung **aktualisiert denselben Eintrag**
  (XML, Entscheidungsstand, Kennzeichen). Das bisherige „immer neu" bleibt für
  den Altfall (hochgeladene Nachricht bearbeiten) unverändert.
- **Zwischenstände sind speicherbar** — auch unvollständig. Solche Einträge
  tragen im Testspeicher das Badge „**Entwurf — unvollständig**" plus
  Fortschritt; der Download eines Entwurfs stellt eine Rückfrage.

**Entscheidungsstand persistieren**

- Im reinen XML ist „bewusst weggelassen" nicht von „noch offen"
  unterscheidbar (beides Abwesenheit). Daher speichert der Eintrag **XML +
  Entscheidungsstand** (kompaktes JSON-Feld am Testnachrichten-Eintrag; nur
  bei geführt erstellten Nachrichten belegt; hochgeladene Nachrichten bleiben
  „nur XML").
- Klick auf eine Entwurfs-Kachel setzt den Durchlauf mit **aktiver Führung am
  nächsten offenen Punkt** fort; wird die Nachricht vollständig, verschwindet
  das Badge automatisch.

## Story

> **Als** Anwender, der Testnachrichten für ein Verfahren benötigt,
> **möchte ich** auf der Testspeicher-Oberfläche eine neue Testnachricht direkt
> aus einem hinterlegten Schema erstellen — Version und Nachricht wählen und
> dann Knoten für Knoten geführt werden: jedes Pflichtfeld aktiv befüllen (auf
> Wunsch per typkonformem Zufallswert, einzeln oder alle offenen auf einmal),
> Optionales durch die bloße Angabe eines Wertes aufnehmen und ohne Angabe
> überspringen, je `choice` genau einen Zweig
> wählen, Wiederholungen iterativ anlegen (auch als Kopie) — und den Stand
> jederzeit als gekennzeichneten Entwurf speichern und später exakt dort
> fortsetzen,
> **damit ich** ohne vorhandene Instanz und ohne Profilierung schnell
> vollständige, fachlich kontrollierte Testnachrichten erzeuge und dabei sicher
> bin, kein Pflichtfeld und keine Entscheidung übersehen zu haben.

## Akzeptanzkriterien

### A. Einstieg

- Auf der Testspeicher-Oberfläche gibt es „**Neue Testnachricht erstellen…**";
  der Dialog bietet die hinterlegten XJustiz-Versionen (und, falls geladen, das
  aktuelle Fremdschema) und darin **jede** Nachricht zur Auswahl (durchsuchbar).
- Nach der Wahl öffnet sich der Baum-Editor im Nachrichten-Modus mit **aktiver
  Führung**; der Baum enthält genau das Pflicht-Gerüst der Nachricht, **ohne**
  vorbefüllte Werte.

### B. Pflicht wird erzwungen

- Pflichtstrukturen (`min≥1`) sind automatisch vorhanden und nicht
  abwählbar; `min≥2` erzeugt entsprechend viele Vorkommen.
- Ein Pflicht-Blatt gilt erst als erledigt, wenn ein **typkonformer** Wert
  vorliegt; leere oder typwidrige Werte zählen als offen.

### C. Optionale Elemente

_Neu gefasst ([ADR 0016](../adr/0016-wert-entscheidet-im-instanz-durchlauf.md), 26.08.03) —
die ursprüngliche Fassung verlangte an jedem optionalen Element ein aufnehmen/weglassen._

- Ein optionales **Blatt** ist ein freies Feld: ein Wert bringt es in die
  Nachricht, kein Wert lässt es weg. Es ist nie offen und blockiert nichts;
  „Weiter" (↓) übergeht es folgenlos.
- Ein optionaler **Container** ist eine Station mit „angeben" (←) und „nicht
  angeben" (↓). Erst die Angabe holt seinen Teilbaum in den Durchlauf — samt der
  Pflichtfelder darunter. Ohne Angabe verlangt der Durchlauf dort nichts.
- Übergehen hält **keine** Aussage fest; die Station bleibt jederzeit
  anspringbar. Eine Angabe ist zurücknehmbar, solange der Teilbaum leer ist —
  stehen Werte darunter, entscheidet der Wert (erst löschen, dann übergehen).
- Der ganze Durchlauf lässt sich mit `↓` durchblättern; er erzeugt dann eine
  Nachricht aus Pflicht-Rückgrat und sonst nichts — **außer** an einer offenen
  Pflichtangabe: die hält die Spur fest, bis sie befüllt (bzw. die Auswahl
  belegt) ist. Zurück, hinein/heraus, „Nächster offener" und jeder Klick im Baum
  bleiben frei.
- Jede Station ist **farblich eingeordnet** — grün, wo die Nachricht die Angabe
  verlangt, orange, wo sie frei ist (dieselben Farben wie „zwingend" und
  „anzugeben, wenn vorhanden" in der Profilierung).

### D. Auswahlen (`choice`)

- Je Vorkommen einer `choice` wählt der Anwender **genau einen** Zweig; nur
  dieser wird angelegt und weiter durchlaufen.
- Zweigwechsel ist möglich und nicht-destruktiv; in der serialisierten
  Nachricht erscheint ausschließlich der gewählte Zweig.
- Bei wiederholbarer `choice` kann je Vorkommen ein anderer Zweig gewählt
  werden (über die Wiederholungs-Mechanik).

### E. Wiederholungen

- Am wiederholbaren Element kann jederzeit ein weiteres Vorkommen angelegt
  werden — leer oder als **Kopie** des vorigen; jedes Vorkommen wird voll
  durchlaufen und erhöht die Vollständigkeits-Zahl.

### F. Dummy-Werte

- Im Detailpanel füllt ein Button das aktuelle Feld mit einem **typkonformen
  Zufalls-/Platzhalterwert** (UUID, Datum, Pattern, Codeliste, …).
- Eine globale Aktion füllt **alle offenen Pflichtfelder** der Nachricht auf
  einmal typkonform.
- Beide stehen im Nachrichten-Modus auch beim Bearbeiten vorhandener
  Nachrichten zur Verfügung.

### G. Fortschritt und Navigation

- Fortschritt „**X von Y Pflichtangaben**" ist jederzeit sichtbar; gezählt wird
  nur, was die Nachricht schuldet: Pflichtwerte, Pflicht-Auswahlen,
  Vorkommen-Blätter — dazu ein freies Feld, sobald ein Wert darin steht.
  _(Nachgezogen mit [ADR 0016](../adr/0016-wert-entscheidet-im-instanz-durchlauf.md);
  vorher zählte jede optionale Entscheidung mit.)_
- Der Normalweg ist das Blättern: „Weiter ›" (↓) geht zur nächsten Station,
  „‹ Zurück" (↑) zur vorigen, ← betritt einen Container, → verlässt ihn.
  „**Nächster offener**" springt zur nächsten Lücke; freies Anspringen im Baum
  bleibt möglich.

### H. Speichern, Entwurf, Fortsetzen

- Erstes Speichern: Namensabfrage (Vorschlag „_Nachricht_ —
  Testnachricht.xml"), Eintrag entsteht im Testspeicher. Weitere
  Speichervorgänge derselben Sitzung **aktualisieren** diesen Eintrag.
- Unvollständige Einträge tragen auf der Kachel „**Entwurf — unvollständig**"
  samt Fortschritt; vollständige Einträge tragen kein Kennzeichen. Das
  Kennzeichen wird bei jedem Speichern neu berechnet.
- Leere Pflichtfelder machen den Eintrag zum Entwurf, verhindern das Speichern
  aber nicht. _Entfallen ([ADR 0016](../adr/0016-wert-entscheidet-im-instanz-durchlauf.md)):_
  die Rückfrage bei offenen optionalen Entscheidungen — Übergangenes ist keine
  offene Entscheidung mehr.
- Der Eintrag speichert **XML + Entscheidungsstand**; Klick auf die Kachel
  eines geführt erstellten Eintrags öffnet den Baum mit aktiver Führung und
  springt zum nächsten offenen Punkt.
- Der **Download** eines Entwurfs stellt eine Rückfrage („Nachricht ist
  unvollständig — trotzdem herunterladen?").

## Bewusst außerhalb dieser Story

- **Geführtes Nachbearbeiten** hochgeladener oder aus Profilierungen erzeugter
  Nachrichten (Initialisierung des Entscheidungsstands aus dem Ist-Zustand).
- **Echte XSD-Validierung** der erzeugten Datei (Backend-Ausbau, eigene Story).
- Profilierungs-Bezug (Testnachricht _gegen eine Profilierung_ erzeugen/prüfen)
  — dazu die eigene Story „Testnachricht aus einer Profilierung".
  _Nachgezogen (Issue #35):_ „Aus Profilierung erzeugen" ist **entfallen**. Von
  der Profilierung zur Testnachricht führt genau ein Weg — der geführte
  Durchlauf mit Bindung, erreichbar über die Profil-Kachel im Dashboard und über
  „Neue Testnachricht erstellen… → aus Profilierung".

## Betroffene Bausteine (Orientierung, kein Auftrag)

- Einstieg/Oberfläche: `src/app/features/testdaten/` (Button, Dialog
  Version→Nachricht, Badge, Fortsetzen, Download-Rückfrage)
- Führung: `src/app/core/services/guided.service.ts` (Instanz-Variante des
  Walks: Pflicht-Blätter als Punkte, choice = genau ein Zweig),
  `src/app/features/detail/detail-panel.ts` (angeben/nicht angeben,
  Zweig-Wahl, Würfel-Button), `src/app/features/toolbar/`
  (Fortschritt, globale Dummy-Aktion, Speichern)
- Werte: `src/app/core/services/value.service.ts` (`placeholderFor`,
  Typprüfung)
- Sitzung/Serialisierung: `src/app/models/testmessage.model.ts`
  (`MessageEditSession`), `src/app/core/services/instance-import.service.ts`,
  `instance-export.service.ts`
- Persistenz: `src/app/core/services/testmessage-store.service.ts`,
  `server/db.js` + `server/index.js` (Felder Entscheidungsstand +
  Entwurfs-Kennzeichen + Fortschritt an `testmessages`)
