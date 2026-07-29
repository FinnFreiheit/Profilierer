import { Injectable, signal } from '@angular/core';

/**
 * Was verglichen werden soll. `versionId` weggelassen = die referenzierte
 * Abnahme-Version (der haeufige Einstieg "seit Abnahme geaendert").
 */
export type VergleichZiel =
  { art: 'profil'; profilId: string; versionId?: string } | { art: 'xml'; testmessageId: string };

/**
 * Steuert die beiden Vergleichsdialoge ("was hat sich seit der Abnahme
 * geaendert?"). Bewusst schlank: nur das Ziel, kein Laden und kein Rechnen —
 * das machen die Dialoge selbst.
 *
 * Muster wie ValidationReportService: die Dialoge haengen global in der Shell
 * und reagieren per effect. Ein Durchreichen als Output waere hier untauglich,
 * weil die Einstiege in Editor, Dashboard UND Testdaten liegen.
 */
@Injectable({ providedIn: 'root' })
export class VergleichService {
  readonly ziel = signal<VergleichZiel | null>(null);

  /** Profil gegen eine Version vergleichen; ohne versionId gegen die Abnahme. */
  oeffneProfil(profilId: string, versionId?: string): void {
    this.ziel.set({ art: 'profil', profilId, versionId });
  }

  /** Testnachricht gegen ihre eingefrorene Abnahme-Fassung vergleichen. */
  oeffneTestnachricht(testmessageId: string): void {
    this.ziel.set({ art: 'xml', testmessageId });
  }

  schliesse(): void {
    this.ziel.set(null);
  }
}
