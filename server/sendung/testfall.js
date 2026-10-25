/**
 * Nachgebauter DABAG-Antrag fuer die Tests der Testsendung: dieselbe
 * Struktur wie die Testnachricht „Antrag_Notar_Grundbuch" (PDF + Signatur,
 * XML-Repraesentat, eingebundene Nachricht als Original) samt ihren zwei
 * Fehlern — die Bezugsdatei des Bescheids zeigt ins Leere, und ein Dateiname
 * traegt wörtlich „UUID".
 */
const datei = (name, bestandteil, bezug) => `
        <tns:datei>
          <tns:dateiname>${name}</tns:dateiname>
          <tns:bestandteil listVersionID="2.5"><code>${bestandteil}</code></tns:bestandteil>${
            bezug
              ? `\n          <tns:dateiname.bezugsdatei>${bezug}</tns:dateiname.bezugsdatei>`
              : ''
          }
        </tns:datei>`;

const dokument = (id, nr, anzeigename, typ, dateien) => `
    <tns:dokument>
      <tns:identifikation>
        <tns:id>${id}</tns:id>
        <tns:nummerImUebergeordnetenContainer>${nr}</tns:nummerImUebergeordnetenContainer>
      </tns:identifikation>
      <tns:xjustiz.fachspezifischeDaten>
        <tns:dokumententyp listVersionID="3.8"><code>${typ}</code></tns:dokumententyp>
        ${anzeigename ? `<tns:anzeigename>${anzeigename}</tns:anzeigename>` : ''}${dateien}
      </tns:xjustiz.fachspezifischeDaten>
    </tns:dokument>`;

export const KAUFVERTRAG = 'Kaufvertrag_0a7c4217-ef6f-4303-82d7-60ca84fdf3f5.pdf';
export const BESCHEID = 'xjustiz_nachricht_1504_2024_a9d95f90-ecd3-46a8-9da0-6a61712c6f87.xml';

export const DABAG_XML = `<?xml version="1.0" encoding="UTF-8"?>
<tns:nachricht.dabag.antrag.2900001 xmlns:tns="http://www.xjustiz.de">
  <tns:schriftgutobjekte>${dokument(
    '0a7c4217-ef6f-4303-82d7-60ca84fdf3f5',
    '1',
    '',
    '102',
    datei(KAUFVERTRAG, '001') + datei(KAUFVERTRAG + '.pkcs7', '003', KAUFVERTRAG),
  )}${dokument(
    'dfe4d24b-025c-4283-92b0-5e3563429679',
    '3',
    'Einwilligung oder Genehmigung',
    '132',
    datei('1_Urkunde_dfe4d24b.pdf', '001') +
      datei('1_Urkunde_dfe4d24b.pdf.pkcs7', '003', '1_Urkunde_dfe4d24b.pdf') +
      datei('xjustiz_UUID.xml', '002'),
  )}${dokument(
    'a9d95f90-ecd3-46a8-9da0-6a61712c6f87',
    '4',
    'Bescheid',
    '105',
    datei(BESCHEID, '001') +
      datei(
        BESCHEID + '.pkcs7',
        '003',
        'xjustiz_1504_2024_a9d95f90-ecd3-46a8-9da0-6a61712c6f87.xml',
      ),
  )}
  </tns:schriftgutobjekte>
</tns:nachricht.dabag.antrag.2900001>`;
