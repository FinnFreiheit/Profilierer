import { ansichtAusUrl } from './ansicht-url.util';

/**
 * `?ansicht=styleguide` ist der einzige Weg zum Styleguide: kein Reiter, keine
 * andere Ansicht per URL — nur dieser eine Wert wird erkannt.
 */
describe('ansichtAusUrl', () => {
  it('erkennt den Styleguide', () => {
    expect(ansichtAusUrl('?ansicht=styleguide')).toBe('styleguide');
    expect(ansichtAusUrl('?profil=abc&ansicht=styleguide')).toBe('styleguide');
  });

  it('kennt keine anderen Ansichten und keinen leeren Parameter', () => {
    expect(ansichtAusUrl('')).toBeNull();
    expect(ansichtAusUrl('?ansicht=dashboard')).toBeNull();
    expect(ansichtAusUrl('?ansicht=')).toBeNull();
    expect(ansichtAusUrl('?profil=abc')).toBeNull();
  });
});
