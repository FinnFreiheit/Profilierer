# ADR 0002: Signals-Store statt globalem Zustand

- Status: Angenommen
- Datum: 26.07.10

## Kontext

Die Alt-App hielt allen Zustand im globalen Objekt `S`/`S.profile` und rief nach jeder Änderung `renderAll()` auf. Für Angular war eine reaktive Zustandsverwaltung nötig. Optionen: NgRx (Boilerplate-lastig), RxJS-`BehaviorSubject`, oder Angular **Signals**.

## Entscheidung

Ein zentraler `StateService` als **Signals-Store**: je Zustandsfeld ein `signal`, Ableitungen als `computed` (z. B. `fortschritt`, `profileDoc`). Kein NgRx. Die pfad-indizierten Profil-Maps (`elemente`/`auspraegungen`) bleiben als `Record`-Signale erhalten; Mutationen erzeugen **neue Referenzen**, damit die Signale feuern. Kaskadierende Operationen (`removeAusp`) und das Aufräumen (`pruneP`) sind im Store gebündelt und unit-getestet.

## Konsequenzen

- **Positiv:** Minimaler Boilerplate, feingranulare Reaktivität, `renderAll()` entfällt, gute Testbarkeit; nahe am mentalen Modell des alten `S`.
- **Negativ:** Disziplin bei Referenz-Erzeugung nötig — In-Place-Mutation feuert nicht. Ausnahme dokumentiert: `renameAusp` mutiert den Namen in place (Konsistenz der Auswahl) und setzt zusätzlich eine neue Array-Referenz.
- **Regel:** Autosave-`effect` nur **lesen** + in localStorage schreiben, niemals Signale mutieren (Schleifengefahr).
