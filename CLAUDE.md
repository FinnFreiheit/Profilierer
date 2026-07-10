# CLAUDE.md — XJustiz Profilierer

Projekt-Handbuch für die Arbeit mit Claude Code im Terminal. Wird bei jeder Session automatisch geladen.

## Was ist das

Der **XJustiz Profilierer** ist ein Werkzeug zur Visualisierung von XJustiz-Nachrichten und zur Erstellung von Profilierungen (Kommunikationsszenarien) — auch für die gemeinsame Arbeit mit Nicht-Technikern. Kern ist eine **einzelne HTML-Datei** ohne Build-Schritt, die im Browser läuft. Fachliche Details zur Bedienung stehen im [README](README.md).

## Sprache und Stil

- Antworte immer auf **Deutsch**, außer explizit anders gewünscht.
- Keine Emojis in Dateien oder Antworten, außer verlangt.
- Knapp und direkt. Keine Zusammenfassungen am Ende jeder Antwort.
- Fachterminologie des ERV/XJustiz-Umfelds ist erwünscht und muss nicht erklärt werden.
- Datumsangaben im Format `YY.MM.DD`.

## Struktur

```
xjustiz-profilierer/
├── Profilierer.html    Das gesamte Tool (Struktur, Logik, Styling in einer Datei)
├── xrep-proxy.py       Start-Helfer: serviert die App und reicht XRepository-Aufrufe same-origin durch
├── README.md           Fachliche Bedienungsanleitung
└── CLAUDE.md           Dieses Handbuch
```

`Profilierer.html` ist bewusst **eine einzige Datei** (kein Bundler, keine externen Module außer SheetJS via CDN für den Excel-Export). Änderungen an Logik, Styling und Markup erfolgen direkt in dieser Datei.

## Starten / Entwickeln

- **Einfach öffnen:** `Profilierer.html` per Doppelklick — alles läuft offline, außer dem Excel-Export (SheetJS via CDN).
- **Mit XRepository-Anbindung:** `python3 xrep-proxy.py` im Projektordner. Serviert die App unter `http://localhost:8737/Profilierer.html` und reicht XRepository-REST-Aufrufe (`/xrep-api/…`) same-origin durch — löst das CORS-Problem. Nur Python-Standardbibliothek, öffnet den Browser automatisch. Beenden mit Strg+C.
- Testdaten: XSD-Schemata liegen unter `/Users/finnfreiheit/code/XJustiz_3_6_2_XSD` (im Tool per „XSD-Ordner laden" wählen).

## Konventionen

- **Kein Build-Tooling** ungefragt einführen (kein npm/bundler). Die Single-File-Architektur ist Absicht — Weitergabe per Doppelklick muss funktionieren.
- Bestehenden Code-Stil in `Profilierer.html` beibehalten (Vanilla JS, deutschsprachige Bezeichner und Kommentare).
- **Keine ungefragten Refactors** über den Auftrag hinaus.
- Vor Änderungen an XRepository-Logik `xrep-proxy.py` und den Proxy-Pfad (`/xrep-api/`) beachten.

## Git

Repository ist mit `git init` angelegt. Commits knapp und auf Deutsch. Kein Remote gesetzt — bei Bedarf hinzufügen.
