# ADR 0017: Der Datentyp einer Schema-Erweiterung ist eine lebende Referenz (ergänzt 0010)

- Status: Angenommen
- Datum: 26.08.04

## Kontext

Seit [#96](../user-stories/schema-erweiterung.md) wählt eine Schema-Erweiterung ihren
Datentyp aus dem geladenen Schema (`datentyp` + `datentypQuelle: 'schema'`). Trägt sie
einen **komplexen** Typ (`beiakte : Type.GDS.Akte`), war der Knoten trotzdem ein Blatt:
was der Typ mitbringt — `identifikation`, `auswahl_vertraulichkeit`, `laufzeit` — blieb
unsichtbar und damit unprofilierbar. Genau diese Unterelemente sind aber der Grund,
warum ein fachlicher Typ gewählt wird.

Zwei Wege standen zur Wahl: die Typstruktur beim Setzen des Typs **rekursiv ins Profil
kopieren** (`erweiterungen` würde die Kinder als eigene Einträge führen), oder sie bei
jedem Rendern aus dem Schema **auflösen**.

## Entscheidung

**Lebende Referenz statt Kopie.** Im Profil steht nur der Typname; die Kinder entstehen
bei jedem Rendern aus dem aktiven Schema-Index:

1. `TreeService.kinder()` kennt für Erweiterungsknoten **keinen Sonderfall** mehr —
   Schema-Kinder gefolgt von eigenen Erweiterungen, wie bei jedem Schemaknoten.
   `expandNode` löst dafür über `idx.ct[datentyp]` auf, `isLeaf` ist Blatt genau dann,
   wenn der Typ zu keiner Struktur auflöst **und** keine eigenen Erweiterungen hängen.
2. Aufgelöst wird nur `datentypQuelle: 'schema'`. Ein Freitext-Typ ist ausdrücklich
   einer, den es (noch) nicht gibt — er bleibt Blatt mit dem neutralen gelben Hinweis
   des Typwählers.
3. Der `typeStack` des Erweiterungsknotens erbt den des Elternknotens **plus** den
   gewählten Typ; der vorhandene Rekursionsschutz (`TreeNode.recursive`) greift damit
   über die Erweiterungsgrenze hinweg.
4. Fehlt der gespeicherte Schematyp im aktiven Schema (Versionswechsel, Fremdschema —
   realer Fall: `Type.GDS.GeheimhaltungType` gibt es in 3.6.2, in 4.0.0 nicht mehr),
   wird der Knoten zum Blatt und trägt eine **rote** Warnung. Das Profil wird dabei
   **nicht** angefasst.
5. Der Typwechsel einer Erweiterung, unter der bereits Festlegungen liegen, fragt mit
   Zahl zurück und räumt bei Bestätigung den Teilbaum auf
   (`StateService.festlegungenUnter` / `bereinigeUnter`).

## Konsequenzen

- **Positiv:** Das Profil bleibt schlank und sagt genau eine Sache („dieses Element soll
  vom Typ X sein"). Die Kinder tragen `xs:documentation`, Kardinalitäten und
  Codelisten-Bindung **aus dem Schema** — eine Kopie hätte die Doku verloren und
  Schemainhalt fälschlich als Nachbeauftragung markiert. Ein Versionswechsel zeigt
  automatisch die neue Typstruktur. Alle Konsumenten (Baum, Excel, Druck, Beispiel-XML,
  geführter Durchlauf) ziehen ohne eigene Anpassung nach, weil sie über
  `TreeService.kinder` laufen.
- **Negativ / bewusst hingenommen:** Der Erweiterungs-Teilbaum wird pro Aufruf frisch
  synthetisiert (kein `children`-Cache, wie schon bei den Erweiterungsknoten selbst) —
  Wiederauflösung statt Zwischenspeicher. Ein entfallener Typ macht Festlegungen
  darunter vorübergehend unsichtbar; sie bleiben gespeichert, die Warnung nennt das
  ausdrücklich. Bestehende Profile mit Erweiterungen ändern ihren gespeicherten
  `fortschritt` beim nächsten Speichern, weil der geführte Durchlauf jetzt in den
  Teilbaum absteigt — der Wert ist laut Modell keine fachliche Aussage und nicht Teil
  des Fach-Hashes.
- **Abgrenzung:** Die Kennzeichnung folgt der Herkunft — der Erweiterungsknoten bleibt
  violett gestrichelt und trägt zusätzlich ein Typ-Pill, die **Verbindungslinien** im
  Teilbaum sind violett gestrichelt, die **Kästen** der Kinder normal: sie sind echter
  Schemainhalt, keine Nachbeauftragung.
