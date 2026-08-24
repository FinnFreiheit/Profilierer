import { BundledVersion } from '../../models/schema-bundle.model';
import { alsFiles, vereineVersionen } from './schema-quellen.util';

/**
 * Die eine Regel, nach der hinterlegte und von xjustiz.de bezogene Versionen
 * zusammenkommen — sie gilt beim Start (Zugaenge aus dem Speicher) wie beim
 * Aktualisieren (Zugaenge von der Versionsseite).
 */
describe('vereineVersionen', () => {
  const hinterlegt = (id: string, over: Partial<BundledVersion> = {}): BundledVersion => ({
    id,
    label: id,
    dir: id,
    files: [`${id}.xsd`],
    ...over,
  });

  const vonXjustizDe = (id: string, over: Partial<BundledVersion> = {}): BundledVersion => ({
    id,
    label: id,
    dir: `xjustiz.de/${id}`,
    files: [],
    zipUrl: `/system/zip/XJustiz-${id}-XSD.zip`,
    hinweis: `XJustiz ${id} XSD`,
    ...over,
  });

  it('ersetzt eine Version gleicher Nummer an Ort und Stelle', () => {
    const { liste, neu } = vereineVersionen(
      [hinterlegt('3.6.2', { default: true }), hinterlegt('4.0.0')],
      [vonXjustizDe('3.6.2', { files: ['neu.xsd'] })],
    );

    expect(liste.map((v) => v.id)).toEqual(['3.6.2', '4.0.0']);
    expect(neu).toEqual([]);
    // dir/label/default bleiben — an dir haengt die aktive Auswahl.
    expect(liste[0]!.dir).toBe('3.6.2');
    expect(liste[0]!.default).toBeTrue();
    // Die Bezugsquelle wechselt.
    expect(liste[0]!.zipUrl).toBe('/system/zip/XJustiz-3.6.2-XSD.zip');
    expect(liste[0]!.files).toEqual(['neu.xsd']);
    expect(liste[1]!.zipUrl).toBeUndefined();
  });

  it('haengt dort neu erschienene Versionen an und meldet sie', () => {
    const { liste, neu } = vereineVersionen(
      [hinterlegt('3.6.2', { default: true })],
      [vonXjustizDe('4.1.0')],
    );

    expect(liste.map((v) => v.id)).toEqual(['3.6.2', '4.1.0']);
    expect(neu.map((v) => v.id)).toEqual(['4.1.0']);
    expect(liste[1]!.dir).toBe('xjustiz.de/4.1.0');
  });

  it('laesst den Bestand unberuehrt, wenn nichts dazukommt', () => {
    const bestand = [hinterlegt('3.6.2'), hinterlegt('4.0.0')];
    const { liste, neu } = vereineVersionen(bestand, []);
    expect(liste).toEqual(bestand);
    expect(neu).toEqual([]);
  });
});

describe('alsFiles', () => {
  it('verpackt Name und Inhalt in File-Objekte', async () => {
    const [f] = alsFiles([{ name: 'a.xsd', text: '<a/>' }]);
    expect(f!.name).toBe('a.xsd');
    expect(await f!.text()).toBe('<a/>');
  });
});
