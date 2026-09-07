# Architektur

Big Picture des Angular-Projekts: Schichten, der Signals-Store als Zentrum, Komponentenbaum und Datenfluss. Für Detailreferenzen siehe [Services](services.md), [Datenmodell](data-model.md) und [Komponenten](components.md).

## Schichten

```
src/app/
  models/     Reine Interfaces (kein Verhalten)              → data-model.md
  core/
    services/ Zustand & Logik (13 Services)                  → services.md
    util/     Reine Helfer (xml.util, pretty.util, fachmodul.util)
    refs.ts   Referenz-Metadaten (Type.GDS.Ref.*)
  features/   Feature-Komponenten (Sichten)                  → components.md
  shared/     Querschnitt (Toast, FileDropDirective)
  app.ts      Shell: Komposition, Tastatur-Nav, Drop-Routing
  styles.scss Globale Styles (aus der Single-File-Version portiert)
```

**Grundprinzip:** `StateService` ist ein **Signals-Store** — je Zustandsfeld ein `signal`, abgeleitete Sichten als `computed`. Die frühere imperative `renderAll()`-Kaskade entfällt; Angulars Change Detection (OnPush) reagiert auf Signal-Änderungen. Services schreiben in den Store, Komponenten lesen daraus. Siehe [ADR 0002](adr/0002-signals-store.md).

## Komponentenbaum

```mermaid
graph TD
  App["App (Shell)"]
  App --> Objektleiste["Objektleiste (Kopfzeile)"]
  App --> Ortzeile
  App --> Werkzeugleiste["Werkzeugleiste (Arbeitszeile)"]
  App --> Main["#main (colWrap + Detail)"]
  App --> Fusszeile
  App --> PrintDoc["PrintDoc (@media print)"]
  App --> Toast
  App --> Dlgs["Status- / Meta- / Diff- / Grundlage-Dialog"]
  Ortzeile --> MessagePicker
  Ortzeile --> Search
  Fusszeile --> Crumbs
  Main --> TreeCanvas
  Main --> XmlAnsicht
  Main --> DetailPanel
  DetailPanel --> DatentypPicker
  Dlgs --> DatentypPicker
  TreeCanvas --> LinkSVG["#linkSvg (Verbindungslinien)"]
  TreeCanvas --> TreeNode
  TreeNode -.->|rekursiv über childItems| TreeNode
```

`TreeNode` rendert sich rekursiv (Host-Klasse `ntree`, direkt darin `.box` + `.nkids`) — genau die DOM-Struktur, die `TreeCanvas` für die SVG-Linien vermisst.

Die **Kopfzone hat drei Zeilen** (Editor v4, [ADR 0022](adr/0022-design-system-spiegel.md)), je Zeile eine Frage: `Objektleiste` „was bearbeite ich" (Titel, Zustand, Primäraktion, ⋯-Menü mit allen Werkzeugen), `Ortzeile` „wo bin ich" (Nachrichtentyp, Feldsuche, Baum | XML) und `Werkzeugleiste` „wie arbeite ich und wie weit bin ich" (Modus, Stand, Ast-Chips, Ansicht). Unten schließt die `Fusszeile` mit vollem Pfad, Sicherungsstand und Hilfe ab; sie hat die frühere `Legend` abgelöst. In `#colWrap` steht je nach `StateService.darstellung()` der `TreeCanvas` oder die `XmlAnsicht` — dieselbe Nachricht, zwei Formen.

## Datenfluss

```mermaid
graph LR
  UI["Komponenten (Events)"] --> SVC["Services"]
  SVC -->|set / update| STORE["StateService (Signals)"]
  STORE -->|computed / signal read| UI
  STORE -->|effect + Debounce| PSS["ProfileStoreService (async)"]
  PSS -->|"fetch /api"| API[("Backend: Express + SQLite")]
  SVC -->|"fetch /xrep-api"| PROXY["Proxy → XRepository"]
  SVC -->|Cache| LS[("localStorage: CL-Cache")]
```

Kein Two-Way-Binding: Aktionen laufen über Service-Methoden, die den Store mutieren; die Anzeige aktualisiert sich reaktiv. Mutationen der pfad-indizierten Maps erzeugen **neue Referenzen** (sonst feuert das Signal nicht) — siehe [Datenmodell](data-model.md).

## Typischer Ablauf

```mermaid
sequenceDiagram
  actor U as Nutzer
  participant TB as Werkzeugleiste
  participant PS as PersistenceService
  participant NV as NavService
  participant ST as StateService
  participant EX as ExportService
  U->>TB: XSD-Ordner wählen / droppen (Grundlage-Dialog)
  TB->>PS: loadXsdFiles()
  PS->>ST: idx / version / docs setzen
  U->>NV: Nachricht wählen
  NV->>ST: root / selItem / open setzen
  U->>ST: Status / Kardinalität / Ausprägung (Detail)
  ST-->>PS: effect → Autosave → ProfileStoreService (PUT /api)
  U->>EX: Excel / Schematron / Beispiel-XML
  EX->>ST: Profil + Baum lesen
  EX-->>U: Datei-Download
```

## Laufzeit-Kontext

```mermaid
graph TB
  subgraph Browser
    APP["Angular-App (SPA)"]
    APP --- LS[("localStorage: CL-Cache")]
  end
  subgraph Server["Backend (Node/Express, same-origin)"]
    API["/api → SQLite"]
    STAT["statische SPA"]
    XP["/xrep-api → XRepository"]
    XJ["/xjustiz-api → xjustiz.de"]
  end
  APP -->|"/api (Profile)"| API
  APP -->|"/xrep-api (Codelisten)"| XP
  APP -->|"/xjustiz-api (Schemata)"| XJ
  XP -->|REST| XREP["XRepository"]
  XJ -->|"Versionsseite + XSD-ZIP"| XJD["xjustiz.de"]
  STAT -.->|liefert| APP
  APP -.->|"Fallback (mit Zustimmung)"| CORS["öffentliche CORS-Weiterleiter"]
```

Im Entwicklungsbetrieb übernimmt statt des Backends der `ng serve`-Dev-Proxy (`proxy.conf.json`) `/api` (→ localhost:3001), `/xrep-api` (→ XRepository) und `/xjustiz-api` (→ xjustiz.de).

Der Dev-Proxy (`proxy.conf.json`) reicht XRepository-Aufrufe im Entwicklungsbetrieb same-origin durch. Für den Produktivbetrieb ist das offen — siehe [Deployment](deployment.md) und [ADR 0004](adr/0004-dev-proxy-xrepository.md).

## Heikelster Teil: SVG-Verbindungslinien

`TreeCanvas` berechnet die Bézier-Linien zwischen Eltern- und Kind-Kästen aus **DOM-Geometrie** (`getBoundingClientRect`). Neuberechnung wird ausgelöst durch einen `effect` (Struktur/Auswahl/Profil/Ansicht), einen `ResizeObserver` (Größe/Umbruch) und `afterNextRender` (Erstauf­bau), jeweils mit `requestAnimationFrame`-Debounce. Das ist der eine bewusst imperative DOM-Zugriff — Begründung in [ADR 0003](adr/0003-svg-verbindungslinien.md).
