# ADR 0021: Nutzungszahlen als anonyme Aggregate, nicht als Ereignisprotokoll

- Status: Angenommen
- Datum: 26.08.28

## Kontext

Für die Ansicht **Kennzahlen** war gefragt, „wie stark das Werkzeug genutzt wird" — Nutzerzahl und Auslastung. Der Ausgangsbefund: **diese Daten gab es nicht.** Das Backend kennt keine Konten, keine Sitzungen, keine Cookies und keine Client-Kennung; der einzige Ausweis ist der geteilte AG-Schlüssel ([ADR 0012](0012-abnahme-rollenkonzept.md)). Geloggt wurden ausschließlich Antworten ab Status 400, auf die Konsole (`server/log.js`). Aus den vorhandenen Domänen-Zeitstempeln (`profile_versions.erstellt`, `testmessages.hochgeladen`, `hinweise.zeit`) lässt sich Bestand ableiten, aber keine Person und keine Last.

Nutzung musste also neu erfasst werden. Randbedingungen: die Instanz läuft auf einem Raspberry Pi (SD-Karte, WAL), `better-sqlite3` schreibt **synchron** — jede Zeile blockiert den Event-Loop —, und die SPA feuert beim Seitenaufbau bereits mehrere `/api`-Requests. Dazu die fachliche Lage: die Instanz ist offen erreichbar und wird von Externen der BLK-AG benutzt; ein Zugriffsprotokoll mit Personenbezug wäre in diesem Umfeld eine eigene Diskussion, die niemand geführt hat.

## Entscheidung

**Gezählt wird anonym, geschrieben wird aggregiert.**

- **Kennung:** eine im Browser erzeugte Zufalls-UUID (`localStorage` `xjp.klientId`, `KlientService`), die als Header `x-klient` an jeden API-Request geht. Sie beantwortet genau eine Frage — zehn Zugriffe von einem Browser oder von zehn? Keine IP, kein Name, keine Inhalte. Gezählt werden damit **Browser-Profile, nicht Personen**; das steht so auch in der Ansicht, damit die Zahl nicht überinterpretiert wird.
- **Kein Ereignisprotokoll.** Statt einer Zeile je Request sammelt ein Puffer im Prozess (`server/nutzung.js`) und schreibt alle fünf Sekunden in einer Transaktion **Stundenkübel** (`nutzung_stunde`) und **Klient-pro-Tag-Zeilen** (`nutzung_klient_tag`). Alle Kennzahlen der Ansicht sind ohnehin Aggregate; die Stundenauflösung erhält zusätzlich das Tagesprofil.
- **Zwei Stufen Aufbewahrung.** Nach 30 Tagen verdichtet ein Lauf (beim Start und bei jedem Kalendertagswechsel) die Rohdaten zu Tageszeilen (`nutzung_tag`) und die Kennungen zu einer bloßen Anzahl (`nutzung_tag_klienten`); die Rohzeilen werden gelöscht. Der Langzeittrend bleibt unbegrenzt, die Kennungen leben höchstens 30 Tage.
- **Zwei Sichten** (`nutzung_tage`, `nutzung_klienten_tage`) verstecken vor der Auswertung, ob ein Tag noch roh oder schon verdichtet ist.
- **Tage sind lokale Kalendertage** und werden **in JS** bestimmt (`server/zeit.js`), nie in SQL aus dem Zeitstempel gerechnet — sonst wandern Zeilen beim Sommerzeitwechsel zwischen Tagen.
- **AG-exklusiv:** `GET /api/kennzahlen` und die Ansicht liegen hinter `auth.istAg`; ohne konfigurierten Schlüssel gibt es sie gar nicht. Wie stark das Werkzeug genutzt wird, geht die externen Betrachter der offenen Instanz nichts an.
- **Routen werden normalisiert und gedeckelt:** Kennungen werden zu `:id`, Versionsnummern zu `:version`, unbekannte Pfade sammeln sich auf `/api/sonstige` — ohne diesen Deckel bläht ein Scanner die Tabelle mit Müllrouten auf.

Verworfen: **eine Rohzeile je Request** — die naheliegende Variante, aber auf dem Pi ein synchroner Schreibvorgang pro Zugriff, und mit Personenbezug-Nähe (vollständige Zugriffsspur je Kennung), die für die gestellten Fragen nichts hergibt. Ebenso verworfen: **nur Bestandszahlen ohne jede Erfassung** — beantwortet „Auslastung" nicht, und „Autoren" ist ein schlechter Ersatz für „Nutzer". Ebenso verworfen: **IP-Adressen oder das nginx-Access-Log auswerten** — Personenbezug ohne Not, und die Daten lägen außerhalb der Anwendung.

## Konsequenzen

- **Positiv:** Nutzungszahlen ohne Personenbezug und ohne spürbare Schreiblast. Die DB wächst um ~1 MB (30 Tage Rohdaten) plus ~25 Zeilen je Tag Langzeit. Die Erfassung hängt an einer Stelle (`createApp`), ist über die HTTP-Naht testbar und lässt sich mit `createApp(db, { nutzung: false })` abschalten. Migration ist rein additiv (`CREATE TABLE IF NOT EXISTS`, `PRAGMA user_version` unverändert) — der Deploy braucht keinen Sonderschritt, ein Rollback funktioniert.
- **Negativ / Folgeaufgaben:** Ein harter Abbruch (`SIGKILL`) verliert das laufende Flush-Intervall (≤ 5 s Zugriffe); `SIGTERM`/`SIGINT` schreiben noch weg. „Aktive Klienten im Zeitraum" ist ein Distinct über die Rohzeilen und daher nur 30 Tage weit belastbar — für längere Fenster bleibt die Tagesreihe. Zugriffe ohne Kennung (curl, Monitoring) werden getrennt ausgewiesen, statt geraten. Und die Grundschwäche der Methode bleibt: geleerter Speicher, zweiter Browser oder privates Fenster ergeben eine neue Kennung — die Zahl ist eine Untergrenze der Personen und eine Obergrenze der Geräte.
