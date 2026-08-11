# ADR 0015: Vorkommen zählen statt Mindestanzahl 1 zu materialisieren

- Status: Angenommen
- Datum: 26.07.31

## Kontext

Der gebundene Durchlauf („Testnachricht aus einer Profilierung") setzt die im Profil eingegrenzte
Kardinalität hart durch. Dafür braucht er eine Antwort auf die Frage, **wie viele Vorkommen ein
Element gerade trägt** — im Modell gibt es dazu nur die Liste der benannten Ausprägungen
(`auspraegungen`), und die ist für den Normalfall leer: ein Element ohne Ausprägungen wird als
generischer Unterbaum gerendert und exportiert.

`GuidedService.kardLage` beantwortete das bislang beiläufig mit `auspsOf(path)?.length || 1`. Zwei
Kanten hingen daran, beide unausgesprochen:

- Ein Profil-`min = 1` wurde nie materialisiert, sondern nur über „kein Vorkommen zählt als eins"
  erfüllt. Das Akzeptanzkriterium „die eingegrenzte Mindestanzahl wird beim Start materialisiert"
  (#27) galt faktisch erst ab `min ≥ 2`, und `min = 1` blieb folgenlos: das Element ließ sich
  schlicht weglassen.
- Ein bewusst weggelassenes Element zählte weiterhin als ein Vorkommen.

Für die Sperren war das tragfähig, als Grundlage aber nicht: Die Materialisierung benannter
Ausprägungen (#28) baut genau auf dieser Zählmechanik auf und hätte die Kante zementiert. Zwei Wege
standen offen — die Mindestanzahl 1 als Ausprägung anlegen, oder die Konvention festschreiben.

## Entscheidung

**Gezählt, nicht materialisiert.** Die Zählkonvention steht als benannte Funktion
`GuidedService.vorkommenAnzahl` und lautet:

- Führt das Element benannte Ausprägungen, ist ihre Zahl maßgeblich.
- Sonst steht der generische Unterbaum für **ein** Vorkommen …
- … es sei denn, der Durchlauf hat das Element weggelassen oder die gebundene Fassung schließt es
  aus — dann trägt es **keines**.

Eine Mindestanzahl 1 als Ausprägung anzulegen wäre die schlechtere Wahl: sie erzwänge auf dem
gesamten Pflicht-Rückgrat eine benannte Vorkommen-Ebene, wo das Schema nur ein einzelnes Element
vorsieht — sichtbar im Baum, in der Excel-Ausleitung und in jedem Verweisziel, ohne dass die
Nachricht dadurch anders aussähe. Der Name („Vorkommen 1") wäre reines Gerüst.

> **Nachtrag (ADR 0018, 26.08.11):** Die Konvention ist seitdem der **Rückfall**, nicht
> die einzige Lesart. Ob der generische Unterbaum wirklich für ein Vorkommen steht, hängt
> an Schema-Kardinalität und Serialisierung — das beantwortet `core/enthalten.ts`, und
> `VorgabeSicht.vorkommenAnzahl` nimmt die Antwort über die Umgebung entgegen. Ohne
> Umgebung (Aufrufer ohne Schema-Zugang) gilt die Konvention unverändert weiter.

> **Nachtrag (ADR 0016, 26.08.03):** Im Instanz-Durchlauf gibt es die Aufnahme-Entscheidung
> nicht mehr — dort entscheidet der Wert. Die Untergrenze der Profilierung wirkt seitdem als
> **Pflicht** (Blatt = Pflichtwert, Container = wird ohne Rückfrage betreten), statt eine
> Abwahl zu sperren. `kardSperreWeglassen` bleibt unverändert und trägt weiterhin die Wege,
> die eine Angabe entfernen: `✕` im Baum, „✕ Angabe entfernen" beim Bearbeiten und den
> Zweigwechsel.

**Die Untergrenze bekommt stattdessen Zähne an der Aufnahme-Entscheidung.**
`kardSperreWeglassen(path)` nennt den Grund, warum ein Element nicht weggelassen werden darf;
`setzeAufnahme` verweigert das Weglassen wie bei zwingend gesetzten Elementen, und jeder weitere Weg,
der eine Angabe entfernt (`✕` im Baum, „✕ Angabe entfernen" im Detailbereich), prüft mit — nach dem
Muster der Hinzufügen-Sperre: `[disabled]` am Knopf **und** ein Guard in der Aktion. Der Guard im
Detailbereich ist heute defensiv: der Knopf steht nur im Bearbeiten-Modus, und dort gibt es noch
keine Bindung — er wird wirksam, sobald sie gehalten wird (#32).

**Auch die Zweigwahl ist ein Weglassen.** Sie schließt die Geschwister aus, umgeht die Sperre also
über den Radio-Knopf statt über das `✕`. `kardSperreZweigwechsel` prüft deshalb vor dem Umschalten
alle Zweige, die dabei ausgeschlossen würden; trägt einer eine Mindestanzahl der Profilierung, bleibt
der Knopf gesperrt und nennt den Grund. Dass ein Zweig zugleich verlangt und durch die Wahl eines
anderen ausgeschlossen wäre, ist ein Widerspruch **in der Profilierung** — der Durchlauf löst ihn
nicht auf, er benennt ihn.

**Maßgeblich ist allein die Eingrenzung der Profilierung** (`effKard().minProfil`). Die
Mindestanzahl des Schemas macht ein Element ohnehin zum Pflicht-Rückgrat ohne Aufnahme-Frage; ein
Auswahl-Zweig wiederum trägt sein `min = 1` aus dem Schema — ihn zu sperren machte den Zweigwechsel
unmöglich.

## Konsequenzen

- Das Akzeptanzkriterium ist umformuliert: `min ≥ 2` wird beim Start als Vorkommen angelegt,
  `min = 1` erfüllt das Element selbst und ist nicht weglassbar. Beide Fassungen stehen so in
  `docs/user-stories/testnachricht-aus-profilierung.md`.
- `legeMindestVorkommenAn` (Schwelle `min ≥ 2`) bleibt unverändert — die Konvention beschreibt jetzt,
  warum die Schwelle dort steht.
- Ein weggelassenes Element trägt kein Vorkommen: Nach dem Weglassen ist die Höchstanzahl nicht mehr
  erreicht, das erste Vorkommen also wieder anlegbar.
- Die Materialisierung benannter Ausprägungen (#28) setzt auf einer ausgesprochenen Regel auf. Wo
  eine Ausprägung existiert, ist sie das Vorkommen — dort fallen Zählung und Materialisierung
  ohnehin zusammen.
- `addAusp`/`addErweiterung` materialisieren die Liste der gebundenen Fassung, statt sie zu
  verdecken — sonst verschwänden die zwingenden Vorkommen der Profilierung mit dem ersten eigenen
  Eintrag aus Baum und Instanz, weil der Rückfall je Pfad für die **ganze** Liste gilt. Eine dadurch
  leergeräumte eigene Liste bleibt als leere Liste stehen, solange die Vorgabe am Pfad eine führt;
  fiele sie weg, käme das Entfernte mit dem nächsten Lesezugriff zurück.
- Eine **reine** Vorgabe-Liste bleibt dagegen unberührt: `removeAusp`, `renameAusp`,
  `updateErweiterung` und `removeErweiterung` greifen nur auf einer eigenen Liste. Ob die benannten
  Ausprägungen der Profilierung überhaupt entfernbar sein sollen, entscheidet #28 — dort steht
  „nicht entfernbar" als Akzeptanzkriterium, hier wäre es eine Vorfestlegung.
- Abgesichert in `guided.service.spec.ts` (Zählung eines weggelassenen Elements, Durchsetzung von
  `min = 1` inkl. Zweigwechsel, unverändertes Weglassen ohne Eingrenzung im Profil) und
  `state.service.spec.ts` (Materialisierung, Unberührtheit der reinen Vorgabe-Liste).
