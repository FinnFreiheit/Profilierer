# US-Story: Profilierung geführt erstellen

Status: verfeinert (Refinement 26.07.14) · Typ: Story mit Vollständigkeits-Anspruch · Oberthema: Erstellung einer Profilierung

## Ausgangslage

Das Werkzeug ist im Kern ein **Profilierer**: Für ein Kommunikationsszenario wird
der XJustiz-Standard eingegrenzt — je Element eine Disposition, dazu bei Bedarf
Kardinalitäten, Codelisten-Werte, Ausprägungen, Anmerkungen. Heute geschieht das
**frei explorativ**: Der Anwender klickt Kästen im Baum an und entscheidet punktuell.

Daraus folgen die Lücken für ein *vollständiges, verlässliches* Profilieren:

| | **Heute (frei)** | **Gewünscht (geführt)** |
|---|---|---|
| Vorgehen | Kästen frei anklicken, Reihenfolge beliebig | Schritt für Schritt durch das Schema geführt |
| Vollständigkeit | offen — man sieht nicht, was noch unentschieden ist | Ziel: **zu jedem Knoten/Blatt eine Aussage** |
| Auswahlen (`choice`) | jeder Zweig einzeln, Widersprüche möglich | Alternativen-Satz bewusst einschränken |
| Wiederkehrende Bedingungen | jede Anmerkung neu tippen | einmal getippte **Freitexte wiederverwendbar** |

Wesentlich: Die **Standard-Statusstufen eines neuen Profils tragen bereits die
Ziel-Semantik** (`profile-defaults.ts`): `zwingend` → Wirkung `pflicht`,
`anzugeben, wenn vorhanden` → `optional`, `nicht verwendet` → `ausgeschlossen`
(dazu `zu klären` → `markierung`). Der geführte Modus ist daher **keine neue
Datenwelt**, sondern eine Führungs- und Prüf-Schicht über dem bestehenden Modell.

Bereits vorhanden und wiederverwendbar:

- **Schema-/Versionsauswahl:** hinterlegte Versionen (3.6.2, 4.0.0) und
  Nachrichtenauswahl (`BundledSchemaService`, Message-Picker).
- **Disposition + Anmerkung je Element:** `ElementProfile.status` (Wirkung) und
  `.anmerkung` (Freitext); Bedienung im Detailpanel (Status-Strip, `setStatus`).
- **Pflicht-Vorbelegung:** unbedingte Pflichtelemente automatisch als „zwingend"
  (`NavService.prefillMandatoryStatus`, `TreeService.collectMandatoryPaths`).
- **Ausschluss-Kaskade (Datenebene):** `StateService.inheritedExcluded`
  (berechnet, nicht destruktiv) — als *Navigations*-Kaskade zu nutzen.
- **Ausprägungen:** `addAusp`, `duplicateElement`, eigener Pfad-Raum `path@auspId/…`.

## Refinement-Entscheidungen

**Modell & Vokabular**

- **Schicht statt Parallelmodell:** Der geführte Durchlauf steuert dieselben
  `ElementProfile`-Daten; er navigiert, fragt je Knoten ab und trackt
  Vollständigkeit. Freies Klicken bleibt möglich.
- **Feste drei Dispositionen** je Knoten/Blatt: **zwingend** (`pflicht`),
  **anzugeben wenn vorhanden** (`optional`), **nicht verwendet** (`ausgeschlossen`).
  In *jedem* Fall trägt eine dieser drei die maschinelle Aussage.
- **Freitext verfeinert, ersetzt nie:** Zusätzlich zur Disposition kann eine freie
  Festlegung/Bedingung erfasst werden (`anmerkung`). Kein vierter, eigenständiger
  Entscheidungstyp.

**Struktur**

- **Pflicht auto-vorbelegt:** Unbedingte Pflichtelemente (`min≥1`) werden als
  „zwingend" vorbelegt (sichtbar, überschreibbar) — bei `min≥1` die einzig gültige
  Antwort.
- **Auswahlen (`choice`):** Der Nutzer entscheidet, **welche Alternativen im
  Szenario zulässig bleiben** (alle behalten oder einzelne ausschließen). Jede
  verbleibende Alternative wird **voll weiter profiliert** — eine `choice` wird
  nicht auf einen Zweig kollabiert.
- **Ausprägungen sind Teil des Durchlaufs:** Standard ist ein generischer Durchlauf
  des wiederholbaren Elements; **zusätzlich angelegte Ausprägungen** (z. B. mehrere
  Beteiligte) werden **je komplett profiliert** und zählen zur Vollständigkeit.
- **Abschneiden:** „nicht verwendet" beendet die Betrachtung des **gesamten
  Teilbaums**; er wird nicht mehr abgefragt und nicht gezählt. Rücknahme ist
  **nicht-destruktiv** (zuvor getroffene Unter-Entscheidungen bleiben erhalten).

**Erfassung, Freitext, Ablauf**

- **Erfassungstiefe:** Der Durchlauf erfasst **nur Disposition + Freitext**.
  Wert-Einschränkungen (Codelisten-Werte, Beispielwert, Kardinalität) bleiben
  optionale Verfeinerung im Detailpanel und zählen **nicht** zur Vollständigkeit.
- **Freitext-Gedächtnis:** Wiederverwendbare Freitexte werden **abgeleitet** aus den
  bereits im Profil verwendeten Notizen (dedupliziert); Scope **pro Profilierung**.
- **Vollständigkeit:** **weiche Führung + Warnung** beim Export/Abschluss, keine
  Blockade (Teilprofile und Zwischenexporte bleiben möglich).
- **Navigation:** **geführte Spur** (nächster offener Knoten, Tiefensuche,
  Vor/Zurück) **plus freies Anspringen** beliebiger Knoten.
- **Einstieg:** geführter Modus als **Umschalter** über jeder Profilierung; bei
  neuer Profilierung **standardmäßig an**, bestehende jederzeit geführt fortsetzbar
  (Fortschritt aus gespeicherten Entscheidungen).
- **Fortschritt „X von Y":** zählt **nur echte Nutzer-Entscheidungen** (optionale
  Elemente, Auswahlen, Ausprägungen); auto-vorbelegte Pflicht ist per Definition
  erledigt.
- **Export:** Der Freitext einer Festlegung erscheint im **Schematron-Export als
  Kommentar** zur jeweiligen Regel (dokumentiert die Bedingung, ohne sie maschinell
  zu erzwingen).

**Rahmen (angenommen, nicht strittig)**

- Einstieg über die **vorhandenen Versionen** (hinterlegte 3.6.2/4.0.0 sowie
  Fremd-Upload wie heute) und den bestehenden Nachrichten-Picker.
- Die Führungs-Bedienelemente **erweitern das Detailpanel** (Status-Strip +
  Anmerkung), statt einen separaten Wizard zu bauen.
- **Rekursive** Strukturen werden einmal entschieden, ohne unendlichen Abstieg; der
  Nachrichten-**Wurzelknoten** ist implizit (Start bei den Kindern); reine
  **`sequence`-Gruppen** sind transparent (nur absteigen).
- Die frei **konfigurierbaren Statusstufen** (inkl. „zu klären") bleiben im **freien
  Modus** erhalten; im geführten Modus ist „noch nicht entschieden" schlicht die
  Abwesenheit einer Disposition.

## Story

> **Als** Anwender, der für ein bestimmtes Kommunikationsszenario eine Profilierung
> erstellt,
> **möchte ich** eine Nachricht aus den vorhandenen Schemata wählen und dann Knoten
> für Knoten durch das Schema geführt werden — je Knoten mit den festen
> Dispositionen *zwingend*, *anzugeben wenn vorhanden* oder *nicht verwendet* und
> einem optionalen, wiederverwendbaren Freitext —, wobei erzwungene Pflicht
> automatisch gesetzt ist, „nicht verwendet" den Teilbaum abschneidet, Auswahlen und
> Ausprägungen bewusst modelliert und die noch offenen Entscheidungen sichtbar
> geführt werden,
> **damit ich** sicher bin, dass zu **jedem** Element eine bewusste Festlegung
> getroffen wurde, ohne etwas zu übersehen und ohne wiederkehrende Bedingungen
> mehrfach zu formulieren.

## Akzeptanzkriterien

### A. Einstieg und Modus

- Der Anwender wählt eine **Version** und daraus **jede** verfügbare Nachricht als
  Grundlage der Profilierung.
- Bei einer **neuen** Profilierung ist der geführte Modus **standardmäßig aktiv**;
  bei einer **bestehenden** lässt er sich einschalten, wobei Fortschritt und „nächster
  offener Knoten" aus den gespeicherten Entscheidungen berechnet werden.
- Der geführte Modus ist ein **Umschalter** über derselben Datenbasis; freies
  Anklicken/Bearbeiten bleibt möglich.

### B. Entscheidung je Knoten/Blatt

- Für den aktuellen Knoten stehen genau die drei Dispositionen zur Wahl: **zwingend**,
  **anzugeben wenn vorhanden**, **nicht verwendet** (gebunden an die Wirkung
  `pflicht`/`optional`/`ausgeschlossen`).
- Zusätzlich kann eine **Freitext-Festlegung** erfasst werden, die die Disposition
  *verfeinert* (z. B. „anzugeben wenn vorhanden — nur bei Auslandsbezug").
- Die Entscheidung wird sofort persistiert (Autosave) und ist im Baum/Detailpanel
  sichtbar; sie ist jederzeit **änderbar**.

### C. Pflicht-Vorbelegung

- Unbedingte Pflichtelemente (`min≥1` auf dem Pflicht-Rückgrat) sind mit „zwingend"
  **vorbelegt**, sichtbar und überschreibbar.
- Vorbelegte Knoten gelten als entschieden und **zählen nicht** in die „offen"-Zahl.

### D. Auswahlen (`choice` / `auswahl_*`)

- An einer Auswahl kann der Nutzer den **Satz zulässiger Alternativen einschränken**
  (alle behalten oder einzelne Zweige auf „nicht verwendet" setzen + abschneiden).
- **Jede zulässig bleibende Alternative** wird anschließend **vollständig profiliert**
  (abgestiegen und entschieden).
- Widersprüchliche Belegungen exklusiver Zweige sind durch die Auswahl-Führung
  ausgeschlossen.

### E. Ausprägungen wiederholbarer Elemente

- Ein wiederholbares Element wird zunächst in der Disposition entschieden; **Standard
  ist ein generischer Durchlauf** des Teilbaums.
- Der Nutzer kann **zusätzliche Ausprägungen** anlegen (z. B. „Kläger",
  „Beklagter"); **jede angelegte Ausprägung** wird über ihren Teilbaum **vollständig
  profiliert** und **erhöht die Vollständigkeits-Zahl**.

### F. Abschneiden und Kaskade

- „nicht verwendet" auf einem Knoten **überspringt seinen kompletten Teilbaum** — die
  Kinder werden nicht mehr abgefragt und zählen nicht gegen die Vollständigkeit.
- Übersprungene Kinder sind als „entfällt — übergeordnet ausgeschlossen" erkennbar.
- Wird „nicht verwendet" **zurückgenommen**, erscheinen etwaige zuvor getroffene
  Unter-Entscheidungen **unverändert** wieder (nicht-destruktiv).

### G. Freitext merken und wiederverwenden

- Jeder eingegebene Freitext steht bei **späteren** Knoten derselben Profilierung als
  **Vorschlag zur Auswahl** (abgeleitet aus den bereits verwendeten Notizen).
- Ein übernommener Vorschlag wird ins aktuelle Element kopiert und bleibt dort
  editierbar.

### H. Navigation und Fortschritt

- Der Durchlauf schlägt den **nächsten noch offenen** Knoten in Dokumentreihenfolge
  vor (Vor/Zurück); der Nutzer kann jederzeit einen **beliebigen Knoten anspringen**.
- Ein **Fortschritt „X von Y"** ist jederzeit sichtbar; er zählt **nur echte
  Nutzer-Entscheidungen** (auto-vorbelegte Pflicht ausgenommen).
- Der aktuelle Knoten ist hervorgehoben; der Pfad-Kontext (Vorfahren) bleibt sichtbar
  (bestehender Fokus-/Scroll-Mechanismus).

### I. Vollständigkeit und Abschluss

- Die Profilierung gilt als **vollständig**, wenn zu jedem nicht abgeschnittenen,
  entscheidungsbedürftigen Knoten/Blatt eine Disposition vorliegt.
- Unvollständigkeit wird **nicht blockiert**, aber beim Export/Abschluss mit einer
  **Warnung** (Anzahl offener Punkte) und Sprung zum nächsten offenen Knoten geführt.

### J. Export

- Der **Freitext** einer Festlegung erscheint im **Schematron-Export als Kommentar**
  zur zugehörigen Regel — er dokumentiert die fachliche Bedingung, ohne eine
  maschinell nicht prüfbare Regel vorzutäuschen.

## Bewusst außerhalb dieser Story

- **Wert-Einschränkungen** (Codelisten-Auswahl, Beispielwert, Kardinalität) als Teil
  der geführten Vollständigkeit — bleiben optionale Verfeinerung im Detailpanel
  (zweiter Durchgang).
- **Hartes Vollständigkeits-Gate** (100 % erzwungen).
- **Kuratierte Freitext-Bibliothek** (Vorrat/Umbenennen/Löschen unabhängig von der
  Nutzung) — hier bewusst abgeleitet statt eigenständig gepflegt.
- Export der fertigen Profilierung (Excel/Beispiel-XML) darüber hinaus — bereits
  vorhanden.

## Offene Punkte (nicht blockierend)

1. **Darstellung der Mehrfachauswahl** bei einer `choice` (z. B. Häkchen je Zweig
   „zulässig/ausgeschlossen") — konkrete Bedienform noch zu skizzieren.
2. **Expliziter „parken"-Zustand?** Heute = „noch nicht entschieden" ist die
   Abwesenheit einer Disposition; offen, ob ein sichtbarer „später entscheiden"-Marker
   (analog „zu klären") im geführten Modus zusätzlich hilft.

## Betroffene Bausteine (Orientierung, kein Auftrag)

- Einstieg/Schema: `src/app/features/message-picker/`,
  `src/app/core/services/bundled-schema.service.ts`
- Führung/Navigation: `src/app/core/services/nav.service.ts` (`loadMessage`,
  `prefillMandatoryStatus`, `jumpTo`, Next-/Reihenfolge-Logik),
  `src/app/core/services/tree.service.ts` (`collectMandatoryPaths`, `isRepeatable`,
  `ctxNode`, synthetische `choice`/`sequence`), `src/app/features/tree/`
- Disposition/Status: `src/app/models/profile.model.ts` (`Status`, `Wirkung`,
  `ElementProfile`), `src/app/core/profile-defaults.ts` (drei Default-Stufen),
  `src/app/core/services/state.service.ts` (`setElementProfile`, `prefillStatus`,
  `wirkungOf`, `inheritedExcluded`, `auspsOf`/`addAusp`/`duplicateElement`,
  `fortschritt`)
- Entscheidungs-/Führungs-UI: `src/app/features/detail/detail-panel.ts` (Status-Strip,
  `setStatus`, `anmerkung`), Erweiterung um Fortschritt, „nächster offener",
  Auswahl-/Ausprägungs-Schritt und Freitext-Vorschläge
- Freitext-Gedächtnis: abgeleitet aus `elemente[*].anmerkung` (kein neues Feld)
- Export: `src/app/core/services/export.service.ts` (`exportSchematron` — Freitext als
  Kommentar zur Regel)
- Persistenz: `src/app/core/services/persistence.service.ts`,
  `profile-store.service.ts` (Autosave/Speichern der Profilierung)
