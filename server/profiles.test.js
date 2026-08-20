import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { oeffneTestDb } from './testhelfer.js';
import { zaehleFortschritt, toEntry, lesePunkte } from './fortschritt.js';

const docWith = (over = {}) => ({
  meta: { name: 'P', nachricht: 'nachricht.x', xjustizVersion: '3.6.2' },
  statuses: [],
  elemente: { a: { status: 's1' }, b: { status: 's1' }, c: {} },
  auspraegungen: {
    x: [
      { id: '1', name: 'F' },
      { id: '2', name: 'G' },
    ],
  },
  erweiterungen: { y: [{ id: 'x1', name: 'zusatz', min: '1', max: '1' }] },
  ...over,
});

test('zaehleFortschritt zaehlt Status-Elemente, Ausprägungen und Erweiterungen', () => {
  assert.deepEqual(zaehleFortschritt(docWith()), { nStatus: 2, nAusp: 2, nErw: 1 });
  assert.deepEqual(zaehleFortschritt({ elemente: {}, auspraegungen: {} }), {
    nStatus: 0,
    nAusp: 0,
    nErw: 0,
  });
});

test('toEntry leitet die Index-Felder ab', () => {
  const e = toEntry('id1', docWith(), 42);
  assert.equal(e.id, 'id1');
  assert.equal(e.name, 'P');
  assert.equal(e.nachricht, 'nachricht.x');
  assert.equal(e.nStatus, 2);
  assert.equal(e.nAusp, 2);
  assert.equal(e.nErw, 1);
  assert.equal(e.aktualisiert, 42);
});

test('toEntry traegt Autor, Beschreibung und normalisierte Schlagworte', () => {
  const e = toEntry(
    'id1',
    docWith({
      meta: {
        name: 'P',
        autor: '  Freiheit  ',
        beschreibung: ' Szenario fuer den Pilotbetrieb ',
        tags: ['Pilot', 'pilot', ' eNoVA '],
      },
    }),
    42,
  );
  assert.equal(e.autor, 'Freiheit');
  assert.equal(e.beschreibung, 'Szenario fuer den Pilotbetrieb');
  assert.deepEqual(e.tags, ['eNoVA', 'Pilot']);
  // Leere Angaben fallen weg, statt als leerer String auf der Kachel zu stehen.
  const ohne = toEntry('id2', docWith(), 42);
  assert.equal(ohne.autor, undefined);
  assert.equal(ohne.beschreibung, undefined);
  assert.equal(ohne.tags, undefined);
});

test('create → list → load Roundtrip', (t) => {
  const db = oeffneTestDb(t);
  const { id, entry } = db.create(docWith());
  assert.equal(entry.nStatus, 2);
  const list = db.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, id);
  assert.equal(list[0].name, 'P');
  assert.equal(list[0].nErw, 1);
  // Liste enthält kein doc.
  assert.equal(list[0].doc, undefined);
  const doc = db.load(id);
  assert.deepEqual(doc.elemente, docWith().elemente);
  assert.deepEqual(doc.erweiterungen, docWith().erweiterungen);
});

test('Migration: n_erw-Spalte wird an einer Alt-DB nachgezogen', (t) => {
  // Alt-Schema ohne n_erw in einer Datei simulieren, dann erneut oeffnen —
  // die PRAGMA-Migration laeuft in openDb.
  const file = join(mkdtempSync(join(tmpdir(), 'xjp-test-')), 'profil.db');
  const db = oeffneTestDb(t, file);
  db._db.exec('ALTER TABLE profiles DROP COLUMN n_erw');
  const cols = db._db
    .prepare('PRAGMA table_info(profiles)')
    .all()
    .map((c) => c.name);
  assert.ok(!cols.includes('n_erw'));
  db.close();
  const db2 = oeffneTestDb(t, file);
  const cols2 = db2._db
    .prepare('PRAGMA table_info(profiles)')
    .all()
    .map((c) => c.name);
  assert.ok(cols2.includes('n_erw'));
  // Profil ohne erweiterungen-Feld (Altbestand) zaehlt 0.
  const { entry } = db2.create(docWith({ erweiterungen: undefined }));
  assert.equal(entry.nErw, 0);
});

test('upsert aktualisiert Index-Spalten und Fortschritt', (t) => {
  const db = oeffneTestDb(t);
  const { id } = db.create(docWith());
  const entry = db.upsert(
    id,
    docWith({ elemente: { a: { status: 's1' } }, meta: { name: 'Neu' } }),
  );
  assert.equal(entry.name, 'Neu');
  assert.equal(entry.nStatus, 1);
  assert.equal(db.list().length, 1); // kein Duplikat
});

test('list ist nach aktualisiert absteigend sortiert', (t) => {
  const db = oeffneTestDb(t);
  db.upsert('alt', docWith(), 1000);
  db.upsert('neu', docWith(), 2000);
  assert.deepEqual(
    db.list().map((e) => e.id),
    ['neu', 'alt'],
  );
});

test('duplicate erzeugt neue id mit "(Kopie)"', (t) => {
  const db = oeffneTestDb(t);
  const { id } = db.create(docWith());
  const dup = db.duplicate(id);
  assert.notEqual(dup.id, id);
  assert.equal(dup.entry.name, 'P (Kopie)');
  assert.equal(db.list().length, 2);
  assert.equal(db.duplicate('gibtsnicht'), null);
});

test('rename ändert nur den Namen', (t) => {
  const db = oeffneTestDb(t);
  const { id } = db.create(docWith());
  const entry = db.rename(id, '  Umbenannt  ');
  assert.equal(entry.name, 'Umbenannt');
  assert.equal(db.load(id).meta.name, 'Umbenannt');
  assert.equal(db.rename('gibtsnicht', 'x'), null);
});

test('delete entfernt Dokument und Indexeintrag', (t) => {
  const db = oeffneTestDb(t);
  const { id } = db.create(docWith());
  assert.equal(db.delete(id), true);
  assert.equal(db.load(id), null);
  assert.equal(db.list().length, 0);
  assert.equal(db.delete(id), false);
});

test('importAll erhält id und aktualisiert-Zeitstempel', (t) => {
  const db = oeffneTestDb(t);
  const n = db.importAll([
    { id: 'fixed-1', doc: docWith(), aktualisiert: 1000 },
    { id: 'fixed-2', doc: docWith(), aktualisiert: 2000 },
    { id: 'kaputt' }, // ohne doc → übersprungen
  ]);
  assert.equal(n, 2);
  const list = db.list();
  assert.deepEqual(
    list.map((e) => e.id),
    ['fixed-2', 'fixed-1'],
  );
  assert.equal(list[0].aktualisiert, 2000);
});

test('count spiegelt die Anzahl der Profile', (t) => {
  const db = oeffneTestDb(t);
  assert.equal(db.count(), 0);
  db.create(docWith());
  db.create(docWith());
  assert.equal(db.count(), 2);
});

test('lesePunkte uebernimmt den Stand der Entscheidungspunkte (#93)', () => {
  assert.deepEqual(lesePunkte(docWith({ fortschritt: { x: 12, y: 40 } })), {
    nEntschieden: 12,
    nPunkte: 40,
  });
});

test('lesePunkte bleibt leer, wo der Stand fehlt oder unbrauchbar ist', () => {
  const leer = { nEntschieden: null, nPunkte: null };
  assert.deepEqual(lesePunkte(docWith()), leer, 'Altbestand ohne Feld');
  assert.deepEqual(lesePunkte(docWith({ fortschritt: { x: 1, y: 0 } })), leer, 'Nenner 0');
  assert.deepEqual(lesePunkte(docWith({ fortschritt: { x: 1 } })), leer, 'unvollstaendig');
  assert.deepEqual(lesePunkte(docWith({ fortschritt: { x: 'a', y: 'b' } })), leer, 'keine Zahlen');
  assert.deepEqual(lesePunkte(null), leer, 'kein Dokument');
});

test('lesePunkte haelt x innerhalb von y', () => {
  // Ein Balken ueber 100 % waere ein Anzeigefehler statt einer Information.
  assert.deepEqual(lesePunkte(docWith({ fortschritt: { x: 99, y: 40 } })), {
    nEntschieden: 40,
    nPunkte: 40,
  });
  assert.deepEqual(lesePunkte(docWith({ fortschritt: { x: -5, y: 40 } })), {
    nEntschieden: 0,
    nPunkte: 40,
  });
});

test('der Fach-Hash ignoriert den Punktestand (#93)', (t) => {
  // Ein Wechsel der Schemaversion aendert den Nenner. Wuerde er in den Hash
  // einfliessen, markierte er jede gebundene Testnachricht als
  // "Profil weiterentwickelt", ohne dass sich fachlich etwas geaendert hat.
  const dir = mkdtempSync(join(tmpdir(), 'xjp-'));
  const db = oeffneTestDb(t, join(dir, 'p.db'));
  const a = db.upsert('p1', docWith({ fortschritt: { x: 1, y: 100 } }));
  const vorher = db._db.prepare('SELECT fach_hash FROM profiles WHERE id = ?').get('p1').fach_hash;
  db.upsert('p1', docWith({ fortschritt: { x: 77, y: 4829 } }));
  const nachher = db._db.prepare('SELECT fach_hash FROM profiles WHERE id = ?').get('p1').fach_hash;
  assert.equal(nachher, vorher, 'reine Zaehleraenderung darf den Fach-Hash nicht bewegen');
  assert.equal(a.id, 'p1');

  // Eine echte fachliche Aenderung bewegt ihn weiterhin.
  db.upsert('p1', docWith({ elemente: { a: { status: 's2' } }, fortschritt: { x: 77, y: 4829 } }));
  const fachlich = db._db
    .prepare('SELECT fach_hash FROM profiles WHERE id = ?')
    .get('p1').fach_hash;
  assert.notEqual(fachlich, nachher);
});

test('upsert schreibt den Punktestand in den Index und liest ihn zurueck', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'xjp-'));
  const db = oeffneTestDb(t, join(dir, 'p.db'));
  db.upsert('p1', docWith({ fortschritt: { x: 12, y: 40 } }));
  db.upsert('p2', docWith());
  const liste = db.list();
  const p1 = liste.find((e) => e.id === 'p1');
  const p2 = liste.find((e) => e.id === 'p2');
  assert.equal(p1.nEntschieden, 12);
  assert.equal(p1.nPunkte, 40);
  assert.equal(p2.nEntschieden, undefined, 'ohne Stand bleibt die Spalte leer');
  assert.equal(p2.nPunkte, undefined);
});

test('Migration: n_erw wird an einer Alt-DB nachgezogen (Backfill)', (t) => {
  // Ohne den Backfill blieben Zeilen aus der Zeit vor der Spalte ohne
  // Erweiterungs-Kennzeichen — und damit an der Sperre der Pruefartefakte
  // (#98) vorbei, obwohl sie nachbeauftragte Elemente enthalten.
  const file = join(mkdtempSync(join(tmpdir(), 'xjp-test-')), 'profil.db');
  const db = oeffneTestDb(t, file);
  const { id } = db.create(docWith());
  assert.equal(db.list()[0].nErw, 1);
  db._db.exec('ALTER TABLE profiles DROP COLUMN n_erw'); // Alt-Schema simulieren
  db.close();
  const db2 = oeffneTestDb(t, file);
  assert.equal(db2.list().find((e) => e.id === id).nErw, 1);
});

test('list liefert Autor, Beschreibung und Schlagworte aus den Index-Spalten', (t) => {
  const db = oeffneTestDb(t);
  db.create(
    docWith({
      meta: { name: 'P', autor: 'Freiheit', beschreibung: 'Pilotbetrieb', tags: ['Pilot'] },
    }),
  );
  const [zeile] = db.list();
  assert.equal(zeile.autor, 'Freiheit');
  assert.equal(zeile.beschreibung, 'Pilotbetrieb');
  assert.deepEqual(zeile.tags, ['Pilot']);
});

test('Altbestand ohne Index-Spalten wird beim Oeffnen nachgezogen', (t) => {
  const pfad = join(mkdtempSync(join(tmpdir(), 'xjp-tags-')), 'p.db');
  const db = oeffneTestDb(t, pfad);
  const { id } = db.create(docWith());
  // Zustand vor der Migration nachstellen: Dokument gepflegt, Spalten leer.
  db._db
    .prepare(
      'UPDATE profiles SET doc = ?, autor = NULL, beschreibung = NULL, tags = NULL WHERE id = ?',
    )
    .run(
      JSON.stringify(
        docWith({ meta: { name: 'P', autor: 'AG', beschreibung: 'alt', tags: ['Muster'] } }),
      ),
      id,
    );
  db.close();
  const wieder = oeffneTestDb(t, pfad);
  const [zeile] = wieder.list();
  assert.equal(zeile.autor, 'AG');
  assert.equal(zeile.beschreibung, 'alt');
  assert.deepEqual(zeile.tags, ['Muster']);
});

test('patchMeta aendert nur die gesetzten Felder', (t) => {
  const db = oeffneTestDb(t);
  const { id } = db.create(
    docWith({ meta: { name: 'P', autor: 'AG', beschreibung: 'alt', nachricht: 'nachricht.x' } }),
  );
  const entry = db.patchMeta(id, { beschreibung: '  neu  ', tags: 'Pilot, pilot' });
  assert.equal(entry.name, 'P'); // unberührt
  assert.equal(entry.autor, 'AG'); // unberührt
  assert.equal(entry.beschreibung, 'neu');
  assert.deepEqual(entry.tags, ['Pilot']);
  // Der Nachrichtentyp im Dokument bleibt stehen — gepatcht wird nur die Kachel.
  assert.equal(db.load(id).meta.nachricht, 'nachricht.x');
  // Leerer String raeumt ein Feld weg.
  assert.equal(db.patchMeta(id, { autor: '' }).autor, undefined);
  assert.equal(db.patchMeta('gibtsnicht', { name: 'x' }), null);
});
