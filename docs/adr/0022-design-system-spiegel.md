# ADR 0022: Design-System als generierter Spiegel des Codes

- Status: Angenommen
- Datum: 26.09.05

## Kontext

Das Design des Werkzeugs soll in **Claude Design** bearbeitet werden — in einem Design-System-Projekt, das die Bausteine der App als Karten zeigt. Der erste Anlauf lief über einen freien Canvas (`design/profil-uebersicht-v4.dc.html`): ein Redesign der Profil-Übersicht, das ohne Token-Vokabular entstand und entsprechend aussieht — 15 Schriftgrößen, 9 Eckenradien, sechs neue Neutralstufen, keine CSS-Variable, obwohl `src/styles.scss` ein vollständiges Token-Set trägt.

Randbedingungen:

- Der eingebaute `/design-sync` von Claude Code konvertiert **React**-Design-Systeme (Storybook oder bare package). Für die Angular-App ist er unbrauchbar. Bleibt das darunterliegende `DesignSync`-Tool: es lädt beliebige Preview-HTML-Dateien hoch; die Design-System-Pane indiziert sie über `<!-- @dsCard group="…" -->` in der ersten Zeile.
- Der Sync läuft **Code → Claude Design** (Upload aus einem lokalen Verzeichnis). Einen automatischen Rückweg gibt es nicht; eine geänderte Karte lässt sich lesen (`get_file`) und mit dem lokalen Stand vergleichen.
- Alles Styling der App ist **global** in `src/styles.scss` (keine komponenteneigenen Styles, keine `url()`, Systemschriften). Das kompilierte CSS ist damit vollständig und ohne Nebenabhängigkeiten portabel.

Die naheliegende Alternative — die 43 Komponenten der App **von Hand** als Karten in Claude Design nachzubauen, dort umzugestalten und anschließend in die App zu übertragen — erzeugt drei Wahrheiten (App, Karten, Entwurf) und am ersten Tag nur eine Kopie dessen, was ersetzt werden soll.

## Entscheidung

**Das Design-System ist ein generierter Spiegel der App, keine zweite Quelle.**

- **Quelle** ist die Ansicht `?ansicht=styleguide` (`src/app/features/styleguide/`): jeder wiederkehrende Baustein als `<section data-ds-card>` mit Beispieldaten, gerendert mit dem echten Stylesheet — ausschließlich Klassen, die es in der App gibt. Vierzehn Karten in drei Gruppen (Grundlagen: Farben, Typografie, Radien, Abstände — die Stufen aus `design.md` · Bausteine: Buttons, Eingaben, Pills, Chips, Menü, Leerer Zustand, Baum-Tags · Übersicht: Kachel, Filterspalte, Werkzeugzeile). Kein Reiter in der Oberfläche; die Ansicht ist ein Entwicklerwerkzeug.
- **Export** durch `scripts/design-system-bundle.mjs` (`npm run design:bundle`): Puppeteer öffnet den Styleguide (Build-Ausgabe oder Dev-Server), schreibt jede Karte als eigenständige HTML-Datei mit `@dsCard`-Marker nach `design-system/<gruppe>/<karte>.html`, dazu `_shared/styles.css` (das kompilierte Stylesheet) und `_karten.json` (Kartenliste für die Rückfallebene `register_assets`). Das Verzeichnis ist versioniert und wird **nicht von Hand gepflegt** — wie `public/schemas/index.json`.
- **Sync** per `DesignSync`-Tool in ein Projekt vom Typ Design-System (`finalize_plan` → `write_files` mit `localDir = design-system/`).
- **Rückweg** über Diff: eine in Claude Design geänderte Karte wird gelesen, gegen die lokale Datei verglichen, und die Änderung wandert nach `styles.scss` — Token zuerst, dann Klasse. Danach Bundle neu, Sync. Die App bleibt die einzige Wahrheit über ihr Aussehen.
- **Keine Token-Änderung mit der Einführung.** Der Spiegel zeigt den Ist-Stand; das Redesign findet danach statt, mit dem Token-Vokabular vor Augen.

Verworfen: **Karten von Hand in Claude Design anlegen** (drei Wahrheiten, s. o.). Verworfen: **Kachel und Reiterblock zuerst in eigene Komponenten extrahieren** — wäre ein Refactor am Bestand, den der Spiegel nicht braucht; als Folgeaufgabe denkbar, weil `.dashCard` in drei und `.viewToggle` in fünf Templates kopiert ist. Verworfen: **nur den Canvas weiterbenutzen** — er hat das Problem erzeugt, das der Spiegel löst.

## Konsequenzen

- Positiv: eine Quelle; Karten veralten nicht, weil sie aus dem Code entstehen; die Token-Karte macht das Vokabular sichtbar, das im Canvas fehlte; die Styleguide-Ansicht dient zugleich der Sichtprüfung von Token-Änderungen in der App.
- Negativ: die Karten tragen **Beispiel-Markup** im Template, nicht die echten Komponenten — es kann von den Feature-Templates abweichen, wenn dort Markup umgebaut wird. Der Spec sichert nur Anzahl und Metadaten der Karten, nicht die Deckung mit den Templates.
- Offen: ob ein Canvas-Projekt die Karten eines Design-System-Projekts direkt konsumieren kann, ist nicht belegt; der Nutzen des Spiegels hängt nicht daran.
- Folgeaufgaben: Bildschirme (Kopfleiste, Baum, Detailbereich) als zweite Kartenrunde; Toast (Id-Kollision mit der globalen Instanz) und Baum-Kasten fehlen bewusst.
- Nachtrag 26.09.05 — **v4 umgesetzt:** Die Profil-Übersicht folgt jetzt dem Canvas-Entwurf (Filterspalte mit Achsen und Zählern, Werkzeugzeile mit Suche/Gliederung/Ansicht, Kacheln oder Liste, aktive Eingrenzungen als Chips). Die Neutralstufen wurden **global** umgestellt (`--bg` #f4f5f8, Rahmen #e4e6eb, Sekundärtext #545e70, neue Tokens `--flaeche-hell`, `--trenner`), Radien und Schatten sind Tokens (`--rund-*`, `--schatten-*`) auf einer Skala 3/4/8/10/12/999. `design.md` beschreibt diesen Stand; Testdaten und Projekte tragen die neuen Tokens, aber noch den älteren Kopf.
