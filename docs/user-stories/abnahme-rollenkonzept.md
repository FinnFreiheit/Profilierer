# US: Abnahme durch die BLK-AG — einfaches Rollenkonzept mit Schutz und Hervorhebung

Status: umgesetzt (26.07.27) · Typ: einzelne Story

## Story

> **Als** Mitglied der BLK-AG IT-Standards **möchte ich** Profilierungen und
> Testnachrichten als „abgenommen" kennzeichnen können — egal ob von der AG selbst
> bereitgestellt oder extern eingereicht und geprüft — sodass diese Inhalte vor
> Änderungen durch Externe geschützt und überall auf einen Blick als valide
> erkennbar sind, **damit** jeder Nutzer sofort unterscheiden kann, welche Inhalte
> verbindlich von der BLK-AG stammen und welche extern beigesteuert wurden.

## Ausgangslage

Der Profilierer läuft als Einzelnutzer-System **ohne jede Authentifizierung**
(ADR 0007 — Absicherung nur über Netz/Reverse-Proxy). Jeder, der die Instanz
erreicht, kann alle Profile und Testnachrichten anlegen, ändern und löschen.
Profile haben ein Versionskonzept (unveränderliche Snapshots in
`profile_versions`, „geändert seit vX"-Kennzeichen); Testnachrichten sind
einzelne XML-Blobs mit Metadaten ohne Versionierung (`tmCreate`/`tmUpdate`).

## Geklärte Entscheidungen (Refinement)

1. **Genau zwei Rollen, ein gemeinsamer Schlüssel.** „BLK-AG" weist sich über
   einen gemeinsamen AG-Schlüssel aus (Env-Variable `XJP_AG_KEY`); alle ohne
   Schlüssel sind „Extern". Keine Benutzerkonten, keine Kontenverwaltung.
   Ist `XJP_AG_KEY` auf dem Server nicht gesetzt, gibt es keine AG-Rolle —
   das Tool verhält sich wie heute (Einzelplatz-/Entwicklungsbetrieb bleibt
   ohne Konfiguration lauffähig).
2. **Ein einziger Status „abgenommen".** „Von der AG bereitgestellt" und
   „extern eingereicht, von der AG abgenommen" werden nicht unterschieden —
   Schutz- und Anzeigewirkung sind identisch. Die Unterscheidung kann bei
   Bedarf im Abnahme-Kommentar festgehalten werden.
3. **AG darf alles — mit Warnhinweis.** Abgenommene Objekte sind für die
   AG-Rolle weiterhin änder- und löschbar; beim ersten Ändern (und beim
   Löschen) erscheint ein Warnhinweis, dass ein geschützter Stand betroffen
   ist. Kein hartes Einfrieren.
4. **Abnahme erzeugt eine Version.** „Abnehmen" friert den aktuellen Stand als
   unveränderlichen Snapshot mit Kennzeichen „abgenommen" ein (Profile:
   Eintrag in `profile_versions`; optionaler Kommentar). Bearbeitet die AG
   danach weiter, zeigt das UI **„geändert seit Abnahme"**; der exakt
   abgenommene Stand bleibt jederzeit einsehbar und wiederherstellbar.
   Eine erneute Abnahme erzeugt den nächsten Abnahme-Snapshot.
5. **Testnachrichten: leichtgewichtiger Abnahme-Stand statt Versionierung.**
   Bei Abnahme wird die abgenommene Fassung (XML + Zeitstempel + optionaler
   Kommentar) eingefroren — keine Versionsliste, nur genau der abgenommene
   Stand. Gleiche Semantik wie bei Profilen („geändert seit Abnahme",
   Neuabnahme ersetzt den Abnahme-Stand). Volle Versionierung für
   Testnachrichten bleibt eine mögliche spätere Story.
6. **Schutzumfang: nur markierte Objekte, Löschen eingeschlossen.** Externe
   arbeiten am unmarkierten Bestand wie bisher (anlegen, ändern, löschen).
   Bei abgenommenen Objekten blockt der **Server** für Externe jede
   Schreiboperation: Ändern, Umbenennen, Löschen sowie das Setzen und
   Entfernen des Abnahme-Kennzeichens (Abnehmen ist AG-exklusiv).
   Duplizieren bleibt erlaubt — die Kopie ist unmarkiert.
7. **Anmeldung: einmal pro Browser, serverseitig geprüft.** Toolbar-Punkt
   „Anmelden" fragt den AG-Schlüssel ab; der Client merkt ihn sich
   (übersteht Reload) und schickt ihn bei jedem Schreibzugriff mit. Die
   Prüfung erfolgt bei **jedem Request serverseitig** — das Rollen-Badge in
   der Werkzeugleiste ist reine Anzeige, kein Schutz. Abmelden jederzeit.
8. **Hervorhebung in der App, nicht in Exporten.** Unverwechselbares
   Abnahme-Badge (Siegel-Symbol „BLK-AG" in eigener Farbe) an jedem
   Listeneintrag in Bibliothek und Testdatenspeicher sowie im Kopf des
   geöffneten Editors; Filter „nur abgenommene" in beiden Listen; in der
   Bibliothek zusätzlich ein eigener Abschnitt „Von der BLK-AG abgenommen"
   oberhalb des übrigen Bestands. Bei Abweichung vom Abnahme-Stand kippt
   das Badge in eine Warnvariante („geändert seit Abnahme").
   **Exporte (Druck, Excel, Profil-JSON, Beispiel-/Test-XML) bleiben
   unverändert** — das Kennzeichen ist eine Aussage dieser Server-Instanz.
9. **Import verwirft Abnahme-Felder.** Beim Import einer Profil-JSON wird
   ein etwaiges Abnahme-Feld serverseitig verworfen — Abnahmen können nicht
   über Dateien eingeschleppt werden.
10. **Ein Stand pro Objekt — kein verstecktes Branching.** Auch nach
    AG-Änderungen sehen Externe den aktuellen Arbeitsstand (mit Warn-Badge).
    Die valide Fassung ist gezielt abrufbar: „Abgenommene Fassung
    anzeigen/herunterladen" (Profil: aus der Abnahme-Version; Testnachricht:
    aus dem Abnahme-Snapshot). Wer länger parallel weiterentwickeln will,
    dupliziert.

## Akzeptanzkriterien

- **Anmelden:** Toolbar-Punkt „Anmelden" nimmt den AG-Schlüssel entgegen; bei
  korrektem Schlüssel erscheint das Rollen-Badge „BLK-AG" in der
  Werkzeugleiste, „Abmelden" entfernt es. Ein falscher Schlüssel wird mit
  Fehlermeldung abgelehnt. Ohne gesetztes `XJP_AG_KEY` ist der Menüpunkt
  inaktiv und das Tool verhält sich wie bisher.
- **Abnehmen:** Mit AG-Rolle lässt sich ein Profil bzw. eine Testnachricht
  „abnehmen" (optionaler Kommentar). Dabei entsteht der Abnahme-Snapshot
  (Profil: Version mit Kennzeichen „abgenommen"; Testnachricht: eingefrorene
  XML-Fassung mit Zeitstempel). Das Objekt trägt ab sofort das Abnahme-Badge.
- **Serverseitiger Schutz:** Ohne gültigen Schlüssel weist der Server jede
  Schreiboperation auf ein abgenommenes Objekt ab (Ändern, Umbenennen,
  Löschen, Abnahme setzen/entfernen) — auch bei direkten API-Aufrufen an
  der UI vorbei. Unmarkierte Objekte bleiben für alle frei bearbeitbar.
- **Warnhinweis für die AG:** Ändert oder löscht ein angemeldetes AG-Mitglied
  ein abgenommenes Objekt, erscheint vorab ein Hinweis, dass ein geschützter
  Stand betroffen ist. Nach einer Änderung zeigt das Objekt „geändert seit
  Abnahme" (Warnvariante des Badges).
- **Hervorhebung:** Abnahme-Badge an jedem Eintrag in Profil-Bibliothek und
  Testdatenspeicher sowie im Editor-Kopf des geöffneten Objekts; Filter
  „nur abgenommene" in beiden Listen; eigener Abschnitt „Von der BLK-AG
  abgenommen" oben in der Bibliothek. Exporte enthalten keinerlei
  Abnahme-Vermerk.
- **Abgenommene Fassung abrufbar:** Bei „geändert seit Abnahme" lässt sich
  die abgenommene Fassung anzeigen bzw. herunterladen — für Profile über die
  Abnahme-Version, für Testnachrichten über den Abnahme-Snapshot (XML).
- **Duplizieren:** Externe können abgenommene Objekte duplizieren; die Kopie
  ist unmarkiert und frei bearbeitbar.
- **Import:** Eine importierte Profil-JSON mit Abnahme-Feld wird angenommen,
  das Feld aber serverseitig verworfen — der Eintrag erscheint unmarkiert.
- **Neuabnahme:** Ein erneutes „Abnehmen" ersetzt den referenzierten
  Abnahme-Stand (neuer Snapshot); das Warn-Kennzeichen verschwindet.

## Nicht in dieser Ausbaustufe

- Individuelle Benutzerkonten, weitere Rollen, Passwort-/Schlüsselverwaltung
  im UI (Schlüsselwechsel = Env-Variable ändern).
- Abnahme-Workflow (Einreichen, Review, Vier-Augen-Prinzip).
- Abnahme-Vermerk in Exporten (Druck, Excel, JSON, XML).
- Volle Versionierung für Testnachrichten.
- Besitzerkonzept („nur eigene Objekte löschen") für Externe.
