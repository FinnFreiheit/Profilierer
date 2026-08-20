# ADR 0019: Das Projekt ist der Behälter, die Profilierung trägt die Zuordnung

- Status: Angenommen
- Datum: 26.08.20

## Kontext

Über den Profilierungen gab es keine Ordnung. Das Fachmodul ist nur aus dem
Nachrichtennamen abgeleitet (2. Segment, [#88]), Schlagworte sind ein Querschnitt
ohne Innenleben.

Der auslösende Fall: **GenUVA-Ersuchen**. Dieselbe Nachricht trägt mehrere
Kommunikationsszenarien — ein Ersuchen des Notars an die Gemeinde, eines an das
Gericht, dazu die jeweilige Sachentscheidung zurück. Je Szenario entstehen vier bis
fünf Testnachrichten, die sich in einer Ausprägung unterscheiden (einmal ein
Beteiligter, einmal zwei). Weder war sichtbar, welche Profilierungen zusammengehören,
noch welche Testnachrichten zu welchem Szenario.

## Entscheidung

### Projekt als eigene, optionale Entität

Ein **Projekt** bündelt die Kommunikationsszenarien eines Vorhabens. Optional und
additiv: die Fachmodul-Gruppierung bleibt unangetastet, wer nichts zuordnet, merkt
nichts.

Verworfen wurde ein Projekt als bloße dritte Filterachse — dann sagte es dasselbe wie
ein Schlagwort und rechtfertigte die Entität nicht. Es trägt Struktur **im Inneren**
(welche Szenarien, welche Testnachrichten, was fehlt) und damit eine eigene Ansicht.

### Nur die Profilierung trägt die Zuordnung

`profiles.projekt_id` ist der einzige Pflegeort. Eine gebundene Testnachricht **erbt**
das Projekt über ihre `profil_id`: der Index liefert
`COALESCE(t.projekt_id, p.projekt_id)` über den ohnehin vorhandenen LEFT JOIN.
`testmessages.projekt_id` trägt nur den Fall ohne Bindung — Uploads — und das beim
Löschen der Profilierung festgeschriebene Erbe.

Verworfen wurde die direkte Zuordnung an beiden. Sie hätte zwei Pflegeorte und damit
widersprüchliche Zustände erlaubt („Nachricht in Projekt A, Profil in Projekt B"), die
die Projektseite dann hätte auflösen müssen. Der Ablage-Endpunkt weist ein Projekt an
einer gebundenen Nachricht mit `409` ab; die Ansicht bietet das Feld dort nicht an.

### Die Zuordnung steht in der Spalte, nicht im `ProfileDoc`

Anders als die Schlagworte (`meta.tags`) ist die Projektzugehörigkeit keine Eigenschaft
des Dokuments, sondern eine **Kante zwischen zwei Zeilen**. Zwei Folgen, beide gewollt:

- Eine eingefrorene Version konserviert die Zuordnung des Originals nicht.
- Einsortieren rührt den `doc_hash` nicht an — der Arbeitsstand gilt danach nicht als
  „geändert seit vX".

Weil `upsert` die Spalte nicht schreibt, liest es sie nach dem Schreiben nach und legt
sie in den Entry; sonst verlöre der Client die Zuordnung bei jedem Autosave.

### Einsortieren ist keine fachliche Aussage

`PATCH /api/profiles/:id/ablage` und `PATCH /api/testmessages/:id/ablage` setzen Projekt
und Schlagworte und tragen bewusst **keine** `schutz`-Middleware. Der `fach_hash` lässt
beide Felder aussen vor; eine Freigabe wird durch Einsortieren nicht entwertet und keine
gebundene Testnachricht als „Profil weiterentwickelt" markiert.

Ohne diese Ausnahme liesse sich genau der Bestand nicht ordnen, der am ehesten in ein
Projekt gehört — der freigegebene. Name, Autor und Beschreibung bleiben dem geschützten
`PATCH /api/profiles/:id` vorbehalten: sie sind das, worauf sich alle beziehen.

### Zweistufig, ohne Ablauf-Ebene

Projekt → Profilierung (= Kommunikationsszenario, so schon in CLAUDE.md definiert) →
Testnachrichten. Ersuchen und Sachentscheidung sind **zwei Zeilen, nicht ein Vorgang**;
der Hin-/Rückweg-Bezug bleibt implizit über die Sortierung nach Nachrichtentyp.

Verworfen wurde eine dritte Ebene „Ablauf": sie hätte eine zweite neue Entität samt
Pflege gebraucht und die Frage aufgeworfen, ob eine Testnachricht zum Ablauf oder zur
Profilierung gehört.

## Konsequenzen

- **Löschen der Profilierung** muss das Erbe vorher festschreiben
  (`tmErbeFestschreiben`): mit ihr fällt der LEFT JOIN weg, ihre Testnachrichten
  überleben das Löschen aber (eingefrorene Vorgabe) und sollen nicht lautlos aus dem
  Projekt verschwinden.
- **Lösen der Bindung** braucht das nicht: die Herkunft (`profil_id`) bleibt als
  Historie stehen, und mit ihr das Erbe.
- **Projekt löschen** entfernt nur die Zuordnungen, nie Inhalte.
- Die Projektseite muss eine Sammelzeile „ohne Szenario" führen (Uploads, gelöschte
  Profilierungen) — sonst zählte die Kachel mehr, als die Seite auflistet.
- Wer nichts zuordnet, hat von der Projektseite nichts. Das ist der Preis der
  Additivität und wurde bewusst gewählt: eine Zwangsmigration hätte automatisch
  benannte Projekte erzeugt, die niemand so genannt hätte.

Umgesetzt in [#134](https://github.com/FinnFreiheit/Profilierer/issues/134) (Entität,
Zuordnung, Einsortieren), [#135](https://github.com/FinnFreiheit/Profilierer/issues/135)
(Projektseite) und [#136](https://github.com/FinnFreiheit/Profilierer/issues/136)
(Merkmals-Matrix); Details im [Datenmodell](../data-model.md).

[#88]: https://github.com/FinnFreiheit/Profilierer/issues/88
