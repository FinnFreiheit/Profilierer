import { Injectable, inject, signal } from '@angular/core';
import {
  GuidedMessageState,
  TestmessageEntry,
  TestmessageFortschritt,
  TestmessageInput,
} from '../../models/testmessage.model';
import { LoggerService } from './logger.service';

/** Patch fuer PATCH /api/testmessages/:id — nur gesetzte Felder werden geaendert. */
export interface TestmessagePatch {
  name?: string;
  notiz?: string;
  xml?: string;
  entwurf?: boolean;
  fortschritt?: TestmessageFortschritt;
  entscheidungen?: GuidedMessageState;
}

/**
 * Basis-URL der Testdaten-API (same-origin; im Dev via Proxy auf das Backend).
 * Relativ, loest gegen <base href> auf: Dev/Root -> /api, Unterpfad-Deployment
 * (xjw.freiheits.de/profilierer) -> /profilierer/api (nginx strippt den Praefix).
 */
const API_BASE = 'api';

/**
 * Persistenz-Layer des zentralen Testdaten-Speichers — spricht das Backend
 * (SQLite) per nativem fetch an, konsistent mit dem ProfileStoreService. Ein
 * schlanker Index (`GET /api/testmessages` → TestmessageEntry[]) fuellt das
 * reaktive `entries`-Signal fuer die Kachel-Ansicht; das Roh-XML wird je
 * Nachricht einzeln geladen (`GET /api/testmessages/:id/xml`).
 *
 * Bewusst "dumm": kennt weder StateService noch die aktive Ansicht. Nachricht/
 * Fachmodul werden vom Aufrufer aus dem XML abgeleitet (parseTestmessage) und
 * hier nur durchgereicht.
 */
@Injectable({ providedIn: 'root' })
export class TestmessageStoreService {
  private readonly log = inject(LoggerService);

  /** Testnachrichten-Index, nach letzter Änderung absteigend. */
  readonly entries = signal<TestmessageEntry[]>([]);

  constructor() {
    void this.refresh().catch((e) =>
      this.log.warn('Testdaten-Backend', 'Index beim Start nicht ladbar (Backend offline?)', e),
    );
  }

  // ── HTTP-Helfer ─────────────────────────────────────────────────────

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const r = await fetch(API_BASE + path, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json', ...init?.headers } : init?.headers,
    });
    if (!r.ok) throw new Error(`Testdaten-Backend: ${init?.method ?? 'GET'} ${path} → ${r.status}`);
    if (r.status === 204) return undefined as T;
    return (await r.json()) as T;
  }

  // ── Lesen ───────────────────────────────────────────────────────────

  /** Index vom Server neu laden (Start + Fehler-Resync). */
  async refresh(): Promise<void> {
    const list = await this.req<TestmessageEntry[]>('/testmessages');
    this.entries.set([...list].sort((a, b) => b.aktualisiert - a.aktualisiert));
  }

  /** Roh-XML einer Testnachricht (fuer Download/Vorschau); 404 → null. */
  async loadXml(id: string): Promise<string | null> {
    const r = await fetch(`${API_BASE}/testmessages/${encodeURIComponent(id)}/xml`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Testdaten-Backend: GET /testmessages/${id}/xml → ${r.status}`);
    return await r.text();
  }

  /** Entscheidungsstand einer gefuehrt erstellten Nachricht; 404 → null. */
  async loadEntscheidungen(id: string): Promise<GuidedMessageState | null> {
    const r = await fetch(`${API_BASE}/testmessages/${encodeURIComponent(id)}/entscheidungen`);
    if (r.status === 404) return null;
    if (!r.ok)
      throw new Error(`Testdaten-Backend: GET /testmessages/${id}/entscheidungen → ${r.status}`);
    return (await r.json()) as GuidedMessageState;
  }

  // ── Schreiben ───────────────────────────────────────────────────────

  /** Neue Testnachricht anlegen; gibt die (serverseitig vergebene) id zurueck. */
  async create(input: TestmessageInput): Promise<string> {
    const { id, entry } = await this.req<{ id: string; entry: TestmessageEntry }>('/testmessages', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    this.putEntry(entry);
    return id;
  }

  /**
   * Felder aendern: Metadaten (Name/Notiz) und — bei gefuehrt erstellten
   * Nachrichten — XML, Entwurfs-Kennzeichen, Fortschritt, Entscheidungsstand.
   * Nur die gesetzten Felder werden gesendet; das Backend laesst weggelassene
   * unberuehrt.
   */
  async updateMeta(id: string, patch: TestmessagePatch): Promise<void> {
    const { entry } = await this.req<{ entry: TestmessageEntry }>(
      `/testmessages/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
    this.putEntry(entry);
  }

  /** Testnachricht entfernen. */
  async delete(id: string): Promise<void> {
    await this.req<void>(`/testmessages/${encodeURIComponent(id)}`, { method: 'DELETE' });
    this.entries.update((list) => list.filter((e) => e.id !== id));
  }

  // ── Index-Signal pflegen ────────────────────────────────────────────

  /** Eintrag ersetzen/voranstellen und nach aktualisiert absteigend sortieren. */
  private putEntry(entry: TestmessageEntry): void {
    this.entries.update((list) => {
      const rest = list.filter((e) => e.id !== entry.id);
      rest.unshift(entry);
      return rest.sort((a, b) => b.aktualisiert - a.aktualisiert);
    });
  }
}
