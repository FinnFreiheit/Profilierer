import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import forge from 'node-forge';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { HAUPTNAME, dateienPlanen, plaetzeLesen, pruefen } from './pruefung.js';

/**
 * Bau der Testsendung (ADR 0024): aus der XML einer Testnachricht und ihren
 * hochgeladenen Anlagen entsteht das ZIP, das beim Empfaenger ankaeme —
 * `xjustiz_nachricht.xml` plus je Platz eine Datei. Leere Plaetze fuellt der
 * Bau, wo er kann: `.pdf` mit einem Platzhalter, Signaturdateien mit einer
 * abgesetzten CMS-Signatur ueber die tatsaechlich beigelegte Bezugsdatei.
 * Was sich nicht erzeugen laesst, bleibt leer und steht in den Befunden.
 */

/**
 * Plan der Sendung ohne Bytes zu erzeugen: Plaetze, Quelle je Datei, Befunde.
 * Reicht fuer die Pruefung; `bauen` fuellt danach die erzeugten Dateien.
 *
 * @param {string} xml
 * @param {Array<{dateiname: string, daten: Buffer}>} anlagen hochgeladene Dateien
 */
export function planen(xml, anlagen) {
  const plaetze = plaetzeLesen(new DOMParser().parseFromString(xml, 'application/xml'));
  const uploads = new Map(anlagen.map((a) => [a.dateiname, a.daten]));
  const dateien = dateienPlanen(plaetze, new Set(uploads.keys())).map((d) => ({
    ...d,
    kopf: uploads.get(d.dateiname)?.subarray(0, 16),
  }));
  // Uploads ohne Platz gehen in die Pruefung (Hinweis), nicht ins ZIP.
  const ohnePlatz = anlagen
    .filter((a) => !plaetze.some((p) => p.dateiname === a.dateiname))
    .map((a) => ({ dateiname: a.dateiname, quelle: 'upload', kopf: a.daten.subarray(0, 16) }));
  const befunde = pruefen({ plaetze, dateien: [...dateien, ...ohnePlatz] });
  return { plaetze, dateien, befunde };
}

/**
 * Baut das ZIP.
 *
 * @param {object} p
 * @param {string} p.xml       Haupt-XML
 * @param {string} p.name      Anzeigename der Testnachricht (Aufdruck der Platzhalter)
 * @param {Array} p.anlagen    hochgeladene Dateien `{ dateiname, daten }`
 * @returns {Promise<{ zip: Buffer, plan: ReturnType<typeof planen> }>}
 */
export async function bauen({ xml, name, anlagen }) {
  const plan = planen(xml, anlagen);
  const uploads = new Map(anlagen.map((a) => [a.dateiname, a.daten]));
  const bytes = new Map();
  let signierer = null;
  for (const d of plan.dateien) {
    if (d.quelle === 'upload') bytes.set(d.dateiname, uploads.get(d.dateiname));
    else if (d.quelle === 'platzhalter')
      bytes.set(d.dateiname, await platzhalterPdf(d.platz, name));
    else {
      signierer ??= neuerSignierer();
      bytes.set(d.dateiname, signierer(bytes.get(d.platz.bezugsdateien[0])));
    }
  }
  const zip = new JSZip();
  zip.file(HAUPTNAME, xml);
  for (const d of plan.dateien) zip.file(d.dateiname, bytes.get(d.dateiname));
  return {
    zip: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
    plan,
  };
}

// ── Platzhalter-PDF ───────────────────────────────────────────────────

/** WinAnsi-taugliche Zeichen (Standardschrift); der Rest wird zu „?". */
const latin = (s) =>
  String(s ?? '').replace(
    /[^ -~\u00A0-\u00FF\u201E\u201C\u201D\u201A\u2018\u2019\u2013\u2014\u2026\u20AC]/g,
    '?',
  );

const BESTANDTEIL_TEXT = { '001': 'Original', '002': 'Repräsentat', '003': 'Signaturdatei' };

/** Eine Seite A4 mit dem, was die XML ueber die Datei sagt. */
export async function platzhalterPdf(platz, nachrichtName) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(latin(platz.dokument?.anzeigename ?? platz.dateiname));
  pdf.setProducer('XJustiz Pfadfinder');
  const page = pdf.addPage([595.28, 841.89]);
  const fett = await pdf.embedFont(StandardFonts.HelveticaBold);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const grau = rgb(0.4, 0.4, 0.4);
  let y = 770;
  const zeile = (txt, font = normal, size = 11, color = rgb(0, 0, 0)) => {
    page.drawText(latin(txt), { x: 60, y, size, font, color, maxWidth: 475 });
    y -= size * 1.8;
  };
  zeile('TESTDOKUMENT – nicht für den Rechtsverkehr', fett, 10, rgb(0.7, 0.1, 0.1));
  y -= 10;
  const dok = platz.dokument ?? {};
  zeile(dok.anzeigename || (dok.nummer ? `Dokument ${dok.nummer}` : 'Dokument'), fett, 20);
  y -= 6;
  const angaben = [
    ['Dateiname', platz.dateiname],
    [
      'Bestandteil',
      platz.bestandteil && `${platz.bestandteil} ${BESTANDTEIL_TEXT[platz.bestandteil] ?? ''}`,
    ],
    ['Dokumententyp (Code)', dok.dokumententyp],
    ['Nummer im Container', dok.nummer],
    ['Dokument-ID', dok.id],
    ['Testnachricht', nachrichtName],
  ];
  for (const [k, v] of angaben) if (v) zeile(`${k}: ${v}`);
  y -= 10;
  zeile(
    'Platzhalter, erzeugt vom XJustiz Pfadfinder beim Export der Testsendung.',
    normal,
    9,
    grau,
  );
  return Buffer.from(await pdf.save());
}

// ── Signatur ──────────────────────────────────────────────────────────

/**
 * Ein Signierer mit frischem, selbst signiertem Schluessel (ein Schluessel je
 * Export). Das RSA-Paar erzeugt node:crypto — forge in reinem JS braucht auf
 * dem Pi dafuer Sekunden. Ergebnis je Aufruf: abgesetzte CMS-SignedData (DER)
 * mit contentType, messageDigest und signingTime. Mathematisch gueltig,
 * Zertifikat ohne Vertrauenskette.
 */
export function neuerSignierer() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' }));
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(publicKey.export({ type: 'spki', format: 'pem' }));
  cert.serialNumber = '01' + randomBytes(15).toString('hex');
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const name = [
    { name: 'commonName', value: 'TEST - nicht fuer den Rechtsverkehr' },
    { name: 'organizationName', value: 'XJustiz Pfadfinder (Testsignatur)' },
  ];
  cert.setSubject(name);
  cert.setIssuer(name);
  cert.sign(key, forge.md.sha256.create());

  return (inhalt) => {
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(Buffer.from(inhalt).toString('binary'));
    p7.addCertificate(cert);
    p7.addSigner({
      key,
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: new Date() },
      ],
    });
    p7.sign({ detached: true });
    return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');
  };
}
