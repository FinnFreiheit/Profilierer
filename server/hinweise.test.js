import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.js';
import { createApp } from './app.js';

/**
 * HTTP-Naht der Hinweis-Ressource (Issue #39): Hinweise liegen in eigener
 * Ablage neben dem Profil-Dokument und werden ueber eigene Endpunkte unterhalb
 * der Profil-Ressource geschrieben. Geprueft wird ausschliesslich extern
 * beobachtbares Verhalten (Status, JSON-Antworten) — Vorbild abnahme.test.js.
 */

const AG_KEY = 'geheimer-ag-schluessel';

/** Startet App + DB auf einem Ephemeral-Port; raeumt via t.after auf. */
async function start(t, { agKey, db: vorhandene } = {}) {
  const db = vorhandene ?? openDb(':memory:');
  const app = createApp(db, { agKey });
  const srv = app.listen(0);
  await new Promise((res) => srv.once('listening', res));
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  t.after(() => {
    srv.close();
    if (!vorhandene) db.close();
  });
  const api = async (method, path, { body, key } = {}) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(key !== undefined ? { 'x-ag-key': key } : {}),
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
  return { api, db };
}

/** Minimales ProfileDoc fuer die HTTP-Tests. */
const doc = (over = {}) => ({
  meta: { name: 'P', nachricht: 'nachricht.x', xjustizVersion: '3.6.2' },
  statuses: [],
  elemente: { a: { status: 's1' } },
  auspraegungen: {},
  erweiterungen: {},
  ...over,
});

async function neuesProfil(api, over) {
  const r = await api('POST', '/profiles', { body: doc(over) });
  assert.equal(r.status, 201);
  return r.body.id;
}

// ── Grundvertrag: mehrere Hinweise je Element ─────────────────────────

test('Hinweise: anlegen, listen, aendern, abhaken, loeschen', async (t) => {
  const { api } = await start(t);
  const id = await neuesProfil(api);
  assert.deepEqual((await api('GET', `/profiles/${id}/hinweise`)).body, []);

  const a = await api('POST', `/profiles/${id}/hinweise`, {
    body: { pfad: 'm/az', text: 'erste Rueckmeldung' },
  });
  assert.equal(a.status, 201);
  assert.ok(a.body.hinweis.id);
  assert.equal(a.body.hinweis.pfad, 'm/az');
  assert.equal(a.body.hinweis.text, 'erste Rueckmeldung');
  assert.ok(a.body.hinweis.zeit > 0);
  assert.equal(a.body.hinweis.erledigt, undefined);

  // Zweiter Hinweis am SELBEN Element — kein Ueberschreiben.
  const b = await api('POST', `/profiles/${id}/hinweise`, {
    body: { pfad: 'm/az', text: 'zweite Rueckmeldung' },
  });
  assert.equal(b.status, 201);
  const liste = (await api('GET', `/profiles/${id}/hinweise`)).body;
  assert.equal(liste.length, 2);
  assert.deepEqual(
    liste.map((h) => h.text),
    ['erste Rueckmeldung', 'zweite Rueckmeldung'],
  );

  // Einzeln aendern und abhaken.
  const p = await api('PATCH', `/profiles/${id}/hinweise/${a.body.hinweis.id}`, {
    body: { text: 'korrigiert', erledigt: true },
  });
  assert.equal(p.status, 200);
  assert.equal(p.body.hinweis.text, 'korrigiert');
  assert.equal(p.body.hinweis.erledigt, true);
  // Der zweite bleibt unberuehrt.
  const nachPatch = (await api('GET', `/profiles/${id}/hinweise`)).body;
  assert.equal(nachPatch.find((h) => h.id === b.body.hinweis.id).erledigt, undefined);
  // Offene vor erledigten.
  assert.deepEqual(
    nachPatch.map((h) => h.text),
    ['zweite Rueckmeldung', 'korrigiert'],
  );

  // Einzeln loeschen.
  assert.equal((await api('DELETE', `/profiles/${id}/hinweise/${a.body.hinweis.id}`)).status, 204);
  const rest = (await api('GET', `/profiles/${id}/hinweise`)).body;
  assert.deepEqual(
    rest.map((h) => h.id),
    [b.body.hinweis.id],
  );
});

test('Hinweise: Server stempelt den Zeitpunkt selbst und ignoriert Client-Angaben', async (t) => {
  const { api } = await start(t);
  const id = await neuesProfil(api);
  const vorher = Date.now();
  const r = await api('POST', `/profiles/${id}/hinweise`, {
    body: { pfad: 'm/az', text: 'x', zeit: 5, autor: 'Ich', rolle: 'ag', id: 'gewuenscht' },
  });
  assert.equal(r.status, 201);
  assert.notEqual(r.body.hinweis.id, 'gewuenscht');
  assert.ok(r.body.hinweis.zeit >= vorher);
  // Autor/Rolle bleiben in diesem Ticket leer (kommen mit der Autorschaft).
  assert.equal(r.body.hinweis.autor, undefined);
  assert.equal(r.body.hinweis.rolle, undefined);
});

test('Hinweise: unbekanntes Profil bzw. unbekannter Hinweis → 404, leerer Text → 400', async (t) => {
  const { api } = await start(t);
  const id = await neuesProfil(api);
  assert.equal((await api('GET', '/profiles/fehlt/hinweise')).status, 404);
  assert.equal(
    (await api('POST', '/profiles/fehlt/hinweise', { body: { pfad: 'a', text: 't' } })).status,
    404,
  );
  assert.equal(
    (await api('POST', `/profiles/${id}/hinweise`, { body: { pfad: 'a', text: '  ' } })).status,
    400,
  );
  assert.equal(
    (await api('PATCH', `/profiles/${id}/hinweise/fehlt`, { body: { erledigt: true } })).status,
    404,
  );
  assert.equal((await api('DELETE', `/profiles/${id}/hinweise/fehlt`)).status, 404);
  // Fremder Hinweis faellt an der Profil-Zuordnung durch.
  const fremd = await neuesProfil(api);
  const h = await api('POST', `/profiles/${fremd}/hinweise`, { body: { pfad: 'a', text: 't' } });
  assert.equal(
    (await api('PATCH', `/profiles/${id}/hinweise/${h.body.hinweis.id}`, { body: { text: 'y' } }))
      .status,
    404,
  );
});

// ── Trennung vom Profil-Dokument ──────────────────────────────────────

test('Volldokument-Schreiben (Autosave) loescht keine Hinweise', async (t) => {
  const { api } = await start(t);
  const id = await neuesProfil(api);
  await api('POST', `/profiles/${id}/hinweise`, { body: { pfad: 'm/az', text: 'bleibt' } });
  // Ein anderer Bearbeiter schreibt das Volldokument (Autosave aus altem Stand).
  const put = await api('PUT', `/profiles/${id}`, { body: doc({ elemente: { a: {} } }) });
  assert.equal(put.status, 200);
  const liste = (await api('GET', `/profiles/${id}/hinweise`)).body;
  assert.deepEqual(
    liste.map((h) => h.text),
    ['bleibt'],
  );
});

test('Hinweisfelder in eingelieferten Dokumenten werden serverseitig verworfen', async (t) => {
  const { api } = await start(t);
  const eingeschleust = doc({
    elemente: { a: { status: 's1', hinweis: 'geschmuggelt', hinweisErledigt: true } },
  });
  const id = await neuesProfil(api, eingeschleust);
  const geladen = (await api('GET', `/profiles/${id}`)).body;
  assert.equal(geladen.elemente.a.hinweis, undefined);
  assert.equal(geladen.elemente.a.hinweisErledigt, undefined);
  assert.equal(geladen.elemente.a.status, 's1');
  // Sie werden verworfen, nicht in die Ablage uebernommen.
  assert.deepEqual((await api('GET', `/profiles/${id}/hinweise`)).body, []);
  // Auch ueber PUT.
  await api('PUT', `/profiles/${id}`, { body: eingeschleust });
  assert.equal((await api('GET', `/profiles/${id}`)).body.elemente.a.hinweis, undefined);
});

test('Hinweise beruehren "geaendert seit Abnahme" nicht', async (t) => {
  const { api } = await start(t, { agKey: AG_KEY });
  const id = await neuesProfil(api);
  await api('POST', `/profiles/${id}/abnahme`, { body: {}, key: AG_KEY });
  const r = await api('POST', `/profiles/${id}/hinweise`, {
    body: { pfad: 'm/az', text: 'Rueckmeldung' },
    key: AG_KEY,
  });
  assert.equal(r.status, 201);
  const zeile = (await api('GET', '/profiles')).body.find((e) => e.id === id);
  assert.equal(zeile.abgenommen, true);
  assert.equal(zeile.geaendertSeitAbnahme, undefined);
  // Auch das Abhaken aendert nichts am Dokument.
  await api('PATCH', `/profiles/${id}/hinweise/${r.body.hinweis.id}`, {
    body: { erledigt: true },
    key: AG_KEY,
  });
  const danach = (await api('GET', '/profiles')).body.find((e) => e.id === id);
  assert.equal(danach.geaendertSeitAbnahme, undefined);
});

// ── Rechte (in diesem Ticket unveraendert) ────────────────────────────

test('Schutz: an abgenommenen Profilen bleiben Hinweise fuer Externe gesperrt', async (t) => {
  const { api } = await start(t, { agKey: AG_KEY });
  const id = await neuesProfil(api);
  const h = await api('POST', `/profiles/${id}/hinweise`, { body: { pfad: 'a', text: 't' } });
  await api('POST', `/profiles/${id}/abnahme`, { body: {}, key: AG_KEY });
  const hid = h.body.hinweis.id;
  assert.equal(
    (await api('POST', `/profiles/${id}/hinweise`, { body: { pfad: 'a', text: 'neu' } })).status,
    403,
  );
  assert.equal(
    (await api('PATCH', `/profiles/${id}/hinweise/${hid}`, { body: { erledigt: true } })).status,
    403,
  );
  assert.equal((await api('DELETE', `/profiles/${id}/hinweise/${hid}`)).status, 403);
  assert.equal((await api('PUT', `/profiles/${id}/hinweise`, { body: [] })).status, 403);
  // Lesen bleibt frei, die AG darf schreiben.
  assert.equal((await api('GET', `/profiles/${id}/hinweise`)).status, 200);
  assert.equal(
    (
      await api('PATCH', `/profiles/${id}/hinweise/${hid}`, {
        body: { erledigt: true },
        key: AG_KEY,
      })
    ).status,
    200,
  );
});

// ── Import (Volltausch) ───────────────────────────────────────────────

test('Import ersetzt die Hinweise eines Profils und erhaelt Zeit/Autor/Rolle', async (t) => {
  const { api } = await start(t);
  const id = await neuesProfil(api);
  await api('POST', `/profiles/${id}/hinweise`, { body: { pfad: 'alt', text: 'vorher' } });
  const r = await api('PUT', `/profiles/${id}/hinweise`, {
    body: [
      { pfad: 'm/az', text: 'aus Datei', zeit: 1700000000000, autor: 'Anna', rolle: 'extern' },
      { pfad: 'm/az', text: 'erledigt', zeit: 1700000000001, erledigt: true },
    ],
  });
  assert.equal(r.status, 200);
  const liste = (await api('GET', `/profiles/${id}/hinweise`)).body;
  assert.equal(liste.length, 2);
  const neu = liste.find((h) => h.text === 'aus Datei');
  assert.equal(neu.zeit, 1700000000000);
  assert.equal(neu.autor, 'Anna');
  assert.equal(neu.rolle, 'extern');
  assert.ok(neu.id);
  assert.equal(liste.find((h) => h.text === 'erledigt').erledigt, true);
  // "vorher" ist ersetzt, nicht zusammengefuehrt.
  assert.equal(
    liste.some((h) => h.text === 'vorher'),
    false,
  );
});

// ── Lebenszyklus ──────────────────────────────────────────────────────

test('Duplizieren uebernimmt die Hinweise; Version und Restore lassen sie unberuehrt', async (t) => {
  const { api } = await start(t);
  const id = await neuesProfil(api);
  await api('POST', `/profiles/${id}/hinweise`, { body: { pfad: 'm/az', text: 'offen' } });

  const dup = await api('POST', `/profiles/${id}/duplicate`);
  assert.equal(dup.status, 201);
  const kopie = (await api('GET', `/profiles/${dup.body.id}/hinweise`)).body;
  assert.deepEqual(
    kopie.map((h) => h.text),
    ['offen'],
  );
  // Eigene Ablage: die Kopie haengt nicht am Original.
  await api('DELETE', `/profiles/${dup.body.id}/hinweise/${kopie[0].id}`);
  assert.equal((await api('GET', `/profiles/${id}/hinweise`)).body.length, 1);

  // Version friert nichts ein, Wiederherstellen holt nichts zurueck.
  const v = await api('POST', `/profiles/${id}/versions`, { body: { kommentar: 'v1' } });
  assert.equal(v.status, 201);
  const h2 = await api('POST', `/profiles/${id}/hinweise`, {
    body: { pfad: 'b', text: 'spaeter' },
  });
  const rest = await api('POST', `/profiles/${id}/versions/${v.body.version.id}/restore`, {
    body: {},
  });
  assert.equal(rest.status, 200);
  const nachRestore = (await api('GET', `/profiles/${id}/hinweise`)).body;
  assert.deepEqual(nachRestore.map((h) => h.text).sort(), ['offen', 'spaeter']);
  assert.ok(nachRestore.some((h) => h.id === h2.body.hinweis.id));
});

test('Profil loeschen raeumt seine Hinweise mit weg', async (t) => {
  const { api, db } = await start(t);
  const id = await neuesProfil(api);
  await api('POST', `/profiles/${id}/hinweise`, { body: { pfad: 'a', text: 't' } });
  assert.equal((await api('DELETE', `/profiles/${id}`)).status, 204);
  assert.equal(db._db.prepare('SELECT COUNT(*) AS n FROM hinweise').get().n, 0);
});

// ── Migration des Altbestands ─────────────────────────────────────────

test('Migration beim Serverstart: Hinweisfeld wird Listeneintrag, Feld verschwindet', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  // Altbestand direkt in die Tabelle schreiben (an der API vorbei, die strippt).
  const alt = doc({
    elemente: {
      a: { status: 's1', hinweis: 'Mit Registergericht klaeren' },
      b: { hinweis: 'schon abgearbeitet', hinweisErledigt: true },
      c: { status: 's2' },
    },
  });
  db._db
    .prepare(
      `INSERT INTO profiles (id, doc, doc_hash, name, aktualisiert) VALUES ('alt-1', ?, 'h', 'P', 4242)`,
    )
    .run(JSON.stringify(alt));

  // openDb faehrt die Migration beim Oeffnen; eine In-Memory-DB laesst sich
  // nicht neu oeffnen, daher hier direkt auf der offenen Instanz.
  db.migriereHinweise();

  const { api } = await start(t, { db });
  const geladen = (await api('GET', '/profiles/alt-1')).body;
  assert.equal(geladen.elemente.a.hinweis, undefined);
  assert.equal(geladen.elemente.a.hinweisErledigt, undefined);
  assert.equal(geladen.elemente.a.status, 's1');
  assert.equal(geladen.elemente.b, undefined, 'leerer Eintrag wird weggeraeumt');

  const liste = (await api('GET', '/profiles/alt-1/hinweise')).body;
  assert.equal(liste.length, 2);
  const a = liste.find((h) => h.pfad === 'a');
  assert.equal(a.text, 'Mit Registergericht klaeren');
  assert.equal(a.erledigt, undefined);
  assert.equal(a.zeit, 4242, 'Zeitpunkt = letzte Aenderung des Profils');
  assert.equal(a.autor, undefined);
  assert.equal(a.rolle, undefined);
  const b = liste.find((h) => h.pfad === 'b');
  assert.equal(b.text, 'schon abgearbeitet');
  assert.equal(b.erledigt, true);

  // Idempotent: ein zweiter Lauf legt nichts nach.
  db.migriereHinweise();
  assert.equal((await api('GET', '/profiles/alt-1/hinweise')).body.length, 2);
});

test('Migration: eingefrorene Versionen verlieren die Hinweisfelder, Kennzeichen bleiben ruhig', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const alt = doc({ elemente: { a: { status: 's1', hinweis: 'klaeren' } } });
  const docStr = JSON.stringify(alt);
  db._db
    .prepare(
      `INSERT INTO profiles (id, doc, doc_hash, name, aktualisiert, abnahme_version_id)
       VALUES ('alt-2', ?, 'gleich', 'P', 100, 'ver-1')`,
    )
    .run(docStr);
  db._db
    .prepare(
      `INSERT INTO profile_versions (id, profile_id, nr, doc, doc_hash, abnahme, erstellt)
       VALUES ('ver-1', 'alt-2', 1, ?, 'gleich', 1, 100)`,
    )
    .run(docStr);

  db.migriereHinweise();
  const { api } = await start(t, { db });
  const zeile = (await api('GET', '/profiles')).body.find((e) => e.id === 'alt-2');
  assert.equal(zeile.abgenommen, true);
  assert.equal(
    zeile.geaendertSeitAbnahme,
    undefined,
    'die Migration selbst ist keine inhaltliche Aenderung',
  );
  const ver = (await api('GET', '/profiles/alt-2/versions/ver-1')).body;
  assert.equal(ver.doc.elemente.a.hinweis, undefined);
  // Der Hinweis haengt am Profil, nicht an der Version.
  assert.equal((await api('GET', '/profiles/alt-2/hinweise')).body.length, 1);
});
