import { TestBed } from '@angular/core/testing';
import { PersistenceService } from './persistence.service';
import { ProfileStoreService } from './profile-store.service';
import { ToastService } from './toast.service';
import { StateService } from './state.service';
import { ProfileDoc } from '../../models/profile.model';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root"><xs:sequence>
    <xs:element name="datum" type="xs:date"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;

describe('PersistenceService.loadXsdFiles', () => {
  let svc: PersistenceService;
  let state: StateService;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(PersistenceService);
    state = TestBed.inject(StateService);
  });

  it('parst .xsd-Dateien, baut den Index und setzt den Store', async () => {
    const file = new File([XSD], 'xjustiz_0000_test.xsd', { type: 'application/xml' });
    const n = await svc.loadXsdFiles([file]);
    expect(n).toBe(1);
    expect(state.version()).toBe('3.6.2');
    expect(state.idx()!.messages.map((m) => m.name)).toEqual(['nachricht.test.0001']);
    expect(state.docs().length).toBe(1);
  });

  it('wirft bei fehlenden .xsd-Dateien', async () => {
    const other = new File(['x'], 'liste.xml', { type: 'text/xml' });
    await expectAsync(svc.loadXsdFiles([other])).toBeRejectedWithError(/Keine .xsd/);
  });
});

describe('PersistenceService Notfallkopien', () => {
  const PREFIX = 'xjp.notfall.';
  const doc = (name: string): ProfileDoc => ({
    meta: { name },
    statuses: [],
    elemente: {},
    auspraegungen: {},
  });

  let upserted: { id: string; doc: ProfileDoc }[];
  let toasts: string[];
  let upsertOk: boolean;

  const clearNotfall = (): void => {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  };

  beforeEach(() => {
    upserted = [];
    toasts = [];
    upsertOk = true;
    clearNotfall();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ProfileStoreService,
          useValue: {
            upsert: async (id: string, d: ProfileDoc) => {
              if (!upsertOk) throw new Error('offline');
              upserted.push({ id, doc: d });
            },
          },
        },
        { provide: ToastService, useValue: { show: (m: string) => toasts.push(m) } },
      ],
    });
  });

  afterEach(clearNotfall);

  it('traegt vorhandene Notfallkopien beim Start ans Backend nach und raeumt sie weg', async () => {
    localStorage.setItem(PREFIX + 'p1', JSON.stringify({ doc: doc('Eins'), ts: 1 }));
    localStorage.setItem(PREFIX + 'p2', JSON.stringify({ doc: doc('Zwei'), ts: 2 }));
    const svc = TestBed.inject(PersistenceService);
    await svc.flushNotfallkopien(); // Konstruktor-Flush laeuft parallel — Dedupe im Assert
    expect([...new Set(upserted.map((u) => u.id))].sort()).toEqual(['p1', 'p2']);
    expect(localStorage.getItem(PREFIX + 'p1')).toBeNull();
    expect(localStorage.getItem(PREFIX + 'p2')).toBeNull();
    expect(toasts.some((t) => t.includes('nachgetragen'))).toBeTrue();
  });

  it('behaelt Notfallkopien, solange das Backend nicht erreichbar ist', async () => {
    upsertOk = false;
    localStorage.setItem(PREFIX + 'p1', JSON.stringify({ doc: doc('Eins'), ts: 1 }));
    const svc = TestBed.inject(PersistenceService);
    await svc.flushNotfallkopien();
    expect(localStorage.getItem(PREFIX + 'p1')).not.toBeNull();
    expect(toasts.some((t) => t.includes('Notfallkopie vorhanden'))).toBeTrue();
  });

  it('ohne Notfallkopien: kein Nachtrag, kein Toast', async () => {
    const svc = TestBed.inject(PersistenceService);
    await svc.flushNotfallkopien();
    expect(upserted.length).toBe(0);
    expect(toasts.length).toBe(0);
  });
});
