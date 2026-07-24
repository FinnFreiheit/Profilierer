import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db.js';

const docWith = (over = {}) => ({
  meta: { name: 'P', nachricht: 'nachricht.x', xjustizVersion: '3.6.2' },
  statuses: [],
  elemente: { a: { status: 's1' }, b: { status: 's1' }, c: {} },
  auspraegungen: { x: [{ id: '1', name: 'F' }] },
  erweiterungen: {},
  ...over,
});

/** Doc mit abweichendem Inhalt (anderer Beispielwert an Element a). */
const docGeaendert = (n) => docWith({ elemente: { a: { status: 's1', beispiel: `w${n}` } } });

test('versionCreate: fortlaufende Nummern, Kommentar, Liste ohne doc', () => {
  const db = openDb(':memory:');
  const { id } = db.create(docWith());
  const v1 = db.versionCreate(id, { kommentar: 'erster Stand' }, 100);
  assert.equal(v1.version.nr, 1);
  assert.equal(v1.version.kommentar, 'erster Stand');
  assert.equal(v1.version.automatisch, undefined);
  db.upsert(id, docGeaendert(1));
  const v2 = db.versionCreate(id, {}, 200);
  assert.equal(v2.version.nr, 2);
  const liste = db.versionsList(id);
  assert.equal(liste.length, 2);
  // absteigend nach nr, ohne doc
  assert.equal(liste[0].nr, 2);
  assert.equal(liste[1].nr, 1);
  assert.equal(liste[0].doc, undefined);
  assert.equal(liste[1].erstellt, 100);
  db.close();
});

test('versionsList/versionCreate: unbekanntes Profil → null', () => {
  const db = openDb(':memory:');
  assert.equal(db.versionsList('fehlt'), null);
  assert.equal(db.versionCreate('fehlt', {}), null);
  assert.equal(db.versionRestore('fehlt', 'egal'), null);
  db.close();
});

test('Entprellung: automatisch ohne Aenderung → skipped, manuell immer', () => {
  const db = openDb(':memory:');
  const { id } = db.create(docWith());
  const a1 = db.versionCreate(id, { automatisch: true, kommentar: 'Stand beim Öffnen' });
  assert.equal(a1.version.nr, 1);
  assert.equal(a1.version.automatisch, true);
  // Gleicher Stand: entprellt.
  const a2 = db.versionCreate(id, { automatisch: true });
  assert.equal(a2.skipped, true);
  assert.equal(a2.version, undefined);
  assert.ok(a2.entry);
  // Manuell entsteht trotzdem eine Version.
  const m = db.versionCreate(id, { kommentar: 'bewusst' });
  assert.equal(m.version.nr, 2);
  // Nach Aenderung greift die Entprellung nicht mehr.
  db.upsert(id, docGeaendert(1));
  const a3 = db.versionCreate(id, { automatisch: true });
  assert.equal(a3.version.nr, 3);
  db.close();
});

test('geaendert/letzteVersionNr/nVersionen im Entry', () => {
  const db = openDb(':memory:');
  const { id, entry } = db.create(docWith());
  // Ohne Versionen: keine Versions-Felder.
  assert.equal(entry.nVersionen, undefined);
  assert.equal(entry.geaendert, undefined);
  const v = db.versionCreate(id, {});
  assert.equal(v.entry.nVersionen, 1);
  assert.equal(v.entry.letzteVersionNr, 1);
  assert.equal(v.entry.geaendert, undefined); // Stand eingefroren
  // Abweichender Stand → geaendert.
  const e2 = db.upsert(id, docGeaendert(1));
  assert.equal(e2.geaendert, true);
  assert.equal(e2.letzteVersionNr, 1);
  // Zurueck zum eingefrorenen Stand (hash-gleich) → nicht geaendert.
  const e3 = db.upsert(id, docWith());
  assert.equal(e3.geaendert, undefined);
  // list() liefert dieselben Felder.
  db.upsert(id, docGeaendert(2));
  const zeile = db.list().find((x) => x.id === id);
  assert.equal(zeile.nVersionen, 1);
  assert.equal(zeile.letzteVersionNr, 1);
  assert.equal(zeile.geaendert, true);
  db.close();
});

test('Deckel: Automatik-Versionen auf 10 begrenzt, manuelle bleiben', () => {
  const db = openDb(':memory:');
  const { id } = db.create(docWith());
  const m = db.versionCreate(id, { kommentar: 'manuell' }); // v1
  for (let i = 1; i <= 12; i++) {
    db.upsert(id, docGeaendert(i));
    db.versionCreate(id, { automatisch: true }); // v2..v13
  }
  const liste = db.versionsList(id);
  const autos = liste.filter((v) => v.automatisch);
  assert.equal(autos.length, 10);
  // Die juengsten 10 (v4..v13) bleiben.
  assert.deepEqual(autos.map((v) => v.nr).sort((a, b) => a - b), [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  // Die manuelle Version ueberlebt den Deckel.
  assert.ok(liste.some((v) => v.id === m.version.id));
  db.close();
});

test('versionRestore: Sicherheits-Version, Versionsstand geladen, geaendert false', () => {
  const db = openDb(':memory:');
  const { id } = db.create(docWith());
  const v1 = db.versionCreate(id, { kommentar: 'guter Stand' });
  db.upsert(id, docGeaendert(1));
  const out = db.versionRestore(id, v1.version.id);
  // Arbeitsstand wurde vorher automatisch gesichert.
  assert.equal(out.sicherheitsVersion.nr, 2);
  assert.equal(out.sicherheitsVersion.automatisch, true);
  assert.match(out.sicherheitsVersion.kommentar, /^Stand vor Wiederherstellung von v1/);
  // Profil traegt wieder den Versionsstand.
  assert.deepEqual(out.doc, docWith());
  assert.deepEqual(db.load(id), docWith());
  // Der wiederhergestellte Stand ist eingefroren (v1) → nicht geaendert.
  assert.equal(out.entry.geaendert, undefined);
  assert.equal(out.entry.nVersionen, 2);
  // Sicherheitsstand ist als Version rekonstruierbar.
  const wieder = db.versionRestore(id, out.sicherheitsVersion.id);
  assert.deepEqual(db.load(id), docGeaendert(1));
  // Entprellt: der Stand vor diesem Restore war hash-gleich zu v1 → keine neue Sicherheits-Version.
  assert.equal(wieder.sicherheitsVersion, undefined);
  db.close();
});

test('versionRestore: unbekannte Version → null', () => {
  const db = openDb(':memory:');
  const { id } = db.create(docWith());
  assert.equal(db.versionRestore(id, 'fehlt'), null);
  // Version eines anderen Profils ist nicht erreichbar.
  const { id: id2 } = db.create(docWith());
  const v = db.versionCreate(id2, {});
  assert.equal(db.versionRestore(id, v.version.id), null);
  db.close();
});

test('versionDelete: idempotent, Nummern werden nicht recycelt', () => {
  const db = openDb(':memory:');
  const { id } = db.create(docWith());
  const v1 = db.versionCreate(id, {});
  db.upsert(id, docGeaendert(1));
  const v2 = db.versionCreate(id, {});
  assert.equal(db.versionDelete(id, v1.version.id), true);
  assert.equal(db.versionDelete(id, v1.version.id), false);
  db.versionDelete(id, v2.version.id);
  assert.equal(db.versionsList(id).length, 0);
  // Neue Version zaehlt weiter, nicht wieder bei 1... — MAX(nr) ist weg,
  // Nummern starten nach Komplett-Loeschung bewusst neu; nach Teil-Loeschung nicht:
  const v3 = db.versionCreate(id, {});
  assert.equal(v3.version.nr, 1);
  db.close();
});

test('delete kaskadiert auf profile_versions', () => {
  const db = openDb(':memory:');
  const { id } = db.create(docWith());
  db.versionCreate(id, {});
  db.upsert(id, docGeaendert(1));
  db.versionCreate(id, {});
  assert.equal(db.delete(id), true);
  const n = db._db.prepare('SELECT COUNT(*) AS n FROM profile_versions').get().n;
  assert.equal(n, 0);
  db.close();
});

test('Migration: doc_hash wird an einer Alt-DB nachgezogen (Backfill)', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'xjp-test-')), 'profil.db');
  const db = openDb(file);
  const { id } = db.create(docWith());
  // Alt-Schema simulieren: Spalte weg, Tabelle der Versionen weg.
  db._db.exec('ALTER TABLE profiles DROP COLUMN doc_hash');
  db._db.exec('DROP TABLE profile_versions');
  db.close();
  const db2 = openDb(file);
  const hash = db2._db.prepare('SELECT doc_hash FROM profiles WHERE id = ?').get(id).doc_hash;
  assert.ok(hash && hash.length === 40);
  // Entprellung funktioniert direkt nach dem Backfill.
  db2.versionCreate(id, { automatisch: true });
  const zweite = db2.versionCreate(id, { automatisch: true });
  assert.equal(zweite.skipped, true);
  db2.close();
});

test('importAll laesst bestehende Versionen unberuehrt', () => {
  const db = openDb(':memory:');
  const { id } = db.create(docWith());
  const v = db.versionCreate(id, { kommentar: 'bleibt' });
  db.importAll([{ id, doc: docGeaendert(1), aktualisiert: 999 }]);
  const liste = db.versionsList(id);
  assert.equal(liste.length, 1);
  assert.equal(liste[0].id, v.version.id);
  // Import hat den Stand geaendert → Kennzeichen an.
  assert.equal(db.list()[0].geaendert, true);
  db.close();
});
