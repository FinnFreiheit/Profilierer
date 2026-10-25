import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import forge from 'node-forge';

/**
 * Prueft eine abgesetzte CMS-Signatur gegen den Inhalt: messageDigest gleich
 * SHA-256 des Inhalts, RSA-Signatur ueber die signierten Attribute (als SET).
 */
export function verifiziere(der, inhalt) {
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
