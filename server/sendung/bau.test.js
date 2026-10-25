import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import forge from 'node-forge';
import { bauen, neuerSignierer, planen } from './bau.js';
import { BESCHEID, DABAG_XML, KAUFVERTRAG } from './testfall.js';
import { openDb } from '../db.js';
import { createApp } from '../app.js';

/**
 * Prueft eine abgesetzte CMS-Signatur gegen den Inhalt: messageDigest gleich
 * SHA-256 des Inhalts, RSA-Signatur ueber die signierten Attribute (als SET).
 */
function verifiziere(der, inhalt) {
  const { asn1 } = forge;
  const msg = forge.pkcs7.messageFromAsn1(asn1.fromDer(der.toString('binary')));
  const cert = msg.certificates[0];
  const si = msg.rawCapture.signerInfos[0];
  const attrs = si.value.find((v) => v.tagClass === asn1.Class.CONTEXT_SPECIFIC && v.type === 0);
  const digestAttr = attrs.value.find(
    (a) => asn1.derToOid(a.value[0].value) === forge.pki.oids.messageDigest,
  );
  const digest = Buffer.from(digestAttr.value[1].value[0].value, 'binary').toString('hex');
  assert.equal(digest, createHash('sha256').update(inhalt).digest('hex'), 'messageDigest');
  const set = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, attrs.value);
  const md = forge.md.sha256.create();
  md.update(asn1.toDer(set).getBytes());
  const sig = si.value[si.value.length - 1].value;
  assert.ok(cert.publicKey.verify(md.digest().bytes(), sig), 'RSA-Signatur');
  return cert;
}

test('Signierer: abgesetzte CMS-Signatur verifiziert gegen den Inhalt, nicht gegen anderen', () => {
  const sign = neuerSignierer();
  const inhalt = Buffer.from('%PDF-1.7 Inhalt');
  const cert = verifiziere(sign(inhalt), inhalt);
  assert.match(cert.subject.getField('CN').value, /^TEST/);
  assert.throws(() => verifiziere(sign(inhalt), Buffer.from('anders')), /messageDigest/);
});

test('planen: Quelle je Datei; Signatur nur mit vorhandener Bezugsdatei', () => {
  const plan = planen(DABAG_XML, [{ dateiname: 'alt.pdf', daten: Buffer.from('%PDF') }]);
  const quelle = Object.fromEntries(plan.dateien.map((d) => [d.dateiname, d.quelle]));
  assert.equal(quelle[KAUFVERTRAG], 'platzhalter');
  assert.equal(quelle[KAUFVERTRAG + '.pkcs7'], 'signatur');
  // Bescheid (XML) ohne eingebundene Nachricht: leer, seine Signatur damit auch
  assert.equal(quelle[BESCHEID], undefined);
  assert.equal(quelle[BESCHEID + '.pkcs7'], undefined);
  const regeln = plan.befunde.map((b) => `${b.regel}:${b.dateiname}`);
  assert.ok(regeln.includes(`fehlt:${BESCHEID}`));
  assert.ok(regeln.includes('ohne-platz:alt.pdf'));
});

test('bauen: ZIP mit Hauptnachricht, Platzhalter-PDF, Upload und passender Signatur', async () => {
  const upload = Buffer.from('%PDF-1.7 echter Kaufvertrag');
  const { zip, plan } = await bauen({
    xml: DABAG_XML,
    name: 'Antrag_Notar_Grundbuch.xml',
    anlagen: [{ dateiname: KAUFVERTRAG, daten: upload }],
  });
  const z = await JSZip.loadAsync(zip);
  const namen = Object.keys(z.files).sort();
  assert.deepEqual(namen, [
    '1_Urkunde_dfe4d24b.pdf',
    '1_Urkunde_dfe4d24b.pdf.pkcs7',
    KAUFVERTRAG,
    KAUFVERTRAG + '.pkcs7',
    'xjustiz_nachricht.xml',
  ]);
  assert.equal(await z.file('xjustiz_nachricht.xml').async('string'), DABAG_XML);
  const kv = await z.file(KAUFVERTRAG).async('nodebuffer');
  assert.deepEqual(kv, upload);
  verifiziere(await z.file(KAUFVERTRAG + '.pkcs7').async('nodebuffer'), kv);
  const urkunde = await z.file('1_Urkunde_dfe4d24b.pdf').async('nodebuffer');
  assert.equal(urkunde.subarray(0, 5).toString(), '%PDF-');
  verifiziere(await z.file('1_Urkunde_dfe4d24b.pdf.pkcs7').async('nodebuffer'), urkunde);
  assert.ok(plan.befunde.length > 0);
});

test('HTTP: /sendung liefert ZIP mit Befund-Headern, /sendung/pruefung den Plan', async (t) => {
  const db = openDb(':memory:');
  const srv = createApp(db, { nutzung: false }).listen(0);
  await new Promise((res) => srv.once('listening', res));
  t.after(() => {
    srv.close();
    db.close();
  });
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const { id } = db.tmCreate({
    name: 'Antrag_Notar_Grundbuch.xml',
    autor: 'F',
    xml: DABAG_XML,
    nachricht: 'nachricht.dabag.antrag.2900001',
    fachmodul: 'dabag',
    groesse: DABAG_XML.length,
  });
  let r = await fetch(`${base}/testmessages/${id}/sendung`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/zip');
  assert.match(r.headers.get('content-disposition'), /Antrag_Notar_Grundbuch_sendung\.zip/);
  assert.ok(Number(r.headers.get('x-sendung-fehler')) > 0);
  const z = await JSZip.loadAsync(Buffer.from(await r.arrayBuffer()));
  assert.ok(z.file('xjustiz_nachricht.xml'));
  r = await fetch(`${base}/testmessages/${id}/sendung/pruefung`);
  const plan = await r.json();
  assert.equal(plan.plaetze.length, 7);
  assert.ok(plan.dateien.some((d) => d.quelle === 'signatur'));
  assert.ok(plan.befunde.some((b) => b.regel === 'bezug-fehlt'));
  assert.equal((await fetch(`${base}/testmessages/gibtsnicht/sendung`)).status, 404);
});
