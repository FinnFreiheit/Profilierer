# ADR 0001: Migration von Single-File-HTML zu Angular 20

- Status: Angenommen
- Datum: 26.07.10

## Kontext

Das Tool war eine einzelne HTML-Datei (`Profilierer.html`, ~2500 Zeilen Vanilla JS) mit globalem Zustand `S` und imperativen Render-Funktionen (`renderAll`/`renderBox`/`renderDetail`/`redrawLines`). Vorteil: Weitergabe per Doppelklick, kein Build. Nachteil: mit wachsendem Funktionsumfang (Baum, Detail, Codelisten, Diff, Exporte) schwer wartbar, keine Modulgrenzen, keine Tests, kein Typsystem.

## Entscheidung

Überführung in ein **idiomatisches Angular-20-Projekt** (standalone Components, Signals, OnPush, TypeScript strict). Die Doppelklick-Weitergabe wird bewusst aufgegeben zugunsten `ng serve`/`ng build`. Die alte Datei bleibt als Referenz unter `legacy/Profilierer.html`; Code-Kommentare verweisen auf ihre Zeilen (Provenienz).

## Konsequenzen

- **Positiv:** Klare Schichten (Models/Core/Features), Typsicherheit, Unit-Tests, wiederverwendbare Services, reaktives Rendering ohne manuelle `renderAll`-Aufrufe.
- **Negativ:** Build-Tooling und `node_modules` nötig; kein reines Öffnen per Doppelklick mehr; Node-Version-Anforderung (siehe [ADR 0005](0005-node24-headless-tests.md)).
- **Folge:** Weitere Grundsatzentscheidungen (Store, SVG-Linien, Proxy) in den folgenden ADRs.
