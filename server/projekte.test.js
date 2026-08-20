import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oeffneTestDb } from './testhelfer.js';

/**
 * Projekte (#134): der Behaelter ueber den Profilierungen. Geprueft wird vor
 * allem die **Vererbung** — eine gebundene Testnachricht liegt im Projekt ihrer
 * Profilierung, ohne eigene Zuordnung. Das ist die Entscheidung, an der alles
 * haengt: nur ein Pflegeort, keine widerspruechlichen Zustaende.
 */

const doc = (name) => ({
  meta: { name, nachricht: 'nachricht.genuva.ersuchen' },
  statuses: [],
  elemente: {},
  auspraegungen: {},
});

const tm = (over = {}) => ({
  name: 'a.xml',
  xml: '<nachricht.genuva.ersuchen xmlns="http://www.xjustiz.de"/>',
  nachricht: 'nachricht.genuva.ersuchen',
  fachmodul: 'genuva',
  groesse: 60,
  ...over,
});

const vorgabe = { meta: {}, statuses: [], elemente: {}, auspraegungen: {} };

test('prjCreate/prjUpdate/prjGet: Felder und Zeitstempel', (t) => {
  const db = oeffneTestDb(t);
  const { id, entry } = db.prjCreate({ name: '  GenUVA  ', tags: ['pilot', 'Pilot'] }, 1000);
  assert.equal(entry.name, 'GenUVA');
  assert.deepEqual(entry.tags, ['pilot']); // normalisiert, Doppelte weg
  assert.equal(entry.angelegt, 1000);
  assert.equal(entry.nProfile, 0);
  assert.equal(entry.nTestnachrichten, 0);

  const geaendert = db.prjUpdate(id, { beschreibung: 'Ersuchen und Sachentscheidung' }, 2000);
  assert.equal(geaendert.beschreibung, 'Ersuchen und Sachentscheidung');
  assert.equal(geaendert.name, 'GenUVA'); // unberuehrt
  assert.equal(geaendert.aktualisiert, 2000);
  assert.equal(db.prjUpdate('gibtsnicht', { name: 'x' }), null);
  assert.equal(db.prjGet('gibtsnicht'), null);
});

test('Namenloses Projekt bekommt einen Platzhalter statt eines leeren Namens', (t) => {
  const db = oeffneTestDb(t);
  const { entry } = db.prjCreate({ name: '   ' });
  assert.equal(entry.name, '(ohne Namen)');
});

test('Testnachricht erbt das Projekt ihrer Profilierung', (t) => {
  const db = oeffneTestDb(t);
  const { id: prj } = db.prjCreate({ name: 'GenUVA' });
  const profil = db.create(doc('Ersuchen an die Gemeinde'));
  db.einsortieren(profil.id, { projektId: prj });

  const gebunden = db.tmCreate(tm({ profilId: profil.id, fassung: 'v1', vorgabe }));
  const frei = db.tmCreate(tm({ name: 'upload.xml' }));

  // Vererbt, ohne eigene Zuordnung.
  assert.equal(db.tmList().find((e) => e.id === gebunden.id).projektId, prj);
  assert.equal(db.tmList().find((e) => e.id === frei.id).projektId, undefined);

  // Die Zahlen der Kachel folgen derselben Regel.
  assert.deepEqual(
    { p: db.prjGet(prj).nProfile, t: db.prjGet(prj).nTestnachrichten },
    { p: 1, t: 1 },
  );
});

test('Einsortieren einer gebundenen Testnachricht wird abgewiesen', (t) => {
  const db = oeffneTestDb(t);
  const { id: prj } = db.prjCreate({ name: 'GenUVA' });
  const profil = db.create(doc('Ersuchen'));
  const gebunden = db.tmCreate(tm({ profilId: profil.id, fassung: 'v1', vorgabe }));
  const frei = db.tmCreate(tm({ name: 'upload.xml' }));

  // Gebunden: ein zweiter Pflegeort erzeugte nur Widersprueche.
  assert.deepEqual(db.tmEinsortieren(gebunden.id, { projektId: prj }), { fehler: 'gebunden' });
  // Schlagworte gehen trotzdem.
  const mitTags = db.tmEinsortieren(gebunden.id, { tags: ['Pilot'] });
  assert.deepEqual(mitTags.entry.tags, ['Pilot']);

  // Ungebunden: eigene Zuordnung ist der Weg.
  assert.equal(db.tmEinsortieren(frei.id, { projektId: prj }).entry.projektId, prj);
  assert.equal(db.tmEinsortieren('gibtsnicht', { tags: [] }), null);
});

test('Einsortieren ruehrt den doc_hash nicht an — die Freigabe bleibt unberuehrt', (t) => {
  const db = oeffneTestDb(t);
  const { id: prj } = db.prjCreate({ name: 'GenUVA' });
  const profil = db.create(doc('Ersuchen'));
  const vorher = db._db
    .prepare('SELECT doc_hash, fach_hash FROM profiles WHERE id = ?')
    .get(profil.id);

  db.einsortieren(profil.id, { projektId: prj });
  const nachher = db._db
    .prepare('SELECT doc_hash, fach_hash FROM profiles WHERE id = ?')
    .get(profil.id);
  assert.deepEqual(nachher, vorher);
});

test('Projektzuordnung ueberlebt den Autosave (upsert liefert sie mit)', (t) => {
  const db = oeffneTestDb(t);
  const { id: prj } = db.prjCreate({ name: 'GenUVA' });
  const profil = db.create(doc('Ersuchen'));
  db.einsortieren(profil.id, { projektId: prj });

  // Autosave schreibt das Volldokument — die Spalte darf dabei nicht verloren
  // gehen, und der zurueckgegebene Entry muss sie tragen.
  const entry = db.upsert(profil.id, doc('Ersuchen, weiterbearbeitet'));
  assert.equal(entry.projektId, prj);
  assert.equal(db.entry(profil.id).projektId, prj);
  assert.equal(db.list().find((e) => e.id === profil.id).projektId, prj);
});

test('Loeschen der Profilierung schreibt das Erbe fest', (t) => {
  const db = oeffneTestDb(t);
  const { id: prj } = db.prjCreate({ name: 'GenUVA' });
  const profil = db.create(doc('Ersuchen'));
  db.einsortieren(profil.id, { projektId: prj });
  const nachricht = db.tmCreate(tm({ profilId: profil.id, fassung: 'v1', vorgabe }));

  db.delete(profil.id);

  // Die Nachricht ueberlebt das Loeschen (eingefrorene Vorgabe) — und bleibt
  // im Projekt, statt lautlos herauszufallen.
  assert.equal(db.tmList().find((e) => e.id === nachricht.id).projektId, prj);
  assert.equal(db.prjGet(prj).nTestnachrichten, 1);
  assert.equal(db.prjGet(prj).nProfile, 0);
});

test('Bindung loesen laesst die Zugehoerigkeit stehen', (t) => {
  const db = oeffneTestDb(t);
  const { id: prj } = db.prjCreate({ name: 'GenUVA' });
  const profil = db.create(doc('Ersuchen'));
  db.einsortieren(profil.id, { projektId: prj });
  const nachricht = db.tmCreate(tm({ profilId: profil.id, fassung: 'v1', vorgabe }));

  // Die Herkunft (profil_id) bleibt als Historie — und mit ihr das Erbe.
  const entry = db.tmBindungLoesen(nachricht.id);
  assert.equal(entry.projektId, prj);
});

test('Projekt loeschen entfernt nur die Zuordnungen, nie Inhalte', (t) => {
  const db = oeffneTestDb(t);
  const { id: prj } = db.prjCreate({ name: 'GenUVA' });
  const profil = db.create(doc('Ersuchen'));
  db.einsortieren(profil.id, { projektId: prj });
  const frei = db.tmCreate(tm({ name: 'upload.xml' }));
  db.tmEinsortieren(frei.id, { projektId: prj });

  assert.equal(db.prjDelete(prj), true);
  assert.equal(db.prjGet(prj), null);
  assert.equal(db.list().length, 1);
  assert.equal(db.list()[0].projektId, undefined);
  assert.equal(db.tmList().length, 1);
  assert.equal(db.tmList()[0].projektId, undefined);
  assert.equal(db.prjDelete('gibtsnicht'), false);
});
