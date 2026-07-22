# Glossar (ERV / XJustiz)

Begriffe rund um die App und den XJustiz-Standard, jeweils mit Bezug zur App. Zwei Teile: zuerst die **Baum- und Darstellungsbegriffe** (wie die App eine Nachricht abbildet und benennt), danach die **ERV-/XJustiz-Fachbegriffe** (alphabetisch).

## Baum- und Darstellungsbegriffe (App)

Diese Begriffe beschreiben die Struktur (Datenmodell) und die Darstellung des Baums — verbindlich, um Missverständnisse zu vermeiden. Siehe [Architektur](architecture.md), [Datenmodell](data-model.md) und das Modell `TreeNode` (`src/app/models/node.model.ts`).

- **Element-Baum (Baum)** — Die aus dem XSD aufgelöste Baumstruktur einer Nachricht: alle Elemente mit ihren Über-/Unterordnungen. Wird bei Bedarf aufgebaut (`TreeService`).
- **Kaskade (Kasten-Kaskade)** — Die Darstellungsform des Baums von links nach rechts; jeder aufgeklappte Schritt bleibt als Spalte sichtbar. Jeder Knoten erscheint dabei als **Kasten** (Box).
- **Knoten** — Ein einzelner Punkt im Baum (`TreeNode`), in der Darstellung ein **Kasten**. Trägt Name, Typ, Kardinalität, Kinder und Profil-Angaben. „Knoten" und „Kasten" meinen dasselbe — Ersteres im Datenmodell, Letzteres in der Darstellung.
- **Element** — Ein im XSD deklariertes XJustiz-Element (z. B. `nachrichtenkopf`, `aktenzeichen`). Aus jedem Element wird beim Aufbau ein **Knoten**; „Element" betont die Schema-Herkunft, „Knoten" die Position im Baum.
- **Wurzel (Wurzelknoten)** — Der oberste Knoten des Baums; entspricht der **Nachricht** (`nachricht.<modul>.<name>.<nummer>`) und ist der Ausgangspunkt jeder Profilierung (`StateService.root()`).
- **Blatt (Blattknoten)** — Ein Knoten ohne strukturelle Kinder, der einen **Wert** aufnimmt (`TreeService.isLeaf`). Nur Blätter tragen Testwerte bzw. Codelisten-Werte.
- **Kante (Verbindungslinie)** — Die Linie, die einen Knoten mit seinen Kind-Knoten verbindet. Sie wird als SVG-Overlay aus der DOM-Geometrie berechnet (siehe [ADR 0003](adr/0003-svg-verbindungslinien.md)). Verweise (`Type.GDS.Ref.*`) erscheinen als eigene rosa **Verweislinien**.
- **Wert / Testwert (Beispielwert)** — Der an einem Blatt hinterlegte Beispielinhalt (`ElementProfile.beispiel`), aus dem die Beispiel-XML entsteht. Bei Codelisten zusätzlich die eingeschränkten zulässigen Werte (`ElementProfile.werte`). Der Toolbar-Schalter „nur Werte" blendet alle Knoten ohne Wert aus.
- **Synthetischer Knoten** — Ein Hilfsknoten für eine `choice`-/`sequence`-Gruppe (Beschriftung „Auswahl"/„Alternative"). Er hat kein eigenes XSD-Element und trägt keinen Wert (`TreeNode.synthetic`).
- **Pfad** — Die eindeutige Kennung eines Knotens als Slash-getrennter String (z. B. `nachricht.…/absender/aktenzeichen`), innerhalb einer Ausprägung mit `…@auspId`-Segment. Schlüssel der Profil-Maps `elemente`/`auspraegungen` (siehe [Datenmodell](data-model.md)).
- **Profilierung** — Siehe unten (Fachbegriffe); das Kernartefakt, das den Baum auf einen Anwendungsfall eingrenzt.

## ERV- und XJustiz-Fachbegriffe

- **Ausprägung** — Ein benannter Fall eines wiederholbaren Elements mit eigener Unter-Profilierung (z. B. `beteiligung` → „Notar/in" / „Betroffene Person"). Technisch ein eigener Pfad-Raum `…@auspId` (siehe [Datenmodell](data-model.md)).
- **BLK** — Bund-Länder-Kommission für Informationstechnik in der Justiz; Herausgeberin des XJustiz-Standards.
- **Codeliste** — Kontrollierte Werteliste (Schlüssel/Bezeichnung), z. B. Gerichte, Staaten, Rollenbezeichnungen. Im Profil lassen sich zulässige Werte einschränken.
- **Code-Typ 3** — Extern gepflegte Codeliste, deren Werte nicht im XSD stehen, sondern über das XRepository bezogen werden.
- **complexType / simpleType** — XSD-Konstrukte: `complexType` beschreibt strukturierte Elemente (mit Kindern/Attributen), `simpleType` einfache Werte (ggf. mit Enumerationen).
- **EGVP** — Elektronisches Gerichts- und Verwaltungspostfach; Transportinfrastruktur des ERV.
- **ERV** — Elektronischer Rechtsverkehr; rechtlicher und technischer Rahmen für die elektronische Kommunikation mit der Justiz.
- **Fachmodul** — Fachlich abgegrenzter Teil von XJustiz (z. B. Insolvenz, Grundbuch); in der App zur Gruppierung der Nachrichten genutzt.
- **Genericode** — OASIS-XML-Format zur Repräsentation von Codelisten; Ergebnis des XRepository-Exports und Eingabe für den Codelisten-Import.
- **Kardinalität** — Häufigkeit eines Elements (`minOccurs`/`maxOccurs`), in der App als Klartext („genau 1", „beliebig viele") und als Profil-Einschränkung.
- **KoSIT** — Koordinierungsstelle für IT-Standards; betreibt u. a. das XRepository.
- **listURI / listVersionID** — Attribute in der Beispiel-XML, die Codelisten-Kennung und -Version an einem Codelisten-Wert referenzieren.
- **Nachricht** — Wurzelelement einer XJustiz-Übermittlung (`nachricht.<modul>.<name>.<nummer>`); Ausgangspunkt jeder Profilierung.
- **OSCI** — Online Services Computer Interface; Protokollfamilie für die sichere Übermittlung im ERV.
- **Profilierung / Kommunikationsszenario** — Eingrenzung des allgemeinen XJustiz-Standards auf einen konkreten Anwendungsfall (Status, Kardinalitäten, Codelisten-Werte, Ausprägungen, Anmerkungen). Das Kernartefakt der App (`ProfileDoc`).
- **Schema-Erweiterung** — Benutzerdefiniertes Element (Name, Beschreibung, Kardinalität, Datentyp; verschachtelbar), das (noch) nicht im XJustiz-Schema existiert und als Nachbeauftragung im Profil festgehalten wird. Überall violett gestrichelt gekennzeichnet; in Testnachrichten enthalten (bewusste XSD-Abweichung). Technisch ein eigener Pfad `elternPfad/~id` (siehe [Datenmodell](data-model.md), [ADR 0010](adr/0010-schema-erweiterungen-profil-overlay.md)).
- **Schematron** — Regelbasierte XML-Validierung (Assertions über XPath). Die App erzeugt `.sch`-Regeln zusätzlich zur XSD-Validierung aus dem Profil.
- **Status / Wirkung** — Frei konfigurierbare Profil-Stufe (Name/Farbe) mit technischer *Wirkung* (`pflicht`, `optional`, `ausgeschlossen`, `markierung`), die Schematron und Beispiel-XML steuert.
- **Verweis (Type.GDS.Ref.\*)** — Referenz-Element, das auf eine andere Ausprägung zeigt (z. B. `rollennummer` → Beteiligung); in der App als rosa Verweislinie dargestellt.
- **XJustiz** — XÖV-Standard für den Datenaustausch in der Justiz (XML-Schemata je Version, z. B. 3.6.2, 4.0.0).
- **XRepository** — Betriebenes Register (KoSIT) für XÖV-Standards und Codelisten; die App ruft darüber genutzte Codelisten ab (`/xrep-api/…` über den Dev-Proxy).
- **XSD** — XML Schema Definition; die Struktur-/Typdefinition, aus der die App den Element-Baum aufbaut.
- **XÖV** — XML in der öffentlichen Verwaltung; Rahmenwerk, dem XJustiz folgt.
