# ADR 0023: Ein Bearbeiten-Modus mit Führung (löst die Drei-Modi-Entscheidung zu #80 ab)

- Status: Angenommen
- Datum: 26.09.24

## Kontext

Seit #80 kannte die Arbeits-Zeile drei Arbeitsweisen: **Ansehen**, **Bearbeiten** und **Geführt**. Geführt war ein Signal `state.guided` neben `readOnly` und schaltete eine Führungsschicht (`GuidedService`) über dieselben Daten: Spur von Punkt zu Punkt, Kennzeichen „offen" im Baum, eine Stationsleiste im Detailbereich, eigene Tasten und eine Rückfrage vor dem Export. Neue Profilierungen und der Durchlauf einer Testnachricht starteten geführt, bestehende Profilierungen im Bearbeiten.

Seit Editor v4 waren die beiden Modi fachlich fast deckungsgleich — dieselbe Antwort-Liste, dieselben Antwort-Tasten, derselbe Stand, derselbe Knopf „Nächstes offenes Feld". Der Unterschied lag in Kleinigkeiten, die man kennen musste, um nicht irritiert zu sein. Die Frage „geführt oder bearbeiten?" stellte sich im Workshop immer wieder, ohne dass eine der Antworten etwas verlor.

Beim Zusammenlegen widersprachen sich die Modi an vier Stellen:

1. **Pfeiltasten.** Geführt (Profil): ← voriger Punkt, → nächster offener Punkt; Eltern/Kind gab es per Tastatur nicht. Bearbeiten: ← Eltern, → Kind. Im Durchlauf einer Nachricht (ADR 0016) liefen ←/→ sogar umgekehrt zum Baum (← hinein, → heraus), und die Baum-Navigation fehlte ganz.
2. **Antwort-Tasten Z/O/N/K.** Geführt sprang danach zum nächsten offenen Punkt, Bearbeiten blieb stehen.
3. **Rückfrage vor dem Export** („Noch N offene Entscheidungen") gab es nur geführt. Seit Editor v4 heißt „ohne eigene Antwort" aber „es gilt die Regel des Standards" — eine gültige Aussage, keine Lücke.
4. **Kennzeichen „offen"** stand geführt an jedem unbeantworteten Kasten — in einer gewachsenen Profilierung hunderte.

## Entscheidung

**Es gibt nur noch Ansehen und Bearbeiten. Bearbeiten führt.** Das Signal `state.guided` entfällt; die Führung gilt, sobald `readOnly` aus ist.

1. **Pfeile gehören der Spur, Shift+Pfeil dem Baum.** Beim Profilieren ← voriger Punkt, → nächster offener, ↑/↓ Geschwister; im Durchlauf einer Nachricht wie in ADR 0016. **Shift+Pfeil** ist in jedem Modus die freie Baum-Navigation (← Eltern, → Kind, ↑/↓ Geschwister) — auch an einer Pflichtangabe, die das Weiterblättern festhält. Beim Ansehen navigieren auch die blanken Pfeile den Baum. Im Wertfeld markiert Shift+Pfeil Text und bewegt die Spur nicht.
2. **Antwort-Tasten springen nur von einem offenen Punkt aus weiter.** War der Punkt offen oder „zu klären", geht es zum nächsten offenen (Durchlauf von Lücke zu Lücke); wer eine schon getroffene Antwort korrigiert, bleibt stehen (`GuidedService.setzeDisposition`).
3. **Der Export fragt nur bei Punkten „zu klären"** (`ExportService.bestaetigeZuKlaerende`); bei Abbruch springt er zum ersten davon. Offene Punkte ohne eigene Antwort lösen keine Rückfrage aus.
4. **Das Kennzeichen „offen" folgt beim Profilieren der Hervorhebung „ohne eigene Antwort"** (Ansicht › Farbig umranden; im Code `hervorhebung.offen`). Eine neue Profilierung schaltet sie ein (`PersistenceService.createNew`), das Öffnen einer bestehenden schaltet sie aus — derselbe Lebenszyklus wie vorher `guided`. Im Durchlauf einer Nachricht steht das Kennzeichen immer: offen ist dort nur eine geschuldete Pflichtangabe.

Dazu, damit beim Zusammenlegen nichts verloren geht:

- An einer **synthetischen Auswahl-Gruppe** stehen Antwort-Liste **und** „Alternativen bestätigen". Geführt fehlte die Antwort-Liste dort; eine optionale Auswahl ließ sich per Maus nicht als Ganzes ausschließen oder parken.
- Die Stationsleiste (‹ Zurück · Weiter › · Nächster offener), „Festlegung übernehmen" und die Kennzeichen Pflicht/optional des Durchlaufs gehören zum Bearbeiten.
- „Profilbindung lösen" beendet Sperren und Vorgaben, nicht mehr die Führung — die läuft ohne Bindung weiter wie bei einer freien Nachricht.

Unverändert bleiben die **Abläufe**, die „geführt" im Namen tragen: „Testnachricht geführt erstellen", „Entwurf fortsetzen", das Kennzeichen `gefuehrt` am Testnachrichten-Eintrag und die Rückfrage vor dem Bearbeiten einer geführt erstellten Nachricht (#105). Sie beschreiben, wie eine Nachricht entstanden ist, keinen Modus.

Verworfen: **die geführte Belegung 1:1 übernehmen** — Eltern/Kind per Tastatur wäre beim Profilieren, die ganze Baum-Navigation im Durchlauf weggefallen. Verworfen: **Baum auf den Pfeilen, Spur auf Shift** — die Spur ist die Bewegung, die der Durchlauf trägt; sie gehört auf die Taste ohne Umgreifen. Verworfen: **die Export-Rückfrage bei jedem offenen Punkt** — sie hätte jede gewachsene Profilierung getroffen und dem Stand („bei den übrigen gilt der Standard") widersprochen.

## Konsequenzen

- Positiv: eine Frage weniger in der Oberfläche; wer bearbeitet, hat Stand, Spur und Tasten ohne Umschalten. Die Tastatur folgt einer Regel für alle Modi (Shift+Pfeil = Baum).
- Negativ: Wer die Pfeile als Baum-Navigation gewohnt war, muss beim Bearbeiten Shift dazunehmen. Eine hochgeladene Nachricht zeigt im Bearbeiten jetzt die Kennzeichen und die Sperre des Durchlaufs.
- Folgeaufgabe: die Bildschirmfotos der Anleitung `03-gefuehrt-entscheiden.webp` und `12-gefuehrte-angabe.webp` zeigen noch das Segment mit „Geführt" und sind neu aufzunehmen (Dateinamen bleiben).
