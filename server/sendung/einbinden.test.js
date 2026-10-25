import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { oeffneTestDb } from '../testhelfer.js';
import { openDb } from '../db.js';
import { createApp } from '../app.js';
import { bauen, planen } from './bau.js';
import { BESCHEID, DABAG_XML } from './testfall.js';
import { verifiziere } from './testhilfe.js';

/** Bescheid als eigene Testnachricht: ein PDF mit Signatur im eigenen SGO. */
const BESCHEID_XML = `<?xml version="1.0" encoding="UTF-8"?>
<tns:nachricht.allgemein.2900001 xmlns:tns="http://www.xjustiz.de"><tns:schriftgutobjekte>
  <tns:dokument><tns:identifikation><tns:id>b1</tns:id></tns:identifikation>
    <tns:xjustiz.fachspezifischeDaten><tns:anzeigename>Bescheid</tns:anzeigename>
      <tns:datei><tns:dateiname>Bescheid_b1.pdf</tns:dateiname><tns:bestandteil><code>001</code></tns:bestandteil></tns:datei>
      <tns:datei><tns:dateiname>Bescheid_b1.pdf.pkcs7</tns:dateiname><tns:bestandteil><code>003</code></tns:bestandteil>
        <tns:dateiname.bezugsdatei>Bescheid_b1.pdf</tns:dateiname.bezugsdatei></tns:datei>
    </tns:xjustiz.fachspezifischeDaten></tns:dokument>
</tns:schriftgutobjekte></tns:nachricht.allgemein.2900001>`;

const tm = (db, name, xml) =>
  db.tmCreate({ name, autor: 'F', xml, nachricht: 'nachricht.x', fachmodul: 'x', groesse: 1 }).id;

test('einbSetzen: Liste mit Ziel, ersetzt Upload, Index zaehlt mit', (t) => {
  const db = oeffneTestDb(t);
  const antrag = tm(db, 'Antrag', DABAG_XML);
  const bescheid = tm(db, 'Bescheid', BESCHEID_XML);
  db.anlAblegen(antrag, { dateiname: BESCHEID, daten: Buffer.from('<x/>') });
  const out = db.einbSetzen(antrag, { dateiname: BESCHEID, zielId: bescheid });
  assert.equal(out.einbindung.zielName, 'Bescheid');
  assert.equal(out.einbindung.vorhanden, true);
  assert.equal(db.anlLaden(antrag, BESCHEID), null); // je Platz eine Quelle
  assert.equal(db.tmEintrag(antrag).anlagen, 1);
  // Upload unter demselben Namen loest die Einbindung wieder
  db.anlAblegen(antrag, { dateiname: BESCHEID, daten: Buffer.from('<x/>') });
  assert.deepEqual(db.einbList(antrag), []);
});

test('einbSetzen: Zyklus (auch mittelbar und auf sich selbst) wird abgewiesen', (t) => {
  const db = oeffneTestDb(t);
  const a = tm(db, 'A', DABAG_XML);
  const b = tm(db, 'B', DABAG_XML);
  const c = tm(db, 'C', DABAG_XML);
  assert.equal(db.einbSetzen(a, { dateiname: 'x.xml', zielId: a }).fehler, 'zyklus');
  db.einbSetzen(a, { dateiname: 'b.xml', zielId: b });
  db.einbSetzen(b, { dateiname: 'c.xml', zielId: c });
  assert.equal(db.einbSetzen(c, { dateiname: 'a.xml', zielId: a }).fehler, 'zyklus');
  assert.deepEqual(db.tmVorfahren(c).sort(), [a, b, c].sort());
  assert.equal(db.einbSetzen(a, { dateiname: 'y', zielId: 'gibtsnicht' }).fehler, 'ziel-unbekannt');
});

test('Loeschen: eigene Einbindungen gehen mit, auf die geloeschte zeigende bleiben (Befund)', (t) => {
  const db = oeffneTestDb(t);
  const antrag = tm(db, 'Antrag', DABAG_XML);
  const bescheid = tm(db, 'Bescheid', BESCHEID_XML);
  db.einbSetzen(antrag, { dateiname: BESCHEID, zielId: bescheid });
  db.tmDelete(bescheid);
  assert.equal(db.einbList(antrag)[0].vorhanden, false);
  const plan = planen(db.sendungQuelle(antrag), (id) => db.sendungQuelle(id));
  assert.ok(plan.befunde.some((b) => b.regel === 'einbindung-fehlt' && b.dateiname === BESCHEID));
  assert.ok(plan.befunde.some((b) => b.regel === 'fehlt' && b.dateiname === BESCHEID));
});

test('Variante kopiert die Einbindungen', (t) => {
  const db = oeffneTestDb(t);
  const antrag = tm(db, 'Antrag', DABAG_XML);
  const bescheid = tm(db, 'Bescheid', BESCHEID_XML);
  db.einbSetzen(antrag, { dateiname: BESCHEID, zielId: bescheid });
  const kopie = db.tmDuplicate(antrag);
  assert.equal(db.einbList(kopie.id)[0].zielId, bescheid);
});

test('bauen: eingebundene Nachricht samt ihrer Dateien flach im ZIP', async (t) => {
  const db = oeffneTestDb(t);
  const antrag = tm(db, 'Antrag', DABAG_XML);
  const bescheid = tm(db, 'Bescheid', BESCHEID_XML);
  db.einbSetzen(antrag, { dateiname: BESCHEID, zielId: bescheid });
  const laden = (id) => db.sendungQuelle(id);
  const { zip, plan } = await bauen(laden(antrag), laden);
  const z = await JSZip.loadAsync(zip);
  assert.equal(await z.file(BESCHEID).async('string'), BESCHEID_XML);
  // Die Signatur des Bescheids zeigt im DABAG-Fall auf einen falschen Namen:
  // ohne Bezugsdatei keine Testsignatur, der Befund bleibt.
  assert.equal(z.file(BESCHEID + '.pkcs7'), null);
  assert.ok(plan.befunde.some((b) => b.regel === 'bezug-fehlt'));
  assert.ok(z.file('Bescheid_b1.pdf'), 'Datei der eingebundenen Nachricht');
  assert.ok(z.file('Bescheid_b1.pdf.pkcs7'));
  const herkunft = plan.plaetze.find((p) => p.dateiname === 'Bescheid_b1.pdf').herkunft;
  assert.equal(herkunft, 'Bescheid');
  assert.ok(!plan.befunde.some((b) => b.regel === 'fehlt' && b.dateiname === BESCHEID));
});

test('Kollision ueber Ebenen hinweg wird gemeldet', (t) => {
  const db = oeffneTestDb(t);
  const antrag = tm(db, 'Antrag', DABAG_XML);
  // die eingebundene Nachricht nennt einen Namen, den der Antrag schon hat
  const kollision = tm(db, 'K', DABAG_XML);
  db.einbSetzen(antrag, { dateiname: BESCHEID, zielId: kollision });
  const plan = planen(db.sendungQuelle(antrag), (id) => db.sendungQuelle(id));
  assert.ok(plan.befunde.some((b) => b.regel === 'doppelt'));
});

test('HTTP: einbinden, Liste, Vorfahren, Zyklus 409, loesen', async (t) => {
  const db = openDb(':memory:');
  const srv = createApp(db, { nutzung: false }).listen(0);
  await new Promise((res) => srv.once('listening', res));
  t.after(() => {
    srv.close();
    db.close();
  });
  const base = `http://127.0.0.1:${srv.address().port}/api/testmessages`;
  const antrag = tm(db, 'Antrag', DABAG_XML);
  const bescheid = tm(db, 'Bescheid', BESCHEID_XML);
  const put = (id, name, zielId) =>
    fetch(`${base}/${id}/einbindungen/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ zielId }),
    });
  assert.equal((await put(antrag, BESCHEID, bescheid)).status, 201);
  assert.equal((await put(bescheid, 'a.xml', antrag)).status, 409);
  assert.equal((await put(antrag, 'x', 'gibtsnicht')).status, 400);
  const liste = await (await fetch(`${base}/${antrag}/einbindungen`)).json();
  assert.equal(liste[0].zielId, bescheid);
  assert.deepEqual(
    (await (await fetch(`${base}/${bescheid}/vorfahren`)).json()).sort(),
    [antrag, bescheid].sort(),
  );
  const plan = await (await fetch(`${base}/${antrag}/sendung/pruefung`)).json();
  assert.ok(plan.dateien.some((d) => d.quelle === 'testnachricht' && d.zielId === bescheid));
  const del = await fetch(`${base}/${antrag}/einbindungen/${encodeURIComponent(BESCHEID)}`, {
    method: 'DELETE',
  });
  assert.equal(del.status, 204);
});

test('Signatur ueber eine eingebundene XML verifiziert gegen deren Bytes', async (t) => {
  const db = oeffneTestDb(t);
  const name = 'xjustiz_nachricht_b1.xml';
  const haupt = `<n xmlns="http://www.xjustiz.de"><schriftgutobjekte><dokument>
    <identifikation><id>d1</id></identifikation><xjustiz.fachspezifischeDaten>
    <datei><dateiname>${name}</dateiname><bestandteil><code>001</code></bestandteil></datei>
    <datei><dateiname>${name}.pkcs7</dateiname><bestandteil><code>003</code></bestandteil>
      <dateiname.bezugsdatei>${name}</dateiname.bezugsdatei></datei>
  </xjustiz.fachspezifischeDaten></dokument></schriftgutobjekte></n>`;
  const antrag = tm(db, 'Antrag', haupt);
  const bescheid = tm(db, 'Bescheid', BESCHEID_XML);
  db.einbSetzen(antrag, { dateiname: name, zielId: bescheid });
  const laden = (id) => db.sendungQuelle(id);
  const { zip, plan } = await bauen(laden(antrag), laden);
  const z = await JSZip.loadAsync(zip);
  verifiziere(
    await z.file(name + '.pkcs7').async('nodebuffer'),
    await z.file(name).async('nodebuffer'),
  );
  assert.deepEqual(
    plan.befunde.map((b) => b.regel),
    [],
  );
});
