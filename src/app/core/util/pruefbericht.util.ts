import { Pruefbericht, PruefberichtKopf } from '../../models/pruefbericht.model';
import { Verstoss } from '../services/konformitaet.service';
import { ReportEintrag } from '../../models/validation.model';

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

  if (k.nErweiterung)
    teile.push(
      `${k.nErweiterung} Befund${k.nErweiterung === 1 ? '' : 'e'} betrifft nachbeauftragte ` +
        'Elemente — sie zählen nicht gegen die Nachricht',
    );

  if (k.vorkommenUnzuordenbar)
    teile.push(
      'Benannte Vorkommen sind in einer XJustiz-Nachricht nicht kenntlich — geprüft wird ' +
        'ihre Anzahl, nicht ihre Zuordnung',
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
