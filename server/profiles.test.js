import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.js';
import { zaehleFortschritt, toEntry } from './fortschritt.js';

const docWith = (over = {}) => ({
  meta: { name: 'P', nachricht: 'nachricht.x', xjustizVersion: '3.6.2' },
  statuses: [],
  elemente: { a: { status: 's1' }, b: { status: 's1' }, c: {} },
  auspraegungen: { x: [{ id: '1', name: 'F' }, { id: '2', name: 'G' }] },
  ...over,
});

test('zaehleFortschritt zaehlt Status-Elemente und Ausprägungen', () => {
  assert.deepEqual(zaehleFortschritt(docWith()), { nStatus: 2, nAusp: 2 });
  assert.deepEqual(zaehleFortschritt({ elemente: {}, auspraegungen: {} }), { nStatus: 0, nAusp: 0 });
});

test('toEntry leitet die Index-Felder ab', () => {
  const e = toEntry('id1', docWith(), 42);
  assert.equal(e.id, 'id1');
  assert.equal(e.name, 'P');
  assert.equal(e.nachricht, 'nachricht.x');
  assert.equal(e.nStatus, 2);
  assert.equal(e.nAusp, 2);
  assert.equal(e.aktualisiert, 42);
});

test('create → list → load Roundtrip', () => {
  const db = openDb(':memory:');
  const { id, entry } = db.create(docWith());
  assert.equal(entry.nStatus, 2);
  const list = db.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, id);
  assert.equal(list[0].name, 'P');
  // Liste enthält kein doc.
  assert.equal(list[0].doc, undefined);
  const doc = db.load(id);
  assert.deepEqual(doc.elemente, docWith().elemente);
  db.close();
});

test('upsert aktualisiert Index-Spalten und Fortschritt', () => {
  const db = openDb(':memory:');
  const { id } = db.create(docWith());
  const entry = db.upsert(id, docWith({ elemente: { a: { status: 's1' } }, meta: { name: 'Neu' } }));
  assert.equal(entry.name, 'Neu');
  assert.equal(entry.nStatus, 1);
  assert.equal(db.list().length, 1); // kein Duplikat
  db.close();
});

test('list ist nach aktualisiert absteigend sortiert', () => {
  const db = openDb(':memory:');
  db.upsert('alt', docWith(), 1000);
  db.upsert('neu', docWith(), 2000);
  assert.deepEqual(db.list().map((e) => e.id), ['neu', 'alt']);
  db.close();
});

test('duplicate erzeugt neue id mit "(Kopie)"', () => {
  const db = openDb(':memory:');
  const { id } = db.create(docWith());
  const dup = db.duplicate(id);
  assert.notEqual(dup.id, id);
  assert.equal(dup.entry.name, 'P (Kopie)');
  assert.equal(db.list().length, 2);
  assert.equal(db.duplicate('gibtsnicht'), null);
  db.close();
});

test('rename ändert nur den Namen', () => {
  const db = openDb(':memory:');
  const { id } = db.create(docWith());
  const entry = db.rename(id, '  Umbenannt  ');
  assert.equal(entry.name, 'Umbenannt');
  assert.equal(db.load(id).meta.name, 'Umbenannt');
  assert.equal(db.rename('gibtsnicht', 'x'), null);
  db.close();
});

test('delete entfernt Dokument und Indexeintrag', () => {
  const db = openDb(':memory:');
  const { id } = db.create(docWith());
  assert.equal(db.delete(id), true);
  assert.equal(db.load(id), null);
  assert.equal(db.list().length, 0);
  assert.equal(db.delete(id), false);
  db.close();
});

test('importAll erhält id und aktualisiert-Zeitstempel', () => {
  const db = openDb(':memory:');
  const n = db.importAll([
    { id: 'fixed-1', doc: docWith(), aktualisiert: 1000 },
    { id: 'fixed-2', doc: docWith(), aktualisiert: 2000 },
    { id: 'kaputt' }, // ohne doc → übersprungen
  ]);
  assert.equal(n, 2);
  const list = db.list();
  assert.deepEqual(list.map((e) => e.id), ['fixed-2', 'fixed-1']);
  assert.equal(list[0].aktualisiert, 2000);
  db.close();
});

test('count spiegelt die Anzahl der Profile', () => {
  const db = openDb(':memory:');
  assert.equal(db.count(), 0);
  db.create(docWith());
  db.create(docWith());
  assert.equal(db.count(), 2);
  db.close();
});
