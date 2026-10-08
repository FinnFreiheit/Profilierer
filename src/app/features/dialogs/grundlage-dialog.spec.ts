import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GrundlageDialog } from './grundlage-dialog';
import { StateService } from '../../core/services/state.service';
import { BundledVersion } from '../../models/schema-bundle.model';

const version = (
  dir: string,
  label: string,
  rest: Partial<BundledVersion> = {},
): BundledVersion => ({
  id: dir,
  dir,
  label,
  files: [],
  ...rest,
});

/**
 * Der Dialog beantwortet "worauf beruht das hier". Getestet wird die
 * Versionsliste: sie muss die aktive Version kennzeichnen und die Wahl
 * nach aussen melden, ohne sich dabei zu schliessen (der Haken wandert).
 */
describe('GrundlageDialog — Versionsliste', () => {
  let fixture: ComponentFixture<GrundlageDialog>;
  let state: StateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [GrundlageDialog] }).compileComponents();
    state = TestBed.inject(StateService);
    state.bundledVersions.set([
      version('3.6.2', '3.6.2', { default: true }),
      version('4.0.0', '4.0.0', { zipUrl: 'https://xjustiz.de/x.zip' }),
    ]);
    state.activeBundle.set('4.0.0');
    fixture = TestBed.createComponent(GrundlageDialog);
    fixture.detectChanges();
  });

  const zeilen = (): HTMLButtonElement[] => [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      '.grundlageZeile',
    ),
  ];

  it('kennzeichnet die aktive Version mit einem Haken', () => {
    expect(zeilen().length).toBe(2);
    expect(zeilen()[0]!.textContent).not.toContain('✓');
    expect(zeilen()[1]!.textContent).toContain('✓');
    expect(zeilen()[1]!.classList).toContain('aktiv');
  });

  it('meldet die Wahl einer Version nach aussen', () => {
    let gewaehlt = '';
    fixture.componentInstance.bundledPick.subscribe((d) => (gewaehlt = d));

    zeilen()[0]!.click();

    expect(gewaehlt).toBe('3.6.2');
  });

  it('nennt im Untertitel den Stand ohne geladene Schemata', () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('p')?.textContent).toContain(
      'keine Schemata geladen',
    );
  });
});
