import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TreeNode } from './tree-node';
import { StateService } from '../../core/services/state.service';
import { TreeService } from '../../core/services/tree.service';
import { XsdParserService } from './../../core/services/xsd-parser.service';
import { TreeNode as TNode } from '../../models/node.model';

const XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="3.6.2">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root">
    <xs:sequence>
      <xs:element name="datum" type="xs:date"/>
      <xs:element name="akte" type="Type.Test.Akte" minOccurs="0"/>
      <xs:element name="dokumenttyp" type="Code.Test.Dokumenttyp" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.Test.Akte">
    <xs:sequence><xs:element name="identifikation" type="xs:string"/></xs:sequence>
  </xs:complexType>
  <xs:complexType name="Code.Test.Dokumenttyp">
    <xs:annotation><xs:appinfo>
      <codeliste>
        <nameLang>Test.Dokumenttyp</nameLang>
        <kennung>urn:test:dokumenttyp</kennung>
      </codeliste>
    </xs:appinfo></xs:annotation>
    <xs:simpleContent><xs:extension base="xs:string"/></xs:simpleContent>
  </xs:complexType>
</xs:schema>`;

/**
 * Der Kasten einer Schema-Erweiterung (#97): der Typ steht am Knoten, ein im
 * aktiven Schema fehlender Typ wird rot gemeldet, und die Loeschfrage nennt die
 * Zahl der mitfallenden Festlegungen.
 */
describe('TreeNode — Kasten einer Schema-Erweiterung', () => {
  let state: StateService;
  let tree: TreeService;
  let root: TNode;
  let fixture: ComponentFixture<TreeNode>;

  const M = 'nachricht.test.0001';

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TreeNode] }).compileComponents();
    state = TestBed.inject(StateService);
    tree = TestBed.inject(TreeService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const idx = parser.buildIndexFrom([{ file: 'xjustiz_0000_test.xsd', dom }]).idx;
    state.idx.set(idx);
    root = tree.buildRoot(M, idx);
    state.root.set(root);
    fixture = TestBed.createComponent(TreeNode);
  });

  /** Den Kasten fuer den Erweiterungs-Knoten unter `elternPfad` rendern. */
  const rendere = (elternPfad: string, id: string): HTMLElement => {
    const eltern = elternPfad === M ? root : findeKnoten(elternPfad);
    const node = tree.kinder(eltern).find((k) => k.path === elternPfad + '/~' + id)!;
    fixture.componentRef.setInput('item', { kind: 'el', node });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  /** Knoten im gerenderten Baum suchen (nur die Tiefe, die die Tests brauchen). */
  const findeKnoten = (pfad: string): TNode => {
    const suche = (n: TNode, tiefe: number): TNode | null => {
      if (n.path === pfad) return n;
      if (tiefe > 4) return null;
      for (const c of tree.kinder(n)) {
        const hit = suche(c, tiefe + 1);
        if (hit) return hit;
      }
      return null;
    };
    return suche(root, 0)!;
  };

  const tags = (el: HTMLElement): string[] =>
    Array.from(el.querySelectorAll('.tags .tag')).map((t) => (t.textContent ?? '').trim());

  it('zeigt neben der Kennzeichnung ein Pill mit dem Datentyp', () => {
    const id = state.addErweiterung(M, {
      name: 'beiakte',
      min: '0',
      max: '1',
      datentyp: 'Type.Test.Akte',
      datentypQuelle: 'schema',
    });

    const el = rendere(M, id);

    expect(el.querySelector('.box')?.classList).toContain('extBox');
    expect(tags(el)).toContain('Schema-Erweiterung');
    expect(tags(el)).toContain('Type.Test.Akte');
  });

  it('meldet einen im aktiven Schema fehlenden Typ rot', () => {
    const id = state.addErweiterung(M, {
      name: 'geheimhaltung',
      min: '0',
      max: '1',
      datentyp: 'Type.Test.Entfallen',
      datentypQuelle: 'schema',
    });

    const el = rendere(M, id);

    const warn = el.querySelector('.tag.t-typerr');
    expect(warn).not.toBeNull();
    expect(warn!.getAttribute('title')).toContain('Type.Test.Entfallen');
    expect(warn!.getAttribute('title')).toContain('3.6.2');
  });

  it('ein Freitext-Typ bleibt ohne rote Meldung', () => {
    const id = state.addErweiterung(M, {
      name: 'wunschfeld',
      min: '0',
      max: '1',
      datentyp: 'Type.Test.Entfallen',
      datentypQuelle: 'frei',
    });

    expect(rendere(M, id).querySelector('.tag.t-typerr')).toBeNull();
  });

  it('nennt beim Loeschen die Zahl der Festlegungen darunter', () => {
    const id = state.addErweiterung(M, {
      name: 'beiakte',
      min: '0',
      max: '1',
      datentyp: 'Type.Test.Akte',
      datentypQuelle: 'schema',
    });
    state.setElementProfile(`${M}/~${id}/identifikation`, { status: 's1' });
    const frage = spyOn(window, 'confirm').and.returnValue(false);

    rendere(M, id).querySelector<HTMLButtonElement>('.delBtn')!.click();

    expect(frage.calls.mostRecent().args[0]).toContain('1 Festlegung');
    expect(state.erweiterungenOf(M)!.length).toBe(1);
  });

  it('das Loeschen einer inneren Erweiterung laesst die aeussere stehen', () => {
    const aussen = state.addErweiterung(M, {
      name: 'beiakte',
      min: '0',
      max: '1',
      datentyp: 'Type.Test.Akte',
      datentypQuelle: 'schema',
    });
    const innenEltern = `${M}/~${aussen}/identifikation`;
    const innen = state.addErweiterung(innenEltern, {
      name: 'praefix',
      min: '0',
      max: '1',
      datentyp: 'string',
    });
    spyOn(window, 'confirm').and.returnValue(true);

    rendere(innenEltern, innen).querySelector<HTMLButtonElement>('.delBtn')!.click();

    expect(state.erweiterungenOf(innenEltern)).toBeNull();
    expect(state.erweiterungenOf(M)!.map((e) => e.id)).toEqual([aussen]);
  });
});

/**
 * Hervorhebung belegter Angaben (Nachrichten-Modus): Beim Befuellen einer
 * Testnachricht ist die erste Frage, wo schon etwas steht — ein Platzhalter im
 * Eingabefeld sieht einem Wert zu aehnlich, ein zugeklappter Ast zeigt gar
 * nichts. Blatt mit eigenem Wert: Haken und Toenung, Container: Zaehler.
 */
describe('TreeNode — belegte Angaben hervorheben', () => {
  let state: StateService;
  let tree: TreeService;
  let root: TNode;
  let fixture: ComponentFixture<TreeNode>;

  const M = 'nachricht.test.0001';
  const AKTE = `${M}/akte`;
  const ID = `${M}/akte/identifikation`;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TreeNode] }).compileComponents();
    state = TestBed.inject(StateService);
    tree = TestBed.inject(TreeService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const idx = parser.buildIndexFrom([{ file: 'xjustiz_0000_test.xsd', dom }]).idx;
    state.idx.set(idx);
    root = tree.buildRoot(M, idx);
    state.root.set(root);
    fixture = TestBed.createComponent(TreeNode);
    // Nachrichten-Modus: nur dort wird hervorgehoben (in der Profilierung ist
    // der Beispielwert Beiwerk, nicht der Gegenstand der Arbeit).
    state.messageCreate.set({ msgName: M, entryId: null, name: null });
  });

  /** Kasten zu einem Pfad rendern (nur die Tiefe, die die Tests brauchen). */
  const rendere = (pfad: string): HTMLElement => {
    const suche = (n: TNode, tiefe: number): TNode | null => {
      if (n.path === pfad) return n;
      if (tiefe > 4) return null;
      for (const c of tree.kinder(n)) {
        const hit = suche(c, tiefe + 1);
        if (hit) return hit;
      }
      return null;
    };
    fixture.componentRef.setInput('item', { kind: 'el', node: suche(root, 0)! });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  const box = (el: HTMLElement): HTMLElement => el.querySelector('.box')!;

  it('Blatt mit Testwert: Toenung und Haken', () => {
    state.setElementProfile(ID, { beispiel: 'AZ-1' });

    const el = rendere(ID);

    expect(box(el).classList).toContain('belegt');
    expect(el.querySelector('.wmark')).not.toBeNull();
  });

  it('Blatt ohne Testwert bleibt unmarkiert', () => {
    const el = rendere(ID);

    expect(box(el).classList).not.toContain('belegt');
    expect(el.querySelector('.wmark')).toBeNull();
  });

  it('Container zaehlt die belegten Angaben darunter', () => {
    state.setElementProfile(ID, { beispiel: 'AZ-1' });

    const el = rendere(AKTE);

    expect(box(el).classList).toContain('belegtSub');
    expect(box(el).classList).not.toContain('belegt'); // kein eigener Wert
    expect(el.querySelector('.wsub')?.textContent?.trim()).toBe('1');
  });

  it('leere Angabe zaehlt nicht (Platzhalter ist kein Wert)', () => {
    state.setElementProfile(ID, { beispiel: '' });

    expect(box(rendere(AKTE)).classList).not.toContain('belegtSub');
    expect(box(rendere(ID)).classList).not.toContain('belegt');
  });

  it('in der Profilierung wird nicht hervorgehoben', () => {
    state.messageCreate.set(null);
    state.setElementProfile(ID, { beispiel: 'AZ-1' });

    expect(box(rendere(ID)).classList).not.toContain('belegt');
    expect(box(rendere(AKTE)).classList).not.toContain('belegtSub');
  });

  it('bei „nur Werte" wird nicht hervorgehoben — der Filter zeigt ohnehin nur Belegtes', () => {
    state.onlyValues.set(true);
    state.setElementProfile(ID, { beispiel: 'AZ-1' });

    expect(box(rendere(ID)).classList).not.toContain('belegt');
  });
});

/**
 * Codes zu Klartext aufloesen — auch beim Bearbeiten. Der Code allein ("252")
 * sagt beim Befuellen einer Testnachricht nichts; die Bedeutung stand bisher
 * nur im Auswahl-Dropdown und im Betrachtungsmodus.
 */
describe('TreeNode — Codelisten-Werte aufloesen', () => {
  let state: StateService;
  let tree: TreeService;
  let root: TNode;
  let fixture: ComponentFixture<TreeNode>;

  const M = 'nachricht.test.0001';
  const TYP = `${M}/dokumenttyp`;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TreeNode] }).compileComponents();
    state = TestBed.inject(StateService);
    tree = TestBed.inject(TreeService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD, 'application/xml');
    const idx = parser.buildIndexFrom([{ file: 'xjustiz_0000_test.xsd', dom }]).idx;
    state.idx.set(idx);
    root = tree.buildRoot(M, idx);
    state.root.set(root);
    fixture = TestBed.createComponent(TreeNode);
    state.codelists.set({
      'urn:test:dokumenttyp': {
        kennung: 'urn:test:dokumenttyp',
        name: 'Test.Dokumenttyp',
        version: '4.0',
        werte: [
          { value: '252', label: 'Erlassvermerk' },
          { value: '253', label: 'Transfervermerk' },
        ],
      },
    });
  });

  const rendere = (pfad: string): HTMLElement => {
    const node = tree.kinder(root).find((k) => k.path === pfad)!;
    fixture.componentRef.setInput('item', { kind: 'el', node });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('zeigt den Klartext unter dem Eingabefeld', () => {
    state.setElementProfile(TYP, { beispiel: '252' });

    const el = rendere(TYP);

    expect(el.querySelector('.vlabel')?.textContent?.trim()).toBe('Erlassvermerk');
    expect(el.querySelector<HTMLInputElement>('.vin')!.value).toBe('252'); // Code bleibt der Wert
  });

  it('Mini-Kasten zeigt Code und Klartext, voll im Tooltip', () => {
    state.setElementProfile(TYP, { beispiel: '253' });

    const mv = rendere(TYP).querySelector('.mv')!;

    expect(mv.textContent?.trim()).toBe('253 · Transfervermerk');
    expect(mv.getAttribute('title')).toBe('253 · Transfervermerk');
  });

  it('unbekannter Code bleibt roh (keine erfundene Bedeutung)', () => {
    state.setElementProfile(TYP, { beispiel: '999' });

    const el = rendere(TYP);

    expect(el.querySelector('.vlabel')).toBeNull();
    expect(el.querySelector('.mv')?.textContent?.trim()).toBe('999');
  });

  it('ohne geladene Codeliste bleibt es beim Code', () => {
    state.codelists.set({});
    state.setElementProfile(TYP, { beispiel: '252' });

    expect(rendere(TYP).querySelector('.vlabel')).toBeNull();
  });

  it('leeres Feld zeigt keinen Klartext', () => {
    expect(rendere(TYP).querySelector('.vlabel')).toBeNull();
  });
});

/**
 * XSD-Attribute sind kein Teil des Element-Baums (`TreeNode` entsteht nur aus
 * `xs:element`) — sie werden im Kasten ihres Elements angezeigt. Deckt die
 * Faelle ab, die in den XJustiz-Schemata vorkommen: fester Wert, Pflicht ohne
 * `fixed` (xjustizVersion ab 4.0.0), Vererbung ueber `extension` und die
 * Codelisten-Attribute, deren Wert aus der geladenen Codeliste kommt.
 */
describe('TreeNode — XSD-Attribute im Kasten anzeigen', () => {
  let state: StateService;
  let tree: TreeService;
  let root: TNode;
  let fixture: ComponentFixture<TreeNode>;

  const M = 'nachricht.test.0001';

  const XSD_ATTR = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="4.0.0">
  <xs:element name="nachricht.test.0001" type="Type.Test.Root"/>
  <xs:complexType name="Type.Test.Root">
    <xs:sequence>
      <xs:element name="kopf" type="Type.Test.Kopf"/>
      <xs:element name="erbe" type="Type.Test.Erbe" minOccurs="0"/>
      <xs:element name="ohne" type="xs:string" minOccurs="0"/>
      <xs:element name="dokumenttyp" type="Code.Test.Dokumenttyp" minOccurs="0"/>
      <xs:element name="beteiligter" type="Type.Test.Kopf" minOccurs="0" maxOccurs="unbounded"/>
    </xs:sequence>
  </xs:complexType>
  <xs:complexType name="Type.Test.Kopf">
    <xs:sequence><xs:element name="titel" type="xs:string"/></xs:sequence>
    <xs:attribute name="xjustizVersion" type="Type.Test.XJustizVersion" use="required"/>
    <xs:attribute name="hinweis" type="xs:string" use="optional" fixed="fest"/>
  </xs:complexType>
  <xs:complexType name="Type.Test.Basis">
    <xs:attribute name="id" type="xs:token" use="required"/>
  </xs:complexType>
  <xs:complexType name="Type.Test.Erbe">
    <xs:complexContent><xs:extension base="Type.Test.Basis">
      <xs:sequence><xs:element name="wert" type="xs:string"/></xs:sequence>
      <xs:attribute name="eigen" type="xs:string" use="optional"/>
    </xs:extension></xs:complexContent>
  </xs:complexType>
  <xs:complexType name="Code.Test.Dokumenttyp">
    <xs:annotation><xs:appinfo>
      <codeliste><kennung>urn:test:dokumenttyp</kennung></codeliste>
    </xs:appinfo></xs:annotation>
    <xs:simpleContent><xs:extension base="xs:string">
      <xs:attribute name="listURI" type="xs:anyURI" use="required"/>
      <xs:attribute name="listVersionID" type="xs:normalizedString" use="required"/>
    </xs:extension></xs:simpleContent>
  </xs:complexType>
  <xs:simpleType name="Type.Test.XJustizVersion">
    <xs:restriction base="xs:string"><xs:pattern value="4\\.\\d+\\.\\d+"/></xs:restriction>
  </xs:simpleType>
</xs:schema>`;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TreeNode] }).compileComponents();
    state = TestBed.inject(StateService);
    tree = TestBed.inject(TreeService);
    const parser = TestBed.inject(XsdParserService);
    const dom = new DOMParser().parseFromString(XSD_ATTR, 'application/xml');
    const { idx, version } = parser.buildIndexFrom([{ file: 'xjustiz_0000_test.xsd', dom }]);
    state.idx.set(idx);
    state.version.set(version);
    root = tree.buildRoot(M, idx);
    state.root.set(root);
    fixture = TestBed.createComponent(TreeNode);
  });

  const rendere = (pfad: string): HTMLElement => {
    const node = tree.kinder(root).find((k) => k.path === pfad)!;
    fixture.componentRef.setInput('item', { kind: 'el', node });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  const attrs = (el: HTMLElement): string[] =>
    Array.from(el.querySelectorAll('.attrs .attr')).map((a) => (a.textContent ?? '').trim());

  it('zeigt die Attribute des Elements mit ihrem Wert', () => {
    const el = rendere(`${M}/kopf`);

    expect(attrs(el)).toEqual(['xjustizVersion4.0.0', 'hinweisfest']);
  });

  it('kennzeichnet Pflicht-Attribute', () => {
    const el = rendere(`${M}/kopf`);
    const pflicht = Array.from(el.querySelectorAll('.attrs .attr.attrPflicht')).map((a) =>
      (a.querySelector('.attrName')?.textContent ?? '').trim(),
    );

    expect(pflicht).toEqual(['xjustizVersion']);
  });

  it('nennt Typ und Verbindlichkeit im Titel', () => {
    const el = rendere(`${M}/kopf`);
    const titel = el.querySelector('.attrs .attr')?.getAttribute('title') ?? '';

    expect(titel).toContain('Type.Test.XJustizVersion');
    expect(titel).toContain('Pflicht');
  });

  it('zeigt geerbte Attribute einer extension mit', () => {
    const el = rendere(`${M}/erbe`);
    const namen = Array.from(el.querySelectorAll('.attrs .attrName')).map((a) =>
      (a.textContent ?? '').trim(),
    );

    expect(namen).toEqual(['eigen', 'id']);
  });

  it('Elemente ohne Attribute bekommen keine Zeile', () => {
    expect(rendere(`${M}/ohne`).querySelector('.attrs')).toBeNull();
  });

  // Auch Blaetter zeigen ihre Attribute — Code.*-Elemente haben keinen
  // aufklappbaren Unterbau, ihre Attribute waeren sonst nie zu sehen.
  it('Codelisten-Attribute tragen den Wert der geladenen Codeliste', () => {
    state.codelists.set({
      'urn:test:dokumenttyp': {
        kennung: 'urn:test:dokumenttyp',
        name: 'Test.Dokumenttyp',
        version: '4.0',
        werte: [],
      },
    });

    expect(attrs(rendere(`${M}/dokumenttyp`))).toEqual([
      'listURIurn:test:dokumenttyp',
      'listVersionID4.0',
    ]);
  });

  it('am Container eines Elements mit Vorkommen bleibt die Zeile weg', () => {
    const pfad = `${M}/beteiligter`;
    expect(attrs(rendere(pfad)).length).toBeGreaterThan(0);

    state.addAusp(pfad, 'Antragsteller');

    expect(rendere(pfad).querySelector('.attrs')).toBeNull();
  });
});
