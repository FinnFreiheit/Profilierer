# Glossar (ERV / XJustiz)

Fachbegriffe des elektronischen Rechtsverkehrs und des XJustiz-Standards, jeweils mit Bezug zur App. Alphabetisch.

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
- **Schematron** — Regelbasierte XML-Validierung (Assertions über XPath). Die App erzeugt `.sch`-Regeln zusätzlich zur XSD-Validierung aus dem Profil.
- **Status / Wirkung** — Frei konfigurierbare Profil-Stufe (Name/Farbe) mit technischer *Wirkung* (`pflicht`, `optional`, `ausgeschlossen`, `markierung`), die Schematron und Beispiel-XML steuert.
- **Verweis (Type.GDS.Ref.\*)** — Referenz-Element, das auf eine andere Ausprägung zeigt (z. B. `rollennummer` → Beteiligung); in der App als rosa Verweislinie dargestellt.
- **XJustiz** — XÖV-Standard für den Datenaustausch in der Justiz (XML-Schemata je Version, z. B. 3.6.2, 4.0.0).
- **XRepository** — Betriebenes Register (KoSIT) für XÖV-Standards und Codelisten; die App ruft darüber genutzte Codelisten ab (`/xrep-api/…` über den Dev-Proxy).
- **XSD** — XML Schema Definition; die Struktur-/Typdefinition, aus der die App den Element-Baum aufbaut.
- **XÖV** — XML in der öffentlichen Verwaltung; Rahmenwerk, dem XJustiz folgt.
