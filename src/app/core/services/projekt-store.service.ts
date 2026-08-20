import { Injectable, inject, signal } from '@angular/core';
import { Projekt, ProjektPatch } from '../../models/projekt.model';
import { LoggerService } from './logger.service';
import { BackendClient } from './backend-client.service';
import { mitEintrag, ohneEintrag } from '../util/eintragsliste.util';

/**
 * Persistenz-Layer der Projekte (#134) — nach dem Muster von
 * ProfileStoreService: ein schlanker Index (`GET /api/projekte`) fuellt das
 * reaktive `entries`-Signal, nach jedem Schreib-Call wird der vom Server
 * gelieferte Eintrag lokal eingepflegt.
 *
 * Die **Zuordnung** eines Eintrags zu einem Projekt liegt bewusst nicht hier,
 * sondern an den jeweiligen Stores (`ProfileStoreService.einsortieren`,
 * `TestmessageStoreService.einsortieren`): sie gehoert zum Eintrag, nicht zum
 * Projekt — und nur so bleibt der Index des Eintrags nach dem Schreiben aktuell.
 */
@Injectable({ providedIn: 'root' })
export class ProjektStoreService {
  private readonly log = inject(LoggerService);
  private readonly http = inject(BackendClient).fuer('Projekt-Backend');

  /** Projekt-Index, nach letzter Aenderung absteigend (Server-Sortierung). */
  readonly entries = signal<Projekt[]>([]);

  constructor() {
    void this.refresh().catch((e) =>
      this.log.warn('Projekt-Backend', 'Index beim Start nicht ladbar (Backend offline?)', e),
    );
  }

  /** Projektliste vom Server neu laden. */
  async refresh(): Promise<void> {
    this.entries.set(await this.http.json<Projekt[]>('/projekte'));
  }

  /** Ein Projekt anlegen; gibt die serverseitig vergebene id zurueck. */
  async create(patch: ProjektPatch): Promise<string> {
    const { id, entry } = await this.http.json<{ id: string; entry: Projekt }>('/projekte', {
      method: 'POST',
      body: JSON.stringify(patch),
    });
    this.entries.update((list) => mitEintrag(list, entry));
    return id;
  }

  /** Felder aendern; nur gesetzte wirken. */
  async update(id: string, patch: ProjektPatch): Promise<void> {
    const { entry } = await this.http.json<{ entry: Projekt }>(
      `/projekte/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
    this.entries.update((list) => mitEintrag(list, entry));
  }

  /**
   * Projekt loeschen. Entfernt nur die Zuordnungen, nie Inhalte — die
   * Profilierungen und Testnachrichten bleiben. Ihre Index-Zeilen tragen danach
   * eine veraltete `projektId`; der Aufrufer laedt sie neu (die beiden anderen
   * Stores kennt dieser hier bewusst nicht).
   */
  async delete(id: string): Promise<void> {
    await this.http.json<void>(`/projekte/${encodeURIComponent(id)}`, { method: 'DELETE' });
    this.entries.update((list) => ohneEintrag(list, id));
  }

  /** Anzeigename zu einer id — fuer Kacheln und Filterleisten. */
  name(id: string | undefined): string | undefined {
    if (!id) return undefined;
    return this.entries().find((p) => p.id === id)?.name;
  }
}
