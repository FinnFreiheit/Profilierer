import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Ein Farb-Token aus `:root` mit dem Wert, der zur Laufzeit wirklich gilt. */
interface FarbToken {
  name: string;
  wert: string;
  /** Wozu die Farbe dient — nach design.md. */
  rolle: string;
}

interface FarbGruppe {
  gruppe: string;
  tokens: FarbToken[];
}

/**
 * Die Farb-Tokens der App (styles.scss `:root`, Gliederung wie in design.md).
 * Die Namen stehen hier fest, weil ein Stylesheet seine Variablen nicht
 * aufzaehlen kann; die Werte kommen zur Laufzeit aus dem Stylesheet — die
 * Karte zeigt, was gilt, nicht was hier steht. Aendert sich `:root`, muss
 * diese Liste nachziehen (und design.md).
 */
const FARB_TOKENS: readonly (readonly [string, string, string])[] = [
  ['Grundfarben', '--schwarz', 'starker Text'],
  ['Grundfarben', '--preussischblau', 'Struktur: Text, Primaeraktion, Auswahl'],
  ['Grundfarben', '--orange', 'Signal: Fokus, Fortschritt'],
  ['Grundfarben', '--alabaster', 'Seitengrund'],
  ['Grundfarben', '--weiss', 'Flaechen'],
  ['Abgeleitet', '--bg', 'Seitengrund'],
  ['Abgeleitet', '--panel', 'Kacheln, Menues, Dialoge'],
  ['Abgeleitet', '--text', 'Fliesstext'],
  ['Abgeleitet', '--text-stark', 'Ueberschriften'],
  ['Abgeleitet', '--accent', 'Primaeraktion, aktiver Zustand'],
  ['Abgeleitet', '--accent-hover', 'Primaeraktion beim Ueberfahren'],
  ['Abgeleitet', '--accent-soft', 'Auswahl-Hintergrund, Pillen'],
  ['Abgeleitet', '--accent-soft-tief', 'Auswahl, kraeftiger'],
  ['Abgeleitet', '--accent-hauch', 'aktiver Ast-Chip, aktive XML-Zeile, Kruemel beim Ueberfahren'],
  ['Abgeleitet', '--on-accent', 'Text auf Accent'],
  ['Abgeleitet', '--signal', 'Fokusring, Fortschrittsbalken'],
  ['Abgeleitet', '--signal-soft', 'Balkengrund'],
  ['Neutralstufen', '--flaeche-hell', 'Listenkopf, Zeile beim Ueberfahren'],
  ['Neutralstufen', '--flaeche', 'Knopf beim Ueberfahren, Elternkasten, Chips'],
  ['Neutralstufen', '--flaeche-tief', 'Flaeche, kraeftiger'],
  ['Neutralstufen', '--border', 'Rahmen'],
  ['Neutralstufen', '--border-stark', 'Rahmen beim Ueberfahren'],
  ['Neutralstufen', '--trenner', 'Trennlinien in einer Flaeche'],
  ['Neutralstufen', '--muted', 'Sekundaertext'],
  ['Neutralstufen', '--muted-schwach', 'Tertiaertext'],
  ['Fachliche Signalfarben', '--frei-bg', 'freigegeben, gueltig, AG-Rolle — Flaeche'],
  ['Fachliche Signalfarben', '--frei-fg', 'freigegeben — Text'],
  ['Fachliche Signalfarben', '--warn-bg', 'seit Freigabe geaendert, Entwurf, BETA — Flaeche'],
  ['Fachliche Signalfarben', '--warn-fg', 'geaendert — Text'],
  ['Fachliche Signalfarben', '--erweiterung-bg', 'Schema-Erweiterung — Flaeche'],
  ['Fachliche Signalfarben', '--erweiterung-fg', 'Erweiterung, Sperrgrund — Text'],
  ['Fachliche Signalfarben', '--fehler-bg', 'Loeschen, Typfehler — Flaeche'],
  ['Fachliche Signalfarben', '--fehler-fg', 'Fehler — Text'],
  ['Fachliche Signalfarben', '--belegt-bg', 'Blatt mit Testwert'],
  ['Fachliche Signalfarben', '--auswahl-bg', 'Choice-Tag — Flaeche (stellvertretend)'],
  ['Fachliche Signalfarben', '--auswahl-fg', 'Choice-Tag — Text'],
  ['Fachliche Signalfarben', '--verweis-bg', 'Verweis-Tag — Flaeche'],
  ['Fachliche Signalfarben', '--verweis-fg', 'Verweis-Tag, Verweislinien — Text'],
  [
    'Fachliche Signalfarben',
    '--schema-pflicht',
    'Statusstreifen: Pflicht laut Schema, ohne Antwort',
  ],
  ['Fachliche Signalfarben', '--xml-wert', 'Werte in der XML-Darstellung'],
];

/** Eine Stufe der Schriftleiter (design.md `typography`). */
interface TypoStufe {
  name: string;
  groesse: number;
  gewicht: number;
  zeilenhoehe: number;
  spationierung: string;
  mono: boolean;
  verwendung: string;
}

/** Die Schriftleiter aus design.md — 10 / 11 / 12 / 13 / 14 / 15 / 20 / 40. */
const TYPO_STUFEN: readonly TypoStufe[] = [
  {
    name: 'leer-symbol',
    groesse: 40,
    gewicht: 400,
    zeilenhoehe: 1.2,
    spationierung: '0',
    mono: false,
    verwendung: 'Symbol im leeren Zustand',
  },
  {
    name: 'seitentitel',
    groesse: 20,
    gewicht: 650,
    zeilenhoehe: 1.2,
    spationierung: '0',
    mono: false,
    verwendung: 'Titel der Uebersichten',
  },
  {
    name: 'kachelname',
    groesse: 15,
    gewicht: 600,
    zeilenhoehe: 1.3,
    spationierung: '0',
    mono: false,
    verwendung: 'Name auf der Kachel, Elementname im Detail',
  },
  {
    name: 'body',
    groesse: 14,
    gewicht: 400,
    zeilenhoehe: 1.45,
    spationierung: '0',
    mono: false,
    verwendung: 'Grundschrift, Fliesstext, Dialoge',
  },
  {
    name: 'bedienung-stark',
    groesse: 13,
    gewicht: 600,
    zeilenhoehe: 1.45,
    spationierung: '0',
    mono: false,
    verwendung: 'Objektname in der Kopfleiste',
  },
  {
    name: 'bedienung',
    groesse: 13,
    gewicht: 400,
    zeilenhoehe: 1.45,
    spationierung: '0',
    mono: false,
    verwendung: 'Knoepfe, Eingaben, Menueeintraege, Toast',
  },
  {
    name: 'nebentext',
    groesse: 12,
    gewicht: 400,
    zeilenhoehe: 1.4,
    spationierung: '0',
    mono: false,
    verwendung: 'Pillen, Chips, Datum, Zaehler, Gruppenkoepfe',
  },
  {
    name: 'schema-mono',
    groesse: 12,
    gewicht: 400,
    zeilenhoehe: 1.45,
    spationierung: '0',
    mono: true,
    verwendung: 'Nachrichtenname, Pfade, Modul-Pille',
  },
  {
    name: 'kennzeichen',
    groesse: 11,
    gewicht: 700,
    zeilenhoehe: 1.3,
    spationierung: '0.06em',
    mono: false,
    verwendung: 'BETA, Menuekoepfe (Versalien)',
  },
  {
    name: 'baum-tag',
    groesse: 10,
    gewicht: 600,
    zeilenhoehe: 1.4,
    spationierung: '0',
    mono: false,
    verwendung: 'Kennzeichen am Baumknoten',
  },
];

/** Radienskala aus design.md (`--rund-*` in :root) — drei Familien: Bedienung, Kasten, Pille. */
const RADIEN: readonly (readonly [string, string, string])[] = [
  ['--rund-balken', '3px', 'Fortschrittsbalken'],
  ['--rund-tag', '4px', 'Kennzeichen am Baumknoten, Modul-Pille'],
  ['--rund-bedienung', '8px', 'Knoepfe, Eingaben, Menueeintraege, Filterwerte, Toast'],
  ['--rund-umschalter', '10px', 'Reiter- und Ansicht-Umschalter, Suche, Select'],
  ['--rund-kasten', '12px', 'Kacheln, Baumkaesten, Liste, Menues, Dialoge'],
  ['--rund-pill', '999px', 'Pillen, Schlagwort-Chips, Filter-Chips'],
];

/** Abstandsstufen aus design.md (2px-Raster). */
const ABSTAENDE: readonly (readonly [string, string, string])[] = [
  ['xxs', '4px', 'Chip-Luecke auf der Kachel'],
  ['xs', '6px', 'Zeilen der Kachel, innerhalb einer Zone'],
  ['sm', '8px', 'Formularraster, Gruppenkopf unten'],
  ['md', '10px', 'Zonen der Kopfleiste, Kachelraster-Luecke der Aktionen'],
  ['lg', '14px', 'Kachelraster-Luecke'],
  ['xl', '16px', 'Detailbereich innen, Kopfleiste seitlich, Kachel innen'],
  ['xxl', '20px', 'Uebersichtskopf unten'],
  ['seite', '28px', 'Seitenrand der Uebersichten'],
];

/** Alle `.tag`-Varianten des Baums (styles.scss ab `.tag.t-choice`). */
const TAG_VARIANTEN: readonly string[] = [
  't-choice',
  't-wert',
  't-ref',
  't-dent',
  't-daend',
  't-dsub',
  't-verr',
  't-vsub',
  't-code',
  't-rec',
  't-ausp',
  't-note',
  't-hint',
  't-hsub',
  't-open',
  't-mand',
  't-frei',
  't-klaeren',
  't-nprof',
  't-lock',
  't-ext',
  't-typ',
  't-typerr',
];

function tokenWert(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Styleguide (`?ansicht=styleguide`): die wiederkehrenden Bausteine der App
 * mit dem echten Stylesheet, jeder als `<section data-ds-card>`. Er ist die
 * Quelle des Design-System-Spiegels in Claude Design (ADR 0022): das Skript
 * `scripts/design-system-bundle.mjs` exportiert jede Karte unveraendert.
 *
 * Die Karten tragen Beispieldaten im Template und haengen an keinem Store —
 * sie sollen ohne Backend und ohne geladenes Schema stehen. Sie benutzen
 * ausschliesslich Klassen, die es in der App gibt; die `.sg*`-Klassen sind nur
 * der Rahmen der Seite selbst.
 */
@Component({
  selector: 'app-styleguide',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './styleguide.html',
})
export class Styleguide {
  protected readonly farbGruppen: readonly FarbGruppe[] = FARB_TOKENS.reduce<FarbGruppe[]>(
    (acc, [gruppe, name, rolle]) => {
      const token = { name, rolle, wert: tokenWert(name) };
      const g = acc.find((x) => x.gruppe === gruppe);
      if (g) g.tokens.push(token);
      else acc.push({ gruppe, tokens: [token] });
      return acc;
    },
    [],
  );
  protected readonly typoStufen = TYPO_STUFEN;
  protected readonly radien = RADIEN;
  protected readonly abstaende = ABSTAENDE;
  protected readonly tagVarianten = TAG_VARIANTEN;

  protected schrift(s: TypoStufe): string {
    return s.mono ? 'var(--mono)' : 'inherit';
  }
}
