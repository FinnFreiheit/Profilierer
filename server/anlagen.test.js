import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { oeffneTestDb } from './testhelfer.js';
import { openDb, ANLAGE_MAX } from './db.js';
import { createApp } from './app.js';

const input = (over = {}) => ({
  name: 'antrag.xml',
  autor: 'F. Freiheit',
  xml: '<nachricht.dabag.antrag.2900001 xmlns="http://www.xjustiz.de"/>',
  nachricht: 'nachricht.dabag.antrag.2900001',
  fachmodul: 'dabag',
  groesse: 60,
  ...over,
});
const pdf = Buffer.from('%PDF-1.7\n%Test\n');
const PDF_NAME = 'Klage_0a7c4217.pdf';

test('anlAblegen → anlList/anlLaden: Bytes, Hash, Index-Zaehler', (t) => {
  const db = oeffneTestDb(t);
  const { id } = db.tmCreate(input());
  const out = db.anlAblegen(id, { dateiname: PDF_NAME, mime: 'application/pdf', daten: pdf }, 5);
  assert.equal(out.anlage.groesse, pdf.length);
  assert.equal(out.anlage.sha256, createHash('sha256').update(pdf).digest('hex'));
  assert.deepEqual(
    db.anlList(id).map((a) => a.dateiname),
    [PDF_NAME],
  );
  assert.equal(db.anlList(id)[0].daten, undefined); // Liste ohne Blob
  assert.deepEqual(db.anlLaden(id, PDF_NAME).daten, pdf);
  assert.equal(db.tmList()[0].anlagen, 1);
  assert.equal(db.anlList('gibtsnicht'), null);
});

test('anlAblegen ersetzt unter demselben Dateinamen; Schluessel ist case-sensitiv', (t) => {
  const db = oeffneTestDb(t);
  const { id } = db.tmCreate(input());
  db.anlAblegen(id, { dateiname: PDF_NAME, daten: pdf });
  db.anlAblegen(id, { dateiname: PDF_NAME, daten: Buffer.from('%PDF-neu') });
  db.anlAblegen(id, { dateiname: PDF_NAME.toUpperCase(), daten: pdf });
  assert.equal(db.anlList(id).length, 2);
  assert.equal(db.anlLaden(id, PDF_NAME).daten.toString(), '%PDF-neu');
});

test('Grenzen: Einzeldatei und Summe der Sendung', (t) => {
  const db = oeffneTestDb(t);
  const { id } = db.tmCreate(input());
  assert.equal(
    db.anlAblegen(id, { dateiname: 'a.pdf', daten: Buffer.alloc(ANLAGE_MAX + 1) }).fehler,
    'datei-zu-gross',
  );
  const gross = Buffer.alloc(ANLAGE_MAX);
  for (const n of ['1', '2', '3', '4', '5']) db.anlAblegen(id, { dateiname: n, daten: gross });
  assert.equal(db.anlAblegen(id, { dateiname: '6', daten: pdf }).fehler, 'sendung-zu-gross');
  // Ersetzen einer vorhandenen Datei zaehlt sie nicht doppelt.
  assert.ok(db.anlAblegen(id, { dateiname: '5', daten: gross }).anlage);
  assert.equal(db.anlAblegen('gibtsnicht', { dateiname: 'x', daten: pdf }).fehler, 'unbekannt');
});

test('tmDelete raeumt Anlagen ab, tmDuplicate kopiert sie', (t) => {
  const db = oeffneTestDb(t);
  const { id } = db.tmCreate(input());
  db.anlAblegen(id, { dateiname: PDF_NAME, daten: pdf });
  const kopie = db.tmDuplicate(id);
  assert.deepEqual(db.anlLaden(kopie.id, PDF_NAME).daten, pdf);
  db.tmDelete(id);
  assert.equal(db.anlLaden(id, PDF_NAME), null);
  assert.ok(db.anlLaden(kopie.id, PDF_NAME)); // Kopie unberuehrt
});

test('anlEntfernen', (t) => {
  const db = oeffneTestDb(t);
  const { id } = db.tmCreate(input());
  db.anlAblegen(id, { dateiname: PDF_NAME, daten: pdf });
  assert.equal(db.anlEntfernen(id, PDF_NAME), true);
  assert.equal(db.anlEntfernen(id, PDF_NAME), false);
  assert.equal(db.tmList()[0].anlagen, undefined);
});

async function server(t) {
  const db = openDb(':memory:');
  const srv = createApp(db, { nutzung: false, agKey: 'ag' }).listen(0);
  await new Promise((res) => srv.once('listening', res));
  t.after(() => {
    srv.close();
    db.close();
  });
  return { db, base: `http://127.0.0.1:${srv.address().port}/api` };
}

test('HTTP: Upload (roh), Liste, Download, Loeschen; Umlaute im Dateinamen', async (t) => {
  const { db, base } = await server(t);
  const { id } = db.tmCreate(input());
  const name = 'Ergänzung_Schriftsatz.pdf';
  const url = `${base}/testmessages/${id}/anlagen/${encodeURIComponent(name)}`;
  let r = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/pdf', 'x-autor': encodeURIComponent('Jörg') },
    body: pdf,
  });
  assert.equal(r.status, 201);
  const meta = await r.json();
  assert.equal(meta.dateiname, name);
  assert.equal(meta.autor, 'Jörg');
  r = await fetch(`${base}/testmessages/${id}/anlagen`);
  assert.deepEqual(
    (await r.json()).map((a) => a.dateiname),
    [name],
  );
  r = await fetch(url);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), pdf);
  r = await fetch(url, { method: 'DELETE' });
  assert.equal(r.status, 204);
  r = await fetch(url);
  assert.equal(r.status, 404);
});

test('HTTP: leere Datei 400, unbekannte Nachricht 404, abgenommen ohne AG-Schluessel 403', async (t) => {
  const { db, base } = await server(t);
  const { id } = db.tmCreate(input());
  const put = (tid, body, headers = {}) =>
    fetch(`${base}/testmessages/${tid}/anlagen/a.pdf`, { method: 'PUT', headers, body });
  assert.equal((await put(id, Buffer.alloc(0))).status, 400);
  assert.equal((await put('gibtsnicht', pdf)).status, 404);
  db.tmAbnahmeSetzen(id);
  assert.equal((await put(id, pdf)).status, 403);
  assert.equal((await put(id, pdf, { 'x-ag-key': 'ag' })).status, 201);
});
