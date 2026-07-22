# Komponenten

Feature-Komponenten (`src/app/features/`) und Querschnitt (`src/app/shared/`). Alle standalone, `ChangeDetectionStrategy.OnPush`. Zeilenverweise auf `legacy/Profilierer.html`. Zustand kommt aus dem [StateService](services.md); die App-Shell (`app.ts`) komponiert alles und hält Tastatur-Navigation und Drop-Routing.

## Kopf & Werkzeuge

| Komponente | Selector | Zweck / Schnittstelle |
|---|---|---|
| `Topbar` | `app-topbar` | Laden (XSD/Codelisten/Profil), Versions-Pille, Diff-Button. Outputs: `xsdFiles, codelistFiles, profileFile, xrepClick, diffClick`. `verInfo`/`diffLabel` als `computed` (Z.196-209). |
| `Toolbar` | `app-toolbar` | Nachrichtenwahl, Szenario-Name, Fortschritt, Autosave-Anzeige, Ansichts-Umschalter, Export-Buttons. Bindet Checkboxen direkt an Store-Signale; Dialog-/Export-Aktionen als Outputs. Enthält `MessagePicker` + `Search` (Z.211-241). |
| `MessagePicker` | `app-message-picker` | Popover mit nach Datei gruppierter, gefilterter Nachrichtenliste; Auswahl → `NavService.loadMessage` (Z.1704-1731). |
| `Search` | `app-search` | Sucheingabe + Treffer-Popover; Enter springt zum ersten Treffer über `SearchService` (Z.694-742). |
| `Crumbs` | `app-crumbs` | Pfadleiste Wurzel → Auswahl, klickbar; `chain` als `computed` über `NavService.findChainByPath` (Z.777-792). |

## Baum

| Komponente | Selector | Zweck / Schnittstelle |
|---|---|---|
| `TreeCanvas` | `app-tree-canvas` | Scrollbereich `#treeCanvas` + SVG-Overlay der Verbindungslinien; rendert den rekursiven Wurzelknoten. Berechnet Linien aus DOM-Geometrie (`effect` + `ResizeObserver` + `afterNextRender`, `rAF`-Debounce) und scrollt/flasht auf Anforderung (Z.1066-1206, 682-691). |
| `TreeNode` | `app-tree-node` | **Rekursiv.** Host-Klasse `ntree`, darin `.box` + `.nkids`. Input `item: TreeItem`. Ein großes `vm`-`computed` leitet Klassen, Status-Streifen, Kardinalität, Tags, Testwert, Diff-/Validierungs-Markierungen ab; `phantoms`-`computed` für „neu in Vergleichsversion"-Kästen. Aktionen (Status/Toggle/Ausblenden/Duplizieren/Ausprägung/Testwert) rufen Store-Methoden (Z.1207-1391, 1080-1117). **Schema-Erweiterungen:** `.box.extBox` (violett gestrichelt) mit Tag `t-ext`, Lösch-Button und `.addBox.addExt` „+ Element (Erweiterung)" an aufklappbaren Containern (öffnet den Erweiterungs-Dialog via `ErweiterungDialogService`). |

Wichtig: Die Klassen `.ntree/.nkids/.box/.addBox/.excluded/.phantom` und die `data-path`/`data-refkind`/`data-refziel`-Attribute müssen stabil bleiben — `TreeCanvas` vermisst darüber die Geometrie ([ADR 0003](adr/0003-svg-verbindungslinien.md)).

## Detail & Dialoge

| Komponente | Selector | Zweck / Schnittstelle |
|---|---|---|
| `DetailPanel` | `app-detail-panel` | Rechter Bereich für das ausgewählte Item: Status, Kardinalität, Ausprägungen, Codelisten-Werte (Checkbox/Filter/Extern-Textarea/Einzelabruf), Verweisziel, Anmerkung, Beispielwert. Für Schema-Erweiterungen ein eigener Editier-Abschnitt (Name/Beschreibung/Kardinalität/Datentyp, „+ Unterelement", „Erweiterung löschen") — die generische Kardinalitäts-Override-Zeile ist dort ausgeblendet. `vm` aus `selItem` (Z.1506-1666). |
| `StatusDialog` | `app-status-dialog` | Statusstufen konfigurieren (Name/Farbe/Wirkung/Löschen). Natives `<dialog>`, `open()`-Methode (Z.1669-1702). |
| `MetaDialog` | `app-meta-dialog` | Profil-Details (Name/Autor/Stand/Beschreibung). `open()` füllt aus `meta`, `submit()` schreibt via `patchMeta` (Z.2417-2432). |
| `DiffDialog` | `app-diff-dialog` | Versionsvergleich: Kopf (Versionen, Anzahl, Profil-Bezug, Nachrichten-Überblick) + gefilterte Diff-Liste (klickbar → Sprung, Kopier-Knopf). Output `loadOther` (Z.2243-2312). |
| `ValidationDialog` | `app-validation-dialog` | Validierungsbericht (gesteuert vom `ValidationReportService`): Fehlerliste mit klickbaren Pfad-Einträgen (Sprung zum Knoten); Fehler durch bekannte Schema-Erweiterungen sind gekennzeichnet und werden im Kopf getrennt gezählt. |
| `ErweiterungDialog` | `app-erweiterung-dialog` | Formular „Schema-Erweiterung anlegen" (Name mit NCName-Prüfung + Kollisionswarnung, Beschreibung, Kardinalität, Datentyp-Select aus `ERW_DATENTYPEN` + Freitext + Container). Gesteuert vom `ErweiterungDialogService`, Muster `meta-dialog`. |

## Fuß & Querschnitt

| Komponente | Selector | Zweck |
|---|---|---|
| `Legend` | `app-legend` | Statuslegende + Symbol-Hinweise (Z.1458-1466). |
| `PrintDoc` | `app-print-doc` | Druckansicht `#printDoc` (nur `@media print`). `print()` befüllt Zeilen via `ExportService.buildPrintRows` und ruft `window.print()` (Z.2334-2365). |
| `Toast` | `app-toast` | Kurzmeldung, liest `ToastService.text`. |
| `FileDropDirective` | `[appFileDrop]` | Drag&Drop; meldet abgelegte Dateien, Zuordnung (XSD/Profil/Codelisten) erledigt die Shell (Z.2433-2442). |

## App-Shell (`app.ts`)

Komponiert alle Bereiche, hält die versteckten File-Inputs (Vergleichsordner), verdrahtet Dialog-Referenzen (`#statusDlg`, `#metaDlg`, `#diffDlg`) und Export-Buttons, routet Drops und behandelt Pfeiltasten (`document:keydown` → `NavService.arrowNavigate`, gesperrt in Eingabefeldern/Dialogen).
