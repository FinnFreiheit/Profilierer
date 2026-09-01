import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { klientKennung, normalisiereRoute, nutzungZaehler, OHNE_KENNUNG } from './nutzung.js';
import { lokalerTag, tagPlus } from './zeit.js';
import { oeffneTestDb } from './testhelfer.js';

const ID = '6f2b1c4a-1111-4222-8333-444455556666';
const ID2 = '6f2b1c4a-1111-4222-8333-444455556667';

// ── Routen-Normalisierung ─────────────────────────────────────────────

test('normalisiereRoute: Kennungen werden zu :id, Methode gehoert zum Schluessel', () => {
  assert.equal(normalisiereRoute('GET', '/api/profiles'), 'GET /api/profiles');
  assert.equal(normalisiereRoute('get', `/api/profiles/${ID}`), 'GET /api/profiles/:id');
  assert.equal(normalisiereRoute('PUT', `/api/profiles/${ID}`), 'PUT /api/profiles/:id');
  assert.equal(
    normalisiereRoute('DELETE', `/api/profiles/${ID}/hinweise/${ID2}`),
    'DELETE /api/profiles/:id/hinweise/:id',
  );
  assert.equal(
    normalisiereRoute('POST', `/api/profiles/${ID}/versions/${ID2}/restore`),
    'POST /api/profiles/:id/versions/:id/restore',
  );
  assert.equal(
    normalisiereRoute('GET', `/api/testmessages/${ID}/abnahme/xml`),
    'GET /api/testmessages/:id/abnahme/xml',
  );
});

test('normalisiereRoute: Schemaversionen bleiben als :version erkennbar', () => {
  assert.equal(normalisiereRoute('PUT', '/api/schemas/4.1.0'), 'PUT /api/schemas/:version');
  assert.equal(
    normalisiereRoute('GET', '/api/schemas/3.6.2/files'),
    'GET /api/schemas/:version/files',
  );
});

test('normalisiereRoute: unbekannte Pfade sammeln sich auf /api/sonstige', () => {
  // Ohne diesen Deckel blaeht ein Scanner die Tabelle mit Muellrouten auf.
  assert.equal(normalisiereRoute('GET', '/api/hackversuch'), 'GET /api/sonstige');
  assert.equal(normalisiereRoute('GET', '/api/profiles/x/y/z/a/b/c'), 'GET /api/sonstige');
});

test('normalisiereRoute: alles ausserhalb /api zaehlt nicht', () => {
  assert.equal(normalisiereRoute('GET', '/xrep-api/codelist'), null);
  assert.equal(normalisiereRoute('GET', '/xjustiz-api/version'), null);
  assert.equal(normalisiereRoute('GET', '/assets/main.js'), null);
  assert.equal(normalisiereRoute('GET', '/'), null);
  assert.equal(normalisiereRoute('OPTIONS', '/api/profiles'), null);
});

test('normalisiereRoute: der Kennzahlen-Abruf zaehlt sich nicht selbst', () => {
  assert.equal(normalisiereRoute('GET', '/api/kennzahlen'), null);
});

test('klientKennung: nur UUID-artige Kennungen zaehlen als Klient', () => {
  assert.equal(klientKennung(ID), ID);
  assert.equal(klientKennung(undefined), OHNE_KENNUNG);
  assert.equal(klientKennung(''), OHNE_KENNUNG);
  assert.equal(klientKennung('<script>'), OHNE_KENNUNG);
  assert.equal(klientKennung('x'.repeat(200)), OHNE_KENNUNG);
});

// ── Middleware und Puffer ─────────────────────────────────────────────

/** Fake-req/res wie in log.test.js: res ist ein EventEmitter mit statusCode. */
const fakeReq = (method, path, klient) => ({
  method,
  path,
  get: (name) => (name.toLowerCase() === 'x-klient' ? klient : undefined),
});
const fakeRes = (statusCode = 200) => {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  return res;
};

/** Einen Request durch die Middleware schicken und die Antwort beenden. */
const request = (z, method, path, { klient, status = 200 } = {}) => {
  const res = fakeRes(status);
  let nexted = false;
  z.middleware(fakeReq(method, path, klient), res, () => (nexted = true));
  res.emit('finish');
  return nexted;
};

test('Zaehler bucht Zugriffe gebuendelt: n Requests, eine Stundenzeile', (t) => {
  const db = oeffneTestDb(t);
  const z = nutzungZaehler(db);
  t.after(() => z.stop());
  for (let i = 0; i < 3; i++) request(z, 'GET', '/api/profiles', { klient: ID });
  request(z, 'GET', '/api/profiles', { klient: ID2 });

  // Vor dem Flush steht nichts in der DB — genau das ist der Sinn des Puffers.
  assert.equal(db._db.prepare('SELECT COUNT(*) AS n FROM nutzung_stunde').get().n, 0);
  z.flush();
  const zeilen = db._db.prepare('SELECT * FROM nutzung_stunde').all();
  assert.equal(zeilen.length, 1);
  assert.equal(zeilen[0].route, 'GET /api/profiles');
  assert.equal(zeilen[0].zugriffe, 4);
  assert.equal(zeilen[0].fehler, 0);

  const k = db.kennzahlen({ tage: 1 }).nutzung;
  assert.equal(k.fenster.zugriffe, 4);
  assert.equal(k.fenster.klienten, 2);
});

test('Zaehler: Antworten ab 400 zaehlen als Fehler, next() laeuft weiter', (t) => {
  const db = oeffneTestDb(t);
  const z = nutzungZaehler(db);
  t.after(() => z.stop());
  assert.equal(request(z, 'GET', '/api/profiles', { klient: ID }), true);
  assert.equal(request(z, 'GET', `/api/profiles/${ID}`, { klient: ID, status: 404 }), true);
  z.flush();
  const k = db.kennzahlen({ tage: 1 }).nutzung;
  assert.equal(k.fenster.zugriffe, 2);
  assert.equal(k.fenster.fehler, 1);
});

test('Zaehler: Zugriffe ohne Kennung zaehlen mit, aber nicht als Nutzer', (t) => {
  const db = oeffneTestDb(t);
  const z = nutzungZaehler(db);
  t.after(() => z.stop());
  request(z, 'GET', '/api/profiles');
  request(z, 'GET', '/api/profiles', { klient: ID });
  z.flush();
  const k = db.kennzahlen({ tage: 1 }).nutzung;
  assert.equal(k.fenster.zugriffe, 2);
  assert.equal(k.fenster.klienten, 1);
  assert.equal(k.ohneKennung, 1);
});

test('Zaehler: nicht zaehlbare Pfade beruehren die DB nicht', (t) => {
  const db = oeffneTestDb(t);
  const z = nutzungZaehler(db);
  t.after(() => z.stop());
  assert.equal(request(z, 'GET', '/xrep-api/codelist', { klient: ID }), true);
  assert.equal(request(z, 'GET', '/index.html', { klient: ID }), true);
  z.flush();
  assert.equal(db._db.prepare('SELECT COUNT(*) AS n FROM nutzung_stunde').get().n, 0);
});

test('Zaehler: zweiter flush ohne neue Requests schreibt nichts nach', (t) => {
  const db = oeffneTestDb(t);
  const z = nutzungZaehler(db);
  t.after(() => z.stop());
  request(z, 'GET', '/api/profiles', { klient: ID });
  z.flush();
  z.flush();
  assert.equal(db._db.prepare('SELECT SUM(zugriffe) AS n FROM nutzung_stunde').get().n, 1);
});

// ── Verdichtung ───────────────────────────────────────────────────────

/** Zugriffe eines vergangenen Tages direkt in die Stundenkuebel legen. */
function altenTagSchreiben(
  db,
  tag,
  { route = 'GET /api/profiles', zugriffe = 5, klienten = ['a', 'b'] } = {},
) {
  const stunde = new Date(`${tag}T09:00:00`).getTime();
  db.nutzungSchreiben(
    [{ tag, stunde, route, zugriffe, fehler: 1, dauerSumme: 100, dauerMax: 40 }],
    [
      ...klienten.map((klient) => ({ tag, klient, zugriffe: 1, zuletzt: stunde })),
      { tag, klient: OHNE_KENNUNG, zugriffe: 1, zuletzt: stunde },
    ],
  );
}

test('Verdichtung: Tageswerte bleiben gleich, die Rohzeilen verschwinden', (t) => {
  const db = oeffneTestDb(t);
  const alt = tagPlus(lokalerTag(), -40);
  altenTagSchreiben(db, alt);
  const vorher = db.kennzahlen({ tage: 60 }).nutzung.verlauf.find((v) => v.tag === alt);

  const weg = db.nutzungVerdichten(tagPlus(lokalerTag(), -30));
  assert.equal(weg.stunden, 1);
  assert.equal(weg.klientTage, 3);
  assert.equal(db._db.prepare('SELECT COUNT(*) AS n FROM nutzung_stunde').get().n, 0);
  assert.equal(db._db.prepare('SELECT COUNT(*) AS n FROM nutzung_klient_tag').get().n, 0);

  const nachher = db.kennzahlen({ tage: 60 }).nutzung.verlauf.find((v) => v.tag === alt);
  assert.deepEqual(nachher, vorher);
  // Die Kennung '-' zaehlt nicht als Nutzer.
  assert.equal(nachher.klienten, 2);
});

test('Verdichtung ist idempotent und laesst frische Tage stehen', (t) => {
  const db = oeffneTestDb(t);
  const alt = tagPlus(lokalerTag(), -40);
  const frisch = tagPlus(lokalerTag(), -2);
  altenTagSchreiben(db, alt);
  altenTagSchreiben(db, frisch, { zugriffe: 7 });
  const grenze = tagPlus(lokalerTag(), -30);

  db.nutzungVerdichten(grenze);
  const nachEins = db.kennzahlen({ tage: 60 }).nutzung;
  assert.deepEqual(db.nutzungVerdichten(grenze), { stunden: 0, klientTage: 0 });
  assert.deepEqual(db.kennzahlen({ tage: 60 }).nutzung.verlauf, nachEins.verlauf);

  // Der frische Tag liegt weiterhin roh vor.
  assert.equal(db._db.prepare('SELECT COUNT(*) AS n FROM nutzung_stunde').get().n, 1);
});
