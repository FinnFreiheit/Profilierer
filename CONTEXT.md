# CONTEXT.md — Domänenbegriffe des XJustiz Profilierers

Das Glossar der fachlichen Begriffe, mit denen Module benannt und Seams gelegt
werden. Entsteht lazy: aufgenommen wird, was beim Entwerfen einen Namen
gebraucht hat. Architektur-Entscheidungen dazu in `docs/adr/`.

## Kernbegriffe

- **Profilierung** — ein Kommunikationsszenario über einer XJustiz-Nachricht:
  je Element eine Festlegung (Statusstufe mit **Wirkung** `pflicht` /
  `optional` / `ausgeschlossen` / `markierung`), dazu Kardinalitäts-Grenzen,
  freigegebene Codelisten-Werte, Beispielwerte, Verweisziele.
- **Vorgabe** — die **eingefrorene Profilkopie**, gegen die ein gebundener
  Durchlauf läuft (Testnachricht aus einer Profilierung). Schreibgeschützt;
  die Entscheidungsschicht des Durchlaufs liegt darüber.
- **Entscheidungsschicht (Instanz-Modell)** — was der Anwender im Durchlauf
  selbst gesetzt hat: `elemente`- und `auspraegungen`-Maps. Im Werkzeug die
  Signals des Stores, im zustandslosen Abgleich die Maps eines gespeicherten
  Eintrags.
- **Vorkommen / Ausprägung** — benannter Fall eines wiederholbaren Elements
  mit eigenem Pfadraum (`…/beteiligung@a1/…`). Eine **Kopie** trägt ihre
  Herkunft (`vonId`) und erbt die Unter-Profilierung ihrer Quelle.
- **Vorgabe-Sicht** (`core/vorgabe-sicht.ts`) — die eine Lesart der Vorgabe:
  Quellpfad-Auflösung (`vonId`), Vorkommen-Erbe (eintragsweise für Einträge,
  feldweise für die Wirkung), „kein Mischen" der Vorkommenslisten. Zwei
  Adapter teilen sich den Seam: der Signals-Store und der
  Konformitäts-Abgleich.
- **Profilbewusster Abstieg** (`TreeService.walkProfil` / `vorkommenKinder`) —
  die Ersetzungsregel des gerenderten Baums: benannte Vorkommen ersetzen die
  generischen Kinder. Jeder Walker ist Konsument; Rekonziliation
  (Instanz-Import/-Export) ist die Umkehrung, keine Kopie.
- **Pfad-Grammatik** (`core/util/pfad.util.ts`) — die Zeichenregeln der
  Baumpfade: `/`-Segmente, `@`-Vorkommen, `#`-Disambiguierung,
  `~`-Erweiterungen; Vorfahren- und Präfixgrenzen.
- **Konformitäts-Abgleich** — zustandslose Prüfung einer Nachricht gegen die
  Vorgabe (fünf Verstoßarten); „profilkonform" ist eine geprüfte Aussage.
- **Zählkonvention** — wie Vorkommen gezählt werden (ADR 0015): benannte
  zählen, sonst steht der generische Unterbaum für eines, Weggelassenes für
  keines.
