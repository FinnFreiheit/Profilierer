# Services

Referenz der Logik-Schicht. Alle Services sind `@Injectable({ providedIn: 'root' })` und liegen in `src/app/core/services/`. Zeilenverweise beziehen sich auf `legacy/Profilierer.html`. Für den Zustand selbst siehe [Datenmodell](data-model.md).

## Überblick

| Service | Verantwortung |
|---|---|
| `StateService` | Signals-Store: gesamter Zustand + Profil-Mutationen (Kern) |
| `XsdParserService` | XSD parsen/indexieren, Codelisten-/Typ-Auflösung |
| `TreeService` | Element-Baum lazy aufbauen, Ausprägungs-Kontexte, Flatten für Diff |
| `NavService` | Nachricht laden, Auf-/Zuklappen, Auswahl, Pfeiltasten, Sprünge |
| `ValueService` | Codelisten-Werte + typgerechte Beispiel-/Platzhalterwerte |
| `CodelistService` | Genericode-Parsing, ZIP-/Datei-Import, XRepository, Cache |
| `ExportService` | Excel-, Schematron-, Beispiel-XML-Export, Druckzeilen |
| `DiffService` | Versionsvergleich (flach), Diff-Karte, Vergleichsordner laden |
| `BundledSchemaService` | Im Projekt hinterlegte Schemaversionen (public/schemas/) per fetch laden |
| `InstanceImportService` | Bestehende XJustiz-Nachricht (XML) zurück ins Profil-Modell binden |
| `PersistenceService` | XSD laden, Autosave (async, Race-Schutz), Profil öffnen/anlegen, Datei-Import/-Export |
| `ProfileStoreService` | Profil-Bibliothek: HTTP-CRUD gegen das Backend (`/api`), `entries`-Signal |
| `MigrationService` | Einmalige Übernahme der localStorage-Bibliothek ins Backend |
| `DownloadService` | Blob-Download + Profil-Dateinamen |
| `SearchService` | Baum-Suchindex + Ranking |
| `ToastService` | Kurzmeldungen (Signal) |

## StateService — der Kern

Ersetzt das globale `S`/`S.profile` (Z.327-335). Jedes Feld ein Signal, Ableitungen als `computed`.

- **Signale:** Schema/Nachricht (`docs, idx, version, standardKennung, msgName, root`), Profil (`meta, statuses, elemente, auspraegungen`), UI (`selItem, open, codelists, showTech, onlyProfile, showRefs, focusMode, scrollTarget, autosaveInfo, pendingMsg`), Diff (`showDiff, diffMap, diffAnc, idxB`).
- **Ableitungen:** `profileDoc`, `fortschritt` (Festlegungen/Ausprägungen, Z.1453).
- **Profil-Zugriff:** `statusOf/wirkungOf/exclStatus`, `inheritedExcluded/ancestorPaths`, `effKard`, `hasNotes`, `boxHidden` (nur-Profil-Filter), `auspNumber/auspLabel`, `refZielKandidaten`.
- **Mutationen (erzeugen neue Referenzen):** `setElementProfile` (merge + `pruneP`, Z.987-996), `addAusp/removeAusp` (kaskadierend, Z.1017-1035), `renameAusp`, `duplicateElement/copyAusp` (+ private `moveSubProfile/copySubProfile`, Z.1393-1434), `toggleOpen/setOpen`, Status-CRUD (`addStatus/updateStatus/removeStatus/statusUsed`), `patchMeta`, `loadProfile/resetProfile`.

`removeAusp` und `pruneP` sind der heikelste Teil und **unit-getestet** (`state.service.spec.ts`).

## XsdParserService

Zustandslos — der Index wird als **Parameter** durchgereicht (löst den früheren globalen `withIdx`-Hack, Z.379). Methoden: `buildIndexFrom(docs)` (Z.348), `particlesOfCT(ct, idx)` (Z.385, inkl. Vererbung), `enumsOfST(st, idx)` (Z.416), `codelistOf(typeName, idx)` (Z.435), `valueKind(node, idx)` (Z.580).

## TreeService

Baut den Element-Baum lazy. `expandNode` mutiert `node.children` (Cache-Baum, bewusst kein reaktiver Zustand). Instanzfelder `nodeId`/`ctxCache`/`idx` (früher globale Mutables). Methoden: `buildRoot(msgName, idx)`, `expandNode`, `isLeaf`, `isRepeatable`, `ctxNode` (Ausprägungs-Pfadraum, Z.544), `childItems/itemHasKids/rootItem`, `flattenSchema(msgName, idx)` (Wegwerf-Baum für den Diff, stellt aktiven Index wieder her).

## NavService

`loadMessage` (Z.1732), `expandAllTree/collapseTree`, `findItemByPath/findChainByPath/openAncestors/openPathTo`, `selectItem` (+ Scroll-Anforderung), `jumpTo`, `arrowNavigate(key)` (Pfeiltasten, Z.2443).

## ValueService

`clWerte/clVersion` (effektive Codelisten-Werte, Z.797) und `placeholderFor(node)` (Beispiel-/Platzhalterwert inkl. Referenz-Nummern, Z.2001). `XS_BUILTIN`-Tabelle typgerechter Defaults.

## CodelistService

`parseGenericode(dom)` (Z.808), `mergeCodelist` (neuere Version gewinnt), `importCodelistZip` (JSZip, dynamisch geladen), `loadCodelistFiles`, `xrepFetch` (Dev-Proxy → Direkt → CORS-Fallback, Z.892), `loadFromXRepository`, `fetchSingleCodelist`, `cacheCodelists/loadCodelistCache` (localStorage `xjp.clcache`). Lädt den Cache im Konstruktor.

## ExportService

`exportExcel` (SheetJS dynamisch, 3 Blätter), `exportSchematron` (Regeln aus Wirkung/Kardinalität/Werten + Mindest-Ausprägungen), `genBeispielXml` (Instanz-Aufbau mit `include`/`chooseBranch`/`emit`), `buildPrintRows` (für die Druckansicht). Private `walkFull`-Traversierung (Z.1826).

## DiffService

`computeDiff` (Nachrichten- und Element-Ebene, Z.2193), `computeDiffMap` (Diff-Karte + Vorfahren-Zähler für die Baum-Markierung), `profiledUnder`, `loadXsdB` (Vergleichsschemata laden, aktiviert Diff).

## BundledSchemaService

Lädt die **im Projekt hinterlegten** XJustiz-Schemaversionen (`public/schemas/<version>/`), damit kein XSD-Ordner mehr hochgeladen werden muss. `manifest()` liest (und cacht) `public/schemas/index.json`; `files(v)` holt die XSDs der Version per `fetch` und verpackt sie als `File[]` — damit speisen sie die **bestehenden** Ladewege (`PersistenceService.loadXsdFiles` als Primärschema, `DiffService.loadXsdB` als Vergleich), ohne die Parser-Logik zu duplizieren.

Verdrahtung: `App.ngOnInit` lädt das Manifest nach `StateService.bundledVersions` und aktiviert automatisch die als `default` markierte Version (3.6.2). Der Topbar-`<select>` (`.verSelect`) schaltet um (`App.loadBundled`), `StateService.activeBundle` merkt sich die aktive hinterlegte Version (null = eigener Ordner). Der Diff-Dialog bietet die hinterlegten Versionen als Vergleich an (die aktive Primärversion ausgeblendet). Das Manifest wird mit `npm run schemas:manifest` (`scripts/gen-schema-manifest.mjs`) aus den Ordnern erzeugt — nach jedem Hinzufügen/Austauschen von XSDs neu ausführen.

## InstanceImportService

Lädt eine bestehende XJustiz-Nachricht (XML-Instanz) und bildet sie gegen das geladene Schema **zurück ins Profil-Modell** ab — die Umkehrung von `ExportService.genBeispielXml`. `importXml(text)` bestimmt aus dem Wurzelelement die `nachricht.*`, ruft `NavService.loadMessage` und bindet dann rekursiv: Blatt-Werte → Testwert (`beispiel`), Codelisten-`<code>` → Wert, mehrfach vorkommende Elemente → Ausprägungen „Vorkommen N" (ab 2 Vorkommen; genau 1 → direkt). Kein Status wird gesetzt. `rootMessageName(text)` (statisch) erkennt XJustiz-Nachrichten fürs Drop-Routing. Ergebnis: der Baum sieht aus wie eine von Hand gebaute Testnachricht.

## PersistenceService

`loadXsdFiles` (Z.1746, inkl. pendingMsg-Anwendung), Autosave-`effect` mit Debounce (800 ms) → `autosaveNow` (async `store.upsert`, In-Flight-Reschedule gegen Lost Updates, gedrosselter Fehler-Toast), `openFromLibrary`/`createNew` (async), `saveProfile`/`exportDoc` (v2-JSON-Datei), `loadProfileFile` + `migrateV1` (v1→v2). Alle Bibliotheks-Zugriffe laufen über den `ProfileStoreService`.

## ProfileStoreService

Einzige Persistenz-Kapsel der Profil-Bibliothek — spricht das Backend per nativem `fetch` an ([ADR 0007](adr/0007-datenbank-backend.md)). `entries` (Signal, reaktive Index-Fassade fürs Dashboard), `refresh` (GET `/api/profiles`), `load` (GET, 404→null), `upsert`/`create`/`duplicate`/`rename`/`delete` (async, pflegen `entries` mit dem vom Server gelieferten `LibraryEntry`), `importAll` (Migration). Getestet mit gemocktem `fetch` (`profile-store.service.spec.ts`).

## MigrationService

`runOnce()` — idempotente Einmal-Migration der früheren localStorage-Bibliothek (`xjp.library.*`, Legacy `xjp.autosave`) via `POST /api/import`; nur bei leerem Backend, Marker `xjp.migrated`, localStorage bleibt als Sicherheitskopie. Ausgelöst in `App.ngOnInit`.

## Kleinere Services & Utilities

- `DownloadService`: `download(name, content, mime)`, `profilFilename(ext)`.
- `SearchService`: `buildIndex` (Baum-Traversierung), `run(query)` (Präfix vor Teilstring, Top 40).
- `ToastService`: `show(text, ms)` über ein Signal → `Toast`-Komponente.
- `core/util/xml.util.ts`: `kids/kid/local/docOf/appinfoOf/esc/escapeRegExp`, Namespaces `XS`/`XJNS`.
- `core/util/pretty.util.ts`: `pretty/kardText/fmtKard`.
- `core/refs.ts`: `REF_LABELS/REF_TARGETS`, `refKindOf(node)`.
