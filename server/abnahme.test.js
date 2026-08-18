import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.js';
import { createApp } from './app.js';

/**
 * HTTP-Seam der Abnahme-/Rollen-Story: die echten Router samt Auth werden in
 * eine In-Process-Express-App montiert und per fetch gegen eine In-Memory-
 * SQLite getestet. Geprueft wird ausschliesslich extern beobachtbares
 * Verhalten (Status, JSON-Antworten) — keine Middleware-Interna.
 */

const AG_KEY = 'geheimer-ag-schluessel';

/** Startet App + DB auf einem Ephemeral-Port; raeumt via t.after auf. */
async function start(t, { agKey } = {}) {
  const db = openDb(':memory:');
  const app = createApp(db, { agKey });
  const srv = app.listen(0);
  await new Promise((res) => srv.once('listening', res));
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  t.after(() => {
    srv.close();
    db.close();
  });
  /** Kleiner HTTP-Helfer: { status, body } — body als JSON, sonst Text. */
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
      /* Roh-Text (z. B. XML) */
    }
    return { status: r.status, body: parsed };
  };
  return { api, db };
}

// ── Login-Pruef-Endpunkt ──────────────────────────────────────────────

test('login: korrekter Schluessel wird bestaetigt, falscher klar abgewiesen', async (t) => {
  const { api } = await start(t, { agKey: AG_KEY });
  const ok = await api('POST', '/login', { body: { key: AG_KEY } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { konfiguriert: true, ok: true });
  const falsch = await api('POST', '/login', { body: { key: 'tippfehler' } });
  assert.equal(falsch.status, 200);
  assert.deepEqual(falsch.body, { konfiguriert: true, ok: false });
});

test('login: ohne konfigurierten AG-Schluessel existiert die Rolle nicht', async (t) => {
  const { api } = await start(t);
  const r = await api('POST', '/login', { body: { key: 'egal' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { konfiguriert: false, ok: false });
});

// ── Profil-Abnahme ────────────────────────────────────────────────────

/** Minimales ProfileDoc fuer die HTTP-Tests. */
const doc = (over = {}) => ({
  meta: { name: 'P', nachricht: 'nachricht.x', xjustizVersion: '3.6.2' },
  statuses: [],
  elemente: { a: { status: 's1' } },
  auspraegungen: {},
  ...over,
});

/** Legt ein Profil an und gibt seine id zurueck. */
async function neuesProfil(api, over) {
  const r = await api('POST', '/profiles', { body: doc(over) });
  assert.equal(r.status, 201);
  return r.body.id;
}

test('Profil abnehmen: AG erzeugt Abnahme-Version, Entry und Listen tragen das Kennzeichen', async (t) => {
  const { api } = await start(t, { agKey: AG_KEY });
  const id = await neuesProfil(api);
  const r = await api('POST', `/profiles/${id}/abnahme`, {
    body: { kommentar: 'geprueft und passt' },
    key: AG_KEY,
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.version.nr, 1);
  assert.equal(r.body.version.abnahme, true);
  assert.equal(r.body.version.kommentar, 'geprueft und passt');
  assert.equal(r.body.entry.abgenommen, true);
  assert.equal(r.body.entry.abnahmeKommentar, 'geprueft und passt');
  assert.equal(r.body.entry.abnahmeVersionNr, 1);
  assert.ok(r.body.entry.abnahmeZeit > 0);
  assert.equal(r.body.entry.geaendertSeitAbnahme, undefined);
  // Index-Vertrag: die Liste fuehrt dieselben Felder mit.
  const list = await api('GET', '/profiles');
  const zeile = list.body.find((e) => e.id === id);
  assert.equal(zeile.abgenommen, true);
  assert.equal(zeile.abnahmeVersionNr, 1);
  assert.equal(zeile.geaendertSeitAbnahme, undefined);
  // Versionsliste kennzeichnet die Abnahme-Version.
  const vs = await api('GET', `/profiles/${id}/versions`);
  assert.equal(vs.body[0].abnahme, true);
});

test('Profil abnehmen: ohne bzw. mit falschem Schluessel abgewiesen, ohne Konfiguration inexistent', async (t) => {
  const { api } = await start(t, { agKey: AG_KEY });
  const id = await neuesProfil(api);
  assert.equal((await api('POST', `/profiles/${id}/abnahme`, { body: {} })).status, 403);
  assert.equal(
    (await api('POST', `/profiles/${id}/abnahme`, { body: {}, key: 'falsch' })).status,
    403,
  );
  // Unbekanntes Profil mit gueltigem Schluessel → 404.
  assert.equal(
    (await api('POST', `/profiles/fehlt/abnahme`, { body: {}, key: AG_KEY })).status,
    404,
  );
  // Instanz ohne AG-Schluessel: Abnahme existiert nicht.
  const ohne = await start(t);
  const id2 = await neuesProfil(ohne.api);
  assert.equal(
    (await ohne.api('POST', `/profiles/${id2}/abnahme`, { body: {}, key: AG_KEY })).status,
    403,
  );
});

test('Oeffnen allein aendert nichts: abgeleitete Felder setzen das Kennzeichen nicht', async (t) => {
  const { api } = await start(t, { agKey: AG_KEY });
  const id = await neuesProfil(api);
  await api('POST', `/profiles/${id}/abnahme`, { body: {}, key: AG_KEY });
  // Genau das schreibt der Autosave nach dem blossen Oeffnen zurueck: dieselbe
  // fachliche Aussage, dazu der abgeleitete Punktestand (#93) und eine andere
  // Schluesselreihenfolge. Beides ist keine Aenderung der Profilierung.
  const nachOeffnen = {
    statuses: [],
    elemente: { a: { status: 's1' } },
    meta: { nachricht: 'nachricht.x', name: 'P', xjustizVersion: '3.6.2' },
    auspraegungen: {},
    fortschritt: { x: 0, y: 731 },
  };
  const put = await api('PUT', `/profiles/${id}`, { body: nachOeffnen, key: AG_KEY });
  assert.equal(put.status, 200);
  assert.equal(put.body.entry.abgenommen, true);
  assert.equal(put.body.entry.geaendertSeitAbnahme, undefined);
  // Der Index muss dasselbe sagen wie der Entry der Schreibantwort.
  const list = await api('GET', '/profiles');
  assert.equal(list.body.find((e) => e.id === id).geaendertSeitAbnahme, undefined);
  // Eine echte Entscheidung setzt das Kennzeichen weiterhin.
  const echt = await api('PUT', `/profiles/${id}`, {
    body: { ...nachOeffnen, elemente: { a: { status: 's2' } } },
    key: AG_KEY,
  });
  assert.equal(echt.body.entry.geaendertSeitAbnahme, true);
});

test('geaendert seit Abnahme: Hash-Vergleich, Neuabnahme verschiebt die Referenz', async (t) => {
  const { api } = await start(t, { agKey: AG_KEY });
  const id = await neuesProfil(api);
  await api('POST', `/profiles/${id}/abnahme`, { body: {}, key: AG_KEY });
  // AG aendert weiter → Kennzeichen "geaendert seit Abnahme".
  const put = await api('PUT', `/profiles/${id}`, {
    body: doc({ elemente: { a: { status: 's2' } } }),
    key: AG_KEY,
  });
  assert.equal(put.status, 200);
  assert.equal(put.body.entry.abgenommen, true);
  assert.equal(put.body.entry.geaendertSeitAbnahme, true);
  // Neuabnahme: naechster Snapshot wird zur validen Fassung, Kennzeichen weg.
  const neu = await api('POST', `/profiles/${id}/abnahme`, { body: {}, key: AG_KEY });
  assert.equal(neu.body.version.nr, 2);
  assert.equal(neu.body.entry.abnahmeVersionNr, 2);
  assert.equal(neu.body.entry.geaendertSeitAbnahme, undefined);
  // Beide Abnahme-Snapshots bleiben in der Historie.
  const vs = await api('GET', `/profiles/${id}/versions`);
  assert.deepEqual(
    vs.body.map((v) => [v.nr, v.abnahme]),
    [
      [2, true],
      [1, true],
    ],
  );
});

// ── Schutzvertrag ─────────────────────────────────────────────────────

test('Vergleich: Versions- und Abnahme-Dokument sind ohne AG-Schluessel lesbar', async (t) => {
  const { api } = await start(t, { agKey: AG_KEY });
  const id = await neuesProfil(api);
  const abn = await api('POST', `/profiles/${id}/abnahme`, {
    body: { kommentar: 'Stand der Abnahme' },
    key: AG_KEY,
  });
  const vid = abn.body.version.id;
  // Arbeitsstand veraendern (mit Schluessel, das Profil ist ja geschuetzt).
  await api('PUT', `/profiles/${id}`, {
    body: doc({ elemente: { a: { status: 's2' } } }),
    key: AG_KEY,
  });

  // Lesen ohne Schluessel, obwohl das Profil abgenommen ist.
  const ver = await api('GET', `/profiles/${id}/versions/${vid}`);
  assert.equal(ver.status, 200);
  assert.equal(ver.body.nr, 1);
  assert.equal(ver.body.abnahme, true);
  assert.equal(ver.body.kommentar, 'Stand der Abnahme');
  assert.equal(ver.body.doc.elemente.a.status, 's1');

  // Direkteinstieg ueber die Referenz liefert dasselbe.
  const direkt = await api('GET', `/profiles/${id}/abnahme`);
  assert.equal(direkt.status, 200);
  assert.equal(direkt.body.id, vid);
  assert.deepEqual(direkt.body.doc, ver.body.doc);

  // Unbekannte Version bzw. unbekanntes Profil → 404.
  assert.equal((await api('GET', `/profiles/${id}/versions/fehlt`)).status, 404);
  assert.equal((await api('GET', `/profiles/fehlt/versions/${vid}`)).status, 404);

  // Ohne Abnahme-Kennzeichen: 404 statt eines beliebigen Snapshots.
  await api('DELETE', `/profiles/${id}/abnahme`, { key: AG_KEY });
  assert.equal((await api('GET', `/profiles/${id}/abnahme`)).status, 404);
  // Die Version selbst bleibt lesbar.
  assert.equal((await api('GET', `/profiles/${id}/versions/${vid}`)).status, 200);
});

test('Schutz: externe Schreiboperationen auf ein abgenommenes Profil werden abgewiesen', async (t) => {
  const { api } = await start(t, { agKey: AG_KEY });
  const id = await neuesProfil(api);
  const abn = await api('POST', `/profiles/${id}/abnahme`, { body: {}, key: AG_KEY });
  const versionId = abn.body.version.id;
  // Alle Schreiboperationen ohne (oder mit falschem) Schluessel: 403.
  assert.equal((await api('PUT', `/profiles/${id}`, { body: doc() })).status, 403);
  assert.equal(
    (await api('PATCH', `/profiles/${id}`, { body: { name: 'Neu' }, key: 'falsch' })).status,
    403,
  );
  assert.equal((await api('DELETE', `/profiles/${id}`)).status, 403);
  assert.equal((await api('POST', `/profiles/${id}/versions`, { body: {} })).status, 403);
  assert.equal(
    (await api('POST', `/profiles/${id}/versions/${versionId}/restore`, { body: {} })).status,
    403,
  );
  assert.equal((await api('DELETE', `/profiles/${id}/versions/${versionId}`)).status, 403);
  // Nichts davon hat gewirkt: Profil unveraendert vorhanden, Version bleibt.
  const geladen = await api('GET', `/profiles/${id}`);
  assert.equal(geladen.status, 200);
  assert.equal(geladen.body.meta.name, 'P');
  assert.equal((await api('GET', `/profiles/${id}/versions`)).body.length, 1);
  // Lesen und Umbenennen mit gueltigem Schluessel bleiben moeglich.
  const agRename = await api('PATCH', `/profiles/${id}`, {
    body: { name: 'AG-Stand' },
    key: AG_KEY,
  });
  assert.equal(agRename.status, 200);
  assert.equal(agRename.body.entry.name, 'AG-Stand');
});

test('Schutz: unmarkierte Profile bleiben fuer alle frei schreibbar', async (t) => {
  const { api } = await start(t, { agKey: AG_KEY });
  const id = await neuesProfil(api);
  assert.equal((await api('PUT', `/profiles/${id}`, { body: doc() })).status, 200);
  assert.equal((await api('PATCH', `/profiles/${id}`, { body: { name: 'frei' } })).status, 200);
  assert.equal((await api('POST', `/profiles/${id}/versions`, { body: {} })).status, 201);
  assert.equal((await api('DELETE', `/profiles/${id}`)).status, 204);
});

test('Duplizieren bleibt fuer Externe erlaubt; die Kopie ist unmarkiert', async (t) => {
  const { api } = await start(t, { agKey: AG_KEY });
  const id = await neuesProfil(api);
  await api('POST', `/profiles/${id}/abnahme`, { body: {}, key: AG_KEY });
  const dup = await api('POST', `/profiles/${id}/duplicate`);
  assert.equal(dup.status, 201);
  assert.equal(dup.body.entry.name, 'P (Kopie)');
  assert.equal(dup.body.entry.abgenommen, undefined);
  // Die Kopie ist frei bearbeitbar.
  assert.equal(
    (await api('PATCH', `/profiles/${dup.body.id}`, { body: { name: 'meine' } })).status,
    200,
  );
});

test('Import/Einliefern: Abnahme-Felder im Dokument werden serverseitig verworfen', async (t) => {
  const { api } = await start(t, { agKey: AG_KEY });
  const eingeschleust = doc({ abnahme: { boese: true }, abgenommen: true });
  eingeschleust.meta = { ...eingeschleust.meta, abgenommen: true, abnahme: 'x' };
  const imp = await api('POST', '/import', {
    body: [{ id: 'fix-1', doc: eingeschleust, aktualisiert: 1000 }],
  });
  assert.equal(imp.status, 200);
  const zeile = (await api('GET', '/profiles')).body.find((e) => e.id === 'fix-1');
  assert.equal(zeile.abgenommen, undefined);
  const geladen = (await api('GET', '/profiles/fix-1')).body;
  assert.equal(geladen.abnahme, undefined);
  assert.equal(geladen.abgenommen, undefined);
  assert.equal(geladen.meta.abnahme, undefined);
  assert.equal(geladen.meta.abgenommen, undefined);
  // Auch beim direkten Anlegen (Profil-JSON-Import des Clients laeuft ueber POST).
  const neu = await api('POST', '/profiles', { body: doc({ abgenommen: true }) });
  assert.equal(neu.body.entry.abgenommen, undefined);
});

test('Referenzierte Abnahme-Version ist nicht loeschbar (409), nach Entfernen des Kennzeichens schon', async (t) => {
  const { api } = await start(t, { agKey: AG_KEY });
  const id = await neuesProfil(api);
  const abn = await api('POST', `/profiles/${id}/abnahme`, { body: {}, key: AG_KEY });
  const versionId = abn.body.version.id;
  const r = await api('DELETE', `/profiles/${id}/versions/${versionId}`, { key: AG_KEY });
  assert.equal(r.status, 409);
  assert.equal((await api('GET', `/profiles/${id}/versions`)).body.length, 1);
  await api('DELETE', `/profiles/${id}/abnahme`, { key: AG_KEY });
  const danach = await api('DELETE', `/profiles/${id}/versions/${versionId}`, { key: AG_KEY });
  assert.equal(danach.status, 204);
});

test('Abnahme entfernen: Referenz weg, Version bleibt', async (t) => {
  const { api } = await start(t, { agKey: AG_KEY });
  const id = await neuesProfil(api);
  await api('POST', `/profiles/${id}/abnahme`, { body: {}, key: AG_KEY });
  // Ohne Schluessel nicht erlaubt.
  assert.equal((await api('DELETE', `/profiles/${id}/abnahme`)).status, 403);
  const r = await api('DELETE', `/profiles/${id}/abnahme`, { key: AG_KEY });
  assert.equal(r.status, 200);
  assert.equal(r.body.entry.abgenommen, undefined);
  assert.equal(r.body.entry.geaendertSeitAbnahme, undefined);
  // Der Snapshot selbst ist nicht geloescht.
  const vs = await api('GET', `/profiles/${id}/versions`);
  assert.equal(vs.body.length, 1);
});

// ── Testnachrichten ───────────────────────────────────────────────────

const xml = (n) =>
  `<nachricht.gds.uebermittlung xjustizVersion="3.6.2"><wert>${n}</wert></nachricht.gds.uebermittlung>`;

/** Legt eine Testnachricht an und gibt ihre id zurueck. */
async function neueTm(api, n = 1) {
  const r = await api('POST', '/testmessages', {
    body: { name: `tm${n}.xml`, xml: xml(n), nachricht: 'nachricht.gds.uebermittlung' },
  });
  assert.equal(r.status, 201);
  return r.body.id;
}

test('Testnachricht abnehmen: XML-Fassung eingefroren, Entry und Liste tragen das Kennzeichen', async (t) => {
  const { api } = await start(t, { agKey: AG_KEY });
  const id = await neueTm(api);
  // Ohne Schluessel abgewiesen; ohne Konfiguration inexistent.
  assert.equal((await api('POST', `/testmessages/${id}/abnahme`, { body: {} })).status, 403);
  const r = await api('POST', `/testmessages/${id}/abnahme`, {
    body: { kommentar: 'freigegeben' },
    key: AG_KEY,
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.entry.abgenommen, true);
  assert.equal(r.body.entry.abnahmeKommentar, 'freigegeben');
  assert.ok(r.body.entry.abnahmeZeit > 0);
  assert.equal(r.body.entry.geaendertSeitAbnahme, undefined);
  const zeile = (await api('GET', '/testmessages')).body.find((e) => e.id === id);
  assert.equal(zeile.abgenommen, true);
  // Abgenommene Fassung ist abrufbar (Anzeige/Download).
  const frozen = await api('GET', `/testmessages/${id}/abnahme/xml`);
  assert.equal(frozen.status, 200);
  assert.equal(frozen.body, xml(1));
  // Nicht abgenommene Nachricht hat keine eingefrorene Fassung.
  const id2 = await neueTm(api, 2);
  assert.equal((await api('GET', `/testmessages/${id2}/abnahme/xml`)).status, 404);
});

test('Testnachricht: geaendert seit Abnahme per XML-Vergleich, Neuabnahme ersetzt den Stand', async (t) => {
  const { api } = await start(t, { agKey: AG_KEY });
  const id = await neueTm(api);
  await api('POST', `/testmessages/${id}/abnahme`, { body: {}, key: AG_KEY });
  const patch = await api('PATCH', `/testmessages/${id}`, {
    body: { xml: xml(99) },
    key: AG_KEY,
  });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.entry.geaendertSeitAbnahme, true);
  // Die eingefrorene Fassung bleibt die alte.
  assert.equal((await api('GET', `/testmessages/${id}/abnahme/xml`)).body, xml(1));
  // Neuabnahme ersetzt den Abnahme-Stand.
  const neu = await api('POST', `/testmessages/${id}/abnahme`, { body: {}, key: AG_KEY });
  assert.equal(neu.body.entry.geaendertSeitAbnahme, undefined);
  assert.equal((await api('GET', `/testmessages/${id}/abnahme/xml`)).body, xml(99));
});

test('Schutz: abgenommene Testnachricht ist extern unantastbar, Kennzeichen entfernbar', async (t) => {
  const { api } = await start(t, { agKey: AG_KEY });
  const id = await neueTm(api);
  await api('POST', `/testmessages/${id}/abnahme`, { body: {}, key: AG_KEY });
  assert.equal(
    (await api('PATCH', `/testmessages/${id}`, { body: { notiz: 'kritzel' } })).status,
    403,
  );
  assert.equal((await api('DELETE', `/testmessages/${id}`)).status, 403);
  assert.equal((await api('DELETE', `/testmessages/${id}/abnahme`)).status, 403);
  // Lesen bleibt frei.
  assert.equal((await api('GET', `/testmessages/${id}/xml`)).status, 200);
  // AG entfernt das Kennzeichen → wieder frei bearbeitbar.
  const weg = await api('DELETE', `/testmessages/${id}/abnahme`, { key: AG_KEY });
  assert.equal(weg.status, 200);
  assert.equal(weg.body.entry.abgenommen, undefined);
  assert.equal((await api('PATCH', `/testmessages/${id}`, { body: { notiz: 'ok' } })).status, 200);
  assert.equal((await api('GET', `/testmessages/${id}/abnahme/xml`)).status, 404);
});

test('Testnachricht: ohne konfigurierten Schluessel keine Abnahme, unmarkierte frei', async (t) => {
  const { api } = await start(t);
  const id = await neueTm(api);
  assert.equal(
    (await api('POST', `/testmessages/${id}/abnahme`, { body: {}, key: AG_KEY })).status,
    403,
  );
  assert.equal((await api('PATCH', `/testmessages/${id}`, { body: { notiz: 'n' } })).status, 200);
  assert.equal((await api('DELETE', `/testmessages/${id}`)).status, 204);
});
