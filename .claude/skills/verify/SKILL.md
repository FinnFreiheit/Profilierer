---
name: verify
description: App end-to-end verifizieren — Dev-Server-Handle, Puppeteer-Drive durch Dashboard/Editor, Aufräumen der Test-Profile
---

# Verify: XJustiz Profilierer

Rezept, um eine Änderung in der laufenden App zu beobachten (nicht nur Tests).

## Handle

- Node 24 aktivieren: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24`
- Dev-Server: `npm run dev` (Web 4200 + API 3001). **Vorher prüfen, ob schon einer läuft**
  (`curl -s http://localhost:4200 >/dev/null` bzw. EADDRINUSE) — `ng serve` hot-reloadet
  Änderungen, ein laufender Server des Benutzers genügt. Ob der laufende Server den neuen
  Code hat: `curl -s http://localhost:4200/main.js | grep -c "<neues Symbol>"`.
- Browser-Drive: Puppeteer aus dem Projekt-`node_modules` (Chrome for Testing ist installiert).
  Skript im Scratchpad + `ln -s <repo>/node_modules <scratchpad>/node_modules` für die Auflösung.

## Drive-Bausteine (Selektoren)

- Dashboard: `.dashHead`, Button „+ Neues Profil", Karten `.dashCard` mit `.dcName` und `button.del`.
- Nachricht wählen: `#msgBtn` (enabled = Schema geladen; 3.6.2 lädt beim Start automatisch),
  dann `.msgItem` klicken.
- **Arbeitsweise:** Segment `.modusSeg` mit „Ansehen" | „Bearbeiten" — einen geführten Modus gibt
  es seit ADR 0023 nicht mehr, Bearbeiten führt selbst. Pfeile = Spur (Profil: ← voriger, → nächster
  offener Punkt), **Shift+Pfeil = Baum** (Eltern/Kind/Geschwister). Neue Profile schalten die
  Hervorhebung „ohne eigene Antwort" (Ansicht › Farbig umranden, `hervorhebung.offen`) ein —
  Kennzeichen `.t-open` —, geöffnete Bestandsprofile aus.
- Menü-Backdrop (`div[style*="position: fixed"]` im `app-menu`) schluckt echte Klicks —
  zum Schließen den Backdrop klicken, nicht `body`.
- Stand: `.stand` in der Arbeits-Zeile („X von Y eigens beantwortet", im Durchlauf „… Pflichtangaben").
- Detail: `#detail h3` (selektiertes Element), `.antwortZeile.aktiv` (Antwort-Liste), `.guidedSec`, `.gKbdHint`.
- `page.on('dialog', d => d.accept())` für `confirm()`-Dialoge setzen.

## Aufräumen (wichtig)

Jeder Lauf legt per „+ Neues Profil" einen Eintrag in der SQLite-DB an. Test-Profile mit
erkennbarem Namen anlegen (Szenario-Feld `#profilName`) und danach **gezielt** löschen:
`curl -s http://localhost:3001/api/profiles` (Liste mit id/name/aktualisiert),
`curl -X DELETE http://localhost:3001/api/profiles/<id>`. Nie nach Position löschen —
echte Benutzer-Profile liegen in derselben DB.
