import { Pruefbericht, PruefberichtKopf } from '../../models/pruefbericht.model';
import { Verstoss } from '../services/konformitaet.service';
import { ReportEintrag } from '../../models/validation.model';
import { ListenZuordnung, ZuordnungsEintrag } from '../vorkommen-matching';
import { ListenLage } from '../kennzeichen-lage';
import { blattName } from './pfad.util';
import { pretty } from './pretty.util';

/**
 * Den Pruefbericht (#107) fuer die Anzeige aufbereiten. Reine Funktionen, damit
 * die **Zurechnung** — was der Nachricht angelastet wird und was der
 * Profilierung — ohne Oberflaeche pruefbar ist.
 */

/**
 * Der Titel — die eine Zeile, die haengen bleibt. Sie darf **nicht** nur die
 * Verstoesse zaehlen: „profilkonform" ueber einem Bericht mit 132 Luecken waere
 * falsch-gruen, denn geprueft wurde dort nichts. Ohne Festlegung gibt es auch
 * nichts einzuhalten, und das gehoert in dieselbe Zeile wie das Urteil.
 */
export function berichtTitel(name: string, b: Pruefbericht): string {
  const nv = abweichungen(b).length;
  const nl = b.luecken.length;
  const kopf = `Prüfbericht „${name}" — `;
  if (nv) {
    const abw = `${nv} Abweichung${nv === 1 ? '' : 'en'} von der Profilierung`;
    return kopf + (nl ? `${abw}, ${nl} Lücken` : abw);
  }
  if (nl) return `${kopf}keine Abweichungen, aber ${nl} Lücken der Profilierung`;
  return `${kopf}profilkonform`;
}

/**
 * Die Befunde, die der **Nachricht** anzulasten sind. Nachbeauftragte Elemente
 * bleiben aussen vor: sie gibt es im Schema nicht, eine gueltige
 * XJustiz-Nachricht kann sie nicht enthalten (#98). Sie stehen im Bericht, aber
 * in ihrem eigenen Abschnitt und ohne in die Zaehlung einzugehen.
 */
export function abweichungen(b: Pruefbericht): Verstoss[] {
  return b.verstoesse.filter((v) => !v.erweiterung);
}

/** Befunde an nachbeauftragten Elementen — ein Wunsch der Profilierung, kein Mangel der Nachricht. */
export function nachbeauftragt(b: Pruefbericht): Verstoss[] {
  return b.verstoesse.filter((v) => v.erweiterung);
}

/**
 * Die Kopfzeile unter dem Titel: wogegen wurde geprueft, und wie belastbar ist
 * das Ergebnis. Jede Einschraenkung, die der Leser kennen muss, steht hier —
 * ein Bericht, der seine Grenzen verschweigt, liest sich als vollstaendig.
 */
export function berichtKopfzeile(k: PruefberichtKopf): string {
  const teile = [`Geprüft gegen „${k.profilName}", Fassung ${k.fassung}`];
  if (k.xjustizVersion) teile.push(`XJustiz ${k.xjustizVersion}`);

  if (k.schema === 'invalide')
    teile.push(
      'Die Nachricht ist nicht schema-valide — Teile konnten dem Schema nicht zugeordnet ' +
        'werden und blieben ungeprüft',
    );
  else if (k.schema === 'unpruefbar')
    teile.push('Schemavalidität nicht prüfbar — der Umfang der Prüfung ist unsicher');

  // Der Entscheidungsstand sagt, wie belastbar der Luecken-Teil ist. Er fehlt
  // in jeder eingefrorenen Version — gerade dort, wo am ehesten geprueft wird.
  // Dann die zaehlbare Ersatzangabe statt „unbekannt".
  if (k.fortschritt)
    teile.push(`Profilierung: ${k.fortschritt.x} von ${k.fortschritt.y} Punkten entschieden`);
  else
    teile.push(
      `Profilierung: ${k.festlegungen} Festlegungen (Entscheidungsstand dieser Fassung nicht mitgeführt)`,
    );

  // Die Reichweite gehoert **vor** die uebrigen Einschraenkungen: sie sagt, wie
  // viel der Bericht ueberhaupt aussagt.
  const r = k.reichweite;
  if (r.ungeprueft)
    teile.push(
      `${r.ungeprueft} von ${r.gesamt} Festlegungen ließen sich nicht zuordnen und blieben ` +
        'ungeprüft (benannte Vorkommen)',
    );

  if (k.nErweiterung)
    teile.push(
      `${k.nErweiterung} Befund${k.nErweiterung === 1 ? '' : 'e'} betrifft nachbeauftragte ` +
        'Elemente — sie zählen nicht gegen die Nachricht',
    );

  // Seit #116 ist das kein Naturgesetz mehr, sondern eine Folge fehlender
  // Kennzeichen — der Satz nennt deshalb den Handgriff mit (#121), sonst liest
  // er sich als unabaenderlich.
  if (k.vorkommenUnzuordenbar)
    teile.push(
      'Benannte Vorkommen trägt eine XJustiz-Nachricht nicht — zugeordnet wird nur, wo die ' +
        'Profilierung Festlegungen als kennzeichnend erklärt; sonst zählt allein die Anzahl',
    );

  return teile.join(' · ') + '.';
}

/**
 * Die Eintragsliste: zwei Abschnitte mit Zwischenueberschrift. Getrennt, weil
 * die Zurechnung verschieden ist — Verstoesse gehen an den Absender, Luecken an
 * die eigene Profilierung. In einer Liste ginge genau das verloren.
 *
 * Ein leerer Abschnitt bekommt eine Zeile statt zu verschwinden: „keine" ist
 * eine Aussage, ein fehlender Abschnitt waere blosses Schweigen.
 */
export function berichtEintraege(b: Pruefbericht): ReportEintrag[] {
  const out: ReportEintrag[] = [];
  const abw = abweichungen(b);
  const erw = nachbeauftragt(b);

  out.push({
    text: abschnittTitel('Abweichungen von der Profilierung', abw.length),
    abschnitt: true,
  });
  if (abw.length) for (const v of abw) out.push({ text: v.text, pfad: v.pfad });
  else out.push({ text: 'Keine — die Nachricht hält die geprüfte Fassung ein.' });

  out.push({ text: abschnittTitel('Lücken der Profilierung', b.luecken.length), abschnitt: true });
  if (b.luecken.length) {
    for (const l of b.luecken) out.push({ text: l.text, pfad: l.pfad });
  } else {
    out.push({ text: 'Keine — zu jedem belegten Element trifft die Profilierung eine Aussage.' });
  }

  // Nur zeigen, wo es welche gibt: an einer Profilierung ohne Erweiterungen
  // waere der Abschnitt eine Zeile ohne Aussage.
  if (erw.length) {
    out.push({ text: abschnittTitel('Nachbeauftragte Elemente', erw.length), abschnitt: true });
    for (const v of erw) out.push({ text: v.text, pfad: v.pfad, erweiterung: true });
  }

  // Der Ausweis der Zuordnung (#116): als was wurde jedes anonyme Vorkommen
  // gelesen, und worueber ist das belegt. Nur wo das Matching lief — an einer
  // Profilierung ohne Kennzeichen waere der Abschnitt eine leere Behauptung.
  if (b.zuordnung.length) {
    const zeilen = b.zuordnung.flatMap(zuordnungZeilen);
    out.push({ text: abschnittTitel('Zuordnung der Vorkommen', zeilen.length), abschnitt: true });
    out.push(...zeilen);
  }

  // Was die Reichweite heben wuerde (#121). Steht **nach** der Zuordnung: erst
  // was gilt, dann was fehlt. Nur wo es etwas zu sagen gibt — an einer
  // Profilierung, deren Kennzeichen sitzen, waere der Abschnitt Laerm.
  if (b.kennzeichenLage.length) {
    const zeilen = b.kennzeichenLage.flatMap(kennzeichenZeilen);
    out.push({ text: abschnittTitel('Kennzeichen', zeilen.length), abschnitt: true });
    out.push(...zeilen);
  }

  if (b.kopf.schemaFehler.length) {
    out.push({
      text: abschnittTitel('Schemafehler der Nachricht', b.kopf.schemaFehler.length),
      abschnitt: true,
    });
    for (const t of b.kopf.schemaFehler) out.push({ text: t });
  }
  return out;
}

function abschnittTitel(text: string, n: number): string {
  return `${text} (${n})`;
}

/**
 * Die Zeilen einer Listen-Zuordnung. Vier Aussagen, jede mit eigener
 * Zurechnung: die getroffenen Paare (nachpruefbar ueber die genannten
 * Kennzeichen), die unbelegten zwingenden Auspraegungen (zweiklassig — eine
 * einzeln anzuklagen, die austauschbar ist, waere eine falsche Anklage), die
 * nicht aufgenommenen Vorkommen (offene Welt: Hinweis, kein Verstoss) und die
 * uebersprungene Liste (Grenze der exakten Suche, ehrlich benannt).
 */
export function zuordnungZeilen(l: ListenZuordnung): ReportEintrag[] {
  const name = pretty(blattName(l.listPfad));
  const out: ReportEintrag[] = [];
  if (l.uebersprungen) {
    out.push({ text: `${name} (${l.listPfad}): ${l.uebersprungen}`, pfad: l.listPfad });
    return out;
  }
  for (const e of l.eintraege) {
    out.push({
      text:
        `${name} (${l.listPfad}): „${e.vorkommenName}" gelesen als „${e.auspName}"` +
        (e.kennzeichen.length
          ? ` — belegt über ${e.kennzeichen.join(', ')}.`
          : ' — ohne Kennzeichen (günstigste Lesart, keine Identifikation).') +
        gleichwertig(e),
      pfad: `${l.listPfad}@${e.vorkommenId}`,
    });
  }
  for (const f of l.fehlbetraege) {
    out.push({
      text:
        f.klasse === 'unvermeidbar'
          ? `${name} (${l.listPfad}): Das zwingende Vorkommen „${f.auspName}" ist in keiner Zuordnung belegbar` +
            (f.kandidaten.length
              ? ` — die passenden Vorkommen (${f.kandidaten.join(', ')}) werden von anderen zwingenden Ausprägungen gebraucht.`
              : ' — kein Vorkommen trägt seine Kennzeichen.')
          : `${name} (${l.listPfad}): Das zwingende Vorkommen „${f.auspName}" bleibt unbelegt, ist aber austauschbar — geteilte Kandidaten: ${f.kandidaten.join(', ')}.`,
      pfad: l.listPfad,
    });
  }
  if (l.unaufgenommen.length) {
    out.push({
      text:
        `${name} (${l.listPfad}): Nicht zugeordnet (Hinweis, kein Verstoß): ` +
        `${l.unaufgenommen.join(', ')} — die Profilierung nennt dafür keine passende Ausprägung.`,
      pfad: l.listPfad,
    });
  }
  return out;
}

/**
 * Der Zusatz bei Gleichstand (#119). Ohne ihn liest sich die Zuordnung als
 * festgestellt, obwohl sie nur **eine** unter gleichwertigen ist — und jeder
 * Befund an diesem Vorkommen haengt an genau dieser Wahl. Fuer Fehlbetraege
 * sagt das die Klasse `austauschbar` bereits; auf der Verstoss-Seite fehlte
 * dieselbe Ehrlichkeit.
 */
function gleichwertig(e: ZuordnungsEintrag): string {
  const teile = [...e.alternativen.map((a) => `„${a}"`)];
  if (e.auchUnaufgenommen) teile.push('gar nicht aufgenommen');
  if (!teile.length) return '';
  return (
    ` Gleichwertig lesbar auch als ${teile.join(', ')} — Befunde an diesem Vorkommen hängen ` +
    'an der gewählten Lesart.'
  );
}

/**
 * Die Zeilen einer Kennzeichen-Lage (#121). Der Bericht **schlaegt vor**, er
 * markiert nicht: die Aussage „dieser Wert macht das Vorkommen erkennbar" muss
 * der Profilierer tragen — automatisch gesetzte Kennzeichen brachten die
 * Autoritaetsfrage aus #107 durch die Hintertuer zurueck. Darum steht hier, was
 * eine Markierung bewirken **wuerde**, und wo eine gesetzte nichts bewirkt.
 */
export function kennzeichenZeilen(l: ListenLage): ReportEintrag[] {
  const name = pretty(blattName(l.listPfad));
  const out: ReportEintrag[] = [];

  for (const s of l.ohneTrennwirkung) {
    out.push({
      text:
        `${name} (${l.listPfad}): Das Kennzeichen „${s}" trennt die Vorkommen nicht — ` +
        'mindestens zwei Ausprägungen lassen dort denselben Wert zu. Allein ordnet es nichts zu.',
      pfad: l.listPfad,
    });
  }

  if (l.kandidaten.length) {
    const kopf = l.markiert.length
      ? `${name} (${l.listPfad}): Weitere Festlegungen kämen als Kennzeichen in Frage`
      : `${name} (${l.listPfad}): Ohne Kennzeichen bleiben die Festlegungen an „${l.auspNamen.join('", „')}" ungeprüft. Als Kennzeichen käme in Frage`;
    const teile = l.kandidaten.map((k) =>
      k.trennung === 'vollstaendig'
        ? `„${k.suffix}" (trennt alle Vorkommen)`
        : `„${k.suffix}" (trennt teilweise — ${k.offen.join(', ')} blieben ununterscheidbar)`,
    );
    out.push({ text: `${kopf}: ${teile.join('; ')}.`, pfad: l.listPfad });
  }

  return out;
}
