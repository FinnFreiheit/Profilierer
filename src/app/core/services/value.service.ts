import { Injectable, inject } from '@angular/core';
import { CodelistInfo, EnumWert } from '../../models/codelist.model';
import { kid, kids, local } from '../util/xml.util';
import { compileXsdPattern, konformerBeispielwert } from '../util/pattern-sample.util';
import { letztesVorkommenPfad } from '../util/pfad.util';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';

/** Typgerechte Beispielwerte fuer Blaetter (XS_BUILTIN, Z.1997-2000). */
const XS_BUILTIN: Record<string, string> = {
  date: '2026-01-01',
  dateTime: '2026-01-01T12:00:00',
  time: '12:00:00',
  integer: '1',
  int: '1',
  nonNegativeInteger: '1',
  positiveInteger: '1',
  long: '1',
  decimal: '0.00',
  double: '0.0',
  float: '0.0',
  short: '1',
  byte: '1',
  unsignedLong: '1',
  unsignedInt: '1',
  unsignedShort: '1',
  unsignedByte: '1',
  negativeInteger: '-1',
  nonPositiveInteger: '0',
  duration: 'P1D',
  boolean: 'true',
  gYear: '2026',
  gYearMonth: '2026-01',
  gMonthDay: '--01-01',
  gDay: '---01',
  gMonth: '--01',
  anyURI: 'https://beispiel.example',
  language: 'de',
  token: 'Beispieltext',
  string: 'Beispieltext',
  normalizedString: 'Beispieltext',
  base64Binary: 'QmVpc3BpZWw=',
  hexBinary: '0F',
};

/** Format-Pruefungen fuer eingegebene Werte der gaengigen Builtins (lexikalischer Raum, vereinfacht). */
const XS_CHECK: Record<string, RegExp> = {
  date: /^-?\d{4,}-\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/,
  dateTime: /^-?\d{4,}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/,
  time: /^\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/,
  integer: /^[+-]?\d+$/,
  int: /^[+-]?\d+$/,
  long: /^[+-]?\d+$/,
  short: /^[+-]?\d+$/,
  byte: /^[+-]?\d+$/,
  nonNegativeInteger: /^\+?\d+$/,
  positiveInteger: /^\+?0*[1-9]\d*$/,
  negativeInteger: /^-0*[1-9]\d*$/,
  nonPositiveInteger: /^(-\d+|\+?0+)$/,
  unsignedLong: /^\+?\d+$/,
  unsignedInt: /^\+?\d+$/,
  unsignedShort: /^\+?\d+$/,
  unsignedByte: /^\+?\d+$/,
  decimal: /^[+-]?(\d+(\.\d*)?|\.\d+)$/,
  double: /^([+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?|-?INF|NaN)$/,
  float: /^([+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?|-?INF|NaN)$/,
  boolean: /^(true|false|0|1)$/,
  gYear: /^-?\d{4,}$/,
  gYearMonth: /^-?\d{4,}-\d{2}$/,
  gMonthDay: /^--\d{2}-\d{2}$/,
  gDay: /^---\d{2}$/,
  gMonth: /^--\d{2}$/,
  duration: /^-?P(?=.)(\d+Y)?(\d+M)?(\d+D)?(T(?=.)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/,
  hexBinary: /^([0-9A-Fa-f]{2})*$/,
};

/**
 * Betrachtungsmodus der Codelisten-Werteliste. `nachricht` filtert unbedingt
 * (die Einschraenkung ist dort Vorgabe, keine Ansichtssache), `profil` und
 * `lesen` filtern mit Umschalter.
 */
export type WerteModus = 'profil' | 'nachricht' | 'lesen';

/** Ergebnis der Sichtbarkeitsregel einer eingeschraenkten Codelisten-Werteliste. */
export interface WerteSicht<T> {
  /** Die anzuzeigenden Zeilen. */
  sichtbar: T[];
  /** Umschalter „alle zeigen" anbieten? */
  umschalter: boolean;
  /** Steht der Umschalter wirksam auf „nur zugelassene"? */
  gefiltert: boolean;
  /**
   * Filtern ist nicht moeglich (alle Werte ausgeschlossen) — der Umschalter
   * steht fest auf „alle zeigen", sonst bliebe eine leere Liste ohne Ausweg.
   */
  erzwungen: boolean;
}

/**
 * Der reine Code eines freigegebenen Eintrags: Codelisten-Einschraenkungen
 * entstehen entweder aus der Werteliste (dann steht dort nur der Code) oder aus
 * dem Freitextfeld fuer extern gepflegte Listen ("2001 — Genehmigung …").
 */
function codeAus(eintrag: string): string {
  return String(eintrag)
    .split(/\s+[—–-]\s+|\t/)[0]!
    .trim();
}

/** Ein Blatt-Knoten fuer die Platzhalter-Berechnung (Teilmenge von TreeNode). */
export interface PlaceholderNode {
  name: string;
  path: string;
  typeName: string | null;
  codelist: CodelistInfo | null;
}

/** Eine Zeile der Codelisten-Sicht (Detail-Panel). */
export interface CodelistenZeile {
  value: string;
  label: string;
  checked: boolean;
  belegt: boolean;
  search: string;
}

/** Die Codelisten-Sicht eines Blatts — siehe `codelistenSicht`. */
export interface CodelistenSicht {
  nameLang: string;
  kennung: string;
  geladen: boolean;
  version: string | null;
  eff: CodelistenZeile[] | null;
  restricted: boolean;
  werte: string[] | null;
  allowedCount: number;
  /**
   * Zahl der freigegebenen Codes, die in den anzeigbaren Zeilen tatsaechlich
   * vorkommen. 0 bei gesetzter Einschraenkung heisst: die geladene Liste
   * fuehrt keinen der freigegebenen Codes (Versionsdrift, Tippfehler) — der
   * Hinweis darf dann nicht auf eine Liste verweisen, die nichts anbietet.
   */
  allowedSichtbar: number;
  total: number;
  showFilter: boolean;
  manualText: string;
}

/**
 * Werte-Helfer: effektive Codelisten-Werte und Beispiel-/Platzhalterwerte.
 * Portiert aus Profilierer.html (clWerte/clVersion Z.797-807, placeholderFor
 * Z.2001-2040).
 */
@Injectable({ providedIn: 'root' })
export class ValueService {
  private readonly state = inject(StateService);
  private readonly parser = inject(XsdParserService);

  /** clWerte (Z.797-802): inline gepflegte oder geladene Codelisten-Werte. */
  clWerte(cl: CodelistInfo | null): EnumWert[] | null {
    if (!cl) return null;
    if (cl.werte && cl.werte.length) return cl.werte;
    const x = this.state.codelists()[cl.kennung];
    return x && x.werte.length ? x.werte : null;
  }

  /**
   * labelFor: Klartext-Bezeichnung hinter einem konkret belegten Code.
   * Liefert null, wenn keine (geladene) Codeliste vorliegt oder der Code dort
   * nicht enthalten ist — der rohe Code bleibt dann die einzige Darstellung.
   */
  labelFor(cl: CodelistInfo | null, code: string | null | undefined): string | null {
    if (!cl || !code) return null;
    const eff = this.clWerte(cl);
    if (!eff) return null;
    const hit = eff.find((w) => w.value === code);
    return hit && hit.label ? hit.label : null;
  }

  /**
   * Sichtbarkeitsregel der Codelisten-Werteliste (US "Werteliste zeigt, was
   * gilt"): welche der effektiven Werte angezeigt werden und ob der Umschalter
   * „alle zeigen" dazugehoert. Reine Funktion — das Detail-Panel haelt allein
   * den Umschalter-Zustand.
   */
  sichtbareWerte<T extends { value: string }>(
    eff: readonly T[] | null,
    werte: readonly string[] | null | undefined,
    alleZeigen: boolean,
    modus: WerteModus,
  ): WerteSicht<T> {
    const alle = eff ? [...eff] : [];
    // Kein `werte`-Feld = keine Einschraenkung: alles bleibt wie bisher.
    if (!werte) return { sichtbar: alle, umschalter: false, gefiltert: false, erzwungen: false };
    const erlaubt = new Set(werte);
    const zugelassen = alle.filter((w) => erlaubt.has(w.value));
    // Nachrichten-Modus filtert unbedingt, ohne Umschalter.
    if (modus === 'nachricht')
      return { sichtbar: zugelassen, umschalter: false, gefiltert: true, erzwungen: false };
    // „keine": Filtern hinterliesse eine leere Liste, aus der niemand mehr
    // herauskaeme — deshalb zwangsweise die volle Liste.
    if (!werte.length)
      return { sichtbar: alle, umschalter: true, gefiltert: false, erzwungen: true };
    return alleZeigen
      ? { sichtbar: alle, umschalter: true, gefiltert: false, erzwungen: false }
      : { sichtbar: zugelassen, umschalter: true, gefiltert: true, erzwungen: false };
  }

  /**
   * Die komplette Codelisten-Sicht eines Blatts — der Regel-Anteil, der bis
   * zum Architecture-Review (26.08.01, Kandidat 5) im vm-computed des
   * Detail-Panels lag und dort vor dem testbaren Seam stand (das Projekt
   * fuehrt bewusst keine Komponenten-Specs). Enthaelt die drei Regeln:
   *
   * - **Effektive Einschraenkung**: im gebundenen Durchlauf steht sie in der
   *   Vorgabe (und gilt dort auch im Vorkommen), beim Profilieren im eigenen
   *   Eintrag (`werteOf`). Zum Abgleich zaehlt der reine Code — Eintraege
   *   duerfen aus dem Freitextfeld stammen ("2001 — Genehmigung …").
   * - **Synthetischer Ausweg**: ohne geladene Liste werden im Nachrichten-Modus
   *   die freigegebenen Eintraege selbst zur Auswahl — sonst stuende eine
   *   harte Einschraenkung ohne auswaehlbare Werte da.
   * - **Drift-Erkennung**: `allowedSichtbar` zaehlt die freigegebenen Codes,
   *   die die geladene Liste tatsaechlich fuehrt. 0 bei gesetzter
   *   Einschraenkung heisst Versionsdrift oder Tippfehler — der Hinweis darf
   *   dann nicht auf eine Liste verweisen, die nichts anbietet.
   *
   * Das Panel haelt nur noch Umschalter- und Filterzustand.
   */
  codelistenSicht(cl: CodelistInfo, path: string, msgMode: boolean): CodelistenSicht {
    const p = this.state.elemente()[path] ?? {};
    const geladeneWerte = this.clWerte(cl);
    const geladen = !(cl.werte && cl.werte.length) && !!geladeneWerte;
    const werte = this.state.werteOf(path);
    const codes = werte ? this.werteZeilen(werte).map((w) => w.value) : null;
    const eff = geladeneWerte ?? (msgMode && codes?.length ? this.werteZeilen(werte!) : null);
    const allowed = new Set(codes ?? []);
    const belegterCode = p.beispiel ?? '';
    return {
      nameLang: cl.nameLang,
      kennung: cl.kennung,
      geladen,
      version: this.clVersion(cl),
      eff: eff
        ? eff.map((w) => ({
            value: w.value,
            label: w.label,
            checked: !codes || allowed.has(w.value),
            belegt: !!belegterCode && w.value === belegterCode,
            search: (w.value + ' ' + w.label).toLowerCase(),
          }))
        : null,
      restricted: !!werte,
      werte: codes,
      allowedCount: allowed.size,
      allowedSichtbar: eff ? eff.filter((w) => allowed.has(w.value)).length : 0,
      // Bezugsgroesse "x von y" ist die geladene Liste; sind die Zeilen aus den
      // freigegebenen Eintraegen synthetisiert, gibt es kein y (0 = nicht zeigen).
      total: geladeneWerte ? geladeneWerte.length : 0,
      showFilter: !!eff && eff.length > 15,
      manualText: (p.werte ?? []).join('\n'),
    };
  }

  /**
   * Verstoss gegen die Werte-Einschraenkung an diesem Pfad — Text, wenn der Wert
   * nicht freigegeben ist, sonst null. Grundlage der Eingabesperre im
   * Nachrichten-Modus: dort ist die Einschraenkung hart, auswaehlbar sind nur
   * die freigegebenen Werte (Spec "Testnachricht aus einer Profilierung").
   * Verglichen wird der reine Code, damit auch manuell gepflegte Eintraege
   * („2001 — Genehmigung …") greifen.
   */
  werteVerstoss(path: string, wert: string): string | null {
    const w = (wert ?? '').trim();
    if (!w) return null;
    const werte = this.state.werteOf(path);
    if (!werte || werte.some((e) => codeAus(e) === w)) return null;
    return `„${w}" ist in der gebundenen Profilierung nicht freigegeben.`;
  }

  /**
   * Auswaehlbare Zeilen aus den freigegebenen Eintraegen der Profilierung — der
   * Ausweg, solange die Codeliste selbst nicht geladen ist (extern gepflegte
   * Liste). Ohne sie bliebe im gebundenen Durchlauf eine harte Einschraenkung
   * ohne Auswahl uebrig, obwohl die freie Eingabe gesperrt ist. Ein Eintrag der
   * Form „2001 — Genehmigung …" wird in Code und Beschreibung zerlegt.
   */
  werteZeilen(werte: readonly string[]): EnumWert[] {
    return werte.map((eintrag) => {
      const code = codeAus(eintrag);
      const rest = String(eintrag)
        .slice(code.length)
        .replace(/^\s*[—–-]\s*|^\t/, '');
      return { value: code, label: rest.trim() };
    });
  }

  /**
   * Freigegebene Codes, die die **geladene** Codeliste nicht fuehrt — leer,
   * solange sich Profilierung und Liste decken. Typisch bei Versionsdrift
   * (das Profil nennt Codes einer aelteren Fassung) oder einem Tippfehler im
   * Profil.
   *
   * Der Fall ist eine Sackgasse, wenn *alle* freigegebenen Codes fehlen: die
   * Werteliste zeigt dann keine Zeile, die freie Eingabe ist gesperrt, und der
   * Zaehler behauptet weiter „2 von 300 zugelassen". Deshalb wird er beim Start
   * des Durchlaufs als Widerspruch der Profilierung gemeldet, statt still eine
   * unbefuellbare Nachricht zu erzeugen. `eff = null` (Liste nicht geladen)
   * ergibt keine Aussage — dort greift der synthetische Ausweg aus
   * `werteZeilen`.
   */
  codesOhneDeckung(eff: readonly EnumWert[] | null, werte: readonly string[] | null): string[] {
    if (!eff || !werte?.length) return [];
    const vorhanden = new Set(eff.map((w) => w.value));
    return this.werteZeilen(werte)
      .map((w) => w.value)
      .filter((c) => !vorhanden.has(c));
  }

  /**
   * Folgezustand des Umschalters „alle zeigen". `vorher = null` heisst
   * Elementwechsel — dann beginnt die Ansicht wieder bei „nur zugelassene"
   * (AC "der Umschalter steht bei jedem Elementwechsel wieder auf nur
   * zugelassene"), es sei denn, am neuen Element ist ohnehin alles
   * ausgeschlossen.
   *
   * Der Punkt der Funktion ist der **Uebergang**: Solange alle Werte
   * ausgeschlossen sind, ist „alle zeigen" erzwungen — faellt der Zwang weg,
   * weil der erste Wert zugelassen wird, muss der Umschalter *an* bleiben.
   * Sonst kollabierte die Liste genau in dem Moment auf die eine gerade
   * angehakte Zeile, und der Ablauf „von keine ausgehend fuenf Werte zulassen"
   * braeuchte nach jedem Haken einen Klick auf „alle zeigen". Deshalb schreibt
   * der Zwang den Zustand, statt ihn nur zu ueberlagern.
   */
  naechsterUmschalter(vorher: boolean | null, erzwungen: boolean): boolean {
    return erzwungen || (vorher ?? false);
  }

  /**
   * Was die gebundene Profilierung an diesem Punkt **vorschlaegt** — null ohne
   * Bindung und ohne Festlegung. Der Vorschlag wird angeboten („uebernehmen"),
   * nie in das Feld geschrieben: ein vorbelegtes Feld wird nicht mehr angesehen,
   * und genau das soll die Fuehrung vermeiden (Spec "Testnachricht aus einer
   * Profilierung", Abschnitt "Vorschlagen statt vorbelegen").
   */
  vorschlagFor(path: string): string | null {
    if (!this.state.hatVorgabe()) return null;
    const beispiel = this.state.vorgabeBeispiel(path);
    if (beispiel) return beispiel;
    // Auf genau einen Wert eingeschraenkte Codeliste: auch sie wird nur
    // vorgeschlagen — im ganzen Durchlauf gilt dieselbe Regel.
    const werte = this.state.werteOf(path);
    return werte && werte.length === 1 ? codeAus(werte[0]!) : null;
  }

  /**
   * clVersion (Z.803-807): Version einer Codeliste. Die im XSD fixierte
   * `listVersionID` hat Vorrang — nur sie besteht die Schemavalidierung;
   * sonst die Version der aus dem XRepository geladenen Liste.
   */
  clVersion(cl: CodelistInfo | null): string | null {
    if (!cl) return null;
    if (cl.version) return cl.version;
    const x = this.state.codelists()[cl.kennung];
    return x ? (x.version ?? null) : null;
  }

  /** placeholderFor (Z.2001-2040): Beispielwert bzw. typgerechter Platzhalter. */
  placeholderFor(n: PlaceholderNode): string {
    const p = this.state.elemente()[n.path] ?? {};
    if (p.beispiel) return p.beispiel;
    return this.dummyFor(n);
  }

  /**
   * Typkonformer Dummy-Wert, unabhaengig von einem evtl. gesetzten Beispielwert
   * — fuer den "Wuerfel"-Button und das globale Befuellen offener Pflichtfelder
   * (US "Testnachricht gefuehrt erstellen"). UUID-Facetten bekommen eine echte
   * Zufalls-UUID, sonst gilt die Platzhalter-Logik (Codeliste, Enumeration,
   * Pattern-Facette, Builtin).
   */
  dummyFor(n: PlaceholderNode): string {
    const elemente = this.state.elemente();
    const p = elemente[n.path] ?? {};

    // Verweis-Blatt: Nummer der Ziel-Auspraegung.
    if (/^ref\./.test(n.name)) {
      const parentPath = n.path.slice(0, n.path.lastIndexOf('/'));
      const rz = elemente[parentPath]?.refZiel || p.refZiel || null;
      if (rz) {
        const num = this.state.auspNumber(rz);
        if (num != null) return String(num);
      }
    }
    // Gegenstueck: Nummer der eigenen Auspraegung.
    if (n.name === 'rollennummer' || n.name === 'beteiligtennummer') {
      const auspPath = letztesVorkommenPfad(n.path);
      if (auspPath) {
        const num = this.state.auspNumber(auspPath);
        if (num != null) return String(num);
      }
    }
    // Gebundener Durchlauf: der Vorschlag der Profilierung geht dem Zufall vor —
    // auch der schnelle Weg soll keine Werte ausserhalb des Szenarios erzeugen
    // (Spec "Testnachricht aus einer Profilierung"). Erst nach den Verweisen:
    // deren Nummer vergibt das Werkzeug an beiden Enden, ein fester Wert aus der
    // Profilierung wuerde den Verweis zerreissen. Ohne Bindung: null.
    const vorschlag = this.vorschlagFor(n.path);
    if (vorschlag) return vorschlag;

    if (n.codelist) {
      // Freigegebene Werte ueber die effektive Lesart: im gebundenen Durchlauf
      // steht die Einschraenkung in der Vorgabe, beim Profilieren im eigenen
      // Eintrag. Ein leeres Array ("keine zugelassen") laesst nichts uebrig —
      // dann bleibt nur die volle Liste, den Widerspruch meldet der Abgleich.
      const werte = this.state.werteOf(n.path);
      if (werte && werte.length) return codeAus(werte[0]!);
      const eff = this.clWerte(n.codelist);
      if (eff && eff.length) return eff[0]!.value;
      return 'CODE';
    }
    const res = this.resolveType(n.typeName);
    if (res.enumWerte && res.enumWerte.length) return res.enumWerte[0]!.value;
    const sample = res.builtin ? XS_BUILTIN[res.builtin]! : 'Beispieltext';
    // Datentyp-Facette einhalten: Wert an der Pattern-Restriktion ausrichten
    // (z. B. Type.GDS.Datumsangabe, UUID-Typen).
    if (res.patterns) {
      // Echte Zufalls-UUID, wenn erst die UUID die Facette erfuellt (z. B.
      // eigeneNachrichtenID) — nicht bei permissiven Text-Patterns, die schon
      // die freundlichen Kandidaten zulassen.
      const rxs = res.patterns.map(compileXsdPattern).filter((r): r is RegExp => !!r);
      const passt = (s: string): boolean => rxs.some((r) => r.test(s));
      if (rxs.length && !passt(sample) && !Object.values(XS_BUILTIN).some(passt)) {
        const uuid = globalThis.crypto?.randomUUID?.();
        if (uuid && passt(uuid)) return uuid;
      }
      return konformerBeispielwert(res.patterns, Object.values(XS_BUILTIN), sample);
    }
    return sample;
  }

  /**
   * Typ-Verstoss eines konkret eingegebenen Beispielwerts — null, wenn der Wert
   * konform ist oder der Typ nicht geprueft werden kann. Prueft Codelisten,
   * Enumerationen, xs:pattern-Facetten und die gaengigen Builtin-Formate.
   */
  wertProblem(n: PlaceholderNode, wert: string | null | undefined): string | null {
    const w = (wert ?? '').trim();
    if (!w) return null;
    if (n.codelist) {
      const eff = this.clWerte(n.codelist);
      if (eff && eff.length && !eff.some((x) => x.value === w))
        return `„${w}" ist kein Wert der Codeliste${n.codelist.nameLang ? ' ' + n.codelist.nameLang : ''}`;
      // Freigegebene Auswahl der Profilierung (Nachlese zu #38, Issue #55):
      // steht im Feld ein Code, den die Profilierung ausschliesst, ist er
      // profilwidrig — und seit der Filterung der Werteliste nicht einmal mehr
      // dort zu sehen. Ohne diese Pruefung bliebe er voellig unauffaellig.
      // Ein leeres Array ("keine zugelassen") ist ein Widerspruch der
      // Profilierung und wird beim Start gemeldet, nicht am Feld.
      const frei = this.state.werteOf(n.path);
      if (frei && frei.length && !frei.includes(w))
        return `„${w}" ist in dieser Profilierung nicht freigegeben`;
      return null;
    }
    const res = this.resolveType(n.typeName);
    const tn = n.typeName ?? 'des Feldes';
    if (res.enumWerte && res.enumWerte.length)
      return res.enumWerte.some((e) => e.value === w)
        ? null
        : `„${w}" ist kein zulässiger Wert von ${tn}`;
    if (res.patterns) {
      const rxs = res.patterns.map(compileXsdPattern).filter((r): r is RegExp => !!r);
      if (rxs.length && !rxs.some((r) => r.test(w)))
        return `Entspricht nicht dem Datentyp ${tn} — erwartet z. B. „${konformerBeispielwert(
          res.patterns,
          Object.values(XS_BUILTIN),
          XS_BUILTIN[res.builtin ?? ''] ?? 'Beispieltext',
        )}"`;
      return null;
    }
    if (res.builtin) {
      const check = XS_CHECK[res.builtin];
      if (check && !check.test(w))
        return `Entspricht nicht dem Datentyp xs:${res.builtin} — erwartet z. B. „${XS_BUILTIN[res.builtin]}"`;
    }
    return null;
  }

  /**
   * Aufloesung der simpleType-Kette: terminaler Builtin, Enumerationswerte
   * oder die Pattern-Facette des spezifischsten Typs (mehrere xs:pattern im
   * selben Restriktions-Schritt sind XSD-seitig Alternativen).
   */
  private resolveType(typeName: string | null): {
    builtin: string | null;
    enumWerte: EnumWert[] | null;
    patterns: string[] | null;
  } {
    const idx = this.state.idx();
    const seen = new Set<string>();
    let patterns: string[] | null = null;
    let t = typeName;
    while (t && !seen.has(t)) {
      seen.add(t);
      if (XS_BUILTIN[t] !== undefined) return { builtin: t, enumWerte: null, patterns };
      const st = idx ? idx.st[t] : undefined;
      if (!st) break;
      const en = this.parser.enumsOfST(st, idx!);
      if (en && en.length) return { builtin: null, enumWerte: en, patterns };
      const r = kid(st, 'restriction');
      if (r && !patterns) {
        const ps = kids(r, 'pattern')
          .map((p) => p.getAttribute('value'))
          .filter((v): v is string => !!v);
        if (ps.length) patterns = ps;
      }
      t = r ? local(r.getAttribute('base')) : null;
    }
    return { builtin: null, enumWerte: null, patterns };
  }
}
