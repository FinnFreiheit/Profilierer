import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oeffneTestDb } from './testhelfer.js';

const input = (over = {}) => ({
  name: 'antrag.xml',
  xml: '<nachricht.dabag.antrag.2900001 xmlns="http://www.xjustiz.de"/>',
  nachricht: 'nachricht.dabag.antrag.2900001',
  fachmodul: 'dabag',
  xjustizVersion: '3.6.2',
  groesse: 60,
  ...over,
});

test('tmCreate → tmList Roundtrip (Index ohne xml)', (t) => {
  const db = oeffneTestDb(t);
  const { id, entry } = db.tmCreate(input());
  assert.equal(entry.id, id);
  assert.equal(entry.name, 'antrag.xml');
  assert.equal(entry.fachmodul, 'dabag');
  assert.equal(entry.xjustizVersion, '3.6.2');
  const list = db.tmList();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, id);
  assert.equal(list[0].xml, undefined); // Liste enthält kein xml
});

test('tmLoadXml gibt das Roh-XML byte-gleich zurück', (t) => {
  const db = oeffneTestDb(t);
  const { id } = db.tmCreate(input());
  assert.equal(db.tmLoadXml(id), input().xml);
  assert.equal(db.tmLoadXml('gibtsnicht'), null);
});

test('tmList ist nach aktualisiert absteigend sortiert', (t) => {
  const db = oeffneTestDb(t);
  const a = db.tmCreate(input({ name: 'alt' }), 1000);
  const b = db.tmCreate(input({ name: 'neu' }), 2000);
  assert.deepEqual(
    db.tmList().map((e) => e.id),
    [b.id, a.id],
  );
});

test('tmUpdate ändert Notiz und Name, setzt aktualisiert', (t) => {
  const db = oeffneTestDb(t);
  const { id } = db.tmCreate(input(), 1000);
  const entry = db.tmUpdate(id, { notiz: 'Referenzfall' }, 3000);
  assert.equal(entry.notiz, 'Referenzfall');
  assert.equal(entry.name, 'antrag.xml'); // Name unverändert
  assert.equal(entry.aktualisiert, 3000);
  const umbenannt = db.tmUpdate(id, { name: 'Neu' }, 4000);
  assert.equal(umbenannt.name, 'Neu');
  assert.equal(umbenannt.notiz, 'Referenzfall'); // Notiz bleibt
  assert.equal(db.tmUpdate('gibtsnicht', { notiz: 'x' }), null);
});

test('tmBackfillVersionen ergänzt fehlende Version aus dem XML', (t) => {
  const db = oeffneTestDb(t);
  const xml =
    '<nachricht.dabag.antrag.2900001 xmlns="http://www.xjustiz.de">' +
    '<nachrichtenkopf xjustizVersion="3.6.2"/></nachricht.dabag.antrag.2900001>';
  const { id } = db.tmCreate(input({ xjustizVersion: undefined, xml }));
  assert.equal(db.tmList()[0].xjustizVersion, undefined); // zunächst ohne Version
  assert.equal(db.tmBackfillVersionen(), 1);
  assert.equal(db.tmList()[0].xjustizVersion, '3.6.2');
  assert.equal(db.tmBackfillVersionen(), 0); // idempotent
  assert.equal(id, db.tmList()[0].id);
});

test('tmBackfillVersionen lässt Nachrichten ohne Versionsattribut unberührt', (t) => {
  const db = oeffneTestDb(t);
  db.tmCreate(
    input({ xjustizVersion: undefined, xml: '<nachricht.x xmlns="http://www.xjustiz.de"/>' }),
  );
  assert.equal(db.tmBackfillVersionen(), 0);
  assert.equal(db.tmList()[0].xjustizVersion, undefined);
});

test('tmDelete entfernt Nachricht und XML', (t) => {
  const db = oeffneTestDb(t);
  const { id } = db.tmCreate(input());
  assert.equal(db.tmDelete(id), true);
  assert.equal(db.tmLoadXml(id), null);
  assert.equal(db.tmList().length, 0);
  assert.equal(db.tmDelete(id), false);
});

test('gefuehrte Erstellung: entwurf/fortschritt/entscheidungen Roundtrip', (t) => {
  const db = oeffneTestDb(t);
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
});

test('tmUpdate aktualisiert XML/Entwurf/Fortschritt/Entscheidungen selektiv', (t) => {
  const db = oeffneTestDb(t);
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
});

test('tmLoadEntscheidungen: null ohne Stand (hochgeladene Nachricht)', (t) => {
  const db = oeffneTestDb(t);
  const { id, entry } = db.tmCreate(input());
  assert.equal(entry.gefuehrt, undefined);
  assert.equal(db.tmLoadEntscheidungen(id), null);
  assert.equal(db.tmLoadEntscheidungen('gibtsnicht'), null);
});

test('Bezeichnungen: Roundtrip, ohne die Nachricht als gefuehrt zu markieren', (t) => {
  const db = oeffneTestDb(t);
  const bez = { 'nachricht.dabag.antrag.2900001/beteiligter': ['Kläger', 'Beklagter'] };
  const { id, entry } = db.tmCreate(input({ bezeichnungen: bez }));
  assert.deepEqual(db.tmLoadBezeichnungen(id), bez);
  // Entscheidend: `gefuehrt` haengt am Entscheidungsstand, nicht hieran.
  assert.equal(entry.gefuehrt, undefined);
  assert.equal(db.tmList()[0].gefuehrt, undefined);
});

test('tmUpdate: Bezeichnungen selektiv, leere Ablage raeumt auf', (t) => {
  const db = oeffneTestDb(t);
  const bez = { 'a/beteiligter': ['Kläger', 'Beklagter'] };
  const { id } = db.tmCreate(input({ bezeichnungen: bez }));
  // Nur XML ändern: die Namen bleiben stehen.
  db.tmUpdate(id, { xml: '<neu/>' });
  assert.deepEqual(db.tmLoadBezeichnungen(id), bez);
  // Neuer Stand ersetzt den alten.
  db.tmUpdate(id, { bezeichnungen: { 'a/beteiligter': ['Kläger'] } });
  assert.deepEqual(db.tmLoadBezeichnungen(id), { 'a/beteiligter': ['Kläger'] });
  // Letztes Vorkommen entfernt: kein verwaister Rest.
  db.tmUpdate(id, { bezeichnungen: {} });
  assert.equal(db.tmLoadBezeichnungen(id), null);
});

test('tmLoadBezeichnungen: null ohne Ablage (Upload/Altbestand)', (t) => {
  const db = oeffneTestDb(t);
  const { id } = db.tmCreate(input());
  assert.equal(db.tmLoadBezeichnungen(id), null);
  assert.equal(db.tmLoadBezeichnungen('gibtsnicht'), null);
});

test('Profil-Bindung: Herkunft im Index, eingefrorene Kopie separat lesbar', (t) => {
  const db = oeffneTestDb(t);
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
});

test('eingefrorene Kopie bleibt lesbar, nachdem die Profilierung geloescht wurde', (t) => {
  const db = oeffneTestDb(t);
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
});

test('Bindung loesen: Kopie und Kennzeichen weg, Herkunft bleibt (#32)', (t) => {
  const db = oeffneTestDb(t);
  const doc = { meta: { name: 'P' }, statuses: [], elemente: { 'a/b': {} }, auspraegungen: {} };
  const pid = db.create(doc).id;
  const { id } = db.tmCreate(
    input({ profilId: pid, profilName: 'P', fassung: 'v1', vorgabe: doc }),
  );
  // Profil weiterentwickelt: das Kennzeichen steht, solange die Kopie liegt.
  db.upsert(pid, { ...doc, elemente: { 'a/b': { anmerkung: 'neu' } } });
  assert.equal(db.tmList()[0].profilWeiterentwickelt, true);

  const entry = db.tmBindungLoesen(id);
  assert.equal(db.tmLoadVorgabe(id), null); // Sperren und Fuehrung enden
  assert.ok(!entry.profilWeiterentwickelt); // Konformitaets-Kennzeichen weg
  assert.equal(entry.profilId, pid); // Herkunft bleibt sichtbar
  assert.equal(entry.profilName, 'P');
  assert.equal(entry.fassung, 'v1');
  assert.equal(db.tmBindungLoesen('gibtsnicht'), null);
});

test('tmUpdate laesst die eingefrorene Kopie und die Herkunft unberuehrt', (t) => {
  const db = oeffneTestDb(t);
  const vorgabe = { meta: {}, statuses: [], elemente: { 'a/b': {} }, auspraegungen: {} };
  const { id } = db.tmCreate(input({ profilId: 'p1', profilName: 'P', fassung: 'v2', vorgabe }));
  const e = db.tmUpdate(id, { xml: '<neu/>', entwurf: false, profilId: 'p2', vorgabe: null });
  assert.equal(e.profilId, 'p1');
  assert.equal(e.fassung, 'v2');
  assert.deepEqual(db.tmLoadVorgabe(id), vorgabe);
});

test('Alt-Eintraege ohne Bindung bleiben lesbar und aenderbar', (t) => {
  const db = oeffneTestDb(t);
  const { id, entry } = db.tmCreate(input());
  assert.equal(entry.profilId, undefined);
  assert.equal(entry.profilName, undefined);
  assert.equal(entry.fassung, undefined);
  assert.equal(db.tmLoadVorgabe(id), null);
  const e = db.tmUpdate(id, { notiz: 'weiterhin änderbar' });
  assert.equal(e.notiz, 'weiterhin änderbar');
  assert.equal(e.profilId, undefined);
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

test('Kennzeichen: gebundene Fassung entspricht dem aktuellen Stand → kein Badge', (t) => {
  const db = oeffneTestDb(t);
  const doc = profilDoc();
  const { id: pid } = db.create(doc);
  db.tmCreate(
    input({ profilId: pid, profilName: 'Nachlass-Szenario', fassung: 'v1', vorgabe: doc }),
  );
  assert.equal(db.tmList()[0].profilWeiterentwickelt, undefined);
});

test('Kennzeichen: Profilierung weiterentwickelt → Badge im Index', (t) => {
  const db = oeffneTestDb(t);
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
});

test('Kennzeichen: erneutes Speichern ohne fachliche Aenderung ist keine Weiterentwicklung', (t) => {
  const db = oeffneTestDb(t);
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
});

test('Kennzeichen: keines ohne Bindung und keines nach dem Loeschen der Profilierung', (t) => {
  const db = oeffneTestDb(t);
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
});

test('tmList filtert nach Profilierung', (t) => {
  const db = oeffneTestDb(t);
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
});

test('testmessages und profiles teilen sich die DB ohne Kollision', (t) => {
  const db = oeffneTestDb(t);
  db.create({ meta: { name: 'P' }, statuses: [], elemente: {}, auspraegungen: {} });
  db.tmCreate(input());
  assert.equal(db.list().length, 1);
  assert.equal(db.tmList().length, 1);
});

// ── Schlagworte (Tags) ────────────────────────────────────────────────

test('tmCreate normalisiert Schlagworte: getrimmt, ohne Doppelte, alphabetisch', (t) => {
  const db = oeffneTestDb(t);
  const { entry } = db.tmCreate(input({ tags: [' Pilot ', 'pilot', 'eNoVA', '', 'Muster'] }));
  assert.deepEqual(entry.tags, ['eNoVA', 'Muster', 'Pilot']);
});

test('tmUpdate ersetzt die Schlagwortliste; ein Patch ohne tags laesst sie stehen', (t) => {
  const db = oeffneTestDb(t);
  const { id } = db.tmCreate(input({ tags: ['Pilot'] }));
  assert.deepEqual(db.tmUpdate(id, { tags: 'Muster, eNoVA' }).tags, ['eNoVA', 'Muster']);
  assert.deepEqual(db.tmUpdate(id, { notiz: 'x' }).tags, ['eNoVA', 'Muster']);
  // Leere Liste raeumt das Feld ganz weg (kein leeres Array auf der Kachel).
  assert.equal(db.tmUpdate(id, { tags: [] }).tags, undefined);
});

test('ohne Schlagworte traegt der Eintrag kein Feld (Altbestand)', (t) => {
  const db = oeffneTestDb(t);
  const { entry } = db.tmCreate(input());
  assert.equal(entry.tags, undefined);
});

// Die Profilierung 'p1' gibt es in dieser DB nicht: geprueft wird der Fall
// "Profilierung geloescht" — dann bleibt die Bindung des Originals stehen.
test('tmDuplicate: Variante erbt Bindung, Schlagworte und Beiwerk', (t) => {
  const db = oeffneTestDb(t);
  const vorgabe = { meta: {}, statuses: [], elemente: { 'a/b': {} }, auspraegungen: {} };
  const { id } = db.tmCreate(
    input({
      name: 'Ersuchen Gemeinde',
      tags: ['Pilot', 'GenUVA'],
      entwurf: true,
      fortschritt: { x: 3, y: 7 },
      bezeichnungen: { 'a/b': ['Notar'] },
      profilId: 'p1',
      profilName: 'Ersuchen an die Gemeinde',
      fassung: 'v2',
      vorgabe,
    }),
    1000,
  );
  // Die Notiz entsteht erst per Update — tmCreate legt sie fuer Uploads leer an.
  db.tmUpdate(id, { notiz: 'ein Beteiligter' }, 1000);

  const { id: kopieId, entry } = db.tmDuplicate(id, 2000);
  assert.notEqual(kopieId, id);
  assert.equal(entry.name, 'Ersuchen Gemeinde (Variante)');
  assert.equal(entry.notiz, 'ein Beteiligter');
  assert.deepEqual(entry.tags, ['GenUVA', 'Pilot']);
  assert.equal(entry.entwurf, true);
  assert.deepEqual(entry.fortschritt, { x: 3, y: 7 });
  assert.equal(entry.aktualisiert, 2000);

  // Profil-Bindung vollstaendig: Herkunft, eingefrorene Vorgabe und ihr Hash.
  // Ohne die Profilierung gibt es keinen aktuellen Stand zu binden, also bleibt
  // die Fassung des Originals stehen.
  assert.equal(entry.profilId, 'p1');
  assert.equal(entry.profilName, 'Ersuchen an die Gemeinde');
  assert.equal(entry.fassung, 'v2');
  assert.deepEqual(db.tmLoadVorgabe(kopieId), vorgabe);
  assert.deepEqual(db.tmLoadBezeichnungen(kopieId), { 'a/b': ['Notar'] });

  // XML byte-gleich, Nachrichtenkopf unangetastet: der spaetere Vergleich
  // zweier Varianten zeigt fachliche Unterschiede, kein Zeitstempel-Rauschen.
  assert.equal(db.tmLoadXml(kopieId), db.tmLoadXml(id));

  assert.equal(db.tmDuplicate('gibtsnicht'), null);
});

test('tmDuplicate: die Variante ist nicht abgenommen', (t) => {
  const db = oeffneTestDb(t);
  const { id } = db.tmCreate(input({ name: 'freigegeben' }));
  db.tmAbnahmeSetzen(id, { kommentar: 'geprueft' }, 1000);
  assert.equal(db.tmAbgenommen(id), true);

  const { id: kopieId, entry } = db.tmDuplicate(id);
  assert.equal(db.tmAbgenommen(kopieId), false);
  assert.equal(entry.abgenommen, undefined);
  assert.equal(entry.abnahmeZeit, undefined);
  assert.equal(db.tmAbgenommen(id), true); // Original unberuehrt
});

test('tmDuplicate: die Variante bindet an den aktuellen Stand der Profilierung', (t) => {
  const db = oeffneTestDb(t);
  const profil = db.create({
    meta: { name: 'Ersuchen an die Gemeinde' },
    statuses: [],
    elemente: { 'a/b': { status: 'M' } },
    auspraegungen: {},
  });
  // Die Nachricht ist gegen eine laengst ueberholte Fassung entstanden.
  const alt = { meta: { name: 'Alter Name' }, statuses: [], elemente: {}, auspraegungen: {} };
  const { id } = db.tmCreate(
    input({
      profilId: profil.id,
      profilName: 'Alter Name',
      fassung: 'v1',
      vorgabe: alt,
    }),
    1000,
  );
  assert.equal(db.tmList()[0].profilWeiterentwickelt, true);

  const { id: kopieId, entry } = db.tmDuplicate(id, 2000);
  // Die Variante entsteht jetzt: sie traegt den heutigen Stand als Vorgabe,
  // samt heutigem Namen und einer Fassungsbezeichnung, die das sagt.
  assert.deepEqual(db.tmLoadVorgabe(kopieId), {
    meta: { name: 'Ersuchen an die Gemeinde' },
    statuses: [],
    elemente: { 'a/b': { status: 'M' } },
    auspraegungen: {},
  });
  assert.equal(entry.profilId, profil.id);
  assert.equal(entry.profilName, 'Ersuchen an die Gemeinde');
  assert.match(entry.fassung, /^Arbeitsstand vom \d{2}\.\d{2}\.\d{4}$/);
  // Frisch gebunden heisst: kein Badge "Profil weiterentwickelt".
  assert.equal(entry.profilWeiterentwickelt, undefined);
  // Das Original bleibt, wie es war — die Kopie ruehrt es nicht an.
  assert.deepEqual(db.tmLoadVorgabe(id), alt);
  assert.equal(db.tmList().find((e) => e.id === id).fassung, 'v1');
});

test('tmDuplicate: Variante einer nur zugeordneten Nachricht bekommt eine Vorgabe', (t) => {
  const db = oeffneTestDb(t);
  const doc = {
    meta: { name: 'Notar an Gemeinde' },
    statuses: [],
    elemente: { 'a/b': { status: 'M' } },
    auspraegungen: {},
  };
  const profil = db.create(doc);
  const { id } = db.tmCreate(input({ name: 'upload.xml' }), 1000);
  db.tmZuordnen(id, { profilId: profil.id }, 5000);
  // Die zugeordnete Nachricht selbst hat keine Vorgabe (#141) ...
  assert.equal(db.tmLoadVorgabe(id), null);

  // ... ihre Variante schon: sie soll dem Szenario entsprechen, sonst fehlten
  // ihr Ueberlagerung, Fuehrung und Sperren.
  const { id: kopieId, entry } = db.tmDuplicate(id, 6000);
  assert.deepEqual(db.tmLoadVorgabe(kopieId), doc);
  assert.equal(entry.profilId, profil.id);
  assert.equal(entry.profilName, 'Notar an Gemeinde');
  assert.match(entry.fassung, /^Arbeitsstand vom \d{2}\.\d{2}\.\d{4}$/);
  assert.equal(entry.profilWeiterentwickelt, undefined);
});

test('tmZuordnen: hochgeladene Nachricht nachtraeglich einem Szenario zuordnen', (t) => {
  const db = oeffneTestDb(t);
  const profil = db.create({
    meta: { name: 'Notar an Gemeinde' },
    statuses: [],
    elemente: {},
    auspraegungen: {},
  });
  const { id } = db.tmCreate(input({ name: 'upload.xml' }), 1000);

  const out = db.tmZuordnen(id, { profilId: profil.id }, 5000);
  assert.equal(out.entry.profilId, profil.id);
  assert.equal(out.entry.profilName, 'Notar an Gemeinde');
  // Zuordnen ist Einordnung, keine Bearbeitung: der Zeitstempel bleibt stehen.
  assert.equal(out.entry.aktualisiert, 1000);
  // Keine eingefrorene Vorgabe — die Nachricht ist nicht gegen sie entstanden.
  assert.equal(db.tmLoadVorgabe(id), null);
  assert.equal(out.entry.profilWeiterentwickelt, undefined);

  // Wieder loesen.
  assert.equal(db.tmZuordnen(id, { profilId: null }).entry.profilId, undefined);
  assert.equal(db.tmZuordnen('gibtsnicht', { profilId: profil.id }), null);
  assert.deepEqual(db.tmZuordnen(id, { profilId: 'kenntkeiner' }), {
    fehler: 'unbekanntes-profil',
  });
});

test('tmZuordnen: eine gebundene Nachricht wird nicht umgehaengt', (t) => {
  const db = oeffneTestDb(t);
  const vorgabe = { meta: {}, statuses: [], elemente: {}, auspraegungen: {} };
  const { id } = db.tmCreate(input({ profilId: 'p1', profilName: 'P', fassung: 'v1', vorgabe }));
  const anderes = db.create({
    meta: { name: 'Anderes' },
    statuses: [],
    elemente: {},
    auspraegungen: {},
  });

  // Die eingefrorene Vorgabe gehoert zu ihrer Profilierung; ein stiller Wechsel
  // machte aus der Leitplanke eine falsche Aussage.
  assert.deepEqual(db.tmZuordnen(id, { profilId: anderes.id }), { fehler: 'gebunden' });
  assert.deepEqual(db.tmLoadVorgabe(id), vorgabe);
});
