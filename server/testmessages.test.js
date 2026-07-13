import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.js';

const input = (over = {}) => ({
  name: 'antrag.xml',
  xml: '<nachricht.dabag.antrag.2900001 xmlns="http://www.xjustiz.de"/>',
  nachricht: 'nachricht.dabag.antrag.2900001',
  fachmodul: 'dabag',
  xjustizVersion: '3.6.2',
  groesse: 60,
  ...over,
});

test('tmCreate → tmList Roundtrip (Index ohne xml)', () => {
  const db = openDb(':memory:');
  const { id, entry } = db.tmCreate(input());
  assert.equal(entry.id, id);
  assert.equal(entry.name, 'antrag.xml');
  assert.equal(entry.fachmodul, 'dabag');
  assert.equal(entry.xjustizVersion, '3.6.2');
  const list = db.tmList();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, id);
  assert.equal(list[0].xml, undefined); // Liste enthält kein xml
  db.close();
});

test('tmLoadXml gibt das Roh-XML byte-gleich zurück', () => {
  const db = openDb(':memory:');
  const { id } = db.tmCreate(input());
  assert.equal(db.tmLoadXml(id), input().xml);
  assert.equal(db.tmLoadXml('gibtsnicht'), null);
  db.close();
});

test('tmList ist nach aktualisiert absteigend sortiert', () => {
  const db = openDb(':memory:');
  const a = db.tmCreate(input({ name: 'alt' }), 1000);
  const b = db.tmCreate(input({ name: 'neu' }), 2000);
  assert.deepEqual(db.tmList().map((e) => e.id), [b.id, a.id]);
  db.close();
});

test('tmUpdate ändert Notiz und Name, setzt aktualisiert', () => {
  const db = openDb(':memory:');
  const { id } = db.tmCreate(input(), 1000);
  const entry = db.tmUpdate(id, { notiz: 'Referenzfall' }, 3000);
  assert.equal(entry.notiz, 'Referenzfall');
  assert.equal(entry.name, 'antrag.xml'); // Name unverändert
  assert.equal(entry.aktualisiert, 3000);
  const umbenannt = db.tmUpdate(id, { name: 'Neu' }, 4000);
  assert.equal(umbenannt.name, 'Neu');
  assert.equal(umbenannt.notiz, 'Referenzfall'); // Notiz bleibt
  assert.equal(db.tmUpdate('gibtsnicht', { notiz: 'x' }), null);
  db.close();
});

test('tmDelete entfernt Nachricht und XML', () => {
  const db = openDb(':memory:');
  const { id } = db.tmCreate(input());
  assert.equal(db.tmDelete(id), true);
  assert.equal(db.tmLoadXml(id), null);
  assert.equal(db.tmList().length, 0);
  assert.equal(db.tmDelete(id), false);
  db.close();
});

test('testmessages und profiles teilen sich die DB ohne Kollision', () => {
  const db = openDb(':memory:');
  db.create({ meta: { name: 'P' }, statuses: [], elemente: {}, auspraegungen: {} });
  db.tmCreate(input());
  assert.equal(db.list().length, 1);
  assert.equal(db.tmList().length, 1);
  db.close();
});
