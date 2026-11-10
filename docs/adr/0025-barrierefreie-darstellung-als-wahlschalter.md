# ADR 0025: Barrierefreie Darstellung als Wahlschalter

- Status: Angenommen
- Datum: 26.11.10

## Kontext

Die Oberfläche ist für dichte Facharbeit gestaltet: leise Rahmen, ein oranger Fokusring, kleine Bedienelemente. Gemessen an WCAG 2.1 AA reicht das an mehreren Stellen nicht — der Fokusring hat auf Weiß einen Kontrast von 2,0:1, Rahmen von Eingabefeldern 1,3:1, der schwächste Grauton 3,1:1, das Warn-Paar 4,1:1. Dazu waren 16 Bedienelemente nur mit der Maus erreichbar und 13 Feldbeschriftungen ohne Bezug zum Feld (Lint-Altlast aus [ADR 0011](0011-lint-format-ci.md)).

Die gewohnte Darstellung soll dabei nicht angetastet werden: Wer sie nicht braucht, soll von der barrierefreien Fassung nichts sehen.

## Entscheidung

**Zwei Schichten, getrennt nach „sichtbar" und „unsichtbar".**

1. **Sichtbares ist ein Wahlschalter.** `BarrierefreiService` hält den Zustand (`UiSettingsService`, `localStorage`, Vorgabe aus) und setzt die Klasse `barrierefrei` am `<html>`-Element. Der Schalter (`app-barrierefrei-schalter`, `role="switch"`) steht in jeder Kopfzeile neben Beta- und Rollen-Badge. Alle Regeln der Darstellung stehen in einem Abschnitt am Ende von `styles.scss` unter `html.barrierefrei`:
   - **Kontrast über die Tokens:** `--muted`, `--muted-schwach`, `--border`, `--border-stark`, `--signal` und die Textfarben der fachlichen Signalpaare werden überschrieben — Text mindestens 4,5:1 (Signalpaare 7:1), Rahmen von Bedienelementen mindestens 3:1. Weil die Oberfläche fast durchgehend über Tokens gefärbt ist, genügt das; zwei fest verdrahtete Farben (`.codeval`, `.clRow code`) sind einzeln nachgezogen.
   - **Fokus:** ein 3 px starker Rahmen in Preußischblau mit Abstand statt des Orange.
   - **Verweise unterstrichen**, **Klickflächen mindestens 24 px** (WCAG 2.2, 2.5.8), **keine Übergänge und Animationen**; Sprünge per Skript fragen `BarrierefreiService.scrollVerhalten()`.
   - **Sprungmarke** „Zum Inhalt springen" als erstes Element der Seite.
2. **Unsichtbares gilt immer.** Tastaturbedienung und Beschriftungen ändern die Darstellung nicht und hängen deshalb nicht am Schalter: Krümel, Listenzeilen der Dialoge, Einträge des Nachrichtenwählers und die Anlege-Kästen im Baum sind per Tab erreichbar und lösen mit Enter aus; Menüs und Nachrichtenwähler schließen mit Escape; Feldbeschriftungen sind mit ihrem Feld verbunden.

**Keine eigene Vergrößerung.** Schrift und Abstände sind in Pixeln gesetzt; ein CSS-`zoom` am Dokument wurde erprobt und verworfen, weil der `TreeCanvas` die Verbindungslinien aus DOM-Messungen rechnet und sie unter `zoom` neben den Kästen liegen. Vergrößert wird mit dem Zoom des Browsers, der die Linien nicht stört.

## Konsequenzen

- Ausgeschaltet ist die Darstellung unverändert; die einzige sichtbare Neuerung ist der Schalter selbst.
- Die Lint-Altlast sinkt von 45 auf 4 Warnungen. Die verbleibenden vier betreffen den Baumkasten und seine Kennzeichen: Der Baum wird über die Tastatur des Editors bedient (Pfeile, Shift+Pfeil, [ADR 0023](0023-ein-bearbeiten-modus-mit-fuehrung.md)), nicht über Tab — hunderte Tab-Stopps wären ein Rückschritt.
- Neue Farben gehören als Token in `:root` und, wenn sie Text oder Rahmen tragen, mit einem kontraststarken Wert in `html.barrierefrei`.
- **Nicht belegt:** Eine Prüfung mit Screenreader und eine vollständige Prüfung nach BITV 2.0 stehen aus. Offen sind insbesondere die Baumansicht als `role="tree"`, Farbe als alleiniger Bedeutungsträger (Statusstreifen, Diff-Farben, frei wählbare Statusfarben der Profilierung) und der Fokus beim Öffnen und Schließen von Menüs.
