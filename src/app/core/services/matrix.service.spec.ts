import { TestBed } from '@angular/core/testing';
import { MatrixService, MatrixQuelle } from './matrix.service';

/**
 * Merkmals-Matrix (#136). Der Kern ist die Zusammenfassung: "einmal ein
 * Beteiligter, einmal zwei" muss **eine** Zeile ergeben, nicht Dutzende —
 * sonst ist die Matrix bei genau dem Fall unlesbar, fuer den sie gebaut wurde.
 */
describe('MatrixService', () => {
  let svc: MatrixService;

  beforeEach(() => {
    svc = TestBed.inject(MatrixService);
  });

  const nachricht = (beteiligte: { name: string; rolle?: string }[], zeit = 'Z1'): string =>
    `<nachricht.genuva.ersuchen xmlns="http://www.xjustiz.de">
       <nachrichtenkopf>
         <erstellungszeitpunkt>${zeit}</erstellungszeitpunkt>
         <absender>Notar</absender>
       </nachrichtenkopf>
       <grunddaten>
         ${beteiligte
           .map(
             (b) => `<beteiligung>
                       <name>${b.name}</name>
                       <rolle>${b.rolle ?? 'Antragsteller'}</rolle>
                     </beteiligung>`,
           )
           .join('')}
       </grunddaten>
     </nachricht.genuva.ersuchen>`;

  const quelle = (id: string, xml: string): MatrixQuelle => ({ id, name: id, xml });

  it('meldet einen zusaetzlichen Beteiligten als EINE Anzahl-Zeile', () => {
    const r = svc.vergleiche([
      quelle('einer', nachricht([{ name: 'A' }])),
      quelle('zwei', nachricht([{ name: 'A' }, { name: 'B' }])),
    ]);

    // Sichtbar ist genau eine Zeile: die Anzahl der Beteiligten.
    const sichtbareZeilen = r.zeilen.filter((z) => !z.unterhalb && !z.technisch);
    expect(sichtbareZeilen.length).toBe(1);
    expect(sichtbareZeilen[0]?.art).toBe('anzahl');
    expect(sichtbareZeilen[0]?.label).toBe('grunddaten / beteiligung');
    expect(sichtbareZeilen[0]?.werte).toEqual(['1', '2']);

    // Die Angaben des zweiten Beteiligten liegen eingeklappt darunter, statt
    // als eigenstaendige Unterschiede oben zu stehen.
    const eingeklappt = r.zeilen.filter((z) => z.unterhalb);
    expect(eingeklappt.length).toBeGreaterThan(0);
    expect(new Set(eingeklappt.map((z) => z.unterhalb))).toEqual(
      new Set(['/nachricht.genuva.ersuchen/grunddaten[1]/beteiligung']),
    );
  });

  it('zeigt Wertunterschiede in Vorkommen, die alle Nachrichten haben', () => {
    const r = svc.vergleiche([
      quelle('a', nachricht([{ name: 'Meier' }])),
      quelle('b', nachricht([{ name: 'Schulze' }])),
    ]);

    const namen = r.zeilen.find((z) => z.pfad.endsWith('/name[1]'));
    expect(namen?.werte).toEqual(['Meier', 'Schulze']);
    expect(namen?.unterhalb).toBeUndefined();
    // Was gleich ist, steht nicht in der Matrix.
    expect(r.zeilen.some((z) => z.pfad.includes('rolle'))).toBeFalse();
    expect(r.zeilen.some((z) => z.pfad.includes('absender'))).toBeFalse();
  });

  it('kennzeichnet technische Kopfangaben, statt sie oben einzureihen', () => {
    const r = svc.vergleiche([
      quelle('a', nachricht([{ name: 'A' }], 'zeitpunkt-1')),
      quelle('b', nachricht([{ name: 'A' }], 'zeitpunkt-2')),
    ]);

    const zeit = r.zeilen.find((z) => z.pfad.includes('erstellungszeitpunkt'));
    expect(zeit?.technisch).toBeTrue();
    expect(zeit?.werte).toEqual(['zeitpunkt-1', 'zeitpunkt-2']);
    // Ausser dem Zeitstempel unterscheidet die beiden nichts.
    expect(r.zeilen.filter((z) => !z.technisch)).toEqual([]);
  });

  it('ergibt bei identischen Nachrichten eine leere Matrix', () => {
    const xml = nachricht([{ name: 'A' }]);
    const r = svc.vergleiche([quelle('a', xml), quelle('b', xml)]);
    expect(r.zeilen).toEqual([]);
    expect(r.spalten.length).toBe(2);
  });

  it('zaehlt ein fehlendes Element als null, nicht als Loch', () => {
    const ohne = `<nachricht.genuva.ersuchen xmlns="http://www.xjustiz.de">
                    <grunddaten></grunddaten>
                  </nachricht.genuva.ersuchen>`;
    const r = svc.vergleiche([quelle('ohne', ohne), quelle('mit', nachricht([{ name: 'A' }]))]);
    const anzahl = r.zeilen.find((z) => z.art === 'anzahl' && z.pfad.endsWith('beteiligung'));
    expect(anzahl?.werte).toEqual(['0', '1']);
  });

  it('laesst nicht parsbare Quellen weg, statt sie als Leerspalte zu fuehren', () => {
    const r = svc.vergleiche([
      quelle('gut', nachricht([{ name: 'A' }])),
      quelle('kaputt', '<nicht<wohlgeformt'),
      quelle('gut2', nachricht([{ name: 'B' }])),
    ]);
    expect(r.spalten.map((s) => s.id)).toEqual(['gut', 'gut2']);
  });

  it('braucht mindestens zwei verwertbare Nachrichten', () => {
    const r = svc.vergleiche([quelle('a', nachricht([{ name: 'A' }]))]);
    expect(r.zeilen).toEqual([]);
  });

  it('vergleicht auch Attribute', () => {
    const mit = (az: string): string =>
      `<nachricht.x xmlns="http://www.xjustiz.de"><akte aktenzeichen="${az}"><nr>1</nr></akte></nachricht.x>`;
    const r = svc.vergleiche([quelle('a', mit('AZ-1')), quelle('b', mit('AZ-2'))]);
    const zeile = r.zeilen.find((z) => z.pfad.includes('@aktenzeichen'));
    expect(zeile?.werte).toEqual(['AZ-1', 'AZ-2']);
  });
});
