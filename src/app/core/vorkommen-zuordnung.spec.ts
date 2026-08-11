import { Auspraegung, ProfileDoc } from '../models/profile.model';
import { InstanzModell } from './vorgabe-sicht';
import { ordneVorkommenZu } from './vorkommen-zuordnung';

/**
 * Die Rueckfuehrung der Vorkommen einer aus XML gewonnenen Nachricht auf die
 * der Profilierung — pur getestet, ohne TestBed.
 */
describe('ordneVorkommenZu', () => {
  const M = 'nachricht.test.0001';

  const vorgabe = (teile: Partial<ProfileDoc> = {}): ProfileDoc => ({
    meta: {},
    statuses: [],
    elemente: {},
    auspraegungen: {},
    erweiterungen: {},
    ...teile,
  });

  const modell = (teile: Partial<InstanzModell> = {}): InstanzModell => ({
    elemente: {},
    auspraegungen: {},
    ...teile,
  });

  it('fuehrt gleichnamige Vorkommen ueber vonId auf die Vorgabe zurueck', () => {
    const doc = vorgabe({
      auspraegungen: {
        [`${M}/bet`]: [
          { id: 'n1', name: 'Antragsteller' },
          { id: 'n2', name: 'Antragsgegner' },
        ],
      },
    });
    const inst = modell({
      auspraegungen: {
        [`${M}/bet`]: [
          { id: 'v1', name: 'Vorkommen 1' },
          { id: 'v2', name: 'Vorkommen 2' },
        ],
      },
    });
    const bez = { [`${M}/bet`]: ['Antragsteller', 'Antragsgegner'] };

    const { modell: neu, zuordenbar } = ordneVorkommenZu(inst, doc, bez);

    expect(neu.auspraegungen[`${M}/bet`]!.map((a) => a.vonId)).toEqual(['n1', 'n2']);
    expect(zuordenbar(`${M}/bet`)).toBeTrue();
  });

  it('ohne Bezeichnungen bleibt die Liste unzuordenbar — generische Namen treffen nichts', () => {
    // Der garantierte Falsch-Positiv-Fall: ein XJustiz-XML traegt keine
    // Vorkommen-Namen, jede id ist frisch. Ohne diese Auskunft meldete der
    // Abgleich jedes zwingende benannte Vorkommen als fehlend.
    const doc = vorgabe({ auspraegungen: { [`${M}/bet`]: [{ id: 'n1', name: 'Antragsteller' }] } });
    const inst = modell({ auspraegungen: { [`${M}/bet`]: [{ id: 'v1', name: 'Vorkommen 1' }] } });

    const { modell: neu, zuordenbar } = ordneVorkommenZu(inst, doc, null);

    expect(neu.auspraegungen[`${M}/bet`]![0]!.vonId).toBeUndefined();
    expect(zuordenbar(`${M}/bet`)).toBeFalse();
  });

  it('loest von aussen nach innen auf — ein innerer Pfad traegt die ids der aeusseren', () => {
    const doc = vorgabe({
      auspraegungen: {
        [`${M}/bet`]: [{ id: 'n1', name: 'Antragsteller' }],
        [`${M}/bet@n1/adr`]: [{ id: 'b1', name: 'Kanzlei' }],
      },
    });
    const inst = modell({
      auspraegungen: {
        [`${M}/bet`]: [{ id: 'v1', name: 'Vorkommen 1' }],
        [`${M}/bet@v1/adr`]: [{ id: 'v2', name: 'Vorkommen 1' }],
      },
    });
    const bez = { [`${M}/bet`]: ['Antragsteller'], [`${M}/bet@#0/adr`]: ['Kanzlei'] };

    const { modell: neu, zuordenbar } = ordneVorkommenZu(inst, doc, bez);

    // Die innere Liste ist der Vorgabe nur bekannt, weil v1 bereits auf n1 zeigt.
    expect(neu.auspraegungen[`${M}/bet@v1/adr`]![0]!.vonId).toBe('b1');
    expect(zuordenbar(`${M}/bet@v1/adr`)).toBeTrue();
  });

  it('laesst das uebergebene Modell unangetastet', () => {
    const doc = vorgabe({ auspraegungen: { [`${M}/bet`]: [{ id: 'n1', name: 'A' }] } });
    const liste: Auspraegung[] = [{ id: 'v1', name: 'Vorkommen 1' }];
    const inst = modell({ auspraegungen: { [`${M}/bet`]: liste } });

    ordneVorkommenZu(inst, doc, { [`${M}/bet`]: ['A'] });

    expect(liste[0]!.vonId).toBeUndefined();
    expect(liste[0]!.name).toBe('Vorkommen 1');
  });
});
