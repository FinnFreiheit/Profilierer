# Services

Referenz der Logik-Schicht. Alle Services sind `@Injectable({ providedIn: 'root' })` und liegen in `src/app/core/services/`. Zeilenverweise beziehen sich auf `legacy/Profilierer.html`. Für den Zustand selbst siehe [Datenmodell](data-model.md).

## Überblick

| Service                        | Verantwortung                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `StateService`                 | Signals-Store: gesamter Zustand + Profil-Mutationen (Kern)                                                            |
| `XsdParserService`             | XSD parsen/indexieren, Codelisten-/Typ-Auflösung                                                                      |
| `TreeService`                  | Element-Baum lazy aufbauen, Ausprägungs-Kontexte, Flatten für Diff                                                    |
| `NavService`                   | Nachricht laden, Auf-/Zuklappen, Auswahl, Pfeiltasten, Sprünge                                                        |
| `ValueService`                 | Codelisten-Werte + typgerechte Beispiel-/Platzhalterwerte                                                             |
| `CodelistService`              | Genericode-Parsing, ZIP-/Datei-Import, XRepository, Cache                                                             |
| `ExportService`                | Schematron-, Beispiel-XML-Export, Druckzeilen (+ Guard für offene Entscheidungen)                                     |
| `ExcelExportService`           | Excel-Export im NGem-Abstimmungslayout (ExcelJS, dynamisch geladen)                                                   |
| `GuidedService`                | Geführter Modus: offene Entscheidungspunkte, Fortschritt, Sprung zum nächsten Punkt                                   |
| `DiffService`                  | Versionsvergleich (flach), Diff-Karte, Vergleichsordner laden                                                         |
| `BundledSchemaService`         | Im Projekt hinterlegte Schemaversionen (public/schemas/) per fetch laden                                              |
| `InstanceImportService`        | Bestehende XJustiz-Nachricht (XML) zurück ins Profil-Modell binden                                                    |
| `InstanceExportService`        | Bearbeitete Nachricht getreu re-exportieren (Original-DOM + Modell-Änderungen)                                        |
| `TestmessageStoreService`      | Testdaten-Speicher: HTTP-CRUD gegen das Backend (`/api`), `entries`-Signal                                            |
| `TestmessageGenerationService` | Testnachricht aus einem Bibliotheksprofil erzeugen (Schema sicherstellen, State-Swap)                                 |
| `TestmessageCreateService`     | Testnachricht geführt aus einem Schema erstellen (Session, Entwurf speichern/fortsetzen)                              |
| `XmlValidationService`         | XSD-Validierung von Instanzen im Browser (xmllint-wasm, lazy; Schemaquelle: geladener Stand oder hinterlegte Version) |
| `ValidationReportService`      | Zustand des Validierungsbericht-Dialogs (blockierte Exporte/Uploads mit Fehlerliste)                                  |
| `ValidationMarkerService`      | Fehlerzeilen → Baumpfade auflösen, Baum-Marker setzen, Erweiterungs-Fehler klassifizieren                             |
| `ErweiterungDialogService`     | Zustand des Erweiterungs-Dialogs (Anlage einer Schema-Erweiterung aus Baum/Detailpanel)                               |
| `PersistenceService`           | XSD laden, Autosave (async, Race-Schutz), Profil öffnen/anlegen, Datei-Import/-Export                                 |
| `ProfileStoreService`          | Profil-Bibliothek: HTTP-CRUD gegen das Backend (`/api`), `entries`-Signal                                             |
| `MigrationService`             | Einmalige Übernahme der localStorage-Bibliothek ins Backend                                                           |
| `DownloadService`              | Blob-Download + Profil-Dateinamen                                                                                     |
| `SearchService`                | Baum-Suchindex + Ranking                                                                                              |
| `ToastService`                 | Kurzmeldungen (Signal), `showError`/`fail`-Fehlerhelfer                                                               |

## StateService — der Kern

Ersetzt das globale `S`/`S.profile` (Z.327-335). Jedes Feld ein Signal, Ableitungen als `computed`.

- **Signale:** Schema/Nachricht (`docs, idx, version, standardKennung, msgName, root`), Profil (`meta, statuses, elemente, auspraegungen, erweiterungen`), UI (`selItem, open, codelists, showTech, onlyProfile, showRefs, focusMode, scrollTarget, autosaveInfo, pendingMsg`), Diff (`showDiff, diffMap, diffAnc, idxB`), Validierung (`valFehler, valAnc`).
- **Ableitungen:** `profileDoc`, `fortschritt` (Festlegungen/Ausprägungen/Erweiterungen, Z.1453).
- **Profil-Zugriff:** `statusOf/wirkungOf/exclStatus`, `inheritedExcluded/ancestorPaths`, `effKard`, `hasNotes`, `boxHidden` (nur-Profil-Filter), `auspNumber/auspLabel`, `refZielKandidaten`, `erweiterungenOf`.
- **Mutationen (erzeugen neue Referenzen):** `setElementProfile` (merge + `pruneP`, Z.987-996), `addAusp/removeAusp` (kaskadierend, Z.1017-1035), `addErweiterung/updateErweiterung/removeErweiterung` (kaskadierend über den Präfix `parentPath/~id`, [ADR 0010](adr/0010-schema-erweiterungen-profil-overlay.md)), `renameAusp`, `duplicateElement/copyAusp` (+ private `moveSubProfile/copySubProfile`, Z.1393-1434 — nehmen Erweiterungen mit), `toggleOpen/setOpen`, Status-CRUD (`addStatus/updateStatus/removeStatus/statusUsed`), `patchMeta`, `loadProfile/resetProfile`.

`removeAusp`, `removeErweiterung` und `pruneP` sind der heikelste Teil und **unit-getestet** (`state.service.spec.ts`).

## XsdParserService

Zustandslos — der Index wird als **Parameter** durchgereicht (löst den früheren globalen `withIdx`-Hack, Z.379). Methoden: `buildIndexFrom(docs)` (Z.348), `particlesOfCT(ct, idx)` (Z.385, inkl. Vererbung), `enumsOfST(st, idx)` (Z.416), `codelistOf(typeName, idx)` (Z.435), `valueKind(node, idx)` (Z.580).

## TreeService

Baut den Element-Baum lazy. `expandNode` mutiert `node.children` (Cache-Baum, bewusst kein reaktiver Zustand). Instanzfelder `nodeId`/`ctxCache`/`idx` (früher globale Mutables). Methoden: `buildRoot(msgName, idx)`, `expandNode`, `isLeaf`, `isRepeatable`, `ctxNode` (Ausprägungs-Pfadraum, Z.544), `childItems/itemHasKids/rootItem`, `flattenSchema(msgName, idx)` (Wegwerf-Baum für den Diff, stellt aktiven Index wieder her).

**Schema-Erweiterungen:** `kinder(n)` ist die Fassade für alle Konsumenten (Baum-Render, Exporte) — Schema-Kinder plus `erweiterungsKinder(n)`, die pro Aufruf frisch aus `state.erweiterungenOf(n.path)` synthetisiert werden (bewusst **nicht** in den `children`-Cache gemischt, der würde bei Add/Remove veralten). Erweiterungs-Knoten tragen `erweiterung` und `xsdEl: null`; `isLeaf`/`itemHasKids` haben eigene Branches (Container-Erweiterungen sind immer aufklappbar, darunter liegt die „+ Element"-Box).

## NavService

`loadMessage` (Z.1732, berechnet bei geladener Vergleichsversion die Diff-Karte neu und erhält die Schema-Ansicht), `openSchemaView` (US „Schema ansehen": Editor ohne Profilierung), `prefillMandatoryStatus`, `expandAllTree/collapseTree`, `findItemByPath/findChainByPath/openAncestors/openPathTo`, `selectItem` (+ Scroll-Anforderung), `jumpTo`, `arrowNavigate(key)` (Pfeiltasten, Z.2443). Getestet in `nav.service.spec.ts`.

## ValueService

`clWerte/clVersion` (effektive Codelisten-Werte, Z.797) und `placeholderFor(node)` (Beispiel-/Platzhalterwert inkl. Referenz-Nummern, Z.2001). `XS_BUILTIN`-Tabelle typgerechter Defaults.

## CodelistService

`parseGenericode(dom)` (Z.808), `mergeCodelist` (neuere Version gewinnt), `importCodelistZip` (JSZip, dynamisch geladen), `loadCodelistFiles`, `xrepFetch` (Dev-Proxy → Direkt → CORS-Fallback, Z.892), `loadFromXRepository`, `fetchSingleCodelist`, `cacheCodelists/loadCodelistCache` (localStorage `xjp.clcache`). Lädt den Cache im Konstruktor.

## ExportService

`exportSchematron` (Regeln aus Wirkung/Kardinalität/Werten + Mindest-Ausprägungen), `genBeispielXml`/`buildBeispielXml` (Instanz-Aufbau mit `include`/`chooseBranch`/`emit`; `{instanz: true}` für den Testnachricht-Zwischenstand; `buildBeispielXmlMitPfaden` liefert zusätzlich die Zeile→Pfad-Karte für die Fehler-Markierung), `buildPrintRows` (für die Druckansicht, `PrintRow.erweiterung` kennzeichnet Erweiterungs-Zeilen), `bestaetigeOffeneEntscheidungen` (Guard des geführten Modus, auch vom ExcelExportService genutzt). Private `walkFull`-Traversierung (Z.1826, läuft über `tree.kinder`).

**Schema-Erweiterungen:** werden im Beispiel-XML **immer** emittiert (`include` → true, bewusste XSD-Abweichung); im Schematron entstehen keine Asserts, sondern dokumentierende Kommentare je Erweiterung. `genBeispielXml` lässt den Download durch, wenn die Validierung **nur** Erweiterungs-Fehler meldet.

## ExcelExportService

`exportExcel` — Excel im **NGem-Abstimmungslayout** ([ADR 0008](adr/0008-exceljs-excel-export.md)): Hauptsheet mit kollabierten `Type.GDS.*`-Kindern, je ein Typ-Sheet, Codelisten-Sheets der Fachdaten, Meta-Sheet „Szenario" mit Statuslegende. Schema-Erweiterungen erscheinen mit Typ `[Erweiterung] <Datentyp|Container>`. ExcelJS wird dynamisch importiert (Lazy-Chunk). Getestet in `excel-export.service.spec.ts` (Export wird zurückgelesen).

## DiffService

`computeDiff` (Nachrichten- und Element-Ebene, Z.2193), `computeDiffMap` (Diff-Karte + Vorfahren-Zähler für die Baum-Markierung), `profiledUnder`, `loadXsdB` (Vergleichsschemata laden, aktiviert Diff).

## BundledSchemaService

Lädt die **im Projekt hinterlegten** XJustiz-Schemaversionen (`public/schemas/<version>/`), damit kein XSD-Ordner mehr hochgeladen werden muss. `manifest()` liest (und cacht) `public/schemas/index.json`; `files(v)` holt die XSDs der Version per `fetch` und verpackt sie als `File[]` — damit speisen sie die **bestehenden** Ladewege (`PersistenceService.loadXsdFiles` als Primärschema, `DiffService.loadXsdB` als Vergleich), ohne die Parser-Logik zu duplizieren.

Verdrahtung: `App.ngOnInit` lädt das Manifest nach `StateService.bundledVersions` und aktiviert automatisch die als `default` markierte Version (3.6.2). Der Topbar-`<select>` (`.verSelect`) schaltet um (`App.loadBundled`), `StateService.activeBundle` merkt sich die aktive hinterlegte Version (null = eigener Ordner). Der Diff-Dialog bietet die hinterlegten Versionen als Vergleich an (die aktive Primärversion ausgeblendet). Das Manifest wird mit `npm run schemas:manifest` (`scripts/gen-schema-manifest.mjs`) aus den Ordnern erzeugt — nach jedem Hinzufügen/Austauschen von XSDs neu ausführen.

## InstanceImportService

Lädt eine bestehende XJustiz-Nachricht (XML-Instanz) und bildet sie gegen das geladene Schema **zurück ins Profil-Modell** ab — die Umkehrung von `ExportService.genBeispielXml`. `importXml(text)` bestimmt aus dem Wurzelelement die `nachricht.*`, ruft `NavService.loadMessage` und bindet dann rekursiv: Blatt-Werte → Testwert (`beispiel`), Codelisten-`<code>` → Wert, mehrfach vorkommende Elemente → Ausprägungen „Vorkommen N" (ab 2 Vorkommen; genau 1 → direkt). Kein Status wird gesetzt. `rootMessageName(text)` (statisch) erkennt XJustiz-Nachrichten fürs Drop-Routing. Ergebnis: der Baum sieht aus wie eine von Hand gebaute Testnachricht.

## GuidedService

Führungs-/Zählschicht des geführten Modus (Signal-Store über denselben Daten): offene Entscheidungspunkte (`offeneSet`), `fortschritt` (x von y), `gotoNextOpen`, `offenePflicht`, `fuellePflichtfelder` (Dummy-Werte typkonform). Getestet in `guided.service.spec.ts`.

## InstanceExportService

`buildInstanceXml(session)` — treuer Re-Export einer bearbeiteten Nachricht: Original-DOM der Quelle plus Modell-Änderungen (geänderte Blattwerte, neue Elemente/Ausprägungen), Pretty-Serialisierung mit bewusst konservativem Text-Escaping (`escText` ohne `"`-Escape). Getestet in `instance-export.service.spec.ts`.

## Testnachricht-Services

- `TestmessageStoreService`: HTTP-CRUD des Testdaten-Speichers (`/api`), `entries`-Signal — Gegenstück zum `ProfileStoreService`.
- `TestmessageGenerationService`: erzeugt eine Testnachricht aus einem Bibliotheksprofil (`ensureSchema`, temporärer State-Swap, `buildBeispielXml`).
- `TestmessageCreateService`: US „Testnachricht geführt erstellen" — `neuErstellen`/`fortsetzen` (Session `messageCreate`), `speichern` (Entwurfs-Kennzeichen, Fortschritt, Entscheidungsstand; invalide fertige Nachrichten bleiben Entwurf).

Beide Erzeugungswege behandeln Validierungsfehler, die **nur** auf bekannte Schema-Erweiterungen zurückgehen, als bewusste Abweichung: kein Entwurfs-Kennzeichen, Download bleibt frei (Klassifikation via `ValidationMarkerService`).

## XmlValidationService, ValidationMarkerService & ValidationReportService

`XmlValidationService.validiere(xmlText)` prüft eine Instanz gegen das XJustiz-Schema ([ADR 0009](adr/0009-xsd-validierung-xmllint-wasm.md)): Nachricht/Version aus dem Wurzelelement, Schemaquelle = geladener Stand (`state.docs()`, re-serialisiert und je Referenz gecacht) oder passende hinterlegte Version (fetch, je Versions-id gecacht); Validierung via xmllint-wasm (statische Assets unter `xmllint/`, Laufzeit-`import()`). Ergebnis `{ status: 'valide' | 'invalide' | 'unpruefbar', fehler, fehlerDetails }` — an den Toren (Upload, Download, „Als neue Nachricht speichern", Beispiel-XML) wird nur `valide` durchgelassen; die geführte Erstellung und die Profil-Generierung kennzeichnen invalide Ergebnisse als Entwurf; „Nachricht laden" in den Baum warnt nur. Befunde zeigt der `ValidationReportService` (Signals `titel`/`eintraege`/`offen`) im `app-validation-dialog` (in der App-Shell eingebunden).

`ValidationMarkerService` übersetzt die Fehlerzeilen über die Zeile→Pfad-Karte aus `buildBeispielXmlMitPfaden` in Baumpfade: `markiere(fehler, zeilenPfade)` setzt die Marker-Signals `valFehler`/`valAnc` (rote Kennzeichnung im Baum, klickbare Berichts-Einträge) und `loesche()` räumt sie; `ordneZu` ist die signal-freie Variante für transiente Bäume (Testnachricht-Generierung). **Erweiterungs-Klassifikation:** Fehler auf `/~`-Pfaden — plus konservativer Namens-Fallback über den Fehlertext — werden als `erweiterung` geflaggt, erscheinen im Bericht als „bekannte Schema-Erweiterung", setzen aber keine roten Baum-Marker; `nurErweiterungsFehler(eintraege)` speist die gelockerten Tore.

## PersistenceService

`loadXsdFiles` (Z.1746, inkl. pendingMsg-Anwendung), Autosave-`effect` mit Debounce (800 ms) → `autosaveNow` (async `store.upsert`, In-Flight-Reschedule gegen Lost Updates, gedrosselter Fehler-Toast), `openFromLibrary`/`createNew` (async), `saveProfile`/`exportDoc` (v2-JSON-Datei), `loadProfileFile` + `migrateV1` (v1→v2). Alle Bibliotheks-Zugriffe laufen über den `ProfileStoreService`.

**Versionen** ([US Profilierung versionieren](user-stories/profilierung-versionieren.md)): `flushAutosave` wartet auch auf laufende Upserts (sonst fröre „Version anlegen" einen veralteten Stand ein); `openFromLibrary` flusht zuerst, legt fire-and-forget einen serverseitig entprellten Öffnen-Snapshot an und übergibt an den privaten Helfer `uebernehmeDoc` (Versions-Angleich + Nachricht aufbauen); `restoreVersion(versionId)` stellt eine Version des aktiven Profils in-place wieder her (Server sichert den Arbeitsstand vorher als Sicherheits-Version) — bewusst nicht über `openFromLibrary`, damit kein weiterer Öffnen-Snapshot entsteht.

## ProfileStoreService

Einzige Persistenz-Kapsel der Profil-Bibliothek — spricht das Backend per nativem `fetch` an ([ADR 0007](adr/0007-datenbank-backend.md)). `entries` (Signal, reaktive Index-Fassade fürs Dashboard), `refresh` (GET `/api/profiles`), `load` (GET, 404→null), `upsert`/`create`/`duplicate`/`rename`/`delete` (async, pflegen `entries` mit dem vom Server gelieferten `LibraryEntry`), `importAll` (Migration), dazu die Versions-API `listVersions`/`createVersion`/`restoreVersion`/`deleteVersion` (`/api/profiles/:id/versions…`; Schreib-Calls pflegen `entries`, der Entry trägt `nVersionen`/`letzteVersionNr`/`geaendert` fürs Kennzeichen „geändert seit vX"). Getestet mit gemocktem `fetch` (`profile-store.service.spec.ts`).

## MigrationService

`runOnce()` — idempotente Einmal-Migration der früheren localStorage-Bibliothek (`xjp.library.*`, Legacy `xjp.autosave`) via `POST /api/import`; nur bei leerem Backend, Marker `xjp.migrated`, localStorage bleibt als Sicherheitskopie. Ausgelöst in `App.ngOnInit`.

## Kleinere Services & Utilities

- `ErweiterungDialogService`: Signal-Zustand des Erweiterungs-Dialogs (`anfrage` mit `parentPath` + vorhandenen Kindnamen für die Kollisionswarnung); geöffnet aus `TreeNode` („+ Element (Erweiterung)") und `DetailPanel` („+ Unterelement"), gerendert einmal in der App-Shell (Muster `ValidationReportService`).
- `DownloadService`: `download(name, content, mime)`, `profilFilename(ext)`.
- `SearchService`: `buildIndex` (Baum-Traversierung), `run(query)` (Präfix vor Teilstring, Top 40).
- `ToastService`: `show(text, ms)` über ein Signal → `Toast`-Komponente; `showError(e, fallback)` und `fail(msg)` als einheitliche Fehlerhelfer.
- `core/util/xml.util.ts`: `kids/kid/local/docOf/appinfoOf/byName/leafValue/esc/escapeRegExp`, Namespaces `XS`/`XJNS`.
- `core/util/pretty.util.ts`: `pretty/kardText/fmtKard/firstLine`.
- `core/util/testmessage.util.ts`: `parseTestmessage` (Root-Metadaten), `frageTestnachrichtName`, `testmessageInput`.
- `core/util/pattern-sample.util.ts`: Beispielwerte zu XSD-Pattern-Facetten.
- `core/refs.ts`: `REF_LABELS/REF_TARGETS`, `refKindOf(node)`.
