# US: Profilierung versionieren — Stände sichern und zurückspringen

Status: umgesetzt (26.07.24) · Typ: einzelne Story

## Story

> **Als** Profilierender **möchte ich** von einer Profilierung Versionen anlegen und
> zu einem früheren Stand zurückspringen können — insbesondere vor der Arbeit an einer
> bestehenden Profilierung den aktuellen Stand sichern und danach frei als Entwurf
> arbeiten — **damit** ich gefahrlos probieren kann und ein Fehlgriff nicht den
> letzten guten Stand zerstört.

## Ausgangslage

Der Editor schreibt jede Änderung per **800-ms-Autosave** in den aktiven
Bibliothekseintrag (`PersistenceService` → `ProfileStoreService` → Backend).
„Der Stand davor" existiert dadurch nie — er ist Sekunden nach der ersten Änderung
überschrieben. Pro Profil liegt serverseitig eine SQLite-Zeile mit dem kompletten
`ProfileDoc` als JSON (`server/db.js`, Tabelle `profiles`).

## Geklärte Entscheidungen (Refinement)

1. **Modell: explizite, unveränderliche Snapshots** (Checkpoints) des kompletten
   Profilstands. Kein automatisches Dauerversionieren, kein Branching.
2. **Zurückspringen = Wiederherstellen in-place:** gleiche Profil-ID, der
   Bibliothekseintrag bleibt derselbe. Vor dem Wiederherstellen wird der aktuelle
   Arbeitsstand automatisch als **Sicherheits-Version** gesichert — auch das
   Zurückspringen selbst ist damit reversibel.
3. **„Entwurf" ist implizit:** „Version anlegen" vor dem Arbeiten _ist_ die Aussage
   „ab jetzt Entwurf". Kein separater Entwurf-Schalter; sichtbar als Kennzeichen
   „geändert seit vX", sobald der Arbeitsstand von der letzten Version abweicht.
4. **Metadaten:** fortlaufende Nummer (v1, v2, …) und Zeitstempel automatisch;
   beim Anlegen optionaler Kommentar. Automatisch entstandene Versionen
   (Öffnen-Snapshot, Sicherheits-Version) sind als „automatisch" gekennzeichnet
   und tragen einen generierten Kommentar (z. B. „Stand vor Wiederherstellung von v2").
5. **Sicherheitsnetz gegen Vergessen:** Beim Öffnen eines Profils aus der Bibliothek
   entsteht **entprellt** ein Auto-Snapshot — nur, wenn sich der Stand seit der
   letzten Version unterscheidet (kein Duplikat durch bloßes Anschauen).
6. **Aufräumen:** Automatik-Versionen pro Profil auf die letzten **~10** gedeckelt
   (ältere fallen still weg). Manuell angelegte Versionen bleiben unbegrenzt und
   werden nur von Hand gelöscht (mit Rückfrage).
7. **UI editor-zentriert:** Toolbar-Punkt **„Versionen…"** neben „Details…" öffnet
   einen Dialog: Liste (Nummer, Datum, Kommentar, Automatik-Kennzeichen) mit
   „Wiederherstellen" und „Löschen" pro Zeile, oben „Version anlegen". Das
   Dashboard zeigt nur passiv Versionsanzahl bzw. „geändert seit vX".
8. **Nicht in dieser Ausbaustufe:** Read-only-Vorschau einer Version und
   Profil-Diff Version ↔ Arbeitsstand (siehe Ausbau).

## Akzeptanzkriterien

- Toolbar-Punkt **„Versionen…"** öffnet den Versions-Dialog des aktiven Profils.
- **„Version anlegen"** friert den aktuellen Arbeitsstand als Version ein
  (Nummer + Zeitstempel automatisch, Kommentar optional). Versionen sind
  unveränderlich; der Autosave berührt weiterhin ausschließlich den Arbeitsstand.
- **„Wiederherstellen"** ersetzt den Arbeitsstand durch die gewählte Version
  (gleiche Profil-ID); unmittelbar davor wird der bisherige Arbeitsstand als
  automatische Sicherheits-Version weggeschrieben. Editor und Baum zeigen danach
  den wiederhergestellten Stand.
- Beim **Öffnen** eines Profils aus der Bibliothek entsteht ein Auto-Snapshot,
  wenn der gespeicherte Stand von der jüngsten Version abweicht; reines Öffnen
  und Schließen ohne Änderung erzeugt keine neue Version.
- Automatik-Versionen sind in der Liste als solche gekennzeichnet; pro Profil
  bleiben höchstens ~10 erhalten, manuelle Versionen sind vom Deckel ausgenommen.
- **Löschen** einer Version fragt zurück und entfernt nur diese Version.
- Editor (Topbar/Toolbar-Bereich) und Dashboard-Karte zeigen ein
  **Entwurfs-Kennzeichen** („geändert seit vX"), sobald der Arbeitsstand von der
  letzten Version abweicht; Dashboard-Karten zeigen die Versionsanzahl.
- **Löschen eines Profils** entfernt auch seine Versionen (Kaskade).
- Versionen überleben Server-Neustarts (SQLite) und werden vom Bulk-Import der
  Migration nicht angetastet.

## Umsetzungs-Nachtrag

Das Kennzeichen „geändert seit vX" prüft in der Umsetzung, ob der Arbeitsstand in
**irgendeiner** Version eingefroren ist (Hash-Vergleich), nicht nur in der letzten:
Nach einem Wiederherstellen ist die jüngste Version die Sicherheits-Version — der
wiederhergestellte (ältere) Stand gilt trotzdem als gesichert und trägt kein
Kennzeichen. Dieselbe Prüfung entprellt die Automatik-Versionen.

## Umsetzung (Orientierung)

- **Backend:** neue Tabelle `profile_versions`
  (`id`, `profile_id`, `nr`, `kommentar`, `automatisch`, `doc`-JSON, `erstellt`);
  Endpunkte unter `/api/profiles/:id/versions` (Liste ohne `doc`, anlegen,
  wiederherstellen, löschen); Deckel-Logik für Automatik-Versionen beim Anlegen;
  Kaskade beim Profil-Löschen.
- **Frontend:** `ProfileStoreService` um Versions-API erweitern; Versions-Dialog
  unter `features/dialogs/`; Toolbar-Eintrag; Öffnen-Snapshot im Lade-Fluss
  (`PersistenceService`/Dashboard-Öffnen); Entwurfs-Kennzeichen aus dem Vergleich
  Arbeitsstand ↔ jüngste Version (`aktualisiert`-Zeitstempel bzw. Versions-Stand
  im `LibraryEntry`).
- **Tests:** `server/profiles.test.js` (Versions-CRUD, Deckel, Kaskade,
  Wiederherstellen inkl. Sicherheits-Version), Frontend-Specs für Store und
  Öffnen-Snapshot-Entprellung.

## Ausbau (bewusst später)

- **Read-only-Vorschau:** Version im Baum ansehen, ohne sie wiederherzustellen
  (braucht einen Schreibschutz-Modus, in dem der Autosave nicht anspringt).
- **Profil-Diff:** Unterschiede Version ↔ Arbeitsstand markieren (analog zum
  Schema-Diff, aber auf Profilierungs-Ebene).
- **Dashboard aktiv:** Versionen anlegen/wiederherstellen direkt an der
  Profil-Karte, ohne das Profil zu öffnen.
