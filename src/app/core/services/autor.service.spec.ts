import { TestBed } from '@angular/core/testing';
import { AUTOR_STORAGE, AutorService } from './autor.service';

/**
 * Die Selbstauskunft ist eine Quelle fuer Hinweise (#40) und den Autor einer
 * Testnachricht — deshalb steht hier auch die Uebernahme des alten Schluessels.
 */
describe('AutorService', () => {
  const ALT = 'xjp.hinweisAutor';

  beforeEach(() => {
    localStorage.removeItem(AUTOR_STORAGE);
    localStorage.removeItem(ALT);
  });
  afterEach(() => {
    localStorage.removeItem(AUTOR_STORAGE);
    localStorage.removeItem(ALT);
  });

  const dienst = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(AutorService);
  };

  it('merkt den getrimmten Namen und ueberlebt den Reload', () => {
    const a = dienst();
    a.setze('  F. Freiheit  ');
    expect(a.name()).toBe('F. Freiheit');
    expect(localStorage.getItem(AUTOR_STORAGE)).toBe('F. Freiheit');
    expect(dienst().name()).toBe('F. Freiheit');
  });

  it('leerer Name loescht die Ablage — danach wird wieder gefragt', () => {
    const a = dienst();
    a.setze('F. Freiheit');
    a.setze('   ');
    expect(a.name()).toBe('');
    expect(localStorage.getItem(AUTOR_STORAGE)).toBeNull();
  });

  it('uebernimmt den Namen aus der alten Hinweis-Ablage', () => {
    localStorage.setItem(ALT, 'M. Beispiel');
    expect(dienst().name()).toBe('M. Beispiel');
    expect(localStorage.getItem(AUTOR_STORAGE)).toBe('M. Beispiel');
  });

  it('sicherstellen fragt nur, solange kein Name hinterlegt ist', () => {
    const a = dienst();
    const frage = spyOn(window, 'prompt').and.returnValue('F. Freiheit');
    expect(a.sicherstellen()).toBe('F. Freiheit');
    expect(a.sicherstellen()).toBe('F. Freiheit');
    expect(frage).toHaveBeenCalledTimes(1);
  });

  it('abgebrochene Abfrage gibt leer zurueck — der Aufrufer bricht dann ab', () => {
    const a = dienst();
    spyOn(window, 'prompt').and.returnValue(null);
    expect(a.sicherstellen()).toBe('');
  });
});
