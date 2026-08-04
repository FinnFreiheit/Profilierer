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
- **Speicher-Urteil** (`core/util/speicher-urteil.ts`) — Entwurfs-Kennzeichen
  und vorrangige Meldung aus den Befunden eines Speicherwegs (Verstöße vor
  Schemafehlern); die Wege erheben, das Urteil fällt einmal.
- **Zählkonvention** — wie Vorkommen gezählt werden (ADR 0015): benannte
  zählen, sonst steht der generische Unterbaum für eines, Weggelassenes für
  keines.
- **Datentyp-Katalog** (`core/util/datentyp.util.ts`) — die wählbaren Typen
  einer Schema-Erweiterung, aus dem geladenen Schema-Index abgeleitet
  (Basistypen kuratiert, DIN 91379, fachliche `Type.*` je Fachmodul,
  Codelisten `Code.*`). Gespeichert wird der nackte Lokalname plus die
  **Herkunft** (`xs` / `schema` / `frei`); Altbestand ohne Herkunft wird
  aufgelöst statt migriert. Ein Seam, zwei Konsumenten: Anlege-Dialog und
  Detailpanel teilen sich den `DatentypPicker`.
- **Lebende Referenz** — ein aus dem Schema gewählter Datentyp einer
  Schema-Erweiterung steht im Profil nur als Name; seine Unterelemente entstehen
  bei jedem Rendern aus dem aktiven Schema (`TreeService.kinder`/`expandNode`),
  samt Doku, Kardinalität, Codelisten-Bindung und Rekursionsschutz. Keine Kopie
  der Typstruktur ins Profil (ADR 0017). Gegenprobe für den Defektfall:
  `TreeService.erwTypFehlt` — der Typ, den das aktive Schema nicht kennt.
