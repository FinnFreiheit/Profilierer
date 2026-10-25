/**
 * Paketpruefung der Testsendung (ADR 0024) — zustandslose Regeln ueber die
 * Plaetze (aus der XML) und die Dateien, die auf ihnen liegen. Ohne Framework-
 * und Schema-Abhaengigkeit: der Server liest die XML mit @xmldom/xmldom, der
 * Browser mit DOMParser; beide reichen ein Document herein, benutzt werden nur
 * DOM-Level-2-Methoden.
 *
 * Die Regeln warnen, sie sperren nicht: Testdaten duerfen absichtlich
 * fehlerhaft sein (Negativtests). Quelle der Namensregeln ist die
 * Dokumentation von `dateiname` im Grunddatensatz.
 */

/** Bestandteiltypen (Codeliste GDS.Bestandteiltyp), die die Regeln kennen. */
export const BESTANDTEIL = { original: '001', repraesentat: '002', signatur: '003' };

/** Dateiname der Hauptnachricht im Umschlag (Doku zu `dateiname`). */
export const HAUPTNAME = 'xjustiz_nachricht.xml';

/** Endungen, die die ERVV zulaesst bzw. die als Signaturdatei ueblich sind. */
const ERVV_ENDUNGEN = new Set(['pdf', 'tif', 'tiff', 'xml', 'pkcs7', 'p7s', 'p7m', 'sig']);
const SIGNATUR_ENDUNGEN = new Set(['pkcs7', 'p7s', 'p7m', 'sig']);
const MAX_LAENGE = 90;

// Buchstaben des deutschen Alphabets, Ziffern, Unterstrich, Minus; Punkte nur
// als Trenner vor (ggf. konkatenierten) Endungen.
const ZEICHEN = /^[A-Za-zÄÖÜäöüß0-9_-]+(\.[A-Za-z0-9]+)+$/;
const UUID_WOERTLICH = /(^|[_.-])UUID([_.-]|$)/;
const EINGEBUNDEN = /^xjustiz_nachricht_[0-9A-Za-z_-]+\.xml$/;

// ── Plaetze lesen ─────────────────────────────────────────────────────

function kinder(el, name) {
  const out = [];
  for (let n = el.firstChild; n; n = n.nextSibling)
    if (n.nodeType === 1 && n.localName === name) out.push(n);
  return out;
}

function text(el, name) {
  const k = kinder(el, name)[0];
  return k ? (k.textContent ?? '').trim() : undefined;
}

/** `code` eines Codelisten-Elements (z. B. bestandteil, dokumententyp). */
function code(el, name) {
  const k = kinder(el, name)[0];
  return k ? text(k, 'code') : undefined;
}

function vorfahr(el, name) {
  for (let p = el.parentNode; p && p.nodeType === 1; p = p.parentNode)
    if (p.localName === name) return p;
  return null;
}

/**
 * Alle Plaetze einer Nachricht in Dokumentreihenfolge: je `datei`-Element mit
 * `dateiname` einer. Das Dokument wird ueber den naechsten `dokument`-Vorfahren
 * zugeordnet (Kennung und Anzeige-Angaben fuer Befunde und Platzhalter).
 */
export function plaetzeLesen(doc) {
  const out = [];
  const dateien = doc.getElementsByTagNameNS('*', 'datei');
  for (let i = 0; i < dateien.length; i++) {
    const datei = dateien[i];
    const dateiname = text(datei, 'dateiname');
    if (dateiname === undefined) continue;
    const dok = vorfahr(datei, 'dokument');
    const ident = dok ? kinder(dok, 'identifikation')[0] : undefined;
    const fach = dok ? (kinder(dok, 'xjustiz.fachspezifischeDaten')[0] ?? dok) : undefined;
    out.push({
      dateiname,
      bestandteil: code(datei, 'bestandteil'),
      bezugsdateien: kinder(datei, 'dateiname.bezugsdatei').map((b) =>
        (b.textContent ?? '').trim(),
      ),
      dokument: dok
        ? {
            id: ident ? text(ident, 'id') : undefined,
            nummer: ident ? text(ident, 'nummerImUebergeordnetenContainer') : undefined,
            anzeigename: fach ? text(fach, 'anzeigename') : undefined,
            dokumententyp: fach ? code(fach, 'dokumententyp') : undefined,
          }
        : undefined,
    });
  }
  return out;
}

// ── Planen ────────────────────────────────────────────────────────────

const endungVon = (name) => {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
};

/** Womit der Export einen leeren Platz selbst fuellen kann (oder null). */
function erzeugbar(platz) {
  if (platz.bestandteil === BESTANDTEIL.signatur)
    return platz.bezugsdateien.length ? 'signatur' : null;
  return endungVon(platz.dateiname) === 'pdf' ? 'platzhalter' : null;
}

/**
 * Welche Datei auf welchem Platz liegen wird, ohne Bytes: Upload vor
 * Platzhalter-PDF; eine Signatur wird nur erzeugt, wenn ihre Bezugsdatei in
 * der Sendung liegt. Doppelte Namen belegen einen Platz einmal. Ergebnis in
 * Ausgabereihenfolge (erzeugte Signaturen zuletzt, sie brauchen die Bytes
 * ihrer Bezugsdatei).
 *
 * @param {Array} plaetze aus `plaetzeLesen`
 * @param {Set<string>} uploadNamen Dateinamen der hochgeladenen Anlagen
 * @returns {Array<{ dateiname, quelle, platz }>}
 */
export function dateienPlanen(plaetze, uploadNamen) {
  const out = [];
  const belegt = new Set();
  for (const p of plaetze) {
    if (belegt.has(p.dateiname)) continue;
    const art = uploadNamen.has(p.dateiname) ? 'upload' : erzeugbar(p);
    if (!art || art === 'signatur') continue;
    belegt.add(p.dateiname);
    out.push({ dateiname: p.dateiname, quelle: art, platz: p });
  }
  for (const p of plaetze) {
    if (belegt.has(p.dateiname) || erzeugbar(p) !== 'signatur') continue;
    if (!belegt.has(p.bezugsdateien[0])) continue;
    belegt.add(p.dateiname);
    out.push({ dateiname: p.dateiname, quelle: 'signatur', platz: p });
  }
  return out;
}

// ── Pruefen ───────────────────────────────────────────────────────────

/** Passt der Dateianfang zur Endung? undefined = nicht beurteilbar. */
function inhaltPasst(ext, kopf) {
  if (!kopf || !kopf.length) return undefined;
  const b = (i) => kopf[i];
  const ascii = String.fromCharCode(...kopf.slice(0, 16));
  if (ext === 'pdf') return ascii.startsWith('%PDF');
  if (ext === 'tif' || ext === 'tiff')
    return (
      (b(0) === 0x49 && b(1) === 0x49 && b(2) === 0x2a) ||
      (b(0) === 0x4d && b(1) === 0x4d && b(3) === 0x2a)
    );
  if (ext === 'xml') return /^(\uFEFF|\u00EF\u00BB\u00BF)?\s*</.test(ascii);
  if (SIGNATUR_ENDUNGEN.has(ext)) return b(0) === 0x30 || ascii.startsWith('-----BEGIN');
  return undefined;
}

/**
 * Prueft eine Sendung.
 *
 * @param {object} p
 * @param {Array} p.plaetze   aus `plaetzeLesen` (bei eingebundenen Nachrichten
 *                            alle Ebenen zusammen)
 * @param {Array} p.dateien   vorhandene Dateien `{ dateiname, quelle, kopf? }`;
 *                            `quelle` 'upload' | 'platzhalter' | 'signatur' |
 *                            'testnachricht', `kopf` die ersten Bytes
 * @returns {Array} Befunde `{ regel, schwere: 'fehler' | 'hinweis', dateiname, text }`
 */
export function pruefen({ plaetze, dateien }) {
  const befunde = [];
  const melde = (regel, schwere, dateiname, txt) =>
    befunde.push({ regel, schwere, dateiname, text: txt });

  const vorhanden = new Map(dateien.map((d) => [d.dateiname, d]));
  const platzNamen = new Set(plaetze.map((p) => p.dateiname));

  // Doppelte Namen (auch mit der Hauptnachricht).
  const gezaehlt = new Map();
  for (const p of plaetze) gezaehlt.set(p.dateiname, (gezaehlt.get(p.dateiname) ?? 0) + 1);
  for (const [name, n] of gezaehlt)
    if (n > 1) melde('doppelt', 'fehler', name, `Dateiname kommt ${n}-mal in der Sendung vor.`);
  if (platzNamen.has(HAUPTNAME))
    melde('doppelt', 'fehler', HAUPTNAME, `${HAUPTNAME} ist der Hauptnachricht vorbehalten.`);

  for (const p of plaetze) {
    const name = p.dateiname;
    const ext = endungVon(name);
    const datei = vorhanden.get(name);

    if (!datei) melde('fehlt', 'fehler', name, 'Keine Datei auf diesem Platz.');

    // Namensregeln
    if (name.length > MAX_LAENGE)
      melde('name-laenge', 'fehler', name, `Länger als ${MAX_LAENGE} Zeichen (${name.length}).`);
    if (UUID_WOERTLICH.test(name))
      melde('name-uuid', 'fehler', name, 'Enthält wörtlich „UUID" statt einer echten UUID.');
    if (!ZEICHEN.test(name))
      melde(
        'name-zeichen',
        'fehler',
        name,
        'Unzulässige Zeichen oder Punkte (erlaubt: Buchstaben, Ziffern, _ und -, Punkte nur vor Endungen).',
      );

    // Bezugsdateien und Signaturen
    if (p.bestandteil === BESTANDTEIL.signatur) {
      if (!p.bezugsdateien.length)
        melde('signatur-ohne-bezug', 'fehler', name, 'Signaturdatei ohne dateiname.bezugsdatei.');
    } else if (p.bezugsdateien.length) {
      melde(
        'bezug-ohne-signatur',
        'hinweis',
        name,
        'dateiname.bezugsdatei ist nur für Signaturdateien vorgesehen.',
      );
    }
    for (const bezug of p.bezugsdateien)
      if (!platzNamen.has(bezug))
        melde(
          'bezug-fehlt',
          'fehler',
          name,
          `Bezugsdatei „${bezug}" gibt es in der Sendung nicht.`,
        );

    if (p.bestandteil === BESTANDTEIL.repraesentat && ext !== 'pdf')
      melde(
        'repraesentat-format',
        'hinweis',
        name,
        'Ein Repräsentat ist laut Codeliste ein PDF/A.',
      );

    // Dateiart
    if (ext && !ERVV_ENDUNGEN.has(ext))
      melde('dateiart', 'hinweis', name, `Endung .${ext} gehört nicht zu den ERVV-Formaten.`);
    if (datei && inhaltPasst(ext, datei.kopf) === false)
      melde('inhalt', 'hinweis', name, `Inhalt passt nicht zur Endung .${ext}.`);
    if (datei?.quelle === 'testnachricht' && !EINGEBUNDEN.test(name))
      melde(
        'name-eingebunden',
        'hinweis',
        name,
        'Eingebundene XJustiz-Nachrichten heißen xjustiz_nachricht_<UUID>.xml.',
      );
  }

  // Erste Signatur heisst wie die Bezugsdatei plus Endung.
  const sigJeBezug = new Map();
  for (const p of plaetze)
    if (p.bestandteil === BESTANDTEIL.signatur)
      for (const bezug of p.bezugsdateien)
        sigJeBezug.set(bezug, [...(sigJeBezug.get(bezug) ?? []), p.dateiname]);
  for (const [bezug, sigs] of sigJeBezug)
    if (!sigs.some((s) => s.startsWith(bezug + '.') && !s.slice(bezug.length + 1).includes('.')))
      melde(
        'signatur-name',
        'hinweis',
        sigs[0],
        `Die Signaturdatei soll „${bezug}" plus Endung heißen (z. B. ${bezug}.pkcs7).`,
      );

  // Original hoechstens einmal je Dokument.
  const originale = new Map();
  for (const p of plaetze) {
    if (p.bestandteil !== BESTANDTEIL.original || !p.dokument) continue;
    const k = p.dokument.id ?? p.dokument.nummer ?? '';
    originale.set(k, [...(originale.get(k) ?? []), p.dateiname]);
  }
  for (const namen of originale.values())
    if (namen.length > 1)
      melde(
        'original-mehrfach',
        'fehler',
        namen[1],
        `Bestandteil „Original" mehrfach im selben Dokument (${namen.join(', ')}).`,
      );

  // Dateien ohne Platz (Upload unter einem Namen, den die XML nicht nennt).
  for (const d of dateien)
    if (!platzNamen.has(d.dateiname) && d.dateiname !== HAUPTNAME)
      melde(
        'ohne-platz',
        'hinweis',
        d.dateiname,
        'Die XML nennt diese Datei nicht; sie wird nicht exportiert.',
      );

  return befunde;
}

/** Anzahl Fehler und Hinweise. */
export function zaehle(befunde) {
  let fehler = 0;
  for (const b of befunde) if (b.schwere === 'fehler') fehler++;
  return { fehler, hinweise: befunde.length - fehler };
}
