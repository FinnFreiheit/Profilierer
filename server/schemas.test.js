import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.js';
import { oeffneTestDb } from './testhelfer.js';
import { createApp } from './app.js';

/**
 * Schemaquellen: von xjustiz.de geholte Versionen bleiben liegen, statt mit dem
 * Browser-Tab zu verschwinden. Geprueft wird die Ablage (db) und die HTTP-Naht
 * (Vorbild hinweise.test.js) — insbesondere, dass ein zweites Ablegen dieselbe
 * Version **ersetzt** und keine Dateien der vorigen Fassung stehen laesst.
 */

const dateien = (...namen) => namen.map((n) => ({ name: n, text: `<!-- ${n} -->` }));

/** Startet App + DB auf einem Ephemeral-Port; raeumt via t.after auf. */
async function start(t) {
  const db = openDb(':memory:');
  const app = createApp(db);
  const srv = app.listen(0);
  await new Promise((res) => srv.once('listening', res));
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  t.after(() => {
    srv.close();
    db.close();
  });
  const api = async (method, path, body) => {
    const r = await fetch(base + path, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let parsed = text;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      /* Roh-Text */
    }
    return { status: r.status, body: parsed };
  };
  return { api, db };
}

test('schemaSpeichern/schemaList: Eintrag mit Dateinamen, Inhalte separat', (t) => {
  const db = oeffneTestDb(t);
  const entry = db.schemaSpeichern(
    {
      id: '4.1.0',
      label: '4.1.0',
      hinweis: 'XJustiz 4.1.0 XSD',
      zipUrl: '/system/zip/XJustiz-4_1_0-XSD.zip',
      files: dateien('b.xsd', 'a.xsd'),
    },
    1000,
  );
  assert.equal(entry.id, '4.1.0');
  assert.equal(entry.dir, 'xjustiz.de/4.1.0');
  assert.equal(entry.geholt, 1000);
  assert.deepEqual(entry.files, ['a.xsd', 'b.xsd']);

  const liste = db.schemaList();
  assert.equal(liste.length, 1);
  assert.deepEqual(liste[0].files, ['a.xsd', 'b.xsd']);
  assert.equal(liste[0].zipUrl, '/system/zip/XJustiz-4_1_0-XSD.zip');
  // Die Inhalte kommen nicht mit dem Index.
  assert.equal(liste[0].text, undefined);
  assert.deepEqual(
    db.schemaDateien('4.1.0').map((d) => d.name),
    ['a.xsd', 'b.xsd'],
  );
});

test('erneutes Speichern ersetzt die Dateien vollstaendig', (t) => {
  const db = oeffneTestDb(t);
  db.schemaSpeichern({ id: '4.1.0', files: dateien('alt.xsd', 'bleibt.xsd') }, 1000);
  const neu = db.schemaSpeichern({ id: '4.1.0', files: dateien('bleibt.xsd') }, 2000);

  assert.deepEqual(neu.files, ['bleibt.xsd']);
  assert.equal(neu.geholt, 2000);
  assert.deepEqual(
    db.schemaDateien('4.1.0').map((d) => d.name),
    ['bleibt.xsd'],
  );
  assert.equal(db.schemaList().length, 1); // keine zweite Zeile
});

// Der Weg fuer die **Versionsliste**: wer sie von xjustiz.de abruft, soll die
// Versionen behalten, auch ohne sie geladen zu haben. Gemerkt wird dann nur die
// Bezugsquelle; das ZIP holt das erste Waehlen.
test('ohne files wird nur die Bezugsquelle gemerkt', (t) => {
  const db = oeffneTestDb(t);
  const entry = db.schemaSpeichern(
    { id: '4.1.0', label: '4.1.0', zipUrl: '/system/zip/XJustiz-4_1_0-XSD.zip' },
    1000,
  );

  assert.deepEqual(entry.files, []);
  assert.equal(entry.zipUrl, '/system/zip/XJustiz-4_1_0-XSD.zip');
  assert.equal(db.schemaVorhanden('4.1.0'), true);
  assert.deepEqual(db.schemaDateien('4.1.0'), []);
  // Sie steht damit im Index — genau das ueberlebt das Neuladen der Seite.
  assert.deepEqual(
    db.schemaList().map((e) => e.id),
    ['4.1.0'],
  );
});

test('ein Listenabruf leert einen bereits geholten Stand nicht', (t) => {
  const db = oeffneTestDb(t);
  db.schemaSpeichern({ id: '4.1.0', files: dateien('a.xsd', 'b.xsd') }, 1000);

  const entry = db.schemaSpeichern({ id: '4.1.0', label: '4.1.0', zipUrl: '/neu.zip' }, 2000);

  assert.deepEqual(entry.files, ['a.xsd', 'b.xsd']);
  assert.equal(entry.zipUrl, '/neu.zip'); // neue Bezugsquelle ist gemerkt
  assert.equal(db.schemaDateien('4.1.0').length, 2);
});

test('schemaLoeschen entfernt Eintrag und Dateien', (t) => {
  const db = oeffneTestDb(t);
  db.schemaSpeichern({ id: '4.1.0', files: dateien('a.xsd') }, 1000);
  assert.equal(db.schemaVorhanden('4.1.0'), true);
  assert.equal(db.schemaLoeschen('4.1.0'), true);
  assert.equal(db.schemaVorhanden('4.1.0'), false);
  assert.deepEqual(db.schemaDateien('4.1.0'), []);
  assert.equal(db.schemaLoeschen('4.1.0'), false);
});

test('HTTP: PUT legt ab, GET liefert Index und Dateien', async (t) => {
  const { api } = await start(t);

  assert.deepEqual((await api('GET', '/schemas')).body, []);

  const put = await api('PUT', '/schemas/4.1.0', {
    label: '4.1.0',
    zipUrl: '/system/zip/XJustiz-4_1_0-XSD.zip',
    files: dateien('a.xsd'),
  });
  assert.equal(put.status, 200);
  assert.equal(put.body.entry.id, '4.1.0');

  const liste = await api('GET', '/schemas');
  assert.equal(liste.body.length, 1);
  assert.deepEqual(liste.body[0].files, ['a.xsd']);

  const files = await api('GET', '/schemas/4.1.0/files');
  assert.equal(files.status, 200);
  assert.deepEqual(files.body, [{ name: 'a.xsd', text: '<!-- a.xsd -->' }]);
});

test('HTTP: PUT ohne files merkt die Quelle, PUT mit files ergaenzt sie', async (t) => {
  const { api } = await start(t);

  const quelle = await api('PUT', '/schemas/4.1.0', { label: '4.1.0', zipUrl: '/x.zip' });
  assert.equal(quelle.status, 200);
  assert.deepEqual(quelle.body.entry.files, []);
  // Ohne Dateien gibt es nichts auszuliefern.
  assert.equal((await api('GET', '/schemas/4.1.0/files')).status, 404);

  await api('PUT', '/schemas/4.1.0', { files: dateien('a.xsd') });
  const liste = await api('GET', '/schemas');
  assert.deepEqual(liste.body[0].files, ['a.xsd']);
});

test('HTTP: unbekannte Version, leere und kaputte Dateilisten', async (t) => {
  const { api } = await start(t);

  assert.equal((await api('GET', '/schemas/9.9.9/files')).status, 404);
  // Ein leeres Array ist ein Fehler, keine Loeschanweisung (dafuer gibt es DELETE).
  assert.equal((await api('PUT', '/schemas/4.1.0', { files: [] })).status, 400);
  assert.equal(
    (await api('PUT', '/schemas/4.1.0', { files: [{ name: 'a.xsd' }] })).status,
    400, // Inhalt fehlt
  );
  assert.equal(
    (await api('PUT', '/schemas/4.1.0', { files: [{ name: '  ', text: 'x' }] })).status,
    400, // Name fehlt
  );
  // Nichts davon hat Dateien angelegt.
  assert.deepEqual(
    (await api('GET', '/schemas')).body.flatMap((e) => e.files),
    [],
  );
});

test('HTTP: DELETE entfernt die Version, zweiter Aufruf bleibt still', async (t) => {
  const { api } = await start(t);
  await api('PUT', '/schemas/4.1.0', { files: dateien('a.xsd') });

  assert.equal((await api('DELETE', '/schemas/4.1.0')).status, 204);
  assert.deepEqual((await api('GET', '/schemas')).body, []);
  assert.equal((await api('DELETE', '/schemas/4.1.0')).status, 204);
});
