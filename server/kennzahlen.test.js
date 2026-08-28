import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.js';
import { createApp } from './app.js';

/**
 * HTTP-Seam der Kennzahlen-Ansicht: echte App samt Zaehl-Middleware gegen eine
 * In-Memory-SQLite. Geprueft wird, was die Ansicht sieht — Status, Struktur,
 * gezaehlte Zugriffe —, nicht die Interna des Puffers (die stehen in
 * nutzung.test.js).
 */

const AG_KEY = 'geheimer-ag-schluessel';
const KLIENT_A = '6f2b1c4a-1111-4222-8333-44445555aaaa';
const KLIENT_B = '6f2b1c4a-1111-4222-8333-44445555bbbb';

const doc = (name = 'P') => ({
  meta: { name, nachricht: 'nachricht.x', xjustizVersion: '3.6.2' },
  statuses: [],
  elemente: { a: { status: 's1' } },
  auspraegungen: {},
});

/** Startet App + DB auf einem Ephemeral-Port; raeumt via t.after auf. */
async function start(t, { agKey = AG_KEY } = {}) {
  const db = openDb(':memory:');
  const app = createApp(db, { agKey });
  const srv = app.listen(0);
  await new Promise((res) => srv.once('listening', res));
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  t.after(() => {
    app.locals.nutzung?.stop();
    srv.close();
    db.close();
  });
  const api = async (method, path, { body, key, klient } = {}) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(key !== undefined ? { 'x-ag-key': key } : {}),
        ...(klient !== undefined ? { 'x-klient': klient } : {}),
      },
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
  /** Gepufferte Zugriffe wegschreiben — sonst haengt der Test am 5-s-Timer. */
  const flush = () => app.locals.nutzung.flush();
  return { api, db, flush };
}

// ── Zugriffsschutz ────────────────────────────────────────────────────

test('kennzahlen: ohne AG-Schluessel gesperrt', async (t) => {
  const { api } = await start(t);
  assert.equal((await api('GET', '/kennzahlen')).status, 403);
  assert.equal((await api('GET', '/kennzahlen', { key: 'tippfehler' })).status, 403);
});

test('kennzahlen: ohne konfigurierte AG-Rolle gibt es die Ansicht nicht', async (t) => {
  const { api } = await start(t, { agKey: '' });
  const r = await api('GET', '/kennzahlen', { key: AG_KEY });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /nicht konfiguriert/);
});

// ── Nutzungszahlen ────────────────────────────────────────────────────

test('kennzahlen: Zugriffe und Nutzer werden gezaehlt', async (t) => {
  const { api, flush } = await start(t);
  await api('GET', '/profiles', { klient: KLIENT_A });
  await api('GET', '/profiles', { klient: KLIENT_A });
  await api('GET', '/profiles', { klient: KLIENT_A });
  await api('GET', '/profiles', { klient: KLIENT_B });
  flush();

  const { status, body } = await api('GET', '/kennzahlen', { key: AG_KEY, klient: KLIENT_A });
  assert.equal(status, 200);
  assert.equal(body.nutzung.fenster.zugriffe, 4);
  assert.equal(body.nutzung.fenster.klienten, 2);
  assert.equal(body.nutzung.heute.zugriffe, 4);
  assert.equal(body.nutzung.routen[0].route, 'GET /api/profiles');
  assert.equal(body.nutzung.routen[0].zugriffe, 4);
  // Der Abruf selbst taucht nicht auf — sonst waere die Ansicht ihr eigener Spitzenreiter.
  assert.equal(
    body.nutzung.routen.some((r) => r.route.includes('kennzahlen')),
    false,
  );
});

test('kennzahlen: Fehlerantworten zaehlen als Fehler', async (t) => {
  const { api, flush } = await start(t);
  await api('GET', '/profiles', { klient: KLIENT_A });
  await api('GET', '/profiles/6f2b1c4a-1111-4222-8333-444455556666', { klient: KLIENT_A });
  flush();
  const { body } = await api('GET', '/kennzahlen', { key: AG_KEY });
  assert.equal(body.nutzung.fenster.zugriffe, 2);
  assert.equal(body.nutzung.fenster.fehler, 1);
});

test('kennzahlen: Zugriffe ohne Kennung werden getrennt ausgewiesen', async (t) => {
  const { api, flush } = await start(t);
  await api('GET', '/profiles');
  await api('GET', '/profiles', { klient: KLIENT_A });
  flush();
  const { body } = await api('GET', '/kennzahlen', { key: AG_KEY });
  assert.equal(body.nutzung.fenster.zugriffe, 2);
  assert.equal(body.nutzung.fenster.klienten, 1);
  assert.equal(body.nutzung.ohneKennung, 1);
});

test('kennzahlen: Zeitraum und Verlauf haben die angefragte Laenge', async (t) => {
  const { api } = await start(t);
  const sieben = await api('GET', '/kennzahlen?tage=7', { key: AG_KEY });
  assert.equal(sieben.body.zeitraum.tage, 7);
  assert.equal(sieben.body.nutzung.verlauf.length, 7);
  assert.equal(sieben.body.nutzung.stundenprofil.length, 24);
  // Unsinnige Angaben fallen auf den Standard bzw. die Grenzen zurueck.
  assert.equal((await api('GET', '/kennzahlen?tage=abc', { key: AG_KEY })).body.zeitraum.tage, 30);
  assert.equal((await api('GET', '/kennzahlen?tage=0', { key: AG_KEY })).body.zeitraum.tage, 30);
  assert.equal((await api('GET', '/kennzahlen?tage=-5', { key: AG_KEY })).body.zeitraum.tage, 1);
  assert.equal(
    (await api('GET', '/kennzahlen?tage=9999', { key: AG_KEY })).body.zeitraum.tage,
    365,
  );
});

test('kennzahlen: frische Instanz liefert Nullen statt Luecken', async (t) => {
  const { api } = await start(t);
  const { body } = await api('GET', '/kennzahlen?tage=3', { key: AG_KEY });
  assert.deepEqual(
    body.nutzung.verlauf.map((v) => v.zugriffe),
    [0, 0, 0],
  );
  assert.deepEqual(body.nutzung.routen, []);
  assert.equal(body.nutzung.fenster.dauerMs, 0);
});

// ── Bestand ───────────────────────────────────────────────────────────

test('kennzahlen: Bestand spiegelt Profile, Abnahme und offene Hinweise', async (t) => {
  const { api } = await start(t);
  const a = await api('POST', '/profiles', { body: doc('A'), key: AG_KEY });
  await api('POST', '/profiles', { body: doc('B'), key: AG_KEY });
  await api('POST', `/profiles/${a.body.id}/abnahme`, { body: {}, key: AG_KEY });
  await api('POST', `/profiles/${a.body.id}/hinweise`, {
    body: { pfad: 'a', text: 'bitte pruefen' },
  });

  const { body } = await api('GET', '/kennzahlen', { key: AG_KEY });
  assert.equal(body.bestand.profile, 2);
  assert.equal(body.bestand.profileAbgenommen, 1);
  assert.equal(body.bestand.hinweiseOffen, 1);
  assert.equal(body.bestand.hinweiseGesamt, 1);
  assert.equal(body.bestand.profileMitOffenenHinweisen, 1);
  assert.equal(body.bestand.punkteEntschieden, 0);
  assert.equal(typeof body.bestand.punkteGesamt, 'number');
  assert.ok(body.bestand.zuletztAktualisiert > 0);
});
