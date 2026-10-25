import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oeffneTestDb } from '../testhelfer.js';
import { openDb } from '../db.js';
import { createApp } from '../app.js';
import { bauen } from './bau.js';
import { BESCHEID, DABAG_XML } from './testfall.js';

const tm = (db, name, xml = DABAG_XML) =>
  db.tmCreate({ name, autor: 'F', xml, nachricht: 'nachricht.x', fachmodul: 'x', groesse: 1 }).id;
const geaendert = (db, id) => !!db.tmEintrag(id).geaendertSeitAbnahme;

test('Abnahme mit Paket: Bytes eingefroren, Kennzeichen abnahmeSendung', (t) => {
  const db = oeffneTestDb(t);
  const id = tm(db, 'Antrag');
  const zip = Buffer.from('PK-Paket-von-damals');
  const entry = db.tmAbnahmeSetzen(id, { zip });
  assert.equal(entry.abnahmeSendung, true);
  assert.deepEqual(db.tmLoadAbnahmeSendung(id), zip);
  assert.equal(geaendert(db, id), false);
  db.tmAbnahmeEntfernen(id);
  assert.equal(db.tmLoadAbnahmeSendung(id), null);
  assert.equal(db.tmEintrag(id).abnahmeSendung, undefined);
});

test('geaendert seit Abnahme: Upload, Einbindung, eingebundene Nachricht und XML zaehlen', (t) => {
  const db = oeffneTestDb(t);
  const antrag = tm(db, 'Antrag');
  const bescheid = tm(db, 'Bescheid', '<b/>');
  db.einbSetzen(antrag, { dateiname: BESCHEID, zielId: bescheid });
  db.tmAbnahmeSetzen(antrag, {});
  assert.equal(geaendert(db, antrag), false);

  db.anlAblegen(antrag, { dateiname: 'kv.pdf', daten: Buffer.from('%PDF-1') });
  assert.equal(geaendert(db, antrag), true, 'neuer Upload');
  db.tmAbnahmeSetzen(antrag, {});
  db.anlAblegen(antrag, { dateiname: 'kv.pdf', daten: Buffer.from('%PDF-1') });
  assert.equal(geaendert(db, antrag), false, 'derselbe Inhalt erneut hochgeladen');

  db.tmUpdate(bescheid, { xml: '<b>neu</b>' });
  assert.equal(geaendert(db, antrag), true, 'eingebundene Nachricht geaendert');
  db.tmAbnahmeSetzen(antrag, {});
  db.einbEntfernen(antrag, BESCHEID);
  assert.equal(geaendert(db, antrag), true, 'Einbindung geloest');
  db.tmAbnahmeSetzen(antrag, {});
  db.tmUpdate(antrag, { xml: DABAG_XML + ' ' });
  assert.equal(geaendert(db, antrag), true, 'XML geaendert');
});

test('ein neuer Export aendert den Abnahme-Stand nicht (Platzhalter, Testsignaturen)', async (t) => {
  const db = oeffneTestDb(t);
  const id = tm(db, 'Antrag');
  const laden = (x) => db.sendungQuelle(x);
  db.tmAbnahmeSetzen(id, { zip: (await bauen(laden(id), laden)).zip });
  await bauen(laden(id), laden);
  assert.equal(geaendert(db, id), false);
});

test('HTTP: Abnahme baut das Paket, GET liefert dieselben Bytes', async (t) => {
  const db = openDb(':memory:');
  const srv = createApp(db, { nutzung: false, agKey: 'ag' }).listen(0);
  await new Promise((res) => srv.once('listening', res));
  t.after(() => {
    srv.close();
    db.close();
  });
  const base = `http://127.0.0.1:${srv.address().port}/api/testmessages`;
  const id = tm(db, 'Antrag_Notar.xml');
  assert.equal((await fetch(`${base}/${id}/abnahme/sendung`)).status, 404);
  const r = await fetch(`${base}/${id}/abnahme`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ag-key': 'ag' },
    body: JSON.stringify({ kommentar: 'ok' }),
  });
  assert.equal(r.status, 201);
  assert.equal((await r.json()).entry.abnahmeSendung, true);
  const a = Buffer.from(await (await fetch(`${base}/${id}/abnahme/sendung`)).arrayBuffer());
  const b = Buffer.from(await (await fetch(`${base}/${id}/abnahme/sendung`)).arrayBuffer());
  assert.ok(a.length > 100);
  assert.deepEqual(a, b, 'eingefroren, nicht neu gebaut');
  const res = await fetch(`${base}/${id}/abnahme/sendung`);
  assert.match(res.headers.get('content-disposition'), /Antrag_Notar_sendung\.freigegeben\.zip/);
});
