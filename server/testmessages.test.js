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
  assert.deepEqual(
    db.tmList().map((e) => e.id),
    [b.id, a.id],
  );
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

test('tmBackfillVersionen ergänzt fehlende Version aus dem XML', () => {
  const db = openDb(':memory:');
  const xml =
    '<nachricht.dabag.antrag.2900001 xmlns="http://www.xjustiz.de">' +
    '<nachrichtenkopf xjustizVersion="3.6.2"/></nachricht.dabag.antrag.2900001>';
  const { id } = db.tmCreate(input({ xjustizVersion: undefined, xml }));
  assert.equal(db.tmList()[0].xjustizVersion, undefined); // zunächst ohne Version
  assert.equal(db.tmBackfillVersionen(), 1);
  assert.equal(db.tmList()[0].xjustizVersion, '3.6.2');
  assert.equal(db.tmBackfillVersionen(), 0); // idempotent
  assert.equal(id, db.tmList()[0].id);
  db.close();
});

test('tmBackfillVersionen lässt Nachrichten ohne Versionsattribut unberührt', () => {
  const db = openDb(':memory:');
  db.tmCreate(
    input({ xjustizVersion: undefined, xml: '<nachricht.x xmlns="http://www.xjustiz.de"/>' }),
  );
  assert.equal(db.tmBackfillVersionen(), 0);
  assert.equal(db.tmList()[0].xjustizVersion, undefined);
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

test('gefuehrte Erstellung: entwurf/fortschritt/entscheidungen Roundtrip', () => {
  const db = openDb(':memory:');
  const stand = {
    msgName: 'nachricht.dabag.antrag.2900001',
    xjustizVersion: '3.6.2',
    profil: { meta: {}, statuses: [], elemente: { 'a/b': { beispiel: '1' } }, auspraegungen: {} },
  };
  const { id, entry } = db.tmCreate(
    input({ entwurf: true, fortschritt: { x: 3, y: 10 }, entscheidungen: stand }),
  );
  assert.equal(entry.entwurf, true);
  assert.deepEqual(entry.fortschritt, { x: 3, y: 10 });
  assert.equal(entry.gefuehrt, true);
  assert.deepEqual(db.tmLoadEntscheidungen(id), stand);
  // Liste trägt Kennzeichen + Fortschritt, aber nicht den Stand selbst.
  const row = db.tmList()[0];
  assert.equal(row.entwurf, true);
  assert.equal(row.gefuehrt, true);
  assert.equal(row.entscheidungen, undefined);
  db.close();
});

test('tmUpdate aktualisiert XML/Entwurf/Fortschritt/Entscheidungen selektiv', () => {
  const db = openDb(':memory:');
  const stand = {
    msgName: 'n',
    profil: { meta: {}, statuses: [], elemente: {}, auspraegungen: {} },
  };
  const { id } = db.tmCreate(
    input({ entwurf: true, fortschritt: { x: 1, y: 5 }, entscheidungen: stand }),
  );
  // Nur Notiz ändern: gefuehrte Felder bleiben.
  let e = db.tmUpdate(id, { notiz: 'x' });
  assert.equal(e.entwurf, true);
  assert.deepEqual(e.fortschritt, { x: 1, y: 5 });
  // Fertigstellen: neues XML, entwurf weg, Fortschritt voll.
  e = db.tmUpdate(id, { xml: '<neu/>', entwurf: false, fortschritt: { x: 5, y: 5 } });
  assert.equal(e.entwurf, undefined);
  assert.deepEqual(e.fortschritt, { x: 5, y: 5 });
  assert.equal(e.groesse, '<neu/>'.length);
  assert.equal(db.tmLoadXml(id), '<neu/>');
  assert.deepEqual(db.tmLoadEntscheidungen(id), stand); // unberührt
  db.close();
});

test('tmLoadEntscheidungen: null ohne Stand (hochgeladene Nachricht)', () => {
  const db = openDb(':memory:');
  const { id, entry } = db.tmCreate(input());
  assert.equal(entry.gefuehrt, undefined);
  assert.equal(db.tmLoadEntscheidungen(id), null);
  assert.equal(db.tmLoadEntscheidungen('gibtsnicht'), null);
  db.close();
});

test('Profil-Bindung: Herkunft im Index, eingefrorene Kopie separat lesbar', () => {
  const db = openDb(':memory:');
  const vorgabe = {
    meta: { name: 'Nachlass-Szenario', nachricht: 'nachricht.dabag.antrag.2900001' },
    statuses: [{ id: 'v9', name: 'nicht verwendet', farbe: '#888780', wirkung: 'ausgeschlossen' }],
    elemente: { 'a/b': { status: 'v9' } },
    auspraegungen: {},
    erweiterungen: {},
  };
  const { id, entry } = db.tmCreate(
    input({ profilId: 'p1', profilName: 'Nachlass-Szenario', fassung: 'v3', vorgabe }),
  );
  // Die schlanke Index-Antwort traegt die Herkunft mit (Kachel ohne Zusatz-Request).
  assert.equal(entry.profilId, 'p1');
  assert.equal(entry.profilName, 'Nachlass-Szenario');
  assert.equal(entry.fassung, 'v3');
  const row = db.tmList()[0];
  assert.equal(row.profilId, 'p1');
  assert.equal(row.fassung, 'v3');
  assert.equal(row.vorgabe, undefined); // Kopie nicht im Index
  assert.deepEqual(db.tmLoadVorgabe(id), vorgabe);
  db.close();
});

test('eingefrorene Kopie bleibt lesbar, nachdem die Profilierung geloescht wurde', () => {
  const db = openDb(':memory:');
  const doc = { meta: { name: 'P' }, statuses: [], elemente: { 'a/b': {} }, auspraegungen: {} };
  const pid = db.create(doc).id;
  const { id } = db.tmCreate(
    input({ profilId: pid, profilName: 'P', fassung: 'v1', vorgabe: doc }),
  );
  db.delete(pid);
  assert.equal(db.list().length, 0);
  const entry = db.tmList()[0];
  assert.equal(entry.profilId, pid); // Herkunft bleibt als Historie
  assert.deepEqual(db.tmLoadVorgabe(id), doc);
  db.close();
});

test('tmUpdate laesst die eingefrorene Kopie und die Herkunft unberuehrt', () => {
  const db = openDb(':memory:');
  const vorgabe = { meta: {}, statuses: [], elemente: { 'a/b': {} }, auspraegungen: {} };
  const { id } = db.tmCreate(input({ profilId: 'p1', profilName: 'P', fassung: 'v2', vorgabe }));
  const e = db.tmUpdate(id, { xml: '<neu/>', entwurf: false, profilId: 'p2', vorgabe: null });
  assert.equal(e.profilId, 'p1');
  assert.equal(e.fassung, 'v2');
  assert.deepEqual(db.tmLoadVorgabe(id), vorgabe);
  db.close();
});

test('Alt-Eintraege ohne Bindung bleiben lesbar und aenderbar', () => {
  const db = openDb(':memory:');
  const { id, entry } = db.tmCreate(input());
  assert.equal(entry.profilId, undefined);
  assert.equal(entry.profilName, undefined);
  assert.equal(entry.fassung, undefined);
  assert.equal(db.tmLoadVorgabe(id), null);
  const e = db.tmUpdate(id, { notiz: 'weiterhin änderbar' });
  assert.equal(e.notiz, 'weiterhin änderbar');
  assert.equal(e.profilId, undefined);
  db.close();
});

// ── Badge "Profil weiterentwickelt" (Kennzeichen im schlanken Index) ────

/** Ein vollstaendiges Profil-Dokument als Bindungs-Vorlage. */
const profilDoc = (over = {}) => ({
  meta: { name: 'Nachlass-Szenario', nachricht: 'nachricht.dabag.antrag.2900001' },
  statuses: [{ id: 's1', name: 'zwingend', farbe: '#2f6f3e', wirkung: 'pflicht' }],
  elemente: { 'nachricht.dabag.antrag.2900001/grunddaten': { status: 's1' } },
  auspraegungen: {},
  erweiterungen: {},
  ...over,
});

test('Kennzeichen: gebundene Fassung entspricht dem aktuellen Stand → kein Badge', () => {
  const db = openDb(':memory:');
  const doc = profilDoc();
  const { id: pid } = db.create(doc);
  db.tmCreate(
    input({ profilId: pid, profilName: 'Nachlass-Szenario', fassung: 'v1', vorgabe: doc }),
  );
  assert.equal(db.tmList()[0].profilWeiterentwickelt, undefined);
  db.close();
});

test('Kennzeichen: Profilierung weiterentwickelt → Badge im Index', () => {
  const db = openDb(':memory:');
  const doc = profilDoc();
  const { id: pid } = db.create(doc);
  const { id } = db.tmCreate(input({ profilId: pid, fassung: 'v1', vorgabe: doc }));
  db.upsert(
    pid,
    profilDoc({
      elemente: { 'nachricht.dabag.antrag.2900001/grunddaten': { status: 's1', min: '2' } },
    }),
  );
  assert.equal(db.tmList()[0].profilWeiterentwickelt, true);
  assert.equal(db.tmUpdate(id, { notiz: 'x' }).profilWeiterentwickelt, true);
  db.close();
});

test('Kennzeichen: erneutes Speichern ohne fachliche Aenderung ist keine Weiterentwicklung', () => {
  const db = openDb(':memory:');
  const doc = profilDoc();
  const { id: pid } = db.create(doc);
  db.tmCreate(input({ profilId: pid, fassung: 'v1', vorgabe: doc }));
  // Autosave setzt meta.gespeichert neu und serialisiert die Schluessel anders —
  // beides ist keine Aussageaenderung und darf kein Badge ausloesen.
  db.upsert(pid, {
    erweiterungen: {},
    auspraegungen: {},
    elemente: { 'nachricht.dabag.antrag.2900001/grunddaten': { status: 's1' } },
    statuses: [{ wirkung: 'pflicht', farbe: '#2f6f3e', name: 'zwingend', id: 's1' }],
    meta: {
      nachricht: 'nachricht.dabag.antrag.2900001',
      name: 'Nachlass-Szenario',
      gespeichert: '2026-07-31',
    },
  });
  assert.equal(db.tmList()[0].profilWeiterentwickelt, undefined);
  db.close();
});

test('Kennzeichen: keines ohne Bindung und keines nach dem Loeschen der Profilierung', () => {
  const db = openDb(':memory:');
  const doc = profilDoc();
  const { id: pid } = db.create(doc);
  db.tmCreate(input({ name: 'ohne Bindung' }));
  db.tmCreate(input({ name: 'gebunden', profilId: pid, fassung: 'v1', vorgabe: doc }));
  db.upsert(pid, profilDoc({ auspraegungen: { a: [{ id: 'x1', name: 'Notar/in' }] } }));
  const gebunden = db.tmList().find((e) => e.name === 'gebunden');
  assert.equal(
    db.tmList().find((e) => e.name === 'ohne Bindung').profilWeiterentwickelt,
    undefined,
  );
  assert.equal(gebunden.profilWeiterentwickelt, true);
  // Ohne die Profilierung gibt es keinen "aktuellen Stand" mehr — die Herkunft
  // bleibt als Historie, das Badge faellt weg.
  db.delete(pid);
  const nachher = db.tmList().find((e) => e.name === 'gebunden');
  assert.equal(nachher.profilId, pid);
  assert.equal(nachher.profilWeiterentwickelt, undefined);
  db.close();
});

test('tmList filtert nach Profilierung', () => {
  const db = openDb(':memory:');
  const doc = profilDoc();
  const { id: a } = db.create(doc);
  const { id: b } = db.create(profilDoc({ meta: { name: 'Anderes' } }));
  db.tmCreate(input({ name: 'zu A', profilId: a, fassung: 'v1', vorgabe: doc }));
  db.tmCreate(input({ name: 'zu B', profilId: b, fassung: 'v1', vorgabe: doc }));
  db.tmCreate(input({ name: 'ohne Bindung' }));
  assert.deepEqual(
    db.tmList({ profil: a }).map((e) => e.name),
    ['zu A'],
  );
  assert.equal(db.tmList().length, 3); // ohne Filter unveraendert
  assert.deepEqual(db.tmList({ profil: 'gibtsnicht' }), []);
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
