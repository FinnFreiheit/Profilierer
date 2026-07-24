# US-Epic: XJustiz-Nachricht inspizieren

Status: verfeinert (Refinement 26.07.13) · Typ: Epic mit vier schneidbaren Stories

## Ausgangslage

Der ursprüngliche Satz — „Der Anwender soll in der Lage sein, eine XJustiz-Nachricht zu
inspizieren (Übersicht über Inhalt und Struktur, übersichtlich)" — bündelt zwei
gegensätzliche Bedürfnisse an dieselbe Baum-Ansicht:

|                     | **Struktur überblicken**                    | **Inhalt überblicken**                      |
| ------------------- | ------------------------------------------- | ------------------------------------------- |
| Frage des Anwenders | „Wie ist die Nachricht aufgebaut?"          | „Welche Werte stehen konkret drin?"         |
| Braucht             | Hierarchie, Fokus, Zuklappen, Verweislinien | Werte im Baum, „nur Werte", Inhaltssuche    |
| Heute vorhanden     | ja                                          | teils — Inhaltssuche und Auto-Expand fehlen |

Zentrale Randbedingung: Das Werkzeug ist heute primär ein **Profilierer**, kein
**Betrachter**. Eine importierte Instanz landet in derselben Baum-/Detail-Infrastruktur,
die zum Festlegen von Status/Kardinalitäten/Ausprägungen dient. Daraus folgen die
Kernlücken für reines Inspizieren:

- Profilier-Bedienelemente (Ausblenden-✕, Duplizieren-⧉, Status-Strip, editierbare
  Wert-Inputs) sind sichtbar → visuelles Rauschen, Werte versehentlich editierbar.
- Die Suche findet nur **Struktur** (Label/Elementname/Doku), nicht die **Inhalte**
  (importierte Werte wie Aktenzeichen, Beteiligtenname, Code).
- Beim Import wird die komplette Nachricht sofort **voll aufgeklappt** — „Wall of Boxes"
  bei großen Nachrichten; „nur Werte" wirkt nur in bereits offenen Ästen.

## Refinement-Entscheidungen

- **Zielgruppe:** fachlich und technisch gleichrangig — umschaltbar (Fach- ↔ Technikblick),
  nicht fixiert.
- **Read-Only:** eigener, aufgeräumter Betrachtungsmodus ohne Profilier-Bedienelemente,
  Werte gesperrt.
- **Erstansicht:** „nur Werte" standardmäßig aktiv UND belegte Äste automatisch aufgeklappt.
- **Inhaltssuche:** Teil dieses Epics (Suche findet auch belegte Werte).

## Epic

> **Als** Anwender (fachlich _oder_ technisch), der eine konkrete XJustiz-Nachricht
> verstehen will,
> **möchte ich** sie in einer aufgeräumten, nicht-editierbaren Baum-Ansicht öffnen, gezielt
> zwischen Fach- und Technikblick wechseln und sowohl Struktur als auch belegte Werte
> durchsuchen können,
> **damit ich** mir schnell und ohne Gefahr des versehentlichen Änderns einen verlässlichen
> Überblick über Aufbau und Inhalt verschaffe.

Warum als Epic: Read-Only-Modus, Nur-Werte-Auto-Expand, Code-Auflösung,
Persona-Umschaltung und Inhaltssuche sind zusammen zu groß für eine INVEST-taugliche Story
(verletzt „Small"). Daher vier einzeln schneidbare Stories plus ein querliegendes Kriterium.

---

## Story 1 — Read-Only-Betrachtungsmodus

> **Als** Anwender **möchte ich** eine importierte Nachricht in einem gesperrten Modus
> ansehen, **damit** ich nichts versehentlich ändere und nur das Wesentliche sehe.

Akzeptanzkriterien:

- Beim Öffnen einer Testnachricht im Baum ist ein **Betrachtungsmodus** aktiv (Default für
  Instanz-Import).
- Werte-Inputs sind **nicht editierbar** (schreibgeschützt dargestellt, nicht nur
  deaktiviert-grau).
- Profilier-Bedienelemente sind ausgeblendet: Ausblenden-✕, Duplizieren-⧉, „Ausprägung
  hinzufügen", Status-Strip-Bearbeitung.
- Ein sichtbarer Umschalter „Betrachten ↔ Bearbeiten" wechselt in den vollen
  Profilierer-Modus (gleiche Nachricht, kein Neuladen).
- Struktur-Interaktionen bleiben: Auf-/Zuklappen, Auswählen, Fokus-Modus, Breadcrumbs,
  Detailpanel (read-only).

## Story 2 — Übersichtliche Erstansicht großer Nachrichten

> **Als** Anwender **möchte ich** beim Öffnen sofort nur den belegten Inhalt sehen,
> **damit** mich große Nachrichten nicht mit leeren Ästen erschlagen.

Akzeptanzkriterien:

- Beim Öffnen ist **„nur Werte" standardmäßig aktiv** UND die belegten Äste sind
  **automatisch aufgeklappt** (heute wirkt der Filter nur in bereits offenen Ästen — wird
  behoben).
- Genau ein Klick wechselt zur vollständigen Struktur („alles zeigen") und zurück.
- Leere/wertlose Zweige sind ausgeblendet, aber die **Vorfahren belegter Knoten bleiben**
  sichtbar (Pfad-Kontext erhalten).
- Akzeptierte Einschränkung: progressives Aufdecken nach Tiefe ist bewusst außen vor
  (Kandidat für spätere Story).

## Story 3 — Inhaltssuche mit Highlight

> **Als** Anwender **möchte ich** nach konkreten Werten (Aktenzeichen, Beteiligtenname,
> Code) suchen, **damit** ich eine Stelle in einer großen Nachricht ohne manuelles
> Durchklicken finde.

Akzeptanzkriterien:

- Die Suche indexiert zusätzlich zu Label/Elementname/Doku auch die **importierten Werte**
  (`beispiel`).
- Treffer im Wert sind im Ergebnis als solche erkennbar (Kontext: welcher Knoten, welcher
  Wert).
- Sprung zum Treffer klappt den Pfad auf und hebt den Knoten hervor (bestehendes
  `scrollTarget`-Flash).
- Nicht-funktional: Suchindex wird memoisiert statt bei jedem Tastendruck neu über bis zu
  ~8000 Knoten aufgebaut.

## Story 4 — Codes zu Klartext auflösen (Codelisten-Werte anzeigen)

> **Als** Anwender **möchte ich** hinter einem belegten Code sofort den dahinterliegenden
> Klartext-Wert sehen, **damit** ich die Nachricht verstehe, ohne Codes manuell im
> XRepository nachzuschlagen.

Hintergrund: Belegte Code-Felder (Typname `Code.*`) zeigen im Betrachtungsmodus heute nur
den rohen Code (`beispiel`). Die Bedeutung (z. B. `12` → „Amtsgericht") ist für viele Codes
nicht selbsterklärend. Für zahlreiche Codelisten sind die Werte extern im XRepository
gepflegt (Code-Typ 3) und im Schema gar nicht enthalten — sie müssen erst geladen werden.

Akzeptanzkriterien:

- Ein belegter Code wird nicht nur roh, sondern **aufgelöst** dargestellt: `{code} — {label}`
  (Klartext-Bezeichnung aus der zugehörigen Codeliste).
- Die Auflösung wirkt an **beiden Anzeigeorten**: im Baum-Blatt (Wertespalte, auch in
  „nur Werte") und im Detailpanel (Beispielwert-Zeile).
- Die dafür nötigen Codelisten werden beim Import **automatisch** geladen — vorzugsweise
  gebündelt über „genutzte aktuelle Codelisten" des Standards, statt pro Liste einen
  manuellen Klick zu erfordern.
- Bereits geladene Codelisten werden **gecacht** (localStorage), sodass wiederholtes
  Inspizieren dieselbe Nachricht nicht erneut herunterlädt.
- Lässt sich ein Code **nicht auflösen** (Liste offline/nicht verfügbar, Wert nicht in der
  Liste), wird der rohe Code mit dezentem Hinweis gezeigt — kein Fehler, kein blockiertes
  Betrachten.
- Nicht-funktional: Das Laden läuft asynchron mit Ladeindikator; die Baum-Ansicht ist sofort
  benutzbar und ergänzt die Labels, sobald die Listen da sind. CORS-/Proxy-Weg wie bisher
  (Dev-Proxy `xrep-api`, öffentliche Weiterleiter nur nach Zustimmung).

Akzeptierte Einschränkung: Versions-/Gültigkeitsauflösung eines Codes zu einem konkreten
Nachrichten-Stichtag ist außen vor — es wird die aktuell geladene Codelisten-Version
gemappt.

## Querliegend — Persona-Umschaltung

Der bestehende **„Technik"-Schalter** (Elementname + Typ ein/aus) erfüllt „beide
gleichrangig". Kriterium fürs Epic: Fach- (Klartext) und Technikblick sind jederzeit
umschaltbar, der gewählte Zustand bleibt beim Navigieren erhalten.

## Bewusst außerhalb dieses Epics

- Roh-XML-Viewer mit Pretty-Print/Syntax-Highlighting (eigene kleine US).
- Layout-Performance bei sehr großen Nachrichten (`getBoundingClientRect`-Kosten,
  Canvas-Breite) — technische Story, kein Nutzer-Feature.
- Verweislinien-Clutter bei aktivem `showRefs` (eigenes Thema).

## Offene Punkte

1. **Einstieg:** Sichtbarer Einstieg von der Dashboard-/Testdaten-Kachel („Nachricht
   ansehen") oder implizit beim `openInTree`?
2. **Detailpanel im Read-Only:** Codelisten-Werte werden aufgelöst angezeigt (Story 4);
   offen bleibt, ob Verweisziele weiterhin anklickbar zum Navigieren sind (nur nicht
   editierbar).
3. **Code-Auflösung — Ladezeitpunkt:** alle genutzten Codelisten gebündelt beim Import
   vorab laden (schneller sichtbar, mehr Netz/Startlast) oder pro sichtbarem Code lazy
   nachladen?
4. **Werte-Highlight im Baum:** Suchtreffer nur anspringen oder dauerhaft im Baum markieren
   (Filter „nur Treffer")?

## Betroffene Bausteine (Orientierung, kein Auftrag)

- Baum: `src/app/features/tree/tree-canvas.ts`, `tree-node.ts`, `tree-node.html`
- Detail: `src/app/features/detail/detail-panel.ts`, `detail-panel.html`
- Codelisten/Code-Auflösung: `src/app/core/services/codelist.service.ts`
  (`loadFromXRepository` = alle genutzten Codelisten / `fetchSingleCodelist`),
  `src/app/core/services/value.service.ts`
  (`clWerte`, neuer `labelFor`), `src/app/models/codelist.model.ts`
- Suche: `src/app/features/search/search.ts`, `src/app/core/services/search.service.ts`
- Import: `src/app/core/services/instance-import.service.ts` (Voll-Expansion via `opened`)
- Zustand/Filter: `src/app/core/services/state.service.ts` (`onlyValues`, `focusMode`,
  `showTech`, `open`)
- Navigation: `src/app/core/services/nav.service.ts` (`jumpTo`, expand/collapse)
- Testdaten-Einstieg: `src/app/features/testdaten/testdaten.ts` (`openInTree`, `openView`)
