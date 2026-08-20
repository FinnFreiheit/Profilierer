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
    expect(sichtbareZeilen[0]?.label).toBe('Beteiligung');
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

  it('bezeichnet Merkmale so, wie ein Mensch sie liest', () => {
    const r = svc.vergleiche([
      quelle('einer', nachricht([{ name: 'A' }])),
      quelle('zwei', nachricht([{ name: 'A' }, { name: 'B', rolle: 'Notar' }])),
    ]);

    // Die Vorkommen-Nummer steht hinter dem Namen, nicht als Klammerindex
    // mittendrin — dass es der ZWEITE Beteiligte ist, ist die halbe Aussage.
    const zweite = r.zeilen.find((z) => z.pfad.includes('beteiligung[2]/rolle'));
    expect(zweite?.label).toBe('Beteiligung 2 › Rolle');

    // Wo es nur ein Vorkommen gibt, faellt die Nummer weg.
    const einzeln = svc.vergleiche([
      quelle('a', nachricht([{ name: 'Meier' }])),
      quelle('b', nachricht([{ name: 'Schulze' }])),
    ]);
    expect(einzeln.zeilen.find((z) => z.pfad.endsWith('/name[1]'))?.label).toBe(
      'Beteiligung › Name',
    );
  });

  it('kuerzt lange Ketten und blendet Choice-Container aus', () => {
    const tief = (typ: string, wert: string): string =>
      `<nachricht.x xmlns="http://www.xjustiz.de"><grunddaten><verfahrensdaten>
         <beteiligung><beteiligter><auswahl_beteiligter><natuerlichePerson>
           <anschrift><anschriftstyp>${typ}</anschriftstyp></anschrift>
           <geschlecht>${wert}</geschlecht>
         </natuerlichePerson></auswahl_beteiligter></beteiligter></beteiligung>
         <beteiligung><beteiligter><auswahl_beteiligter><natuerlichePerson>
           <geschlecht>x</geschlecht>
         </natuerlichePerson></auswahl_beteiligter></beteiligter></beteiligung>
       </verfahrensdaten></grunddaten></nachricht.x>`;
    const r = svc.vergleiche([quelle('a', tief('H', 'm')), quelle('b', tief('P', 'w'))]);

    const zeile = r.zeilen.find((z) => z.pfad.includes('anschriftstyp'));
    // `auswahl_beteiligter` ist ein technischer Choice-Container und faellt weg;
    // die Vorkommen-Nummer bleibt, dazwischen weist "…" das Gekuerzte aus.
    expect(zeile?.label).toBe('Beteiligung 1 › … › Anschrift › Anschriftstyp');
    expect(zeile?.label).not.toContain('Auswahl');
  });

  it('weist Attribute als solche aus', () => {
    const mit = (az: string): string =>
      `<nachricht.x xmlns="http://www.xjustiz.de"><fachdaten><akte aktenzeichen="${az}"><nr>1</nr></akte></fachdaten></nachricht.x>`;
    const r = svc.vergleiche([quelle('a', mit('AZ-1')), quelle('b', mit('AZ-2'))]);
    expect(r.zeilen.find((z) => z.pfad.includes('@aktenzeichen'))?.label).toBe(
      'Akte · Attribut aktenzeichen',
    );
  });

  it('gliedert die Unterschiede nach fachlichem Bereich', () => {
    const mit = (absender: string, name: string): string =>
      `<nachricht.genuva.ersuchen xmlns="http://www.xjustiz.de">
         <nachrichtenkopf><absender>${absender}</absender></nachrichtenkopf>
         <grunddaten><beteiligung><name>${name}</name></beteiligung></grunddaten>
         <fachdaten><datenDerUrkunde><nr>${name}</nr></datenDerUrkunde></fachdaten>
       </nachricht.genuva.ersuchen>`;
    const r = svc.vergleiche([
      quelle('a', mit('Notar', 'Meier')),
      quelle('b', mit('Gericht', 'Schulze')),
    ]);

    // Die Verteilung ist die eigentliche Uebersicht — sie steht im Kopf der
    // Matrix, bevor es um einzelne Werte geht.
    expect(r.bereiche).toEqual([
      { name: 'Nachrichtenkopf', n: 1 },
      { name: 'Grunddaten', n: 1 },
      { name: 'Fachdaten', n: 1 },
    ]);
    // Die Zeilen stehen in derselben Reihenfolge wie die Bereiche.
    expect(r.zeilen.map((z) => z.bereich)).toEqual(['Nachrichtenkopf', 'Grunddaten', 'Fachdaten']);
  });

  it('trennt lowerCamelCase-Bereiche in Worte und faengt die Wurzel ab', () => {
    const mit = (v: string): string =>
      `<nachricht.x xmlns="http://www.xjustiz.de" version="${v}"><datenDerUrkunde><nr>${v}</nr></datenDerUrkunde></nachricht.x>`;
    const r = svc.vergleiche([quelle('a', mit('1')), quelle('b', mit('2'))]);
    const bereiche = r.bereiche.map((b) => b.name);
    // Attribute der Nachricht selbst haengen an keinem Bereich — eigene Gruppe,
    // statt sie dem Nachrichtenkopf zuzuschlagen, wo sie nicht stehen.
    expect(bereiche).toContain('Nachricht');
    expect(bereiche).toContain('Daten Der Urkunde');
  });

  it('zaehlt technische und eingeklappte Zeilen nicht in die Bereiche', () => {
    const r = svc.vergleiche([
      quelle('a', nachricht([{ name: 'A' }], 'zeit-1')),
      quelle('b', nachricht([{ name: 'A' }], 'zeit-2')),
    ]);
    // Nur der Zeitstempel unterscheidet sie, und der ist technisch: kein
    // Bereich soll einen Zaehler auswerfen, der zu nichts fuehrt.
    expect(r.zeilen.length).toBeGreaterThan(0);
    expect(r.bereiche).toEqual([]);
  });

  it('vergleicht auch Attribute', () => {
    const mit = (az: string): string =>
      `<nachricht.x xmlns="http://www.xjustiz.de"><akte aktenzeichen="${az}"><nr>1</nr></akte></nachricht.x>`;
    const r = svc.vergleiche([quelle('a', mit('AZ-1')), quelle('b', mit('AZ-2'))]);
    const zeile = r.zeilen.find((z) => z.pfad.includes('@aktenzeichen'));
    expect(zeile?.werte).toEqual(['AZ-1', 'AZ-2']);
  });
});
