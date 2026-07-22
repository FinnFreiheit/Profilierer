# Datenmodell

Die Interfaces (`src/app/models/`), die Zustands-Signale des `StateService` und — zentral für das Verständnis — die pfad-indizierten Profil-Maps.

## Interfaces

### node.model.ts
- **`TreeNode`** — ein Knoten im aufgelösten Element-Baum: `id, path, name, min, max, doc, typeName, xsdEl, model, children (null = nicht expandiert), parent, depth, synthetic, groupEl?, recursive, codelist, typeStack, inChoice, erweiterung?`. Entspricht `makeNode` (Z.460). `erweiterung` ist bei synthetisierten Knoten einer Schema-Erweiterung gesetzt (`xsdEl: null`).
- **`TreeItem`** — anzeigbares Item: `{ kind:'el', node }` **oder** `{ kind:'ausp', parentNode, ausp, path }` (Z.1038). Helfer `itemPath(it)` und `istErweiterungsPfad(pfad)` (= enthält `/~`).
- `NodeModel = 'sequence' | 'choice' | 'all' | null`.

### profile.model.ts (das persistierbare Profil)
- **`ProfileDoc`** = `{ meta, statuses, elemente, auspraegungen, erweiterungen }` (früher `S.profile`, Z.333).
- **`ProfileMeta`** = `name?, autor?, datum?, beschreibung?, nachricht?, xjustizVersion?, gespeichert?`.
- **`Status`** = `{ id, name, farbe, wirkung }`, `Wirkung = 'pflicht' | 'optional' | 'ausgeschlossen' | 'markierung'` (steuert Schematron/Beispiel-XML).
- **`ElementProfile`** = `status?, min?, max?, anmerkung?, beispiel?, werte?, refZiel?` — alle optional; ein leerer Eintrag wird von `pruneP` entfernt.
- **`Auspraegung`** = `{ id, name }`.
- **`Erweiterung`** = `{ id, name, beschreibung?, min, max, datentyp? }` — ein nachzubeauftragendes Element, das (noch) nicht im XJustiz-Schema existiert ([ADR 0010](adr/0010-schema-erweiterungen-profil-overlay.md)). `datentyp` ist ein xs:-Lokalname oder Freitext; `undefined` = Container (kann Kind-Erweiterungen tragen).

### validation.model.ts
- **`ValidierungsFehler`** = `{ text, zeile? }` — strukturierter Schemavalidierungs-Fehler.
- **`ReportEintrag`** = `{ text, pfad?, erweiterung? }` — Berichtseintrag; mit `pfad` klickbar (Sprung in den Baum), `erweiterung` kennzeichnet Fehler durch bekannte Schema-Erweiterungen.

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
| Profil | `meta, statuses, elemente, auspraegungen, erweiterungen` |
| UI | `selItem, open (Set), codelists, showTech, onlyProfile, showRefs, focusMode, pendingMsg, scrollTarget, autosaveInfo` |
| Diff | `showDiff, diffMap, diffAnc, idxB` |
| Validierung | `valFehler, valAnc` (Fehler-Markierung des letzten Prüflaufs) |
| Ableitungen | `profileDoc`, `fortschritt` |

## Pfad-indizierte Maps (zentral)

`elemente`, `auspraegungen` und `erweiterungen` sind `Record<string, …>`, indexiert über den **Item-Pfad**:

- **Element:** `nachricht.x/eltern/kind` — Segmente durch `/`; synthetische Gruppen tauchen im Baum auf, aber nicht im Instanz-Pfad der Exporte.
- **Duplikate:** gleiches Element mehrfach im selben Typ → Suffix `#n` (`beteiligter#1`).
- **Ausprägung:** `…/beteiligung@a<id>` — ein eigener Pfad-Raum; darunter liegende Profilierungen erben den Präfix (`…/beteiligung@a<id>/name`).
- **Schema-Erweiterung:** eigener Pfad `elternPfad/~<id>` (z. B. `…/grunddaten/~x1abc`). `~` ist kein NCName-Zeichen → keine Kollision mit Elementnamen, `#n` oder `@auspId`; der Separator bleibt `/`, daher funktionieren alle Präfix-Kaskaden unverändert. Verschachtelung: `…/~x1/~x2`. Der Pfad trägt die **id**, nicht den Namen — Umbenennen verschiebt keine Profil-Einträge.
- `elemente[pfad]` = `ElementProfile`; `auspraegungen[pfad]` = `Auspraegung[]`; `erweiterungen[elternPfad]` = `Erweiterung[]` (indexiert am **Elternpfad**, nicht am eigenen Pfad).

**Warum das wichtig ist:**
- **Kaskaden:** `removeAusp(path, id)` entfernt alle Keys mit Präfix `path@id` aus `elemente`, `auspraegungen` **und** `erweiterungen` und bereinigt `selItem`/`open`; `removeErweiterung(parentPath, id)` kaskadiert analog über den Präfix `parentPath/~id`.
- **Signal-Feuern:** Jede Mutation erzeugt eine neue Map-Referenz (`{ ...m, [k]: v }`); In-Place-Änderungen würden das Signal nicht auslösen. Ausnahme: `renameAusp` mutiert den Namen in place (damit die Auswahl konsistent bleibt) **und** setzt eine neue Array-Referenz.
- **Aufräumen:** `pruneP` löscht Einträge ohne belegte Felder, damit `fortschritt` und Exporte sauber bleiben.

Bei `noUncheckedIndexedAccess` (aktiv) liefert `elemente[path]` immer `T | undefined` — Zugriffe sind entsprechend abgesichert.

## Persistenz der Bibliothek (Backend, SQLite)

Profilierungen werden in einer SQLite-Datenbank des Backends (`server/`) gehalten — nicht mehr im `localStorage` ([ADR 0007](adr/0007-datenbank-backend.md)). Eine Tabelle `profiles`: das komplette `ProfileDoc` als JSON-Spalte `doc`, daneben die **abgeleiteten Index-Spalten** `name, nachricht, xjustiz_version, n_status, n_ausp, n_erw, gespeichert, aktualisiert` (fehlende Spalten werden beim Start per PRAGMA-Migration nachgezogen). Aus diesen Spalten rendert `GET /api/profiles` die schlanke `LibraryEntry`-Liste fürs Dashboard, **ohne** die (potenziell großen) `doc`-Maps zu deserialisieren; das vollständige Dokument liefert `GET /api/profiles/:id`.

- **`LibraryEntry`** = `{ id, name, nachricht?, xjustizVersion?, nStatus, nAusp, nErw?, gespeichert?, aktualisiert }` — serverseitig aus dem Dokument abgeleitet (`server/fortschritt.js`, spiegelt `StateService.fortschritt`). `nErw` speist das Dashboard-Badge „N Schema-Erweiterungen" (optional — Zeilen von vor der Migration liefern es erst nach dem nächsten Speichern).
- **Client:** `ProfileStoreService` spricht `/api` per nativem fetch an (async); das reaktive `entries`-Signal bleibt die Fassache fürs Dashboard und wird nach jedem Schreib-Call mit dem vom Server gelieferten `LibraryEntry` gepflegt. Der Autosave (`PersistenceService`, 800-ms-Debounce, In-Flight-Reschedule) schreibt in `PUT /api/profiles/:id`.
- **Migration:** frühere localStorage-Bibliotheken (`xjp.library.index`/`xjp.library.doc.<id>`, Legacy `xjp.autosave`) werden einmalig via `MigrationService` → `POST /api/import` übernommen (id + `aktualisiert` bleiben erhalten).
