import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createApp } from '../app.js';
import { verifiziere } from './testhilfe.js';
import { DABAG_XML, KAUFVERTRAG } from './testfall.js';

async function server(t) {
  const db = openDb(':memory:');
  const srv = createApp(db, { nutzung: false }).listen(0);
  await new Promise((res) => srv.once('listening', res));
  t.after(() => {
    srv.close();
    db.close();
  });
  const id = db.tmCreate({
    name: 'Antrag',
    autor: 'F',
    xml: DABAG_XML,
    nachricht: 'nachricht.x',
    fachmodul: 'x',
    groesse: 1,
  }).id;
  const url = (n) =>
    `http://127.0.0.1:${srv.address().port}/api/testmessages/${id}/anlagen/${encodeURIComponent(n)}/erzeugen`;
  return { db, id, url };
}

test('Erzeugen: Platzhalter-PDF wird als Upload abgelegt', async (t) => {
  const { db, id, url } = await server(t);
  const r = await fetch(url(KAUFVERTRAG), { method: 'POST' });
  assert.equal(r.status, 201);
  assert.deepEqual((await r.json()).erzeugt, [KAUFVERTRAG]);
  const a = db.anlLaden(id, KAUFVERTRAG);
  assert.equal(a.mime, 'application/pdf');
  assert.equal(a.daten.subarray(0, 5).toString(), '%PDF-');
});

test('Erzeugen einer Testsignatur haelt das Platzhalter-PDF mit fest, Signatur passt', async (t) => {
  const { db, id, url } = await server(t);
  const r = await fetch(url(KAUFVERTRAG + '.pkcs7'), { method: 'POST' });
  assert.deepEqual((await r.json()).erzeugt, [KAUFVERTRAG, KAUFVERTRAG + '.pkcs7']);
  verifiziere(db.anlLaden(id, KAUFVERTRAG + '.pkcs7').daten, db.anlLaden(id, KAUFVERTRAG).daten);
});

test('Erzeugen ueber ein hochgeladenes PDF signiert genau dessen Bytes', async (t) => {
  const { db, id, url } = await server(t);
  const pdf = Buffer.from('%PDF-1.7 echt');
  db.anlAblegen(id, { dateiname: KAUFVERTRAG, daten: pdf });
  const r = await fetch(url(KAUFVERTRAG + '.pkcs7'), { method: 'POST' });
  assert.deepEqual((await r.json()).erzeugt, [KAUFVERTRAG + '.pkcs7']);
  verifiziere(db.anlLaden(id, KAUFVERTRAG + '.pkcs7').daten, pdf);
});

test('Erzeugen: belegter oder nicht erzeugbarer Platz → 409', async (t) => {
  const { db, id, url } = await server(t);
  db.anlAblegen(id, { dateiname: KAUFVERTRAG, daten: Buffer.from('%PDF') });
  assert.equal((await fetch(url(KAUFVERTRAG), { method: 'POST' })).status, 409);
  assert.equal((await fetch(url('xjustiz_UUID.xml'), { method: 'POST' })).status, 409);
});
