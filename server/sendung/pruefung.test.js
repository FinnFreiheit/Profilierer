import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { plaetzeLesen, pruefen, zaehle } from './pruefung.js';
import { BESCHEID, DABAG_XML, KAUFVERTRAG } from './testfall.js';

const lies = (xml) => plaetzeLesen(new DOMParser().parseFromString(xml, 'application/xml'));
const regeln = (befunde, name) =>
  befunde
    .filter((b) => name === undefined || b.dateiname === name)
    .map((b) => b.regel)
    .sort();
const alle = (plaetze, quelle = 'platzhalter') =>
  plaetze.map((p) => ({ dateiname: p.dateiname, quelle }));

test('plaetzeLesen: je datei ein Platz mit Bestandteil, Bezug und Dokument', () => {
  const plaetze = lies(DABAG_XML);
  assert.equal(plaetze.length, 7);
  assert.deepEqual(plaetze[1], {
    dateiname: KAUFVERTRAG + '.pkcs7',
    bestandteil: '003',
    bezugsdateien: [KAUFVERTRAG],
    dokument: {
      id: '0a7c4217-ef6f-4303-82d7-60ca84fdf3f5',
      nummer: '1',
      anzeigename: undefined,
      dokumententyp: '102',
    },
  });
  assert.equal(plaetze[2].dokument.anzeigename, 'Einwilligung oder Genehmigung');
});

test('DABAG-Fall: Bezugsdatei des Bescheids und wörtliches UUID werden gefunden', () => {
  const plaetze = lies(DABAG_XML);
  const befunde = pruefen({ plaetze, dateien: alle(plaetze) });
  assert.deepEqual(regeln(befunde, BESCHEID + '.pkcs7'), ['bezug-fehlt', 'signatur-name']);
  assert.deepEqual(regeln(befunde, 'xjustiz_UUID.xml'), ['name-uuid', 'repraesentat-format']);
  assert.deepEqual(regeln(befunde, KAUFVERTRAG), []);
  assert.deepEqual(zaehle(befunde), { fehler: 2, hinweise: 2 });
});

test('fehlende Datei und Datei ohne Platz', () => {
  const plaetze = lies(DABAG_XML).slice(0, 2);
  const befunde = pruefen({
    plaetze,
    dateien: [
      { dateiname: KAUFVERTRAG, quelle: 'upload' },
      { dateiname: 'alt.pdf', quelle: 'upload' },
    ],
  });
  assert.deepEqual(regeln(befunde, KAUFVERTRAG + '.pkcs7'), ['fehlt']);
  assert.deepEqual(regeln(befunde, 'alt.pdf'), ['ohne-platz']);
});

const platz = (dateiname, bestandteil = '001', bezugsdateien = [], dokument = { id: 'd1' }) => ({
  dateiname,
  bestandteil,
  bezugsdateien,
  dokument,
});

test('Namensregeln: Laenge, Zeichen, Punkte', () => {
  const lang = 'a'.repeat(88) + '.pdf';
  const plaetze = [platz(lang), platz('Klage (1).pdf', '002'), platz('Kla.ge.pdf', '002')];
  const befunde = pruefen({ plaetze, dateien: alle(plaetze) });
  assert.deepEqual(regeln(befunde, lang), ['name-laenge']);
  assert.deepEqual(regeln(befunde, 'Klage (1).pdf'), ['name-zeichen']);
  // konkatenierte Endungen sind erlaubt — „Kla.ge.pdf" ist formal nicht unterscheidbar
  assert.deepEqual(regeln(befunde, 'Kla.ge.pdf'), []);
  const umlaute = [platz('Ergänzung_Größe-1.pdf')];
  assert.deepEqual(pruefen({ plaetze: umlaute, dateien: alle(umlaute) }), []);
});

test('Signatur: ohne Bezug, Bezug an Nicht-Signatur, weitere Signatur mit Ziffer', () => {
  const plaetze = [
    platz('a.pdf'),
    platz('a.pdf.pkcs7', '003', ['a.pdf']),
    platz('a.pdf.2.pkcs7', '003', ['a.pdf']),
    platz('b.pdf.pkcs7', '003'),
    platz('c.pdf', '002', ['a.pdf']),
  ];
  const befunde = pruefen({ plaetze, dateien: alle(plaetze) });
  assert.deepEqual(regeln(befunde, 'a.pdf.2.pkcs7'), []);
  assert.deepEqual(regeln(befunde, 'b.pdf.pkcs7'), ['signatur-ohne-bezug']);
  assert.deepEqual(regeln(befunde, 'c.pdf'), ['bezug-ohne-signatur']);
});

test('Original mehrfach je Dokument, doppelte Namen, Hauptname vorbehalten', () => {
  const plaetze = [
    platz('a.pdf'),
    platz('b.pdf'),
    platz('c.pdf', '001', [], { id: 'd2' }),
    platz('c.pdf', '002', [], { id: 'd3' }),
    platz('xjustiz_nachricht.xml', '001', [], { id: 'd4' }),
  ];
  const befunde = pruefen({ plaetze, dateien: alle(plaetze) });
  assert.deepEqual(regeln(befunde, 'b.pdf'), ['original-mehrfach']);
  assert.deepEqual(regeln(befunde, 'c.pdf'), ['doppelt']);
  assert.ok(regeln(befunde, 'xjustiz_nachricht.xml').includes('doppelt'));
});

test('Dateiart: Nicht-ERVV-Endung und Inhalt passt nicht zur Endung', () => {
  const plaetze = [platz('brief.docx'), platz('scan.pdf', '002'), platz('ok.tif', '013')];
  const enc = (s) => Buffer.from(s, 'latin1');
  const befunde = pruefen({
    plaetze,
    dateien: [
      { dateiname: 'brief.docx', quelle: 'upload', kopf: enc('PK\x03\x04') },
      { dateiname: 'scan.pdf', quelle: 'upload', kopf: enc('<html>') },
      { dateiname: 'ok.tif', quelle: 'upload', kopf: new Uint8Array([0x49, 0x49, 0x2a, 0]) },
    ],
  });
  assert.deepEqual(regeln(befunde, 'brief.docx'), ['dateiart']);
  assert.deepEqual(regeln(befunde, 'scan.pdf'), ['inhalt']);
  assert.deepEqual(regeln(befunde, 'ok.tif'), []);
});

test('eingebundene Nachricht: Namenskonvention', () => {
  const plaetze = [platz('bescheid.xml'), platz(BESCHEID, '001', [], { id: 'd2' })];
  const befunde = pruefen({ plaetze, dateien: alle(plaetze, 'testnachricht') });
  assert.deepEqual(regeln(befunde, 'bescheid.xml'), ['name-eingebunden']);
  assert.deepEqual(regeln(befunde, BESCHEID), []);
});
