import { Injectable, inject, signal } from '@angular/core';
import { Kennzahlen } from '../../models/kennzahlen.model';
import { BackendClient, BackendFehler } from './backend-client.service';

/**
 * Abruf der Kennzahlen (#kennzahlen). Anders als die uebrigen Stores laedt
 * dieser **nicht** im Konstruktor: der Endpunkt ist AG-exklusiv, jede
 * Extern-Sitzung wuerde beim Start ein 403 erzeugen. Geladen wird, wenn die
 * Ansicht geoeffnet wird.
 *
 * 403 ist hier kein Ausfall, sondern die fehlende Rolle — die Ansicht sagt das
 * auch so, statt "Backend nicht erreichbar" zu behaupten (gleiche
 * Unterscheidung wie in `core/util/hinweis.util.ts`).
 */
@Injectable({ providedIn: 'root' })
export class KennzahlenStoreService {
  private readonly http = inject(BackendClient).fuer('Kennzahlen');

  readonly daten = signal<Kennzahlen | null>(null);
  readonly laedt = signal(false);
  readonly fehler = signal<string | null>(null);

  async refresh(tage = 30): Promise<void> {
    this.laedt.set(true);
    this.fehler.set(null);
    try {
      this.daten.set(await this.http.json<Kennzahlen>(`/kennzahlen?tage=${tage}`));
    } catch (e) {
      this.daten.set(null);
      this.fehler.set(
        e instanceof BackendFehler && e.status === 403
          ? 'Kennzahlen sind der AG-Rolle vorbehalten — bitte mit dem AG-Schlüssel anmelden.'
          : 'Kennzahlen nicht abrufbar — Backend nicht erreichbar.',
      );
    } finally {
      this.laedt.set(false);
    }
  }
}
