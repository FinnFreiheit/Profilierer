---
version: alpha
name: XJustiz-Pfadfinder
description: 'Ein Werkzeug-Interface für Fachleute, das wie ein ruhiges Formular liest. Kühler Hellgrund, weiße Flächen, eine Strukturfarbe (Preußischblau #14213d) für Text, Auswahl und Primäraktion, ein Signal (Orange #fca311) für Fokus und Fortschritt — sonst nichts Markenhaftes. Bedeutung tragen fachliche Farben (grün frei, bernstein geändert, violett Erweiterung, rot Fehler), nie die Palette. Systemschrift bei 14px, Mono für alles, was aus dem Schema kommt. Schatten nur auf Schwebendem (Menü, Dialog, Detailkarte) und als Haarlinie unter Kacheln und Baumkästen, nie auf Kopf- und Fußzeile.'

colors:
  schwarz: '#000000'
  preussischblau: '#14213d'
  orange: '#fca311'
  alabaster: '#e5e5e5'
  weiss: '#ffffff'
  bg: '#f4f5f8'
  panel: '#ffffff'
  text: '#14213d'
  text-stark: '#000000'
  accent: '#14213d'
  accent-hover: '#223357'
  accent-soft: '#e8ecf5'
  accent-soft-tief: '#ccd5e8'
  accent-hauch: '#f2f5fa'
  signal: '#fca311'
  signal-soft: '#fef1db'
  flaeche-hell: '#f7f8fa'
  flaeche: '#f0f1f4'
  flaeche-tief: '#e8eaef'
  border: '#e4e6eb'
  border-stark: '#c3ccdd'
  trenner: '#edeff3'
  muted: '#545e70'
  muted-schwach: '#8d93a1'
  on-accent: '#ffffff'
  frei-bg: '#ddf3e4'
  frei-fg: '#17693c'
  warn-bg: '#fdeecd'
  warn-fg: '#9a6a00'
  erweiterung-bg: '#efedfb'
  erweiterung-fg: '#5a50c0'
  fehler-bg: '#f9e9e9'
  fehler-fg: '#b23a3a'
  belegt-bg: '#f0f9f2'
  auswahl-bg: '#f1eaf8'
  auswahl-fg: '#7a4fa3'
  verweis-bg: '#fbeaf0'
  verweis-fg: '#993556'
  schema-pflicht: '#a9dcc9'
  xml-wert: '#0f6e56'

typography:
  seitentitel:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 24px
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: -0.02em
  kachelname:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0
  bedienung:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0
  bedienung-stark:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: 0
  nebentext:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  kennzeichen:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 11px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: 0.06em
  baum-tag:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 10px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  schema-mono:
    fontFamily: "ui-monospace, 'SF Mono', Consolas, monospace"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0
  leer-symbol:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 40px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: 0

rounded:
  balken: 3px
  tag: 4px
  bedienung: 8px
  umschalter: 10px
  kasten: 12px
  pill: 999px

spacing:
  xxs: 4px
  xs: 6px
  sm: 8px
  md: 10px
  lg: 14px
  xl: 16px
  xxl: 20px
  seite: 28px

components:
  button:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.bedienung}'
    rounded: '{rounded.bedienung}'
    border: '1px solid {colors.border}'
    padding: 6px 12px
    shadow: none
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.on-accent}'
    typography: '{typography.bedienung}'
    rounded: '{rounded.bedienung}'
    border: '1px solid {colors.accent}'
    padding: 6px 12px
  button-primary-active:
    backgroundColor: '{colors.accent-hover}'
    textColor: '{colors.on-accent}'
    rounded: '{rounded.bedienung}'
  button-disabled:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    rounded: '{rounded.bedienung}'
    opacity: 0.45
  eingabe:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.bedienung}'
    rounded: '{rounded.bedienung}'
    border: '1px solid {colors.border}'
    padding: 6px 8px
  eingabe-focus:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    rounded: '{rounded.bedienung}'
    border: '1px solid {colors.accent}'
    outline: '2px solid {colors.signal}'
  suchfeld:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.bedienung}'
    rounded: '{rounded.bedienung}'
    minWidth: 280px
    maxWidth: 420px
  modus-segment:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.muted}'
    typography: '{typography.bedienung}'
    rounded: '{rounded.umschalter}'
    padding: 3px
  darstellung-segment:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.muted}'
    typography: '{typography.bedienung}'
    rounded: '{rounded.umschalter}'
    padding: 3px
  ansicht-umschalter:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.muted}'
    typography: '{typography.bedienung}'
    rounded: '{rounded.umschalter}'
    padding: 3px
  ansicht-umschalter-aktiv:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    rounded: '{rounded.bedienung}'
    shadow: '0 1px 2px rgba(20, 33, 61, 0.04)'
    padding: 7px 14px
  kachel-liste-umschalter:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.muted}'
    typography: '{typography.bedienung}'
    rounded: '{rounded.umschalter}'
    border: '1px solid {colors.border}'
    padding: 3px
  kachel-liste-umschalter-aktiv:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.text}'
    rounded: '{rounded.bedienung}'
    padding: 6px 12px
  pill:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.accent}'
    typography: '{typography.nebentext}'
    rounded: '{rounded.pill}'
    padding: 2px 10px
  pill-modul:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.muted}'
    typography: '{typography.schema-mono}'
    rounded: '{rounded.pill}'
    padding: 2px 10px
  pill-frei:
    backgroundColor: '{colors.frei-bg}'
    textColor: '{colors.frei-fg}'
    typography: '{typography.nebentext}'
    rounded: '{rounded.pill}'
    padding: 2px 10px
  pill-warn:
    backgroundColor: '{colors.warn-bg}'
    textColor: '{colors.warn-fg}'
    typography: '{typography.nebentext}'
    rounded: '{rounded.pill}'
    padding: 2px 10px
  pill-erweiterung:
    backgroundColor: '{colors.erweiterung-bg}'
    textColor: '{colors.erweiterung-fg}'
    typography: '{typography.nebentext}'
    rounded: '{rounded.pill}'
    padding: 2px 10px
  pill-beta:
    backgroundColor: '{colors.warn-bg}'
    textColor: '{colors.warn-fg}'
    typography: '{typography.kennzeichen}'
    rounded: '{rounded.pill}'
    padding: 2px 10px
  tag-chip:
    backgroundColor: '{colors.flaeche}'
    textColor: '{colors.text}'
    typography: '{typography.nebentext}'
    rounded: '{rounded.pill}'
    border: '1px solid {colors.border}'
    padding: 2px 10px
  tag-chip-aktiv:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.on-accent}'
    rounded: '{rounded.pill}'
    border: '1px solid {colors.accent}'
  zweig-chip:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.nebentext}'
    rounded: 12px
    border: '1px solid {colors.border}'
    padding: 2px 9px
  baum-tag:
    backgroundColor: '{colors.auswahl-bg}'
    textColor: '{colors.auswahl-fg}'
    rounded: '{rounded.pill}'
    padding: 2px 7px
    fontSize: 10.5px
    fontWeight: 550
  bibliothek-rahmen:
    backgroundColor: '{colors.bg}'
    maxWidth: 1560px
    gridColumns: '252px minmax(0, 1fr)'
  reiterleiste:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    border: '0 0 1px 0 solid {colors.border}'
    padding: 11px 28px
    maxWidth: 1560px
  sprungliste:
    backgroundColor: transparent
    textColor: '{colors.text}'
    typography: '{typography.bedienung}'
    rounded: '{rounded.bedienung}'
    padding: 6px 10px
  szenario-block:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    rounded: '{rounded.kasten}'
    border: '1px solid {colors.border}'
    shadow: '0 1px 2px rgba(20, 33, 61, 0.04)'
  kachel:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.kachelname}'
    rounded: '{rounded.kasten}'
    border: '1px solid {colors.border}'
    shadow: '0 1px 2px rgba(20, 33, 61, 0.04)'
    padding: 16px 17px
    minHeight: 252px
  kachel-active:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    rounded: '{rounded.kasten}'
    border: '1px solid {colors.border-stark}'
    shadow: '0 6px 20px rgba(20, 33, 61, 0.1)'
  modul-pill:
    backgroundColor: '{colors.flaeche}'
    textColor: '{colors.text}'
    typography: '{typography.kennzeichen}'
    rounded: '{rounded.tag}'
    padding: 2px 7px
  zustand-pill-frei:
    backgroundColor: '{colors.frei-bg}'
    textColor: '{colors.frei-fg}'
    typography: '{typography.nebentext}'
    rounded: '{rounded.pill}'
    padding: 2px 10px
  zustand-pill-geaendert:
    backgroundColor: '{colors.warn-bg}'
    textColor: '{colors.warn-fg}'
    rounded: '{rounded.pill}'
  zustand-pill-arbeit:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.text}'
    rounded: '{rounded.pill}'
  zustand-pill-leer:
    backgroundColor: '{colors.flaeche}'
    textColor: '{colors.muted}'
    rounded: '{rounded.pill}'
  meta-pill:
    backgroundColor: '{colors.flaeche}'
    textColor: '{colors.text}'
    typography: '{typography.nebentext}'
    rounded: '{rounded.bedienung}'
    padding: 2px 7px
  meta-pill-voll:
    backgroundColor: '{colors.frei-bg}'
    textColor: '{colors.frei-fg}'
    rounded: '{rounded.bedienung}'
  filterspalte:
    backgroundColor: transparent
    textColor: '{colors.text}'
    typography: '{typography.bedienung}'
    border: '0 1px 0 0 solid {colors.border}'
    width: 252px
    padding: 22px 16px 40px 28px
  filter-wert:
    backgroundColor: transparent
    textColor: '{colors.text}'
    typography: '{typography.bedienung}'
    rounded: '{rounded.bedienung}'
    padding: 6px 10px
  filter-wert-aktiv:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.text}'
    rounded: '{rounded.bedienung}'
  aktiv-chip:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.text}'
    typography: '{typography.nebentext}'
    rounded: '{rounded.pill}'
    border: '1px solid {colors.accent-soft-tief}'
    height: 27px
    padding: 0 8px 0 11px
  suchfeld-werkzeugzeile:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.bedienung}'
    rounded: '{rounded.umschalter}'
    border: '1px solid {colors.border}'
    height: 36px
    padding: 0 12px
  liste:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.bedienung}'
    rounded: '{rounded.kasten}'
    border: '1px solid {colors.border}'
    shadow: '0 1px 2px rgba(20, 33, 61, 0.04)'
  liste-zeile:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.bedienung}'
    border: '0 0 1px 0 solid {colors.trenner}'
    padding: 11px 14px
  liste-zeile-active:
    backgroundColor: '{colors.flaeche-hell}'
    textColor: '{colors.text}'
    shadow: 'inset 3px 0 0 {colors.accent}'
  fortschrittsbalken:
    backgroundColor: '{colors.signal-soft}'
    fillColor: '{colors.signal}'
    rounded: '{rounded.balken}'
    width: 42px
    height: 5px
  gruppenkopf:
    backgroundColor: transparent
    textColor: '{colors.muted}'
    typography: '{typography.nebentext}'
    padding: 0 0 8px
  kopfleiste:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.bedienung}'
    border: '0 0 1px 0 solid {colors.border}'
    padding: 7px 16px
  kopfzeile:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.bedienung}'
    border: '0 0 1px 0 solid {colors.border}'
    padding: 9px 18px
    gap: 12px
  kopfname:
    backgroundColor: transparent
    textColor: '{colors.text}'
    rounded: '{rounded.bedienung}'
    border: '1px solid transparent'
    padding: 5px 9px
    width: 300px
    fontSize: 15px
    fontWeight: 620
    letterSpacing: -0.012em
  kopfname-hover:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.text}'
    rounded: '{rounded.bedienung}'
    border: '1px solid {colors.border}'
  menu-neben:
    backgroundColor: transparent
    textColor: '{colors.muted}'
    typography: '{typography.nebentext}'
  ortzeile:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.bedienung}'
    border: '0 0 1px 0 solid {colors.border}'
    padding: 8px 18px
    gap: 10px
  nachrichtentyp:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.schema-mono}'
    rounded: '{rounded.bedienung}'
    border: '1px solid {colors.border}'
    padding: 7px 11px
    maxWidth: 420px
  suchfeld-editor:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.bedienung}'
    rounded: '{rounded.bedienung}'
    border: '1px solid {colors.border}'
    height: 34px
    padding: 0 11px
    width: 210px
  arbeitszeile:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.bedienung}'
    border: '0 0 1px 0 solid {colors.border}'
    padding: 7px 18px
    gap: 10px
  zeilentrenner:
    backgroundColor: '{colors.border}'
    width: 1px
    height: 18px
  stand:
    backgroundColor: transparent
    textColor: '{colors.muted}'
    fontSize: 12.5px
  stand-zahl:
    backgroundColor: transparent
    textColor: '{colors.text}'
    fontWeight: 650
  stand-balken:
    backgroundColor: '{colors.border}'
    fillColor: '{colors.accent}'
    rounded: '{rounded.pill}'
    width: 64px
    height: 6px
  ast-chip:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    rounded: '{rounded.pill}'
    border: '1px solid {colors.border}'
    height: 26px
    padding: 0 10px
    fontSize: 12.5px
    fontWeight: 450
  ast-chip-aktiv:
    backgroundColor: '{colors.accent-hauch}'
    textColor: '{colors.text}'
    rounded: '{rounded.pill}'
    border: '1px solid {colors.accent-soft-tief}'
    fontWeight: 600
  button-primary-klein:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.on-accent}'
    rounded: '{rounded.bedienung}'
    border: '1px solid {colors.accent}'
    padding: 6px 12px
    fontSize: 12.5px
    fontWeight: 550
  baum-kasten:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.bedienung}'
    rounded: '{rounded.kasten}'
    border: '1px solid {colors.border}'
    shadow: '0 1px 2px rgba(20, 33, 61, 0.04)'
    padding: 9px 12px 10px 15px
    width: 270px
    strip: '4px {colors.schema-pflicht}'
  baum-kasten-eltern:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    rounded: '{rounded.kasten}'
    border: '1px solid {colors.border}'
    fontWeight: 650
  baum-kasten-selected:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    rounded: '{rounded.kasten}'
    border: '1px solid {colors.accent}'
    shadow: '0 0 0 1px {colors.accent}, 0 6px 20px rgba(20, 33, 61, 0.1)'
  baum-kasten-markiert:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    rounded: '{rounded.kasten}'
    border: '1px solid {colors.signal}'
    shadow: '0 0 0 1px {colors.signal}'
  baum-kasten-kompakt:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    rounded: '{rounded.kasten}'
    border: '1px solid {colors.border}'
    padding: 6px 11px 6px 15px
    opacity: 0.75
  detailbereich:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.body}'
    rounded: '{rounded.kasten}'
    border: '1px solid {colors.border}'
    shadow: '0 12px 32px rgba(20, 33, 61, 0.14)'
    width: 394px
    margin: 12px 12px 12px 0
    padding: 16px 17px 32px
  abschnitts-label:
    backgroundColor: transparent
    textColor: '{colors.muted}'
    typography: '{typography.kennzeichen}'
    fontWeight: 650
    letterSpacing: 0.07em
  antwort-zeile:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.bedienung}'
    rounded: '{rounded.bedienung}'
    border: '1px solid {colors.border}'
    height: 32px
    padding: 0 9px 0 10px
  antwort-zeile-aktiv:
    backgroundColor: 'Statusfarbe, 12 % auf Weiß'
    textColor: '{colors.text}'
    rounded: '{rounded.bedienung}'
    border: '1px solid Statusfarbe'
    shadow: 'inset 0 0 0 1px Statusfarbe'
    fontWeight: 650
  festgelegt-karte:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.text}'
    rounded: '{rounded.kasten}'
    border: '1px solid {colors.border}'
    padding: 11px 12px
  zweig-zeile:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.bedienung}'
    rounded: '{rounded.bedienung}'
    border: '1px solid {colors.border}'
    minHeight: 32px
    padding: 6px 10px
  zweig-zeile-an:
    backgroundColor: '{colors.accent-hauch}'
    textColor: '{colors.text}'
    rounded: '{rounded.bedienung}'
    border: '1px solid {colors.accent-soft-tief}'
    fontWeight: 550
  detail-karte:
    backgroundColor: '{colors.flaeche-hell}'
    textColor: '{colors.text}'
    rounded: '{rounded.kasten}'
    border: '1px solid {colors.border}'
    padding: 12px 13px
    gap: 12px
  fusszeile:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.muted}'
    typography: '{typography.nebentext}'
    border: '1px 0 0 0 solid {colors.border}'
    padding: 6px 18px
    gap: 12px
  pfad-kruemel:
    backgroundColor: transparent
    textColor: '{colors.muted}'
    rounded: '{rounded.bedienung}'
    padding: 3px 8px
    fontSize: 12.5px
    fontWeight: 450
  pfad-kruemel-aktuell:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.text}'
    rounded: '{rounded.bedienung}'
    padding: 3px 8px
    fontWeight: 650
  hilfe-popover:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.muted}'
    rounded: '{rounded.kasten}'
    border: '1px solid {colors.border}'
    shadow: '0 12px 32px rgba(20, 33, 61, 0.14)'
    maxWidth: 390px
    padding: 14px 16px
  kbd:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.text}'
    typography: '{typography.schema-mono}'
    rounded: '{rounded.tag}'
    border: '1px solid {colors.border}'
    padding: 1px 5px
    fontSize: 10.5px
  xml-karte:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.schema-mono}'
    rounded: '{rounded.kasten}'
    border: '1px solid {colors.border}'
    shadow: '0 1px 2px rgba(20, 33, 61, 0.04)'
    maxWidth: 940px
  xml-zeile-aktiv:
    backgroundColor: '{colors.accent-hauch}'
    textColor: '{colors.text}'
    border: '0 0 0 2px solid {colors.accent}'
  menu-panel:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.bedienung}'
    rounded: '{rounded.kasten}'
    border: '1px solid {colors.border}'
    shadow: '0 12px 32px rgba(20, 33, 61, 0.14)'
    minWidth: 230px
    padding: 6px
  menu-item:
    backgroundColor: transparent
    textColor: '{colors.text}'
    typography: '{typography.bedienung}'
    rounded: '{rounded.bedienung}'
    padding: 9px 11px
  menu-item-active:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.text}'
    rounded: '{rounded.bedienung}'
  menu-kopf:
    backgroundColor: transparent
    textColor: '{colors.muted}'
    typography: '{typography.kennzeichen}'
    padding: 6px 14px 4px
  dialog:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    typography: '{typography.body}'
    rounded: '{rounded.kasten}'
    border: '1px solid {colors.border}'
    shadow: '0 10px 40px rgba(0, 0, 0, 0.2)'
    maxWidth: 560px
    backdrop: 'rgba(0, 0, 0, 0.25)'
  toast:
    backgroundColor: '{colors.preussischblau}'
    textColor: '{colors.weiss}'
    typography: '{typography.bedienung}'
    rounded: '{rounded.bedienung}'
    padding: 8px 18px
  leerer-zustand:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.muted}'
    typography: '{typography.body}'
    rounded: '{rounded.kasten}'
    border: '1px solid {colors.border}'
    padding: 52px 36px
---

## Überblick

Der XJustiz-Pfadfinder ist ein **Arbeitswerkzeug für Fachleute im elektronischen Rechtsverkehr** — profilieren, Testnachrichten erzeugen, Schemata lesen. Sein Interface liest sich wie ein ruhiges Formular: kühler Hellgrund, weiße Flächen für alles, was Inhalt trägt, und eine einzige Strukturfarbe, die Text, Auswahl und Primäraktion zugleich ist. Es gibt keine Marke, die um Aufmerksamkeit ringt; die Aufmerksamkeit gehört dem Schema.

Farbe hat in diesem System eine Arbeitsteilung, die in `styles.scss` wörtlich festgehalten ist: **Preußischblau trägt die Struktur** (Primäraktion, Auswahl, aktiver Zustand), **Orange ist das Signal** (Fokus, Fortschritt, Hervorhebung) und bleibt dadurch sparsam. Alles, was Bedeutung trägt — grün für freigegeben, bernstein für „seit Freigabe geändert" und Entwurf, violett für Schema-Erweiterungen, rot für Fehler — steht bewusst **außerhalb der Palette**: diese Farben tragen Bedeutung, keine Marke.

Die Dichte ist hoch, wie es sich für ein Werkzeug gehört, das stundenlang offen bleibt: 13px auf Bedienelementen, 12px auf Nebentext, 10px auf den Kennzeichen im Baum. Nichts ist dekorativ. Schatten erscheinen nur auf Dingen, die tatsächlich schweben — Menüs, Dialoge, das Kontextmenü — und beim Überfahren einer Kachel; Chrome, Kopfleiste und Detailbereich sind flach, getrennt durch 1px-Hairlines.

Drei Oberflächen teilen sich ein Chassis: die **Übersichten** — Profile, Testdaten, Projekte, Anleitung und Kennzahlen teilen sich den gemeinsamen Rahmen `app-bibliothek` (feste Kopfleiste mit Reitern und Schema-Suche, Filterspalte links, Kopf mit Aktionen, Werkzeugzeile mit Suche, Gliederung und Kacheln/Liste) —, der **Editor** (zweizeilige Kopfleiste, Baum aus 270px-Kästen, ziehbarer Detailbereich rechts) und die **Dialoge** (560px, ein Titel, ein Formularraster, rechtsbündige Knopfzeile). Dieselbe Schrift, dieselben Radien, dieselbe Palette — eine Sprache in drei Lautstärken.

**Kennzeichen:**

- Fünf Grundfarben; die Neutralstufen sind Preußischblau in kleinen Anteilen auf Weiß — kühl, nicht warm.
- Eine Strukturfarbe für Text _und_ Aktion — der Primärknopf ist die Textfarbe, gefüllt.
- Ein Signal (Orange) für Fokusring und Fortschrittsbalken; es steht nie auf Flächen.
- Fachliche Zustandsfarben als Fläche-plus-Textfarbe-Paare, immer in Pillen.
- Mono (`ui-monospace`) für alles, was aus dem Schema kommt: Nachrichtennamen, Pfade, Fachmodul-Kürzel, Datentypen.
- Kästen mit 1px-Rahmen, 12px Radius und einer hauchdünnen Kante — im Baum wie in der Übersicht dieselbe Form.
- Reservierte Höhen: Kachelzeilen, Zustandszeile, Fortschrittstext haben feste Mindesthöhen, damit nichts springt.
- Werkzeuge auf Abruf: ⋯-Menü statt Knopfreihen; die Kachel zeigt Inhalt, nicht Bedienung.

## Farben

> **Quelle:** `src/styles.scss` `:root` (21 Variablen) sowie die fachlichen Signalpaare in den Pillen- und Tag-Regeln. Die Werte hier sind Spiegel, nicht Original — geändert wird in `styles.scss`, die Farben-Karte des Styleguides (`?ansicht=styleguide`) zeigt den geltenden Stand.

### Grundfarben

- **Preußischblau** (`{colors.preussischblau}` — #14213d): Die eine Strukturfarbe. Text, Primäraktion, Auswahlrahmen, aktiver Modus, Toast-Grund. Was in anderen Systemen „Brand" und „Ink" getrennt hält, ist hier eins.
- **Orange** (`{colors.orange}` — #fca311): Das Signal. Fokusring auf Eingaben und Knöpfen (`outline: 2px solid`), Füllung der Fortschrittsbalken. Nie als Fläche, nie als Text.
- **Alabaster** (`{colors.alabaster}` — #e5e5e5): Grundfarbe der Palette; seit v4 nicht mehr der Seitengrund, der ist `{colors.bg}`.
- **Weiß** (`{colors.weiss}` — #ffffff): Alles, was Inhalt trägt — Kacheln, Kästen, Kopfleiste, Detailbereich, Menüs, Dialoge.
- **Schwarz** (`{colors.schwarz}` — #000000): Nur für starke Überschriften (`{colors.text-stark}`).

### Abgeleitet

- **Accent** (`{colors.accent}` — #14213d) und **Accent Hover** (`{colors.accent-hover}` — #223357): Primärknopf und sein einziger Zustandswechsel — Preußischblau leicht aufgehellt, nur für `:hover` auf gefüllten Flächen.
- **Bg** (`{colors.bg}` — #f4f5f8): Der Seitengrund — Preußischblau zu vier Prozent auf Weiß. Bewusst kein Weiß, damit weiße Flächen als Flächen lesbar sind.
- **Accent Soft** (`{colors.accent-soft}` — #e8ecf5) und **Accent Soft Tief** (`{colors.accent-soft-tief}` — #ccd5e8): Auswahl-Hintergrund, Grund der Standard-Pille, gewählter Filterwert, aktiver Umschalter, Rahmen der Filter-Chips.
- **Accent Hauch** (`{colors.accent-hauch}` — #f2f5fa): Die leiseste Stufe des Accents — aktiver Ast-Chip, aktive Zeile der XML-Darstellung, Pfad-Krümel beim Überfahren. Markiert Ort, nicht Bedeutung.
- **Signal Soft** (`{colors.signal-soft}` — #fef1db): Grund der Fortschrittsbalken, auf dem das Orange läuft.

### Neutralstufen

Preußischblau in kleinen Anteilen auf Weiß, eine Leiter von hell nach kräftig:

- **Fläche Hell** (`{colors.flaeche-hell}` — #f7f8fa): Listenkopf, Zeile beim Überfahren, Gruppenzeile der Liste.
- **Fläche** (`{colors.flaeche}` — #f0f1f4): Knopf beim Überfahren, Elternkästen im Baum, Modul-Pille, Kennzahl-Pille.
- **Fläche Tief** (`{colors.flaeche-tief}` — #e8eaef): Rahmen der Schlagwort-Chips auf der Kachel.
- **Border** (`{colors.border}` — #e4e6eb) und **Border Stark** (`{colors.border-stark}` — #c3ccdd): Der Rahmen und sein Hover — leise; die Form kommt aus der Fläche, nicht aus der Linie.
- **Trenner** (`{colors.trenner}` — #edeff3): Linien innerhalb einer Fläche (Listenzeilen, Kachelfuß) — leichter als der Rahmen darum.
- **Muted** (`{colors.muted}` — #545e70) und **Muted Schwach** (`{colors.muted-schwach}` — #8d93a1): Sekundär- und Tertiärtext — Datum, Zähler, Gruppenköpfe, Untertitel, Achsentitel.

### Fachliche Signalfarben

Außerhalb der Palette, weil sie Zustände bedeuten, nicht Marke. Immer als Paar aus Fläche und Textfarbe, immer in einer Pille oder einem Tag. Seit design.md liegen sie als Tokens in `:root` (`--frei-bg`, `--frei-fg`, …) statt als lose Hex-Werte in den Regeln:

- **Frei** (`{colors.frei-bg}` / `{colors.frei-fg}` — #ddf3e4 / #17693c): freigegeben durch die BLK-AG, gültige Testnachricht, AG-Rolle aktiv.
- **Warn** (`{colors.warn-bg}` / `{colors.warn-fg}` — #fdeecd / #9a6a00): seit Freigabe geändert, Entwurf, BETA-Kennzeichen.
- **Erweiterung** (`{colors.erweiterung-bg}` / `{colors.erweiterung-fg}` — #efedfb / #5a50c0): nachzubeauftragende Elemente außerhalb des Schemas; auch der Sperrgrund im Menü.
- **Fehler** (`{colors.fehler-bg}` / `{colors.fehler-fg}` — #f9e9e9 / #b23a3a): Löschen beim Überfahren, fehlender Datentyp, Typfehler-Tag.
- **Belegt** (`{colors.belegt-bg}` — #f0f9f2): Blätter mit eigenem Testwert im Nachrichten-Modus.
- **Auswahl** (`{colors.auswahl-bg}` / `{colors.auswahl-fg}` — #f1eaf8 / #7a4fa3): Choice-Tag im Baum — Stellvertreter der rund zwanzig Tag-Varianten, die je eine eigene Fläche tragen.
- **Verweis** (`{colors.verweis-bg}` / `{colors.verweis-fg}` — #fbeaf0 / #993556): Verweis-Tag am Baumkasten und die Verweislinien im Baum — Rosé, damit die Querbezüge sich von Struktur- und Statusfarben abheben.
- **Schema-Pflicht** (`{colors.schema-pflicht}` — #a9dcc9): Statusstreifen am Baumkasten für Elemente, die das Schema verlangt, zu denen die Profilierung aber keine eigene Antwort trägt — gedämpftes Grün, damit es sich von den frei wählbaren Statusfarben absetzt.
- **XML-Wert** (`{colors.xml-wert}` — #0f6e56): Werte in der XML-Darstellung (Petrol) — hebt den Inhalt vom Tag ab.

### Verläufe

**Keine.** Tiefe entsteht durch Flächenwechsel (Alabaster → Weiß) und durch die wenigen Schatten auf Schwebendem. Es gibt kein Verlaufs-Token und keinen Ort, an dem eines fehlen würde.

## Typografie

### Schriftfamilie

- **Interface**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` — die Systemschrift des Betriebssystems, keine Webfont-Abhängigkeit. Auf macOS SF Pro, auf Windows Segoe UI.
- **Schema**: `ui-monospace, 'SF Mono', Consolas, monospace` (`--mono`) — für alles, was aus dem XSD kommt: Nachrichtennamen (`nachricht.zvstr.…`), Pfade, Fachmodul-Kürzel, Datentypen, Kardinalitäten. Mono heißt „das steht so im Schema".
- **Zahlen**: `font-variant-numeric: tabular-nums` auf Zählern und Datumsangaben.

### Hierarchie

| Token                          | Größe | Gewicht | Zeilenhöhe | Verwendung                                         |
| ------------------------------ | ----- | ------- | ---------- | -------------------------------------------------- |
| `{typography.leer-symbol}`     | 40px  | 400     | 1.2        | Symbol im leeren Zustand (`§ ⇄ </>`)               |
| `{typography.seitentitel}`     | 24px  | 650     | 1.2        | Titel der Übersichten, Spationierung −0.02em       |
| `{typography.kachelname}`      | 15px  | 600     | 1.3        | Name auf der Kachel, Elementname im Detail         |
| `{typography.body}`            | 14px  | 400     | 1.45       | Grundschrift, Fließtext, Dialoge                   |
| `{typography.bedienung-stark}` | 13px  | 600     | 1.45       | Objektname in der Kopfleiste                       |
| `{typography.bedienung}`       | 13px  | 400     | 1.45       | Knöpfe, Eingaben, Menüeinträge, Toast, Filter      |
| `{typography.nebentext}`       | 12px  | 400     | 1.4        | Pillen, Chips, Datum, Zähler, Gruppenköpfe, Notiz  |
| `{typography.schema-mono}`     | 12px  | 400     | 1.45       | Nachrichtenname auf der Kachel, Pfade, Modul-Pille |
| `{typography.kennzeichen}`     | 11px  | 700     | 1.3        | BETA, Menüköpfe (uppercase, 0.02–0.06em)           |
| `{typography.baum-tag}`        | 10px  | 600     | 1.4        | Kennzeichen am Baumknoten                          |

### Grundsätze

- **14 ist die Mitte, 13 ist die Bedienung.** Fließtext läuft auf 14px, jedes Bedienelement auf 13px. Der eine Pixel Unterschied ist die Grenze zwischen Lesen und Bedienen.
- **Kein Letter-Spacing auf Text.** Nur Versalien-Kennzeichen (BETA, Menüköpfe) tragen 0.02–0.06em.
- **Gewichte: 400 / 600 / 650 / 700.** 600 ist die Hervorhebung, 650 der Seitentitel, 700 nur für Versalien-Kennzeichen. 500 kommt im Baum-Mini-Kasten vor, sonst nicht.
- **Mono ist Bedeutung.** Was mono gesetzt ist, stammt aus dem Schema und wird nicht übersetzt.
- **Halbe Pixel sind Drift.** 12.5px (Reiter, Home-Knopf), 11.5px (Datum, Zweig-Chip) und 10.5px existieren im Bestand, sind aber keine Stufen der Leiter — siehe Bekannte Lücken.

### Hinweis zu Ersatzschriften

Das System hat keine eigene Schrift; es nimmt, was das Betriebssystem bietet. In Claude Design und in Screenshots von macOS erscheint SF Pro, unter Windows Segoe UI. Wer eine feste Schrift braucht (Druck, Präsentation): **Inter** liegt am nächsten; Zeilenhöhe dann von 1.45 auf 1.4 senken, Inter hat die größere x-Höhe.

## Layout

### Abstandssystem

- **Grundeinheit:** 2px-Raster mit bevorzugten Stufen 4 / 6 / 8 / 10 / 14 / 16 / 20 / 28.
- **Tokens:** `{spacing.xxs}` 4px · `{spacing.xs}` 6px · `{spacing.sm}` 8px · `{spacing.md}` 10px · `{spacing.lg}` 14px · `{spacing.xl}` 16px · `{spacing.xxl}` 20px · `{spacing.seite}` 28px.
- **Seitenrand der Übersichten:** 26px oben, `{spacing.seite}` (28px) seitlich.
- **Kachel innen:** 12px × 14px, Zeilenabstand `{spacing.xs}` (6px); Kachelraster mit `{spacing.lg}` (14px) Lücke.
- **Kopfleiste:** 7px × 16px, Zonenabstand `{spacing.md}` (10px), innerhalb einer Zone 6px.
- **Detailbereich:** `{spacing.xl}` (16px) innen.
- **Knopf:** 6px × 12px; Eingabe 6px × 8px; Menüeintrag 7px × 14px; Pille 2px × 10px.

### Raster & Container

- **Bibliothek-Rahmen** (`app-bibliothek`, alle fünf Übersichten): oben eine **feste Kopfleiste** (Reiter, Schema-Suche, Badges) auf einer bei 1560px zentrierten Spur; darunter ein Grid aus **Filterspalte** (252px, eigene Scrollfläche, rechts durch eine Haarlinie abgesetzt) und **Inhalt** (`.dashMain`, eigene Scrollfläche) — der Rahmen selbst rollt nicht, nur seine beiden Spalten tun es unabhängig voneinander. Ohne Filterspalte (Anleitung, Kennzahlen) nimmt der Inhalt die volle Breite ein.
- **Maximale Inhaltsbreite:** 1120px für Kopf und Kacheln der einspaltigen Übersichten (Anleitung, Kennzahlen) — zentriert innerhalb von `.dashMain`. Profile, Testdaten und Projekte haben neben der Filterspalte keine eigene Höchstbreite; ihr Kachelraster und ihre Liste nutzen die volle Breite von `.dashMain`.
- **Kachelraster:** `repeat(auto-fill, minmax(298px, 1fr))`, Lücke 13px. Alle Kacheln einer Zeile gleich hoch, Mindesthöhe 150px.
- **Editor:** Kopfleiste (zwei Zeilen, feste Höhe) · Baumfläche (scrollend) · Detailbereich `clamp(340px, 28%, 560px)`, per Griff ziehbar, einklappbar auf einen Streifen.
- **Baum:** Kästen fest 270px breit, 7px Abstand untereinander; Verbindungen als SVG-Linien aus DOM-Maßen.

### Umgang mit Weißraum

Der Weißraum ist knapp und berechnet, nicht großzügig: das Werkzeug soll bei 900px Fensterbreite neben einer anderen Anwendung arbeiten. Luft gibt es dort, wo sie Orientierung schafft — 26px über der Übersicht, 60px um den leeren Zustand, 22px zwischen Fachmodul-Gruppen — und nirgends sonst. Die Kopfzone bricht **nie um**; sie gibt in fester Reihenfolge nach (Felder schrumpfen → Beschriftungen weichen Kurzformen → selten Genutztes ins Überlauf-Menü).

## Erhebung & Tiefe

| Stufe        | Behandlung                                                          | Verwendung                                            |
| ------------ | ------------------------------------------------------------------- | ----------------------------------------------------- |
| Flach        | Kein Schatten, 1px `{colors.border}` Hairline                       | Reiterleiste, Kopfleiste, Detailbereich, Filterspalte |
| Kasten       | 1px `{colors.border}` + `0 1px 2px rgba(20, 33, 61, 0.04)`          | Kacheln, Liste, leerer Zustand, aktiver Reiter        |
| Kasten aktiv | Rahmen `{colors.border-stark}` + `0 6px 20px rgba(20, 33, 61, 0.1)` | Kachel beim Überfahren                                |
| Schwebend    | `0 12px 32px rgba(20, 33, 61, 0.14)`                                | Menüs, Nachrichtenwahl, Suchpanel                     |
| Modal        | `0 10px 40px rgba(0, 0, 0, 0.2)` + Backdrop `rgba(0, 0, 0, 0.25)`   | Dialoge                                               |
| Auswahl      | `2.5px solid {colors.accent}` bzw. `inset 3px 0 0 {colors.accent}`  | Gewählter Baumkasten, Listenzeile beim Überfahren     |

**Schattenphilosophie.** Ein Schatten bedeutet „das liegt über dem Rest": Menüs, Panels, Dialoge. Kästen tragen eine hauchdünne Kante (0 1px 2px), die sie vom Grund löst, ohne zu schweben; der Hover-Schatten der Kachel sagt „hier kann geklickt werden". Chrome — Reiterleiste, Kopfleiste, Detailbereich, Filterspalte — hat nie einen Schatten; die Trennung kommt aus der Hairline. Alle Schatten sind blaustichig (`rgba(20, 33, 61, …)`), nie neutralgrau.

### Dekorative Tiefe

- **Flächenwechsel** Alabaster → Weiß trennt Grund von Inhalt; das ist die ganze Tiefe der Übersichten.
- **Elternkästen** im Baum liegen auf `{colors.flaeche}`, Blätter auf Weiß — die Baumstruktur ist im Flächenton lesbar.
- **Backdrop** nur unter Dialogen; kein Blur.

## Formen

### Radienskala

| Token                  | Wert  | Verwendung                                                                 |
| ---------------------- | ----- | -------------------------------------------------------------------------- |
| `{rounded.balken}`     | 3px   | Fortschrittsbalken                                                         |
| `{rounded.tag}`        | 4px   | Kennzeichen am Baumknoten, Modul-Pille, Filter-Kästchen                    |
| `{rounded.bedienung}`  | 8px   | Knöpfe, Eingaben, Select, Menüeinträge, Filterwerte, Toast, Kennzahl-Pille |
| `{rounded.umschalter}` | 10px  | Reiter- und Ansicht-Umschalter, Suchfeld und Select der Werkzeugzeile      |
| `{rounded.kasten}`     | 12px  | Kacheln, Baumkästen, Liste, Menüs, Dialoge, leerer Zustand                 |
| `{rounded.pill}`       | 999px | Pillen, Schlagwort-Chips, Filter-Chips, Bereichs-Chips der Matrix          |

Drei Familien: **Bedienung** (8–10), **Kasten** (12), **Pille** (999). Die Werte liegen als `--rund-*` in `:root`; kein Radius steht mehr als Zahl in einer Regel.

### Bildgeometrie

Das System zeigt keine Bilder außer in der Anleitung (Bildschirmfotos, Vollfenster, unter `public/howto/`). Diese liegen in einer breiteren Spalte als der Text, ohne Rahmen, mit Lupe zum Vergrößern. Kein Radius auf Bildern.

## Komponenten

### Kopfzone

**`kopfleiste`** — Die Grundform jeder Leiste über dem Editor. Grund `{colors.panel}`, 1px `{colors.border}` unten, Flex-Reihe, **bricht nie um**. Seit Editor v4 liegen darüber drei Zeilen, jede mit genau einer Frage: `{component.kopfzeile}` „was bearbeite ich", `{component.ortzeile}` „wo bin ich", `{component.arbeitszeile}` „wie arbeite ich und wie weit bin ich".

**`kopfzeile`** — Zeile 1. 9px × 18px innen, 12px Lücke: zurück (`homeBtn`) · Identität · Spacer · Zustand als Pille · Primäraktion · ⋯. Alle Werkzeuge des Objekts liegen im **⋯-Menü**; die Zeile sieht damit bei jeder Fensterbreite gleich aus, ein Überlauf entfällt.

**`kopfname`** — Der Szenario-Name **ist** das Eingabefeld: 15px / 620 / −0.012em, im Ruhezustand rahmen- und grundlos, damit er als Titel liest; beim Überfahren und im Fokus `{component.kopfname-hover}`. Negativer linker Außenabstand (−9px) hält den Text auf der Fluchtlinie, obwohl das Feld Polster hat.

**`menu-neben`** — Nebenhinweis eines Menüeintrags, rechtsbündig in `{colors.muted}` (`{typography.nebentext}`): „Name, Beteiligte", „XJustiz 3.6.2", „4 offen". Er beantwortet die Rückfrage zum Eintrag, trägt aber nie die Aussage. Passt das Paar nicht in die Panel-Breite, rutscht der Hinweis als Ganzes in die zweite Zeile.

**`ortzeile`** — Zeile 2. 8px × 18px innen: `{component.nachrichtentyp}` · Spacer · `{component.suchfeld-editor}` · `{component.darstellung-segment}` (Baum | XML). Das Suchfeld gibt als Erstes nach, der Nachrichtenname kürzt mit Ellipsis.

**`nachrichtentyp`** — Der Nachrichtenname als Knopf in `{typography.schema-mono}` (12px), max. 420px. Mono, weil er ein technischer Bezeichner ist, und in der Ort-Zeile, weil er die Wurzel des Pfads ist — kein Titel und keine Aktion.

**`arbeitszeile`** — Zeile 3. 7px × 18px innen: `{component.modus-segment}` · `{component.zeilentrenner}` · `{component.stand}` · Trenner · `{component.ast-chip}`-Kette · Spacer · Ansicht ▾ · `{component.button-primary-klein}` „Nächstes offenes Feld ›".

**`stand`** — Die eine Zahl, die bei jeder Breite stehen bleibt: „**37** von 214 eigens beantwortet" (`{component.stand-zahl}`, tabellarische Ziffern) plus `{component.stand-balken}` (64 × 6). Unter 1040px kürzt die Beschriftung auf „37 / 214"; die Zahl selbst verschwindet nie.

**`ast-chip`** — Ein Abschnitt der Nachricht als Pille mit Zähler „12/31". Aktiv (die Auswahl steht unter diesem Ast): `{component.ast-chip-aktiv}`. Der Zähler ist Beiwerk in `{colors.muted}`, bis der Ast vollständig ist — dann wird er `{colors.frei-fg}` / 600 und trägt die Aussage. Unter 1240px weicht die Kette dem Menü „Abschnitte ▾", das dieselben Zeilen mit einem Balken je Ast zeigt.

**`ansicht-umschalter`** — Reiter der Übersichten (Projekte · Profile · Testdaten · Anleitung · Kennzahlen) in der weißen Reiterleiste. Segmentgruppe auf `{colors.bg}` mit `{rounded.umschalter}` und 3px Innenabstand, rahmenlose Knöpfe 7px × 14px in `{typography.bedienung}`, Text `{colors.muted}`. Aktiv: `{component.ansicht-umschalter-aktiv}` — weiß, Text `{colors.text}`, Gewicht 600, Kante `0 1px 2px`, nicht klickbar.

**`kachel-liste-umschalter`** — Kacheln | Liste in der Werkzeugzeile: dieselbe Grammatik, aber weiß mit 1px `{colors.border}`; der aktive Knopf liegt auf `{colors.accent-soft}` (`{component.kachel-liste-umschalter-aktiv}`).

**`modus-segment`** und **`darstellung-segment`** — Ansehen | Bearbeiten | Geführt in der Arbeits-Zeile und Baum | XML in der Ort-Zeile. Beide tragen seit Editor v4 die Form von `{component.ansicht-umschalter}`: Segmentgruppe auf `{colors.bg}` mit `{rounded.umschalter}` und 3px Innenabstand, aktiv weiß mit Haarlinien-Kante und Cursor default. Dieselbe Frage — „welche von diesen wenigen Sichten" — bekommt überall dieselbe Form; die frühere gefüllte Accent-Variante des Modus-Segments entfällt.

### Knöpfe

**`button`** — Die Grundform jeder Aktion. Grund `{colors.panel}`, Text `{colors.text}` in `{typography.bedienung}` (13px), 1px `{colors.border}`, `{rounded.bedienung}` (6px), 6px × 12px innen. Beim Überfahren Grund `{colors.flaeche}`. Fokus: 2px `{colors.signal}` außen, 2px Abstand.

**`button-primary`** — Die eine Hauptaktion je Ansicht („+ Neues Profil", „Freigeben", „Übernehmen"). Grund und Rahmen `{colors.accent}`, Text `{colors.on-accent}`. Aktiv/Hover: `{component.button-primary-active}` — `{colors.accent-hover}`. Es gibt genau einen Primärknopf je Kopf und je Dialog, rechts außen.

**`button-disabled`** — Opazität 0.45, Cursor not-allowed. Gesperrte Menüeinträge tragen den Grund als `menuGrund` in `{colors.erweiterung-fg}` darunter, weil ein deaktivierter Knopf keinen Tooltip zeigt.

**`pill-btn`** — Eine Pille, die zugleich Knopf ist (Hinweise-Badge, „seit Freigabe geändert"). Rahmenlos, Pillen-Padding, beim Überfahren `brightness(0.95)`.

### Kacheln & Container

**`bibliothek-rahmen`** (`app-bibliothek`, ADR 0022 Nachtrag „Bibliothek v4") — Der gemeinsame Rahmen aller fünf Übersichten (Profile, Testdaten, Projekte, Anleitung, Kennzahlen): oben `{component.reiterleiste}`, darunter ein Grid aus `{component.filterspalte}` und Inhalt. Der Rahmen selbst rollt nicht — Kopfleiste und Filterspalte stehen, nur der Inhalt (`.dashMain`) und die Filterspalte rollen je für sich. Ohne Filterspalte (Anleitung, Kennzahlen) nimmt der Inhalt die volle Breite ein.

**`reiterleiste`** (`.dashLeiste`) — Feste Kopfleiste über dem Körper, `{colors.panel}`, 1px `{colors.border}` unten, 11px × 28px innen, bei 1560px zentriert. Drei Zonen: links das Reiter-Segment (`{component.ansicht-umschalter}`), mittig `<app-schema-suche>` (`flex: 0 1 420px`, unter 1100px `flex-basis: 260px` — die Suche gibt zuerst nach, die Reiter bleiben lesbar), rechts Beta- und Rollen-Badge.

**`kachel`** — Die Profilierung in der Übersicht. Grund `{colors.panel}`, 1px `{colors.border}`, `{rounded.kasten}` (12px), Kante `0 1px 2px`, 16px × 17px innen, Spalten-Flex mit 8px Abstand, Mindesthöhe 252px, Zeilenhöhe im Raster angeglichen; Raster `auto-fill` mit 298px Mindestbreite und 13px Lücke. Aufbau von oben: Kopfzeile (`{component.modul-pill}` · `{component.zustand-pill-frei}` bzw. `-geaendert`/`-arbeit`/`-leer` · Hinweise-Badge und Erweiterungs-Pille, wenn vorhanden · ⋯-Menüknopf, sichtbar beim Überfahren) · Name in `{typography.kachelname}`, zwei Zeilen reserviert · Nachrichtenname in `{typography.schema-mono}`, in der Mitte gekürzt · Beschreibung in zwei Zeilen, kursiv „keine Beschreibung", wenn leer · Schlagworte als `{component.tag-chip}` · Fuß, durch `{colors.trenner}` abgesetzt: Autor links, Projekt rechts, darunter `{component.meta-pill}` und Datum. Leerzustände (ohne Autor, ohne Projekt) stehen kursiv, nicht versteckt. Aktiv: `{component.kachel-active}`.

**`modul-pill`** — Fachmodul-Kürzel in Mono (11px / 600 / 0.03em), Grund `{colors.flaeche}`, `{rounded.tag}`, 2px × 7px. Steht als erstes auf jeder Kachel und in der Modul-Spalte der Liste.

**`zustand-pill-*`** — Der abgeleitete Zustand als Pille: `frei` (freigegeben), `geaendert` (seit Freigabe geändert — klickbar, öffnet den Vergleich), `arbeit` (in Arbeit), `leer`. Farbpaare wie bei den Pillen.

**`meta-pill`** — Kennzahl des Stands: „6 offen", „vollständig" (`{component.meta-pill-voll}`, grün) oder im Altbestand „31 Festlegungen". `{rounded.bedienung}`, 12px / 600, tabellarische Ziffern.

**`filterspalte`** — Linke Spalte des `{component.bibliothek-rahmen}`, 252px, eine eigene Scrollfläche (rollt unabhängig vom Inhalt, nicht sticky), rechts durch 1px `{colors.border}` abgesetzt. Kopf „Eingrenzen" in `{typography.kennzeichen}` mit „alle"-Link, sobald etwas gesetzt ist; darunter „Alle …" mit Gesamtzahl und Marke; dann die Achsen mit 22px Abstand — Profile: Fachmodule, Projekte, Schlagworte, Zustand, Rückmeldungen, XJustiz-Version; Testdaten: Fachmodule, Projekte, Profilierungen, Zustand, Schlagworte; Projekte: Schlagworte, Inhalt. Achsen kombinieren mit UND, Werte einer Achse mit ODER. Auf der Projektseite ersetzt `{component.sprungliste}` die Filterspalte.

**`filter-wert`** — Eine Zeile der Achse: Kästchen (14px, `{rounded.tag}`), Beschriftung, Zähler rechts in `{colors.muted}`. `{rounded.bedienung}`, 6px × 10px. Gewählt: `{component.filter-wert-aktiv}` auf `{colors.accent-soft}` mit gefülltem Kästchen in `{colors.accent}`. Werte ohne Treffer stehen in `{colors.muted}`, bleiben aber wählbar. Der Zähler sagt, wie viele Treffer der Klick brächte.

**`aktiv-chip`** — Gesetzte Eingrenzung über der Sammlung: Achse in `{colors.muted}`, Wert, ✕. `{rounded.pill}`, 27px hoch, Grund `{colors.accent-soft}`, Rahmen `{colors.accent-soft-tief}`. Klick entfernt genau diese Eingrenzung.

**`sprungliste`** — Ersetzt auf der Projektseite die Filterspalte: ein `{component.filter-wert}` je Szenario, aber randlos (`.fWert.ohneBox`) und ohne Kästchen, weil hier nichts aus- oder abgewählt wird. Name links, rechts der Anteil in Prozent (bzw. „—" ohne Punkte) statt eines Treffer-Zählers. Klick rollt zum Block des Szenarios in `.dashMain` — Kopfleiste, Sprungliste und Seitenkopf bleiben stehen.

**`liste`** — Die Sammlung als Tabelle: Grund `{colors.panel}`, 1px `{colors.border}`, `{rounded.kasten}`, Kante. Spalten `minmax(0, 2.6fr) 62px minmax(0, 1.1fr) minmax(0, 1fr) 64px 62px 32px` — alle Textspalten `minmax(0, …)`, damit die Liste auch bei 600px Breite vollständig bleibt. Kopf auf `{colors.flaeche-hell}` in `{typography.kennzeichen}`, klickbar sortierend mit Pfeil; Gruppenzeilen ebenfalls auf `{colors.flaeche-hell}`. `{component.liste-zeile}`: Name in 14px / 600 mit Nachrichtenname in Mono darunter, Modul-Pille, Projekt, Tags, Kennzahl, Datum, ⋯. Beim Überfahren `{component.liste-zeile-active}` mit 3px Accent-Kante links.

**`baum-kasten`** — Ein Element im Baum. Grund `{colors.panel}`, 1px `{colors.border}`, `{rounded.kasten}`, 9px 12px 10px 15px innen, fest 270px breit, Haarlinien-Kante. Links in der Fläche ein **4px-Statusstreifen** über die volle Höhe (die Rundung schneidet ihn zu): in der Farbe der eigenen Antwort, ohne eigene Antwort `{colors.schema-pflicht}` bei Pflichtelementen und `{colors.border}` sonst — der Kasten sagt damit auf einen Blick, ob hier schon entschieden wurde. Das größere linke Polster ist sein Raum. Elternknoten: `{component.baum-kasten-eltern}` — ebenfalls weiß, nur der Name in 650; die frühere graue Fläche nahm sie aus der Reihe. Gewählt: `{component.baum-kasten-selected}` — der zweite Strich kommt als **Ring** (`box-shadow`), nicht als dickerer Rahmen, damit beim Anklicken nichts springt (die SVG-Linien vermessen die Kanten). Farbig umrandet: `{component.baum-kasten-markiert}` in `{colors.signal}`, steht vor `.sel`, damit die Auswahl den Ring gewinnt. Zusammengeklappt: `{component.baum-kasten-kompakt}` (Opazität 0.75, nur Titel und Wert). Ausgeschlossen: durchgestrichener Name, Opazität 0.62. Belegte Blätter im Nachrichten-Modus auf `{colors.belegt-bg}`.

**`detailbereich`** — Rechte Spalte des Editors, seit Editor v4 eine **schwebende Karte** auf dem Seitengrund: 394px breit, 12px eingerückt, `{rounded.kasten}`, 1px `{colors.border}` und Panel-Schatten. 16px × 17px innen mit 22px zwischen den Abschnitten, per 6px-Griff ziehbar (Griff beim Ziehen `{colors.accent}` bei 50 %). Eingeklappt ein Streifen mit Aufklapp-Knopf. Reihenfolge: Krümel (die letzten zwei Stationen) · Name · ✕ · **Ihre Antwort** · **Festgelegt als** · **Erlaubte Angaben** · `{component.detail-karte}` · **Was ist das?** · **Notiz für das Team**. Unter 1040px legt sie sich als Overlay über die Kaskade — die braucht die Breite dringender.

**`gruppenkopf`** — Abschnitt je Fachmodul über dem Kachelraster: `{component.pill-modul}` (Mono, 12px) + Zähler in `{colors.muted}`, 8px unter sich, 22px über sich ab dem zweiten Abschnitt, auf derselben 1120px-Spur wie das Raster.

**`testnachricht-kachel`** und **`projekt-kachel`** — Dieselbe Form wie `{component.kachel}` (`.dashCard`), nur der Fuß trägt andere Inhalte: die Testnachricht-Kachel zweizeilig — Herkunft („aus Profil „X“") und Projekt, darunter `{component.meta-pill}` (Stand: Pflichtangaben oder Dateigröße) und Datum; die Projekt-Kachel einzeilig — „n Szenarien · m Testnachrichten" und Datum. Bewusst keine eigene Komponente je Kachelart: Kacheln teilen nur die Klassen, ihr Verhalten (Öffnen, ⋯-Menü) ist je Typ verschieden (ADR 0022 Nachtrag „Bibliothek v4").

**`szenario-block`** (`.liste.szenario`, Projektseite) — Ein Kommunikationsszenario als eigener Kasten: `{colors.panel}`, 1px `{colors.border}`, `{rounded.kasten}`, Kante `0 1px 2px`, 14px Abstand untereinander. Der Kopf (`.szenarioKopf`) liegt auf `{colors.flaeche-hell}`, 11px × 14px, durch 1px `{colors.border}` vom Rumpf abgesetzt: `{component.modul-pill}` · Name (klickbar, öffnet die Profilierung) · `{component.zustand-pill-frei}` bzw. `-geaendert`/`-arbeit`/`-leer` · Nachrichtenname in Mono · Fortschritt · Zähltext · „+ Testnachricht" · ⋯. Die Zeilen darunter (`.tmZeile`) wie `{component.liste-zeile}`, aber eingerückt (26px links) und durch `{colors.trenner}` getrennt — die Einrückung sagt „gehört zum Kopf darüber" ohne eigene Überschrift.

**`leerer-zustand`** — Eine weiße Fläche (`{rounded.kasten}`, 1px `{colors.border}`, 52px × 36px innen), zentriert: Symbol `§ ⇄ </>` in Mono 22px und `{colors.border-stark}`, Titel 15px / 600, ein Satz in `{colors.muted}`, darunter der nächste Schritt als Knopf — „+ Neues Profil" bei leerer Sammlung, „Eingrenzung zurücksetzen" ohne Treffer.

### Pillen & Chips

**`pill`** — Grund `{colors.accent-soft}`, Text `{colors.accent}`, `{typography.nebentext}`, `{rounded.pill}`, 2px × 10px. Varianten tauschen nur das Farbpaar:

- `{component.pill-modul}` — Fachmodul-Kürzel: Grund `{colors.bg}`, Text `{colors.muted}`, Mono.
- `{component.pill-frei}` — „✔ freigegeben", „BLK-AG", gültige Testnachricht.
- `{component.pill-warn}` — „⚠ seit Freigabe geändert", „Entwurf".
- `{component.pill-erweiterung}` — „2 Erw.".
- `{component.pill-beta}` — BETA in `{typography.kennzeichen}`, steht in jeder Kopfzeile neben der Rolle.

**`tag-chip`** — Schlagwort. Grund `{colors.flaeche}`, Text `{colors.text}`, 1px `{colors.border}`, `{rounded.pill}`, 2px × 10px; auf der Kachel 1px × 8px. Derselbe Chip in Filterleiste, Kachel und Eingabefeld — ein Schlagwort sieht überall gleich aus. Gewählt: `{component.tag-chip-aktiv}` — Grund und Rahmen `{colors.accent}`, Text `{colors.on-accent}` („dieselbe Farbe wie die Primäraktion, damit klar ist, warum die Übersicht weniger zeigt"). Zähler daneben als `tagChipN` mit Opazität 0.65.

**`zweig-chip`** — Zweigwahl im geführten Modus. Grund `{colors.panel}`, 1px `{colors.border}`, Radius 12px, 11.5px; beim Überfahren Rahmen und Text `{colors.accent}`.

**`baum-tag`** — Kennzeichen am Element: `{typography.baum-tag}` (10px / 600), `{rounded.tag}` (4px), 0 × 5px. Rund zwanzig Varianten (`t-choice`, `t-wert`, `t-ref`, `t-ext`, `t-hint`, `t-mand`, `t-lock`, …), jede mit eigenem Fläche-Text-Paar; `t-typerr` mit `inset 0 0 0 1px {colors.fehler-fg}`.

### Detail, Fuß und XML

**`abschnitts-label`** — Der Titel eines Abschnitts im Detailbereich: `{typography.kennzeichen}` in Versalien, 650, 0.07em, `{colors.muted}`, 5px Luft nach unten. Ein `<span>`, kein `<label>` — die meisten Abschnitte tragen kein einzelnes Formularfeld.

**`antwort-zeile`** — Das meistbenutzte Bedienelement der Seite: eine Zeile je Antwort, 32px hoch — Punkt · Name · Taste (`{component.kbd}`-artig, 10px Mono). Ohne Erklärtext; der steht im Tooltip und in der Hilfe der Fußzeile, ausgeschrieben machten die vier Sätze den Block viermal so hoch. Gewählt: `{component.antwort-zeile-aktiv}` — Rahmen und Innenring in der **Statusfarbe der Profilierung**, Fläche dieselbe Farbe zu 12 % auf Weiß (`color-mix`, Rückfall Alpha-Hex). Die Statusfarben kommen aus dem Dokument, nicht aus der Palette: sie sind Daten. Die Liste löst den früheren Status-Streifen **und** die vier Dispositions-Knöpfe des geführten Modus ab — eine Quelle.

**`festgelegt-karte`** — Dieselbe Aussage ohne Bedienelemente (freigegebene Fassung, Betrachten-Modus): Punkt in der Statusfarbe, Name in 13.5px / 650, darunter der Klartext der Wirkung aus `profile-defaults.ts`. Grund `{colors.accent-soft}`, `{rounded.kasten}`.

**`zweig-zeile`** — Eine Alternative einer Auswahl (`xs:choice`): Kästchen · Name, 32px hoch. Angehakt (`{component.zweig-zeile-an}`) heißt „im Szenario zulässig".

**`detail-karte`** — Was zusammen gelesen wird, steht zusammen in einer Fläche: Kardinalität, Beispielwert und — durch eine Linie abgesetzt — der technische Name als Fußnote. Grund `{colors.flaeche-hell}` auf dem weißen Panel, `{rounded.kasten}`, 12px × 13px.

**`fusszeile`** — Eine Zeile hoch, drei Fragen: wo genau stehe ich (der volle Pfad) · ist mein Stand gesichert · was bedeutet das alles. Grund `{colors.panel}`, 1px `{colors.border}` oben, 6px × 18px. Sie ersetzt die frühere Legende: die Erklärungen liegen im Hilfe-Menü und kosten dem Baum keine Höhe mehr.

**`pfad-kruemel`** — Der Pfad **ungekürzt**; er bekommt den ganzen Rest der Zeile und rollt waagerecht, statt Stationen zu verschlucken — im Workshop wird an ihm entlanggezeigt. Glied: `{rounded.bedienung}`, 3px × 8px, `{colors.muted}`, beim Überfahren `{colors.accent-hauch}`. Das aktuelle Glied (`{component.pfad-kruemel-aktuell}`) steht auf `{colors.accent-soft}` in 650 — keine Vollfarbe mehr, es soll die lange Kette nicht überstrahlen.

**`hilfe-popover`** — Das einzige Menü mit Fließtext, 390px breit, öffnet **nach oben** (der Knopf sitzt am unteren Rand). Drei Abschnitte, durch je eine Linie getrennt: „Die Antworten bedeuten" (Punkt in der Statusfarbe, Name, Klartext der Wirkung, Taste), „Schneller mit der Tastatur" (modusabhängig), „Kennzeichen im Baum" (Tags als sie selbst, nicht als Beschreibung).

**`kbd`** — Eine Taste im Text: Mono 10.5px, 1px `{colors.border}`, `{rounded.tag}`, Grund `{colors.bg}`, 1px × 5px.

**`xml-karte`** — Dieselbe Nachricht in der Form, in der sie die Leitung verlässt: eine zentrierte Karte (max. 940px) auf dem Seitengrund, kein randloser Texteditor — sie ist ein Ergebnis, das man ansieht, nicht eine Fläche, in der man tippt. Kopf und Fuß auf `{colors.flaeche-hell}`, dazwischen die Zeilen mit Nummernspalte (34px, rechtsbündig, `{colors.muted-schwach}`) und dem Code in Mono 12.5px / 1.7. Vier Farben trägt der Code: Tag `{colors.erweiterung-fg}`, Wert `{colors.xml-wert}`, Attribut und Attributwert `{colors.muted}`, Deklaration und Kommentar `{colors.muted-schwach}`. Die Zeile des ausgewählten Elements ist `{component.xml-zeile-aktiv}` und klickbar — sie führt zurück in den Baum. Der Fuß nennt die Bilanz und ausdrücklich, was **nicht** drinsteht.

### Menüs

**`menu-panel`** — Grund `{colors.panel}`, 1px `{colors.border}`, `{rounded.kasten}` (12px), Schatten schwebend (blaustichig), min. 230px, max. 320px, 6px innen, fix am Viewport unter seinem Knopf. Klick auf den Backdrop schließt.

**`menu-item`** — Volle Breite, linksbündig, 9px × 11px, `{typography.bedienung}`, `{rounded.bedienung}`. Aktiv: `{component.menu-item-active}` auf `{colors.bg}`. Deaktiviert: Opazität 0.45 plus `menuGrund` (11px, `{colors.erweiterung-fg}`) mit dem Grund im Klartext. Löschen (`.del`) beim Überfahren auf `{colors.fehler-bg}` / `{colors.fehler-fg}`. Checkbox-Einträge als `label.menuItem` mit 8px Abstand. Trenner `menuSep` 1px `{colors.border}`, 4px Luft.

**`menu-kopf`** — Abschnittstitel im Menü: `{typography.kennzeichen}` in `{colors.muted}`, uppercase, 6px × 14px.

### Eingaben & Formulare

**`eingabe`** — Eine Formensprache für Text, Suche, Passwort, Textarea und Select: `{typography.bedienung}` (13px), 1px `{colors.border}`, `{rounded.bedienung}`, 6px × 8px, Grund `{colors.panel}`. Fokus: `{component.eingabe-focus}` — 2px `{colors.signal}` außen, Rahmen `{colors.accent}`. Suchfelder ohne Browser-Aussehen (`appearance: none`).

**`suchfeld`** — Dasselbe Feld, 280–420px breit, `flex: 1` in der Aktionszeile.

**Formularraster** (`metaGrid`) — zwei Spalten `110px 1fr`, 8px Lücke, Beschriftung links, Feld rechts. Jeder Dialog benutzt es.

**`dialog`** — Natives `<dialog>`: `{rounded.panel}`, 1px `{colors.border}`, Schatten modal, max. 560px bei 90vw, Backdrop `rgba(0, 0, 0, 0.25)`. Aufbau: `h3` ohne Oberabstand · Untertitel in `{colors.muted}` · Formularraster · rechtsbündige Knopfzeile mit 12px Oberabstand, Primärknopf rechts außen.

### Rückmeldung

**`toast`** — Unten mittig, fix. Grund `{colors.preussischblau}`, Text `{colors.weiss}`, `{typography.bedienung}`, `{rounded.umschalter}`, 8px × 18px, blendet über 0.3s ein und aus, nimmt keine Klicks.

**`fortschrittsbalken`** — 42px × 5px (Kachel) bzw. 46px × 5px (Kopfleiste), `{rounded.balken}`, Grund `{colors.signal-soft}`, Füllung `{colors.signal}`. Erscheint nur, wenn der Nenner bekannt ist — „ohne Nenner wäre jeder Balken geraten".

## Dos und Don'ts

### Do

- `{colors.accent}` für Primäraktion, Auswahl und aktiven Zustand — und dieselbe Farbe für Text. Es gibt keine zweite Strukturfarbe.
- `{colors.signal}` nur für Fokusring und Fortschritt. Orange auf einer Fläche ist ein Fehler.
- Fachliche Zustände immer als Fläche-plus-Text-Paar in einer Pille (`{component.pill-frei}`, `{component.pill-warn}`, …), nie als Textfarbe allein.
- Mono für alles aus dem Schema; Systemschrift für alles, was das Werkzeug selbst sagt.
- Höhen reservieren, wo Inhalt wechselt: Kachelname 2.6em, Zustandszeile 22px, Zustandstext in der Kopfleiste mit fester Breite.
- Werkzeuge ins ⋯-Menü, wenn es mehr als zwei sind. Die Kachel zeigt Inhalt.
- Namen vollständig zeigen, nie kürzen — am Namen wird ein Objekt gefunden. Gekürzt wird der Nachrichtenname, und zwar in der Mitte.
- Gesperrte Aktionen erklären: `menuGrund` im Klartext, nicht nur ein Tooltip.
- `display: none` statt `visibility: hidden` für ausgeblendete Kurzformen (ADR 0011) — der Screenreader darf keine zweite, identische Aktion vorlesen.

### Don't

- Keine zweite Akzentfarbe, kein Blau neben dem Preußischblau.
- Keine Schatten auf Kopfzone, Fußzeile oder Reitern. Kacheln, Baumkästen und die XML-Karte tragen eine Haarlinien-Kante (`0 1px 2px`), Schwebendes (Menü, Dialog, Detailkarte) den Panel-Schatten.
- Keine Verläufe, kein Blur.
- Keine neuen Grautöne als Hex — jede Neutralstufe ist aus Alabaster verrechnet und steht in `:root`.
- Keine halben Pixel bei neuen Schriftgrößen; die Leiter ist 10 / 11 / 12 / 13 / 14 / 15 / 20 / 40.
- Keine Radien zwischen den Familien (Bedienung 6–8, Kasten 9–10, Pille 999).
- Kein Umbruch der Kopfzone — sie gibt nach, sie bricht nicht.
- Keine Knopfreihen auf Kacheln.

## Responsives Verhalten

### Breakpoints

| Name            | Breite      | Änderungen                                                                                                                                                                                    |
| --------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bibliothek-Kopf | ≤ 1100px    | Die Schema-Suche der `{component.reiterleiste}` gibt zuerst nach (`flex-basis` 420px → 260px) — die Reiter bleiben lesbar                                                                     |
| Halbes Fenster  | 900–1040px  | `{component.stand}` kürzt auf „37 / 214", der Sicherungsstand der Fußzeile entfällt, `{component.detailbereich}` legt sich als Overlay über die Kaskade (die Fläche hält den Platz frei)      |
| Eng             | 1040–1240px | Die `{component.ast-chip}`-Kette weicht dem Menü „Abschnitte ▾" — sie wächst mit der Zahl der Äste, das Menü nicht                                                                            |
| Schmal          | 1240–1280px | Das Ansichtsmenü trägt nur noch sein Zeichen (`.lbl-lang` → `.lbl-kurz`), Kopfzonen-Innenabstand 12px, Lücken 8px bzw. 6px                                                                    |
| Laptop          | 1280–1680px | Volle Kopfzone; Zielkorridor des Werkzeugs                                                                                                                                                    |
| Breit           | ≥ 1680px    | `{component.bibliothek-rahmen}` bleibt auf 1560px zentriert; einspaltige Übersichten (Anleitung, Kennzahlen) zentrieren ihren Inhalt zusätzlich auf 1120px; der Editor nutzt die volle Breite |

Dazu zwei Zustandsabfragen: `(hover: none)` macht den ⋯-Knopf der Kachel dauerhaft sichtbar (Tablet); `print` liefert das Druckdokument des Baums.

### Zielgeräte

Desktop und Laptop, halbes Fenster neben einer anderen Anwendung als Untergrenze. Kein Telefon-Layout — unter 900px ist das Werkzeug nicht vorgesehen und wird nicht optimiert. Tablet wird durch `(hover: none)` berücksichtigt, nicht durch eigene Breakpoints.

### Nachgeben statt Umbrechen

- **Kopfzone**: drei Zeilen bei jeder Breite. Reihenfolge des Nachgebens: das Suchfeld schrumpft → der Nachrichtenname kürzt mit Ellipsis → die Ast-Chips werden zum Menü → die Stand-Beschriftung kürzt. Ein Überlauf-Menü braucht es nicht mehr: alle Werkzeuge des Objekts stehen ohnehin im ⋯-Menü der Kopfzeile.
- **Kachelraster**: `auto-fill` mit 298px Mindestbreite; die Spaltenzahl folgt der Breite.
- **Detailbereich**: 394px, ziehbar (min. 340px); auf einen Streifen einklappbar; unter 1040px Overlay.
- **Pfad in der Fußzeile**: rollt waagerecht, statt Stationen auszulassen — die Kette bleibt vollständig.

## Iterationsleitfaden

1. **Quelle ist `src/styles.scss`**, nicht diese Datei. Token ändern → `npm run design:bundle` → Sync; design.md danach nachziehen. Die Farben-Karte des Styleguides zeigt den geltenden Stand.
2. Eine Komponente je Änderung, adressiert über ihren YAML-Schlüssel (`{component.kachel}`, `{component.menu-panel}`).
3. Varianten (`-aktiv`, `-active`, `-selected`, `-eltern`) sind eigene Einträge unter `components:`.
4. Überall `{token.refs}`, nie Hex inline — auch in Canvas-Entwürfen. Eine fehlende Neutralstufe wird als Token angelegt, nicht als Wert erfunden.
5. Hover nicht dokumentieren, außer er trägt Funktion (⋯-Knopf der Kachel, Griff des Detailbereichs). Default und Aktiv genügen.
6. Schatten nur auf Schwebendem. Wer Tiefe braucht, wechselt zuerst die Fläche (Alabaster ↔ Weiß).
7. Neue Bausteine bekommen eine Karte im Styleguide (`<section data-ds-card>`), keine handgeschriebene HTML-Datei (ADR 0022).

## Bekannte Lücken

- **Halbe Schriftgrößen:** 12.5px (Reiter, Home-Knopf), 11.5px (Datum, Zweig-Chip, Mini-Kasten) und 10.5px kommen im Bestand vor. Sie sind Drift, keine Stufen; eine Bereinigung auf die Leiter steht aus.
- **Kein dunkles Thema.** Es gibt keine `prefers-color-scheme`-Ableitung; das System ist hell.
- **Baum-Tags:** rund zwanzig Fläche-Text-Paare in `styles.scss`, hier nur durch `{colors.auswahl-bg}` / `{colors.auswahl-fg}` vertreten. Die vollständige Liste zeigt die Karte „Baum-Tags" des Styleguides.
- **v4 auf allen fünf Übersichten und dem Editor:** gemeinsamer Rahmen `{component.bibliothek-rahmen}` mit `{component.reiterleiste}` und `{component.filterspalte}` (bzw. `{component.sprungliste}` auf der Projektseite), Werkzeugzeile, Liste, Kachel-Varianten (`{component.kachel}`, testnachricht-kachel, projekt-kachel), `{component.szenario-block}` — und im Editor Kopfzone, Baum-Kasten, Detailbereich, Fußzeile und XML-Darstellung.
- **Typografie, Radien und Abstände** sind Stufen in dieser Datei und Karten im Styleguide, aber keine CSS-Variablen — `styles.scss` trägt die Werte noch als Zahlen in den Regeln. Abstände und Schriftgrößen der neuen Editor-Bausteine sind entsprechend Zahlen, keine Tokens.
- **Statusfarben sind Daten, keine Tokens:** die Farbe einer Antwort steht im Profil-Dokument (`profile-defaults.ts`), nicht in `:root`. Antwort-Zeile, Statusstreifen und Hilfe-Punkte bekommen sie als Inline-Wert; die Karten des Styleguides zeigen sie stellvertretend mit `{colors.frei-fg}` und Verwandten.
- **Toast** fehlt weiterhin als Karte im Spiegel (Id-Kollision mit der globalen Instanz), ebenso der Grundlage-Dialog und die Dialoge insgesamt.
