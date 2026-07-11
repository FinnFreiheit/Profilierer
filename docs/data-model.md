# Datenmodell

Die Interfaces (`src/app/models/`), die Zustands-Signale des `StateService` und — zentral für das Verständnis — die pfad-indizierten Profil-Maps.

## Interfaces

### node.model.ts
- **`TreeNode`** — ein Knoten im aufgelösten Element-Baum: `id, path, name, min, max, doc, typeName, xsdEl, model, children (null = nicht expandiert), parent, depth, synthetic, groupEl?, recursive, codelist, typeStack, inChoice`. Entspricht `makeNode` (Z.460).
- **`TreeItem`** — anzeigbares Item: `{ kind:'el', node }` **oder** `{ kind:'ausp', parentNode, ausp, path }` (Z.1038). Helfer `itemPath(it)`.
- `NodeModel = 'sequence' | 'choice' | 'all' | null`.

### profile.model.ts (das persistierbare Profil)
- **`ProfileDoc`** = `{ meta, statuses, elemente, auspraegungen }` (früher `S.profile`, Z.333).
- **`ProfileMeta`** = `name?, autor?, datum?, beschreibung?, nachricht?, xjustizVersion?, gespeichert?`.
- **`Status`** = `{ id, name, farbe, wirkung }`, `Wirkung = 'pflicht' | 'optional' | 'ausgeschlossen' | 'markierung'` (steuert Schematron/Beispiel-XML).
- **`ElementProfile`** = `status?, min?, max?, anmerkung?, beispiel?, werte?, refZiel?` — alle optional; ein leerer Eintrag wird von `pruneP` entfernt.
- **`Auspraegung`** = `{ id, name }`.

### codelist.model.ts
- **`EnumWert`** = `{ value, label }`.
- **`CodelistInfo`** = aus dem XSD-Typ abgeleitet (`typeName, nameLang, kennung, beschreibung, werte | null`).
- **`Codelist`** = geladene externe Liste (`kennung, name?, version?, nameLang?, werte`).

### xsd-index.model.ts
- **`XsdDoc`** = `{ file, dom }`.
- **`XsdIndex`** = `{ ct, st, el }` (Maps Name → `Element`) + `messages: MessageRef[]` + `version?/kennung?`.
- **`MessageRef`** = `{ name, doc, file, modul? }`.
- **`ParticleModel`** = `{ model, parts, simple }` (Ergebnis von `particlesOfCT`).

### diff.model.ts
- **`DiffEntry`** = `{ art, rel, info, typ, prof }`, `DiffArt = 'neu' | 'entfernt' | 'geändert'`.
- **`DiffAnc`** = Zähler `{ neu, entfernt, 'geändert' }` je Vorfahr.
- **`DiffResult`** = `{ msgOnlyA, msgOnlyB, rows, msgInB }`.

## Store-Signale (StateService)

| Gruppe | Signale |
|---|---|
| Schema/Nachricht | `docs, idx, version, standardKennung, msgName, root` |
| Profil | `meta, statuses, elemente, auspraegungen` |
| UI | `selItem, open (Set), codelists, showTech, onlyProfile, showRefs, focusMode, pendingMsg, scrollTarget, autosaveInfo` |
| Diff | `showDiff, diffMap, diffAnc, diffMsgMissing, idxB` |
| Ableitungen | `profileDoc`, `fortschritt` |

## Pfad-indizierte Maps (zentral)

`elemente` und `auspraegungen` sind `Record<string, …>`, indexiert über den **Item-Pfad**:

- **Element:** `nachricht.x/eltern/kind` — Segmente durch `/`; synthetische Gruppen tauchen im Baum auf, aber nicht im Instanz-Pfad der Exporte.
- **Duplikate:** gleiches Element mehrfach im selben Typ → Suffix `#n` (`beteiligter#1`).
- **Ausprägung:** `…/beteiligung@a<id>` — ein eigener Pfad-Raum; darunter liegende Profilierungen erben den Präfix (`…/beteiligung@a<id>/name`).
- `elemente[pfad]` = `ElementProfile`; `auspraegungen[pfad]` = `Auspraegung[]`.

**Warum das wichtig ist:**
- **Kaskaden:** `removeAusp(path, id)` entfernt alle Keys mit Präfix `path@id` aus `elemente` **und** `auspraegungen` und bereinigt `selItem`/`open`.
- **Signal-Feuern:** Jede Mutation erzeugt eine neue Map-Referenz (`{ ...m, [k]: v }`); In-Place-Änderungen würden das Signal nicht auslösen. Ausnahme: `renameAusp` mutiert den Namen in place (damit die Auswahl konsistent bleibt) **und** setzt eine neue Array-Referenz.
- **Aufräumen:** `pruneP` löscht Einträge ohne belegte Felder, damit `fortschritt` und Exporte sauber bleiben.

Bei `noUncheckedIndexedAccess` (aktiv) liefert `elemente[path]` immer `T | undefined` — Zugriffe sind entsprechend abgesichert.
