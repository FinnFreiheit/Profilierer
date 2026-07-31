import { TestBed } from '@angular/core/testing';
import { ProfilDiffService, pfadKlartext, statusText } from './profil-diff.service';
import { ProfileDoc } from '../../models/profile.model';
import { ProfilDiffEintrag } from '../../models/profil-diff.model';

/** Minimales Dokument; die Standard-Statusstufen decken die haeufigen Faelle. */
function doc(over: Partial<ProfileDoc> = {}): ProfileDoc {
  return {
    meta: { name: 'Profil', nachricht: 'nachricht.x', xjustizVersion: '3.6.2' },
    statuses: [
      { id: 's1', name: 'zwingend', farbe: '#1D9E75', wirkung: 'pflicht' },
      { id: 's3', name: 'nicht verwendet', farbe: '#888780', wirkung: 'ausgeschlossen' },
    ],
    elemente: {},
    auspraegungen: {},
    erweiterungen: {},
    ...over,
  };
}

describe('ProfilDiffService', () => {
  let svc: ProfilDiffService;
  beforeEach(() => {
    svc = TestBed.inject(ProfilDiffService);
  });

  /** Einträge eines Bereichs herausfiltern. */
  const im = (r: { eintraege: ProfilDiffEintrag[] }, bereich: string) =>
    r.eintraege.filter((e) => e.bereich === bereich);

  it('meldet bei identischen Dokumenten nichts', () => {
    const r = svc.vergleiche(doc(), doc());
    expect(r.eintraege.length).toBe(0);
    expect(r.zaehler).toEqual({ neu: 0, entfernt: 0, geändert: 0 });
  });

  // ── Statusstufen: der kritische Fall ────────────────────────────────

  it('erkennt eine umbenannte Statusstufe bei gleicher id als Aenderung am Element', () => {
    const a = doc({ elemente: { 'nachricht.x/kopf': { status: 's1' } } });
    const b = doc({
      statuses: [
        { id: 's1', name: 'verpflichtend', farbe: '#1D9E75', wirkung: 'pflicht' },
        { id: 's3', name: 'nicht verwendet', farbe: '#888780', wirkung: 'ausgeschlossen' },
      ],
      elemente: { 'nachricht.x/kopf': { status: 's1' } },
    });
    const r = svc.vergleiche(a, b);
    const el = im(r, 'element');
    expect(el.length).toBe(1);
    expect(el[0]!.felder[0]!.feld).toBe('status');
    expect(el[0]!.felder[0]!.vorher).toBe('zwingend (pflicht)');
    expect(el[0]!.felder[0]!.nachher).toBe('verpflichtend (pflicht)');
    // Die Stufe selbst wird zusaetzlich als eigener Eintrag gemeldet.
    expect(im(r, 'status').length).toBe(1);
  });

  it('meldet keine Element-Aenderung, wenn eine andere id auf dieselbe Stufe zeigt', () => {
    const a = doc({ elemente: { 'nachricht.x/kopf': { status: 's1' } } });
    const b = doc({
      statuses: [
        { id: 's9', name: 'zwingend', farbe: '#1D9E75', wirkung: 'pflicht' },
        { id: 's3', name: 'nicht verwendet', farbe: '#888780', wirkung: 'ausgeschlossen' },
      ],
      elemente: { 'nachricht.x/kopf': { status: 's9' } },
    });
    const r = svc.vergleiche(a, b);
    expect(im(r, 'element').length).toBe(0);
    // Die Statusliste selbst hat sich sehr wohl geaendert (s1 weg, s9 neu).
    expect(
      im(r, 'status')
        .map((e) => e.art)
        .sort(),
    ).toEqual(['entfernt', 'neu']);
  });

  it('benennt eine verwaiste Status-id statt sie roh anzuzeigen', () => {
    expect(statusText(doc(), 's7')).toBe('unbekannte Statusstufe (s7)');
    expect(statusText(doc(), 's1')).toBe('zwingend (pflicht)');
    expect(statusText(doc(), undefined)).toBeUndefined();
  });

  it('meldet Farbe und Wirkung einer geaenderten Statusstufe', () => {
    const b = doc({
      statuses: [
        { id: 's1', name: 'zwingend', farbe: '#FF0000', wirkung: 'optional' },
        { id: 's3', name: 'nicht verwendet', farbe: '#888780', wirkung: 'ausgeschlossen' },
      ],
    });
    const felder = im(svc.vergleiche(doc(), b), 'status')[0]!.felder.map((f) => f.feld);
    expect(felder.sort()).toEqual(['farbe', 'wirkung']);
  });

  // ── Element-Felder ──────────────────────────────────────────────────

  it('meldet jedes ElementProfile-Feld einzeln mit alt und neu', () => {
    const p = 'nachricht.x/kopf';
    const a = doc({
      elemente: {
        [p]: { min: '0', max: '1', anmerkung: 'alt', beispiel: 'A', refZiel: 'z1', status: 's1' },
      },
    });
    const b = doc({
      elemente: {
        [p]: {
          min: '1',
          max: 'unbounded',
          anmerkung: 'neu',
          beispiel: 'B',
          refZiel: 'z2',
          status: 's1',
        },
      },
    });
    const felder = im(svc.vergleiche(a, b), 'element')[0]!.felder;
    const nach = Object.fromEntries(felder.map((f) => [f.feld, [f.vorher, f.nachher]]));
    expect(nach['min']).toEqual(['0', '1']);
    expect(nach['max']).toEqual(['1', 'unbounded']);
    expect(nach['anmerkung']).toEqual(['alt', 'neu']);
    expect(nach['beispiel']).toEqual(['A', 'B']);
    expect(nach['refZiel']).toEqual(['z1', 'z2']);
    // Unveraenderte Felder tauchen nicht auf.
    expect(nach['status']).toBeUndefined();
    // Hinweise sind kein Feld des Elementprofils mehr (eigene Ressource).
    expect(nach['hinweis']).toBeUndefined();
    expect(nach['hinweisErledigt']).toBeUndefined();
  });

  it('vergleicht Werte-Einschraenkungen als Menge und liefert ein Delta', () => {
    const p = 'nachricht.x/rolle';
    const a = doc({ elemente: { [p]: { werte: ['kl02', 'kl01', 'kl09'] } } });
    const gleich = doc({ elemente: { [p]: { werte: ['kl09', 'kl01', 'kl02'] } } });
    expect(im(svc.vergleiche(a, gleich), 'element').length).toBe(0);

    const b = doc({ elemente: { [p]: { werte: ['kl01', 'kl02', 'kl03'] } } });
    const f = im(svc.vergleiche(a, b), 'element')[0]!.felder[0]!;
    expect(f.feld).toBe('werte');
    expect(f.vorher).toBe('kl01, kl02, kl09');
    expect(f.nachher).toBe('kl01, kl02, kl03');
    expect(f.delta).toBe('+ kl03 · − kl09');
  });

  it('unterscheidet ein leeres Werte-Array von fehlender Einschraenkung', () => {
    const p = 'nachricht.x/rolle';
    const r = svc.vergleiche(
      doc({ elemente: { [p]: {} } }),
      doc({ elemente: { [p]: { werte: [] } } }),
    );
    const f = im(r, 'element')[0]!.felder[0]!;
    expect(f.vorher).toBeUndefined();
    expect(f.nachher).toBe('(keine Werte zugelassen)');
  });

  it('liefert bei neuen und entfallenen Elementen die belegten Felder als Kurzfassung', () => {
    const p = 'nachricht.x/neu';
    const r = svc.vergleiche(doc(), doc({ elemente: { [p]: { status: 's1', anmerkung: 'A' } } }));
    const e = im(r, 'element')[0]!;
    expect(e.art).toBe('neu');
    expect(e.springbar).toBeTrue();
    expect(e.felder.map((f) => f.feld).sort()).toEqual(['anmerkung', 'status']);
    expect(e.felder.every((f) => f.vorher === undefined)).toBeTrue();

    const weg = svc.vergleiche(doc({ elemente: { [p]: { status: 's1' } } }), doc());
    expect(im(weg, 'element')[0]!.art).toBe('entfernt');
    expect(im(weg, 'element')[0]!.springbar).toBeFalse();
  });

  // ── Auspraegungen ───────────────────────────────────────────────────

  it('meldet neue, entfallene und umbenannte Auspraegungen, Reihenfolge zaehlt nicht', () => {
    const p = 'nachricht.x/beteiligung';
    const a = doc({
      auspraegungen: {
        [p]: [
          { id: 'a1', name: 'Kläger' },
          { id: 'a2', name: 'Beklagter' },
        ],
      },
    });
    const b = doc({
      auspraegungen: {
        [p]: [
          { id: 'a2', name: 'Beklagter' },
          { id: 'a1', name: 'Klägerin' },
          { id: 'a3', name: 'Zeuge' },
        ],
      },
    });
    const e = im(svc.vergleiche(a, b), 'auspraegung');
    expect(e.length).toBe(2);
    const umbenannt = e.find((x) => x.pfad === `${p}@a1`)!;
    expect(umbenannt.art).toBe('geändert');
    expect(umbenannt.felder[0]!.vorher).toBe('Kläger');
    expect(umbenannt.felder[0]!.nachher).toBe('Klägerin');
    expect(e.find((x) => x.pfad === `${p}@a3`)!.art).toBe('neu');
  });

  it('loest Auspraegungs- und Erweiterungs-ids im Pfad-Klartext auf', () => {
    const b = doc({
      auspraegungen: { 'nachricht.x/beteiligung': [{ id: 'a1', name: 'Kläger' }] },
      erweiterungen: {
        'nachricht.x/beteiligung@a1': [{ id: 'x9', name: 'Aktenzeichen-alt', min: '0', max: '1' }],
      },
    });
    expect(pfadKlartext('nachricht.x/beteiligung@a1/~x9', b, doc())).toBe(
      'nachricht.x/beteiligung „Kläger"/~Aktenzeichen-alt',
    );
    // Geloescht im Arbeitsstand: Aufloesung faellt auf die Basis zurueck.
    expect(pfadKlartext('nachricht.x/beteiligung@a1', doc(), b)).toBe(
      'nachricht.x/beteiligung „Kläger"',
    );
    // Nirgends auffindbar: die id wird als geloescht kenntlich gemacht.
    expect(pfadKlartext('nachricht.x/beteiligung@a7', doc(), doc())).toBe(
      'nachricht.x/beteiligung „(gelöscht: a7)"',
    );
  });

  // ── Schema-Erweiterungen ────────────────────────────────────────────

  it('meldet neue, entfallene und geaenderte Schema-Erweiterungen', () => {
    const p = 'nachricht.x/kopf';
    const a = doc({
      erweiterungen: { [p]: [{ id: 'x1', name: 'Az', min: '0', max: '1', datentyp: 'string' }] },
    });
    const b = doc({
      erweiterungen: {
        [p]: [
          { id: 'x1', name: 'Az', min: '1', max: '1', datentyp: 'date' },
          { id: 'x2', name: 'Neu', min: '0', max: 'unbounded' },
        ],
      },
    });
    const e = im(svc.vergleiche(a, b), 'erweiterung');
    expect(e.length).toBe(2);
    const geaendert = e.find((x) => x.pfad === `${p}/~x1`)!;
    expect(geaendert.art).toBe('geändert');
    expect(geaendert.felder.map((f) => f.feld).sort()).toEqual(['datentyp', 'min']);
    expect(e.find((x) => x.pfad === `${p}/~x2`)!.art).toBe('neu');
  });

  // ── Metadaten ───────────────────────────────────────────────────────

  it('meldet Metadaten feldweise, ignoriert aber das Speicherdatum', () => {
    const a = doc({ meta: { name: 'Alt', autor: 'F', gespeichert: '2026-01-01' } });
    const b = doc({ meta: { name: 'Neu', autor: 'F', gespeichert: '2026-07-29' } });
    const e = im(svc.vergleiche(a, b), 'meta');
    expect(e.length).toBe(1);
    expect(e[0]!.titel).toBe('Name');
    expect(e[0]!.felder[0]!.vorher).toBe('Alt');
    expect(e[0]!.felder[0]!.nachher).toBe('Neu');
  });

  // ── Zusammenfassung ─────────────────────────────────────────────────

  it('zaehlt nach Art und Bereich und sortiert nach Bereich', () => {
    const a = doc({ elemente: { 'nachricht.x/weg': { status: 's1' } } });
    const b = doc({
      meta: { name: 'Anders' },
      elemente: { 'nachricht.x/neu': { status: 's1' } },
      auspraegungen: { 'nachricht.x/b': [{ id: 'a1', name: 'X' }] },
    });
    const r = svc.vergleiche(a, b);
    expect(r.zaehler.neu).toBe(2);
    expect(r.zaehler.entfernt).toBeGreaterThanOrEqual(1);
    expect(r.proBereich.element).toBe(2);
    expect(r.proBereich.auspraegung).toBe(1);
    // meta zuerst, auspraegung zuletzt.
    expect(r.eintraege[0]!.bereich).toBe('meta');
    expect(r.eintraege[r.eintraege.length - 1]!.bereich).toBe('auspraegung');
  });
});
