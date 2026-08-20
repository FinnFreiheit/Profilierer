import {
  TAG_MAX_ANZAHL,
  TAG_MAX_LAENGE,
  hatAlleTags,
  normalisiereTags,
  schalteTag,
  tagOptionen,
  tagsAlsText,
} from './tags.util';

describe('tags.util', () => {
  describe('normalisiereTags', () => {
    it('trimmt, wirft Leeres weg und sortiert alphabetisch', () => {
      expect(normalisiereTags([' Pilot ', '', '  ', 'eNoVA'])).toEqual(['eNoVA', 'Pilot']);
    });

    it('fasst Doppelte ohne Ruecksicht auf Gross-/Kleinschreibung zusammen', () => {
      // Die erste Schreibweise gewinnt — sonst wanderte die Anzeige beim Tippen.
      expect(normalisiereTags(['Pilot', 'pilot', 'PILOT'])).toEqual(['Pilot']);
    });

    it('nimmt auch kommagetrennten Text aus dem Eingabefeld', () => {
      expect(normalisiereTags('Pilot, eNoVA ,,Schulung')).toEqual(['eNoVA', 'Pilot', 'Schulung']);
    });

    it('faengt fehlende Eingaben ab', () => {
      expect(normalisiereTags(undefined)).toEqual([]);
      expect(normalisiereTags(null)).toEqual([]);
    });

    it('deckelt Laenge und Anzahl', () => {
      const lang = 'x'.repeat(TAG_MAX_LAENGE + 10);
      expect(normalisiereTags([lang])[0]?.length).toBe(TAG_MAX_LAENGE);
      const viele = Array.from({ length: TAG_MAX_ANZAHL + 5 }, (_, i) => `t${i}`);
      expect(normalisiereTags(viele).length).toBe(TAG_MAX_ANZAHL);
    });
  });

  it('tagsAlsText gibt die Eingabezeile der Dialoge zurueck', () => {
    expect(tagsAlsText(['eNoVA', 'Pilot'])).toBe('eNoVA, Pilot');
    expect(tagsAlsText(undefined)).toBe('');
  });

  describe('tagOptionen', () => {
    const items = [
      { tags: ['Pilot', 'eNoVA'] },
      { tags: ['pilot'] },
      { tags: undefined },
      { tags: ['Schulung'] },
    ];

    it('zaehlt je Schlagwort und stellt das Gebraeuchlichste voran', () => {
      expect(tagOptionen(items, (i) => i.tags)).toEqual([
        { tag: 'Pilot', n: 2 },
        { tag: 'eNoVA', n: 1 },
        { tag: 'Schulung', n: 1 },
      ]);
    });

    it('ist ohne Schlagworte leer — die Leiste bleibt dann ganz weg', () => {
      expect(tagOptionen([{ tags: undefined }], (i) => i.tags)).toEqual([]);
    });
  });

  describe('hatAlleTags', () => {
    it('verknuepft mehrere gewaehlte Schlagworte mit UND', () => {
      expect(hatAlleTags(['Pilot', 'eNoVA'], ['Pilot', 'eNoVA'])).toBeTrue();
      expect(hatAlleTags(['Pilot'], ['Pilot', 'eNoVA'])).toBeFalse();
    });

    it('laesst ohne Auswahl alles durch und beachtet die Schreibweise nicht', () => {
      expect(hatAlleTags(undefined, [])).toBeTrue();
      expect(hatAlleTags(['PILOT'], ['pilot'])).toBeTrue();
    });
  });

  it('schalteTag waehlt an und wieder ab', () => {
    expect(schalteTag([], 'Pilot')).toEqual(['Pilot']);
    expect(schalteTag(['Pilot', 'eNoVA'], 'pilot')).toEqual(['eNoVA']);
  });
});
