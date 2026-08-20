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
- **`Hinweis`** = `{ id, pfad, text, autor?, rolle?, zeit, erledigt? }` — Rückmeldung an einem Element. **Kein Teil des `ProfileDoc`**: Hinweise sind eine eigene Ressource mit eigener Ablage und eigenen Endpunkten ([ADR 0014](adr/0014-hinweise-eigene-ressource.md)); im Client hält sie der `HinweisStoreService`. `autor`/`rolle` bleiben vorerst leer (migrierter Altbestand hat sie nie).
- **`Auspraegung`** = `{ id, name }`.
- **`Erweiterung`** = `{ id, name, beschreibung?, min, max, datentyp?, datentypQuelle? }` — ein nachzubeauftragendes Element, das (noch) nicht im XJustiz-Schema existiert ([ADR 0010](adr/0010-schema-erweiterungen-profil-overlay.md)). `datentyp` ist immer der **nackte Lokalname** ohne Präfix (`string`, `datatypeC`, `Type.GDS.Akte`); `undefined` = Container (kann Kind-Erweiterungen tragen). `datentypQuelle` (`'xs' | 'schema' | 'frei'`, #96) sagt, woher er stammt, steuert die Anzeige (`xs:string` vs. `Type.GDS.Akte`) und entscheidet, ob der Typ im Baum zu seiner Struktur **aufgelöst** wird — nur `'schema'` wird aufgelöst ([ADR 0017](adr/0017-erweiterungstyp-lebende-referenz.md)); die Unterelemente stehen bewusst **nicht** im Profil. Altbestand trägt das Feld nicht — keine Migration; `datentypQuelleOf` in `core/util/datentyp.util.ts` löst es auf (kuratierter xs:-Basistyp → `'xs'`, sonst `'frei'`). Der `ProfilDiffService` vergleicht nur `datentyp`, nicht die Herkunft — sonst stünde ein Typwechsel zweimal im Diff.

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

| Gruppe            | Signale                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| Schema/Nachricht  | `docs, idx, version, standardKennung, msgName, root`                                                                 |
| Profil            | `meta, statuses, elemente, auspraegungen, erweiterungen`                                                             |
| UI                | `selItem, open (Set), codelists, showTech, onlyProfile, showRefs, focusMode, pendingMsg, scrollTarget, autosaveInfo` |
| Diff              | `showDiff, diffMap, diffAnc, idxB`                                                                                   |
| Validierung       | `valFehler, valAnc` (Fehler-Markierung des letzten Prüflaufs)                                                        |
| Nachrichten-Modus | `messageEdit, messageCreate, readOnly, onlyValues, guided, abnahmeSchreibschutz`                                     |
| Ableitungen       | `profileDoc`, `fortschritt`, `isMessageEdit`, `isMessageCreate`, `msgMode`                                           |

### Sessions des Nachrichten-Modus (`testmessage.model.ts`)

`MessageCreateSession` (geführtes Erstellen) trägt `msgName`, `xjustizVersion`, `entryId` und `name`.

`MessageEditSession` (geladene Instanz) enthält Runtime-DOM und ist deshalb **nicht persistierbar**:

| Feld             | Bedeutung                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `msgName`        | Root-Nachrichtenname                                                                                |
| `quellName`      | Anzeigename der Quelle (Vorschlag für „als neue Nachricht")                                         |
| `xjustizVersion` | Version aus dem Nachrichtenkopf                                                                     |
| `entryId`        | id des Testspeicher-Eintrags; `null` bei Datei-Upload/Drop — nur mit id ist Zurückschreiben möglich |
| `sourceDoc`      | geparstes Original-Dokument (Basis des treuen Re-Exports)                                           |
| `quelle`         | Modell-Pfad → Quell-Element                                                                         |
| `vorkommenIndex` | Ausprägungs-Pfad (`pfad@auspId`) → Index des Quell-Vorkommens (stabil beim Löschen)                 |

`StateService.nachrichtBearbeiten(an)` schaltet zwischen Betrachten und Bearbeiten: `readOnly` und `onlyValues` wandern gemeinsam. „Nur Werte" muss beim Bearbeiten fallen, sonst blieben unbelegte Elemente unsichtbar und ließen sich nicht befüllen. Bei gesetztem `abnahmeSchreibschutz` verweigert die Methode das Bearbeiten.

## Pfad-indizierte Maps (zentral)

`elemente`, `auspraegungen` und `erweiterungen` sind `Record<string, …>`, indexiert über den **Item-Pfad**:

- **Element:** `nachricht.x/eltern/kind` — Segmente durch `/`; synthetische Gruppen tauchen im Baum auf, aber nicht im Instanz-Pfad der Exporte.
- **Duplikate:** gleiches Element mehrfach im selben Typ → Suffix `#n` (`beteiligter#1`).
- **Ausprägung:** `…/beteiligung@a<id>` — ein eigener Pfad-Raum; darunter liegende Profilierungen erben den Präfix (`…/beteiligung@a<id>/name`).
- **Schema-Erweiterung:** eigener Pfad `elternPfad/~<id>` (z. B. `…/grunddaten/~x1abc`). `~` ist kein NCName-Zeichen → keine Kollision mit Elementnamen, `#n` oder `@auspId`; der Separator bleibt `/`, daher funktionieren alle Präfix-Kaskaden unverändert. Verschachtelung: `…/~x1/~x2`. Der Pfad trägt die **id**, nicht den Namen — Umbenennen verschiebt keine Profil-Einträge.
- `elemente[pfad]` = `ElementProfile`; `auspraegungen[pfad]` = `Auspraegung[]`; `erweiterungen[elternPfad]` = `Erweiterung[]` (indexiert am **Elternpfad**, nicht am eigenen Pfad).

**Warum das wichtig ist:**

- **Kaskaden:** `removeAusp(path, id)` entfernt alle Keys mit Präfix `path@id` aus `elemente`, `auspraegungen` **und** `erweiterungen` und bereinigt `selItem`/`open`; `removeErweiterung(parentPath, id)` kaskadiert analog über den Präfix `parentPath/~id`; `bereinigeUnter(pfad)` ist dieselbe Kaskade **ohne** den Knoten selbst (Typwechsel einer Erweiterung, [ADR 0017](adr/0017-erweiterungstyp-lebende-referenz.md)). `festlegungenUnter(pfad)` zählt, was dabei fällt.
- **Signal-Feuern:** Jede Mutation erzeugt eine neue Map-Referenz (`{ ...m, [k]: v }`); In-Place-Änderungen würden das Signal nicht auslösen. Ausnahme: `renameAusp` mutiert den Namen in place (damit die Auswahl konsistent bleibt) **und** setzt eine neue Array-Referenz.
- **Aufräumen:** `pruneP` löscht Einträge ohne belegte Felder, damit `fortschritt` und Exporte sauber bleiben.

Bei `noUncheckedIndexedAccess` (aktiv) liefert `elemente[path]` immer `T | undefined` — Zugriffe sind entsprechend abgesichert.

## Persistenz der Bibliothek (Backend, SQLite)

Profilierungen werden in einer SQLite-Datenbank des Backends (`server/`) gehalten — nicht mehr im `localStorage` ([ADR 0007](adr/0007-datenbank-backend.md)). Eine Tabelle `profiles`: das komplette `ProfileDoc` als JSON-Spalte `doc`, daneben die **abgeleiteten Index-Spalten** `name, nachricht, xjustiz_version, n_status, n_ausp, n_erw, gespeichert, aktualisiert` (fehlende Spalten werden beim Start per PRAGMA-Migration nachgezogen). Aus diesen Spalten rendert `GET /api/profiles` die schlanke `LibraryEntry`-Liste fürs Dashboard, **ohne** die (potenziell großen) `doc`-Maps zu deserialisieren; das vollständige Dokument liefert `GET /api/profiles/:id`.

- **`LibraryEntry`** = `{ id, name, autor?, beschreibung?, tags?, nachricht?, xjustizVersion?, nStatus, nAusp, nErw?, gespeichert?, aktualisiert }` — serverseitig aus dem Dokument abgeleitet (`server/fortschritt.js`, spiegelt `StateService.fortschritt`). `nErw` speist das Dashboard-Badge „N Schema-Erweiterungen" (optional — Zeilen von vor der Migration liefern es erst nach dem nächsten Speichern).
- **Client:** `ProfileStoreService` spricht `/api` per nativem fetch an (async); das reaktive `entries`-Signal bleibt die Fassache fürs Dashboard und wird nach jedem Schreib-Call mit dem vom Server gelieferten `LibraryEntry` gepflegt. Der Autosave (`PersistenceService`, 800-ms-Debounce, In-Flight-Reschedule) schreibt in `PUT /api/profiles/:id`.
- **Hinweise:** eigene Tabelle `hinweise(id, profil_id, pfad, text, autor, rolle, zeit, erledigt)` neben `profiles`, bedient über `/api/profiles/:id/hinweise` ([ADR 0014](adr/0014-hinweise-eigene-ressource.md)). Sie laufen bewusst **nicht** über `PUT /api/profiles/:id` — sonst löschte der Autosave eines anderen Bearbeiters fremde Hinweise. Beim Serverstart hebt `migriereHinweise()` den Altbestand einmalig aus den Dokumenten in die Tabelle (idempotent).
- **Migration:** frühere localStorage-Bibliotheken (`xjp.library.index`/`xjp.library.doc.<id>`, Legacy `xjp.autosave`) werden einmalig via `MigrationService` → `POST /api/import` übernommen (id + `aktualisiert` bleiben erhalten).

### Schlagworte (Tags)

Profilierungen und Testnachrichten tragen freie **Schlagworte** — eine Ablage-Ordnung
neben Fachmodul und Nachrichtentyp. Sie liegen dort, wo der jeweilige Bestand ohnehin
liegt: am Profil in `meta.tags` (also im `ProfileDoc`, damit Export/Import und Versionen
sie mitführen), an der Testnachricht in der Spalte `testmessages.tags` als JSON-Array
(PRAGMA-Migration; die Liste ist kurz, wird immer ganz gelesen und ganz geschrieben —
eine eigene Tabelle brächte nur Joins). Beide Wege normalisieren beim Einliefern
(`server/tags.js`, gespiegelt in `src/app/core/util/tags.util.ts`): getrimmt, ohne Leere,
Doppelte ohne Rücksicht auf Groß-/Kleinschreibung zusammengefasst, alphabetisch,
gedeckelt auf 20 Schlagworte à 40 Zeichen.

Schlagworte sind **keine fachliche Aussage**: der `fach_hash` lässt `meta.tags` aussen vor,
und die `META_FELDER` des Profil-Vergleichs führen sie nicht. Wer eine freigegebene
Profilierung nachträglich einsortiert, entwertet damit weder die Freigabe noch markiert er
gebundene Testnachrichten als „Profil weiterentwickelt".

Gepflegt werden die Kachel-Metadaten (Name, Autor, Beschreibung, Schlagworte) über
`PATCH /api/profiles/:id` → `db.patchMeta` bzw. `PATCH /api/testmessages/:id` → `db.tmUpdate`:
nur gesetzte Felder wirken, das Dokument liest und schreibt der Server selbst — das große
`doc` wandert dafür nicht durch die Leitung. Der frühere Umbenennen-Endpunkt ist derselbe
(ein Body mit nur `name`).

Gefiltert wird im Client auf dem ohnehin geladenen Index (`tagOptionen`/`hatAlleTags`);
mehrere gewählte Schlagworte wirken **zusammen** (UND).

### Versionen (`profile_versions`)

[US Profilierung versionieren](user-stories/profilierung-versionieren.md): Tabelle
`profile_versions` = `{ id, profile_id, nr, kommentar, automatisch, doc, doc_hash, fach_hash, erstellt }`
mit `UNIQUE(profile_id, nr)` — `nr` läuft je Profil fortlaufend und wird nie recycelt;
`doc`/`doc_hash`/`fach_hash` werden beim Anlegen **verbatim** aus der `profiles`-Zeile kopiert
(Snapshot des gespeicherten Stands, kein Request-Body). `doc_hash` (sha1 über den
doc-String, auch auf `profiles` mit Backfill-Migration) macht zwei Prüfungen zu
Spaltenvergleichen: die **Entprellung** der Automatik-Versionen (Öffnen-Snapshot,
Sicherheits-Version beim Restore — zusätzlich auf die jüngsten 10 gedeckelt,
manuelle unbegrenzt) und das Kennzeichen **`geaendert`** im `LibraryEntry`
(`nVersionen`/`letzteVersionNr`/`geaendert`): gesetzt, wenn der Arbeitsstand in
_keiner_ Version eingefroren ist. Profil-Löschen kaskadiert (Transaktion, kein FK);
`importAll` fasst Versionen nie an. Bewusst akzeptiert: der Hash vergleicht die
Serialisierung, nicht die Semantik — falsch-positive „geändert" sind harmlos.

Für das Kennzeichen **`geaendertSeitAbnahme`** gilt das gerade nicht: dort entscheidet
der `fach_hash` (kanonisch, ohne `meta.gespeichert`, ohne `meta.tags` und ohne `fortschritt`). Der
doc-Hash würde schon das bloße Öffnen als Änderung melden, weil der Autosave den
abgeleiteten Punktestand nachschreibt — siehe Nachtrag in
[ADR 0012](adr/0012-abnahme-rollenkonzept.md).

Das eingefrorene `doc` ist über `GET /api/profiles/:id/versions/:vid` bzw. — für die
referenzierte Abnahme-Version — über `GET /api/profiles/:id/abnahme` lesbar (Metadaten plus
Dokument, bewusst ohne Schlüsselprüfung). Darauf setzt der feldgenaue Profil-Vergleich auf
([ADR 0013](adr/0013-vergleich-seit-abnahme.md)).
