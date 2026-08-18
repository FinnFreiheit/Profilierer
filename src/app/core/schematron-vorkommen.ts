import { Wirkung } from '../models/profile.model';

/**
 * Vorkommens-Regeln fuer den Schematron-Export (#120).
 *
 * Der Export konnte vorkommensspezifische Festlegungen bisher **gar nicht**
 * ausdruecken: er uebersprang jeden Pfad mit `@` und gab nur die Summe der
 * zwingenden Auspraegungen als Mindestanzahl aus. Genau dort trifft eine
 * Profilierung aber ihre Aussagen ("der Notar braucht eine Kanzleianschrift").
 *
 * **Warum das nicht trivial ist.** Die Erfuellbarkeits-Zuordnung (#116) ist
 * eine globale, eineindeutige Optimierung ueber eine ganze Liste; Schematron
 * prueft knotenweise mit XPath. Eine Paarung ueber alle Vorkommen laesst sich
 * dort nicht ausdruecken, ohne ueber Permutationen zu quantifizieren.
 *
 * **Der Ausweg ist derselbe Gedanke wie in #121.** Wo die kennzeichnenden
 * Festlegungen die Auspraegungen **vollstaendig trennen** — keine zwei lassen
 * am selben Blatt einen gemeinsamen Wert zu — ist die Zuordnung gar keine
 * Optimierung mehr, sondern erzwungen: jedes Vorkommen erfuellt hoechstens ein
 * Kennzeichen-Praedikat. Dann ist die knotenweise Lesart mit der globalen
 * identisch, und `beteiligung[xj:rolle = ('22')]` benennt genau die Vorkommen
 * der Auspraegung "Notar".
 *
 * Wo sie **nicht** trennen, wird nichts ausgegeben. Eine Naeherung waere hier
 * schlimmer als eine Luecke: ein Schematron behauptet Gueltigkeit, und eine
 * geratene Zuordnung spraeche Fehlzuordnungen mit der Autoritaet eines
 * Pruefwerkzeugs aus — dieselbe Ablehnung wie in #107. Die Luecke wird
 * stattdessen benannt: im Export als Kommentar, dem Benutzer als Meldung.
 */

/** Eine Festlegung unterhalb eines benannten Vorkommens. */
export interface VorkommenFestlegung {
  /** Schritte unterhalb des Listenelements (`['rolle','rollenbezeichnung']`). */
  rel: string[];
  /** Anzeigename fuer die Meldung. */
  label: string;
  wirkung?: Wirkung | null;
  werte?: string[];
  kennzeichnend?: boolean;
  min?: string;
  max?: string;
  /** Codelisten-Element: der Wert haengt am `code`-Kind darunter. */
  codelist?: boolean;
}

/** Eine benannte Auspraegung mit ihren Festlegungen. */
export interface VorkommenAusp {
  id: string;
  name: string;
  /** Zwingend belegt (Wirkung `pflicht` an der Auspraegung selbst). */
  zwingend: boolean;
  festlegungen: VorkommenFestlegung[];
}

/** Eine Vorkommensliste im XPath-Raum der Nachricht. */
export interface VorkommenGruppe {
  /** Absoluter XPath des Listenelements (`/xj:nachricht…/xj:beteiligung`). */
  listXPath: string;
  /** Anzeigename der Liste fuer Meldungen. */
  listLabel: string;
  auspraegungen: VorkommenAusp[];
}

/** Eine erzeugte Regel — Kontext, Test, Meldung. */
export interface SchRegel {
  ctx: string;
  test: string;
  msg: string;
}

export interface VorkommenErgebnis {
  regeln: SchRegel[];
  /** Was nicht ausgedrueckt werden konnte, im Klartext. */
  luecken: string[];
}

/**
 * Regeln fuer eine Vorkommensliste. Leer plus eine Luecke, wo die Kennzeichen
 * die Auspraegungen nicht vollstaendig trennen.
 */
export function vorkommenRegeln(g: VorkommenGruppe): VorkommenErgebnis {
  const regeln: SchRegel[] = [];
  const luecken: string[] = [];
  // Nur Auspraegungen, ueber die es ueberhaupt etwas zu sagen gibt.
  const relevant = g.auspraegungen.filter((a) => a.zwingend || a.festlegungen.length);
  if (!relevant.length) return { regeln, luecken };

  const ohneKennzeichen = relevant.filter((a) => !kennzeichen(a).length);
  if (ohneKennzeichen.length) {
    luecken.push(
      `${g.listLabel}: ${nennung(ohneKennzeichen)} ohne Kennzeichen — in einer Nachricht nicht ` +
        'benennbar, ihre Festlegungen stehen deshalb nicht im Schematron.',
    );
    return { regeln, luecken };
  }

  const kollision = ersteKollision(relevant);
  if (kollision) {
    luecken.push(
      `${g.listLabel}: Die Kennzeichen trennen „${kollision[0]}" und „${kollision[1]}" nicht — ` +
        'welches Vorkommen welches ist, entscheidet erst die Zuordnung des Prüfberichts. ' +
        'Knotenweise Regeln würden hier raten, deshalb stehen die Festlegungen dieser Liste ' +
        'nicht im Schematron.',
    );
    return { regeln, luecken };
  }

  for (const a of relevant) {
    const praedikat = kennzeichen(a)
      .map((f) => wertTest(schritte(f), f.werte!))
      .join(' and ');
    const kontext = `${g.listXPath}[${praedikat}]`;
    const eltern = kontextEltern(g.listXPath);

    // Anwesenheit: eine zwingende Auspraegung muss ein Vorkommen haben, das
    // ihre Kennzeichen traegt. Das ist die Aussage, die die bisherige
    // Summen-Mindestanzahl nur grob annaeherte.
    if (a.zwingend)
      regeln.push({
        ctx: eltern,
        test: `count(${teilXPath(g.listXPath)}[${praedikat}]) >= 1`,
        msg: `„${a.name}": in diesem Szenario ist ein Vorkommen mit diesen Kennzeichen verpflichtend.`,
      });

    // Inhalt: die uebrigen Festlegungen am so benannten Vorkommen. Zwei Ziele,
    // die bei Codelisten auseinanderfallen: Anwesenheit und Kardinalitaet
    // haengen am **Element** (`xj:farbe`), der Wert am `code`-Kind darunter —
    // dieselbe Lesart wie im uebrigen Export.
    for (const f of a.festlegungen) {
      if (f.kennzeichnend) continue; // bildet das Praedikat, keine eigene Regel
      const el = f.rel.map((r) => 'xj:' + r);
      const name = el.at(-1)!;
      const elternRel = el.slice(0, -1);
      const ctx = elternRel.length ? `${kontext}/${elternRel.join('/')}` : kontext;
      const wo = `„${a.name}" → ${f.label}`;

      if (f.wirkung === 'ausgeschlossen') {
        regeln.push({
          ctx,
          test: `not(${name})`,
          msg: `${wo}: wird in diesem Szenario nicht verwendet.`,
        });
        continue;
      }
      if (f.wirkung === 'pflicht')
        regeln.push({ ctx, test: name, msg: `${wo}: ist in diesem Szenario verpflichtend.` });
      if (f.min && f.min !== '0')
        regeln.push({
          ctx,
          test: `count(${name}) >= ${parseInt(f.min, 10)}`,
          msg: `${wo}: mindestens ${parseInt(f.min, 10)}-mal erforderlich.`,
        });
      if (f.max && f.max !== '*' && f.max !== 'unbounded')
        regeln.push({
          ctx,
          test: `count(${name}) <= ${parseInt(f.max, 10)}`,
          msg: `${wo}: höchstens ${parseInt(f.max, 10)}-mal zulässig.`,
        });
      if (f.werte?.length)
        regeln.push({
          ctx,
          test: wertTest(f.codelist ? [name, 'xj:code'] : [name], f.werte),
          msg: `${wo}: nur folgende Werte sind zulässig: ${werteRein(f.werte).join(', ')}.`,
        });
    }
  }
  return { regeln, luecken };
}

/** Die kennzeichnenden Festlegungen einer Auspraegung (mit Werteliste). */
function kennzeichen(a: VorkommenAusp): VorkommenFestlegung[] {
  return a.festlegungen.filter((f) => f.kennzeichnend && f.werte?.length);
}

/**
 * Das erste Auspraegungs-Paar, das kein Kennzeichen auseinanderhaelt. Getrennt
 * ist ein Paar, wenn es ein gemeinsames Kennzeichen-Blatt gibt, dessen
 * Wertelisten sich nicht ueberschneiden — dann kann kein Vorkommen beide
 * Praedikate erfuellen.
 */
function ersteKollision(ausps: VorkommenAusp[]): [string, string] | null {
  for (let i = 0; i < ausps.length; i++)
    for (let j = i + 1; j < ausps.length; j++) {
      const a = ausps[i]!;
      const b = ausps[j]!;
      const getrennt = kennzeichen(a).some((fa) => {
        const fb = kennzeichen(b).find((x) => x.rel.join('/') === fa.rel.join('/'));
        if (!fb) return false;
        const wb = new Set(werteRein(fb.werte!));
        return !werteRein(fa.werte!).some((w) => wb.has(w));
      });
      if (!getrennt) return [a.name, b.name];
    }
  return null;
}

/** Die XPath-Schritte einer Festlegung, inklusive `code`-Kind bei Codelisten. */
function schritte(f: VorkommenFestlegung): string[] {
  const s = f.rel.map((r) => 'xj:' + r);
  return f.codelist ? [...s, 'xj:code'] : s;
}

/**
 * Werte-Test. Codelisten-Eintraege tragen im Profil oft „Wert — Bezeichnung";
 * massgeblich ist der Teil vor dem Trenner (dieselbe Lesart wie im uebrigen
 * Export).
 */
function wertTest(ziel: string[], werte: string[]): string {
  const seq = werteRein(werte)
    .map((v) => `'${v.replace(/'/g, "''")}'`)
    .join(', ');
  return `${ziel.join('/')} = (${seq})`;
}

function werteRein(werte: string[]): string[] {
  return werte
    .map((v) =>
      String(v)
        .split(/\s+[—–-]\s+|\t/)[0]!
        .trim(),
    )
    .filter(Boolean);
}

/** Der Elternkontext eines absoluten XPath (`/a/b` → `/a`). */
function kontextEltern(xp: string): string {
  const i = xp.lastIndexOf('/');
  return i <= 0 ? '/' : xp.slice(0, i);
}

/** Das letzte Segment eines absoluten XPath — relativ zum Elternkontext. */
function teilXPath(xp: string): string {
  return xp.slice(xp.lastIndexOf('/') + 1);
}

function nennung(ausps: VorkommenAusp[]): string {
  const namen = ausps.map((a) => `„${a.name}"`);
  return namen.length === 1 ? namen[0]! : namen.join(', ');
}
