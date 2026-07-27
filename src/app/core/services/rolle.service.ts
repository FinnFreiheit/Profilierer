import { Injectable, computed, signal } from '@angular/core';

/** Browser-Storage-Schluessel des gemerkten AG-Schluessels. */
export const AG_KEY_STORAGE = 'xjp.agKey';

/** Ergebnis eines Anmeldeversuchs (Tippfehler vs. Konfigurationsproblem). */
export type AnmeldeErgebnis = 'ok' | 'falsch' | 'nicht-konfiguriert';

/**
 * Client-Rollenzustand des Zwei-Rollen-Konzepts der Abnahme-Story: Die AG-Rolle
 * (BLK-AG IT-Standards) weist sich ueber einen gemeinsamen Schluessel aus, der
 * serverseitig geprueft (POST /api/login) und im Browser-Storage gemerkt wird —
 * so uebersteht die Anmeldung einen Reload. Abmelden verwirft den Schluessel.
 *
 * Das Rollen-Badge im Client ist reine Anzeige; der Schutz abgenommener Objekte
 * liegt serverseitig (Schluessel wird bei Schreibzugriffen als Header
 * mitgeschickt, siehe authHeaders + Stores).
 */
@Injectable({ providedIn: 'root' })
export class RolleService {
  /** Der gemerkte AG-Schluessel (null = Rolle Extern). */
  private readonly key = signal<string | null>(localStorage.getItem(AG_KEY_STORAGE));

  /** Aktive AG-Rolle (fuers Badge in der Werkzeugleiste). */
  readonly agAktiv = computed(() => this.key() !== null);

  /**
   * Anmeldeversuch: validiert den Schluessel am Login-Pruef-Endpunkt und
   * unterscheidet falschen Schluessel von fehlender Instanz-Konfiguration.
   */
  async anmelden(schluessel: string): Promise<AnmeldeErgebnis> {
    const r = await fetch('api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: schluessel }),
    });
    if (!r.ok) throw new Error(`Login-Pruefung: POST /login → ${r.status}`);
    const { konfiguriert, ok } = (await r.json()) as { konfiguriert: boolean; ok: boolean };
    if (!konfiguriert) return 'nicht-konfiguriert';
    if (!ok) return 'falsch';
    localStorage.setItem(AG_KEY_STORAGE, schluessel);
    this.key.set(schluessel);
    return 'ok';
  }

  /** Abmelden: AG-Rechte an diesem Rechner zuruecklassen ist nicht noetig. */
  abmelden(): void {
    localStorage.removeItem(AG_KEY_STORAGE);
    this.key.set(null);
  }

  /** Auth-Header fuer API-Zugriffe; leer in der Rolle Extern. */
  authHeaders(): Record<string, string> {
    const k = this.key();
    return k ? { 'x-ag-key': k } : {};
  }
}
