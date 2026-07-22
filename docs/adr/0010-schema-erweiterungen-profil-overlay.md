# ADR 0010: Schema-Erweiterungen als Profil-Overlay statt Schema-Manipulation

- Status: Angenommen
- Datum: 26.07.21

## Kontext

Profilierungen entstehen in Zusammenarbeit mit der Fachseite; dabei fällt auf, dass
Elemente im XJustiz-Schema fehlen und **nachbeauftragt** werden müssen (US
[Schema-Erweiterung](../user-stories/schema-erweiterung.md)). Diese Elemente sollen auf
jeder Baum-Ebene erfassbar sein und in allen Artefakten sichtbar werden — obwohl sie im
XSD nicht existieren. Der Baum der App ist rein XSD-abgeleitet und nicht persistiert;
das Profil ist ein pfad-indiziertes Overlay ([ADR 0002](0002-signals-store.md)).
Randbedingung: Die XSD-Validierung ([ADR 0009](0009-xsd-validierung-xmllint-wasm.md))
prüft gegen das **offizielle** Schema — Nachrichten mit Erweiterungen sind zwangsläufig
schema-invalide, und die bestehenden Validierungs-Tore (Entwurfs-Kennzeichen,
Download-Sperre) würden die Funktion unbrauchbar machen.

## Entscheidung

1. **Profil-Overlay statt Schema-Manipulation:** Erweiterungen werden nicht ins
   XSD/den Index eingebaut, sondern als neue persistierte Map
   `ProfileDoc.erweiterungen: Record<elternPfad, Erweiterung[]>` gehalten und beim
   Expandieren als synthetische `TreeNode`s injiziert (`TreeService.kinder()` =
   Schema-Kinder + frisch synthetisierte Erweiterungs-Knoten, bewusst ohne
   Lazy-Cache). So sehen alle Konsumenten (Baum, Exporte, Print, Suche) sie einheitlich.
2. **Pfad-Schema `elternPfad/~id`:** `~` ist kein NCName-Zeichen (keine Kollision mit
   Elementnamen, `#n`, `@auspId`); der Separator bleibt `/`, daher funktionieren alle
   bestehenden Präfix-Kaskaden (`removeAusp`, `moveSubProfile`, Fokus-Modus,
   Vorfahren-Aggregate) unverändert. Der Pfad trägt die **id**, nicht den Namen —
   Umbenennen verschiebt keine Profil-Einträge. Verschachtelung: `…/~x1/~x2`.
3. **Immer emittieren, Fehler klassifizieren statt Tore aufweichen:** Beispiel-XML und
   Testnachrichten enthalten Erweiterungen immer. Die Validierung bleibt scharf; der
   `ValidationMarkerService` klassifiziert Fehler auf `/~`-Pfaden (plus konservativer
   Namens-Fallback) als „bekannte Schema-Erweiterung". Nur wenn **ausschließlich**
   solche Fehler vorliegen, lassen die drei Tore (Beispiel-XML-Download,
   Profil-Generierung, geführtes Speichern) durch — echte Fehler blockieren weiterhin.
   Im Schematron entstehen keine Asserts gegen Nicht-Schema-Pfade, sondern
   dokumentierende Kommentare.

## Konsequenzen

- **Positiv:** Kein Eingriff in Parser/Index; Erweiterungen persistieren transparent im
  JSON-Blob (alte Server speichern sie unverändert mit); die Kennzeichnung ist überall
  ableitbar (`TreeNode.erweiterung`, `istErweiterungsPfad`); die
  Schema-valide-Garantie für Nachrichten **ohne** Erweiterungen bleibt unangetastet.
- **Negativ / bewusst hingenommen:** Nachrichten mit Erweiterungen sind
  schema-invalide (gewollt, mit Kennzeichnung); Diff, geführter Modus und
  Instanz-Import kennen Erweiterungen nicht; der Namens-Fallback der Klassifikation
  kann bei absichtlicher Namensgleichheit mit Schema-Elementen fehlgreifen (der Dialog
  warnt vor Kollisionen).
- **Folgeaufgaben:** Profildatei-Format auf `formatVersion 3` gehoben (v2-Import
  defaultet auf leer); Server-Indexspalte `n_erw` per PRAGMA-Migration; Altbestände
  zeigen das Dashboard-Badge erst nach dem nächsten Speichern.
